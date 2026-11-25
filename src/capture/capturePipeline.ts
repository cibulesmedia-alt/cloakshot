import {
  CAPTURE_RATE_LIMIT_MS,
  CLOAKSHOT_BOX_HOST_ID,
  CLOAKSHOT_HOST_ID,
  MAX_STITCHED_HEIGHT_PX,
} from '../shared/constants';
import type { RuntimeMessage } from '../shared/types';
import { applyCleanFrame } from './cleanFrame';

export interface CaptureVisibilityHooks {
  /** Hide toolbar, hover outline, HUD, and box-mask delete handles (KEEP box-mask fills visible!) */
  setCapturing: (capturing: boolean) => void;
}

export interface CaptureOptions {
  cleanFrame: boolean;
}

export interface ScrollTarget {
  isWindow: boolean;
  element: HTMLElement;
  getScrollTop: () => number;
  setScrollTop: (y: number) => void;
  getScrollHeight: () => number;
  getViewportHeight: () => number;
  /** Visible viewport rect in CSS px (full window for window scroll, container rect for SPA inner scroll) */
  getCaptureRect: () => { x: number; y: number; width: number; height: number };
  addScrollListener: (fn: () => void) => () => void;
}

let lastCaptureTimestamp = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 35)));
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode captured frame'));
    img.src = dataUrl;
  });
}

async function captureVisibleTabPaced(): Promise<HTMLImageElement> {
  const now = Date.now();
  const elapsed = now - lastCaptureTimestamp;
  if (elapsed < CAPTURE_RATE_LIMIT_MS) {
    await sleep(CAPTURE_RATE_LIMIT_MS - elapsed);
  }

  const res = await chrome.runtime.sendMessage({
    type: 'CAPTURE_VISIBLE_TAB',
  } satisfies RuntimeMessage);

  lastCaptureTimestamp = Date.now();

  if (!res?.ok || !res.dataUrl) {
    throw new Error(res?.error || 'Unable to capture tab screenshot');
  }
  return loadImage(res.dataUrl as string);
}

/**
 * Auto-detects the active scroll container:
 * - Uses `window` when the document itself scrolls.
 * - Falls back to the largest visible inner scrollable container (`overflow-y: auto/scroll`)
 *   for SPA layouts like Stripe, Linear, or Gmail.
 */
export function findScrollTarget(): ScrollTarget {
  const docEl = document.documentElement;
  if (docEl.scrollHeight > window.innerHeight + 24) {
    return {
      isWindow: true,
      element: docEl,
      getScrollTop: () => window.scrollY,
      setScrollTop: (y) => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }),
      getScrollHeight: () => docEl.scrollHeight,
      getViewportHeight: () => window.innerHeight,
      getCaptureRect: () => ({
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      }),
      addScrollListener: (fn) => {
        window.addEventListener('scroll', fn, { passive: true });
        return () => window.removeEventListener('scroll', fn);
      },
    };
  }

  // Fallback: detect largest scrollable inner container
  let best: HTMLElement | null = null;
  let bestArea = 0;

  const candidates = document.querySelectorAll<HTMLElement>('main, section, div, article');
  for (const el of candidates) {
    if (el.id === CLOAKSHOT_HOST_ID || el.id === CLOAKSHOT_BOX_HOST_ID) continue;
    if (el.scrollHeight <= el.clientHeight + 48) continue;
    if (el.clientWidth < 200 || el.clientHeight < 200) continue;

    const style = getComputedStyle(el);
    if (style.overflowY !== 'auto' && style.overflowY !== 'scroll') continue;

    const area = el.clientWidth * el.clientHeight;
    if (area > bestArea) {
      bestArea = area;
      best = el;
    }
  }

  if (best) {
    const container = best;
    return {
      isWindow: false,
      element: container,
      getScrollTop: () => container.scrollTop,
      setScrollTop: (y) => {
        container.scrollTop = y;
      },
      getScrollHeight: () => container.scrollHeight,
      getViewportHeight: () => container.clientHeight,
      getCaptureRect: () => {
        const rect = container.getBoundingClientRect();
        return {
          x: Math.max(0, rect.left),
          y: Math.max(0, rect.top),
          width: Math.min(rect.width, window.innerWidth - Math.max(0, rect.left)),
          height: Math.min(rect.height, window.innerHeight - Math.max(0, rect.top)),
        };
      },
      addScrollListener: (fn) => {
        container.addEventListener('scroll', fn, { passive: true });
        return () => container.removeEventListener('scroll', fn);
      },
    };
  }

  // Non-scrolling page fallback
  return {
    isWindow: true,
    element: docEl,
    getScrollTop: () => window.scrollY,
    setScrollTop: (y) => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }),
    getScrollHeight: () => Math.max(docEl.scrollHeight, window.innerHeight),
    getViewportHeight: () => window.innerHeight,
    getCaptureRect: () => ({
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    }),
    addScrollListener: (fn) => {
      window.addEventListener('scroll', fn, { passive: true });
      return () => window.removeEventListener('scroll', fn);
    },
  };
}

