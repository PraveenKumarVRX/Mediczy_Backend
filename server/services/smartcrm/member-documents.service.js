/**
 * The member's claims and e-cards from SmartCRM (ADR-001: the app calls only
 * Mediqzy; Mediqzy calls SmartCRM's partner API for the linked member).
 *
 * Neither takes an identity from the request. Claims are read for the linked
 * member's emp_id. An e-card is asked for by Mediqzy's own wallet ids
 * (insurance_policies.id, policy_members.id), checked here to be a SmartCRM
 * row of the caller's own family; the policy and card numbers sent to
 * SmartCRM come from that row, never from the app. SmartCRM checks again that
 * the card is on that member's family (CARD_NOT_FOUND otherwise).
 */
import pool from '../../db/pgPool.js';
import { SOURCE_SYSTEM, SmartCrmError, loadBinding, schemaAvailable } from './config.js';
import { partnerRequest } from './partner-client.js';
import { getActiveLink } from './member-link.service.js';
import { auditPartnerEvent } from './audit.js';
import { money } from './summary-mapper.js';

const positiveInt = (v) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const text = (v, max = 255) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
const isoDate = (v) => {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

async function readContext(userId, db) {
  if (!(await schemaAvailable(db))) throw new SmartCrmError('SCHEMA_NOT_MIGRATED', 'Insurance sync is not available yet.', 503);
  const link = await getActiveLink(userId, db);
  if (!link) throw new SmartCrmError('NOT_LINKED', 'Link your insurance membership first.', 409);
  const binding = await loadBinding(link.corporate_id, db);
  if (!binding?.read_enabled || binding.tenant_slug !== link.source_tenant || binding.smartcrm_corporate !== link.source_corporate) {
    throw new SmartCrmError('NOT_CONFIGURED', 'Insurance sync is not enabled for your employer.', 503);
  }
  return { link, binding };
}

function upstreamError(response, what) {
  const code = response.body?.error?.code;
  if (response.status === 401 || response.status === 403) {
    return new SmartCrmError('NOT_CONFIGURED', 'Insurance sync is not configured correctly for your employer.', 503);
  }
  if (response.status === 404 && code === 'MEMBER_NOT_FOUND') {
    return new SmartCrmError('MEMBER_NOT_FOUND', 'Your insurer has no active membership for you. Please contact your HR team.', 404);
  }
  if (response.status === 404 && ['ECARD_NOT_AVAILABLE', 'CARD_NOT_FOUND', 'POLICY_NOT_FOUND'].includes(code)) {
    return new SmartCrmError(code, code === 'ECARD_NOT_AVAILABLE' ? 'Your insurer has not issued this e-card yet.' : 'This e-card could not be found.', 404);
  }
  return new SmartCrmError('UPSTREAM_REJECTED', `Your ${what} could not be loaded.`, 502, { upstreamStatus: response.status });
}

/** SmartCRM ClaimList row -> what the app shows. */
export function mapClaim(c) {
  if (!c || typeof c !== 'object') return null;
  const number = text(c.Claim_Number, 80);
  return {
    id: number || (c.id != null ? `smartcrm-${c.id}` : null),
    claimNumber: number,
    patientName: text(c.Name_of_the_Patient),
    relation: text(c.Relation, 60),
    hospital: text(c.Name_of_Hospital),
    ailment: text(c.Ailment, 500),
    admissionDate: isoDate(c.Date_of_Admission),
    dischargeDate: isoDate(c.Date_of_Discharge),
    claimType: text(c.Claim_Type, 60),
    billedAmount: money(c.Total_Bill_Amount),
    paidAmount: money(c.Paid_Amount),
    status: text(c.Primary_Claim_Status, 80),
    sumInsured: money(c.Sum_Insured),
    policyNumber: text(c.POLICY_NUMBER, 100),
    source: SOURCE_SYSTEM,
  };
}

export async function listMemberClaims({ userId, requestId = null, fetchImpl } = {}, db = pool) {
  const id = positiveInt(userId);
  const { link, binding } = await readContext(id, db);
  const response = await partnerRequest(binding, link, { op: 'claims', method: 'GET', userId: id, requestId, fetchImpl });
  await auditPartnerEvent({ action: 'smartcrm.claims.read', userId: id, corporateId: link.corporate_id, requestId, resourceId: link.source_member_id || link.id, metadata: { status: response.status, ms: response.ms } }, db);
  if (response.status !== 200) throw upstreamError(response, 'claims');
  const rows = response.body?.data?.claims;
  if (response.body?.success !== true || !Array.isArray(rows)) {
    throw new SmartCrmError('BAD_UPSTREAM_PAYLOAD', 'Your claims could not be read. We have been notified.', 502);
  }
  return rows.slice(0, 500).map(mapClaim).filter(Boolean);
}

/**
 * The member's own e-card, or a dependant's.
 * @returns {{ filename:string, mimeType:string, buffer?:Buffer, url?:string }}
 */
export async function getMemberEcard({ userId, policyId, memberId, requestId = null, fetchImpl } = {}, db = pool) {
  const id = positiveInt(userId);
  const pid = positiveInt(policyId);
  const mid = positiveInt(memberId);
  if (!pid || !mid) throw new SmartCrmError('BAD_REQUEST', 'policyId and memberId are required.', 400);
  const { link, binding } = await readContext(id, db);
  const { rows: [row] } = await db.query(
    `SELECT pm.relationship, pm."memberCardNumber" AS card_no, pm."memberName" AS name,
            p.metadata->>'sourcePolicyNumber' AS policy_no
       FROM policy_members pm
       JOIN insurance_policies p ON p.id = pm."policyId"
      WHERE pm.id = $1 AND pm."policyId" = $2
        AND pm."primaryMemberUserId" = $3
        AND pm.source_system = $4 AND p.source_system = $4
        AND COALESCE(pm."isActive", TRUE) = TRUE`,
    [mid, pid, id, SOURCE_SYSTEM]
  );
  if (!row || !row.policy_no) throw new SmartCrmError('NOT_FOUND', 'This e-card could not be found.', 404);
  const isSelf = row.relationship === 'self';
  if (!isSelf && !row.card_no) throw new SmartCrmError('ECARD_NOT_AVAILABLE', 'Your insurer has not issued this e-card yet.', 404);
  const query = { policy_no: row.policy_no, ...(isSelf ? {} : { card_no: row.card_no }) };
  const response = await partnerRequest(binding, link, { op: 'ecard', method: 'GET', userId: id, requestId, fetchImpl, query });
  await auditPartnerEvent({ action: 'smartcrm.ecard.read', userId: id, corporateId: link.corporate_id, requestId, resourceId: String(mid), metadata: { status: response.status, ms: response.ms, self: isSelf, source: response.body?.data?.source || null } }, db);
  if (response.status !== 200) throw upstreamError(response, 'e-card');
  const data = response.body?.data;
  if (response.body?.success !== true || !data) throw new SmartCrmError('BAD_UPSTREAM_PAYLOAD', 'Your e-card could not be read. We have been notified.', 502);
  const filename = (text(data.filename, 120) || 'e-card.pdf').replace(/[^A-Za-z0-9._-]+/g, '-');
  if (data.documentBase64) {
    const buffer = Buffer.from(String(data.documentBase64), 'base64');
    if (!buffer.length) throw new SmartCrmError('BAD_UPSTREAM_PAYLOAD', 'Your e-card could not be read. We have been notified.', 502);
    const isPdf = buffer.subarray(0, 4).toString() === '%PDF';
    const isPng = buffer.subarray(1, 4).toString() === 'PNG';
    const isJpg = buffer[0] === 0xff && buffer[1] === 0xd8;
    if (!isPdf && !isPng && !isJpg) throw new SmartCrmError('BAD_UPSTREAM_PAYLOAD', 'Your e-card could not be read. We have been notified.', 502);
    return { filename, mimeType: isPdf ? 'application/pdf' : isPng ? 'image/png' : 'image/jpeg', buffer };
  }
  const url = text(data.documentUrl, 2000);
  if (url && /^https:\/\//i.test(url)) return { filename, mimeType: 'application/pdf', url };
  throw new SmartCrmError('ECARD_NOT_AVAILABLE', 'Your insurer has not issued this e-card yet.', 404);
}

export default { listMemberClaims, getMemberEcard, mapClaim };
