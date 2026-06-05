/**
 * Mediczy — Canonical API error codes
 *
 * Every API error response MUST carry one of these codes in the `code` field
 * so clients can branch on the exact error without parsing human-readable messages.
 *
 * Format:  DOMAIN_REASON  (all caps, underscores)
 */

export const ErrorCodes = Object.freeze({
  // ── Auth ──────────────────────────────────────────────────────────────────
  UNAUTHORIZED:               'UNAUTHORIZED',            // no / invalid token
  TOKEN_EXPIRED:              'TOKEN_EXPIRED',           // JWT exp passed
  TOKEN_REVOKED:              'TOKEN_REVOKED',           // JTI revoked
  FORBIDDEN:                  'FORBIDDEN',               // valid token, wrong role
  INVALID_CREDENTIALS:        'INVALID_CREDENTIALS',     // wrong email/password
  ACCOUNT_INACTIVE:           'ACCOUNT_INACTIVE',        // suspended / deleted
  ACCOUNT_PENDING:            'ACCOUNT_PENDING',         // awaiting verification
  PASSWORD_CHANGE_REQUIRED:   'PASSWORD_CHANGE_REQUIRED',// first-login forced change
  OTP_INVALID:                'OTP_INVALID',             // wrong OTP code
  OTP_EXPIRED:                'OTP_EXPIRED',             // OTP window passed
  OTP_MAX_ATTEMPTS:           'OTP_MAX_ATTEMPTS',        // too many wrong guesses
  RATE_LIMIT_EXCEEDED:        'RATE_LIMIT_EXCEEDED',     // rate limiter fired

  // ── Membership ────────────────────────────────────────────────────────────
  NO_ACTIVE_MEMBERSHIP:       'NO_ACTIVE_MEMBERSHIP',    // no plan at all
  MEMBERSHIP_EXPIRED:         'MEMBERSHIP_EXPIRED',      // plan lapsed
  PLAN_LIMIT_EXCEEDED:        'PLAN_LIMIT_EXCEEDED',     // feature cap hit
  PLAN_UPGRADE_REQUIRED:      'PLAN_UPGRADE_REQUIRED',   // tier too low

  // ── Wallet / Coins ────────────────────────────────────────────────────────
  INSUFFICIENT_COINS:         'INSUFFICIENT_COINS',      // not enough Health Coins
  DAILY_REWARD_CLAIMED:       'DAILY_REWARD_CLAIMED',    // already claimed today
  INVALID_COUPON:             'INVALID_COUPON',          // coupon not found or inactive
  COUPON_EXPIRED:             'COUPON_EXPIRED',          // coupon past expiry date
  COUPON_ALREADY_USED:        'COUPON_ALREADY_USED',     // single-use coupon re-use
  PAYMENT_FAILED:             'PAYMENT_FAILED',          // Razorpay verification failed
  PAYMENT_ALREADY_VERIFIED:   'PAYMENT_ALREADY_VERIFIED',// duplicate verify call

  // ── Appointments ──────────────────────────────────────────────────────────
  SLOT_UNAVAILABLE:           'SLOT_UNAVAILABLE',        // slot taken or blocked
  APPOINTMENT_NOT_FOUND:      'APPOINTMENT_NOT_FOUND',
  APPOINTMENT_CANCELLED:      'APPOINTMENT_CANCELLED',   // already cancelled
  DOCTOR_UNAVAILABLE:         'DOCTOR_UNAVAILABLE',

  // ── Lab tests ─────────────────────────────────────────────────────────────
  LAB_TEST_NOT_FOUND:         'LAB_TEST_NOT_FOUND',
  SAMPLE_COLLECTION_FAILED:   'SAMPLE_COLLECTION_FAILED',

  // ── Pharmacy ──────────────────────────────────────────────────────────────
  MEDICINE_NOT_FOUND:         'MEDICINE_NOT_FOUND',
  OUT_OF_STOCK:               'OUT_OF_STOCK',
  PRESCRIPTION_REQUIRED:      'PRESCRIPTION_REQUIRED',  // Rx medicine, no upload

  // ── Resources ─────────────────────────────────────────────────────────────
  NOT_FOUND:                  'NOT_FOUND',               // generic 404
  ALREADY_EXISTS:             'ALREADY_EXISTS',          // duplicate resource
  VALIDATION_ERROR:           'VALIDATION_ERROR',        // express-validator failures
  INVALID_INPUT:              'INVALID_INPUT',           // manual business-rule validation
  FILE_TOO_LARGE:             'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE:      'UNSUPPORTED_FILE_TYPE',
  UPLOAD_FAILED:              'UPLOAD_FAILED',

  // ── Multi-tenancy ─────────────────────────────────────────────────────────
  TENANT_MISMATCH:            'TENANT_MISMATCH',         // cross-org access attempt
  TENANT_NOT_FOUND:           'TENANT_NOT_FOUND',

  // ── AI / SaMD ─────────────────────────────────────────────────────────────
  AI_SERVICE_UNAVAILABLE:     'AI_SERVICE_UNAVAILABLE',  // LLM / inference down
  AI_QUALITY_GATE_FAILED:     'AI_QUALITY_GATE_FAILED',  // SaMD gate blocked
  AI_RATE_LIMIT:              'AI_RATE_LIMIT',

  // ── Server ────────────────────────────────────────────────────────────────
  INTERNAL_ERROR:             'INTERNAL_ERROR',          // generic 500
  DATABASE_ERROR:             'DATABASE_ERROR',          // DB unreachable / query fail
  EXTERNAL_SERVICE_ERROR:     'EXTERNAL_SERVICE_ERROR',  // third-party API fail
  FEATURE_DISABLED:           'FEATURE_DISABLED',        // feature-flag / kill-switch
});

export default ErrorCodes;
