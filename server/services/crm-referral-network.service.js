/** Referral network: the doctors who refer patients to Medstar, and the field work around them.
 *
 * Web counterpart of the Smart-Force app. Reads the field_* tables the app writes (doctors, visits,
 * intel, CME, camps, samples) and joins them to CRM patient leads, so a doctor's referrals and their
 * journey (booked, visited, treated) are visible in one place.
 *
 * Credit: crm_leads_v2.referring_doctor_id (+ referred_by_user_id), set when a referral is recorded
 * here or from the app, and mirrored to crm_provider_referrals for the Growth reports.
 *
 * Scope: Business Head / Marketing Head / admin see everything; a field executive (sales_rep) sees the
 * doctors assigned to them; call-centre roles can look doctors up (read-only). */
import sharedPool from '../db/pgPool.js';
import { syncLegacyLeadToV2 } from './crm-v2-sync.service.js';
import { sendTemplateToNumber } from './gupshup-control.service.js';

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const positive = (v) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const clean = (v, max = 200) => { const s = String(v ?? '').trim().slice(0, max); return s || null; };
const digits = (p) => String(p || '').replace(/\D/g, '');

export const POTENTIAL = ['low', 'medium', 'high', 'champion'];
export const RELATIONSHIP = ['prospect', 'contacted', 'visiting', 'active_referrer', 'champion', 'inactive', 'competitor_locked'];
// Journey steps (crm_leads_v2.lifecycle_stage) used for referral outcomes.
const BOOKED = `('appointment_requested','appointment_booked','appointment_confirmed','visited','consulted','investigation_advised','procedure_advised','admission_advised','billing_completed','won')`;
const VISITED = `('visited','consulted','investigation_advised','procedure_advised','admission_advised','billing_completed','won')`;
const TREATED = `('billing_completed','won')`;

export function scopeFor(crmUser) {
  const role = crmUser?.crmRole || 'sales_rep';
  const manager = Boolean(crmUser?.isAdmin) || ['admin', 'business_head', 'marketing_head'].includes(role);
  return {
    tenantId: Number(crmUser.tenantId), tenantUid: crmUser.tenantUid, userId: Number(crmUser.id) || null, role,
    manager,
    own: !manager && role === 'sales_rep', // a field executive sees their own doctors
    canEdit: manager || role === 'sales_rep',
    canRefer: true,
  };
}
function ensureManager(ctx) { if (!ctx.manager) throw fail(403, 'Only a Business Head, Marketing Head or administrator can do this.'); }
const ownSql = (ctx, alias, param) => (ctx.own ? ` AND ${alias}.assigned_exec_id = ${param}` : '');

async function loadDoctor(ctx, id, db = sharedPool) {
  const doctorId = positive(id);
  if (!doctorId) throw fail(400, 'Invalid doctor');
  const { rows: [d] } = await db.query(
    `SELECT d.*, NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS owner_name
       FROM field_doctor_crm d LEFT JOIN users u ON u.id = d.assigned_exec_id AND u.tenant_id = d.tenant_id
      WHERE d.id = $1 AND d.tenant_id = $2`, [doctorId, ctx.tenantId]);
  if (!d) throw fail(404, 'Doctor not found');
  if (ctx.own && Number(d.assigned_exec_id) !== ctx.userId) throw fail(404, 'Doctor not found');
  return d;
}

