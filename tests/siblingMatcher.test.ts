import { describe, expect, it, beforeEach } from 'vitest';
import { findMatchingSiblings } from '../src/engine/siblingMatcher';

describe('findMatchingSiblings (Shift+Click Batching)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('selects all cells in the same HTML table column', () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Balance</th></tr></thead>
        <tbody>
          <tr><td>Alice</td><td id="target">a@co.com</td><td>$100</td></tr>
          <tr><td>Bob</td><td>b@co.com</td><td>$200</td></tr>
          <tr><td>Cara</td><td>c@co.com</td><td>$300</td></tr>
        </tbody>
      </table>
    `;

    const target = document.getElementById('target')!;
    const matches = findMatchingSiblings(target);
    expect(matches.map((m) => m.textContent)).toEqual(['a@co.com', 'b@co.com', 'c@co.com']);
  });

  it('selects structurally matching items inside a repeating card list', () => {
    document.body.innerHTML = `
      <ul class="list">
        <li class="row"><h3>Item 1</h3><span id="price1">$12.00</span></li>
        <li class="row"><h3>Item 2</h3><span>$24.00</span></li>
        <li class="row"><h3>Item 3</h3><span>$36.00</span></li>
      </ul>
    `;

    const target = document.getElementById('price1')!;
    const matches = findMatchingSiblings(target);
    expect(matches.map((m) => m.textContent)).toEqual(['$12.00', '$24.00', '$36.00']);
  });
});
