/** Who may see and change which patient leads (the plan's "What each role can do", 16 Nov 2026).
 *
 *   Field Marketing Executive (sales_rep)   own leads and patients only (assigned_to = them)
 *   Call Centre Agent (telecaller, conversion), marketing roles   every lead (lookup and follow-up)
 *   Business Head, Marketing Head, admin   every lead, and may reassign
 *
 * Reassigning: only managers. Anyone who can see an unassigned lead may take it themselves.
 * Recordings: managers hear every call; a field executive hears calls on their own patients; an agent
 * hears the calls they handled. */
import sharedPool from '../db/pgPool.js';

const ORG_WIDE = new Set(['admin', 'business_head', 'marketing_head', 'marketing', 'telecaller', 'conversion']);
const MANAGERS = new Set(['admin', 'business_head', 'marketing_head']);
const roleOf = (u) => u?.crmRole || 'sales_rep';
export const ownScope = (u) => !u?.isAdmin && !ORG_WIDE.has(roleOf(u));
export const canReassign = (u) => Boolean(u?.isAdmin) || MANAGERS.has(roleOf(u));
export const canHearAllCalls = canReassign;
const notFound = () => Object.assign(new Error('Lead not found'), { statusCode: 404 });

/** Legacy crm_leads id. Throws 404 (not 403) so a lead's existence isn't revealed. */
export async function assertLegacyLeadAccess(u, legacyId) {
  if (!ownScope(u)) return;
  const { rows: [l] } = await sharedPool.query(`SELECT assigned_to FROM crm_leads WHERE id = $1`, [Number(legacyId) || 0]);
  if (!l || Number(l.assigned_to) !== Number(u.id)) throw notFound();
}

/** crm_leads_v2 id (Inbox, Hospital CRM). */
export async function assertV2LeadAccess(u, tenantId, v2Id) {
  if (!ownScope(u)) return;
  const { rows: [l] } = await sharedPool.query(
    `SELECT l.assigned_to FROM crm_leads_v2 lv JOIN crm_leads l ON l.id = lv.legacy_lead_id WHERE lv.tenant_id = $1 AND lv.id = $2`,
    [Number(tenantId), Number(v2Id) || 0]);
  if (!l || Number(l.assigned_to) !== Number(u.id)) throw notFound();
}

/** Changing a lead's owner from currentOwner to nextOwner. */
export function assertCanAssign(u, currentOwner, nextOwner) {
  if (canReassign(u)) return;
  const cur = currentOwner == null ? null : Number(currentOwner);
  const next = nextOwner == null || nextOwner === '' ? null : Number(nextOwner);
  if (next === cur) return;
  if (cur == null && next === Number(u.id)) return; // taking an unassigned lead
  throw Object.assign(new Error('Only a Business Head, Marketing Head or administrator can reassign leads. You can take an unassigned lead yourself.'), { statusCode: 403 });
}

/** A call recording on a lead the caller can already see. */
export async function assertRecordingAccess(u, tenantId, eventKey) {
  if (canHearAllCalls(u) || ownScope(u)) return; // a field executive only reaches their own patients' calls
  const m = /^evt:(\d+)$/.exec(String(eventKey || ''));
  const { rows: [me] } = await sharedPool.query(`SELECT metadata->>'telecmi_user_id' AS agent FROM users WHERE id = $1`, [u.id]);
  if (m) {
    const { rows: [e] } = await sharedPool.query(`SELECT owner_user_id, metadata->>'agent_user' AS agent FROM crm_communication_events WHERE id = $1 AND tenant_id = $2`, [Number(m[1]), Number(tenantId)]);
    if (e && (Number(e.owner_user_id) === Number(u.id) || (me?.agent && e.agent === me.agent))) return;
  }
  throw Object.assign(new Error('You can play recordings of calls you handled. Ask a Business Head for others.'), { statusCode: 403 });
}