// ── Directory ────────────────────────────────────────────────────────────────────────────────────
export async function listDoctors(ctx, q = {}) {
  const params = [ctx.tenantId];
  const where = ['d.tenant_id = $1'];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (ctx.own) add('d.assigned_exec_id = ?', ctx.userId);
  const search = clean(q.search, 80);
  if (search) { params.push(`%${search}%`); const i = params.length; where.push(`(d.doctor_name ILIKE $${i} OR d.hospital_affiliation ILIKE $${i} OR d.phone ILIKE $${i} OR d.area ILIKE $${i})`); }
  if (clean(q.specialty)) add('d.specialty = ?', clean(q.specialty));
  if (clean(q.area)) add('d.area = ?', clean(q.area));
  if (POTENTIAL.includes(q.potential)) add('d.referral_potential = ?', q.potential);
  if (RELATIONSHIP.includes(q.relationship)) add('d.relationship_status = ?', q.relationship);
  if (q.owner === 'none') where.push('d.assigned_exec_id IS NULL');
  else if (positive(q.owner)) add('d.assigned_exec_id = ?', positive(q.owner));
  if (q.view === 'overdue') where.push(`(d.next_visit_date < CURRENT_DATE OR d.last_visit_date IS NULL OR d.last_visit_date < CURRENT_DATE - 30)`);
  const sort = { name: 'd.doctor_name', referrals: 'referrals_30d DESC NULLS LAST, d.doctor_name', last_visit: 'd.last_visit_date ASC NULLS FIRST', potential: `array_position(ARRAY['champion','high','medium','low'], d.referral_potential::text), d.doctor_name` }[q.sort] || 'referrals_30d DESC NULLS LAST, d.doctor_name';
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200), page = Math.max(Number(q.page) || 1, 1);
  params.push(limit, (page - 1) * limit);
  const { rows } = await sharedPool.query(
    `WITH refs AS (
       SELECT referring_doctor_id AS doctor_id, count(*)::int AS total,
              count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS last_30,
              count(*) FILTER (WHERE lifecycle_stage IN ${TREATED})::int AS treated
         FROM crm_leads_v2 WHERE tenant_id = $1 AND deleted_at IS NULL AND referring_doctor_id IS NOT NULL GROUP BY 1),
     vis AS (
       SELECT doctor_crm_id AS doctor_id, count(*) FILTER (WHERE status = 'completed' AND check_in_at > now() - interval '30 days')::int AS visits_30d
         FROM field_visits WHERE tenant_id = $1 AND doctor_crm_id IS NOT NULL GROUP BY 1)
     SELECT d.id, d.doctor_name, d.qualification, d.specialty, d.hospital_affiliation, d.area, d.city, d.phone, d.email, d.opd_days,
            d.referral_potential, d.relationship_status, d.visit_frequency_target, d.last_visit_date, d.next_visit_date, d.assigned_exec_id,
            NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS owner_name,
            COALESCE(r.total, 0) AS referrals_total, COALESCE(r.last_30, 0) AS referrals_30d, COALESCE(r.treated, 0) AS treated_total,
            COALESCE(v.visits_30d, 0) AS visits_30d,
            (d.next_visit_date < CURRENT_DATE OR d.last_visit_date IS NULL OR d.last_visit_date < CURRENT_DATE - 30) AS visit_overdue,
            count(*) OVER()::int AS total_count
       FROM field_doctor_crm d
       LEFT JOIN users u ON u.id = d.assigned_exec_id AND u.tenant_id = d.tenant_id
       LEFT JOIN refs r ON r.doctor_id = d.id LEFT JOIN vis v ON v.doctor_id = d.id
      WHERE ${where.join(' AND ')}
      ORDER BY ${sort} LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { doctors: rows.map(({ total_count, ...r }) => r), total: rows[0]?.total_count || 0, page, limit };
}

export async function directoryFacets(ctx) {
  const own = ctx.own ? ' AND assigned_exec_id = $2' : '';
  const p = ctx.own ? [ctx.tenantId, ctx.userId] : [ctx.tenantId];
  const [{ rows: specialties }, { rows: areas }, { rows: team }] = await Promise.all([
    sharedPool.query(`SELECT specialty AS value, count(*)::int AS n FROM field_doctor_crm WHERE tenant_id = $1 AND specialty IS NOT NULL${own} GROUP BY 1 ORDER BY 2 DESC LIMIT 60`, p),
    sharedPool.query(`SELECT area AS value, count(*)::int AS n FROM field_doctor_crm WHERE tenant_id = $1 AND area IS NOT NULL${own} GROUP BY 1 ORDER BY 2 DESC LIMIT 80`, p),
    teamMembers(ctx),
  ]);
  return { specialties, areas, team, potential: POTENTIAL, relationship: RELATIONSHIP, canEdit: ctx.canEdit, manager: ctx.manager };
}

export async function teamMembers(ctx) {
  const { rows } = await sharedPool.query(
    `SELECT id, NULLIF(trim(concat_ws(' ', "firstName", "lastName")), '') AS name, email, metadata->>'crmRole' AS role
       FROM users WHERE tenant_id = $1 AND status = 'active'
        AND COALESCE(metadata->>'crmRole', 'sales_rep') IN ('sales_rep', 'business_head', 'marketing_head', 'admin')
      ORDER BY 2 NULLS LAST`, [ctx.tenantId]);
  return rows;
}

function doctorFields(input, { partial = false } = {}) {
  const out = {};
  const set = (k, v) => { if (!partial || input[k] !== undefined) out[k] = v; };
  set('doctor_name', clean(input.doctor_name, 200));
  set('qualification', clean(input.qualification, 120));
  set('specialty', clean(input.specialty, 120));
  set('hospital_affiliation', clean(input.hospital_affiliation, 200));
  set('address', clean(input.address, 400));
  set('area', clean(input.area, 120));
  set('city', clean(input.city, 120));
  set('phone', clean(input.phone, 20));
  set('email', clean(input.email, 200));
  set('opd_days', clean(input.opd_days, 120));
  set('notes', clean(input.notes, 2000));
  if (!partial || input.avg_daily_patients !== undefined) out.avg_daily_patients = positive(input.avg_daily_patients);
  if (!partial || input.visit_frequency_target !== undefined) out.visit_frequency_target = Math.min(positive(input.visit_frequency_target) || 1, 31);
  if (!partial || input.referral_potential !== undefined) out.referral_potential = POTENTIAL.includes(input.referral_potential) ? input.referral_potential : 'medium';
  if (!partial || input.relationship_status !== undefined) out.relationship_status = RELATIONSHIP.includes(input.relationship_status) ? input.relationship_status : 'prospect';
  if (input.next_visit_date !== undefined) out.next_visit_date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.next_visit_date || '')) ? input.next_visit_date : null;
  if (out.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) throw fail(400, `Enter a valid email for ${out.doctor_name || 'the doctor'}`);
  if (out.phone && digits(out.phone).length < 10) throw fail(400, `Enter a 10-digit mobile for ${out.doctor_name || 'the doctor'}`);
  return out;
}
async function assertTeamMember(ctx, userId) {
  if (userId == null) return null;
  const id = positive(userId);
  const { rows } = await sharedPool.query(`SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2 AND status = 'active'`, [id, ctx.tenantId]);
  if (!rows.length) throw fail(400, 'Choose an active team member');
  return id;
}

export async function createDoctor(ctx, input = {}) {
  if (!ctx.canEdit) throw fail(403, 'Your role can look doctors up but not add them.');
  const f = doctorFields(input);
  if (!f.doctor_name) throw fail(400, 'Doctor name is required');
  const owner = ctx.own ? ctx.userId : await assertTeamMember(ctx, input.assigned_exec_id ?? null);
  if (f.phone) {
    const { rows: dup } = await sharedPool.query(`SELECT id, doctor_name FROM field_doctor_crm WHERE tenant_id = $1 AND right(regexp_replace(COALESCE(phone,''), '\\D', '', 'g'), 10) = right($2, 10) LIMIT 1`, [ctx.tenantId, digits(f.phone)]);
    if (dup.length) throw fail(409, `${dup[0].doctor_name} already has this mobile number`);
  }
  const cols = Object.keys(f);
  const { rows: [d] } = await sharedPool.query(
    `INSERT INTO field_doctor_crm (${cols.join(', ')}, assigned_exec_id, tenant_id, created_at, updated_at)
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, $${cols.length + 1}, $${cols.length + 2}, now(), now()) RETURNING id`,
    [...cols.map((k) => f[k]), owner, ctx.tenantId]);
  return loadDoctor(ctx, d.id);
}

export async function updateDoctor(ctx, id, input = {}) {
  if (!ctx.canEdit) throw fail(403, 'Your role can look doctors up but not change them.');
  const d = await loadDoctor(ctx, id);
  const f = doctorFields(input, { partial: true });
  if (f.doctor_name === null) throw fail(400, 'Doctor name is required');
  if (input.assigned_exec_id !== undefined) {
    if (!ctx.manager) throw fail(403, 'Only a Business Head can reassign doctors.');
    f.assigned_exec_id = input.assigned_exec_id === null || input.assigned_exec_id === '' ? null : await assertTeamMember(ctx, input.assigned_exec_id);
  }
  const cols = Object.keys(f);
  if (!cols.length) return d;
  await sharedPool.query(`UPDATE field_doctor_crm SET ${cols.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = $${cols.length + 1} AND tenant_id = $${cols.length + 2}`,
    [...cols.map((k) => f[k]), d.id, ctx.tenantId]);
  return loadDoctor(ctx, d.id);
}

// CSV import (parsed in the browser): match on mobile, else on name + area; fill blanks, never overwrite.
export async function importDoctors(ctx, rows = []) {
  ensureManager(ctx);
  if (!Array.isArray(rows) || !rows.length) throw fail(400, 'No rows to import');
  if (rows.length > 2000) throw fail(400, 'Import at most 2,000 doctors at a time');
  const result = { created: 0, updated: 0, skipped: [] };
  const client = await sharedPool.connect();
  try {
    await client.query('BEGIN');
    for (const [i, raw] of rows.entries()) {
      let f;
      try { f = doctorFields(raw || {}); } catch (e) { result.skipped.push({ row: i + 2, reason: e.message }); continue; }
      if (!f.doctor_name) { result.skipped.push({ row: i + 2, reason: 'No doctor name' }); continue; }
      let owner = null;
      if (raw.owner_email) {
        const { rows: u } = await client.query(`SELECT id FROM users WHERE tenant_id = $1 AND lower(email) = lower($2) AND status = 'active'`, [ctx.tenantId, String(raw.owner_email).trim()]);
        owner = u[0]?.id || null;
      }
      const { rows: [match] } = await client.query(
        `SELECT id FROM field_doctor_crm WHERE tenant_id = $1 AND (
           ($2::text <> '' AND right(regexp_replace(COALESCE(phone,''), '\\D', '', 'g'), 10) = right($2, 10))
           OR (lower(doctor_name) = lower($3) AND COALESCE(lower(area), '') = COALESCE(lower($4), ''))) LIMIT 1`,
        [ctx.tenantId, digits(f.phone), f.doctor_name, f.area]);
      if (match) {
        const cols = Object.keys(f).filter((k) => f[k] != null && !['referral_potential', 'relationship_status', 'visit_frequency_target'].includes(k));
        await client.query(`UPDATE field_doctor_crm SET ${cols.map((k, j) => `${k} = COALESCE(${k}, $${j + 1})`).join(', ')}${owner ? `, assigned_exec_id = COALESCE(assigned_exec_id, ${Number(owner)})` : ''}, updated_at = now() WHERE id = $${cols.length + 1}`,
          [...cols.map((k) => f[k]), match.id]);
        result.updated += 1;
      } else {
        const cols = Object.keys(f);
        await client.query(`INSERT INTO field_doctor_crm (${cols.join(', ')}, assigned_exec_id, tenant_id, created_at, updated_at) VALUES (${cols.map((_, j) => `$${j + 1}`).join(', ')}, $${cols.length + 1}, $${cols.length + 2}, now(), now())`,
          [...cols.map((k) => f[k]), owner, ctx.tenantId]);
        result.created += 1;
      }
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  return result;
}

// ── Profile ──────────────────────────────────────────────────────────────────────────────────────
export async function doctorProfile(ctx, id) {
  const d = await loadDoctor(ctx, id);
  const [intel, stats, referrals, visits, samples, cme, camps] = await Promise.all([
    sharedPool.query(`SELECT gatekeeper_name, gatekeeper_phone, opd_days, best_visit_time, notes, updated_at FROM field_doctor_intel WHERE doctor_crm_id = $1 AND tenant_id = $2 ORDER BY updated_at DESC LIMIT 1`, [d.id, ctx.tenantId]),
    sharedPool.query(
      `SELECT count(*)::int AS referrals,
              count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS referrals_30d,
              count(*) FILTER (WHERE created_at BETWEEN now() - interval '60 days' AND now() - interval '30 days')::int AS referrals_prev_30d,
              count(*) FILTER (WHERE lifecycle_stage IN ${BOOKED})::int AS booked,
              count(*) FILTER (WHERE lifecycle_stage IN ${VISITED})::int AS visited,
              count(*) FILTER (WHERE lifecycle_stage IN ${TREATED})::int AS treated,
              count(*) FILTER (WHERE lifecycle_stage IN ('lost','dormant','duplicate'))::int AS lost,
              COALESCE(sum(actual_revenue) FILTER (WHERE lifecycle_stage IN ${TREATED}), 0)::numeric AS revenue
         FROM crm_leads_v2 WHERE tenant_id = $1 AND referring_doctor_id = $2 AND deleted_at IS NULL`, [ctx.tenantId, d.id]),
    sharedPool.query(
      `SELECT lv.id AS lead_id, lv.legacy_lead_id, l.name, l.phone, lv.lifecycle_stage, lv.created_at, lv.next_action, lv.next_action_at,
              NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS owner_name,
              NULLIF(trim(concat_ws(' ', rb."firstName", rb."lastName")), '') AS referred_by_name
         FROM crm_leads_v2 lv JOIN crm_leads l ON l.id = lv.legacy_lead_id
         LEFT JOIN users u ON u.id = l.assigned_to AND u.tenant_id = lv.tenant_id
         LEFT JOIN users rb ON rb.id = lv.referred_by_user_id AND rb.tenant_id = lv.tenant_id
        WHERE lv.tenant_id = $1 AND lv.referring_doctor_id = $2 AND lv.deleted_at IS NULL
        ORDER BY lv.created_at DESC LIMIT 100`, [ctx.tenantId, d.id]),
    sharedPool.query(
      `SELECT v.id, v.status, v.purpose, v.visit_type, v.planned_at, v.check_in_at, v.check_out_at, v.duration_seconds, v.met_person, v.met_designation,
              v.outcome, v.services_discussed, v.materials_shared, v.next_action, v.follow_up_date, v.check_in_lat, v.check_in_lng, v.check_in_accuracy_m,
              v.photo_proof_url IS NOT NULL AS has_photo, v.is_unplanned,
              NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS exec_name
         FROM field_visits v LEFT JOIN users u ON u.id = v.user_id
        WHERE v.tenant_id = $1 AND v.doctor_crm_id = $2 ORDER BY COALESCE(v.check_in_at, v.planned_at) DESC NULLS LAST LIMIT 50`, [ctx.tenantId, d.id]),
    sharedPool.query(
      `SELECT h.id, h.items, h.created_at, h.digital_signature_url IS NOT NULL AS signed, h.geofence_verified,
              NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS exec_name
         FROM field_handovers h LEFT JOIN users u ON u.id = h.user_id
        WHERE h.tenant_id = $1 AND h.doctor_crm_id = $2 ORDER BY h.created_at DESC LIMIT 50`, [ctx.tenantId, d.id]),
    sharedPool.query(
      `SELECT e.id, e.name, e.event_type, e.scheduled_at, e.status, 'speaker' AS role, s.honorarium, s.compliance_cleared, NULL::boolean AS attended
         FROM field_cme_speakers s JOIN field_cme_events e ON e.id = s.cme_event_id WHERE s.tenant_id = $1 AND s.doctor_crm_id = $2
       UNION ALL
       SELECT e.id, e.name, e.event_type, e.scheduled_at, e.status, 'attendee', NULL, NULL, a.attended
         FROM field_cme_attendees a JOIN field_cme_events e ON e.id = a.cme_event_id WHERE a.tenant_id = $1 AND a.doctor_crm_id = $2
       ORDER BY 4 DESC LIMIT 50`, [ctx.tenantId, d.id]),
    sharedPool.query(
      `SELECT r.id, r.patient_name, r.created_at, r.crm_lead_id, c.camp_name
         FROM field_camp_registrations r LEFT JOIN health_camps c ON c.id = r.camp_id
        WHERE r.tenant_id = $1 AND r.referred_to ILIKE '%' || $2 || '%' ORDER BY r.created_at DESC LIMIT 20`, [ctx.tenantId, d.doctor_name]),
  ]);
  const { rows: messages } = await sharedPool.query(
    `SELECT e.id, e.body_preview AS body, e.status, e.created_at, e.metadata->>'template' AS template, NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS by_name
       FROM crm_communication_events e LEFT JOIN users u ON u.id = e.owner_user_id
      WHERE e.tenant_id = $1 AND e.lead_id IS NULL AND e.metadata->>'doctor_crm_id' = $2::text ORDER BY e.created_at DESC LIMIT 50`, [ctx.tenantId, String(d.id)]);
  return { doctor: d, intel: intel.rows[0] || null, stats: stats.rows[0], referrals: referrals.rows, visits: visits.rows,
    samples: samples.rows, events: cme.rows, camp_referrals: camps.rows, messages, canEdit: ctx.canEdit, manager: ctx.manager };
}

export async function saveIntel(ctx, id, input = {}) {
  if (!ctx.canEdit) throw fail(403, 'Your role can look doctors up but not change them.');
  const d = await loadDoctor(ctx, id);
  const v = { gatekeeper_name: clean(input.gatekeeper_name, 120), gatekeeper_phone: clean(input.gatekeeper_phone, 20), opd_days: clean(input.opd_days, 120),
    best_visit_time: clean(input.best_visit_time, 120), notes: clean(input.notes, 2000) };
  const { rows: [existing] } = await sharedPool.query(`SELECT id FROM field_doctor_intel WHERE doctor_crm_id = $1 AND tenant_id = $2 ORDER BY updated_at DESC LIMIT 1`, [d.id, ctx.tenantId]);
  if (existing) {
    await sharedPool.query(`UPDATE field_doctor_intel SET gatekeeper_name=$1, gatekeeper_phone=$2, opd_days=$3, best_visit_time=$4, notes=$5, updated_by=$6, updated_at=now() WHERE id=$7`,
      [v.gatekeeper_name, v.gatekeeper_phone, v.opd_days, v.best_visit_time, v.notes, ctx.userId, existing.id]);
  } else {
    await sharedPool.query(`INSERT INTO field_doctor_intel (doctor_crm_id, tenant_id, gatekeeper_name, gatekeeper_phone, opd_days, best_visit_time, notes, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
      [d.id, ctx.tenantId, v.gatekeeper_name, v.gatekeeper_phone, v.opd_days, v.best_visit_time, v.notes, ctx.userId]);
  }
  return (await doctorProfile(ctx, d.id)).intel;
}

