import React from 'react';
import { BookmarkCheck, KeyRound, CreditCard, DollarSign, Mail, Radio, Sparkles, User } from 'lucide-react';
import type { ScanCategory, ScanCounts } from '../../shared/types';

interface AutoScanPopoverProps {
  counts: ScanCounts;
  activeCategories: Set<ScanCategory>;
  liveShieldActive: boolean;
  hostname: string;
  hasSavedRule: boolean;
  isPro: boolean;
  onToggleCategory: (cat: ScanCategory) => void;
  onToggleLiveShield: () => void;
  onSaveDomainRule: () => void;
  onRescan: () => void;
  onRequestPro: (feature: string) => void;
}

const CATEGORY_META: Array<{
  key: ScanCategory;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'emails', label: 'Emails', Icon: Mail },
  { key: 'amounts', label: 'Amounts', Icon: DollarSign },
  { key: 'ibansCards', label: 'IBAN / Cards', Icon: CreditCard },
  { key: 'apiKeys', label: 'API Keys', Icon: KeyRound },
  { key: 'names', label: 'Names', Icon: User },
];

export const AutoScanPopover: React.FC<AutoScanPopoverProps> = ({
  counts,
  activeCategories,
  liveShieldActive,
  hostname,
  hasSavedRule,
  isPro,
  onToggleCategory,
  onToggleLiveShield,
  onSaveDomainRule,
  onRescan,
  onRequestPro,
}) => {
  return (
    <div className="w-72 p-3 rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-slate-700/80 shadow-2xl text-slate-100">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold tracking-wide text-slate-100">
            Auto-Scan Shield
          </span>
          {!isPro && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30">
              PRO
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRescan}
          className="text-[11px] text-sky-400 hover:text-sky-300 font-medium cursor-pointer"
        >
          Rescan
        </button>
      </div>

      <div className="space-y-1.5 mb-3">
        {CATEGORY_META.map(({ key, label, Icon }) => {
          const active = activeCategories.has(key);
          const count = counts[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() =>
                isPro ? onToggleCategory(key) : onRequestPro('1-Click Auto-Scan Shield')
              }
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl border text-xs transition-colors cursor-pointer ${
                active
                  ? 'bg-sky-500/20 border-sky-400/50 text-sky-100'
                  : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 text-slate-300'
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-sky-400" />
                <span>{label}</span>
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                    count > 0
                      ? 'bg-slate-800 text-slate-200'
                      : 'bg-slate-900 text-slate-500'
                  }`}
                >
                  {count}
                </span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    active ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-slate-700'
                  }`}
                />
              </span>
            </button>
          );
        })}
      </div>

      <div className="pt-2.5 border-t border-slate-800 space-y-2">
        <button
          type="button"
          onClick={() =>
            isPro ? onToggleLiveShield() : onRequestPro('Live Screen-Share Shield')
          }
          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
            liveShieldActive
              ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
              : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 text-slate-300'
          }`}
        >
          <span className="flex items-center gap-2">
            <Radio className={`w-3.5 h-3.5 ${liveShieldActive ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
            <span>Live Screen-Share Shield</span>
          </span>
          <span className="text-[10px] font-semibold uppercase">
            {liveShieldActive ? 'ON' : 'OFF'}
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            isPro ? onSaveDomainRule() : onRequestPro('Saved Domain Rules')
          }
          className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 text-xs font-medium text-slate-100 transition-colors cursor-pointer"
        >
          {hasSavedRule ? (
            <BookmarkCheck className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
          )}
          <span className="truncate">
            {hasSavedRule ? `Update rule for ${hostname}` : `Save rules for ${hostname}`}
          </span>
        </button>
      </div>
    </div>
  );
};
