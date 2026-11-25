/**
 * 100% offline, deterministic, format-preserving synthetic data generators
 * for CloakShot's Smart Mock Swap engine.
 */

const FIRST_NAMES = [
  'Alex', 'Sarah', 'Marcus', 'Elena', 'Daniel', 'Priya', 'Liam', 'Maya',
  'Noah', 'Claire', 'Julian', 'Nora', 'Ethan', 'Hannah', 'Lucas', 'Sofia',
  'Owen', 'Amina', 'Caleb', 'Tessa', 'Victor', 'Chloe', 'Adrian', 'Zara',
  'Leo', 'Mina', 'Gabriel', 'Freya', 'Samuel', 'Iris', 'Nathan', 'Eva',
];

const LAST_NAMES = [
  'Mercer', 'Chen', 'Vance', 'Rostova', 'Brooks', 'Patel', 'Keller', 'Lin',
  'Hayes', 'Moreau', 'Sato', 'Bennett', 'Lindqvist', 'Navarro', 'Okafor', 'Reed',
  'Kowalski', 'Sterling', 'Vargas', 'Novak', 'Sinclair', 'Takahashi', 'Hollis', 'Grant',
  'Alvarez', 'Fischer', 'Soren', 'Bauer', 'Kim', 'Wallace', 'Delgado', 'Porter',
];

const DOMAINS = [
  'northstar.io', 'acme.co', 'veridian.dev', 'lumenworks.com',
  'cobaltlabs.io', 'harborline.co', 'meridianhq.com', 'kestrel.app',
  'oakridge.io', 'solstice.dev', 'clearpath.co', 'brightleaf.io',
];

const MOCK_WORDS = [
  'Atlas', 'Beacon', 'Canopy', 'Delta', 'Evergreen', 'Foundry',
  'Granite', 'Horizon', 'Keystone', 'Lantern', 'Mosaic', 'Nimbus',
  'Orbit', 'Pinnacle', 'Quartz', 'Ridgeway', 'Summit', 'Timber',
];

// Regexes exported for Auto-Scan & Smart Mock Swap
export const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