// ── Referral credit ──────────────────────────────────────────────────────────────────────────────
/** Record a patient referred by a doctor: a CRM patient lead (or the existing lead with that mobile),
 * credited to the doctor and the person who recorded it. Used by the web and by the app. */
export async function recordReferral(ctx, doctorId, input = {}, { channel = 'web' } = {}) {
  const d = await loadDoctor({ ...ctx, own: false }, doctorId); // anyone may record a referral from any doctor
  const name = clean(input.patient_name ?? input.name, 200);
  const phone = clean(input.phone, 20);
  const need = clean(input.need, 300);
  if (!name) throw fail(400, 'Patient name is required');
  if (!phone || digits(phone).length < 10) throw fail(400, 'Enter the patient\'s 10-digit mobile');
  const client = await sharedPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [ctx.tenantUid]);
    const { rows: [existing] } = await client.query(
      `SELECT lv.id AS v2_id, lv.legacy_lead_id, lv.referring_doctor_id FROM crm_leads_v2 lv JOIN crm_leads l ON l.id = lv.legacy_lead_id
        WHERE lv.tenant_id = $1 AND lv.deleted_at IS NULL AND right(regexp_replace(COALESCE(l.phone,''), '\\D', '', 'g'), 10) = right($2, 10)
        ORDER BY lv.created_at DESC LIMIT 1`, [ctx.tenantId, digits(phone)]);
    let v2Id, legacyId, created = false;
    const note = [`Referred by Dr ${d.doctor_name.replace(/^dr\.?\s+/i, '')}${d.specialty ? ` (${d.specialty})` : ''}`, need, clean(input.notes, 1000)].filter(Boolean).join(' · ');
    if (existing) {
      v2Id = existing.v2_id; legacyId = existing.legacy_lead_id;
      if (existing.referring_doctor_id && Number(existing.referring_doctor_id) !== Number(d.id)) {
        await client.query('ROLLBACK');
        throw fail(409, 'This patient is already credited to another doctor. Change it on the doctor\'s profile if that was a mistake.');
      }
    } else {
      const owner = positive(input.owner_id) || null;
      const { rows: [lead] } = await client.query(
        `INSERT INTO crm_leads (name, phone, source, status, priority, notes, assigned_to, created_by)
         VALUES ($1, $2, 'doctor_referral', 'new', $3, $4, $5, $6) RETURNING id`,
        [name, phone, input.urgent ? 'high' : 'medium', note, owner, ctx.userId]);
      legacyId = lead.id; created = true;
      await syncLegacyLeadToV2(legacyId, ctx.tenantId, { db: client, strict: true });
      const { rows: [v2] } = await client.query(`SELECT id FROM crm_leads_v2 WHERE tenant_id = $1 AND legacy_lead_id = $2`, [ctx.tenantId, legacyId]);
      v2Id = v2.id;
    }
    await client.query(`UPDATE crm_leads_v2 SET referring_doctor_id = $1, referred_by_user_id = COALESCE(referred_by_user_id, $2),
                          source_detail = COALESCE(source_detail, $3), updated_at = now() WHERE id = $4 AND tenant_id = $5`,
      [d.id, ctx.userId, `Doctor referral: ${d.doctor_name}`.slice(0, 250), v2Id, ctx.tenantId]);
    await client.query(`INSERT INTO crm_activities (type, title, description, lead_id, completed_at, created_by, tenant_uid, created_at)
                        VALUES ('note', $1, $2, $3, now(), $4, $5, now())`,
      [`Referral from ${d.doctor_name}`.slice(0, 250), `${note} · recorded on the ${channel}`, legacyId, ctx.userId, ctx.tenantUid]);
    await client.query(`INSERT INTO crm_provider_referrals (tenant_id, referral_type, provider_name, provider_ref, lead_id, status, referred_at, metadata, created_at)
                        VALUES ($1, 'doctor', $2, $3, $4, 'referred', now(), $5::jsonb, now())`,
      [ctx.tenantId, d.doctor_name, String(d.id), v2Id, JSON.stringify({ channel, recorded_by: ctx.userId })]).catch(() => {});
    if (d.relationship_status === 'prospect' || d.relationship_status === 'contacted' || d.relationship_status === 'visiting') {
      await client.query(`UPDATE field_doctor_crm SET relationship_status = 'active_referrer', updated_at = now() WHERE id = $1`, [d.id]);
    }
    await client.query('COMMIT');
    let notified = null;
    if (input.notify_doctor) {
      // A thank-you on WhatsApp, if the doctor template is approved. Never fails the referral.
      notified = await sendDoctorMessage({ ...ctx, own: false, canEdit: true }, d.id, { family: 'doctor_referral_thanks', params: [shortDoctorName(d.doctor_name), String(name).split(/\s+/)[0]] })
        .then(() => ({ sent: true })).catch((e) => ({ sent: false, reason: e.message }));
    }
    return { lead_id: v2Id, legacy_lead_id: legacyId, created, doctor_id: d.id, notified };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
}

