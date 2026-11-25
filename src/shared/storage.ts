import { DEFAULT_PREFERENCES, STORAGE_KEYS } from './constants';
import type { DomainRule, UserPreferences } from './types';

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

export async function getDomainRules(): Promise<Record<string, DomainRule>> {
  if (!hasChromeStorage()) return {};
  const result = await chrome.storage.local.get(STORAGE_KEYS.DOMAIN_RULES);
  return (result[STORAGE_KEYS.DOMAIN_RULES] as Record<string, DomainRule>) ?? {};
}

export async function getDomainRule(hostname: string): Promise<DomainRule | null> {
  const rules = await getDomainRules();
  return rules[hostname] ?? null;
}

export async function saveDomainRule(rule: DomainRule): Promise<void> {
  if (!hasChromeStorage()) return;
  const rules = await getDomainRules();
  rules[rule.hostname] = { ...rule, updatedAt: Date.now() };
  await chrome.storage.local.set({ [STORAGE_KEYS.DOMAIN_RULES]: rules });
}

export async function deleteDomainRule(hostname: string): Promise<void> {
  if (!hasChromeStorage()) return;
  const rules = await getDomainRules();
  delete rules[hostname];
  await chrome.storage.local.set({ [STORAGE_KEYS.DOMAIN_RULES]: rules });
}

export async function getPreferences(): Promise<UserPreferences> {
  if (!hasChromeStorage()) return { ...DEFAULT_PREFERENCES };
  const result = await chrome.storage.local.get(STORAGE_KEYS.PREFERENCES);
  return {
    ...DEFAULT_PREFERENCES,
    ...((result[STORAGE_KEYS.PREFERENCES] as Partial<UserPreferences>) ?? {}),
  };
}

export async function savePreferences(partial: Partial<UserPreferences>): Promise<UserPreferences> {
  const current = await getPreferences();
  const next = { ...current, ...partial };
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [STORAGE_KEYS.PREFERENCES]: next });
  }
  return next;
}
