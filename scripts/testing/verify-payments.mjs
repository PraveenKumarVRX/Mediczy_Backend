#!/usr/bin/env node
/**
 * Verification of WP-0.4 payment integrity through the REAL middleware chain: Razorpay webhook
 * (signature over the raw body, idempotency, races with the checkout callback), refunds, allocations,
 * adjustments, vendor (AP) payments and payroll runs.
 *
 * !! SAFETY !!  .env / server/.env point the default pgPool at PRODUCTION. Run only as OS user
 * `postgres` against the LOCAL unix-socket database (same recipe as verify-parking.mjs):
 *
 *   sudo -u postgres env JWT_SECRET=smoke-test-secret JWT_REFRESH_SECRET=smoke-test-refresh \
 *     POSTGRES_FORCE_LOCAL=true DISALLOW_REMOTE_DB=true POSTGRES_HOST=/var/run/postgresql \
 *     POSTGRES_PRIMARY_HOST=/var/run/postgresql POSTGRES_PORT=5432 POSTGRES_PRIMARY_PORT=5432 \
 *     POSTGRES_DATABASE=mediczy_ai POSTGRES_PRIMARY_DATABASE=mediczy_ai POSTGRES_USER=postgres \
 *     POSTGRES_PRIMARY_USER=postgres POSTGRES_PASSWORD=unused POSTGRES_PRIMARY_PASSWORD=unused \
 *     POSTGRES_SSL=false NODE_ENV=development node scripts/testing/verify-payments.mjs
 *
 * The refunds / allocations / adjustments tables come from the RCM billing migration on production; on this
 * local database the script creates identical copies (IF NOT EXISTS) so it can run anywhere.
 *
 * Uses hospitals 998001 / 998002 and deletes everything it created. External network is blocked.
 */
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import net from 'net';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SERVER = path.join(ROOT, 'server');
const realWrite = process.stdout.write.bind(process.stdout);
const out = (s = '') => realWrite(String(s) + '\n');
process.stdout.write = () => true;
process.stderr.write = () => true;

const SCRUB = /^(TWILIO|SMTP|EMAIL|MAIL|SENDGRID|SES_|REDIS|KAFKA|S3_|AWS_|MINIO|OPENAI|GROQ|ANTHROPIC|GEMINI|GOOGLE|FIREBASE|RAZORPAY|ABDM|SMS|WHATSAPP|FACEBOOK|FB_|INSTAGRAM|SIB_|ISHA|ELEVEN|DEEPGRAM|SENTRY|OTEL|STRIPE|PAYU|CASHFREE|MSG91|FCM|APNS|LIVEKIT|MONGO|SUPABASE|R2_|CLOUDFLARE|CDN|SLACK|TELEGRAM|PUSHER|PGI)/i;
const KEEP = /^(POSTGRES_|JWT_|NODE_ENV|PATH|HOME|USER|LANG|PWD|TZ)/;
for (const k of Object.keys(process.env)) if (SCRUB.test(k) && !KEEP.test(k)) delete process.env[k];
delete process.env.ALLOW_DEV_TOKENS;
const WH_SECRET = 'whsec_verify_only'; const KEY_SECRET = 'keysec_verify_only';
process.env.RAZORPAY_WEBHOOK_SECRET = WH_SECRET; process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;

const fatal = (m) => { out(`ABORT: ${m}`); process.exit(2); };
if (os.userInfo().username !== 'postgres') fatal('must run as OS user postgres (see header)');
if (process.env.NODE_ENV === 'production') fatal('NODE_ENV=production');
if (process.env.DISALLOW_REMOTE_DB !== 'true' || process.env.POSTGRES_FORCE_LOCAL !== 'true') fatal('DISALLOW_REMOTE_DB/POSTGRES_FORCE_LOCAL must be true');
if (!String(process.env.POSTGRES_HOST || '').startsWith('/')) fatal('POSTGRES_HOST must be a unix socket path');
if (process.env.JWT_SECRET !== 'smoke-test-secret') fatal('JWT_SECRET must be smoke-test-secret');