/**
 * Temporarily hides `position: fixed` and `position: sticky` elements (excluding CloakShot hosts)
 * after frame 0 so navbars/headers do not repeat down stitched full-page screenshots.
 */
function hideFixedAndStickyElements(): () => void {
  const hidden = new Map<HTMLElement, string>();
  const all = document.querySelectorAll<HTMLElement>('*');

  for (const el of all) {
    if (el.id === CLOAKSHOT_HOST_ID || el.id === CLOAKSHOT_BOX_HOST_ID) continue;
    const pos = getComputedStyle(el).position;
    if (pos === 'fixed' || pos === 'sticky') {
      hidden.set(el, el.style.visibility);
      el.style.visibility = 'hidden';
    }
  }

  return () => {
    for (const [el, prevVisibility] of hidden) {
      el.style.visibility = prevVisibility;
    }
    hidden.clear();
  };
}

/** Capture 1: Current visible viewport */
export async function captureVisible(
  hooks: CaptureVisibilityHooks,
  options: CaptureOptions,
): Promise<HTMLCanvasElement> {
  hooks.setCapturing(true);
  try {
    await waitPaint();
    const img = await captureVisibleTabPaced();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(img, 0, 0);
    return options.cleanFrame ? applyCleanFrame(canvas) : canvas;
  } finally {
    hooks.setCapturing(false);
  }
}

/** Capture 2: Selected element or dragged crop rectangle (in viewport CSS px) */
export async function captureArea(
  rect: { x: number; y: number; width: number; height: number },
  hooks: CaptureVisibilityHooks,
  options: CaptureOptions,
): Promise<HTMLCanvasElement> {
  hooks.setCapturing(true);
  try {
    await waitPaint();
    const img = await captureVisibleTabPaced();
    const scaleX = img.naturalWidth / window.innerWidth;
    const scaleY = img.naturalHeight / window.innerHeight;

    const sx = Math.max(0, Math.round(rect.x * scaleX));
    const sy = Math.max(0, Math.round(rect.y * scaleY));
    const sw = Math.max(1, Math.min(img.naturalWidth - sx, Math.round(rect.width * scaleX)));
    const sh = Math.max(1, Math.min(img.naturalHeight - sy, Math.round(rect.height * scaleY)));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    }
    return options.cleanFrame ? applyCleanFrame(canvas) : canvas;
  } finally {
    hooks.setCapturing(false);
  }
}

/**
 * Capture 3A (Mode A — 1-Click Auto Full-Page):
 * Automatically scrolls from top to bottom, hides fixed/sticky headers after frame 0,
 * respects Chrome's captureVisibleTab rate limit, caps stitched height at 15,000px,
 * and stitches frames cleanly onto an offscreen canvas.
 */