export const API_KEY_REGEX =
  /\b(?:(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{25,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g;

export const IBAN_REGEX =
  /\b[A-Z]{2}\d{2}(?:[ \u00A0-]?[A-Z0-9]{4}){2,7}(?:[ \u00A0-]?[A-Z0-9]{1,4})?\b/g;

export const CARD_REGEX = /\b(?:\d[ -]?){13,19}\b/g;

// Matches prefix currency ($14,280.50, €3.420,00, USD 1,200.00) or suffix currency (1 250,00 €, 3.420,00 EUR)
export const CURRENCY_REGEX =
  /(?:[-+−]?\s?(?:[$€£¥₹]|(?:USD|EUR|GBP|CHF|CAD|AUD|PLN|SEK|NOK|DKK)\s)\s?\d{1,3}(?:[,.\s\u00A0]\d{3})*(?:[.,]\d{1,2})?|[-+−]?\d{1,3}(?:[,.\s\u00A0]\d{3})*(?:[.,]\d{1,2})?\s?(?:[$€£¥₹]|(?:USD|EUR|GBP|CHF|CAD|AUD|PLN|SEK|NOK|DKK)\b))/g;

export const NAME_HEADER_REGEX =
  /\b(name|client|customer|user|contact|owner|author|employee|assignee|member|recipient|sender|person|patient|lead|account\s*holder)\b/i;

const FULL_NAME_PATTERN = /^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'-]{1,20}(?:\s+[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'-]{1,20}){1,2}$/;

/** Fast deterministic FNV-1a 32-bit hash */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Luhn algorithm to avoid false positives on order IDs / phone numbers */
export function isValidLuhn(digitsOnly: string): boolean {
  if (digitsOnly.length < 13 || digitsOnly.length > 19) return false;
  if (/^(\d)\1+$/.test(digitsOnly)) return false;
  let sum = 0;
  let alt = false;
  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    let n = parseInt(digitsOnly[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function isLikelyIban(candidate: string): boolean {
  const compact = candidate.replace(/[\s\u00A0-]/g, '');
  return compact.length >= 15 && compact.length <= 34 && /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(compact);
}

export class MockGenerator {
  private sessionMap = new Map<string, string>();
  private sessionSalt = 1337;

  resetSession(): void {
    this.sessionMap.clear();
  }

  private getOrCreate(key: string, generator: () => string): string {
    const normalized = key.trim();
    const existing = this.sessionMap.get(normalized);
    if (existing !== undefined) return existing;
    const generated = generator();
    this.sessionMap.set(normalized, generated);
    return generated;
  }

  mockEmail(original: string): string {
    return this.getOrCreate(`email:${original.toLowerCase()}`, () => {
      const h = hashString(`${this.sessionSalt}:${original.toLowerCase()}`);
      const first = FIRST_NAMES[h % FIRST_NAMES.length].toLowerCase();
      const last = LAST_NAMES[(h >>> 5) % LAST_NAMES.length].toLowerCase();
      const domain = DOMAINS[(h >>> 10) % DOMAINS.length];
      return `${first}.${last}@${domain}`;
    });
  }

  mockPersonName(original: string): string {
    return this.getOrCreate(`name:${original.toLowerCase()}`, () => {
      const h = hashString(`${this.sessionSalt}:${original.toLowerCase()}`);
      const first = FIRST_NAMES[h % FIRST_NAMES.length];
      const last = LAST_NAMES[(h >>> 6) % LAST_NAMES.length];
      return `${first} ${last}`;
    });
  }

  mockApiKey(original: string): string {
    return this.getOrCreate(`apikey:${original}`, () => {
      const h = hashString(`${this.sessionSalt}:${original}`);
      const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

      if (original.startsWith('eyJ')) {
        return `eyJhbGciOiJIUzI1NiJ9.eyJtb2NrIjoiY2xvYWtzaG90In0.MockSig${(h % 90000) + 10000}`;
      }

      const prefixMatch = original.match(
        /^((?:sk|pk|rk)_(?:live|test)_|gh[pousr]_|github_pat_|xox[baprs]-|AIza|AKIA)/,
      );
      const prefix = prefixMatch ? prefixMatch[1] : original.slice(0, 6);
      const targetLen = Math.min(Math.max(original.length - prefix.length, 10), 20);
      let suffix = 'Mock';
      let seed = h;
      while (suffix.length < targetLen) {
        seed = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
        suffix += alphabet[seed % alphabet.length];
      }
      return `${prefix}${suffix.slice(0, targetLen)}`;
    });
  }

  mockIban(original: string): string {
    return this.getOrCreate(`iban:${original}`, () => {
      const compact = original.replace(/[\s\u00A0-]/g, '');
      const prefix = compact.slice(0, 4);
      const h = hashString(`${this.sessionSalt}:${compact}`);
      const last4 = String(1000 + (h % 9000));
      return `${prefix} •••• •••• ${last4}`;
    });
  }

  mockCreditCard(original: string): string {
    return this.getOrCreate(`card:${original}`, () => {
      const digits = original.replace(/\D/g, '');
      const h = hashString(`${this.sessionSalt}:${digits}`);
      const last4 = String(1000 + (h % 9000));
      return digits.length >= 15 ? `•••• •••• •••• ${last4}` : `•••• ${last4}`;
    });
  }

  /**
   * Preserves exact currency symbol, prefix/suffix placement, sign, thousand separator,
   * decimal separator, and decimal precision.
   * Examples:
   *   $14,280.50   -> $18,940.25
   *   €3.420,00    -> €4.815,00
   *   1 250,00 €   -> 2 140,00 €
   */
  mockCurrency(original: string): string {
    return this.getOrCreate(`currency:${original}`, () => {
      const match = original.match(
        /^([-+−]?\s?(?:[$€£¥₹]|(?:USD|EUR|GBP|CHF|CAD|AUD|PLN|SEK|NOK|DKK)\s)\s?)(\d[\d,.\s\u00A0]*\d|\d)(.*)$|^([-+−]?)(\d[\d,.\s\u00A0]*\d|\d)(\s?(?:[$€£¥₹]|(?:USD|EUR|GBP|CHF|CAD|AUD|PLN|SEK|NOK|DKK)))$/,
      );
      if (!match) return original;

      const prefix = match[1] ?? match[4] ?? '';
      const numStr = match[2] ?? match[5] ?? '';
      const suffix = match[3] ?? match[6] ?? '';

      // Detect decimal separator & thousand separator
      let decimalSep = '';
      let decimalDigits = 0;
      let thousandSep = '';

      const lastDot = numStr.lastIndexOf('.');
      const lastComma = numStr.lastIndexOf(',');
      const hasSpace = /[\s\u00A0]/.test(numStr);

      if (lastDot !== -1 && lastComma !== -1) {
        if (lastDot > lastComma) {
          decimalSep = '.';
          thousandSep = ',';
          decimalDigits = numStr.length - lastDot - 1;
        } else {
          decimalSep = ',';
          thousandSep = '.';
          decimalDigits = numStr.length - lastComma - 1;
        }
      } else if (lastComma !== -1) {
        const after = numStr.length - lastComma - 1;
        if (after === 1 || after === 2) {
          decimalSep = ',';
          decimalDigits = after;
          if (hasSpace) thousandSep = numStr.includes('\u00A0') ? '\u00A0' : ' ';
        } else {
          thousandSep = ',';
        }
      } else if (lastDot !== -1) {
        const after = numStr.length - lastDot - 1;
        if (after === 1 || after === 2) {
          decimalSep = '.';
          decimalDigits = after;
          if (hasSpace) thousandSep = numStr.includes('\u00A0') ? '\u00A0' : ' ';
        } else {
          thousandSep = '.';
        }
      } else if (hasSpace) {
        thousandSep = numStr.includes('\u00A0') ? '\u00A0' : ' ';
      }

      // Parse numeric value
      let cleaned = numStr;
      if (thousandSep) {
        cleaned = cleaned.split(thousandSep).join('');
      }
      if (decimalSep === ',') {
        cleaned = cleaned.replace(',', '.');
      }
      const numericVal = parseFloat(cleaned);
      if (Number.isNaN(numericVal)) return original;

      // Deterministic realistic factor between 0.65x and 1.45x (avoiding identical value)
      const h = hashString(`${this.sessionSalt}:${original}`);
      let factor = 0.68 + ((h % 74) / 100);
      if (Math.abs(factor - 1) < 0.08) factor = 1.23;

      let nextVal = numericVal * factor;
      if (numericVal === 0) nextVal = 0;

      // Preserve exact decimal digit precision (e.g., .00 stays .00 or realistic cents)
      const isRoundWhole = decimalDigits > 0 && Math.abs(numericVal - Math.round(numericVal)) < 0.0001;
      let intPart: number;
      let fracStr = '';

      if (decimalDigits > 0) {
        if (isRoundWhole) {
          intPart = Math.max(1, Math.round(nextVal));
          fracStr = '0'.repeat(decimalDigits);
        } else {
          const fixed = nextVal.toFixed(decimalDigits);
          const [iStr, fStr] = fixed.split('.');
          intPart = parseInt(iStr, 10);
          fracStr = fStr ?? '0'.repeat(decimalDigits);
        }
      } else {
        intPart = numericVal === 0 ? 0 : Math.max(1, Math.round(nextVal));
      }

      let formattedInt = String(intPart);
      if (thousandSep) {
        formattedInt = formattedInt.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSep);
      }

      const formattedNum = decimalDigits > 0 ? `${formattedInt}${decimalSep}${fracStr}` : formattedInt;
      return `${prefix}${formattedNum}${suffix}`;
    });
  }

  /**
   * Smartly mocks any arbitrary string when clicked manually in Smart Mock Swap mode:
   * - Replaces embedded emails, API keys, IBANs, credit cards, and currency amounts.
   * - If none matched, checks if it's a person name or falls back to a clean synthetic placeholder.
   */
  mockSmartText(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return text;

    let replaced = text;
    let didMatchStructured = false;

    replaced = replaced.replace(EMAIL_REGEX, (m) => {
      didMatchStructured = true;
      return this.mockEmail(m);
    });

    replaced = replaced.replace(API_KEY_REGEX, (m) => {
      didMatchStructured = true;
      return this.mockApiKey(m);
    });

    replaced = replaced.replace(IBAN_REGEX, (m) => {
      if (!isLikelyIban(m)) return m;
      didMatchStructured = true;
      return this.mockIban(m);
    });

    replaced = replaced.replace(CARD_REGEX, (m) => {
      const digits = m.replace(/\D/g, '');
      if (!isValidLuhn(digits)) return m;
      didMatchStructured = true;
      return this.mockCreditCard(m);
    });

    replaced = replaced.replace(CURRENCY_REGEX, (m) => {
      didMatchStructured = true;
      return this.mockCurrency(m);
    });

    if (didMatchStructured) return replaced;

    // Standalone person name heuristic
    if (FULL_NAME_PATTERN.test(trimmed)) {
      const leading = text.slice(0, text.indexOf(trimmed));
      const trailing = text.slice(text.indexOf(trimmed) + trimmed.length);
      return `${leading}${this.mockPersonName(trimmed)}${trailing}`;
    }

    // Numeric ID / phone / generic fallback preserving rough shape
    if (/^[\d\s()+-]{6,}$/.test(trimmed)) {
      return this.getOrCreate(`num:${trimmed}`, () => {
        let seed = hashString(`${this.sessionSalt}:${trimmed}`);
        return text.replace(/\d/g, () => {
          seed = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
          return String(seed % 10);
        });
      });
    }

    // Generic realistic label swap preserving leading/trailing whitespace
    return this.getOrCreate(`generic:${trimmed}`, () => {
      const h = hashString(`${this.sessionSalt}:${trimmed}`);
      const leading = text.slice(0, text.indexOf(trimmed));
      const trailing = text.slice(text.indexOf(trimmed) + trimmed.length);
      const wordCount = trimmed.split(/\s+/).length;
      if (wordCount === 1) {
        return `${leading}${MOCK_WORDS[h % MOCK_WORDS.length]}${trailing}`;
      }
      if (wordCount === 2) {
        return `${leading}${this.mockPersonName(trimmed)}${trailing}`;
      }
      const w1 = MOCK_WORDS[h % MOCK_WORDS.length];
      const w2 = MOCK_WORDS[(h >>> 4) % MOCK_WORDS.length];
      return `${leading}${w1} ${w2} Project${trailing}`;
    });
  }

  /** Converts text characters to solid block glyphs preserving whitespace */
  redactText(text: string): string {
    return text.replace(/[^\s]/g, '█');
  }
}

export const mockGenerator = new MockGenerator();
