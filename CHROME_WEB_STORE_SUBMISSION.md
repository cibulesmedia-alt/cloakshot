# Chrome Web Store Submission Guide — CloakShot

Copy-paste-ready answers for every tab of the Chrome Web Store Developer Dashboard. All permissions match `dist/manifest.json` (`manifest_version: 3`).

---

## 1. Store Listing Tab

### Product Name
```text
CloakShot — Blur, Redact & Mock Swap Before Screenshot
```

### Summary (125 / 132 characters max)
```text
Blur, redact & Smart Mock Swap sensitive webpage data before screenshots & screen-shares, plus scrolling capture. 100% local.
```

### Detailed Description
```text
Hide sensitive customer data, emails, revenue figures, IBANs, and API keys on any webpage in 3 seconds—before you take a screenshot or start a screen-share.

CloakShot is a fast, 100% browser-local privacy & demo studio. Zero servers, zero telemetry, zero ugly floating boxes that drift when you scroll.

⚡ INSTANT ACTIVATION
Press Alt+Shift+C (Option+Shift+C on macOS) on any tab to summon the compact floating Shadow DOM command bar.

✨ SIGNATURE FEATURE: SMART MOCK SWAP (PRO)
Tired of covering tutorials, product demos, and support screenshots in ugly black bars?
• Replace real emails, currency amounts ($14,280.50, €3.420,00, 1 250,00 €), IBANs, credit cards, API keys, and customer names with realistic, format-preserving synthetic data—100% offline.
• Session-Consistent Swaps: If jonas@company.com appears 5 times on a page, all 5 instances swap to the exact same realistic mock email so tables and threads stay coherent.
• Double-Click Inline Edit: Edit any text directly on the live page without opening DevTools.

🎯 ZERO-DRIFT DOM ENGINE & SURGICAL SELECTION
• True In-Place DOM Mutation: Modifies actual DOM nodes instead of floating overlays—masks never drift when you scroll or resize.
• 4 Masking Modes: [1] Smart Mock Swap, [2] Solid Redact (████████), [3] Frosted Blur, and [4] Scroll-Locked Box Mask for charts, canvases, and images.
• Shift + Click Batching (Pro): Hold Shift and click any table cell or repeating list item to mask the entire column or list in one click.
• Instant <1ms Restore: Press Cmd/Ctrl+Z to undo or Esc twice to restore the exact original webpage with zero page reload.

🛡️ 1-CLICK AUTO-SCAN & LIVE SCREEN-SHARE SHIELD (PRO)
• Auto-Scan Shield: Detects Emails, Financial Amounts, IBANs/Credit Cards, API Keys, and Name columns with live counts and 1-click category toggles.
• Live Screen-Share Shield: Built for Loom, Zoom, and Google Meet. Automatically masks newly rendered content in real time as you navigate SPAs, open modals, or paginate tables.
• Saved Domain Rules: Save your preferred Auto-Scan rules per hostname so sensitive dashboards mask automatically when you open them.

📸 DUAL SCROLLING SCREENSHOT ENGINE & INSTANT OUTPUT
• Capture Visible & Capture Area/Element (Free): Click any card/modal or drag a crop box, then 1-click Copy PNG to Clipboard or Download PNG.
• Auto Full-Page Capture (Pro): 1-click automatic scroll-and-stitch that hides repeating fixed/sticky headers and auto-detects SPA scroll containers.
• Interactive Live Scroll-Stitch — "Scroll & Capture" (Pro): Scroll manually at your own pace for lazy-loaded images, infinite lists, or exact sections, then click Done to stitch cleanly.
• Clean Frame Backdrop (Pro) & Auto-Restore: Add a subtle rounded studio frame and automatically restore the real webpage data the millisecond after capture.

🔒 100% BROWSER-LOCAL PRIVACY
Everything runs locally inside your Chrome browser. Zero webpage data, screenshots, or browsing history are ever sent to external servers.

⌨️ KEYBOARD-FIRST WORKFLOW
• Alt+Shift+C / Option+Shift+C — Toggle CloakShot toolbar
• 1 — Smart Mock Swap | 2 — Solid Redact | 3 — Frosted Blur | 4 — Box Mask
• Shift + Click — Mask entire column or repeating list
• Double-Click — Inline live text edit
• Cmd/Ctrl + Z — Undo last mask
• Esc — Pause selection (press twice to close & restore original page)

FREE FOREVER & OPTIONAL $14 ONE-TIME PRO PASS
• Free: Unlimited manual Blur, Solid Redact, Box Masking, Hover Inspector, Undo/Restore, Visible & Area Capture with Copy PNG & Download PNG.
• Pro Lifetime Pass ($14 one-time, no subscription): Smart Mock Swap, Inline Edit, Auto-Scan Shield, Shift+Click Batching, Live Screen-Share Shield, Saved Domain Rules, Dual Scrolling Capture & Clean Frame Backdrop.
```

