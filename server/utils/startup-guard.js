/**
 * Startup safety guard — runs once at boot.
 *
 * Refuses to start if dangerous development flags are enabled in production.
 * Call this BEFORE any route or middleware is registered.
 *
 * Usage in app.js (top of file, after dotenv):
 *   import { runStartupGuards } from './utils/startup-guard.js';
 *   runStartupGuards(); // exits process on violation
 */

const checks = [
  {
    name: 'DEV_TOKENS_IN_PRODUCTION',
    description: 'ALLOW_DEV_TOKENS=true bypasses JWT auth — never allowed in production.',
    fail: () =>
      process.env.NODE_ENV === 'production' &&
      process.env.ALLOW_DEV_TOKENS === 'true',
  },
  {
    name: 'MISSING_JWT_SECRET',
    description: 'JWT_SECRET is not set — all auth tokens are insecure.',
    fail: () => !process.env.JWT_SECRET && !process.env.JWT_ACCESS_SECRET,
  },
  {
    name: 'WEAK_JWT_SECRET',
    description: 'JWT_SECRET is too short (< 32 chars) — tokens can be brute-forced.',
    fail: () => {
      const secret = process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || '';
      return process.env.NODE_ENV === 'production' && secret.length < 32;
    },
  },
  {
    name: 'DEBUG_CORS_IN_PRODUCTION',
    description: 'CORS_ORIGIN=* allows any origin in production — security risk.',
    fail: () =>
      process.env.NODE_ENV === 'production' &&
      (process.env.CORS_ORIGIN === '*' || process.env.CORS_ORIGIN === 'all'),
  },
  {
    name: 'INSECURE_COOKIE_SECRET',
    description: 'COOKIE_SECRET is not set — session cookies are unsigned.',
    fail: () =>
      process.env.NODE_ENV === 'production' &&
      !process.env.COOKIE_SECRET,
  },
];

export function runStartupGuards() {
  const violations = checks.filter(c => {
    try { return c.fail(); } catch { return false; }
  });

  if (violations.length === 0) {
    console.log('✅ Startup guards passed');
    return;
  }

  console.error('\n❌ STARTUP GUARD VIOLATIONS — process will not start:\n');
  violations.forEach(v => {
    console.error(`  [${v.name}]`);
    console.error(`  ${v.description}\n`);
  });

  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to start in production with unsafe configuration.');
    process.exit(1);
  } else {
    // In dev/staging, warn but allow startup so developers can work
    console.warn('⚠️  Startup guard warnings above — fix before deploying to production.\n');
  }
}