/** Correct or remove a lead's referral credit (managers only). */
export async function setReferralCredit(ctx, leadId, doctorId) {
  ensureManager(ctx);
  const v2 = positive(leadId);
  if (doctorId != null) await loadDoctor(ctx, doctorId);
  const { rowCount } = await sharedPool.query(`UPDATE crm_leads_v2 SET referring_doctor_id = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3`, [doctorId == null ? null : positive(doctorId), v2, ctx.tenantId]);
  if (!rowCount) throw fail(404, 'Lead not found');
  return { lead_id: v2, referring_doctor_id: doctorId == null ? null : positive(doctorId) };
}

/** A camp registration becomes a CRM patient lead (once). */
export async function campRegistrationToLead(tenantId, tenantUid, userId, registrationId) {
  const client = await sharedPool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [r] } = await client.query(
      `SELECT r.*, c.camp_name FROM field_camp_registrations r LEFT JOIN health_camps c ON c.id = r.camp_id WHERE r.id = $1 AND r.tenant_id = $2 FOR UPDATE OF r`, [registrationId, tenantId]);
    if (!r) { await client.query('ROLLBACK'); return null; }
    if (r.crm_lead_id || !r.phone || digits(r.phone).length < 10) { await client.query('ROLLBACK'); return r.crm_lead_id || null; }
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [tenantUid]);
    const { rows: [existing] } = await client.query(
      `SELECT lv.id FROM crm_leads_v2 lv JOIN crm_leads l ON l.id = lv.legacy_lead_id WHERE lv.tenant_id = $1 AND lv.deleted_at IS NULL
          AND right(regexp_replace(COALESCE(l.phone,''), '\\D', '', 'g'), 10) = right($2, 10) LIMIT 1`, [tenantId, digits(r.phone)]);
    let v2Id = existing?.id;
    if (!v2Id) {
      const notes = [`Health camp: ${r.camp_name || 'camp'}`, r.age ? `age ${r.age}` : null, r.gender, r.screening_notes, r.high_risk_flag ? 'high risk' : null, r.referred_to ? `referred to ${r.referred_to}` : null].filter(Boolean).join(' · ');
      const { rows: [lead] } = await client.query(
        `INSERT INTO crm_leads (name, phone, source, status, priority, notes, created_by) VALUES ($1, $2, 'health_camp', 'new', $3, $4, $5) RETURNING id`,
        [r.patient_name, r.phone, r.high_risk_flag ? 'high' : 'medium', notes, userId || r.registered_by || null]);
      await syncLegacyLeadToV2(lead.id, tenantId, { db: client, strict: true });
      ({ rows: [{ id: v2Id }] } = await client.query(`SELECT id FROM crm_leads_v2 WHERE tenant_id = $1 AND legacy_lead_id = $2`, [tenantId, lead.id]));
    }
    await client.query(`UPDATE field_camp_registrations SET crm_lead_id = $1 WHERE id = $2`, [v2Id, r.id]);
    await client.query('COMMIT');
    return v2Id;
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
}

// ── Network dashboard (Business Head) ────────────────────────────────────────────────────────────
export async function networkOverview(ctx, { days = 30 } = {}) {
  const period = Math.min(Math.max(Number(days) || 30, 7), 365);
  const p = [ctx.tenantId, period];
  const own = ctx.own ? ` AND d.assigned_exec_id = ${Number(ctx.userId)}` : '';
  const [{ rows: [kpi] }, { rows: league }, { rows: falling }, { rows: notVisited }, { rows: coverage }, { rows: byExec }] = await Promise.all([
    sharedPool.query(
      `SELECT (SELECT count(*)::int FROM field_doctor_crm d WHERE d.tenant_id = $1${own}) AS doctors,
              (SELECT count(DISTINCT lv.referring_doctor_id)::int FROM crm_leads_v2 lv JOIN field_doctor_crm d ON d.id = lv.referring_doctor_id WHERE lv.tenant_id = $1 AND lv.deleted_at IS NULL AND lv.created_at > now() - make_interval(days => $2)${own}) AS active_referrers,
              (SELECT count(*)::int FROM crm_leads_v2 lv JOIN field_doctor_crm d ON d.id = lv.referring_doctor_id WHERE lv.tenant_id = $1 AND lv.deleted_at IS NULL AND lv.created_at > now() - make_interval(days => $2)${own}) AS referrals,
              (SELECT count(*)::int FROM crm_leads_v2 lv JOIN field_doctor_crm d ON d.id = lv.referring_doctor_id WHERE lv.tenant_id = $1 AND lv.deleted_at IS NULL AND lv.created_at BETWEEN now() - make_interval(days => $2 * 2) AND now() - make_interval(days => $2)${own}) AS referrals_prev,
              (SELECT count(*)::int FROM crm_leads_v2 lv JOIN field_doctor_crm d ON d.id = lv.referring_doctor_id WHERE lv.tenant_id = $1 AND lv.deleted_at IS NULL AND lv.created_at > now() - make_interval(days => $2) AND lv.lifecycle_stage IN ${VISITED}${own}) AS visited,
              (SELECT count(*)::int FROM crm_leads_v2 lv JOIN field_doctor_crm d ON d.id = lv.referring_doctor_id WHERE lv.tenant_id = $1 AND lv.deleted_at IS NULL AND lv.created_at > now() - make_interval(days => $2) AND lv.lifecycle_stage IN ${TREATED}${own}) AS treated,
              (SELECT COALESCE(sum(lv.actual_revenue), 0)::numeric FROM crm_leads_v2 lv JOIN field_doctor_crm d ON d.id = lv.referring_doctor_id WHERE lv.tenant_id = $1 AND lv.deleted_at IS NULL AND lv.created_at > now() - make_interval(days => $2) AND lv.lifecycle_stage IN ${TREATED}${own}) AS revenue,
              (SELECT count(*)::int FROM field_visits v JOIN field_doctor_crm d ON d.id = v.doctor_crm_id WHERE v.tenant_id = $1 AND v.status = 'completed' AND v.check_in_at > now() - make_interval(days => $2)${own}) AS visits`, p),
    sharedPool.query(
      `SELECT d.id, d.doctor_name, d.specialty, d.area, d.referral_potential, d.last_visit_date,
              NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS owner_name,
              count(lv.id)::int AS referrals,
              count(lv.id) FILTER (WHERE lv.lifecycle_stage IN ${BOOKED})::int AS booked,
              count(lv.id) FILTER (WHERE lv.lifecycle_stage IN ${VISITED})::int AS visited,
              count(lv.id) FILTER (WHERE lv.lifecycle_stage IN ${TREATED})::int AS treated,
              COALESCE(sum(lv.actual_revenue) FILTER (WHERE lv.lifecycle_stage IN ${TREATED}), 0)::numeric AS revenue
         FROM field_doctor_crm d
         JOIN crm_leads_v2 lv ON lv.referring_doctor_id = d.id AND lv.tenant_id = $1 AND lv.deleted_at IS NULL AND lv.created_at > now() - make_interval(days => $2)
         LEFT JOIN users u ON u.id = d.assigned_exec_id AND u.tenant_id = d.tenant_id
        WHERE d.tenant_id = $1${own} GROUP BY d.id, u."firstName", u."lastName" ORDER BY referrals DESC, treated DESC LIMIT 25`, p),
    sharedPool.query(
      `SELECT d.id, d.doctor_name, d.specialty, d.area, NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS owner_name,
              count(lv.id) FILTER (WHERE lv.created_at > now() - make_interval(days => $2))::int AS now_count,
              count(lv.id) FILTER (WHERE lv.created_at BETWEEN now() - make_interval(days => $2 * 2) AND now() - make_interval(days => $2))::int AS before_count
         FROM field_doctor_crm d JOIN crm_leads_v2 lv ON lv.referring_doctor_id = d.id AND lv.tenant_id = $1 AND lv.deleted_at IS NULL
         LEFT JOIN users u ON u.id = d.assigned_exec_id AND u.tenant_id = d.tenant_id
        WHERE d.tenant_id = $1${own} GROUP BY d.id, u."firstName", u."lastName"
       HAVING count(lv.id) FILTER (WHERE lv.created_at BETWEEN now() - make_interval(days => $2 * 2) AND now() - make_interval(days => $2)) >= 2
          AND count(lv.id) FILTER (WHERE lv.created_at > now() - make_interval(days => $2)) * 2 <= count(lv.id) FILTER (WHERE lv.created_at BETWEEN now() - make_interval(days => $2 * 2) AND now() - make_interval(days => $2))
        ORDER BY count(lv.id) FILTER (WHERE lv.created_at BETWEEN now() - make_interval(days => $2 * 2) AND now() - make_interval(days => $2)) - count(lv.id) FILTER (WHERE lv.created_at > now() - make_interval(days => $2)) DESC LIMIT 15`, p),
    sharedPool.query(
      `SELECT d.id, d.doctor_name, d.specialty, d.area, d.referral_potential, d.last_visit_date, NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS owner_name
         FROM field_doctor_crm d LEFT JOIN users u ON u.id = d.assigned_exec_id AND u.tenant_id = d.tenant_id
        WHERE d.tenant_id = $1${own} AND d.relationship_status NOT IN ('inactive') AND (d.last_visit_date IS NULL OR d.last_visit_date < CURRENT_DATE - 30)
        ORDER BY array_position(ARRAY['champion','high','medium','low'], d.referral_potential::text), d.last_visit_date NULLS FIRST LIMIT 15`, [ctx.tenantId]),
    sharedPool.query(
      `SELECT d.referral_potential AS tier, count(*)::int AS doctors,
              count(*) FILTER (WHERE d.last_visit_date >= CURRENT_DATE - 30)::int AS visited_30d,
              count(*) FILTER (WHERE EXISTS (SELECT 1 FROM crm_leads_v2 lv WHERE lv.referring_doctor_id = d.id AND lv.tenant_id = $1 AND lv.created_at > now() - make_interval(days => $2)))::int AS referring
         FROM field_doctor_crm d WHERE d.tenant_id = $1${own} GROUP BY 1 ORDER BY array_position(ARRAY['champion','high','medium','low'], d.referral_potential::text)`, p),
    sharedPool.query(
      `SELECT u.id, NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS name,
              (SELECT count(*)::int FROM field_doctor_crm d WHERE d.tenant_id = $1 AND d.assigned_exec_id = u.id) AS doctors,
              (SELECT count(*)::int FROM field_visits v WHERE v.tenant_id = $1 AND v.user_id = u.id AND v.status = 'completed' AND v.check_in_at > now() - make_interval(days => $2)) AS visits,
              (SELECT count(*)::int FROM crm_leads_v2 lv WHERE lv.tenant_id = $1 AND lv.referred_by_user_id = u.id AND lv.created_at > now() - make_interval(days => $2)) AS referrals,
              (SELECT count(*)::int FROM crm_leads_v2 lv WHERE lv.tenant_id = $1 AND lv.referred_by_user_id = u.id AND lv.created_at > now() - make_interval(days => $2) AND lv.lifecycle_stage IN ${TREATED}) AS treated
         FROM users u WHERE u.tenant_id = $1 AND u.status = 'active' AND COALESCE(u.metadata->>'crmRole', 'sales_rep') = 'sales_rep'
        ${ctx.own ? `AND u.id = ${Number(ctx.userId)}` : ''} ORDER BY referrals DESC, visits DESC`, p),
  ]);
  return { days: period, kpi, league, falling, not_visited: notVisited, coverage, by_exec: byExec, manager: ctx.manager };
}

