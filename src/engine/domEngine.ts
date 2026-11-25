import { CLOAKSHOT_BOX_HOST_ID, CLOAKSHOT_HOST_ID } from '../shared/constants';
import type { MaskMode, ScanCategory } from '../shared/types';
import { MockGenerator, mockGenerator } from './mockGenerator';

export type OriginalSnapshot =
  | { kind: 'text'; originalText: string }
  | { kind: 'input'; originalValue: string; originalPlaceholder: string }
  | {
      kind: 'element';
      originalFilter: string;
      originalBackgroundColor: string;
      originalColor: string;
      originalBorderRadius: string;
    };

export interface UndoBatch {
  id: string;
  label: string;
  nodes: Node[];
  category?: ScanCategory;
  boxMaskId?: string;
}

export type BoxMaskRemover = (id: string) => void;

/**
 * Zero-Drift DOM Engine:
 * - Mutates real DOM nodes in-place (Text, Input, Img, Elements) so masks never drift on scroll/resize.
 * - Stores every original snapshot in a WeakMap<Node, OriginalSnapshot> for <1ms exact restore.
 * - Tracks currently masked nodes in a WeakSet<Node> + lastMaskedValue WeakMap to prevent
 *   double-swapping loops while cleanly re-masking if a SPA re-render overwrites a node back to real data.
 */
export class DomEngine {
  private snapshots = new WeakMap<Node, OriginalSnapshot>();
  private maskedNodes = new WeakSet<Node>();
  private lastMaskedValues = new WeakMap<Node, string>();
  private activeNodes = new Set<Node>();
  private categoryNodes = new Map<ScanCategory, Set<Node>>();
  private undoStack: UndoBatch[] = [];
  private listeners = new Set<() => void>();
  private boxMaskRemover: BoxMaskRemover | null = null;
  private batchCounter = 0;

  /** Guard flag read by LiveShield MutationObserver to ignore CloakShot's own writes */
  public isMutating = false;

  constructor(private generator: MockGenerator = mockGenerator) {}