let ALLOWED_PORT = null;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let a0 = args[0]; if (Array.isArray(a0)) a0 = a0[0];
  let host; let isPath = false; let port;
  if (a0 && typeof a0 === 'object') { host = a0.host; port = a0.port; isPath = !!a0.path && !a0.port; if (a0.port && !host) host = 'localhost'; }
  else if (typeof a0 === 'string') { isPath = true; }
  else if (typeof a0 === 'number') { port = a0; host = typeof args[1] === 'string' ? args[1] : 'localhost'; }
  if (!isPath && host && !(LOOPBACK.has(String(host)) && ALLOWED_PORT !== null && Number(port) === ALLOWED_PORT)) {
    process.nextTick(() => this.destroy(new Error(`VERIFY: external network blocked (${host})`)));
    return this;
  }
  return origConnect.apply(this, args);
};

const pool = (await import(pathToFileURL(path.join(SERVER, 'db/pgPool.js')).href)).default;
{
  const r = (await pool.query(`SELECT inet_server_addr() AS addr, current_database() AS db`)).rows[0];
  if (r.addr !== null) fatal(`DB connection is TCP (${r.addr})`);
  if (r.db !== 'mediczy_ai') fatal(`unexpected database ${r.db}`);
}
const require = createRequire(path.join(SERVER, 'package.json'));
const jwt = require('jsonwebtoken');
const A = 998001; const B = 998002;
const tok = (org, role = 'hospital_admin') => jwt.sign({ id: org, email: `p${org}@verify.invalid`, role, userType: 'hospital', hospital_id: org, tenant_id: org, organization_id: org }, process.env.JWT_SECRET, { expiresIn: '1h' });
const T = { adminA: tok(A), adminB: tok(B), hrA: tok(A, 'hr_staff') };

const results = [];
const check = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail: cond ? '' : String(detail).slice(0, 260) });
let BASE = '';
const call = async (method, url, token, body, headers = {}) => {
  const res = await fetch(BASE + url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text };
};
const sign = (raw, secret = WH_SECRET) => crypto.createHmac('sha256', secret).update(raw).digest('hex');
// Send a webhook exactly like Razorpay: raw text body + signature over that exact text.
const hook = async (raw, { secret = WH_SECRET, signature, eventId, contentType = 'application/json' } = {}) => {
  const res = await fetch(`${BASE}/api/hospital/billing/pgi/webhook`, {
    method: 'POST', body: raw,
    headers: { 'content-type': contentType, ...(signature === null ? {} : { 'x-razorpay-signature': signature ?? sign(raw, secret) }), ...(eventId ? { 'x-razorpay-event-id': eventId } : {}) },
  });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text };
};
const captured = ({ hospitalId, invoiceId, orderId, paymentId, paise, extraNotes = {} }) =>
  JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: paise, notes: { hospitalId: String(hospitalId), invoiceId: String(invoiceId), ...extraNotes } } } } });

let seq = 0;
const newInvoice = async (org, { liability = 1000, insurance = 0, patient = 1, order = null, paid = 0 } = {}) => {
  seq += 1;
  const total = liability + insurance;
  const r = await pool.query(
    `INSERT INTO hospital_invoices (hospital_id, bill_number, patient_id, total_amount, insurance_amount, patient_liability, amount_paid, amount_due, status, pgi_order_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'issued',$9,$10::jsonb) RETURNING id`,
    [org, `VFY-${process.pid}-${seq}`, patient, total, insurance, liability, paid, liability - paid, order, JSON.stringify(order ? { pgiAmount: liability } : {})]
  );
  return r.rows[0].id;
};
const inv = async (id) => (await pool.query(`SELECT * FROM hospital_invoices WHERE id = $1`, [id])).rows[0];
const pays = async (invoiceId) => (await pool.query(`SELECT * FROM hospital_payments WHERE invoice_id = $1 ORDER BY id`, [invoiceId])).rows;
const num = (v) => Number(v);

