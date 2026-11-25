import type { ScanCategory, ScanCounts } from '../shared/types';
import { DomEngine, domEngine } from './domEngine';
import {
  API_KEY_REGEX,
  CARD_REGEX,
  CURRENCY_REGEX,
  EMAIL_REGEX,
  IBAN_REGEX,
  isLikelyIban,
  isValidLuhn,
  MockGenerator,
  mockGenerator,
  NAME_HEADER_REGEX,
} from './mockGenerator';

const FULL_NAME_CELL_REGEX = /^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'-]{1,20}(?:\s+[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'-]{1,20}){1,2}$/;

function resetRegex(re: RegExp): RegExp {
  re.lastIndex = 0;
  return re;
}

function isInNameColumn(node: Node): boolean {
  const el = node instanceof HTMLElement ? node : node.parentElement;
  if (!el) return false;
  const cell = el.closest('td, [role="gridcell"], [role="cell"]');
  if (!cell) return false;

  // Standard HTML <table>
  if (cell.tagName === 'TD') {
    const td = cell as HTMLTableCellElement;
    const table = td.closest('table');
    if (!table) return false;
    const colIdx = td.cellIndex;
    const headerRow = table.querySelector('thead tr') ?? table.querySelector('tr');
    const headerCell = headerRow?.children[colIdx];
    return Boolean(headerCell && NAME_HEADER_REGEX.test(headerCell.textContent ?? ''));
  }

  // ARIA grid
  const row = cell.closest('[role="row"]');
  const grid = cell.closest('[role="grid"], [role="table"]');
  if (!row || !grid) return false;
  const cells = Array.from(row.querySelectorAll('[role="gridcell"], [role="cell"]'));
  const colIdx = cells.indexOf(cell);
  if (colIdx < 0) return false;
  const headers = grid.querySelectorAll('[role="columnheader"]');
  const headerCell = headers[colIdx];
  return Boolean(headerCell && NAME_HEADER_REGEX.test(headerCell.textContent ?? ''));
}

export class AutoScanner {
  constructor(
    private engine: DomEngine = domEngine,
    private generator: MockGenerator = mockGenerator,
  ) {}

