/** Push notifications to the app (Firebase Cloud Messaging, HTTP v1).
 *
 * Phones register their FCM token at POST /api/app/devices (crm_push_devices). A sweep every minute sends:
 *   - every new row in field_notifications (approval decisions, quota moves, pipeline moves) to its user
 *   - new approvals waiting (expenses, tour plans, out-of-beat visits) to Business Heads and admins
 *   - tasks and callbacks as they fall due, to whoever owns them
 * Only items from the last 15 minutes are sent, so switching push on never replays a backlog.
 *
 * Configuration: FCM_SERVICE_ACCOUNT_JSON (the Firebase service account key, as JSON) for the Firebase project
 * the app is registered in. Without it everything here is a no-op; nothing is queued or lost. */
import jwt from 'jsonwebtoken';
import sharedPool from '../db/pgPool.js';
import { vendorFetch } from '../integrations/transport.js';

// Both the token exchange and the send are Firebase Cloud Messaging calls (kill switch, timeout, circuit).
const fetch = vendorFetch('firebase-fcm');

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
let account;
function serviceAccount() {
  if (account !== undefined) return account;
  try { account = process.env.FCM_SERVICE_ACCOUNT_JSON ? JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON) : null; }
  catch { console.error('[push] FCM_SERVICE_ACCOUNT_JSON is not valid JSON'); account = null; }
  if (account && !(account.project_id && account.client_email && account.private_key)) account = null;
  return account;
}
export const pushConfigured = () => Boolean(serviceAccount());

let token = { value: null, exp: 0 };
async function accessToken() {
  if (token.value && Date.now() < token.exp - 60000) return token.value;
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 },
    sa.private_key, { algorithm: 'RS256' });
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Google token: ${data.error || res.status}`);
  token = { value: data.access_token, exp: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return token.value;
}

// ── Devices ──────────────────────────────────────────────────────────────────────────────────────
export async function registerDevice(user, { token: fcm, platform, app_version } = {}) {
  const t = String(fcm || '').trim();
  if (t.length < 20 || t.length > 4096) throw fail(400, 'Invalid device token');
  if (!['android', 'ios'].includes(platform)) throw fail(400, 'Platform must be android or ios');
  await sharedPool.query(
    `INSERT INTO crm_push_devices (tenant_id, user_id, token, platform, app_version) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (token) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, user_id = EXCLUDED.user_id, platform = EXCLUDED.platform,
       app_version = EXCLUDED.app_version, last_seen_at = now(), revoked_at = NULL`,
    [Number(user.tenantId), Number(user.id), t, platform, String(app_version || '').slice(0, 40) || null]);
  return { registered: true, push: pushConfigured() };
}
export async function unregisterDevice(user, fcm) {
  await sharedPool.query(`UPDATE crm_push_devices SET revoked_at = now() WHERE token = $1 AND user_id = $2`, [String(fcm || ''), Number(user.id)]);
  return { unregistered: true };
}

// ── Sending ──────────────────────────────────────────────────────────────────────────────────────
export async function pushToUsers(tenantId, userIds, { title, body, data = {} }) {
  if (!pushConfigured() || !userIds.length) return { sent: 0 };
  const { rows: devices } = await sharedPool.query(
    `SELECT token FROM crm_push_devices WHERE tenant_id = $1 AND user_id = ANY($2::int[]) AND revoked_at IS NULL`, [tenantId, [...new Set(userIds.map(Number))]]);
  if (!devices.length) return { sent: 0 };
  const sa = serviceAccount();
  const bearer = await accessToken();
  let sent = 0;
  for (const d of devices) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token: d.token, notification: { title: String(title).slice(0, 120), body: String(body || '').slice(0, 300) },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])), android: { priority: 'high' } } }),
    }).catch(() => null);
    if (res?.ok) sent += 1;
    else if (res && [400, 404].includes(res.status)) {
      const err = await res.json().catch(() => ({}));
      if (/UNREGISTERED|INVALID_ARGUMENT/.test(JSON.stringify(err))) await sharedPool.query(`UPDATE crm_push_devices SET revoked_at = now() WHERE token = $1`, [d.token]);
    }
  }
  return { sent };
}

/** The once-a-minute sweep. Uses a high-water mark in memory plus the 15-minute window. */
let lastSweep = null;
export async function sweep(tenantId) {
  if (!pushConfigured()) return { skipped: 'not configured' };
  const since = lastSweep && Date.now() - lastSweep < 15 * 60000 ? new Date(lastSweep) : new Date(Date.now() - 15 * 60000);
  const until = new Date();
  lastSweep = until.getTime();
  let sent = 0;
  const { rows: notes } = await sharedPool.query(
    `SELECT user_id, title, body, type, data FROM field_notifications WHERE tenant_id = $1 AND created_at > $2 AND created_at <= $3`, [tenantId, since, until]);
  for (const n of notes) sent += (await pushToUsers(tenantId, [n.user_id], { title: n.title, body: n.body, data: { kind: n.type || 'notice' } })).sent;
  const { rows: waiting } = await sharedPool.query(
    `SELECT 'expense' AS kind, count(*)::int AS n FROM field_expense_claims WHERE tenant_id = $1 AND status = 'submitted' AND submitted_at > $2 AND submitted_at <= $3
     UNION ALL SELECT 'tour_plan', count(*)::int FROM field_tour_plans WHERE tenant_id = $1 AND status = 'submitted' AND submitted_at > $2 AND submitted_at <= $3
     UNION ALL SELECT 'exception', count(*)::int FROM field_visit_exceptions WHERE tenant_id = $1 AND status = 'pending' AND created_at > $2 AND created_at <= $3`, [tenantId, since, until]);
  const total = waiting.reduce((n, w) => n + w.n, 0);
  if (total) {
    const { rows: managers } = await sharedPool.query(
      `SELECT id FROM users WHERE tenant_id = $1 AND status = 'active' AND (COALESCE("isAdmin", false) OR metadata->>'crmRole' IN ('admin', 'business_head'))`, [tenantId]);
    sent += (await pushToUsers(tenantId, managers.map((m) => m.id), { title: `${total} new approval${total === 1 ? '' : 's'} waiting`, body: 'Expenses, tour plans or out-of-beat visits from the field team.', data: { kind: 'approvals' } })).sent;
  }
  const { rows: due } = await sharedPool.query(
    `SELECT COALESCE(a.assigned_to, a.created_by) AS user_id, a.title, a.id FROM crm_activities a JOIN tenants t ON t.unique_id = a.tenant_uid AND t.id = $1
      WHERE a.type = 'task' AND a.completed_at IS NULL AND a.scheduled_at > $2 AND a.scheduled_at <= $3`, [tenantId, since, until]);
  for (const t of due) sent += (await pushToUsers(tenantId, [t.user_id], { title: 'Follow-up due now', body: t.title, data: { kind: 'task', task_id: t.id } })).sent;
  return { sent };
}
