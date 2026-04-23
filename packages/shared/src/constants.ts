export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  RESELLER: 'reseller',
  USER: 'user',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const PERMISSIONS = {
  // Users
  USERS_VIEW: 'users.view',
  USERS_EDIT: 'users.edit',
  USERS_BAN: 'users.ban',
  USERS_DELETE: 'users.delete',
  USERS_ADJUST_BALANCE: 'users.adjust_balance',

  // Roles
  ROLES_MANAGE: 'roles.manage',

  // Emails
  EMAILS_VIEW: 'emails.view',
  EMAILS_DELETE: 'emails.delete',

  // Ingestion
  INGESTION_MANAGE: 'ingestion.manage',

  // Pricing
  PRICING_MANAGE: 'pricing.manage',

  // Domains / Countries
  DOMAINS_MANAGE: 'domains.manage',
  COUNTRIES_MANAGE: 'countries.manage',

  // Payments
  PAYMENTS_VIEW: 'payments.view',
  PAYMENTS_MANAGE: 'payments.manage',

  // Orders
  ORDERS_VIEW: 'orders.view',

  // Resellers
  RESELLERS_MANAGE: 'resellers.manage',

  // Tickets
  TICKETS_VIEW: 'tickets.view',
  TICKETS_REPLY: 'tickets.reply',

  // Announcements
  ANNOUNCEMENTS_MANAGE: 'announcements.manage',

  // Audit
  AUDIT_VIEW: 'audit.view',

  // Settings / Branding
  SETTINGS_MANAGE: 'settings.manage',
  BRANDING_MANAGE: 'branding.manage',

  // Dashboard
  ADMIN_DASHBOARD_VIEW: 'admin.dashboard.view',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const EMAIL_STATUS = {
  AVAILABLE: 'available',
  RESERVED: 'reserved',
  SOLD: 'sold',
} as const;

export const RESERVATION_STATUS = {
  ACTIVE: 'active',
  CONFIRMED: 'confirmed',
  EXPIRED: 'expired',
  CANCELED: 'canceled',
} as const;

export const USER_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  BANNED: 'banned',
  PENDING_VERIFICATION: 'pending_verification',
} as const;

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
  CANCELED: 'canceled',
} as const;

export const LEDGER_TYPE = {
  TOPUP: 'topup',
  PURCHASE: 'purchase',
  REFUND: 'refund',
  REFERRAL: 'referral',
  BONUS: 'bonus',
  ADMIN_ADJUST: 'admin_adjust',
  RESELLER_DISCOUNT: 'reseller_discount',
} as const;

export const SETTING_KEYS = {
  // Branding
  SITE_NAME: 'site_name',
  SITE_TAGLINE: 'site_tagline',
  LOGO_URL: 'logo_url',
  FAVICON_URL: 'favicon_url',
  PRIMARY_COLOR: 'primary_color',
  ACCENT_COLOR: 'accent_color',
  SUPPORT_TELEGRAM: 'support_telegram',

  // Toggles
  CAPTCHA_ENABLED: 'captcha_enabled',
  EMAIL_VERIFICATION_REQUIRED: 'email_verification_required',
  GOOGLE_OAUTH_ENABLED: 'google_oauth_enabled',
  TWO_FA_ENABLED: 'two_fa_enabled',

  // Economy
  POINTS_PER_DOLLAR: 'points_per_dollar',
  MIN_TOPUP_USD: 'min_topup_usd',
  MAX_TOPUP_USD: 'max_topup_usd',
  COINPAYMENTS_CURRENCIES: 'coinpayments_currencies',

  // Search / Reservation
  RESERVATION_TTL_MINUTES: 'reservation_ttl_minutes',
  DEMO_EMAILS_COUNT: 'demo_emails_count',
  MAX_SEARCH_RESULTS: 'max_search_results',
  MAX_EXPORT_SIZE: 'max_export_size',
  COOLDOWN_DAYS_AFTER_SALE: 'cooldown_days_after_sale',

  // Security
  MAX_LOGIN_ATTEMPTS: 'max_login_attempts',
  LOCKOUT_MINUTES: 'lockout_minutes',
  SESSION_TTL_MINUTES: 'session_ttl_minutes',

  // Referral
  REFERRAL_ENABLED: 'referral_enabled',
  REFERRAL_COMMISSION_PCT: 'referral_commission_pct',

  // Exports
  EXPORT_LOCAL_RETENTION_DAYS: 'export_local_retention_days',
  AUTO_UPLOAD_TO_GOFILE: 'auto_upload_to_gofile',

  // CoinPayments (admin-editable overrides)
  COINPAYMENTS_CLIENT_ID: 'coinpayments_client_id',
  COINPAYMENTS_CLIENT_SECRET: 'coinpayments_client_secret',
  COINPAYMENTS_WEBHOOK_SECRET: 'coinpayments_webhook_secret',

  // GoFile
  GOFILE_ACCOUNT_TOKEN: 'gofile_account_token',
  GOFILE_ACCOUNT_ID: 'gofile_account_id',
} as const;

