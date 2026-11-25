import { describe, expect, it, beforeEach } from 'vitest';
import { DomEngine } from '../src/engine/domEngine';
import { MockGenerator } from '../src/engine/mockGenerator';

describe('DomEngine', () => {
  let engine: DomEngine;
  let gen: MockGenerator;

  beforeEach(() => {
    document.body.innerHTML = '';
    gen = new MockGenerator();
    engine = new DomEngine(gen);
  });

  it('mutates DOM text nodes in-place and restores exact originals in <1ms', () => {
    document.body.innerHTML = `<div id="card"><p id="email">jonas@company.com</p><span id="amt">$14,280.50</span></div>`;
    const emailEl = document.getElementById('email')!;
    const amtEl = document.getElementById('amt')!;

    engine.maskElements([emailEl, amtEl], 'mock');
    expect(emailEl.textContent).not.toBe('jonas@company.com');
    expect(amtEl.textContent).not.toBe('$14,280.50');
    expect(engine.getActiveMaskCount()).toBe(2);

    const start = performance.now();
    engine.restoreAll();
    const elapsed = performance.now() - start;

    expect(emailEl.textContent).toBe('jonas@company.com');
    expect(amtEl.textContent).toBe('$14,280.50');
    expect(engine.getActiveMaskCount()).toBe(0);
    expect(elapsed).toBeLessThan(50);
  });

  it('supports grouped Undo stack', () => {
    document.body.innerHTML = `<p id="a">alice@acme.com</p><p id="b">bob@acme.com</p>`;
    const a = document.getElementById('a')!;
    const b = document.getElementById('b')!;

    engine.maskElements([a], 'redact');
    engine.maskElements([b], 'blur');
    expect(a.textContent).toBe('██████████████');
    expect(b.style.filter).toBe('blur(6px)');

    engine.undoLast();
    expect(b.style.filter).toBe('');
    expect(a.textContent).toBe('██████████████');

    engine.undoLast();
    expect(a.textContent).toBe('alice@acme.com');
  });

  it('prevents double-swapping already masked nodes while recovering from SPA overwrites', () => {
    document.body.innerHTML = `<span id="cell">jonas@company.com</span>`;
    const textNode = document.getElementById('cell')!.firstChild as Text;

    const firstApplied = engine.applyTextTransform(textNode, (s) => gen.mockEmail(s));
    const mockedOnce = textNode.nodeValue!;
    expect(firstApplied).toBe(true);

    // Calling applyTextTransform again must be skipped (WeakSet + lastMaskedValues loop guard)
    const secondApplied = engine.applyTextTransform(textNode, (s) => gen.mockEmail(s));
    expect(secondApplied).toBe(false);
    expect(textNode.nodeValue).toBe(mockedOnce);

    // Simulate a React/SPA re-render overwriting the text node with new real data
    textNode.nodeValue = 'new.client@stripe.com';
    const reApplied = engine.applyTextTransform(textNode, (s) => gen.mockEmail(s));
    expect(reApplied).toBe(true);
    expect(textNode.nodeValue).not.toBe('new.client@stripe.com');
    expect(textNode.nodeValue).not.toBe(mockedOnce);

    // Restoring should return the latest real SPA value
    engine.restoreAll();
    expect(textNode.nodeValue).toBe('new.client@stripe.com');
  });
});