  setBoxMaskRemover(fn: BoxMaskRemover): void {
    this.boxMaskRemover = fn;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  getActiveMaskCount(): number {
    return this.activeNodes.size;
  }

  getUndoCount(): number {
    return this.undoStack.length;
  }

  isNodeMaskedAndUnchanged(node: Node): boolean {
    if (!this.maskedNodes.has(node)) return false;
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue === this.lastMaskedValues.get(node);
    }
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      return node.value === this.lastMaskedValues.get(node);
    }
    return true;
  }

  isCloakShotNode(node: Node | null): boolean {
    let cur: Node | null = node;
    while (cur) {
      if (cur instanceof HTMLElement) {
        if (cur.id === CLOAKSHOT_HOST_ID || cur.id === CLOAKSHOT_BOX_HOST_ID) {
          return true;
        }
      }
      cur = cur.parentNode ?? (cur instanceof ShadowRoot ? cur.host : null);
    }
    return false;
  }

  private withMutationGuard<T>(fn: () => T): T {
    const prev = this.isMutating;
    this.isMutating = true;
    try {
      return fn();
    } finally {
      this.isMutating = prev;
    }
  }

  private ensureSnapshot(node: Node): OriginalSnapshot | null {
    const existing = this.snapshots.get(node);

    // If a SPA re-rendered a masked text/input node back to new real data, refresh its snapshot
    if (existing && this.maskedNodes.has(node)) {
      if (existing.kind === 'text' && node.nodeType === Node.TEXT_NODE) {
        if (node.nodeValue !== this.lastMaskedValues.get(node)) {
          const refreshed: OriginalSnapshot = { kind: 'text', originalText: node.nodeValue ?? '' };
          this.snapshots.set(node, refreshed);
          return refreshed;
        }
      } else if (
        existing.kind === 'input' &&
        (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)
      ) {
        if (node.value !== this.lastMaskedValues.get(node)) {
          const refreshed: OriginalSnapshot = {
            kind: 'input',
            originalValue: node.value,
            originalPlaceholder: node.placeholder,
          };
          this.snapshots.set(node, refreshed);
          return refreshed;
        }
      }
      return existing;
    }

    if (existing) return existing;

    if (node.nodeType === Node.TEXT_NODE) {
      const snap: OriginalSnapshot = { kind: 'text', originalText: node.nodeValue ?? '' };
      this.snapshots.set(node, snap);
      return snap;
    }

    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      const snap: OriginalSnapshot = {
        kind: 'input',
        originalValue: node.value,
        originalPlaceholder: node.placeholder,
      };
      this.snapshots.set(node, snap);
      return snap;
    }

    if (node instanceof HTMLElement) {
      const snap: OriginalSnapshot = {
        kind: 'element',
        originalFilter: node.style.filter,
        originalBackgroundColor: node.style.backgroundColor,
        originalColor: node.style.color,
        originalBorderRadius: node.style.borderRadius,
      };
      this.snapshots.set(node, snap);
      return snap;
    }

    return null;
  }

  /** Apply a direct text replacement to a single Text or Input node (used by Auto-Scan & Mock Swap) */
  applyTextTransform(
    node: Text | HTMLInputElement | HTMLTextAreaElement,
    transform: (original: string) => string,
    category?: ScanCategory,
  ): boolean {
    if (this.isCloakShotNode(node)) return false;
    if (this.isNodeMaskedAndUnchanged(node)) return false;

    const snap = this.ensureSnapshot(node);
    if (!snap) return false;

    return this.withMutationGuard(() => {
      if (snap.kind === 'text' && node.nodeType === Node.TEXT_NODE) {
        const next = transform(snap.originalText);
        if (next === snap.originalText) return false;
        node.nodeValue = next;
        this.lastMaskedValues.set(node, next);
      } else if (
        snap.kind === 'input' &&
        (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)
      ) {
        const next = transform(snap.originalValue);
        if (next === snap.originalValue) return false;
        node.value = next;
        this.lastMaskedValues.set(node, next);
      } else {
        return false;
      }

      this.maskedNodes.add(node);
      this.activeNodes.add(node);
      if (category) {
        if (!this.categoryNodes.has(category)) {
          this.categoryNodes.set(category, new Set());
        }
        this.categoryNodes.get(category)!.add(node);
      }
      return true;
    });
  }

  /** Mask one or more clicked elements in the given mode ('mock' | 'redact' | 'blur') */
  maskElements(elements: HTMLElement[], mode: Exclude<MaskMode, 'box'>, label?: string): number {
    const mutated: Node[] = [];

    this.withMutationGuard(() => {
      for (const el of elements) {
        if (!el || this.isCloakShotNode(el)) continue;

        if (mode === 'blur') {
          if (!this.isNodeMaskedAndUnchanged(el)) {
            this.ensureSnapshot(el);
            el.style.filter = 'blur(6px)';
            this.maskedNodes.add(el);
            this.activeNodes.add(el);
            mutated.push(el);
          }
          continue;
        }

        // For media elements (img, video, canvas, svg) or CSS background-image in redact/mock mode
        const isMedia =
          el instanceof HTMLImageElement ||
          el instanceof HTMLVideoElement ||
          el instanceof HTMLCanvasElement ||
          el.tagName.toLowerCase() === 'svg' ||
          (el.textContent?.trim() === '' &&
            getComputedStyle(el).backgroundImage !== 'none');

        if (isMedia) {
          if (!this.isNodeMaskedAndUnchanged(el)) {
            this.ensureSnapshot(el);
            if (mode === 'redact') {
              el.style.filter = 'brightness(0)';
              el.style.backgroundColor = '#0f172a';
            } else {
              el.style.filter = 'blur(8px)';
            }
            this.maskedNodes.add(el);
            this.activeNodes.add(el);
            mutated.push(el);
          }
          continue;
        }

        // Input / TextArea elements
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          const didMutate = this.applyTextTransform(el, (orig) =>
            mode === 'redact' ? this.generator.redactText(orig) : this.generator.mockSmartText(orig),
          );
          if (didMutate) mutated.push(el);
          continue;
        }

        // Walk descendant Text nodes & inputs
        const textNodes = this.collectTextNodes(el);
        for (const textNode of textNodes) {
          const didMutate = this.applyTextTransform(textNode, (orig) =>
            mode === 'redact' ? this.generator.redactText(orig) : this.generator.mockSmartText(orig),
          );
          if (didMutate) mutated.push(textNode);
        }

        const inputs = el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea',
        );
        for (const input of inputs) {
          if (!input.value) continue;
          const didMutate = this.applyTextTransform(input, (orig) =>
            mode === 'redact' ? this.generator.redactText(orig) : this.generator.mockSmartText(orig),
          );
          if (didMutate) mutated.push(input);
        }
      }
    });

    if (mutated.length > 0) {
      this.pushUndoBatch({
        id: `batch-${++this.batchCounter}`,
        label: label ?? `${mode} (${mutated.length})`,
        nodes: mutated,
      });
      this.notify();
    }

    return mutated.length;
  }

  /** Commit an inline text edit on an element's primary text node(s) while snapshotting original text */
  commitInlineEdit(textNode: Text, newText: string): boolean {
    if (this.isCloakShotNode(textNode)) return false;
    const snap = this.ensureSnapshot(textNode);
    if (!snap || snap.kind !== 'text') return false;
    if (newText === textNode.nodeValue && this.maskedNodes.has(textNode)) return false;

    this.withMutationGuard(() => {
      textNode.nodeValue = newText;
      this.lastMaskedValues.set(textNode, newText);
      this.maskedNodes.add(textNode);
      this.activeNodes.add(textNode);
    });

    this.pushUndoBatch({
      id: `batch-${++this.batchCounter}`,
      label: 'Inline edit',
      nodes: [textNode],
    });
    this.notify();
    return true;
  }

  /** Record a Box Mask on the shared Undo stack */
  recordBoxMaskUndo(boxMaskId: string): void {
    this.pushUndoBatch({
      id: `batch-${++this.batchCounter}`,
      label: 'Box mask',
      nodes: [],
      boxMaskId,
    });
    this.notify();
  }

  /** Record a batch of nodes mutated by Auto-Scan */
  recordCategoryBatch(category: ScanCategory, nodes: Node[]): void {
    if (nodes.length === 0) return;
    this.pushUndoBatch({
      id: `batch-${++this.batchCounter}`,
      label: `Auto-Scan: ${category}`,
      nodes,
      category,
    });
    this.notify();
  }

  private pushUndoBatch(batch: UndoBatch): void {
    this.undoStack.push(batch);
  }

  /** Restore a single node to its exact original snapshot */
  private restoreNode(node: Node): void {
    const snap = this.snapshots.get(node);
    if (!snap) return;

    if (snap.kind === 'text' && node.nodeType === Node.TEXT_NODE) {
      node.nodeValue = snap.originalText;
    } else if (
      snap.kind === 'input' &&
      (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)
    ) {
      node.value = snap.originalValue;
      node.placeholder = snap.originalPlaceholder;
    } else if (snap.kind === 'element' && node instanceof HTMLElement) {
      node.style.filter = snap.originalFilter;
      node.style.backgroundColor = snap.originalBackgroundColor;
      node.style.color = snap.originalColor;
      node.style.borderRadius = snap.originalBorderRadius;
    }

    this.maskedNodes.delete(node);
    this.lastMaskedValues.delete(node);
    this.activeNodes.delete(node);
  }

  /** Restore all nodes belonging to a specific Auto-Scan category */
  restoreCategory(category: ScanCategory): number {
    const nodes = this.categoryNodes.get(category);
    if (!nodes || nodes.size === 0) return 0;

    let count = 0;
    this.withMutationGuard(() => {
      for (const node of nodes) {
        this.restoreNode(node);
        count++;
      }
      nodes.clear();
    });

    // Clean matching entries from undo stack
    this.undoStack = this.undoStack.filter((b) => b.category !== category);
    this.notify();
    return count;
  }

  /** Undo the most recent masking action (Cmd/Ctrl + Z) */
  undoLast(): UndoBatch | null {
    const batch = this.undoStack.pop();
    if (!batch) return null;

    if (batch.boxMaskId && this.boxMaskRemover) {
      this.boxMaskRemover(batch.boxMaskId);
    }

    if (batch.nodes.length > 0) {
      this.withMutationGuard(() => {
        for (const node of batch.nodes) {
          this.restoreNode(node);
          if (batch.category) {
            this.categoryNodes.get(batch.category)?.delete(node);
          }
        }
      });
    }

    this.notify();
    return batch;
  }

  /** Instant (<1ms) full restoration of every masked DOM node */
  restoreAll(): number {
    const count = this.activeNodes.size;
    this.withMutationGuard(() => {
      for (const node of this.activeNodes) {
        this.restoreNode(node);
      }
      this.activeNodes.clear();
      this.categoryNodes.clear();
      this.undoStack = [];
    });
    this.generator.resetSession();
    this.notify();
    return count;
  }

  collectTextNodes(root: Node): Text[] {
    const result: Text[] = [];
    const doc = root.ownerDocument ?? document;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const parent = n.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (
          tag === 'SCRIPT' ||
          tag === 'STYLE' ||
          tag === 'NOSCRIPT' ||
          tag === 'TEMPLATE' ||
          tag === 'SVG'
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        if (this.isCloakShotNode(parent)) return NodeFilter.FILTER_REJECT;
        if (!n.nodeValue || n.nodeValue.trim().length === 0) {
          return NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let current: Node | null;
    while ((current = walker.nextNode())) {
      result.push(current as Text);
    }
    return result;
  }
}

export const domEngine = new DomEngine();