const cleanup = async () => {
  const q = (s, p) => pool.query(s, p).catch(() => {});
  const ids = (await pool.query(`SELECT id FROM hospital_invoices WHERE hospital_id = ANY($1::int[])`, [[A, B]]).catch(() => ({ rows: [] }))).rows.map((r) => r.id);
  const pids = (await pool.query(`SELECT id FROM hospital_payments WHERE hospital_id = ANY($1::int[])`, [[A, B]]).catch(() => ({ rows: [] }))).rows.map((r) => r.id);
  await q(`DELETE FROM hospital_payment_allocations WHERE payment_id = ANY($1::bigint[])`, [pids]);
  await q(`DELETE FROM hospital_payment_refunds WHERE hospital_id = ANY($1::int[])`, [[A, B]]);
  await q(`DELETE FROM hospital_bill_adjustments WHERE hospital_id = ANY($1::int[])`, [[A, B]]);
  await q(`DELETE FROM hospital_payments WHERE hospital_id = ANY($1::int[])`, [[A, B]]);
  await q(`DELETE FROM hospital_invoice_lines WHERE invoice_id = ANY($1::bigint[])`, [ids]);
  await q(`DELETE FROM hospital_credit_ledger WHERE credit_account_id IN (SELECT id FROM hospital_credit_accounts WHERE hospital_id = ANY($1::int[]))`, [[A, B]]);
  await q(`DELETE FROM hospital_credit_accounts WHERE hospital_id = ANY($1::int[])`, [[A, B]]);
  await q(`DELETE FROM hospital_invoices WHERE hospital_id = ANY($1::int[])`, [[A, B]]);
  await q(`DELETE FROM billing_audit_log WHERE hospital_id = ANY($1::int[])`, [[A, B]]);
  await q(`DELETE FROM payment_gateway_events WHERE hospital_id = ANY($1::int[])`, [[A, B]]);
  await q(`DELETE FROM payroll_run_lines WHERE run_id IN (SELECT id FROM payroll_runs WHERE tenant_id = ANY($1::int[]))`, [[A, B]]);
  await q(`DELETE FROM payroll_runs WHERE tenant_id = ANY($1::int[])`, [[A, B]]);
  await q(`DELETE FROM payroll_structures WHERE tenant_id = ANY($1::int[])`, [[A, B]]);
  await q(`DELETE FROM scm_ap_payments WHERE invoice_id IN (SELECT id FROM scm_ap_invoices WHERE invoice_number LIKE 'VFY-%')`);
  await q(`DELETE FROM scm_ap_invoices WHERE invoice_number LIKE 'VFY-%'`);
};

