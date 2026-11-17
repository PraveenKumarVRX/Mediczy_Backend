/**
 * Demo-account guard (2026-11-17): a shared sales demo login can try everything, and nothing it does
 * reaches the real world — no payment, no message to anyone, no insurer, no partner asked to act.
 */
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';

const SECRET = 'test-only-demo-guard-secret-0123456789abcdef';
jest.unstable_mockModule('../config/auth.config.js', () => ({ JWT_CONFIG: { SECRET } }));
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: jest.fn(async () => ({ rows: [] })), connect: jest.fn() } }));

const guard = await import('../middleware/demo-account-guard.middleware.js');
const ctx = await import('../utils/demo-context.js');
const { createManagedFetch } = await import('../integrations/transport.js');
const { get } = await import('../integrations/core/registry.js');
const migration = await import('../migrations/20261117000100-demo-account-function.migration.js');

const DEMO = 8513;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const token = (claims) => jwt.sign({ tokenType: 'access', ...claims }, SECRET, { expiresIn: 300 });

/** Runs the middleware the way Express would; resolves with what happened. */
function run(method, url, claims) {
  return new Promise((resolve) => {
    const req = { method, originalUrl: url, headers: claims ? { authorization: `Bearer ${token(claims)}` } : {}, cookies: {} };
    const res = {
      statusCode: 200, headers: {},
      status(code) { this.statusCode = code; return this; },
      setHeader(k, v) { this.headers[k] = v; },
      json(body) { resolve({ kind: 'response', status: this.statusCode, body }); },
    };
    guard.demoAccountGuard(req, res, () => resolve({ kind: 'next', demoId: ctx.currentDemoAccountId(), headers: res.headers }));
  });
}

beforeEach(() => guard.__setDemoAccountIds([DEMO]));

describe('what the demo account may and may not do', () => {
  it.each([
    ['POST', '/api/payments/order'], ['POST', '/api/billing/payments/razorpay/create'], ['POST', '/api/wallet/create-order'],
    ['POST', '/api/membership/payment-order'], ['POST', '/api/health-checkups/bookings/12/payment'],
    ['POST', '/api/health-checkups/bookings/12/payment/verify'], ['POST', '/api/consultation/payment/initiate/4'],
    ['POST', '/api/corporate/benefit-wallet/authorizations'], ['POST', '/api/medical-ai/instant-triage-call'],
    ['POST', '/api/employee/insurance/link'], ['PUT', '/api/employee/enrolment/draft'], ['GET', '/api/tpa/providers'],
    ['POST', '/api/tickets'], ['POST', '/api/support/chat/start'], ['POST', '/v1/7/homecare/bookings'],
    ['POST', '/api/users/change-password'], ['DELETE', '/api/users/account'], ['PUT', '/api/users/profile'],
    ['POST', '/api/users/data/erasure'], ['DELETE', '/api/privacy/delete-account'], ['DELETE', '/api/privacy/consents/ai_assistant'],
    ['POST', '/api/auth/logout-all'],
  ])('refuses %s %s with a plain message', async (method, url) => {
    const r = await run(method, url, { id: DEMO, role: 'patient', userType: 'patient' });
    expect(r).toMatchObject({ kind: 'response', status: 403, body: { code: 'DEMO_ACCOUNT', demo: true } });
    expect(r.body.message).toMatch(/demo account/i);
  });

  it('acknowledges an SOS without alerting anyone', async () => {
    const r = await run('POST', '/api/medical-ai/emergency-sos', { id: DEMO, role: 'patient', userType: 'patient' });
    expect(r).toMatchObject({ kind: 'response', status: 200, body: { success: true, demo: true, notifiedContacts: [] } });
  });

  it.each([
    ['POST', '/api/consultation/book'], ['POST', '/api/appointments'], ['POST', '/api/lab-tests/checkout'],
    ['POST', '/api/health-checkups/bookings'], ['POST', '/api/pharmacy-orders'], ['POST', '/api/family-members'],
    ['POST', '/api/employee/claims'], ['GET', '/api/employee/policies'], ['GET', '/api/payments/history'],
  ])('lets %s %s through, inside the demo context', async (method, url) => {
    const r = await run(method, `${url}?x=1`, { id: DEMO, role: 'patient', userType: 'patient' });
    expect(r).toEqual({ kind: 'next', demoId: DEMO, headers: { 'X-Demo-Account': 'true' } });
  });

  it('leaves everyone else alone', async () => {
    expect(await run('POST', '/api/payments/order', { id: 77, role: 'patient', userType: 'patient' })).toMatchObject({ kind: 'next', demoId: null });
    expect(await run('POST', '/api/payments/order')).toMatchObject({ kind: 'next', demoId: null });
    // Ids are per table: a doctor whose doctors.id equals the demo user's id is not the demo account.
    expect(await run('POST', '/api/consultation/doctor/accept', { id: DEMO, role: 'doctor', userType: 'doctor' })).toMatchObject({ kind: 'next', demoId: null });
  });

  it('ignores a forged token', async () => {
    const forged = jwt.sign({ id: DEMO, role: 'patient' }, 'some-other-secret');
    const r = await new Promise((resolve) => guard.demoAccountGuard(
      { method: 'POST', originalUrl: '/api/payments/order', headers: { authorization: `Bearer ${forged}` }, cookies: {} },
      { status() { return this; }, json: (b) => resolve(b), setHeader() {} }, () => resolve('next')));
    expect(r).toBe('next');
  });
});

