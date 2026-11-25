import React, { useRef, useState } from 'react';
import {
  Camera,
  Check,
  Droplets,
  GripVertical,
  MousePointer2,
  RotateCcw,
  Shield,
  Sparkles,
  Square,
  SquareDashed,
  Undo2,
  X,
} from 'lucide-react';
import type { MaskMode } from '../../shared/types';

interface FloatingToolbarProps {
  mode: MaskMode | null;
  isPro: boolean;
  isDevBuild: boolean;
  devOverride: boolean;
  activeMaskCount: number;
  undoCount: number;
  liveShieldActive: boolean;
  autoScanActiveCount: number;
  activePopover: 'scan' | 'capture' | null;
  fullPageProgress: number | null;
  onSelectMode: (mode: MaskMode | null) => void;
  onTogglePopover: (pop: 'scan' | 'capture') => void;
  onUndo: () => void;
  onRestoreAll: () => void;
  onClose: () => void;
  onToggleDevPro: () => void;
  popoverContent: React.ReactNode;
}

const MODES: Array<{
  id: MaskMode;
  key: string;
  label: string;
  pro?: boolean;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'mock', key: '1', label: 'Mock', pro: true, Icon: Sparkles },
  { id: 'redact', key: '2', label: 'Redact', Icon: Square },
  { id: 'blur', key: '3', label: 'Blur', Icon: Droplets },
  { id: 'box', key: '4', label: 'Box', Icon: SquareDashed },
];

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  mode,
  isPro,
  isDevBuild,
  devOverride,
  activeMaskCount,
  undoCount,
  liveShieldActive,
  autoScanActiveCount,
  activePopover,
  fullPageProgress,
  onSelectMode,
  onTogglePopover,
  onUndo,
  onRestoreAll,
  onClose,
  onToggleDevPro,
  popoverContent,
}) => {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  const handleDragStart = (e: React.PointerEvent) => {
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    draggingRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleDragMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - draggingRef.current.startX;
    const dy = e.clientY - draggingRef.current.startY;
    const nextX = Math.max(8, Math.min(window.innerWidth - 100, draggingRef.current.origX + dx));
    const nextY = Math.max(8, Math.min(window.innerHeight - 56, draggingRef.current.origY + dy));
    setPos({ x: nextX, y: nextY });
  };

  const handleDragEnd = () => {
    draggingRef.current = null;
  };

  const style: React.CSSProperties = pos
    ? { left: `${pos.x}px`, top: `${pos.y}px` }
    : { left: '50%', top: '16px', transform: 'translateX(-50%)' };

  return (
    <div
      ref={barRef}
      style={style}
      className="fixed z-[2147483647] pointer-events-auto select-none flex flex-col items-center gap-2"
    >
      <div className="flex items-center gap-1 px-2 py-1.5 rounded-2xl bg-slate-950/92 backdrop-blur-xl border border-slate-700/80 shadow-[0_16px_48px_rgba(2,6,23,0.65)] text-slate-100">
        {/* Drag Handle */}
        <div
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          title="Drag CloakShot toolbar"
          className="flex items-center gap-1 pr-1.5 mr-0.5 border-r border-slate-800 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-200"
        >
          <GripVertical className="w-3.5 h-3.5" />
          <span className="w-2 h-2 rounded-full bg-gradient-to-tr from-sky-400 to-indigo-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
        </div>

        {/* Pause / Browse Toggle */}
        <button
          type="button"
          onClick={() => onSelectMode(null)}
          title="Browse page normally (Esc)"
          className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
            mode === null
              ? 'bg-slate-800 text-sky-300 ring-1 ring-sky-400/40'
              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
          }`}
        >
          <MousePointer2 className="w-3.5 h-3.5" />
        </button>

        {/* 4 Masking Modes */}
        <div className="flex items-center gap-0.5 bg-slate-900/90 p-0.5 rounded-xl border border-slate-800/90">
          {MODES.map(({ id, key, label, pro, Icon }) => {
            const active = mode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectMode(id)}
                title={`${label} mode (${key})${pro && !isPro ? ' — Pro' : ''}`}
                className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  active
                    ? 'bg-sky-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
                <kbd
                  className={`text-[9px] font-mono px-1 rounded ${
                    active
                      ? 'bg-slate-950/20 text-slate-950'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {key}
                </kbd>
                {pro && !isPro && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Pro feature" />
                )}
              </button>
            );
          })}
        </div>

        <div className="w-px h-5 bg-slate-800 mx-0.5" />

        {/* Auto-Scan Shield Popover Trigger */}
        <button
          type="button"
          onClick={() => onTogglePopover('scan')}
          title="Auto-Scan Shield & Live Screen-Share"
          className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
            activePopover === 'scan' || autoScanActiveCount > 0 || liveShieldActive
              ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Shield</span>
          {liveShieldActive && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
          {autoScanActiveCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-500/30 text-emerald-100">
              {autoScanActiveCount}
            </span>
          )}
        </button>

        {/* Capture Popover Trigger */}
        <button
          type="button"
          onClick={() => onTogglePopover('capture')}
          title="Capture Screenshot (Visible, Area, Auto Full-Page, Live Scroll-Stitch)"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
            activePopover === 'capture'
              ? 'bg-sky-500 text-slate-950'
              : 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-400/40'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>{fullPageProgress !== null ? `${fullPageProgress}%` : 'Capture'}</span>
        </button>

        <div className="w-px h-5 bg-slate-800 mx-0.5" />

        {/* Active Mask Count + Undo + Restore */}
        {activeMaskCount > 0 && (
          <span
            title="Active masked items on this page"
            className="px-1.5 py-0.5 rounded-lg bg-slate-800 text-sky-300 text-[11px] font-mono font-semibold"
          >
            {activeMaskCount}
          </span>
        )}

        <button
          type="button"
          onClick={onUndo}
          disabled={undoCount === 0}
          title="Undo last mask (Ctrl/Cmd + Z)"
          className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onRestoreAll}
          disabled={activeMaskCount === 0}
          title="Restore original page (<1ms)"
          className="p-1.5 rounded-xl text-slate-300 hover:text-emerald-300 hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {isDevBuild && (
          <button
            type="button"
            onClick={onToggleDevPro}
            title="Dev-only Pro mode toggle"
            className={`px-1.5 py-1 rounded-lg text-[10px] font-bold border cursor-pointer ${
              devOverride
                ? 'bg-amber-500/25 border-amber-400/50 text-amber-200'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
          >
            {devOverride ? 'DEV PRO' : 'DEV FREE'}
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          title="Close CloakShot (Esc twice to close & restore)"
          className="p-1.5 rounded-xl text-slate-400 hover:text-rose-300 hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Popover Anchor */}
      {popoverContent && <div className="pointer-events-auto">{popoverContent}</div>}
    </div>
  );
};

interface ScrollCaptureHudProps {
  heightPx: number;
  capped: boolean;
  onDone: () => void;
  onCancel: () => void;
}

/** Compact floating HUD pill for Mode B — Interactive Live Scroll-Stitch */
export const ScrollCaptureHud: React.FC<ScrollCaptureHudProps> = ({
  heightPx,
  capped,
  onDone,
  onCancel,
}) => {
  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[2147483647] pointer-events-auto select-none">
      <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-slate-950/95 backdrop-blur-xl border border-sky-400/50 shadow-2xl text-xs text-slate-100">
        <span className="flex items-center gap-2 font-medium">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
          <span>{capped ? 'Max height reached' : 'Capturing scroll...'}</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 font-mono text-sky-300">
            {heightPx.toLocaleString()} px
          </span>
        </span>

        <button
          type="button"
          onClick={onDone}
          className="flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold transition-colors cursor-pointer"
        >
          <Check className="w-3.5 h-3.5" />
          Done
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
      </div>
    </div>
  );
};