export async function captureAutoFullPage(
  hooks: CaptureVisibilityHooks,
  options: CaptureOptions,
  onProgress?: (pct: number) => void,
): Promise<{ canvas: HTMLCanvasElement; wasCapped: boolean }> {
  const target = findScrollTarget();
  const originalScrollTop = target.getScrollTop();
  const viewportH = target.getViewportHeight();
  const rawTotalH = target.getScrollHeight();
  const wasCapped = rawTotalH > MAX_STITCHED_HEIGHT_PX;
  const totalH = Math.min(rawTotalH, MAX_STITCHED_HEIGHT_PX);
  const captureRect = target.getCaptureRect();

  let restoreFixed: (() => void) | null = null;
  hooks.setCapturing(true);

  try {
    target.setScrollTop(0);
    await waitPaint();

    const firstImg = await captureVisibleTabPaced();
    const scaleX = firstImg.naturalWidth / window.innerWidth;
    const scaleY = firstImg.naturalHeight / window.innerHeight;

    const sx = Math.round(captureRect.x * scaleX);
    const sy = Math.round(captureRect.y * scaleY);
    const sw = Math.round(captureRect.width * scaleX);
    const sh = Math.round(captureRect.height * scaleY);

    const out = document.createElement('canvas');
    out.width = sw;
    out.height = Math.min(Math.round(totalH * scaleY), Math.round(MAX_STITCHED_HEIGHT_PX * scaleY));
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    // Frame 0
    ctx.drawImage(firstImg, sx, sy, sw, Math.min(sh, out.height), 0, 0, sw, Math.min(sh, out.height));
    onProgress?.(Math.min(100, Math.round((viewportH / totalH) * 100)));

    if (totalH > viewportH + 4) {
      restoreFixed = hideFixedAndStickyElements();
      let currentY = viewportH;

      while (currentY < totalH) {
        const remaining = totalH - currentY;
        const targetScroll = Math.min(currentY, rawTotalH - viewportH);
        target.setScrollTop(targetScroll);
        await waitPaint();

        const actualScroll = target.getScrollTop();
        const img = await captureVisibleTabPaced();

        // Compute exact non-overlapping slice when near the bottom of the page
        const overlapCss = currentY - actualScroll;
        const sliceStartCss = Math.max(0, overlapCss);
        const sliceHeightCss = Math.min(remaining, viewportH - sliceStartCss);

        if (sliceHeightCss > 0) {
          const srcY = sy + Math.round(sliceStartCss * scaleY);
          const srcH = Math.round(sliceHeightCss * scaleY);
          const destY = Math.round(currentY * scaleY);
          const destH = Math.min(srcH, out.height - destY);

          if (destH > 0) {
            ctx.drawImage(img, sx, srcY, sw, destH, 0, destY, sw, destH);
          }
        }

        currentY += viewportH;
        onProgress?.(Math.min(100, Math.round((Math.min(currentY, totalH) / totalH) * 100)));
      }
    }

    const finalCanvas = options.cleanFrame ? applyCleanFrame(out) : out;
    return { canvas: finalCanvas, wasCapped };
  } finally {
    restoreFixed?.();
    target.setScrollTop(originalScrollTop);
    hooks.setCapturing(false);
  }
}

interface LiveSlice {
  scrollTop: number;
  img: HTMLImageElement;
}

/**
 * Capture 3B (Mode B — Interactive Live Scroll-Stitch):
 * User manually scrolls at their own pace (ideal for lazy-loaded images, infinite lists,
 * or stopping at an exact section). Captures newly revealed slices whenever scroll advances
 * by >= 70% of viewport height, plus a final slice when clicking Done.
 */
export class LiveScrollStitchSession {
  private target: ScrollTarget;
  private startScrollTop = 0;
  private lastCapturedScrollTop = 0;
  private slices: LiveSlice[] = [];
  private restoreFixed: (() => void) | null = null;
  private removeScrollListener: (() => void) | null = null;
  private capturingSlice = false;
  private active = false;
  private capped = false;
  private captureRect: { x: number; y: number; width: number; height: number };

  constructor(
    private hooks: CaptureVisibilityHooks,
    private options: CaptureOptions,
    private onUpdate: (heightPx: number, capped: boolean) => void,
  ) {
    this.target = findScrollTarget();
    this.captureRect = this.target.getCaptureRect();
  }

  getCapturedHeightPx(): number {
    const viewportH = this.target.getViewportHeight();
    const maxScroll = Math.max(this.lastCapturedScrollTop, this.target.getScrollTop());
    const span = Math.max(0, maxScroll - this.startScrollTop) + viewportH;
    return Math.min(Math.round(span), MAX_STITCHED_HEIGHT_PX);
  }

  async start(): Promise<void> {
    this.active = true;
    this.startScrollTop = this.target.getScrollTop();
    this.lastCapturedScrollTop = this.startScrollTop;
    this.slices = [];

    // Capture Frame 0 at the starting scroll position
    await this.captureCurrentSlice();
    this.restoreFixed = hideFixedAndStickyElements();
    this.onUpdate(this.getCapturedHeightPx(), false);

    this.removeScrollListener = this.target.addScrollListener(() => {
      if (!this.active || this.capturingSlice || this.capped) return;
      const currentScroll = this.target.getScrollTop();
      const viewportH = this.target.getViewportHeight();
      const delta = currentScroll - this.lastCapturedScrollTop;
      const projectedHeight = currentScroll - this.startScrollTop + viewportH;

      this.onUpdate(Math.min(Math.round(projectedHeight), MAX_STITCHED_HEIGHT_PX), projectedHeight >= MAX_STITCHED_HEIGHT_PX);

      if (projectedHeight >= MAX_STITCHED_HEIGHT_PX) {
        this.capped = true;
        void this.captureCurrentSlice();
        return;
      }

      if (delta >= viewportH * 0.7) {
        void this.captureCurrentSlice();
      }
    });
  }

