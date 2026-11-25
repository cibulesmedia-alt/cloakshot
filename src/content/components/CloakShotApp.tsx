import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  captureArea,
  captureAutoFullPage,
  captureVisible,
  copyCanvasToClipboard,
  downloadCanvasPng,
  LiveScrollStitchSession,
} from '../../capture/capturePipeline';
import { autoScanner } from '../../engine/autoScanner';
import { domEngine } from '../../engine/domEngine';
import { liveShield } from '../../engine/liveShield';
import { findMatchingSiblings } from '../../engine/siblingMatcher';
import { useProStatus } from '../../hooks/useProStatus';
import { getDomainRule, getPreferences, saveDomainRule, savePreferences } from '../../shared/storage';
import type {
  BoxMask,
  CaptureMode,
  DomainRule,
  MaskMode,
  RuntimeMessage,
  ScanCategory,
  ScanCounts,
} from '../../shared/types';
import { AutoScanPopover } from './AutoScanPopover';
import { BoxMaskLayer } from './BoxMaskLayer';
import { CapturePopover } from './CapturePopover';
import { FloatingToolbar, ScrollCaptureHud } from './FloatingToolbar';
import { HoverOverlay } from './HoverOverlay';
import { Toast, type ToastMessage } from './Toast';

interface CloakShotAppProps {
  visible: boolean;
  boxPortalRoot: HTMLElement;
  initialDomainRule: DomainRule | null;
  onRequestClose: () => void;
}

const EMPTY_COUNTS: ScanCounts = {
  emails: 0,
  amounts: 0,
  ibansCards: 0,
  apiKeys: 0,
  names: 0,
};

