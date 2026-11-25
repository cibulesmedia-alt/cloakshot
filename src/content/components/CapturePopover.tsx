import React from 'react';
import {
  Camera,
  ClipboardCopy,
  Crop,
  Download,
  Frame,
  RotateCcw,
  ScrollText,
  Sparkles,
} from 'lucide-react';
import type { CaptureMode } from '../../shared/types';

interface CapturePopoverProps {
  isPro: boolean;
  cleanFrame: boolean;
  autoRestore: boolean;
  outputAction: 'copy' | 'download';
  onChangeOutputAction: (action: 'copy' | 'download') => void;
  onToggleCleanFrame: () => void;
  onToggleAutoRestore: () => void;
  onCapture: (mode: CaptureMode) => void;
  onRequestPro: (feature: string) => void;
}

export const CapturePopover: React.FC<CapturePopoverProps> = ({
  isPro,
  cleanFrame,
  autoRestore,
  outputAction,
  onChangeOutputAction,
  onToggleCleanFrame,
  onToggleAutoRestore,
  onCapture,
  onRequestPro,
}) => {
  return (
    <div className="w-72 p-3 rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-slate-700/80 shadow-2xl text-slate-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold tracking-wide text-slate-100">
          Capture Studio
        </span>
        <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => onChangeOutputAction('copy')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-medium cursor-pointer ${
              outputAction === 'copy'
                ? 'bg-sky-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ClipboardCopy className="w-3 h-3" />
            Copy
          </button>
          <button
            type="button"
            onClick={() => onChangeOutputAction('download')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-medium cursor-pointer ${
              outputAction === 'download'
                ? 'bg-sky-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-3 h-3" />
            PNG
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 mb-2.5">
        <button
          type="button"
          onClick={() => onCapture('visible')}
          className="flex flex-col items-start gap-1 p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/40 text-left transition-colors cursor-pointer"
        >
          <Camera className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-medium text-slate-100">Visible</span>
          <span className="text-[10px] text-slate-400">Current viewport</span>
        </button>

        <button
          type="button"
          onClick={() => onCapture('area')}
          className="flex flex-col items-start gap-1 p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/40 text-left transition-colors cursor-pointer"
        >
          <Crop className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-medium text-slate-100">Area / Card</span>
          <span className="text-[10px] text-slate-400">Click or drag box</span>
        </button>

        <button
          type="button"
          onClick={() =>
            isPro ? onCapture('fullpage') : onRequestPro('1-Click Auto Full-Page Capture')
          }
          className="flex flex-col items-start gap-1 p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-amber-400/40 text-left transition-colors cursor-pointer"
        >
          <div className="w-full flex items-center justify-between">
            <ScrollText className="w-4 h-4 text-amber-400" />
            {!isPro && (
              <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300">
                PRO
              </span>
            )}
          </div>
          <span className="text-xs font-medium text-slate-100">Auto Full-Page</span>
          <span className="text-[10px] text-slate-400">1-click scroll stitch</span>
        </button>

        <button
          type="button"
          onClick={() =>
            isPro ? onCapture('scroll-live') : onRequestPro('Interactive Live Scroll-Stitch')
          }
          className="flex flex-col items-start gap-1 p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-amber-400/40 text-left transition-colors cursor-pointer"
        >
          <div className="w-full flex items-center justify-between">
            <Sparkles className="w-4 h-4 text-violet-400" />
            {!isPro && (
              <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300">
                PRO
              </span>
            )}
          </div>
          <span className="text-xs font-medium text-slate-100">Scroll & Capture</span>
          <span className="text-[10px] text-slate-400">Manual live stitch</span>
        </button>
      </div>

      <div className="pt-2 border-t border-slate-800 space-y-1.5">
        <button
          type="button"
          onClick={() =>
            isPro ? onToggleCleanFrame() : onRequestPro('Clean Frame Studio Backdrop')
          }
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 text-xs cursor-pointer"
        >
          <span className="flex items-center gap-2 text-slate-200">
            <Frame className="w-3.5 h-3.5 text-violet-400" />
            <span>Clean Frame Backdrop</span>
            {!isPro && (
              <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300">
                PRO
              </span>
            )}
          </span>
          <span className={`text-[10px] font-bold ${cleanFrame ? 'text-emerald-400' : 'text-slate-500'}`}>
            {cleanFrame ? 'ON' : 'OFF'}
          </span>
        </button>

        <button
          type="button"
          onClick={onToggleAutoRestore}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 text-xs cursor-pointer"
        >
          <span className="flex items-center gap-2 text-slate-200">
            <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
            <span>Auto-Restore after Capture</span>
          </span>
          <span className={`text-[10px] font-bold ${autoRestore ? 'text-emerald-400' : 'text-slate-500'}`}>
            {autoRestore ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>
    </div>
  );
};
