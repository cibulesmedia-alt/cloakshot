import { useCallback, useEffect, useState } from 'react';
import type { ProStatus, RuntimeMessage } from '../shared/types';

const DEFAULT_STATUS: ProStatus = {
  isPro: false,
  paidAt: null,
  devOverride: false,
  isDevBuild: import.meta.env.DEV,
};

export function useProStatus() {
  const [status, setStatus] = useState<ProStatus>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'GET_PRO_STATUS',
      } satisfies RuntimeMessage);
      if (res?.ok && res.status) {
        setStatus(res.status as ProStatus);
      }
    } catch {
      // Ignore if running outside extension runtime
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openUpgrade = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'OPEN_PAYMENT_PAGE',
      } satisfies RuntimeMessage);
      return { ok: Boolean(res?.ok), error: res?.error };
    } catch {
      return { ok: false, error: 'Unable to open upgrade page.' };
    }
  }, []);

  const openLogin = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'OPEN_LOGIN_PAGE',
      } satisfies RuntimeMessage);
      return { ok: Boolean(res?.ok), error: res?.error };
    } catch {
      return { ok: false, error: 'Unable to open license manager.' };
    }
  }, []);

  const setDevOverride = useCallback(async (enabled: boolean) => {
    if (!import.meta.env.DEV) return;
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'SET_DEV_PRO_OVERRIDE',
        enabled,
      } satisfies RuntimeMessage);
      if (res?.ok && res.status) {
        setStatus(res.status as ProStatus);
      }
    } catch {
      // Ignore
    }
  }, []);

  return {
    ...status,
    loading,
    refresh,
    openUpgrade,
    openLogin,
    setDevOverride,
  };
}
