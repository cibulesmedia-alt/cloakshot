// ============================================================================
// EXTENSIONPAY CONFIGURATION
// Paste the exact Extension ID registered at https://extensionpay.com below,
// then run `npm run zip` to build your Chrome Web Store release archive.
// ============================================================================
export const EXTPAY_EXTENSION_ID = 'cloakshot';

export const CLOAKSHOT_HOST_ID = 'cloakshot-shadow-host';
export const CLOAKSHOT_BOX_HOST_ID = 'cloakshot-box-host';

export const MAX_STITCHED_HEIGHT_PX = 15000;
export const CAPTURE_RATE_LIMIT_MS = 560; // Chrome enforces MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND = 2

export const STORAGE_KEYS = {
  DOMAIN_RULES: 'cloakshot_domain_rules_v1',
  PREFERENCES: 'cloakshot_preferences_v1',
  DEV_PRO_OVERRIDE: 'cloakshot_dev_pro_override',
} as const;

export const DEFAULT_PREFERENCES = {
  autoRestoreAfterCapture: false,
  cleanFrameEnabled: false,
  boxMaskStyle: 'blur' as 'blur' | 'redact',
  toolbarPosition: 'top' as 'top' | 'bottom',
};
