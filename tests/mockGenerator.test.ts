import { describe, expect, it, beforeEach } from 'vitest';
import { MockGenerator, isLikelyIban, isValidLuhn } from '../src/engine/mockGenerator';

describe('MockGenerator', () => {
  let gen: MockGenerator;

  beforeEach(() => {
    gen = new MockGenerator();
  });

  it('produces deterministic session-consistent emails', () => {
    const a = gen.mockEmail('jonas@company.com');
    const b = gen.mockEmail('jonas@company.com');
    const c = gen.mockEmail('JONAS@COMPANY.COM');
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(a).not.toBe('jonas@company.com');
    expect(a).toMatch(/^[a-z]+\.[a-z]+@[a-z]+\.[a-z]+$/);
  });

  it('preserves US and European currency formats, symbols, and separators', () => {
    const usd = gen.mockCurrency('$14,280.50');
    expect(usd).toMatch(/^\$\d{1,3}(,\d{3})*\.\d{2}$/);
    expect(usd).not.toBe('$14,280.50');

    const eurPrefix = gen.mockCurrency('€3.420,00');
    expect(eurPrefix).toMatch(/^€\d{1,3}(\.\d{3})*,00$/);
    expect(eurPrefix).not.toBe('€3.420,00');

    const eurSuffix = gen.mockCurrency('1 250,00 €');
    expect(eurSuffix).toMatch(/^\d{1,3}( \d{3})*,00 €$/);
    expect(eurSuffix).not.toBe('1 250,00 €');
  });

  it('masks IBANs and Luhn-valid credit cards while preserving format', () => {
    expect(isLikelyIban('LT60 1010 0123 4567 8901')).toBe(true);
    const iban = gen.mockIban('LT60 1010 0123 4567 8901');
    expect(iban).toMatch(/^LT60 •••• •••• \d{4}$/);

    expect(isValidLuhn('4242424242424242')).toBe(true);
    expect(isValidLuhn('1234567890123456')).toBe(false);
    const card = gen.mockCreditCard('4242 4242 4242 4242');
    expect(card).toMatch(/^•••• •••• •••• \d{4}$/);
  });

  it('preserves API key prefixes', () => {
    const fakeStripeKey = ['sk', 'live', '51AbCdEfGhIjKlMnOpQrStUv'].join('_');
    const stripe = gen.mockApiKey(fakeStripeKey);
    expect(stripe.startsWith('sk_live_')).toBe(true);
    expect(stripe).not.toBe(fakeStripeKey);

    const fakeGhKey = ['ghp', '1234567890abcdefghijklmnop'].join('_');
    const gh = gen.mockApiKey(fakeGhKey);
    expect(gh.startsWith('ghp_')).toBe(true);
  });

  it('redacts non-whitespace characters with solid block glyphs', () => {
    expect(gen.redactText('Hello World')).toBe('█████ █████');
  });
});