export const CloakShotApp: React.FC<CloakShotAppProps> = ({
  visible,
  boxPortalRoot,
  initialDomainRule,
  onRequestClose,
}) => {
  const { isPro, isDevBuild, devOverride, openUpgrade, setDevOverride } = useProStatus();

  const [mode, setMode] = useState<MaskMode | null>('blur');
  const [activePopover, setActivePopover] = useState<'scan' | 'capture' | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [areaCaptureActive, setAreaCaptureActive] = useState(false);
  const [fullPageProgress, setFullPageProgress] = useState<number | null>(null);

  // Live Scroll-Stitch (Mode B) state
  const [liveScrollState, setLiveScrollState] = useState<{
    active: boolean;
    heightPx: number;
    capped: boolean;
  }>({ active: false, heightPx: 0, capped: false });
  const liveScrollSessionRef = useRef<LiveScrollStitchSession | null>(null);

  // Mask & Scan state
  const [boxMasks, setBoxMasks] = useState<BoxMask[]>([]);
  const [domMaskCount, setDomMaskCount] = useState(0);
  const [undoCount, setUndoCount] = useState(0);
  const [scanCounts, setScanCounts] = useState<ScanCounts>(EMPTY_COUNTS);
  const [activeCategories, setActiveCategories] = useState<Set<ScanCategory>>(new Set());
  const [liveShieldActive, setLiveShieldActive] = useState(false);
  const [hasSavedRule, setHasSavedRule] = useState(false);

  // Preferences
  const [cleanFrame, setCleanFrame] = useState(false);
  const [autoRestore, setAutoRestore] = useState(false);
  const [outputAction, setOutputAction] = useState<'copy' | 'download'>('copy');

  // Hover & Drag state
  const [hoverPrimary, setHoverPrimary] = useState<DOMRect | null>(null);
  const [hoverBatch, setHoverBatch] = useState<DOMRect[]>([]);
  const [hoverLabel, setHoverLabel] = useState<string | undefined>(undefined);
  const [dragRect, setDragRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const hoveredElRef = useRef<HTMLElement | null>(null);
  const lastEscTimeRef = useRef<number>(0);

  // Toast
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const hostname = window.location.hostname || 'local-page';

  const showToast = useCallback((text: string, tone: ToastMessage['tone'] = 'success') => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), text, tone });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  const handleRequestPro = useCallback(
    async (feature: string) => {
      showToast(`${feature} is a Pro feature ($14 lifetime)`, 'pro');
      const res = await openUpgrade();
      if (!res.ok && res.error) {
        showToast(res.error, 'info');
      }
    },
    [openUpgrade, showToast],
  );

  // Sync DOM engine counts & register BoxMask undo remover
  useEffect(() => {
    domEngine.setBoxMaskRemover((id) => {
      setBoxMasks((prev) => prev.filter((m) => m.id !== id));
    });
    const unsub = domEngine.subscribe(() => {
      setDomMaskCount(domEngine.getActiveMaskCount());
      setUndoCount(domEngine.getUndoCount());
    });
    return unsub;
  }, []);

  // Load saved preferences & domain rule metadata
  useEffect(() => {
    void (async () => {
      const prefs = await getPreferences();
      setCleanFrame(prefs.cleanFrameEnabled);
      setAutoRestore(prefs.autoRestoreAfterCapture);
      const existing = await getDomainRule(hostname);
      setHasSavedRule(Boolean(existing));
    })();
  }, [hostname]);

  // Apply initial domain rule if auto-injected by service worker
  useEffect(() => {
    if (!initialDomainRule || initialDomainRule.categories.length === 0) return;
    const cats = new Set<ScanCategory>(initialDomainRule.categories);
    setActiveCategories(cats);
    for (const cat of initialDomainRule.categories) {
      autoScanner.applyCategory(cat, initialDomainRule.maskStyle);
    }
    if (initialDomainRule.liveShield) {
      liveShield.start(initialDomainRule.categories, initialDomainRule.maskStyle);
      setLiveShieldActive(true);
    }
    setHasSavedRule(true);
  }, [initialDomainRule]);

  // Run scan when toolbar becomes visible
  const refreshScan = useCallback(() => {
    setScanCounts(autoScanner.scanCounts(document.body));
  }, []);

  useEffect(() => {
    if (visible) {
      refreshScan();
    }
  }, [visible, refreshScan]);

  // Switch default mode to Smart Mock Swap when Pro is active
  useEffect(() => {
    if (isPro && mode === 'blur' && domMaskCount === 0 && boxMasks.length === 0) {
      setMode('mock');
    }
  }, [isPro, mode, domMaskCount, boxMasks.length]);

  const handleSelectMode = useCallback(
    (next: MaskMode | null) => {
      if (next === 'mock' && !isPro) {
        void handleRequestPro('Smart Mock Swap');
        return;
      }
      setAreaCaptureActive(false);
      setMode(next);
      setActivePopover(null);
      setHoverPrimary(null);
      setHoverBatch([]);
    },
    [isPro, handleRequestPro],
  );

  const handleUndo = useCallback(() => {
    const undone = domEngine.undoLast();
    if (undone) {
      showToast(`Undid ${undone.label}`, 'info');
    }
  }, [showToast]);

  const handleRestoreAll = useCallback(() => {
    const count = domEngine.restoreAll();
    const boxCount = boxMasks.length;
    setBoxMasks([]);
    setActiveCategories(new Set());
    if (liveShield.isActive()) {
      liveShield.stop();
      setLiveShieldActive(false);
    }
    if (count > 0 || boxCount > 0) {
      showToast('Page restored to original state', 'success');
    }
    refreshScan();
  }, [boxMasks.length, showToast, refreshScan]);

  const finalizeCanvas = useCallback(
    async (canvas: HTMLCanvasElement, extraNote?: string) => {
      let restored = false;
      try {
        if (outputAction === 'copy') {
          await copyCanvasToClipboard(canvas);
        } else {
          await downloadCanvasPng(canvas);
        }

        if (autoRestore) {
          domEngine.restoreAll();
          setBoxMasks([]);
          setActiveCategories(new Set());
          if (liveShield.isActive()) {
            liveShield.stop();
            setLiveShieldActive(false);
          }
          restored = true;
        }

        const actionText = outputAction === 'copy' ? 'Copied to clipboard' : 'Downloaded PNG';
        const restoreText = restored ? ' & page restored' : '';
        const noteText = extraNote ? ` (${extraNote})` : '';
        showToast(`${actionText}${restoreText}${noteText}`, 'success');
      } catch (err) {
        // Fallback to download if clipboard focus was blocked
        if (outputAction === 'copy') {
          await downloadCanvasPng(canvas);
          showToast('Clipboard blocked — downloaded PNG instead', 'info');
        } else {
          showToast(err instanceof Error ? err.message : 'Capture failed', 'info');
        }
      }
    },
    [outputAction, autoRestore, showToast],
  );

  const handleCapture = useCallback(
    async (captureMode: CaptureMode) => {
      setActivePopover(null);
      const hooks = { setCapturing: setIsCapturing };
      const opts = { cleanFrame: isPro && cleanFrame };

      if (captureMode === 'visible') {
        try {
          const canvas = await captureVisible(hooks, opts);
          await finalizeCanvas(canvas);
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Capture failed', 'info');
        }
        return;
      }

      if (captureMode === 'area') {
        setAreaCaptureActive(true);
        setMode(null);
        showToast('Click any card/element or drag a crop box (Esc to cancel)', 'info');
        return;
      }

      if (captureMode === 'fullpage') {
        try {
          setFullPageProgress(0);
          const { canvas, wasCapped } = await captureAutoFullPage(hooks, opts, (pct) => {
            setFullPageProgress(pct);
          });
          setFullPageProgress(null);
          await finalizeCanvas(canvas, wasCapped ? 'capped at 15,000px' : undefined);
        } catch (err) {
          setFullPageProgress(null);
          showToast(err instanceof Error ? err.message : 'Full-page capture failed', 'info');
        }
        return;
      }

      if (captureMode === 'scroll-live') {
        try {
          setMode(null);
          setHoverPrimary(null);
          setHoverBatch([]);
          const session = new LiveScrollStitchSession(hooks, opts, (heightPx, capped) => {
            setLiveScrollState({ active: true, heightPx, capped });
          });
          liveScrollSessionRef.current = session;
          setLiveScrollState({ active: true, heightPx: window.innerHeight, capped: false });
          await session.start();
        } catch (err) {
          liveScrollSessionRef.current?.cancel();
          liveScrollSessionRef.current = null;
          setLiveScrollState({ active: false, heightPx: 0, capped: false });
          showToast(err instanceof Error ? err.message : 'Live scroll capture failed', 'info');
        }
      }
    },
    [isPro, cleanFrame, finalizeCanvas, showToast],
  );

  const handleLiveScrollDone = useCallback(async () => {
    const session = liveScrollSessionRef.current;
    if (!session) return;
    liveScrollSessionRef.current = null;
    setLiveScrollState({ active: false, heightPx: 0, capped: false });
    try {
      const { canvas, wasCapped } = await session.finish();
      await finalizeCanvas(canvas, wasCapped ? 'capped at 15,000px' : undefined);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to stitch scroll capture', 'info');
    }
  }, [finalizeCanvas, showToast]);

  const handleLiveScrollCancel = useCallback(() => {
    liveScrollSessionRef.current?.cancel();
    liveScrollSessionRef.current = null;
    setLiveScrollState({ active: false, heightPx: 0, capped: false });
    showToast('Scroll capture cancelled', 'info');
  }, [showToast]);

  // Auto-Scan category toggle
  const handleToggleCategory = useCallback(
    (cat: ScanCategory) => {
      const next = new Set(activeCategories);
      const style: 'mock' | 'redact' | 'blur' =
        mode === 'redact' ? 'redact' : mode === 'blur' ? 'blur' : 'mock';

      if (next.has(cat)) {
        next.delete(cat);
        autoScanner.removeCategory(cat);
      } else {
        next.add(cat);
        const count = autoScanner.applyCategory(cat, style);
        showToast(`Masked ${count} ${cat} item${count === 1 ? '' : 's'}`, 'success');
      }

      setActiveCategories(next);
      if (liveShield.isActive()) {
        liveShield.updateConfig(Array.from(next), style);
      }
    },
    [activeCategories, mode, showToast],
  );

  const handleToggleLiveShield = useCallback(() => {
    const style: 'mock' | 'redact' | 'blur' =
      mode === 'redact' ? 'redact' : mode === 'blur' ? 'blur' : 'mock';

    if (liveShield.isActive()) {
      liveShield.stop();
      setLiveShieldActive(false);
      showToast('Live Screen-Share Shield paused', 'info');
    } else {
      const cats: ScanCategory[] =
        activeCategories.size > 0
          ? Array.from(activeCategories)
          : ['emails', 'amounts', 'ibansCards', 'apiKeys'];
      if (activeCategories.size === 0) {
        const nextSet = new Set(cats);
        setActiveCategories(nextSet);
        for (const c of cats) autoScanner.applyCategory(c, style);
      }
      liveShield.start(cats, style);
      setLiveShieldActive(true);
      showToast('Live Screen-Share Shield active — watching DOM changes', 'success');
    }
  }, [activeCategories, mode, showToast]);

  const handleSaveDomainRule = useCallback(async () => {
    const cats: ScanCategory[] =
      activeCategories.size > 0
        ? Array.from(activeCategories)
        : ['emails', 'amounts', 'ibansCards', 'apiKeys'];

    const style: 'mock' | 'redact' | 'blur' =
      mode === 'redact' ? 'redact' : mode === 'blur' ? 'blur' : 'mock';

    // Save rule to chrome.storage.local
    await saveDomainRule({
      hostname,
      categories: cats,
      liveShield: true,
      maskStyle: style,
      updatedAt: Date.now(),
    });
    setHasSavedRule(true);

    // Dynamically request optional_host_permissions for this hostname (CWS-friendly)
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'REQUEST_DOMAIN_PERMISSION',
        hostname,
      } satisfies RuntimeMessage);

      if (res?.granted) {
        showToast(`Saved auto-mask rule for ${hostname}`, 'success');
      } else {
        showToast(`Rule saved! Grant site access in CloakShot popup to auto-run on ${hostname}`, 'info');
      }
    } catch {
      showToast(`Rule saved for ${hostname}`, 'success');
    }
  }, [activeCategories, hostname, mode, showToast]);

  // Global In-Page Keyboard Shortcuts
  useEffect(() => {
    if (!visible) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        if (isTyping) return;
        e.preventDefault();
        e.stopPropagation();

        if (liveScrollState.active) {
          handleLiveScrollCancel();
          return;
        }
        if (areaCaptureActive) {
          setAreaCaptureActive(false);
          setDragRect(null);
          setHoverPrimary(null);
          return;
        }
        if (activePopover) {
          setActivePopover(null);
          return;
        }

        const now = Date.now();
        if (mode !== null) {
          setMode(null);
          setHoverPrimary(null);
          setHoverBatch([]);
          lastEscTimeRef.current = now;
          showToast('Selection paused (press Esc again to close & restore)', 'info');
          return;
        }

        // Second Esc (or Esc while paused) closes toolbar & restores original page
        handleRestoreAll();
        onRequestClose();
        return;
      }

      if (isTyping) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        handleUndo();
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '1') {
        e.preventDefault();
        handleSelectMode('mock');
      } else if (e.key === '2') {
        e.preventDefault();
        handleSelectMode('redact');
      } else if (e.key === '3') {
        e.preventDefault();
        handleSelectMode('blur');
      } else if (e.key === '4') {
        e.preventDefault();
        handleSelectMode('box');
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    visible,
    mode,
    activePopover,
    areaCaptureActive,
    liveScrollState.active,
    handleSelectMode,
    handleUndo,
    handleRestoreAll,
    handleLiveScrollCancel,
    onRequestClose,
    showToast,
  ]);

  // Hover Inspector, Click-to-Mask, Shift+Click Batching, Box Draw, Area Crop & Inline Double-Click Edit
  useEffect(() => {
    if (!visible || isCapturing || liveScrollState.active) {
      setHoverPrimary(null);
      setHoverBatch([]);
      return;
    }

    const isInteractiveMode = mode !== null || areaCaptureActive;
    if (!isInteractiveMode) {
      setHoverPrimary(null);
      setHoverBatch([]);
      return;
    }

    const onMouseMove = (e: MouseEvent) => {
      if (dragOriginRef.current) {
        const x = Math.min(dragOriginRef.current.x, e.clientX);
        const y = Math.min(dragOriginRef.current.y, e.clientY);
        const width = Math.abs(e.clientX - dragOriginRef.current.x);
        const height = Math.abs(e.clientY - dragOriginRef.current.y);
        setDragRect({ x, y, width, height });
        setHoverPrimary(null);
        setHoverBatch([]);
        return;
      }

      if (mode === 'box') {
        setHoverPrimary(null);
        setHoverBatch([]);
        return;
      }

      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!el || domEngine.isCloakShotNode(el) || el === document.body || el === document.documentElement) {
        hoveredElRef.current = null;
        setHoverPrimary(null);
        setHoverBatch([]);
        return;
      }

      hoveredElRef.current = el;
      setHoverPrimary(el.getBoundingClientRect());

      if (areaCaptureActive) {
        setHoverBatch([]);
        setHoverLabel('Click element or drag to capture');
      } else if (e.shiftKey && isPro) {
        const siblings = findMatchingSiblings(el);
        setHoverBatch(siblings.filter((s) => s !== el).map((s) => s.getBoundingClientRect()));
        setHoverLabel(`Shift+Click: ${siblings.length} matching items`);
      } else {
        setHoverBatch([]);
        setHoverLabel(
          mode === 'mock'
            ? 'Click to Smart Mock • Dbl-click to edit'
            : mode === 'redact'
              ? 'Click to Solid Redact'
              : 'Click to Blur',
        );
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as Node | null;
      if (domEngine.isCloakShotNode(target)) return;

      if (mode === 'box' || areaCaptureActive) {
        e.preventDefault();
        e.stopPropagation();
        dragOriginRef.current = { x: e.clientX, y: e.clientY };
        setDragRect({ x: e.clientX, y: e.clientY, width: 0, height: 0 });
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!dragOriginRef.current) return;
      const start = dragOriginRef.current;
      dragOriginRef.current = null;

      const x = Math.min(start.x, e.clientX);
      const y = Math.min(start.y, e.clientY);
      const width = Math.abs(e.clientX - start.x);
      const height = Math.abs(e.clientY - start.y);
      setDragRect(null);

      if (mode === 'box') {
        if (width >= 12 && height >= 12) {
          const id = `box-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const newBox: BoxMask = {
            id,
            x: x + window.scrollX,
            y: y + window.scrollY,
            width,
            height,
            style: 'blur',
          };
          setBoxMasks((prev) => [...prev, newBox]);
          domEngine.recordBoxMaskUndo(id);
        }
        return;
      }

      if (areaCaptureActive) {
        setAreaCaptureActive(false);
        const rect =
          width >= 16 && height >= 16
            ? { x, y, width, height }
            : hoveredElRef.current?.getBoundingClientRect();

        if (rect && rect.width > 4 && rect.height > 4) {
          void (async () => {
            try {
              const canvas = await captureArea(
                { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                { setCapturing: setIsCapturing },
                { cleanFrame: isPro && cleanFrame },
              );
              await finalizeCanvas(canvas);
            } catch (err) {
              showToast(err instanceof Error ? err.message : 'Area capture failed', 'info');
            }
          })();
        }
      }
    };

    const onClick = (e: MouseEvent) => {
      if (mode === 'box' || areaCaptureActive || !mode) return;
      const target = e.target as HTMLElement | null;
      if (!target || domEngine.isCloakShotNode(target)) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.shiftKey) {
        if (!isPro) {
          void handleRequestPro('Shift+Click Column/List Batching');
          return;
        }
        const siblings = findMatchingSiblings(target);
        const count = domEngine.maskElements(
          siblings,
          mode,
          `Batch ${mode} (${siblings.length})`,
        );
        if (count > 0) {
          showToast(`Masked ${siblings.length} matching items`, 'success');
        }
        return;
      }

      domEngine.maskElements([target], mode);
    };

    const onDblClick = (e: MouseEvent) => {
      if (mode === 'box' || areaCaptureActive) return;
      const target = e.target as HTMLElement | null;
      if (!target || domEngine.isCloakShotNode(target)) return;

      const textNodes = domEngine.collectTextNodes(target);
      if (textNodes.length !== 1) return;

      e.preventDefault();
      e.stopPropagation();

      if (!isPro) {
        void handleRequestPro('Inline Text Edit');
        return;
      }

      const textNode = textNodes[0];
      const original = textNode.nodeValue ?? '';
      const prevEditable = target.contentEditable;
      const prevOutline = target.style.outline;

      target.contentEditable = 'true';
      target.style.outline = '2px solid #38bdf8';
      target.focus();

      const finishEdit = (commit: boolean) => {
        target.contentEditable = prevEditable;
        target.style.outline = prevOutline;
        target.removeEventListener('blur', onBlur);
        target.removeEventListener('keydown', onEditKey);
        if (commit) {
          const updated = target.textContent ?? original;
          domEngine.commitInlineEdit(textNode, updated);
          showToast('Inline text updated', 'success');
        } else {
          textNode.nodeValue = original;
        }
      };

      const onBlur = () => finishEdit(true);
      const onEditKey = (ke: KeyboardEvent) => {
        if (ke.key === 'Enter' && !ke.shiftKey) {
          ke.preventDefault();
          finishEdit(true);
        } else if (ke.key === 'Escape') {
          ke.preventDefault();
          finishEdit(false);
        }
      };

      target.addEventListener('blur', onBlur);
      target.addEventListener('keydown', onEditKey);
    };

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('dblclick', onDblClick, true);

    return () => {
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('mouseup', onMouseUp, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('dblclick', onDblClick, true);
    };
  }, [
    visible,
    isCapturing,
    liveScrollState.active,
    mode,
    areaCaptureActive,
    isPro,
    cleanFrame,
    finalizeCanvas,
    handleRequestPro,
    showToast,
  ]);

  // Cursor hint when drawing box or cropping area
  useEffect(() => {
    if (visible && !isCapturing && (mode === 'box' || areaCaptureActive)) {
      const prev = document.documentElement.style.cursor;
      document.documentElement.style.cursor = 'crosshair';
      return () => {
        document.documentElement.style.cursor = prev;
      };
    }
  }, [visible, isCapturing, mode, areaCaptureActive]);

  const totalMasks = domMaskCount + boxMasks.length;

  return (
    <>
      {/* Box Masks stay visible during capture — only handles are hidden! */}
      <BoxMaskLayer
        portalRoot={boxPortalRoot}
        masks={boxMasks}
        isCapturing={isCapturing}
        onRemove={(id) => setBoxMasks((prev) => prev.filter((m) => m.id !== id))}
      />

      {/* All chrome UI (Toolbar, Hover, HUD, Toasts) hides cleanly during capture */}
      {!isCapturing && (
        <>
          {visible && !liveScrollState.active && (
            <>
              <HoverOverlay
                primaryRect={hoverPrimary}
                batchRects={hoverBatch}
                dragRect={dragRect}
                label={hoverLabel}
                tone={areaCaptureActive ? 'capture' : mode === 'box' ? 'box' : 'mask'}
              />

              <FloatingToolbar
                mode={mode}
                isPro={isPro}
                isDevBuild={isDevBuild}
                devOverride={devOverride}
                activeMaskCount={totalMasks}
                undoCount={undoCount}
                liveShieldActive={liveShieldActive}
                autoScanActiveCount={activeCategories.size}
                activePopover={activePopover}
                fullPageProgress={fullPageProgress}
                onSelectMode={handleSelectMode}
                onTogglePopover={(pop) =>
                  setActivePopover((cur) => (cur === pop ? null : pop))
                }
                onUndo={handleUndo}
                onRestoreAll={handleRestoreAll}
                onClose={onRequestClose}
                onToggleDevPro={() => void setDevOverride(!devOverride)}
                popoverContent={
                  activePopover === 'scan' ? (
                    <AutoScanPopover
                      counts={scanCounts}
                      activeCategories={activeCategories}
                      liveShieldActive={liveShieldActive}
                      hostname={hostname}
                      hasSavedRule={hasSavedRule}
                      isPro={isPro}
                      onToggleCategory={handleToggleCategory}
                      onToggleLiveShield={handleToggleLiveShield}
                      onSaveDomainRule={() => void handleSaveDomainRule()}
                      onRescan={() => {
                        refreshScan();
                        showToast('Rescanned page DOM', 'info');
                      }}
                      onRequestPro={(f) => void handleRequestPro(f)}
                    />
                  ) : activePopover === 'capture' ? (
                    <CapturePopover
                      isPro={isPro}
                      cleanFrame={cleanFrame}
                      autoRestore={autoRestore}
                      outputAction={outputAction}
                      onChangeOutputAction={setOutputAction}
                      onToggleCleanFrame={() => {
                        const next = !cleanFrame;
                        setCleanFrame(next);
                        void savePreferences({ cleanFrameEnabled: next });
                      }}
                      onToggleAutoRestore={() => {
                        const next = !autoRestore;
                        setAutoRestore(next);
                        void savePreferences({ autoRestoreAfterCapture: next });
                      }}
                      onCapture={(m) => void handleCapture(m)}
                      onRequestPro={(f) => void handleRequestPro(f)}
                    />
                  ) : null
                }
              />
            </>
          )}

          {liveScrollState.active && (
            <ScrollCaptureHud
              heightPx={liveScrollState.heightPx}
              capped={liveScrollState.capped}
              onDone={() => void handleLiveScrollDone()}
              onCancel={handleLiveScrollCancel}
            />
          )}

          <Toast toast={toast} />
        </>
      )}
    </>
  );
};