export const DEFAULT_SETTINGS = {
  [SETTING_KEYS.SITE_NAME]: 'Platform',
  [SETTING_KEYS.SITE_TAGLINE]: 'Premium Email Intelligence',
  [SETTING_KEYS.LOGO_URL]: '',
  [SETTING_KEYS.FAVICON_URL]: '',
  [SETTING_KEYS.PRIMARY_COLOR]: '#0b1e3f',
  [SETTING_KEYS.ACCENT_COLOR]: '#d4af37',
  [SETTING_KEYS.SUPPORT_TELEGRAM]: '',

  [SETTING_KEYS.CAPTCHA_ENABLED]: false,
  [SETTING_KEYS.EMAIL_VERIFICATION_REQUIRED]: false,
  [SETTING_KEYS.GOOGLE_OAUTH_ENABLED]: false,
  [SETTING_KEYS.TWO_FA_ENABLED]: true,

  [SETTING_KEYS.POINTS_PER_DOLLAR]: 1000,
  [SETTING_KEYS.MIN_TOPUP_USD]: 10,
  [SETTING_KEYS.MAX_TOPUP_USD]: 3000,
  [SETTING_KEYS.COINPAYMENTS_CURRENCIES]: ['BTC', 'USDT.TRC20', 'ETH', 'LTC'],

  [SETTING_KEYS.RESERVATION_TTL_MINUTES]: 60,
  [SETTING_KEYS.DEMO_EMAILS_COUNT]: 50,
  [SETTING_KEYS.MAX_SEARCH_RESULTS]: 100000,
  [SETTING_KEYS.MAX_EXPORT_SIZE]: 500000,
  [SETTING_KEYS.COOLDOWN_DAYS_AFTER_SALE]: 90,

  [SETTING_KEYS.MAX_LOGIN_ATTEMPTS]: 10,
  [SETTING_KEYS.LOCKOUT_MINUTES]: 30,
  [SETTING_KEYS.SESSION_TTL_MINUTES]: 60,

  [SETTING_KEYS.REFERRAL_ENABLED]: true,
  [SETTING_KEYS.REFERRAL_COMMISSION_PCT]: 5,

  [SETTING_KEYS.EXPORT_LOCAL_RETENTION_DAYS]: 7,
  [SETTING_KEYS.AUTO_UPLOAD_TO_GOFILE]: true,

  [SETTING_KEYS.COINPAYMENTS_CLIENT_ID]: '',
  [SETTING_KEYS.COINPAYMENTS_CLIENT_SECRET]: '',
  [SETTING_KEYS.COINPAYMENTS_WEBHOOK_SECRET]: '',

  [SETTING_KEYS.GOFILE_ACCOUNT_TOKEN]: '',
  [SETTING_KEYS.GOFILE_ACCOUNT_ID]: '',
} as const;
