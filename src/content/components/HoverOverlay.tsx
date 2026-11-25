import React from 'react';

interface HoverOverlayProps {
  primaryRect: DOMRect | null;
  batchRects: DOMRect[];
  dragRect: { x: number; y: number; width: number; height: number } | null;
  label?: string;
  tone?: 'mask' | 'capture' | 'box';
}

export const HoverOverlay: React.FC<HoverOverlayProps> = ({
  primaryRect,
  batchRects,
  dragRect,
  label,
  tone = 'mask',
}) => {
  const borderClass =
    tone === 'capture'
      ? 'border-emerald-400 bg-emerald-400/10'
      : tone === 'box'
        ? 'border-violet-400 bg-violet-400/15'
        : 'border-sky-400 bg-sky-400/10';

  return (
    <div className="fixed inset-0 pointer-events-none z-[2147483645]">
      {batchRects.map((r, idx) => (
        <div
          key={idx}
          style={{
            left: `${r.left}px`,
            top: `${r.top}px`,
            width: `${r.width}px`,
            height: `${r.height}px`,
          }}
          className="fixed border border-dashed border-amber-400/90 bg-amber-400/12 rounded-[3px] transition-all duration-75"
        />
      ))}

      {primaryRect && primaryRect.width > 0 && primaryRect.height > 0 && (
        <div
          style={{
            left: `${primaryRect.left}px`,
            top: `${primaryRect.top}px`,
            width: `${primaryRect.width}px`,
            height: `${primaryRect.height}px`,
          }}
          className={`fixed border-2 ${borderClass} rounded-[4px] transition-all duration-75`}
        >
          {label && (
            <div className="absolute -top-6 left-0 px-1.5 py-0.5 rounded bg-slate-950/90 text-[10px] font-semibold text-slate-100 border border-slate-700/80 whitespace-nowrap shadow">
              {label}
            </div>
          )}
        </div>
      )}

      {dragRect && dragRect.width > 2 && dragRect.height > 2 && (
        <div
          style={{
            left: `${dragRect.x}px`,
            top: `${dragRect.y}px`,
            width: `${dragRect.width}px`,
            height: `${dragRect.height}px`,
          }}
          className={`fixed border-2 ${borderClass} rounded-[4px]`}
        >
          <div className="absolute -bottom-6 right-0 px-1.5 py-0.5 rounded bg-slate-950/90 text-[10px] font-mono text-slate-200 border border-slate-700/80">
            {Math.round(dragRect.width)} × {Math.round(dragRect.height)}
          </div>
        </div>
      )}
    </div>
  );
};
