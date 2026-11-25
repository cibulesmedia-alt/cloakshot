import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { deflateSync, inflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const outDir = join(rootDir, 'store-assets');
mkdirSync(outDir, { recursive: true });

// Locate headless Chromium/Edge binary
function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error('Could not find Chrome or Edge executable to render store assets.');
}

// --- Pure Node PNG RGBA -> 24-bit RGB (no alpha, color type 2) converter ---
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[i] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function convertTo24BitOpaquePng(pngBuffer, expectedW, expectedH) {
  let pos = 8; // skip PNG signature
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (pos < pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(pos);
    const type = pngBuffer.toString('ascii', pos + 4, pos + 8);
    const data = pngBuffer.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    }
    pos += 12 + length;
  }

  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idatChunks));
  const recon = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const rowIn = y * (stride + 1) + 1;
    const rowOut = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? recon[rowOut + x - bpp] : 0;
      const b = y > 0 ? recon[rowOut - stride + x] : 0;
      const c = x >= bpp && y > 0 ? recon[rowOut - stride + x - bpp] : 0;
      const val = raw[rowIn + x];
      let outByte = val;
      if (filter === 1) outByte = (val + a) & 0xff;
      else if (filter === 2) outByte = (val + b) & 0xff;
      else if (filter === 3) outByte = (val + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) outByte = (val + paeth(a, b, c)) & 0xff;
      recon[rowOut + x] = outByte;
    }
  }

  // Crop/pad to exact expectedW x expectedH and strip alpha channel (24-bit RGB colorType 2)
  const outW = expectedW;
  const outH = expectedH;
  const outRaw = Buffer.alloc(outH * (outW * 3 + 1));

  for (let y = 0; y < outH; y++) {
    const dstRow = y * (outW * 3 + 1);
    outRaw[dstRow] = 0; // Filter None
    const sy = Math.min(y, height - 1);
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(x, width - 1);
      const srcIdx = sy * stride + sx * bpp;
      const dstIdx = dstRow + 1 + x * 3;
      if (bpp === 4) {
        const a = recon[srcIdx + 3] / 255;
        // Composite against solid #020617 background
        outRaw[dstIdx] = Math.round(recon[srcIdx] * a + 2 * (1 - a));
        outRaw[dstIdx + 1] = Math.round(recon[srcIdx + 1] * a + 6 * (1 - a));
        outRaw[dstIdx + 2] = Math.round(recon[srcIdx + 2] * a + 23 * (1 - a));
      } else {
        outRaw[dstIdx] = recon[srcIdx];
        outRaw[dstIdx + 1] = recon[srcIdx + 1];
        outRaw[dstIdx + 2] = recon[srcIdx + 2];
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(outW, 0);
  ihdr.writeUInt32BE(outH, 4);
  ihdr[8] = 8; // bit depth 8
  ihdr[9] = 2; // color type 2 = Truecolor RGB (24-bit, NO alpha)
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(outRaw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Shared HTML/CSS design primitives ---
const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100%; height: 100%; overflow: hidden;
    font-family: 'Segoe UI', Inter, -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
    background: #020617; color: #f8fafc;
    -webkit-font-smoothing: antialiased;
  }
  .mono { font-family: 'Cascadia Mono', 'JetBrains Mono', Consolas, monospace; }
  .logo-mark {
    width: 44px; height: 44px; border-radius: 12px;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #312e81 100%);
    border: 1.5px solid rgba(56,189,248,0.45);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 8px 24px rgba(56,189,248,0.25);
  }
  .toolbar {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 12px; border-radius: 16px;
    background: rgba(2, 6, 23, 0.94);
    border: 1px solid rgba(100, 116, 139, 0.5);
    box-shadow: 0 20px 50px rgba(2, 6, 23, 0.75);
    font-size: 13px; color: #e2e8f0;
  }
  .tb-pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 11px; border-radius: 10px; font-weight: 600;
    background: rgba(15, 23, 42, 0.9); color: #cbd5e1;
  }
  .tb-pill.active { background: #38bdf8; color: #020617; }
  .tb-pill.emerald { background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(52, 211, 153, 0.45); color: #a7f3d0; }
  .tb-pill.sky { background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.45); color: #bae6fd; }
  .kbd {
    font-size: 10px; padding: 1px 5px; border-radius: 4px;
    background: rgba(148,163,184,0.2); font-family: Consolas, monospace;
  }
  .tb-pill.active .kbd { background: rgba(2,6,23,0.18); color: #020617; }
  .dot-live { width: 8px; height: 8px; border-radius: 99px; background: #34d399; box-shadow: 0 0 10px #34d399; }
`;

const LOGO_SVG = `
  <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="11" stroke="#38bdf8" stroke-width="3.5"/>
    <circle cx="16" cy="16" r="4.5" fill="#f8fafc"/>
  </svg>
`;

const ASSETS = [
  {
    name: 'promo-tile-440x280.png',
    width: 440,
    height: 280,
    html: `<!doctype html><html><head><style>${BASE_CSS}
      .canvas {
        width: 440px; height: 280px; position: relative; padding: 28px 30px;
        background:
          radial-gradient(circle at 85% 15%, rgba(56,189,248,0.26) 0%, transparent 55%),
          radial-gradient(circle at 10% 90%, rgba(99,102,241,0.24) 0%, transparent 55%),
          linear-gradient(145deg, #020617 0%, #0f172a 55%, #1e1b4b 100%);
        display: flex; flex-direction: column; justify-content: space-between;
      }
      .top { display: flex; align-items: center; gap: 12px; }
      .brand { font-size: 26px; font-weight: 800; letter-spacing: -0.03em; color: #fff; }
      .tagline { font-size: 20px; font-weight: 700; line-height: 1.25; color: #f1f5f9; letter-spacing: -0.02em; max-width: 360px; }
      .tagline span { color: #38bdf8; }
      .chips { display: flex; gap: 8px; flex-wrap: wrap; }
      .chip {
        font-size: 11px; font-weight: 600; padding: 5px 10px; border-radius: 99px;
        background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(148, 163, 184, 0.25); color: #cbd5e1;
      }
      .chip.green { border-color: rgba(52,211,153,0.45); color: #6ee7b7; background: rgba(16,185,129,0.12); }
    </style></head><body>
      <div class="canvas">
        <div class="top">
          <div class="logo-mark">${LOGO_SVG}</div>
          <div>
            <div class="brand">CloakShot</div>
            <div style="font-size:11px;color:#94a3b8;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Privacy &amp; Demo Studio</div>
          </div>
        </div>
        <div class="tagline">Blur, Redact &amp; <span>Mock Swap</span> Before Screenshot</div>
        <div class="chips">
          <div class="chip green">100% Browser-Local</div>
          <div class="chip mono">Alt+Shift+C</div>
          <div class="chip">Scroll Capture</div>
        </div>
      </div>
    </body></html>`,
  },
  {
    name: 'screenshot-1-mock-swap-1280x800.png',
    width: 1280,
    height: 800,
    html: `<!doctype html><html><head><style>${BASE_CSS}
      .canvas {
        width: 1280px; height: 800px; padding: 38px 54px;
        background:
          radial-gradient(circle at 50% 0%, rgba(56,189,248,0.18) 0%, transparent 50%),
          linear-gradient(160deg, #020617 0%, #0f172a 60%, #172554 100%);
        display: flex; flex-direction: column; gap: 24px;
      }
      .hero { text-align: center; }
      .eyebrow {
        display: inline-block; padding: 5px 14px; border-radius: 99px; margin-bottom: 10px;
        background: rgba(56,189,248,0.14); border: 1px solid rgba(56,189,248,0.35);
        color: #7dd3fc; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
      }
      h1 { font-size: 38px; font-weight: 800; letter-spacing: -0.03em; color: #fff; margin-bottom: 6px; }
      .sub { font-size: 16px; color: #94a3b8; }
      .tb-wrap { display: flex; justify-content: center; }
      .split { display: grid; grid-template-columns: 1fr 48px 1fr; align-items: center; gap: 12px; flex: 1; }
      .panel {
        background: rgba(15, 23, 42, 0.92); border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 18px; overflow: hidden; box-shadow: 0 24px 60px rgba(2,6,23,0.65);
      }
      .panel.after { border-color: rgba(56, 189, 248, 0.55); box-shadow: 0 24px 60px rgba(56,189,248,0.16); }
      .p-head {
        display: flex; justify-content: space-between; align-items: center;
        padding: 14px 20px; border-bottom: 1px solid rgba(148,163,184,0.14);
        background: rgba(2,6,23,0.55);
      }
      .p-title { font-size: 14px; font-weight: 700; color: #f8fafc; }
      .tag { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 99px; }
      .tag.real { background: rgba(244,63,94,0.18); color: #fda4af; border: 1px solid rgba(244,63,94,0.35); }
      .tag.mock { background: rgba(16,185,129,0.18); color: #6ee7b7; border: 1px solid rgba(52,211,153,0.4); }
      table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      th { text-align: left; padding: 12px 18px; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid rgba(148,163,184,0.12); }
      td { padding: 14px 18px; border-bottom: 1px solid rgba(148,163,184,0.08); color: #e2e8f0; }
      tr:last-child td { border-bottom: none; }
      .hl-real { background: rgba(244,63,94,0.12); color: #fecdd3; padding: 3px 7px; border-radius: 6px; }
      .hl-mock { background: rgba(56,189,248,0.16); color: #bae6fd; padding: 3px 7px; border-radius: 6px; border: 1px solid rgba(56,189,248,0.3); }
      .arrow {
        width: 44px; height: 44px; border-radius: 99px; margin: 0 auto;
        background: linear-gradient(135deg, #38bdf8, #6366f1); color: #020617;
        display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900;
        box-shadow: 0 8px 24px rgba(56,189,248,0.4);
      }
      .footer-note { display: flex; justify-content: center; gap: 28px; color: #94a3b8; font-size: 13px; font-weight: 500; }
      .footer-note strong { color: #e2e8f0; }
    </style></head><body>
      <div class="canvas">
        <div class="hero">
          <div class="eyebrow">Smart Mock Swap • Zero-Drift DOM Engine</div>
          <h1>Clean Synthetic Data. Zero Ugly Black Bars.</h1>
          <div class="sub">Replace real emails, currency amounts, IBANs &amp; names in-place with realistic, format-preserving mocks—100% offline.</div>
        </div>

        <div class="tb-wrap">
          <div class="toolbar">
            <div class="tb-pill active">✦ Mock <span class="kbd">1</span></div>
            <div class="tb-pill">■ Redact <span class="kbd">2</span></div>
            <div class="tb-pill">◉ Blur <span class="kbd">3</span></div>
            <div class="tb-pill">▢ Box <span class="kbd">4</span></div>
            <div style="width:1px;height:20px;background:#1e293b;margin:0 4px;"></div>
            <div class="tb-pill emerald"><span class="dot-live"></span> Shield 4</div>
            <div class="tb-pill sky">📷 Capture</div>
            <div class="tb-pill mono" style="color:#7dd3fc;">12</div>
          </div>
        </div>

        <div class="split">
          <div class="panel">
            <div class="p-head">
              <div class="p-title">Acme Billing — Customer Payouts</div>
              <div class="tag real">Original Page</div>
            </div>
            <table>
              <thead><tr><th>Customer</th><th>Email</th><th>Amount</th></tr></thead>
              <tbody>
                <tr><td>Jonas Petrauskas</td><td><span class="hl-real mono">jonas@company.com</span></td><td><span class="hl-real mono">$14,280.50</span></td></tr>
                <tr><td>Maria Silva</td><td><span class="hl-real mono">maria@fintech.eu</span></td><td><span class="hl-real mono">€3.420,00</span></td></tr>
                <tr><td>Jonas Petrauskas</td><td><span class="hl-real mono">jonas@company.com</span></td><td><span class="hl-real mono">1 250,00 €</span></td></tr>
                <tr><td>IBAN Payout</td><td colspan="2"><span class="hl-real mono">LT60 1010 0123 4567 8901</span></td></tr>
              </tbody>
            </table>
          </div>

          <div class="arrow">→</div>

          <div class="panel after">
            <div class="p-head">
              <div class="p-title">Acme Billing — Customer Payouts</div>
              <div class="tag mock">Smart Mock Swapped</div>
            </div>
            <table>
              <thead><tr><th>Customer</th><th>Email</th><th>Amount</th></tr></thead>
              <tbody>
                <tr><td><span class="hl-mock">Alex Mercer</span></td><td><span class="hl-mock mono">alex.mercer@northstar.io</span></td><td><span class="hl-mock mono">$18,940.25</span></td></tr>
                <tr><td><span class="hl-mock">Sarah Chen</span></td><td><span class="hl-mock mono">sarah.chen@acme.co</span></td><td><span class="hl-mock mono">€4.815,00</span></td></tr>
                <tr><td><span class="hl-mock">Alex Mercer</span></td><td><span class="hl-mock mono">alex.mercer@northstar.io</span></td><td><span class="hl-mock mono">2 140,00 €</span></td></tr>
                <tr><td>IBAN Payout</td><td colspan="2"><span class="hl-mock mono">LT60 •••• •••• 4821</span></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="footer-note">
          <span>✓ <strong>Session-Consistent:</strong> Same email always swaps identically</span>
          <span>✓ <strong>Format-Preserving:</strong> Keeps $, €, separators &amp; decimals</span>
          <span>✓ <strong>&lt;1ms Restore:</strong> Press Esc twice to revert instantly</span>
        </div>
      </div>
    </body></html>`,
  },
  {
    name: 'screenshot-2-scroll-capture-1280x800.png',
    width: 1280,
    height: 800,
    html: `<!doctype html><html><head><style>${BASE_CSS}
      .canvas {
        width: 1280px; height: 800px; padding: 38px 54px;
        background:
          radial-gradient(circle at 80% 10%, rgba(139,92,246,0.22) 0%, transparent 50%),
          radial-gradient(circle at 20% 90%, rgba(56,189,248,0.18) 0%, transparent 50%),
          linear-gradient(160deg, #020617 0%, #0f172a 60%, #1e1b4b 100%);
        display: flex; flex-direction: column; gap: 26px;
      }
      .hero { text-align: center; }
      .eyebrow {
        display: inline-block; padding: 5px 14px; border-radius: 99px; margin-bottom: 10px;
        background: rgba(139,92,246,0.18); border: 1px solid rgba(167,139,250,0.4);
        color: #ddd6fe; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
      }
      h1 { font-size: 38px; font-weight: 800; letter-spacing: -0.03em; color: #fff; margin-bottom: 6px; }
      .sub { font-size: 16px; color: #94a3b8; }
      .grid { display: grid; grid-template-columns: 380px 1fr; gap: 28px; flex: 1; align-items: stretch; }
      .popover {
        background: rgba(2, 6, 23, 0.94); border: 1px solid rgba(100,116,139,0.45);
        border-radius: 20px; padding: 20px; display: flex; flex-direction: column; gap: 14px;
        box-shadow: 0 24px 60px rgba(2,6,23,0.7);
      }
      .pop-head { display: flex; justify-content: space-between; align-items: center; }
      .seg { display: flex; background: #0f172a; border: 1px solid #1e293b; border-radius: 10px; padding: 3px; gap: 4px; font-size: 12px; font-weight: 700; }
      .seg span { padding: 4px 10px; border-radius: 7px; color: #94a3b8; }
      .seg span.on { background: #38bdf8; color: #020617; }
      .cap-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .cap-card {
        background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 14px;
        display: flex; flex-direction: column; gap: 5px;
      }
      .cap-card.featured { border-color: rgba(56,189,248,0.55); background: rgba(56,189,248,0.08); }
      .cap-card .t { font-size: 13.5px; font-weight: 700; color: #f8fafc; }
      .cap-card .d { font-size: 11.5px; color: #94a3b8; }
      .toggle-row {
        display: flex; justify-content: space-between; align-items: center;
        padding: 11px 14px; border-radius: 12px; background: #0f172a; border: 1px solid #1e293b; font-size: 13px;
      }
      .on-pill { font-size: 11px; font-weight: 800; color: #34d399; }
      .stage {
        position: relative; border-radius: 20px; padding: 26px;
        background: linear-gradient(145deg, #0f172a, #1e293b 50%, #1e1b4b);
        border: 1px solid rgba(148,163,184,0.22);
        display: flex; flex-direction: column; align-items: center; justify-content: space-between;
        box-shadow: 0 24px 60px rgba(2,6,23,0.65);
      }
      .hud {
        display: inline-flex; align-items: center; gap: 14px;
        padding: 10px 20px; border-radius: 99px;
        background: rgba(2, 6, 23, 0.96); border: 1.5px solid rgba(56,189,248,0.6);
        box-shadow: 0 14px 40px rgba(2,6,23,0.8); font-size: 14px; font-weight: 600;
      }
      .rec-dot { width: 10px; height: 10px; border-radius: 99px; background: #f43f5e; box-shadow: 0 0 12px #f43f5e; }
      .px-badge { padding: 3px 10px; border-radius: 99px; background: #1e293b; color: #7dd3fc; font-size: 13px; }
      .btn-done { padding: 6px 14px; border-radius: 99px; background: #10b981; color: #020617; font-weight: 800; font-size: 13px; }
      .btn-cancel { padding: 6px 12px; border-radius: 99px; background: #1e293b; color: #cbd5e1; font-size: 13px; }
      .framed-shot {
        width: 100%; flex: 1; margin-top: 20px; border-radius: 14px;
        background: #020617; border: 1px solid rgba(255,255,255,0.14);
        box-shadow: 0 24px 50px rgba(2,6,23,0.85); padding: 20px;
        display: flex; flex-direction: column; gap: 12px;
      }
      .bar-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-radius: 10px; background: #0f172a; border: 1px solid #1e293b; font-size: 13px; }
      .slice-line { border-top: 1.5px dashed rgba(56,189,248,0.45); position: relative; margin: 2px 0; }
      .slice-tag { position: absolute; right: 10px; top: -10px; background: #020617; color: #38bdf8; font-size: 10px; padding: 1px 8px; border-radius: 99px; border: 1px solid rgba(56,189,248,0.35); }
      .toast {
        margin-top: 14px; padding: 8px 16px; border-radius: 99px;
        background: rgba(2,6,23,0.95); border: 1px solid rgba(52,211,153,0.45);
        color: #a7f3d0; font-size: 12.5px; font-weight: 600;
      }
    </style></head><body>
      <div class="canvas">
        <div class="hero">
          <div class="eyebrow">Dual Scrolling Screenshot Engine</div>
          <h1>1-Click Auto Full-Page + Interactive Scroll-Stitch</h1>
          <div class="sub">Auto-hides repeating sticky headers, detects SPA scroll containers, adds Clean Frame &amp; copies PNG in 1 click.</div>
        </div>

        <div class="grid">
          <div class="popover">
            <div class="pop-head">
              <span style="font-size:15px;font-weight:700;">Capture Studio</span>
              <div class="seg"><span class="on">Copy</span><span>PNG</span></div>
            </div>
            <div class="cap-grid">
              <div class="cap-card"><div class="t">📷 Visible</div><div class="d">Current viewport</div></div>
              <div class="cap-card"><div class="t">✂ Area / Card</div><div class="d">Click or drag box</div></div>
              <div class="cap-card featured"><div class="t">📜 Auto Full-Page</div><div class="d">1-click scroll stitch</div></div>
              <div class="cap-card featured"><div class="t">✦ Scroll &amp; Capture</div><div class="d">Manual live stitch</div></div>
            </div>
            <div class="toggle-row"><span>🖼 Clean Frame Backdrop</span><span class="on-pill">ON</span></div>
            <div class="toggle-row"><span>↺ Auto-Restore after Capture</span><span class="on-pill">ON</span></div>
            <div style="margin-top:auto;font-size:12px;color:#94a3b8;line-height:1.5;padding-top:8px;border-top:1px solid #1e293b;">
              • Works on nested SPA scroll containers (Stripe, Linear, Gmail)<br/>
              • GPU-safe 15,000px height cap
            </div>
          </div>

          <div class="stage">
            <div class="hud">
              <span class="rec-dot"></span>
              <span>Capturing scroll...</span>
              <span class="px-badge mono">4,280 px</span>
              <span class="btn-done">✓ Done</span>
              <span class="btn-cancel">✕ Cancel</span>
            </div>

            <div class="framed-shot">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:700;font-size:14px;">Q4 Financial Overview — Clean Frame Preview</span>
                <span class="mono" style="font-size:11px;color:#38bdf8;">Sticky header hidden after frame 0</span>
              </div>
              <div class="bar-row"><span>Enterprise ARR (Mocked)</span><span class="mono" style="color:#7dd3fc;">$148,920.00</span></div>
              <div class="bar-row"><span>Primary Contact</span><span class="mono" style="color:#7dd3fc;">sarah.chen@acme.co</span></div>
              <div class="slice-line"><span class="slice-tag mono">Live Stitch Slice #2</span></div>
              <div class="bar-row"><span>Payout Account (IBAN)</span><span class="mono" style="color:#7dd3fc;">LT60 •••• •••• 4821</span></div>
              <div class="bar-row"><span>Net Revenue Retention</span><span class="mono" style="color:#6ee7b7;">124.8%</span></div>
            </div>

            <div class="toast">✓ Copied to clipboard &amp; original page restored in &lt;1ms</div>
          </div>
        </div>
      </div>
    </body></html>`,
  },
  {
    name: 'screenshot-3-auto-scan-1280x800.png',
    width: 1280,
    height: 800,
    html: `<!doctype html><html><head><style>${BASE_CSS}
      .canvas {
        width: 1280px; height: 800px; padding: 38px 54px;
        background:
          radial-gradient(circle at 20% 10%, rgba(16,185,129,0.2) 0%, transparent 50%),
          radial-gradient(circle at 85% 90%, rgba(56,189,248,0.18) 0%, transparent 50%),
          linear-gradient(160deg, #020617 0%, #0f172a 60%, #064e3b 140%);
        display: flex; flex-direction: column; gap: 26px;
      }
      .hero { text-align: center; }
      .eyebrow {
        display: inline-block; padding: 5px 14px; border-radius: 99px; margin-bottom: 10px;
        background: rgba(16,185,129,0.16); border: 1px solid rgba(52,211,153,0.4);
        color: #6ee7b7; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
      }
      h1 { font-size: 38px; font-weight: 800; letter-spacing: -0.03em; color: #fff; margin-bottom: 6px; }
      .sub { font-size: 16px; color: #94a3b8; }
      .layout { display: grid; grid-template-columns: 1fr 370px; gap: 28px; flex: 1; }
      .app-card {
        background: rgba(15, 23, 42, 0.92); border: 1px solid rgba(148,163,184,0.2);
        border-radius: 20px; padding: 24px; display: flex; flex-direction: column; gap: 16px;
        box-shadow: 0 24px 60px rgba(2,6,23,0.65);
      }
      .kv { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-radius: 12px; background: #020617; border: 1px solid #1e293b; }
      .kv-label { font-size: 13px; color: #94a3b8; font-weight: 600; }
      .kv-val { font-size: 13.5px; color: #bae6fd; background: rgba(56,189,248,0.14); border: 1px solid rgba(56,189,248,0.3); padding: 4px 10px; border-radius: 8px; }
      .kv-redact { font-size: 13.5px; color: #e2e8f0; background: #1e293b; padding: 4px 10px; border-radius: 8px; letter-spacing: 1px; }
      .shield-pop {
        background: rgba(2, 6, 23, 0.95); border: 1px solid rgba(52,211,153,0.45);
        border-radius: 20px; padding: 20px; display: flex; flex-direction: column; gap: 11px;
        box-shadow: 0 24px 60px rgba(2,6,23,0.75);
      }
      .cat-row {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 14px; border-radius: 12px; font-size: 13.5px; font-weight: 600;
        background: rgba(56,189,248,0.14); border: 1px solid rgba(56,189,248,0.4); color: #e0f2fe;
      }
      .cat-row.off { background: #0f172a; border-color: #1e293b; color: #94a3b8; }
      .cnt { padding: 2px 9px; border-radius: 99px; background: #0f172a; color: #e2e8f0; font-size: 11.5px; }
      .live-box {
        display: flex; justify-content: space-between; align-items: center;
        padding: 12px 14px; border-radius: 12px; margin-top: 6px;
        background: rgba(16,185,129,0.18); border: 1px solid rgba(52,211,153,0.5);
        color: #a7f3d0; font-size: 13px; font-weight: 700;
      }
      .save-btn {
        text-align: center; padding: 11px; border-radius: 12px;
        background: #1e293b; border: 1px solid #334155; color: #f8fafc; font-size: 13px; font-weight: 600;
      }
    </style></head><body>
      <div class="canvas">
        <div class="hero">
          <div class="eyebrow">Auto-Scan Shield &amp; Live Screen-Share Mode</div>
          <h1>1-Click Protection for Loom, Zoom &amp; Live Demos</h1>
          <div class="sub">Detects emails, balances, IBANs &amp; API keys automatically—and masks new SPA content in real time.</div>
        </div>

        <div class="layout">
          <div class="app-card">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <div style="font-size:16px;font-weight:700;">Developer API &amp; Payout Settings</div>
                <div style="font-size:12px;color:#64748b;">app.dashboard.io/settings/billing</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:99px;background:rgba(16,185,129,0.15);border:1px solid rgba(52,211,153,0.4);color:#6ee7b7;font-size:12px;font-weight:700;">
                <span class="dot-live"></span> Live Shield Active
              </div>
            </div>

            <div class="kv"><span class="kv-label">Secret API Key</span><span class="kv-val mono">${['sk', 'live', 'Mock99xK772aQp41'].join('_')}</span></div>
            <div class="kv"><span class="kv-label">Account Owner Email</span><span class="kv-val mono">alex.mercer@northstar.io</span></div>
            <div class="kv"><span class="kv-label">Available Payout Balance</span><span class="kv-val mono">$42,680.50</span></div>
            <div class="kv"><span class="kv-label">Settlement IBAN</span><span class="kv-val mono">LT60 •••• •••• 4821</span></div>
            <div class="kv"><span class="kv-label">Webhook Signing Secret (Solid Redact)</span><span class="kv-redact mono">████████████████████████</span></div>
          </div>

          <div class="shield-pop">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
              <span style="font-size:15px;font-weight:700;">Auto-Scan Shield</span>
              <span style="font-size:12px;color:#38bdf8;font-weight:600;">Rescan</span>
            </div>
            <div class="cat-row"><span>✉ Emails</span><span class="cnt mono">12</span></div>
            <div class="cat-row"><span>$ Financial Amounts</span><span class="cnt mono">8</span></div>
            <div class="cat-row"><span>💳 IBAN / Credit Cards</span><span class="cnt mono">2</span></div>
            <div class="cat-row"><span>🔑 API Keys &amp; Tokens</span><span class="cnt mono">3</span></div>
            <div class="cat-row off"><span>👤 Person Names</span><span class="cnt mono">6</span></div>
            <div class="live-box">
              <span style="display:flex;align-items:center;gap:8px;"><span class="dot-live"></span> Live Screen-Share Shield</span>
              <span>ON</span>
            </div>
            <div class="save-btn">✓ Saved rules for app.dashboard.io</div>
          </div>
        </div>
      </div>
    </body></html>`,
  },
];

const browser = findBrowser();
const tmpDir = join(tmpdir(), `cloakshot-assets-${Date.now()}`);
mkdirSync(tmpDir, { recursive: true });

try {
  for (const asset of ASSETS) {
    const htmlPath = join(tmpDir, `${asset.name}.html`);
    const rawPngPath = join(tmpDir, `raw-${asset.name}`);
    const finalPath = join(outDir, asset.name);

    writeFileSync(htmlPath, asset.html, 'utf8');
    execFileSync(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-sandbox',
        '--force-device-scale-factor=1',
        `--window-size=${asset.width},${asset.height}`,
        `--screenshot=${rawPngPath}`,
        pathToFileURL(htmlPath).href,
      ],
      { stdio: 'pipe' },
    );

    const rawBuf = readFileSync(rawPngPath);
    const rgb24 = convertTo24BitOpaquePng(rawBuf, asset.width, asset.height);
    writeFileSync(finalPath, rgb24);

    // Read back IHDR to verify exact dimensions and 24-bit RGB (colorType 2)
    const w = rgb24.readUInt32BE(16);
    const h = rgb24.readUInt32BE(20);
    const colorType = rgb24[25];
    console.log(
      `Generated store-assets/${asset.name} — ${w}x${h}px, colorType=${colorType} (24-bit RGB, no alpha), ${(rgb24.length / 1024).toFixed(1)} KB`,
    );
  }
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
