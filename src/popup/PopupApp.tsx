import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Crown,
  Globe,
  KeyRound,
  Play,
  Shield,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useProStatus } from '../hooks/useProStatus';
import { deleteDomainRule, getDomainRules } from '../shared/storage';
import type { DomainRule, RuntimeMessage } from '../shared/types';

export const PopupApp: React.FC = () => {
  const { isPro, isDevBuild, devOverride, openUpgrade, openLogin, setDevOverride } = useProStatus();
  const [rules, setRules] = useState<DomainRule[]>([]);
  const [permMap, setPermMap] = useState<Record<string, boolean>>({});
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    const map = await getDomainRules();
    const list = Object.values(map).sort((a, b) => b.updatedAt - a.updatedAt);
    setRules(list);

    const perms: Record<string, boolean> = {};
    for (const r of list) {
      try {
        perms[r.hostname] = await chrome.permissions.contains({
          origins: [`https://${r.hostname}/*`, `http://${r.hostname}/*`],
        });
      } catch {
        perms[r.hostname] = false;
      }
    }
    setPermMap(perms);
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const handleLaunch = async () => {
    const res = await chrome.runtime.sendMessage({
      type: 'INJECT_AND_TOGGLE_ACTIVE_TAB',
    } satisfies RuntimeMessage);
    if (res?.ok) {
      window.close();
    } else {
      setStatusMsg(res?.error || 'Cannot open CloakShot on this page.');
    }
  };

  const handleGrantDomainPermission = async (hostname: string) => {
    try {
      const granted = await chrome.permissions.request({
        origins: [`https://${hostname}/*`, `http://${hostname}/*`],
      });
      if (granted) {
        setStatusMsg(`Auto-masking enabled for ${hostname}`);
        await loadRules();
      }
    } catch {
      setStatusMsg('Could not request site permission.');
    }
  };

  const handleDeleteRule = async (hostname: string) => {
    await deleteDomainRule(hostname);
    await loadRules();
  };

  const handleUpgrade = async () => {
    const res = await openUpgrade();
    if (!res.ok && res.error) setStatusMsg(res.error);
  };

  const handleLogin = async () => {
    const res = await openLogin();
    if (!res.ok && res.error) setStatusMsg(res.error);
  };

  return (
    <div className="p-4 bg-slate-950 text-slate-100 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Shield className="w-4 h-4 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-bold tracking-tight text-white">CloakShot</h1>
              {isPro && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  PRO
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">100% Local Privacy & Demo Studio</p>
          </div>
        </div>
      </div>

      {/* Primary Launch Button */}
      <button
        type="button"
        onClick={() => void handleLaunch()}
        className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition-colors shadow-lg shadow-sky-500/20 cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Open Floating Studio</span>
        </span>
        <kbd className="px-1.5 py-0.5 rounded bg-slate-950/20 text-[10px] font-mono">
          Alt+Shift+C
        </kbd>
      </button>

      {statusMsg && (
        <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-sky-300">
          {statusMsg}
        </div>
      )}

      {/* Saved Domain Rules */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Saved Domain Rules
          </span>
          <span className="text-[10px] font-mono text-slate-500">{rules.length}</span>
        </div>

        {rules.length === 0 ? (
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-[11px] text-slate-400 leading-relaxed">
            No saved domains yet. Open the floating studio on any site and click{' '}
            <strong className="text-slate-200">Shield → Save rules</strong> to auto-mask on visit.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
            {rules.map((rule) => {
              const hasPerm = permMap[rule.hostname];
              return (
                <div
                  key={rule.hostname}
                  className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-slate-900/80 border border-slate-800"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-100 truncate">
                      <Globe className="w-3 h-3 text-sky-400 shrink-0" />
                      <span className="truncate">{rule.hostname}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      {rule.categories.join(', ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!hasPerm && (
                      <button
                        type="button"
                        onClick={() => void handleGrantDomainPermission(rule.hostname)}
                        className="px-2 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-[10px] font-semibold cursor-pointer"
                      >
                        Allow
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDeleteRule(rule.hostname)}
                      title="Delete rule"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pro Lifetime Pass Card */}
      <div className="p-3 rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950/60 border border-slate-800 space-y-2.5">
        {isPro ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-xs font-semibold text-white">Pro Lifetime Active</div>
                <div className="text-[10px] text-slate-400">
                  {devOverride ? 'Enabled via Dev Override' : 'All Pro studio features unlocked'}
                </div>
              </div>
            </div>
            {!devOverride && (
              <button
                type="button"
                onClick={() => void handleLogin()}
                className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                License
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <Crown className="w-3.5 h-3.5 text-amber-400" />
                  <span>CloakShot Pro Pass</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Smart Mock Swap, Auto-Scan Shield, Live Screen-Share, Dual Scroll Capture & Clean Frame.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold shrink-0">
                $14
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleUpgrade()}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Unlock Lifetime ($14)
              </button>
              <button
                type="button"
                onClick={() => void handleLogin()}
                title="Restore existing license"
                className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}

        {isDevBuild && (
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Dev Mode: Simulate Pro</span>
            <button
              type="button"
              onClick={() => void setDevOverride(!devOverride)}
              className={`px-2 py-0.5 rounded-md font-bold cursor-pointer ${
                devOverride
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {devOverride ? 'ON' : 'OFF'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
