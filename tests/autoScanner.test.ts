import { describe, expect, it, beforeEach } from 'vitest';
import { AutoScanner } from '../src/engine/autoScanner';
import { DomEngine } from '../src/engine/domEngine';
import { MockGenerator } from '../src/engine/mockGenerator';
import { CLOAKSHOT_HOST_ID } from '../src/shared/constants';

describe('AutoScanner', () => {
  let engine: DomEngine;
  let scanner: AutoScanner;

  beforeEach(() => {
    document.body.innerHTML = '';
    const gen = new MockGenerator();
    engine = new DomEngine(gen);
    scanner = new AutoScanner(engine, gen);
  });

  it('counts emails, amounts, IBANs, API keys, and table Name columns accurately', () => {
    const fakeApiKey = ['sk', 'live', '51AbCdEfGhIjKlMnOpQrStUv'].join('_');
    document.body.innerHTML = `
      <table>
        <thead>
          <tr><th>Customer</th><th>Email</th><th>Revenue</th></tr>
        </thead>
        <tbody>
          <tr><td>Jonas Petrauskas</td><td>jonas@company.com</td><td>$14,280.50</td></tr>
          <tr><td>Maria Silva</td><td>maria@company.com</td><td>€3.420,00</td></tr>
        </tbody>
      </table>
      <p>IBAN: LT60 1010 0123 4567 8901</p>
      <code>${fakeApiKey}</code>
      <div id="${CLOAKSHOT_HOST_ID}">ignored@cloakshot.dev $999.00</div>
    `;

    const counts = scanner.scanCounts(document.body);
    expect(counts.emails).toBe(2);
    expect(counts.amounts).toBe(2);
    expect(counts.ibansCards).toBe(1);
    expect(counts.apiKeys).toBe(1);
    expect(counts.names).toBe(2);

    // Toggle emails on & off
    const mutated = scanner.applyCategory('emails', 'mock', document.body);
    expect(mutated).toBe(2);
    expect(document.body.textContent).not.toContain('jonas@company.com');

    scanner.removeCategory('emails');
    expect(document.body.textContent).toContain('jonas@company.com');
  });
});
