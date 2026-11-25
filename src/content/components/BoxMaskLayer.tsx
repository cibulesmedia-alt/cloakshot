import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { BoxMask } from '../../shared/types';

interface BoxMaskLayerProps {
  portalRoot: HTMLElement;
  masks: BoxMask[];
  isCapturing: boolean;
  onRemove: (id: string) => void;
}

/**
 * Renders scroll-locked freehand Box Masks inside a document-coordinate Shadow Host.
 * Production Safeguard: During capture (`isCapturing === true`), ONLY the delete/hover
 * handles are hidden — the actual blur/redact box fills remain 100% visible in the screenshot!
 */
export const BoxMaskLayer: React.FC<BoxMaskLayerProps> = ({
  portalRoot,
  masks,
  isCapturing,
  onRemove,
}) => {
  if (masks.length === 0) return null;

  return createPortal(
    <>
      {masks.map((mask) => (
        <div
          key={mask.id}
          style={{
            position: 'absolute',
            left: `${mask.x}px`,
            top: `${mask.y}px`,
            width: `${mask.width}px`,
            height: `${mask.height}px`,
            pointerEvents: isCapturing ? 'none' : 'auto',
            backdropFilter: mask.style === 'blur' ? 'blur(10px)' : undefined,
            WebkitBackdropFilter: mask.style === 'blur' ? 'blur(10px)' : undefined,
            backgroundColor:
              mask.style === 'redact' ? '#0f172a' : 'rgba(15, 23, 42, 0.18)',
            borderRadius: '6px',
          }}
          className={`group ${
            isCapturing
              ? ''
              : 'ring-1 ring-slate-400/35 hover:ring-sky-400/80 transition-shadow'
          }`}
        >
          {!isCapturing && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(mask.id);
              }}
              title="Remove box mask"
              className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-slate-900 border border-slate-600 text-slate-200 hover:bg-rose-600 hover:border-rose-500 flex items-center justify-center shadow cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
    </>,
    portalRoot,
  );
};
