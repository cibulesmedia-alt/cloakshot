import ExtPay from 'extpay';
import { EXTPAY_EXTENSION_ID, STORAGE_KEYS } from '../shared/constants';
import { getDomainRule } from '../shared/storage';
import type { ProStatus, RuntimeMessage } from '../shared/types';

const IS_DEV_BUILD = import.meta.env.DEV;

// Initialize ExtensionPay in the MV3 Service Worker
let extpay: ReturnType<typeof ExtPay> | null = null;
try {
  extpay = ExtPay(EXTPAY_EXTENSION_ID);
  extpay.startBackground();
} catch (err) {
  console.warn('[CloakShot] ExtensionPay init skipped (check EXTPAY_EXTENSION_ID):', err);
}

async function getDevProOverride(): Promise<boolean> {
  if (!IS_DEV_BUILD) return false;
  const res = await chrome.storage.local.get(STORAGE_KEYS.DEV_PRO_OVERRIDE);
  return Boolean(res[STORAGE_KEYS.DEV_PRO_OVERRIDE]);
}

async function resolveProStatus(): Promise<ProStatus> {
  const devOverride = await getDevProOverride();
  if (devOverride) {
    return {
      isPro: true,
      paidAt: new Date().toISOString(),
      devOverride: true,
      isDevBuild: IS_DEV_BUILD,
    };
  }

  if (extpay && EXTPAY_EXTENSION_ID !== 'cloakshot-placeholder') {
    try {
      const user = await extpay.getUser();
      return {
        isPro: Boolean(user.paid),
        paidAt: user.paidAt ? user.paidAt.toISOString() : null,
        devOverride: false,
        isDevBuild: IS_DEV_BUILD,
      };
    } catch {
      // Fallback to free if offline or unconfigured
    }
  }

  return {
    isPro: false,
    paidAt: null,
    devOverride: false,
    isDevBuild: IS_DEV_BUILD,
  };
}

function isInjectableUrl(url?: string): boolean {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://');
}

async function ensureContentScript(tabId: number): Promise<boolean> {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: 'PING' } satisfies RuntimeMessage);
    if (ping?.ok) return true;
  } catch {
    // Content script not yet injected
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
    return true;
  } catch (err) {
    console.warn('[CloakShot] Could not inject content script:', err);
    return false;
  }
}

async function toggleOnTab(tabId: number): Promise<boolean> {
  const ready = await ensureContentScript(tabId);
  if (!ready) return false;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_TOOLBAR' } satisfies RuntimeMessage);
    return true;
  } catch {
    return false;
  }
}

// 1. Global Keyboard Shortcut: Alt+Shift+C (Windows/Linux) / Option+Shift+C (macOS)
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-cloakshot') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isInjectableUrl(tab.url)) return;
  await toggleOnTab(tab.id);
});

// 2. Saved Domain Rules Auto-Injection (uses granted optional_host_permissions only)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !isInjectableUrl(tab.url)) return;
  try {
    const url = new URL(tab.url!);
    const rule = await getDomainRule(url.hostname);
    if (!rule || rule.categories.length === 0) return;

    const hasPerm = await chrome.permissions.contains({
      origins: [`${url.protocol}//${url.hostname}/*`],
    });
    if (!hasPerm) return;

    const ready = await ensureContentScript(tabId);
    if (ready) {
      await chrome.tabs.sendMessage(tabId, {
        type: 'APPLY_DOMAIN_RULE',
        rule,
      } satisfies RuntimeMessage);
    }
  } catch {
    // Ignore restricted/invalid URLs
  }
});

// 3. Runtime Message Router
chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'CAPTURE_VISIBLE_TAB': {
        const windowId = sender.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
        try {
          const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
          sendResponse({ ok: true, dataUrl });
        } catch (err) {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : 'captureVisibleTab failed',
          });
        }
        break;
      }

      case 'GET_PRO_STATUS': {
        const status = await resolveProStatus();
        sendResponse({ ok: true, status });
        break;
      }

      case 'SET_DEV_PRO_OVERRIDE': {
        if (!IS_DEV_BUILD) {
          sendResponse({ ok: false, error: 'Not a development build' });
          break;
        }
        await chrome.storage.local.set({ [STORAGE_KEYS.DEV_PRO_OVERRIDE]: message.enabled });
        const status = await resolveProStatus();
        sendResponse({ ok: true, status });
        break;
      }

      case 'OPEN_PAYMENT_PAGE': {
        if (extpay && EXTPAY_EXTENSION_ID !== 'cloakshot-placeholder') {
          extpay.openPaymentPage();
          sendResponse({ ok: true });
        } else {
          sendResponse({
            ok: false,
            error: 'Configure EXTPAY_EXTENSION_ID in src/shared/constants.ts to enable checkout.',
          });
        }
        break;
      }

      case 'OPEN_LOGIN_PAGE': {
        if (extpay && EXTPAY_EXTENSION_ID !== 'cloakshot-placeholder') {
          extpay.openLoginPage();
          sendResponse({ ok: true });
        } else {
          sendResponse({
            ok: false,
            error: 'Configure EXTPAY_EXTENSION_ID in src/shared/constants.ts to manage licenses.',
          });
        }
        break;
      }

      case 'REQUEST_DOMAIN_PERMISSION': {
        const origins = [`https://${message.hostname}/*`, `http://${message.hostname}/*`];
        try {
          const already = await chrome.permissions.contains({ origins });
          if (already) {
            sendResponse({ ok: true, granted: true });
            break;
          }
          const granted = await chrome.permissions.request({ origins });
          sendResponse({ ok: true, granted });
        } catch (err) {
          sendResponse({
            ok: false,
            granted: false,
            error: err instanceof Error ? err.message : 'Permission prompt requires extension popup gesture',
          });
        }
        break;
      }

      case 'INJECT_AND_TOGGLE_ACTIVE_TAB': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !isInjectableUrl(tab.url)) {
          sendResponse({ ok: false, error: 'Cannot run CloakShot on this browser page.' });
          break;
        }
        const ok = await toggleOnTab(tab.id);
        sendResponse({ ok });
        break;
      }

      default:
        sendResponse({ ok: false, error: 'Unknown message' });
    }
  })();

  return true; // Keep message channel open for async response
});
