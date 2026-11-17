/**
 * Demo-account request context.
 *
 * A sales demo login (users.metadata.demoAccount = true) is shared with prospective clients on the live
 * system. What it does must look real inside the app but must never reach the real world: no payment
 * gateway, no message to anyone, no insurer, no partner acting on it. The demo guard middleware
 * (middleware/demo-account-guard.middleware.js) runs each of that account's requests inside this
 * context; the outbound layer (integrations/core/integration.js, integrations/transport.js) and the
 * notification service read it.
 *
 * Deliberately dependency-free: the integration core imports it, and must not pull in the database.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

/** Run fn inside a demo-account context. */
export const runAsDemoAccount = (userId, fn) => storage.run({ userId: Number(userId) }, fn);

/** The demo account's user id when the current work started from its request, else null. */
export const currentDemoAccountId = () => storage.getStore()?.userId ?? null;

/**
 * Vendors that reach people or move money. Inside a demo context they are refused; everything else
 * (AI models, maps, video tokens, sign-in verification) keeps working so the demo is complete.
 */
export const DEMO_BLOCKED_INTEGRATIONS = new Set([
  'razorpay',        // payments
  'twilio', 'gupshup', 'infobip', 'whatsapp-cloud', // SMS / WhatsApp
  'aws-ses', 'smtp', // email
  'firebase-fcm',    // push to devices
  'smartcrm', 'nhcx', // insurer / claims exchange
  'abdm',            // government health-ID registry
  'telecmi', 'tata-smartflo', 'exotel', // calling
]);

export class DemoAccountBlockedError extends Error {
  constructor(what) {
    super(`Demo account: ${what} is switched off. Nothing was sent.`);
    this.name = 'DemoAccountBlockedError';
    this.code = 'DEMO_ACCOUNT_BLOCKED';
    this.status = 403;
    this.statusCode = 403;
  }
}

const PRIVATE_HOST = /^(localhost|127\.\d+\.\d+\.\d+|::1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i;

/** True for hosts on this machine or the private network (internal AI and services). */
export const isPrivateHost = (hostname) => PRIVATE_HOST.test(String(hostname || ''));

/**
 * Throws when the current demo-account work tries to reach a blocked vendor, or an uncatalogued
 * outside host (SMS gateways, TPAs, webhooks) that the integration layer would otherwise pass through.
 * @param {{ integrationId?: string|null, url?: string|null }} target
 */
export function assertDemoOutboundAllowed({ integrationId = null, url = null } = {}) {
  if (currentDemoAccountId() === null) return;
  if (integrationId) {
    if (DEMO_BLOCKED_INTEGRATIONS.has(integrationId)) throw new DemoAccountBlockedError(integrationId);
    return;
  }
  let host = '';
  try { host = new URL(url).hostname; } catch { /* unparsable: treat as outside */ }
  if (!isPrivateHost(host)) throw new DemoAccountBlockedError(host || 'an outside service');
}