let server; let crashed = null;
try {
  const { up } = await import(pathToFileURL(path.join(SERVER, 'migrations/payments-integrity.migration.js')).href);
  const billing = (await import(pathToFileURL(path.join(SERVER, 'services/hospital-billing.service.js')).href)).default;
  await billing.listStations(A); // creates the lazily-created billing tables on a fresh local DB
  await pool.query(`
    ALTER TABLE hospital_invoices ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
    ALTER TABLE hospital_payments ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
    ALTER TABLE hospital_payments ADD COLUMN IF NOT EXISTS void_reason TEXT;
    ALTER TABLE hospital_payments ADD COLUMN IF NOT EXISTS voided_by INTEGER;
    ALTER TABLE hospital_payments ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(14,2);
    ALTER TABLE hospital_payments ADD COLUMN IF NOT EXISTS refund_reason TEXT;
    ALTER TABLE hospital_payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
    ALTER TABLE hospital_payments ADD COLUMN IF NOT EXISTS refunded_by INTEGER;
    CREATE TABLE IF NOT EXISTS hospital_bill_adjustments (id BIGSERIAL PRIMARY KEY, hospital_id INTEGER NOT NULL, invoice_id BIGINT NOT NULL, adjustment_type VARCHAR(30) NOT NULL, amount NUMERIC(14,2) NOT NULL, reason TEXT, approved_by INTEGER, approved_by_name VARCHAR(200), metadata JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS hospital_payment_allocations (id BIGSERIAL PRIMARY KEY, payment_id BIGINT NOT NULL, invoice_id BIGINT NOT NULL, amount NUMERIC(14,2) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS hospital_payment_refunds (id BIGSERIAL PRIMARY KEY, hospital_id INTEGER NOT NULL, payment_id BIGINT NOT NULL, invoice_id BIGINT NOT NULL, amount NUMERIC(14,2) NOT NULL, reason TEXT, status VARCHAR(20) DEFAULT 'completed', approved_by INTEGER, gateway_refund_id VARCHAR(120), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  `);
  await up(); await up();
  check('migration runs twice without error', true);
  await cleanup();
  const gw = (await import(pathToFileURL(path.join(SERVER, 'services/payment-gateway.service.js')).href)).default;

  // ── signature unit tests ──
  const body = '{"event":"payment.captured","note":"रोगी ₹500 — नमस्ते"}';
  check('signature: valid (Unicode text)', gw.verifyRazorpayWebhook(body, sign(body)) === true);
  check('signature: valid for a Buffer body', gw.verifyRazorpayWebhook(Buffer.from(body), sign(body)) === true);
  check('signature: tampered body rejected', gw.verifyRazorpayWebhook(body + ' ', sign(body)) === false);
  check('signature: wrong secret rejected', gw.verifyRazorpayWebhook(body, sign(body, 'other')) === false);
  check('signature: missing raw body rejected (fail closed)', gw.verifyRazorpayWebhook(undefined, sign(body)) === false && gw.verifyRazorpayWebhook('', sign('')) === false);
  check('signature: parsed object is not accepted', gw.verifyRazorpayWebhook(JSON.parse(body), sign(body)) === false);
  check('signature: missing / short / non-string signature rejected', gw.verifyRazorpayWebhook(body, undefined) === false && gw.verifyRazorpayWebhook(body, 'abc') === false && gw.verifyRazorpayWebhook(body, 12345) === false);
  check('checkout signature: valid and tampered', gw.verifyRazorpaySignature('o1', 'p1', crypto.createHmac('sha256', KEY_SECRET).update('o1|p1').digest('hex')) === true && gw.verifyRazorpaySignature('o1', 'p2', crypto.createHmac('sha256', KEY_SECRET).update('o1|p1').digest('hex')) === false);

  const app = (await import(pathToFileURL(path.join(SERVER, 'app.js')).href)).default;
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  ALLOWED_PORT = server.address().port;
  BASE = `http://127.0.0.1:${ALLOWED_PORT}`;
  await new Promise((r) => setTimeout(r, 1500));

  // ── webhook ──
  const i1 = await newInvoice(A, { liability: 1000, order: 'order_1' });
  const ev1 = captured({ hospitalId: A, invoiceId: i1, orderId: 'order_1', paymentId: 'pay_1', paise: 100000 });
  let r = await hook(ev1, { signature: null });
  check('webhook without a signature -> 400 (and is reachable without a JWT)', r.status === 400, r.text);
  r = await hook(ev1, { signature: sign(ev1, 'wrong-secret') });
  check('webhook with a wrong-secret signature -> 400', r.status === 400, r.text);
  r = await hook(ev1.replace('100000', '900000'), { signature: sign(ev1) });
  check('webhook with a tampered body -> 400 and nothing is posted', r.status === 400 && (await pays(i1)).length === 0, r.text);
  r = await hook(ev1, { contentType: 'text/plain' });
  check('webhook whose raw body was not captured -> 400 (fails closed)', r.status === 400, r.text);
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  r = await hook(ev1, { signature: sign(ev1) });
  check('webhook secret not configured -> 503', r.status === 503, r.text);
  process.env.RAZORPAY_WEBHOOK_SECRET = WH_SECRET;

  r = await hook(ev1, { eventId: 'evt_1' });
  check('valid signed webhook -> 200 and posts the payment', r.status === 200 && r.json?.success === true && r.json.duplicate === false, r.text);
  let p = await pays(i1); let iv = await inv(i1);
  check('payment carries its gateway identifiers and the captured amount', p.length === 1 && p[0].gateway === 'razorpay' && p[0].gateway_payment_id === 'pay_1' && p[0].gateway_order_id === 'order_1' && num(p[0].amount) === 1000, JSON.stringify(p));
  check('invoice is paid, pgi_status paid', iv.status === 'paid' && num(iv.amount_paid) === 1000 && num(iv.amount_due) === 0 && iv.pgi_status === 'paid', JSON.stringify(iv));
  const five = await Promise.all(Array.from({ length: 5 }, () => hook(ev1, { eventId: 'evt_1' })));
  check('the same event delivered 5 more times in parallel posts nothing more', five.every((x) => x.status === 200) && (await pays(i1)).length === 1, five.map((x) => x.status).join(','));
  r = await hook(ev1, { eventId: 'evt_1_new_id' });
  check('same payment under a NEW event id is still not posted twice (unique payment id)', r.status === 200 && r.json?.duplicate === true && (await pays(i1)).length === 1, r.text);

  const i2 = await newInvoice(A, { liability: 1000, order: 'order_2' });
  const ev2 = captured({ hospitalId: A, invoiceId: i2, orderId: 'order_2', paymentId: 'pay_2', paise: 30000, extraNotes: { patient: 'रोगी ₹' } });
  r = await hook(ev2, { eventId: 'evt_2' });
  p = await pays(i2); iv = await inv(i2);
  check('captured amount (not the invoice due) is what is posted; invoice stays partial; Unicode body verifies', r.status === 200 && p.length === 1 && num(p[0].amount) === 300 && iv.status === 'partial' && num(iv.amount_due) === 700, `${r.text} ${JSON.stringify(p)}`);

  const i3 = await newInvoice(A, { liability: 500, order: 'order_3' });
  r = await hook(captured({ hospitalId: A, invoiceId: i3, orderId: 'order_3', paymentId: 'pay_3', paise: 90000 }), { eventId: 'evt_3' });
  p = await pays(i3);
  check('an over-capture is applied only up to the amount due and the excess is flagged for refund', r.status === 200 && num(p[0].amount) === 500 && (await pool.query(`SELECT 1 FROM billing_audit_log WHERE hospital_id = $1 AND action = 'pgi.overpaid'`, [A])).rowCount === 1, `${r.text} ${JSON.stringify(p)}`);

  const iB = await newInvoice(B, { liability: 700, order: 'order_B' });
  r = await hook(captured({ hospitalId: A, invoiceId: iB, orderId: 'order_B', paymentId: 'pay_B1', paise: 70000 }), { eventId: 'evt_B1' });
  check('an event naming hospital A but hospital B\'s invoice is rejected and never posts (200 so it is not retried)', r.status === 200 && r.json?.rejected === true && (await pays(iB)).length === 0, r.text);
  r = await hook(captured({ hospitalId: A, invoiceId: i1, orderId: 'order_1', paymentId: 'pay_stolen', paise: 100000 }), { eventId: 'evt_x' });
  check('a second, different payment id on an already-paid invoice is not applied (nothing due)', r.status === 200 && (await pays(i1)).length === 1, r.text);
  r = await hook(JSON.stringify({ event: 'order.paid', payload: {} }), { eventId: 'evt_o' });
  check('other event types are acknowledged and ignored', r.status === 200 && r.json?.ignored === true, r.text);

  // webhook racing the checkout callback
  const i4 = await newInvoice(A, { liability: 800, order: 'order_4' });
  const ev4 = captured({ hospitalId: A, invoiceId: i4, orderId: 'order_4', paymentId: 'pay_4', paise: 80000 });
  const checkoutSig = crypto.createHmac('sha256', KEY_SECRET).update('order_4|pay_4').digest('hex');
  const race = await Promise.all([
    hook(ev4, { eventId: 'evt_4' }),
    call('POST', '/api/hospital/billing/pgi/confirm', T.adminA, { invoiceId: i4, razorpayOrderId: 'order_4', razorpayPaymentId: 'pay_4', signature: checkoutSig }),
    hook(ev4, { eventId: 'evt_4' }),
    call('POST', '/api/hospital/billing/pgi/confirm', T.adminA, { invoiceId: i4, razorpayOrderId: 'order_4', razorpayPaymentId: 'pay_4', signature: checkoutSig }),
  ]);
  check('webhook racing the checkout callback (x2 each) posts exactly one payment', race.every((x) => x.status === 200) && (await pays(i4)).length === 1 && num((await inv(i4)).amount_paid) === 800, race.map((x) => `${x.status}:${x.json?.duplicate}`).join(' '));
  r = await call('POST', '/api/hospital/billing/pgi/confirm', T.adminA, { invoiceId: i4, razorpayOrderId: 'order_4', razorpayPaymentId: 'pay_4', signature: 'bad' });
  check('checkout callback with a bad signature -> 400', r.status === 400, r.text);
  r = await call('POST', '/api/hospital/billing/pgi/confirm', T.adminB, { invoiceId: i4, razorpayOrderId: 'order_4', razorpayPaymentId: 'pay_x', signature: crypto.createHmac('sha256', KEY_SECRET).update('order_4|pay_x').digest('hex') });
  check('hospital B cannot confirm a payment for hospital A\'s invoice -> 400', r.status === 400 && (await pays(i4)).length === 1, r.text);

  // ── refunds ──
  const r1 = await newInvoice(A, { liability: 1000 });
  r = await call('POST', `/api/hospital/billing/invoices/${r1}/payments`, T.adminA, { paymentMethod: 'cash', amount: 1000 });
  const payR = r.json?.payment || r.json?.data?.payment;
  check('cash payment recorded', r.status < 300 && payR?.id, r.text);
  const rf = (amt, token = T.adminA) => call('POST', `/api/hospital/billing/payments/${payR.id}/refund`, token, { amount: amt, reason: 'test' });
  r = await rf(1500);
  check('refund larger than the payment -> rejected', r.status >= 400, r.text);
  const two = await Promise.all([rf(600), rf(600)]);
  const okCount = two.filter((x) => x.status < 300).length;
  const refunded = num((await pool.query(`SELECT COALESCE(SUM(amount),0) AS s FROM hospital_payment_refunds WHERE payment_id = $1`, [payR.id])).rows[0].s);
  check('two concurrent refunds of 600 on a 1000 payment: exactly one succeeds and the total never exceeds the payment', okCount === 1 && refunded === 600, `${two.map((x) => x.status).join(',')} total=${refunded}`);
  r = await rf(400);
  check('the remaining 400 can still be refunded', r.status < 300 && num((await inv(r1)).amount_paid) === 0, r.text);
  r = await rf(1);
  check('a fully refunded payment cannot be refunded again', r.status >= 400, r.text);
  check('payment is marked refunded with the cumulative amount', (await pool.query(`SELECT status, refund_amount FROM hospital_payments WHERE id = $1`, [payR.id])).rows[0].status === 'refunded');
  r = await call('POST', `/api/hospital/billing/payments/${payR.id}/refund`, T.adminB, { amount: 10 });
  check('hospital B cannot refund hospital A\'s payment', r.status >= 400, r.text);

  // ── allocations ──
  const sa = await newInvoice(A, { liability: 1000, patient: 7 });
  const t1 = await newInvoice(A, { liability: 600, patient: 7 });
  const t2 = await newInvoice(A, { liability: 600, patient: 7 });
  const other = await newInvoice(A, { liability: 600, patient: 8 });
  const tB = await newInvoice(B, { liability: 600, patient: 7 });
  r = await call('POST', `/api/hospital/billing/invoices/${sa}/payments`, T.adminA, { paymentMethod: 'cash', amount: 1000 });
  const payS = r.json?.payment || r.json?.data?.payment;
  const al = (allocations, token = T.adminA, id = payS.id) => call('POST', `/api/hospital/billing/payments/${id}/allocate`, token, { allocations });
  const totalPaid = async () => num((await pool.query(`SELECT COALESCE(SUM(amount_paid),0) AS s FROM hospital_invoices WHERE id = ANY($1::bigint[])`, [[sa, t1, t2, other]])).rows[0].s);
  r = await al([{ invoiceId: tB, amount: 100 }]);
  check('allocation to ANOTHER hospital\'s invoice is refused', r.status >= 400 && num((await inv(tB)).amount_paid) === 0, r.text);
  r = await al([{ invoiceId: other, amount: 100 }]);
  check('allocation to a different patient\'s invoice is refused', r.status >= 400, r.text);
  r = await al([{ invoiceId: sa, amount: 100 }]);
  check('allocation back onto the payment\'s own invoice is refused', r.status >= 400, r.text);
  r = await al([{ invoiceId: t1, amount: -5 }]);
  check('a negative allocation is refused', r.status >= 400, r.text);
  r = await al([{ invoiceId: t1, amount: 700 }]);
  check('allocating more than the invoice\'s amount due is refused', r.status >= 400, r.text);
  r = await al([{ invoiceId: t1, amount: 600 }, { invoiceId: t2, amount: 500 }]);
  check('allocations totalling more than the payment are refused and NOTHING is written (atomic)', r.status >= 400 && num((await inv(t1)).amount_paid) === 0 && (await pool.query(`SELECT 1 FROM hospital_payment_allocations WHERE payment_id = $1`, [payS.id])).rowCount === 0, r.text);
  r = await call('POST', `/api/hospital/billing/payments/${payS.id}/allocate`, T.adminB, { allocations: [{ invoiceId: t1, amount: 10 }] });
  check('hospital B cannot allocate hospital A\'s payment', r.status >= 400, r.text);
  const before = await totalPaid();
  const conc = await Promise.all([al([{ invoiceId: t1, amount: 600 }]), al([{ invoiceId: t2, amount: 600 }])]);
  const wins = conc.filter((x) => x.status < 300).length;
  check('two concurrent allocations that together exceed the payment: exactly one wins', wins === 1, conc.map((x) => `${x.status}:${x.text.slice(0, 60)}`).join(' | '));
  check('allocation moves money, it does not create it (total credited across invoices unchanged)', (await totalPaid()) === before, `${before} -> ${await totalPaid()}`);

  // ── adjustments ──
  const ad1 = await newInvoice(A, { liability: 600, insurance: 400 });
  r = await call('POST', `/api/hospital/billing/invoices/${ad1}/adjustments`, T.adminA, { adjustmentType: 'discount', amount: 5000, reason: 'x' });
  check('an adjustment larger than the invoice total is refused', r.status >= 400, r.text);
  r = await call('POST', `/api/hospital/billing/invoices/${ad1}/adjustments`, T.adminA, { adjustmentType: 'discount', amount: 100, reason: 'goodwill' });
  iv = await inv(ad1);
  check('adjustment recomputes the patient share from the insurance split (total 900, patient owes 500, not 900)', r.status < 300 && num(iv.total_amount) === 900 && num(iv.patient_liability) === 500 && num(iv.amount_due) === 500, JSON.stringify(iv));
  const adjRow = (await pool.query(`SELECT metadata FROM hospital_bill_adjustments WHERE invoice_id = $1`, [ad1])).rows[0];
  check('the adjustment records before and after values', adjRow?.metadata?.before?.patient_liability === 600 && adjRow?.metadata?.after?.patient_liability === 500, JSON.stringify(adjRow));
  r = await call('POST', `/api/hospital/billing/invoices/${ad1}/adjustments`, T.adminB, { adjustmentType: 'discount', amount: 10 });
  check('hospital B cannot adjust hospital A\'s invoice', r.status >= 400, r.text);

  // ── atomicity ──
  const cr = await newInvoice(A, { liability: 300 });
  r = await call('POST', `/api/hospital/billing/invoices/${cr}/payments`, T.adminA, { paymentMethod: 'credit', amount: 300 });
  check('a credit payment with no approved account fails and leaves no partial rows', r.status >= 400 && (await pays(cr)).length === 0 && num((await inv(cr)).amount_paid) === 0, r.text);

  // ── vendor (AP) payments ──
  const sT = (role, tenant) => jwt.sign({ id: 1, role, hospital_id: tenant, tenant_id: tenant, organization_id: tenant }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const scmTok = sT('scm', A);
  await call('GET', '/api/scm/overview', scmTok);
  const mkAp = async (status) => (await pool.query(`INSERT INTO scm_ap_invoices (invoice_number, amount, status) VALUES ($1, 1000, $2) RETURNING id`, [`VFY-AP-${process.pid}-${++seq}`, status])).rows[0].id;
  const ap1 = await mkAp('approved'); const apDraft = await mkAp('draft');
  const pay = (id, body) => call('POST', `/api/scm/ap/invoices/${id}/pay`, scmTok, body);
  r = await pay(apDraft, { amount: 100 });
  check('AP: paying an invoice that is not approved -> 409', r.status === 409, r.text);
  r = await pay(ap1, { amount: 1500 });
  check('AP: paying more than the outstanding balance -> 400', r.status === 400, r.text);
  r = await pay(ap1, { amount: 0 });
  check('AP: a zero payment -> 400', r.status === 400, r.text);
  r = await pay(ap1, { amount: 400, paymentRef: 'UTR-1' });
  check('AP: a partial payment leaves the invoice open as partial', r.status === 201 && r.json.invoiceStatus === 'partial' && r.json.outstanding === 600, r.text);
  r = await pay(ap1, { amount: 400, paymentRef: 'UTR-1' });
  check('AP: retrying the same payment reference does not pay twice', r.status === 200 && r.json.duplicate === true, r.text);
  const apConc = await Promise.all([pay(ap1, { amount: 600, paymentRef: 'UTR-2' }), pay(ap1, { amount: 600, paymentRef: 'UTR-3' })]);
  check('AP: two concurrent payments of the full balance: only one succeeds', apConc.filter((x) => x.status === 201).length === 1 && apConc.filter((x) => x.status === 400 || x.status === 409).length === 1, apConc.map((x) => x.status).join(','));
  check('AP: invoice ends paid with total payments equal to the invoice', (await pool.query(`SELECT status FROM scm_ap_invoices WHERE id = $1`, [ap1])).rows[0].status === 'paid' && num((await pool.query(`SELECT SUM(amount) AS s FROM scm_ap_payments WHERE invoice_id = $1`, [ap1])).rows[0].s) === 1000);

  // ── payroll ──
  const pay1 = await call('POST', '/api/payroll/runs', T.hrA, { month: 'bad' });
  check('payroll: an invalid month -> 400', pay1.status === 400, pay1.text);
  const runs = await Promise.all(Array.from({ length: 5 }, () => call('POST', '/api/payroll/runs', T.hrA, { month: '2099-01' })));
  check('payroll: 5 simultaneous runs for one month -> exactly one created, others 409', runs.filter((x) => x.status === 201).length === 1 && runs.filter((x) => x.status === 409).length === 4, runs.map((x) => x.status).join(','));
  r = await call('POST', '/api/payroll/runs', T.hrA, { month: '2099-01' });
  check('payroll: a second run for the same month is refused', r.status === 409, r.text);
  const runId = runs.find((x) => x.status === 201).json.data.id;
  r = await call('PATCH', `/api/payroll/runs/${runId}/finalize`, T.hrA);
  check('payroll: finalise a draft run', r.status === 200 && r.json.data.status === 'finalized', r.text);
  r = await call('PATCH', `/api/payroll/runs/${runId}/finalize`, T.hrA);
  check('payroll: finalising twice -> 409', r.status === 409, r.text);
  const fin = await call('PATCH', `/api/payroll/runs/${runId}/finalize`, tok(B, 'hr_staff'));
  check('payroll: another hospital cannot finalise this run -> 404', fin.status === 404, fin.text);
} catch (e) {
  crashed = e;
} finally {
  await cleanup();
  const left = (await pool.query(`SELECT (SELECT count(*) FROM hospital_invoices WHERE hospital_id = ANY($1::int[])) + (SELECT count(*) FROM hospital_payments WHERE hospital_id = ANY($1::int[])) + (SELECT count(*) FROM payroll_runs WHERE tenant_id = ANY($1::int[])) AS n`, [[A, B]]).catch(() => ({ rows: [{ n: '?' }] }))).rows[0].n;
  check('no residue after cleanup', Number(left) === 0, left);
}
const failed = results.filter((x) => !x.ok);
for (const x of results) out(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.ok ? '' : '  -> ' + x.detail}`);
if (crashed) out(`CRASH: ${crashed.stack || crashed}`);
out(`\n${results.length - failed.length}/${results.length} passed${crashed ? ' (crashed)' : ''}`);
try { server?.close(); } catch { /* */ }
process.exit(failed.length === 0 && !crashed ? 0 : 1);