describe('the integration layer refuses vendors that reach people or move money', () => {
  it.each(['razorpay', 'twilio', 'aws-ses', 'smtp', 'firebase-fcm', 'gupshup', 'smartcrm'])('%s is refused for the demo account', async (id) => {
    const fn = jest.fn(async () => 'sent');
    await expect(ctx.runAsDemoAccount(DEMO, () => get(id).call(fn, { configuration: true }))).rejects.toMatchObject({ code: 'DEMO_ACCOUNT_BLOCKED' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('AI and maps keep working, and nobody else is affected', async () => {
    await expect(ctx.runAsDemoAccount(DEMO, () => get('llm-groq').call(async () => 'answer', { configuration: true }))).resolves.toBe('answer');
    await expect(ctx.runAsDemoAccount(DEMO, () => get('google-places').call(async () => 'place', { configuration: true }))).resolves.toBe('place');
    await expect(get('razorpay').call(async () => 'order', { configuration: true })).resolves.toBe('order');
  });

  it('an uncatalogued outside host is refused, an internal service is not', async () => {
    const fetchImpl = jest.fn(async () => ({ status: 200 }));
    const managed = createManagedFetch(fetchImpl);
    await expect(ctx.runAsDemoAccount(DEMO, () => managed('https://api.textlocal.in/send/'))).rejects.toMatchObject({ code: 'DEMO_ACCOUNT_BLOCKED' });
    await expect(ctx.runAsDemoAccount(DEMO, () => managed('http://127.0.0.1:8000/chat'))).resolves.toEqual({ status: 200 });
    await expect(managed('https://api.textlocal.in/send/')).resolves.toEqual({ status: 200 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('context survives the awaits inside a request', async () => {
    const seen = await ctx.runAsDemoAccount(DEMO, async () => {
      await new Promise((r) => setTimeout(r, 5));
      await Promise.resolve();
      return ctx.currentDemoAccountId();
    });
    expect(seen).toBe(DEMO);
    expect(ctx.currentDemoAccountId()).toBeNull();
  });
});

describe('the demo account only ever notifies itself', () => {
  const source = read('services/notification.service.js');
  it('send() returns before writing anything when the recipient is someone else', () => {
    const body = source.slice(source.indexOf('async send({'));
    const guardAt = body.indexOf('currentDemoAccountId()');
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(body.indexOf('postgresSequelize.transaction'));
    expect(body).toMatch(/Number\(userId\) === demoAccountId && \['patient', 'user', undefined, null\]\.includes\(userType\)/);
  });
});

describe('partner work queues and reminder jobs leave demo bookings out', () => {
  it.each([
    ['routes/online-consultation.route.js', "notDemoAccount('Appointment.userId')"], // doctor's pending requests
    ['routes/doctor.route.js', "notDemoAccount('Appointment.userId')"],              // doctor's appointments
    ['routes/lab/orders.route.js', 'NOT is_demo_account(lo.patient_id)'],             // lab portal orders
    ['routes/lab-tests.route.js', "notDemoAccount('LabTest.userId')"],               // lab's assigned tests
    ['services/appointment-notification.service.js', "notDemoAccount('Appointment.userId')"], // doctor socket pings
    ['services/appointment-preference-reminders.service.js', 'NOT is_demo_account("userId")'], // reminders incl. doctor
    ['services/health-checkup-reminder-cron.service.js', 'NOT is_demo_account(user_id)'],      // third-party phones
  ])('%s', (file, fragment) => expect(read(file)).toContain(fragment));

  // Owner decision 2026-11-17: the Team sees demo check-ups, badged, so a prospect can be shown the whole
  // journey (approved, instructions, report). What keeps that safe is below.
  it('the Team check-up queues show demo bookings, flagged', () => {
    const route = read('routes/corporate-bookings.route.js');
    expect(route).not.toMatch(/AND NOT is_demo_account\(b\.user_id\)/);
    expect(route.match(/is_demo_account\(b\.user_id\) AS is_demo/g)).toHaveLength(3); // both lists + loadCheckup
    expect(route).toContain('isDemo: r.is_demo === true');
    expect(route.match(/is_demo: booking\.is_demo/g)).toHaveLength(4); // approve, reject, complete, reports
  });

  it('completing a demo check-up never uses up the demo login\'s entitlement', () => {
    expect(read('routes/corporate-bookings.route.js')).toMatch(/"packageId"=:packageId\s+AND NOT is_demo_account\("userId"\)/);
  });

  it('check-up messages for a demo booking run in the demo context, even when the Team triggers them', () => {
    const notify = read('services/health-checkup-notify.service.js');
    const body = notify.slice(notify.indexOf('export async function notifyBooking'));
    expect(body).toMatch(/SELECT is_demo_account\(:userId\) AS demo/);
    expect(body).toMatch(/runAsDemoAccount\(userId, \(\) => dispatchBooking\(row, kind\)\)/);
    expect(body.indexOf('runAsDemoAccount')).toBeLessThan(body.indexOf('async function dispatchBooking'));
  });

  it('an in-person demo booking never joins a hospital OPD queue', () => {
    expect(read('controller/appointment.controller.js')).toContain('isInPersonConsultation(bookedType) && currentDemoAccountId() === null');
  });

  it('the guard runs before every router', () => {
    const app = read('app.js');
    const mounted = app.indexOf("app.use('/api', demoAccountGuard)");
    expect(mounted).toBeGreaterThan(-1);
    expect(app.indexOf("app.use('/v1', demoAccountGuard)")).toBeGreaterThan(-1);
    const firstRouter = app.search(/app\.use\(['"]\/(api|v1)[^'"]*['"],\s*\w+Router\b/);
    expect(mounted).toBeLessThan(firstRouter);
  });

  it('is_demo_account() is installed by its migration', async () => {
    const client = { query: jest.fn(async () => ({ rows: [] })) };
    await migration.up(client);
    expect(client.query.mock.calls[0][0]).toMatch(/CREATE OR REPLACE FUNCTION is_demo_account\(account_id integer\) RETURNS boolean/);
    expect(client.query.mock.calls[0][0]).toMatch(/metadata->>'demoAccount' = 'true'/);
  });
});