// ── Field activity ───────────────────────────────────────────────────────────────────────────────
export async function listVisits(ctx, q = {}) {
  const params = [ctx.tenantId];
  const where = ['v.tenant_id = $1'];
  const add = (sql, val) => { params.push(val); where.push(sql.replace('?', `$${params.length}`)); };
  if (ctx.own) add('v.user_id = ?', ctx.userId);
  else if (positive(q.exec)) add('v.user_id = ?', positive(q.exec));
  if (['planned', 'checked_in', 'completed', 'cancelled', 'exception'].includes(q.status)) add('v.status = ?', q.status);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : new Date().toISOString().slice(0, 10);
  add('COALESCE(v.check_in_at, v.planned_at)::date >= ?::date', from);
  add('COALESCE(v.check_in_at, v.planned_at)::date <= ?::date', to);
  const { rows } = await sharedPool.query(
    `SELECT v.id, v.status, v.purpose, v.visit_type, v.entity_type, v.entity_name, v.doctor_crm_id, d.doctor_name, d.specialty,
            v.planned_at, v.check_in_at, v.check_out_at, v.duration_seconds, v.met_person, v.outcome, v.materials_shared, v.next_action, v.follow_up_date,
            v.check_in_lat, v.check_in_lng, v.check_in_accuracy_m, v.check_in_address, v.photo_proof_url IS NOT NULL AS has_photo, v.is_unplanned,
            NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS exec_name, v.user_id
       FROM field_visits v LEFT JOIN users u ON u.id = v.user_id LEFT JOIN field_doctor_crm d ON d.id = v.doctor_crm_id
      WHERE ${where.join(' AND ')} ORDER BY COALESCE(v.check_in_at, v.planned_at) DESC NULLS LAST LIMIT 300`, params);
  const summary = { total: rows.length, completed: rows.filter((r) => r.status === 'completed').length, planned: rows.filter((r) => r.status === 'planned').length,
    exceptions: rows.filter((r) => r.status === 'exception').length, unplanned: rows.filter((r) => r.is_unplanned).length };
  return { from, to, summary, visits: rows };
}

export async function listDailyReports(ctx, q = {}) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : null;
  const { rows } = await sharedPool.query(
    `SELECT r.id, r.report_date, r.planned_visits, r.completed_visits, r.missed_visits, r.leads_generated, r.follow_ups_done,
            r.key_achievements, r.challenges, r.next_day_plan, r.submitted_at, r.reviewed_at,
            NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS exec_name, r.user_id
       FROM daily_field_reports r JOIN users u ON u.id = r.user_id
      WHERE r.tenant_id = $1 AND ($2::date IS NULL OR r.report_date = $2::date) AND ($3::int IS NULL OR r.user_id = $3)
      ORDER BY r.report_date DESC, r.id DESC LIMIT 100`, [ctx.tenantId, date, ctx.own ? ctx.userId : (positive(q.exec) || null)]);
  return rows;
}

/** One approvals queue: expenses, tour plans, out-of-beat visits, event budgets. Decisions go through the
 * existing manager endpoints (they notify the executive atomically); event-budget rejection is here. */
export async function listApprovals(ctx, { status = 'pending' } = {}) {
  ensureManager(ctx);
  const pending = status !== 'decided';
  const [{ rows: exp }, { rows: tours }, { rows: exc }, { rows: budgets }] = await Promise.all([
    sharedPool.query(
      `SELECT e.id, e.title, e.claim_month, e.total_amount AS amount, e.status, e.submitted_at, e.reviewed_at, e.approval_notes, e.rejection_reason,
              NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS requester,
              (SELECT count(*)::int FROM field_expense_items i WHERE i.claim_id = e.id) AS items
         FROM field_expense_claims e LEFT JOIN users u ON u.id = e.user_id
        WHERE e.tenant_id = $1 AND ${pending ? `e.status IN ('submitted','under_review')` : `e.status IN ('approved','rejected','paid')`}
        ORDER BY COALESCE(e.submitted_at, e.created_at) DESC LIMIT 100`, [ctx.tenantId]).catch(() => ({ rows: [] })),
    sharedPool.query(
      `SELECT t.id, to_char(t.month, 'Mon YYYY') AS month, t.beat_dates, t.notes, t.status, t.submitted_at, t.reviewed_at, t.review_note,
              NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS requester
         FROM field_tour_plans t LEFT JOIN users u ON u.id = t.user_id
        WHERE t.tenant_id = $1 AND ${pending ? `t.status = 'submitted'` : `t.status IN ('approved','rejected')`}
        ORDER BY COALESCE(t.submitted_at, t.created_at) DESC LIMIT 100`, [ctx.tenantId]),
    sharedPool.query(
      `SELECT x.id, x.reason, x.distance_breach_km, x.status, x.created_at AS submitted_at, x.reviewed_at, x.review_note,
              v.entity_name, d.doctor_name, NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS requester
         FROM field_visit_exceptions x LEFT JOIN field_visits v ON v.id = x.visit_id LEFT JOIN field_doctor_crm d ON d.id = v.doctor_crm_id
         LEFT JOIN users u ON u.id = x.user_id
        WHERE x.tenant_id = $1 AND ${pending ? `x.status = 'pending'` : `x.status IN ('approved','rejected')`}
        ORDER BY x.created_at DESC LIMIT 100`, [ctx.tenantId]),
    sharedPool.query(
      `SELECT b.id, b.approved_amount AS amount, b.utilized_amount, b.status, b.roi_projection, b.notes, b.created_at AS submitted_at, b.approved_at AS reviewed_at,
              COALESCE(e.name, c.camp_name) AS event_name, CASE WHEN b.cme_event_id IS NOT NULL THEN 'CME' ELSE 'Camp' END AS event_kind,
              NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS requester
         FROM field_event_budgets b LEFT JOIN field_cme_events e ON e.id = b.cme_event_id LEFT JOIN health_camps c ON c.id = b.camp_id
         LEFT JOIN users u ON u.id = b.created_by
        WHERE b.tenant_id = $1 AND ${pending ? `b.status IN ('draft','submitted')` : `b.status IN ('approved','rejected')`}
        ORDER BY b.created_at DESC LIMIT 100`, [ctx.tenantId]),
  ]);
  const items = [
    ...exp.map((e) => ({ kind: 'expense', id: e.id, title: e.title || `Expenses ${e.claim_month}`, detail: `${e.claim_month} · ${e.items} item${e.items === 1 ? '' : 's'}`, amount: e.amount, requester: e.requester, submitted_at: e.submitted_at, status: e.status, note: e.approval_notes || e.rejection_reason })),
    ...tours.map((t) => ({ kind: 'tour_plan', id: t.id, title: `Tour plan, ${t.month}`, detail: `${Array.isArray(t.beat_dates) ? t.beat_dates.length : Object.keys(t.beat_dates || {}).length} beat days${t.notes ? ` · ${t.notes}` : ''}`, amount: null, requester: t.requester, submitted_at: t.submitted_at, status: t.status, note: t.review_note })),
    ...exc.map((x) => ({ kind: 'exception', id: x.id, title: `Out-of-beat visit: ${x.doctor_name || x.entity_name || 'visit'}`, detail: [x.distance_breach_km ? `${Number(x.distance_breach_km).toFixed(1)} km outside the beat` : null, x.reason].filter(Boolean).join(' · '), amount: null, requester: x.requester, submitted_at: x.submitted_at, status: x.status, note: x.review_note })),
    ...budgets.map((b) => ({ kind: 'event_budget', id: b.id, title: `${b.event_kind} budget: ${b.event_name || 'event'}`, detail: [b.roi_projection, b.notes].filter(Boolean).join(' · '), amount: b.amount, requester: b.requester, submitted_at: b.submitted_at, status: b.status })),
  ].sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
  return { items, counts: { expense: exp.length, tour_plan: tours.length, exception: exc.length, event_budget: budgets.length } };
}