  private async captureCurrentSlice(): Promise<void> {
    if (this.capturingSlice || !this.active) return;
    this.capturingSlice = true;
    this.hooks.setCapturing(true);
    try {
      await waitPaint();
      const scrollTop = this.target.getScrollTop();
      const img = await captureVisibleTabPaced();
      this.slices.push({ scrollTop, img });
      this.lastCapturedScrollTop = scrollTop;
      this.onUpdate(this.getCapturedHeightPx(), this.capped);
    } finally {
      this.hooks.setCapturing(false);
      this.capturingSlice = false;
    }
  }

  async finish(): Promise<{ canvas: HTMLCanvasElement; wasCapped: boolean }> {
    if (!this.active) throw new Error('Live scroll session is not active');

    // Wait if a slice is currently mid-capture
    while (this.capturingSlice) {
      await sleep(30);
    }

    // Capture final slice if user scrolled past last captured position
    const currentScroll = this.target.getScrollTop();
    if (currentScroll > this.lastCapturedScrollTop + 8) {
      await this.captureCurrentSlice();
    }

    this.cleanup();

    if (this.slices.length === 0) {
      throw new Error('No frames captured');
    }

    const first = this.slices[0];
    const scaleX = first.img.naturalWidth / window.innerWidth;
    const scaleY = first.img.naturalHeight / window.innerHeight;
    const viewportH = this.target.getViewportHeight();

    const sx = Math.round(this.captureRect.x * scaleX);
    const sy = Math.round(this.captureRect.y * scaleY);
    const sw = Math.round(this.captureRect.width * scaleX);
    const sh = Math.round(this.captureRect.height * scaleY);

    // Sort slices ascending by scrollTop and deduplicate
    const sorted = [...this.slices].sort((a, b) => a.scrollTop - b.scrollTop);
    const minScroll = sorted[0].scrollTop;
    const maxScroll = sorted[sorted.length - 1].scrollTop;
    const rawHeightCss = maxScroll - minScroll + viewportH;
    const wasCapped = rawHeightCss > MAX_STITCHED_HEIGHT_PX || this.capped;
    const totalHeightCss = Math.min(rawHeightCss, MAX_STITCHED_HEIGHT_PX);

    const out = document.createElement('canvas');
    out.width = sw;
    out.height = Math.max(1, Math.round(totalHeightCss * scaleY));
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    for (const slice of sorted) {
      const destYCss = slice.scrollTop - minScroll;
      if (destYCss >= MAX_STITCHED_HEIGHT_PX) break;
      const destY = Math.round(destYCss * scaleY);
      const drawH = Math.min(sh, out.height - destY);
      if (drawH > 0) {
        ctx.drawImage(slice.img, sx, sy, sw, drawH, 0, destY, sw, drawH);
      }
    }

    const finalCanvas = this.options.cleanFrame ? applyCleanFrame(out) : out;
    return { canvas: finalCanvas, wasCapped };
  }

  cancel(): void {
    this.cleanup();
  }

  private cleanup(): void {
    this.active = false;
    this.removeScrollListener?.();
    this.removeScrollListener = null;
    this.restoreFixed?.();
    this.restoreFixed = null;
    this.hooks.setCapturing(false);
  }
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode PNG blob'));
    }, 'image/png');
  });
}

/**
 * Copies PNG canvas to clipboard with window.focus() safeguard
 * so multi-second scrolling captures never throw NotAllowedError.
 */
export async function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<void> {
  const blob = await canvasToPngBlob(canvas);
  window.focus();
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export async function downloadCanvasPng(canvas: HTMLCanvasElement): Promise<void> {
  const blob = await canvasToPngBlob(canvas);
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  const a = document.createElement('a');
  a.href = url;
  a.download = `cloakshot-${stamp}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
