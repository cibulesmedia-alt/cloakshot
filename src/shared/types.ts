export type MaskMode = 'mock' | 'redact' | 'blur' | 'box';

export type ScanCategory = 'emails' | 'amounts' | 'ibansCards' | 'apiKeys' | 'names';

export type CaptureMode = 'visible' | 'area' | 'fullpage' | 'scroll-live';

export interface DomainRule {
  hostname: string;
  categories: ScanCategory[];
  liveShield: boolean;
  maskStyle: 'mock' | 'redact' | 'blur';
  updatedAt: number;
}

export interface UserPreferences {
  autoRestoreAfterCapture: boolean;
  cleanFrameEnabled: boolean;
  boxMaskStyle: 'blur' | 'redact';
  toolbarPosition: 'top' | 'bottom';
}

export interface ProStatus {
  isPro: boolean;
  paidAt: string | null;
  devOverride: boolean;
  isDevBuild: boolean;
}

export interface ScanCounts {
  emails: number;
  amounts: number;
  ibansCards: number;
  apiKeys: number;
  names: number;
}

export interface BoxMask {
  id: string;
  x: number; // document X (scrollX + clientX)
  y: number; // document Y (scrollY + clientY)
  width: number;
  height: number;
  style: 'blur' | 'redact';
}

export type RuntimeMessage =
  | { type: 'PING' }
  | { type: 'TOGGLE_TOOLBAR' }
  | { type: 'APPLY_DOMAIN_RULE'; rule: DomainRule }
  | { type: 'CAPTURE_VISIBLE_TAB' }
  | { type: 'GET_PRO_STATUS' }
  | { type: 'OPEN_PAYMENT_PAGE' }
  | { type: 'OPEN_LOGIN_PAGE' }
  | { type: 'SET_DEV_PRO_OVERRIDE'; enabled: boolean }
  | { type: 'REQUEST_DOMAIN_PERMISSION'; hostname: string }
  | { type: 'INJECT_AND_TOGGLE_ACTIVE_TAB' };
