import React from 'react';
import { CheckCircle2, Info, Sparkles } from 'lucide-react';

export interface ToastMessage {
  id: number;
  text: string;
  tone?: 'success' | 'info' | 'pro';
}

interface ToastProps {
  toast: ToastMessage | null;
}

export const Toast: React.FC<ToastProps> = ({ toast }) => {
  if (!toast) return null;

  const Icon =
    toast.tone === 'pro' ? Sparkles : toast.tone === 'info' ? Info : CheckCircle2;
  const accent =
    toast.tone === 'pro'
      ? 'border-amber-400/40 text-amber-200'
      : toast.tone === 'info'
        ? 'border-sky-400/40 text-sky-200'
        : 'border-emerald-400/40 text-emerald-200';

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[2147483647] pointer-events-none">
      <div
        className={`flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-950/92 backdrop-blur-xl border ${accent} shadow-2xl text-xs font-medium whitespace-nowrap`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-slate-100">{toast.text}</span>
      </div>
    </div>
  );
};
