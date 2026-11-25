import type { ScanCategory } from '../shared/types';
import { AutoScanner, autoScanner } from './autoScanner';
import { DomEngine, domEngine } from './domEngine';

/**
 * Live Screen-Share Shield:
 * Watches DOM mutations (SPA navigation, modals, paginated tables, React re-renders)
 * and applies active Auto-Scan categories in real time while ignoring CloakShot's own writes.
 */
export class LiveShield {
  private observer: MutationObserver | null = null;
  private active = false;
  private categories = new Set<ScanCategory>();
  private style: 'mock' | 'redact' | 'blur' = 'mock';
  private pendingNodes = new Set<Node>();
  private flushTimer: number | null = null;

  constructor(
    private engine: DomEngine = domEngine,
    private scanner: AutoScanner = autoScanner,
  ) {}

  isActive(): boolean {
    return this.active;
  }

  updateConfig(categories: ScanCategory[], style: 'mock' | 'redact' | 'blur'): void {
    this.categories = new Set(categories);
    this.style = style;
  }

  start(categories: ScanCategory[], style: 'mock' | 'redact' | 'blur' = 'mock'): void {
    this.updateConfig(categories, style);
    if (this.active) return;

    this.active = true;
    this.observer = new MutationObserver((mutations) => {
      // Guard against re-masking loops caused by CloakShot's own mutations
      if (this.engine.isMutating || this.categories.size === 0) return;

      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const added of m.addedNodes) {
            if (!this.engine.isCloakShotNode(added)) {
              this.pendingNodes.add(added);
            }
          }
        } else if (m.type === 'characterData') {
          const target = m.target;
          if (!this.engine.isCloakShotNode(target) && !this.engine.isNodeMaskedAndUnchanged(target)) {
            this.pendingNodes.add(target.parentElement ?? target);
          }
        }
      }

      if (this.pendingNodes.size > 0 && this.flushTimer === null) {
        this.flushTimer = window.setTimeout(() => this.flush(), 90);
      }
    });

    if (document.body) {
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
  }

  private flush(): void {
    this.flushTimer = null;
    if (!this.active || this.categories.size === 0) {
      this.pendingNodes.clear();
      return;
    }

    const targets = Array.from(this.pendingNodes);
    this.pendingNodes.clear();

    for (const node of targets) {
      if (!node.isConnected) continue;
      for (const cat of this.categories) {
        this.scanner.applyCategory(cat, this.style, node);
      }
    }
  }

  stop(): void {
    this.active = false;
    if (this.flushTimer !== null) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingNodes.clear();
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

export const liveShield = new LiveShield();