export async function decideBudget(ctx, id, { approve, note } = {}) {
  ensureManager(ctx);
  const { rows: [b] } = await sharedPool.query(
    `UPDATE field_event_budgets SET status = $1, approved_by = $2, approved_at = now(), notes = CASE WHEN $3::text IS NULL THEN notes ELSE concat_ws(' · ', notes, $3::text) END, updated_at = now()
      WHERE id = $4 AND tenant_id = $5 AND status IN ('draft','submitted') RETURNING id, status`,
    [approve ? 'approved' : 'rejected', ctx.userId, clean(note, 500), positive(id), ctx.tenantId]);
  if (!b) throw fail(404, 'Budget not found or already decided');
  return b;
}

export async function listSamples(ctx, q = {}) {
  const { rows } = await sharedPool.query(
    `SELECT h.id, h.items, h.created_at, h.digital_signature_url IS NOT NULL AS signed, h.geofence_verified, h.doctor_crm_id, d.doctor_name,
            NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS exec_name
       FROM field_handovers h LEFT JOIN field_doctor_crm d ON d.id = h.doctor_crm_id LEFT JOIN users u ON u.id = h.user_id
      WHERE h.tenant_id = $1 AND ($2::int IS NULL OR h.user_id = $2) AND h.created_at > now() - make_interval(days => $3)
      ORDER BY h.created_at DESC LIMIT 300`, [ctx.tenantId, ctx.own ? ctx.userId : null, Math.min(Math.max(Number(q.days) || 30, 1), 365)]);
  return rows;
}

// ── Events ───────────────────────────────────────────────────────────────────────────────────────
export async function listEvents(ctx) {
  const [{ rows: cme }, { rows: camps }] = await Promise.all([
    sharedPool.query(
      `SELECT e.id, e.name, e.event_type, e.scheduled_at, e.venue, e.city, e.max_attendees, e.status, e.budget_allocated, e.compliance_notes, e.notes,
              (SELECT count(*)::int FROM field_cme_speakers s WHERE s.cme_event_id = e.id) AS speakers,
              (SELECT count(*)::int FROM field_cme_speakers s WHERE s.cme_event_id = e.id AND NOT COALESCE(s.compliance_cleared, false)) AS speakers_uncleared,
              (SELECT count(*)::int FROM field_cme_attendees a WHERE a.cme_event_id = e.id) AS invited,
              (SELECT count(*)::int FROM field_cme_attendees a WHERE a.cme_event_id = e.id AND a.attended) AS attended,
              (SELECT b.status FROM field_event_budgets b WHERE b.cme_event_id = e.id ORDER BY b.created_at DESC LIMIT 1) AS budget_status
         FROM field_cme_events e WHERE e.tenant_id = $1 ORDER BY e.scheduled_at DESC NULLS LAST LIMIT 200`, [ctx.tenantId]),
    sharedPool.query(
      `SELECT c.id, c.camp_name, c.camp_type::text AS camp_type, c.address, c.start_date, c.end_date, c.status::text AS status, c.expected_patients,
              (SELECT count(*)::int FROM field_camp_registrations r WHERE r.camp_id = c.id) AS registrations,
              (SELECT count(*)::int FROM field_camp_registrations r WHERE r.camp_id = c.id AND r.high_risk_flag) AS high_risk,
              (SELECT count(*)::int FROM field_camp_registrations r WHERE r.camp_id = c.id AND r.crm_lead_id IS NOT NULL) AS leads
         FROM health_camps c WHERE c.tenant_id = $1 ORDER BY c.start_date DESC NULLS LAST LIMIT 200`, [ctx.tenantId]),
  ]);
  return { cme, camps, manager: ctx.manager };
}

export async function createCme(ctx, input = {}) {
  ensureManager(ctx);
  const name = clean(input.name, 200);
  if (!name) throw fail(400, 'Event name is required');
  const at = input.scheduled_at ? new Date(input.scheduled_at) : null;
  if (!at || Number.isNaN(at.getTime())) throw fail(400, 'Choose the date and time');
  const type = ['cme', 'roundtable', 'webinar', 'symposium', 'other'].includes(input.event_type) ? input.event_type : 'cme';
  const { rows: [e] } = await sharedPool.query(
    `INSERT INTO field_cme_events (tenant_id, created_by, name, event_type, scheduled_at, venue, city, max_attendees, status, budget_allocated, compliance_notes, notes, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'planned',$9,$10,$11,now(),now()) RETURNING id`,
    [ctx.tenantId, ctx.userId, name, type, at, clean(input.venue, 200), clean(input.city, 120), positive(input.max_attendees), Number(input.budget_allocated) > 0 ? Number(input.budget_allocated) : null, clean(input.compliance_notes, 1000), clean(input.notes, 1000)]);
  return eventDetail(ctx, 'cme', e.id);
}

export async function createCamp(ctx, input = {}) {
  ensureManager(ctx);
  const name = clean(input.camp_name, 200);
  if (!name) throw fail(400, 'Camp name is required');
  const start = input.start_date ? new Date(input.start_date) : null;
  if (!start || Number.isNaN(start.getTime())) throw fail(400, 'Choose the start date');
  const type = ['general', 'diabetes', 'cardiac', 'eye', 'dental', 'women_health', 'pediatric', 'vaccination'].includes(input.camp_type) ? input.camp_type : 'general';
  const { rows: [c] } = await sharedPool.query(
    `INSERT INTO health_camps (camp_name, camp_type, tenant_id, organized_by, location, address, start_date, end_date, status, expected_patients, notes, created_at, updated_at)
     VALUES ($1, $2::enum_health_camps_camp_type, $3, 'Medstar Hospitals', jsonb_build_object('address', $4::text), $4, $5, $6, 'planned', $7, $8, now(), now()) RETURNING id`,
    [name, type, ctx.tenantId, clean(input.address, 400), start, input.end_date ? new Date(input.end_date) : start, positive(input.expected_patients), clean(input.notes, 1000)]);
  return eventDetail(ctx, 'camp', c.id);
}

export async function eventDetail(ctx, kind, id) {
  const eid = positive(id);
  if (kind === 'cme') {
    const { rows: [e] } = await sharedPool.query(`SELECT * FROM field_cme_events WHERE id = $1 AND tenant_id = $2`, [eid, ctx.tenantId]);
    if (!e) throw fail(404, 'Event not found');
    const [{ rows: speakers }, { rows: attendees }, { rows: budgets }] = await Promise.all([
      sharedPool.query(`SELECT s.*, d.doctor_name AS linked_doctor FROM field_cme_speakers s LEFT JOIN field_doctor_crm d ON d.id = s.doctor_crm_id WHERE s.cme_event_id = $1 AND s.tenant_id = $2 ORDER BY s.id`, [eid, ctx.tenantId]),
      sharedPool.query(`SELECT a.id, a.doctor_crm_id, COALESCE(d.doctor_name, a.doctor_name) AS doctor_name, a.phone, a.invitation_sent_at, a.attended, a.checkin_at FROM field_cme_attendees a LEFT JOIN field_doctor_crm d ON d.id = a.doctor_crm_id WHERE a.cme_event_id = $1 AND a.tenant_id = $2 ORDER BY a.attended DESC, 3`, [eid, ctx.tenantId]),
      sharedPool.query(`SELECT id, approved_amount, utilized_amount, status, roi_projection, notes FROM field_event_budgets WHERE cme_event_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`, [eid, ctx.tenantId]),
    ]);
    return { kind, event: e, speakers, attendees, budgets };
  }
  const { rows: [c] } = await sharedPool.query(`SELECT id, camp_name, camp_type::text AS camp_type, address, start_date, end_date, status::text AS status, expected_patients, notes FROM health_camps WHERE id = $1 AND tenant_id = $2`, [eid, ctx.tenantId]);
  if (!c) throw fail(404, 'Camp not found');
  const { rows: registrations } = await sharedPool.query(
    `SELECT r.id, r.patient_name, r.age, r.gender, r.phone, r.screening_notes, r.high_risk_flag, r.referred_to, r.crm_lead_id, r.created_at,
            NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS registered_by_name
       FROM field_camp_registrations r LEFT JOIN users u ON u.id = r.registered_by WHERE r.camp_id = $1 AND r.tenant_id = $2 ORDER BY r.created_at DESC`, [eid, ctx.tenantId]);
  return { kind, event: c, registrations };
}