  /** Scan a DOM subtree and return live counts for each sensitive category */
  scanCounts(root: Node = document.body): ScanCounts {
    const counts: ScanCounts = {
      emails: 0,
      amounts: 0,
      ibansCards: 0,
      apiKeys: 0,
      names: 0,
    };

    if (!root) return counts;

    const textNodes = this.engine.collectTextNodes(root);
    for (const node of textNodes) {
      const text = node.nodeValue ?? '';
      this.countInText(text, node, counts);
    }

    if (root instanceof HTMLElement || root instanceof Document) {
      const inputs = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="password"]), textarea',
      );
      for (const input of inputs) {
        if (this.engine.isCloakShotNode(input) || !input.value) continue;
        this.countInText(input.value, input, counts);
      }
    }

    return counts;
  }

  private countInText(text: string, node: Node, counts: ScanCounts): void {
    const emails = text.match(resetRegex(EMAIL_REGEX));
    if (emails) counts.emails += emails.length;

    const apiKeys = text.match(resetRegex(API_KEY_REGEX));
    if (apiKeys) counts.apiKeys += apiKeys.length;

    const ibans = text.match(resetRegex(IBAN_REGEX));
    if (ibans) {
      for (const candidate of ibans) {
        if (isLikelyIban(candidate)) counts.ibansCards++;
      }
    }

    const cards = text.match(resetRegex(CARD_REGEX));
    if (cards) {
      for (const candidate of cards) {
        if (isValidLuhn(candidate.replace(/\D/g, ''))) counts.ibansCards++;
      }
    }

    const amounts = text.match(resetRegex(CURRENCY_REGEX));
    if (amounts) counts.amounts += amounts.length;

    const trimmed = text.trim();
    if (trimmed.length >= 4 && trimmed.length <= 48) {
      if (isInNameColumn(node) && !trimmed.includes('@') && !/\d/.test(trimmed)) {
        counts.names++;
      } else if (FULL_NAME_CELL_REGEX.test(trimmed) && node.parentElement?.closest('table, [role="grid"]')) {
        counts.names++;
      }
    }
  }

  /** Apply a specific Auto-Scan category across `root` (defaults to document.body) */
  applyCategory(
    category: ScanCategory,
    style: 'mock' | 'redact' | 'blur' = 'mock',
    root: Node = document.body,
  ): number {
    if (!root) return 0;
    const mutated: Node[] = [];

    const transformText = (original: string, node: Node): string => {
      switch (category) {
        case 'emails':
          return original.replace(resetRegex(EMAIL_REGEX), (m) =>
            style === 'redact' ? this.generator.redactText(m) : this.generator.mockEmail(m),
          );

        case 'apiKeys':
          return original.replace(resetRegex(API_KEY_REGEX), (m) =>
            style === 'redact' ? this.generator.redactText(m) : this.generator.mockApiKey(m),
          );

        case 'ibansCards': {
          let next = original.replace(resetRegex(IBAN_REGEX), (m) => {
            if (!isLikelyIban(m)) return m;
            return style === 'redact' ? this.generator.redactText(m) : this.generator.mockIban(m);
          });
          next = next.replace(resetRegex(CARD_REGEX), (m) => {
            if (!isValidLuhn(m.replace(/\D/g, ''))) return m;
            return style === 'redact'
              ? this.generator.redactText(m)
              : this.generator.mockCreditCard(m);
          });
          return next;
        }

        case 'amounts':
          return original.replace(resetRegex(CURRENCY_REGEX), (m) =>
            style === 'redact' ? this.generator.redactText(m) : this.generator.mockCurrency(m),
          );

        case 'names': {
          const trimmed = original.trim();
          if (
            trimmed.length >= 4 &&
            trimmed.length <= 48 &&
            !trimmed.includes('@') &&
            !/\d/.test(trimmed) &&
            (isInNameColumn(node) ||
              (FULL_NAME_CELL_REGEX.test(trimmed) &&
                Boolean(node.parentElement?.closest('table, [role="grid"]'))))
          ) {
            const leading = original.slice(0, original.indexOf(trimmed));
            const trailing = original.slice(original.indexOf(trimmed) + trimmed.length);
            const swapped =
              style === 'redact'
                ? this.generator.redactText(trimmed)
                : this.generator.mockPersonName(trimmed);
            return `${leading}${swapped}${trailing}`;
          }
          return original;
        }
      }
    };

    const textNodes = this.engine.collectTextNodes(root);
    for (const node of textNodes) {
      if (style === 'blur') {
        const original = node.nodeValue ?? '';
        const preview = transformText(original, node);
        if (preview !== original && node.parentElement) {
          this.engine.maskElements([node.parentElement], 'blur', `Auto-Scan: ${category}`);
          mutated.push(node.parentElement);
        }
      } else {
        const didMutate = this.engine.applyTextTransform(
          node,
          (orig) => transformText(orig, node),
          category,
        );
        if (didMutate) mutated.push(node);
      }
    }

    if (root instanceof HTMLElement || root instanceof Document) {
      const inputs = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="password"]), textarea',
      );
      for (const input of inputs) {
        if (this.engine.isCloakShotNode(input) || !input.value) continue;
        const didMutate = this.engine.applyTextTransform(
          input,
          (orig) => transformText(orig, input),
          category,
        );
        if (didMutate) mutated.push(input);
      }
    }

    if (style !== 'blur' && mutated.length > 0) {
      this.engine.recordCategoryBatch(category, mutated);
    }

    return mutated.length;
  }

  removeCategory(category: ScanCategory): number {
    return this.engine.restoreCategory(category);
  }
}

export const autoScanner = new AutoScanner();
