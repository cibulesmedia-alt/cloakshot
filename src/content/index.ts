import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CLOAKSHOT_BOX_HOST_ID, CLOAKSHOT_HOST_ID } from '../shared/constants';
import type { DomainRule, RuntimeMessage } from '../shared/types';
import { CloakShotApp } from './components/CloakShotApp';
import shadowCss from './shadow.css?inline';

declare global {
  interface Window {
    __CLOAKSHOT_BOOTED__?: boolean;
  }
}

if (!window.__CLOAKSHOT_BOOTED__) {
  window.__CLOAKSHOT_BOOTED__ = true;

  let uiRoot: Root | null = null;
  let boxContainer: HTMLElement | null = null;
  let isToolbarVisible = false;
  let pendingDomainRule: DomainRule | null = null;

  function ensureShadowHosts(): { mountPoint: HTMLElement; boxMount: HTMLElement } {
    // 1. Fixed UI Shadow Host (Toolbar, Popovers, Hover Overlay, HUD, Toasts)
    let uiHost = document.getElementById(CLOAKSHOT_HOST_ID);
    if (!uiHost) {
      uiHost = document.createElement('div');
      uiHost.id = CLOAKSHOT_HOST_ID;
      uiHost.style.cssText =
        'position:fixed;inset:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
      document.documentElement.appendChild(uiHost);
    }

    let uiShadow = uiHost.shadowRoot;
    if (!uiShadow) {
      uiShadow = uiHost.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = shadowCss;
      uiShadow.appendChild(style);
      const appDiv = document.createElement('div');
      appDiv.id = 'cloakshot-app-mount';
      uiShadow.appendChild(appDiv);
    }

    // 2. Document-Coordinate Shadow Host for Scroll-Locked Box Masks (120fps native scroll)
    let boxHost = document.getElementById(CLOAKSHOT_BOX_HOST_ID);
    if (!boxHost) {
      boxHost = document.createElement('div');
      boxHost.id = CLOAKSHOT_BOX_HOST_ID;
      boxHost.style.cssText =
        'position:absolute;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483640;pointer-events:none;';
      document.documentElement.appendChild(boxHost);
    }

    let boxShadow = boxHost.shadowRoot;
    if (!boxShadow) {
      boxShadow = boxHost.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = shadowCss;
      boxShadow.appendChild(style);
      const boxDiv = document.createElement('div');
      boxDiv.id = 'cloakshot-box-mount';
      boxShadow.appendChild(boxDiv);
    }

    const mountPoint = uiShadow.getElementById('cloakshot-app-mount') as HTMLElement;
    const boxMount = boxShadow.getElementById('cloakshot-box-mount') as HTMLElement;
    return { mountPoint, boxMount };
  }

  function renderApp() {
    const { mountPoint, boxMount } = ensureShadowHosts();
    boxContainer = boxMount;

    if (!uiRoot) {
      uiRoot = createRoot(mountPoint);
    }

    uiRoot.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(CloakShotApp, {
          visible: isToolbarVisible,
          boxPortalRoot: boxContainer,
          initialDomainRule: pendingDomainRule,
          onRequestClose: () => {
            isToolbarVisible = false;
            renderApp();
          },
        }),
      ),
    );
  }

  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'TOGGLE_TOOLBAR') {
      isToolbarVisible = !isToolbarVisible;
      renderApp();
      sendResponse({ ok: true, visible: isToolbarVisible });
      return;
    }

    if (message.type === 'APPLY_DOMAIN_RULE') {
      pendingDomainRule = message.rule;
      renderApp();
      sendResponse({ ok: true });
    }
  });
}