export async function convertCampRegistrations(ctx, campId) {
  if (!ctx.canEdit) throw fail(403, 'Your role cannot create leads from camps.');
  const { rows } = await sharedPool.query(`SELECT id FROM field_camp_registrations WHERE camp_id = $1 AND tenant_id = $2 AND crm_lead_id IS NULL`, [positive(campId), ctx.tenantId]);
  let created = 0, skipped = 0;
  for (const r of rows) { (await campRegistrationToLead(ctx.tenantId, ctx.tenantUid, ctx.userId, r.id)) ? created += 1 : skipped += 1; }
  return { converted: created, skipped_without_mobile: skipped };
}

export async function addCmeSpeaker(ctx, eventId, input = {}) {
  ensureManager(ctx);
  const { rows: [e] } = await sharedPool.query(`SELECT id FROM field_cme_events WHERE id = $1 AND tenant_id = $2`, [positive(eventId), ctx.tenantId]);
  if (!e) throw fail(404, 'Event not found');
  let doctor = null;
  if (positive(input.doctor_crm_id)) doctor = await loadDoctor(ctx, input.doctor_crm_id);
  const name = clean(input.speaker_name, 200) || doctor?.doctor_name;
  if (!name) throw fail(400, 'Speaker name is required');
  await sharedPool.query(`INSERT INTO field_cme_speakers (cme_event_id, doctor_crm_id, tenant_id, speaker_name, speciality, speaker_type, honorarium, compliance_cleared, notes, created_at)
                          VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,now())`,
    [e.id, doctor?.id || null, ctx.tenantId, name, clean(input.speciality, 120) || doctor?.specialty || null, (['keynote', 'panelist', 'moderator', 'other'].includes(input.speaker_type) ? input.speaker_type : 'keynote'), Number(input.honorarium) > 0 ? Number(input.honorarium) : null, clean(input.notes, 500)]);
  return eventDetail(ctx, 'cme', e.id);
}

export async function setSpeakerCompliance(ctx, speakerId, cleared) {
  ensureManager(ctx);
  const { rows: [s] } = await sharedPool.query(`UPDATE field_cme_speakers SET compliance_cleared = $1 WHERE id = $2 AND tenant_id = $3 RETURNING cme_event_id`, [Boolean(cleared), positive(speakerId), ctx.tenantId]);
  if (!s) throw fail(404, 'Speaker not found');
  return eventDetail(ctx, 'cme', s.cme_event_id);
}

export async function inviteDoctorsToCme(ctx, eventId, doctorIds = []) {
  ensureManager(ctx);
  const { rows: [e] } = await sharedPool.query(`SELECT id FROM field_cme_events WHERE id = $1 AND tenant_id = $2`, [positive(eventId), ctx.tenantId]);
  if (!e) throw fail(404, 'Event not found');
  const ids = [...new Set((doctorIds || []).map(positive).filter(Boolean))].slice(0, 500);
  let added = 0;
  for (const id of ids) {
    const { rows: [d] } = await sharedPool.query(`SELECT id, doctor_name, phone FROM field_doctor_crm WHERE id = $1 AND tenant_id = $2`, [id, ctx.tenantId]);
    if (!d) continue;
    const { rowCount } = await sharedPool.query(
      `INSERT INTO field_cme_attendees (cme_event_id, doctor_crm_id, tenant_id, invited_by, doctor_name, phone, qr_token, attended, created_at)
       SELECT $1, $2, $3, $4, $5, $6, md5(random()::text || clock_timestamp()::text), false, now()
        WHERE NOT EXISTS (SELECT 1 FROM field_cme_attendees WHERE cme_event_id = $1 AND doctor_crm_id = $2)`,
      [e.id, d.id, ctx.tenantId, ctx.userId, d.doctor_name, d.phone]);
    added += rowCount;
  }
  return { invited: added, ...(await eventDetail(ctx, 'cme', e.id)) };
}

// ── Team performance (scorecard) ─────────────────────────────────────────────────────────────────
export async function teamPerformance(ctx, { month } = {}) {
  const m = /^\d{4}-\d{2}$/.test(month || '') ? month : new Date().toISOString().slice(0, 7);
  const { rows } = await sharedPool.query(
    `SELECT u.id, NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS name,
            t.visits_target, t.doctors_target, t.leads_target, t.camps_target, t.revenue_target,
            (SELECT count(*)::int FROM field_visits v WHERE v.tenant_id = $1 AND v.user_id = u.id AND v.status = 'completed' AND to_char(v.check_in_at, 'YYYY-MM') = $2) AS visits_done,
            (SELECT count(DISTINCT v.doctor_crm_id)::int FROM field_visits v WHERE v.tenant_id = $1 AND v.user_id = u.id AND v.status = 'completed' AND to_char(v.check_in_at, 'YYYY-MM') = $2) AS doctors_done,
            (SELECT count(*)::int FROM crm_leads_v2 lv WHERE lv.tenant_id = $1 AND lv.referred_by_user_id = u.id AND to_char(lv.created_at, 'YYYY-MM') = $2) AS referrals_done,
            (SELECT count(*)::int FROM crm_leads_v2 lv WHERE lv.tenant_id = $1 AND lv.referred_by_user_id = u.id AND to_char(lv.created_at, 'YYYY-MM') = $2 AND lv.lifecycle_stage IN ${TREATED}) AS treated_done,
            (SELECT count(*)::int FROM field_attendance a WHERE a.tenant_id = $1 AND a.user_id = u.id AND to_char(a.clock_in_at, 'YYYY-MM') = $2) AS days_present,
            (SELECT COALESCE(sum(e.approved_amount), 0)::numeric FROM field_expense_claims e WHERE e.tenant_id = $1 AND e.user_id = u.id AND e.claim_month = $2 AND e.status IN ('approved','paid')) AS expenses_approved
       FROM users u LEFT JOIN field_targets t ON t.user_id = u.id AND t.tenant_id = $1 AND t.month = $2
      WHERE u.tenant_id = $1 AND u.status = 'active' AND COALESCE(u.metadata->>'crmRole', 'sales_rep') = 'sales_rep'
        ${ctx.own ? `AND u.id = ${Number(ctx.userId)}` : ''}
      ORDER BY 2 NULLS LAST`, [ctx.tenantId, m]);
  const score = (done, target) => (target > 0 ? Math.min(150, Math.round((done / target) * 100)) : null);
  return { month: m, team: rows.map((r) => {
    const parts = [score(r.visits_done, r.visits_target), score(r.doctors_done, r.doctors_target), score(r.referrals_done, r.leads_target)].filter((x) => x != null);
    const overall = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
    // Below 60% of target with at least half the month gone is the improvement-plan line.
    const half = new Date().toISOString().slice(0, 7) !== m || new Date().getDate() >= 15;
    return { ...r, score: overall, needs_plan: overall != null && overall < 60 && half };
  }) };
}

// ── Messaging doctors (WhatsApp templates approved for doctors) ──────────────────────────────────
const shortDoctorName = (n) => String(n || '').replace(/^dr\.?\s+/i, '').trim();
export async function doctorTemplates(ctx) {
  const { rows } = await sharedPool.query(
    `SELECT id, name, metadata->>'family' AS family, language_code, status, body, category, provider_status
       FROM crm_communication_templates WHERE tenant_id = $1 AND channel = 'whatsapp' AND status <> 'archived'
        AND (metadata->>'family' LIKE '%\_doctor\_%' OR name LIKE '%\_doctor\_%') ORDER BY name`, [ctx.tenantId]);
  return rows.map((t) => ({ ...t, placeholders: new Set(String(t.body).match(/\{\{\d+\}\}/g) || []).size }));
}
export async function sendDoctorMessage(ctx, doctorId, { templateId, family, params } = {}) {
  if (!ctx.canEdit) throw fail(403, 'Your role cannot message doctors.');
  const d = await loadDoctor(ctx, doctorId);
  if (!d.phone) throw fail(400, `${d.doctor_name} has no mobile number on file`);
  const r = await sendTemplateToNumber(ctx.tenantId, { templateId: positive(templateId), family, to: d.phone, params });
  await sharedPool.query(
    `INSERT INTO crm_communication_events (tenant_id, channel, direction, message_type, template_id, body_preview, provider, provider_message_id, status, sent_at, owner_user_id, metadata)
     VALUES ($1, 'whatsapp', 'outbound', 'template', $2, $3, 'gupshup', $4, 'sent', now(), $5, $6::jsonb)`,
    [ctx.tenantId, r.template.id, r.rendered.slice(0, 2000), r.messageId, ctx.userId, JSON.stringify({ doctor_crm_id: String(d.id), to: r.to, template: r.template.name, audience: 'doctor' })]);
  return { sent: true, to: r.to, template: r.template.name };
}
/** WhatsApp invitations to a CME's invited doctors who have not had one. Several doctors at once is bulk
 * sending, which stays behind CRM_BULK_SENDING_ENABLED like every other bulk send. */