### Category & Language
- **Category:** `Productivity` (or `Workflow & Planning`)
- **Language:** `English (United States)`

### Privacy Policy URL
```text
https://cibulesmedia-alt.github.io/cloakshot/privacy.html
```
*(Also resolves at `https://cibulesmedia-alt.github.io/cloakshot/`)*

### Visual Assets Checklist
| Asset | Exact Dimensions | Format | Recommended Content |
| :--- | :--- | :--- | :--- |
| **Store Icon** | `128 × 128 px` | PNG (transparent) | Use `public/icons/icon128.png` |
| **Screenshot 1 (Hero)** | `1280 × 800 px` | PNG / JPEG (24-bit, no alpha) | Split before/after of a SaaS dashboard showing **Smart Mock Swap** turning real emails & `$14,280.50` figures into clean synthetic data with the floating CloakShot toolbar visible. |
| **Screenshot 2 (Auto-Scan)** | `1280 × 800 px` | PNG / JPEG | Floating toolbar with **Auto-Scan Shield** popover open showing live badges (`12 Emails`, `8 Amounts`, `2 IBANs`, `3 API Keys`) + Live Screen-Share Shield toggle ON. |
| **Screenshot 3 (Modes)** | `1280 × 800 px` | PNG / JPEG | Side-by-side showcase of **Solid Redact (`████`)**, **Frosted Blur**, **Box Mask** over a chart, and `Shift+Click` column batch highlight. |
| **Screenshot 4 (Dual Scroll)** | `1280 × 800 px` | PNG / JPEG | **Capture Studio** popover + compact Live Scroll-Stitch HUD (`Capturing scroll... 3,840 px • Done • Cancel`) + Clean Frame studio screenshot output. |
| **Small Promo Tile** | `440 × 280 px` | PNG / JPEG (no alpha) | Dark-slate gradient card with CloakShot icon + headline: *"Blur, Redact & Mock Swap Before Screenshot"*. |

---

## 2. Privacy Practices Tab (Exact Form Answers)

### Single Purpose Description
```text
CloakShot's single purpose is to let users locally mask, redact, or replace sensitive data on webpages (using blur, solid redaction, box overlays, or offline synthetic mock data) and capture clean screenshots directly inside the browser.
```

### Permission Justifications (Matches `dist/manifest.json`)

#### `activeTab`
```text
Required to access the currently active webpage only when the user explicitly activates CloakShot via the Alt+Shift+C keyboard shortcut or clicks the extension toolbar popup, enabling in-place DOM masking and screenshot capture without requesting broad host permissions at install time.
```

#### `scripting`
```text
Required to dynamically inject CloakShot's self-contained Shadow DOM toolbar and local DOM masking engine (content.js) into the active tab when invoked by the user, or into a user-approved domain with a saved auto-masking rule.
```

#### `storage`
```text
Required to store user preferences (such as Auto-Restore after Capture and Clean Frame toggles) and optional user-created Saved Domain Rules locally on the user's device via chrome.storage.local.
```

#### `tabs`
```text
Required to identify the active tab on keyboard command activation, check whether a newly loaded tab matches a user's saved domain rule, and call chrome.tabs.captureVisibleTab to generate local PNG screenshots.
```

#### `clipboardWrite`
```text
Required to copy the user's locally captured PNG screenshot directly to their system clipboard when they click Copy PNG.
```

#### Host Permission Justification (`optional_host_permissions: ["<all_urls>"]`)
```text
CloakShot does not request any required host permissions at install time. optional_host_permissions ("<all_urls>") is requested dynamically via chrome.permissions.request for a single specific hostname only when the user explicitly clicks "Save rules for [domain]" to enable automatic masking whenever they revisit that domain.
```

### Remote Code Declaration
- **Are you using remote code?** Select: **`No, I am not using Remote code`**
- **Explanation (if prompted):**
```text
All JavaScript, React UI components, Shadow DOM CSS, regex scanners, and offline mock data generators are bundled locally inside the extension package (dist/). No remote scripts, eval(), or externally hosted code are ever loaded or executed.
```

### Data Usage Certification
- **What user data do you plan to collect from users now or in the future?**
  - Leave **all** data collection checkboxes **UNCHECKED** (CloakShot collects zero webpage content, personal data, browsing history, or analytics).
  - *(Note: Optional Pro license purchases are handled directly by ExtensionPay & Stripe on their own checkout pages, not collected by the extension's scripts.)*
- **Certify all 3 disclosures (CHECK ALL):**
  - `[x]` I do not sell or transfer user data to third parties, outside of the approved use cases
  - `[x]` I do not use or transfer user data for purposes that are unrelated to my item's single purpose
  - `[x]` I do not use or transfer user data to determine creditworthiness or for lending purposes
