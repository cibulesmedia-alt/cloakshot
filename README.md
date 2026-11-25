# CloakShot — Privacy & Demo Studio (Chrome Extension MV3)

100% browser-local Chrome Extension for blurring, solid-redacting, smart mock-swapping, inline-editing, live screen-share shielding, and dual scrolling screenshots on any webpage.

## Quick Start

```bash
npm install
npm run typecheck
npm test
npm run dev    # Dev build (includes Dev-only Pro toggle for testing)
npm run build  # Production build (strips Dev Pro toggle)
```

Load `dist/` in Chrome via `chrome://extensions` → **Developer mode** → **Load unpacked**.

## ExtensionPay Setup
Replace `EXTPAY_EXTENSION_ID = 'cloakshot-placeholder'` in `src/shared/constants.ts` with your registered ExtensionPay ID.

## Keyboard Shortcuts
- **Global Toggle:** `Alt+Shift+C` (Windows/Linux) / `Option+Shift+C` (macOS)
- **`1`**: Smart Mock Swap (Pro)
- **`2`**: Solid Redact
- **`3`**: Frosted Blur
- **`4`**: Box / Area Mask
- **`Shift + Click`**: Batch-mask entire table column or repeating list (Pro)
- **`Double-Click`**: Inline live text edit (Pro)
- **`Cmd/Ctrl + Z`**: Undo last mask
- **`Esc`**: Pause selection mode (press twice to close & restore original page in `<1ms`)