export async function sendCmeInvites(ctx, eventId, { templateId, when, venue } = {}) {
  ensureManager(ctx);
  const { rows: [e] } = await sharedPool.query(`SELECT * FROM field_cme_events WHERE id = $1 AND tenant_id = $2`, [positive(eventId), ctx.tenantId]);
  if (!e) throw fail(404, 'Event not found');
  const { rows: pending } = await sharedPool.query(
    `SELECT a.id, a.doctor_crm_id, COALESCE(d.doctor_name, a.doctor_name) AS doctor_name, COALESCE(d.phone, a.phone) AS phone
       FROM field_cme_attendees a LEFT JOIN field_doctor_crm d ON d.id = a.doctor_crm_id
      WHERE a.cme_event_id = $1 AND a.tenant_id = $2 AND a.invitation_sent_at IS NULL LIMIT 101`, [e.id, ctx.tenantId]);
  if (!pending.length) throw fail(409, 'Everyone invited has already had an invitation.');
  if (pending.length > 100) throw fail(409, 'Send to at most 100 doctors at a time.');
  if (pending.length > 1 && process.env.CRM_BULK_SENDING_ENABLED !== 'true') {
    throw fail(409, 'Sending to several doctors at once is bulk sending, which is switched off on this CRM. Send one invitation at a time from each doctor\'s profile, or ask an administrator to turn bulk sending on.');
  }
  const whenText = clean(when, 60) || (e.scheduled_at ? new Date(e.scheduled_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : null);
  const venueText = clean(venue, 120) || [e.venue, e.city].filter(Boolean).join(', ') || null;
  if (!whenText || !venueText) throw fail(400, 'Give the date and the venue for the invitation');
  const result = { sent: 0, failed: [] };
  for (const a of pending) {
    try {
      if (!a.doctor_crm_id) throw fail(400, 'not linked to a doctor record');
      await sendDoctorMessage({ ...ctx, canEdit: true }, a.doctor_crm_id, { templateId, family: templateId ? undefined : 'doctor_cme_invite', params: [shortDoctorName(a.doctor_name), e.name, whenText, venueText] });
      await sharedPool.query(`UPDATE field_cme_attendees SET invitation_sent_at = now() WHERE id = $1`, [a.id]);
      result.sent += 1;
    } catch (err) { result.failed.push({ doctor: a.doctor_name, reason: err.message }); }
  }
  return result;
}

// ── Territories ──────────────────────────────────────────────────────────────────────────────────
export async function listTerritories(ctx) {
  const { rows } = await sharedPool.query(
    `SELECT t.id, t.territory, t.description, t.city, t.zone, t.active, t.assigned_at, t.user_id,
            NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS exec_name,
            (SELECT count(*)::int FROM field_doctor_crm d WHERE d.tenant_id = t.tenant_id AND d.assigned_exec_id = t.user_id) AS doctors
       FROM field_territories t LEFT JOIN users u ON u.id = t.user_id
      WHERE t.tenant_id = $1 ${ctx.own ? `AND t.user_id = ${Number(ctx.userId)}` : ''} ORDER BY t.active DESC, t.zone NULLS LAST, t.territory`, [ctx.tenantId]);
  return { territories: rows, manager: ctx.manager };
}
export async function saveTerritory(ctx, input = {}, id = null) {
  ensureManager(ctx);
  const name = clean(input.territory, 120);
  if (!name) throw fail(400, 'Territory name is required');
  if (!input.user_id) throw fail(400, 'Choose the field executive who covers this territory');
  const userId = await assertTeamMember(ctx, input.user_id);
  if (id) {
    const { rowCount } = await sharedPool.query(`UPDATE field_territories SET territory=$1, description=$2, city=$3, zone=$4, user_id=$5, active=COALESCE($6, active), updated_at=now() WHERE id=$7 AND tenant_id=$8`,
      [name, clean(input.description, 500), clean(input.city, 120), clean(input.zone, 120), userId, typeof input.active === 'boolean' ? input.active : null, positive(id), ctx.tenantId]);
    if (!rowCount) throw fail(404, 'Territory not found');
  } else {
    await sharedPool.query(`INSERT INTO field_territories (user_id, territory, description, city, zone, active, assigned_by, assigned_at, tenant_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,true,$6,now(),$7,now(),now())`,
      [userId, name, clean(input.description, 500), clean(input.city, 120), clean(input.zone, 120), ctx.userId, ctx.tenantId]);
  }
  return listTerritories(ctx);
}

// ── Empanelment (insurers, TPAs, government schemes) ─────────────────────────────────────────────
const EMP_STATUS = ['identified', 'contacted', 'document_collection', 'submitted', 'under_review', 'site_visit_scheduled', 'site_visit_done', 'approved', 'renewal_due', 'renewal_submitted', 'empanelled', 'rejected', 'on_hold'];
const EMP_TYPE = ['private_insurer', 'tpa', 'government', 'esic', 'cghs', 'echs', 'other'];
export async function listEmpanelment(ctx) {
  const { rows } = await sharedPool.query(
    `SELECT a.*, NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS owner_name,
            COALESCE((SELECT json_agg(m ORDER BY m.due_date NULLS LAST, m.id) FROM field_empanelment_milestones m WHERE m.application_id = a.id), '[]') AS milestones
       FROM field_empanelment_applications a LEFT JOIN users u ON u.id = a.assigned_to
      WHERE a.tenant_id = $1 ${ctx.own ? `AND a.assigned_to = ${Number(ctx.userId)}` : ''}
      ORDER BY CASE WHEN a.status IN ('empanelled','rejected') THEN 1 ELSE 0 END, a.target_date NULLS LAST, a.id DESC`, [ctx.tenantId]);
  return { applications: rows, statuses: EMP_STATUS, types: EMP_TYPE, manager: ctx.manager };
}
export async function saveEmpanelment(ctx, input = {}, id = null) {
  ensureManager(ctx);
  const f = {
    insurer_name: clean(input.insurer_name, 200), insurer_type: EMP_TYPE.includes(input.insurer_type) ? input.insurer_type : 'private_insurer',
    contact_person: clean(input.contact_person, 120), contact_phone: clean(input.contact_phone, 20), contact_email: clean(input.contact_email, 200),
    panel_type: ['cashless', 'reimbursement', 'both'].includes(input.panel_type) ? input.panel_type : 'cashless',
    status: EMP_STATUS.includes(input.status) ? input.status : 'identified',
    target_date: /^\d{4}-\d{2}-\d{2}$/.test(input.target_date || '') ? input.target_date : null,
    empanelled_date: /^\d{4}-\d{2}-\d{2}$/.test(input.empanelled_date || '') ? input.empanelled_date : null,
    expiry_date: /^\d{4}-\d{2}-\d{2}$/.test(input.expiry_date || '') ? input.expiry_date : null,
    panel_code: clean(input.panel_code, 60), tariff_agreed: Boolean(input.tariff_agreed), mou_signed: Boolean(input.mou_signed), notes: clean(input.notes, 2000),
    assigned_to: input.assigned_to ? await assertTeamMember(ctx, input.assigned_to) : null,
  };
  if (!f.insurer_name) throw fail(400, 'Insurer or scheme name is required');
  const cols = Object.keys(f);
  if (id) {
    const { rowCount } = await sharedPool.query(`UPDATE field_empanelment_applications SET ${cols.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = $${cols.length + 1} AND tenant_id = $${cols.length + 2}`,
      [...cols.map((k) => f[k]), positive(id), ctx.tenantId]);
    if (!rowCount) throw fail(404, 'Application not found');
  } else {
    await sharedPool.query(`INSERT INTO field_empanelment_applications (${cols.join(', ')}, created_by, tenant_id, created_at, updated_at) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, $${cols.length + 1}, $${cols.length + 2}, now(), now())`,
      [...cols.map((k) => f[k]), ctx.userId, ctx.tenantId]);
  }
  return listEmpanelment(ctx);
}
export async function addMilestone(ctx, applicationId, input = {}) {
  ensureManager(ctx);
  const { rows: [a] } = await sharedPool.query(`SELECT id FROM field_empanelment_applications WHERE id = $1 AND tenant_id = $2`, [positive(applicationId), ctx.tenantId]);
  if (!a) throw fail(404, 'Application not found');
  const name = clean(input.milestone, 200);
  if (!name) throw fail(400, 'Describe the milestone');
  await sharedPool.query(`INSERT INTO field_empanelment_milestones (application_id, milestone, status, due_date, notes, created_by, created_at) VALUES ($1,$2,'pending',$3,$4,$5,now())`,
    [a.id, name, /^\d{4}-\d{2}-\d{2}$/.test(input.due_date || '') ? input.due_date : null, clean(input.notes, 500), ctx.userId]);
  return listEmpanelment(ctx);
}
export async function setMilestone(ctx, milestoneId, status) {
  ensureManager(ctx);
  if (!['pending', 'in_progress', 'done', 'skipped'].includes(status)) throw fail(400, 'Unknown milestone status');
  const { rowCount } = await sharedPool.query(
    `UPDATE field_empanelment_milestones m SET status = $1::text, completed_at = CASE WHEN $1::text = 'done' THEN now() ELSE NULL END
       FROM field_empanelment_applications a WHERE m.id = $2 AND a.id = m.application_id AND a.tenant_id = $3`, [status, positive(milestoneId), ctx.tenantId]);
  if (!rowCount) throw fail(404, 'Milestone not found');
  return listEmpanelment(ctx);
}
