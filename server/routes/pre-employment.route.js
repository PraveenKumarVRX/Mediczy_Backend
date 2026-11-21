/** Separate candidate workflow for pre-employment medical examinations (PEME). */
import express from 'express';
import rateLimit from 'express-rate-limit';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { authCorporate } from '../middleware/corporate.middleware.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import emailServiceModule from '../services/emailService.js';
import { recordAutomatedSend } from '../services/team-sent-folder.service.js';

const router = express.Router();
const candidateRouter = express.Router();
const invitationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many invitation attempts. Try again later.' },
});
const db = postgresSequelize;
const CASE_STATUSES = new Set(['draft', 'invited', 'consent_pending', 'consented', 'scheduled', 'in_progress', 'clinical_review', 'completed', 'cancelled', 'expired']);
const FITNESS_STATUSES = new Set(['pending', 'fit', 'fit_with_restrictions', 'temporarily_unfit', 'unfit']);
const hash = (value) => createHash('sha256').update(String(value)).digest('hex');
const corporateId = (req) => Number(req.corporateUser?.id || req.user?.corporateId || req.user?.id);
// The acting HR user. A direct corporate login has no user (its req.user.id is the corporate's
// own id), and recording that number as a user would point at whichever user has that id.
const actorId = (req) => Number(req.user?.userId) || null;
const asDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const publicCase = (row) => ({
  id: row.id,
  status: row.status,
  positionTitle: row.position_title || null,
  appointmentAt: row.appointment_at || null,
  venue: row.venue || {},
  consentedAt: row.consented_at || null,
  fitnessStatus: row.status === 'completed' ? row.fitness_status : null,
});
const hrCase = (row) => ({
  ...publicCase(row),
  candidate: { id: row.candidate_id, name: row.full_name, email: row.email, phone: row.phone },
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  fitnessIssuedAt: row.fitness_issued_at || null,
});
async function event(caseId, actorType, actorUserId, eventType, payload = {}, transaction) {
  await db.query(
    `INSERT INTO pre_employment_case_events (case_id,actor_type,actor_user_id,event_type,payload)
     VALUES (:caseId,:actorType,:actorUserId,:eventType,CAST(:payload AS JSONB))`,
    { replacements: { caseId, actorType, actorUserId, eventType, payload: JSON.stringify(payload) }, transaction }
  );
}
async function caseForCorporate(id, corpId, transaction) {
  const [row] = await db.query(
    `SELECT pc.*, c.full_name,c.email,c.phone
       FROM pre_employment_cases pc
       JOIN pre_employment_candidates c ON c.id=pc.candidate_id
      WHERE pc.id=:id AND pc.corporate_id=:corporateId LIMIT 1`,
    { replacements: { id, corporateId: corpId }, transaction, type: db.QueryTypes.SELECT }
  );
  return row || null;
}
function requireClinicalReviewer(req, res, next) {
  if (!['corporate_cmo', 'corporate_ohc'].includes(String(req.user?.role || ''))) {
    return res.status(403).json({ success: false, code: 'clinical_reviewer_required', message: 'A corporate clinical reviewer must record a PEME outcome.' });
  }
  return next();
}

// Corporate HR/clinical users: case coordination only. This API intentionally
// does not accept employee IDs, plan IDs, or health-checkup package IDs.
router.get('/cases', authCorporate, async (req, res) => {
  try {
    const status = String(req.query.status || '').trim();
    if (status && !CASE_STATUSES.has(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
    const rows = await db.query(
      `SELECT pc.*, c.full_name,c.email,c.phone
         FROM pre_employment_cases pc JOIN pre_employment_candidates c ON c.id=pc.candidate_id
        WHERE pc.corporate_id=:corporateId ${status ? 'AND pc.status=:status' : ''}
        ORDER BY pc.created_at DESC LIMIT 500`,
      { replacements: { corporateId: corporateId(req), ...(status ? { status } : {}) }, type: db.QueryTypes.SELECT }
    );
    return res.json({ success: true, cases: rows.map(hrCase) });
  } catch (error) {
    console.error('[peme] list cases', error);
    return res.status(500).json({ success: false, message: 'Unable to load pre-employment cases' });
  }
});

router.post('/cases', authCorporate, async (req, res) => {
  const { candidateName, candidateEmail, candidatePhone, hrCandidateId, requisitionId, positionTitle } = req.body || {};
  if (!String(candidateName || '').trim() || !String(candidateEmail || '').trim()) {
    return res.status(400).json({ success: false, message: 'candidateName and candidateEmail are required' });
  }
  try {
    const result = await db.transaction(async (transaction) => {
      const corpId = corporateId(req);
      let candidate;
      if (hrCandidateId) {
        [candidate] = await db.query(
          `INSERT INTO pre_employment_candidates (corporate_id,hr_candidate_id,full_name,email,phone)
           VALUES (:corporateId,:hrCandidateId,:name,:email,:phone)
           ON CONFLICT (corporate_id,hr_candidate_id) DO UPDATE
             SET full_name=EXCLUDED.full_name,email=EXCLUDED.email,phone=EXCLUDED.phone,updated_at=NOW()
           RETURNING *`,
          { replacements: { corporateId: corpId, hrCandidateId: Number(hrCandidateId), name: String(candidateName).trim(), email: String(candidateEmail).trim().toLowerCase(), phone: candidatePhone ? String(candidatePhone).trim() : null }, transaction, type: db.QueryTypes.SELECT }
        );
      } else {
        [candidate] = await db.query(
          `INSERT INTO pre_employment_candidates (corporate_id,full_name,email,phone)
           VALUES (:corporateId,:name,:email,:phone) RETURNING *`,
          { replacements: { corporateId: corpId, name: String(candidateName).trim(), email: String(candidateEmail).trim().toLowerCase(), phone: candidatePhone ? String(candidatePhone).trim() : null }, transaction, type: db.QueryTypes.SELECT }
        );
      }
      const id = randomUUID();
      const [created] = await db.query(
        `INSERT INTO pre_employment_cases (id,corporate_id,candidate_id,requisition_id,position_title,requested_by_user_id)
         VALUES (:id,:corporateId,:candidateId,:requisitionId,:positionTitle,:requestedBy) RETURNING *`,
        { replacements: { id, corporateId: corpId, candidateId: candidate.id, requisitionId: requisitionId ? Number(requisitionId) : null, positionTitle: positionTitle ? String(positionTitle).trim() : null, requestedBy: actorId(req) }, transaction, type: db.QueryTypes.SELECT }
      );
      await event(id, 'hr', actorId(req), 'case_created', { candidateId: candidate.id }, transaction);
      return { ...created, ...candidate };
    });
    return res.status(201).json({ success: true, case: hrCase(result) });
  } catch (error) {
    console.error('[peme] create case', error);
    return res.status(500).json({ success: false, message: 'Unable to create pre-employment case' });
  }
});

router.get('/cases/:caseId', authCorporate, async (req, res) => {
  try {
    const row = await caseForCorporate(req.params.caseId, corporateId(req));
    if (!row) return res.status(404).json({ success: false, message: 'Pre-employment case not found' });
    return res.json({ success: true, case: hrCase(row) });
  } catch { return res.status(500).json({ success: false, message: 'Unable to load pre-employment case' }); }
});

router.post('/cases/:caseId/invite', authCorporate, async (req, res) => {
  try {
    const row = await caseForCorporate(req.params.caseId, corporateId(req));
    if (!row) return res.status(404).json({ success: false, message: 'Pre-employment case not found' });
    if (['completed', 'cancelled'].includes(row.status)) return res.status(409).json({ success: false, message: 'This case cannot be invited' });
    if (!row.email) return res.status(400).json({ success: false, message: 'A candidate email is required to send a secure invitation' });
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.transaction(async (transaction) => {
      await db.query(`UPDATE pre_employment_cases SET status='invited',invitation_hash=:hash,invitation_expires_at=:expiresAt,invitation_used_at=NULL,updated_at=NOW() WHERE id=:id`, { replacements: { id: row.id, hash: hash(token), expiresAt }, transaction });
      await event(row.id, 'hr', actorId(req), 'invitation_issued', { expiresAt: expiresAt.toISOString() }, transaction);
    });
    const appUrl = (process.env.APP_URL || process.env.FRONTEND_URL || 'https://app.mediqzy.com').replace(/\/$/, '');
    const invitationUrl = `${appUrl}/pre-employment/consent/${token}`;
    const subject = 'Action required: pre-employment health check';
    // The body carries a one-off consent link, so it is recorded by subject and
    // recipient only — the link itself is not filed in a shared folder.
    const htmlContent = `<p>Hello ${String(row.full_name).replace(/[<>&"]/g, '')},</p><p>Please review and consent to your pre-employment health-check process. This is separate from employee health benefits.</p><p><a href="${invitationUrl}">Review and consent securely</a></p><p>This link expires in seven days.</p>`;
    const sent = await emailServiceModule.sendOutboundEmail(1, { to: row.email, subject, htmlContent });
    await recordAutomatedSend({ to: row.email, subject, htmlBody: '<p>A pre-employment consent invitation was sent. The secure link is not stored here.</p>', messageId: sent?.messageId || null, labels: ['sent', 'pre-employment', 'invitation'] });
    return res.json({ success: true, delivery: 'email', expiresAt: expiresAt.toISOString() });
  } catch (error) {
    console.error('[peme] invite', error);
    return res.status(503).json({ success: false, message: 'Unable to send the secure invitation. No invitation link was disclosed.' });
  }
});

router.post('/cases/:caseId/schedule', authCorporate, async (req, res) => {
  const appointmentAt = asDate(req.body?.appointmentAt);
  const venue = req.body?.venue && typeof req.body.venue === 'object' && !Array.isArray(req.body.venue) ? req.body.venue : null;
  if (!appointmentAt || !venue) return res.status(400).json({ success: false, message: 'A valid appointmentAt and venue are required' });
  try {
    const row = await caseForCorporate(req.params.caseId, corporateId(req));
    if (!row) return res.status(404).json({ success: false, message: 'Pre-employment case not found' });
    if (!row.consented_at) return res.status(409).json({ success: false, code: 'candidate_consent_required', message: 'Candidate consent is required before scheduling' });
    await db.transaction(async (transaction) => {
      await db.query(`UPDATE pre_employment_cases SET status='scheduled',appointment_at=:appointmentAt,venue=CAST(:venue AS JSONB),updated_at=NOW() WHERE id=:id`, { replacements: { id: row.id, appointmentAt, venue: JSON.stringify(venue) }, transaction });
      await event(row.id, 'hr', actorId(req), 'appointment_scheduled', { appointmentAt: appointmentAt.toISOString() }, transaction);
    });
    return res.json({ success: true });
  } catch { return res.status(500).json({ success: false, message: 'Unable to schedule pre-employment case' }); }
});

// HR QA 2026-11-21: a case could not be cancelled, nor its history read.
router.post('/cases/:caseId/cancel', authCorporate, async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 3) return res.status(400).json({ success: false, message: 'Give a reason for cancelling' });
  try {
    const row = await caseForCorporate(req.params.caseId, corporateId(req));
    if (!row) return res.status(404).json({ success: false, message: 'Pre-employment case not found' });
    if (['completed', 'cancelled'].includes(row.status)) return res.status(409).json({ success: false, message: `This case is already ${row.status}` });
    await db.transaction(async (transaction) => {
      await db.query(`UPDATE pre_employment_cases SET status='cancelled',invitation_hash=NULL,updated_at=NOW() WHERE id=:id`, { replacements: { id: row.id }, transaction });
      await event(row.id, 'hr', actorId(req), 'case_cancelled', { reason: reason.slice(0, 500) }, transaction);
    });
    return res.json({ success: true });
  } catch { return res.status(500).json({ success: false, message: 'Unable to cancel the case' }); }
});

router.get('/cases/:caseId/events', authCorporate, async (req, res) => {
  try {
    const row = await caseForCorporate(req.params.caseId, corporateId(req));
    if (!row) return res.status(404).json({ success: false, message: 'Pre-employment case not found' });
    const events = await db.query(
      `SELECT e.event_type, e.actor_type, e.created_at, e.payload, u.email AS actor_email
         FROM pre_employment_case_events e LEFT JOIN users u ON u.id = e.actor_user_id
        WHERE e.case_id = :id ORDER BY e.created_at, e.id`,
      { replacements: { id: row.id }, type: db.QueryTypes.SELECT }
    );
    // Only the workflow is shown; a clinical summary never leaves the clinical reviewer.
    return res.json({ success: true, events: events.map((e) => ({
      type: e.event_type, actor: e.actor_type, by: e.actor_email || null, at: e.created_at,
      detail: e.event_type === 'appointment_scheduled' ? e.payload?.appointmentAt || null
        : e.event_type === 'case_cancelled' ? e.payload?.reason || null
          : e.event_type === 'fitness_outcome_recorded' ? e.payload?.fitnessStatus || null : null,
    })) });
  } catch { return res.status(500).json({ success: false, message: 'Unable to load the case history' }); }
});

router.post('/cases/:caseId/clinical-outcome', authCorporate, requireClinicalReviewer, async (req, res) => {
  const fitnessStatus = String(req.body?.fitnessStatus || '').trim();
  const clinicalSummary = req.body?.clinicalSummary && typeof req.body.clinicalSummary === 'object' && !Array.isArray(req.body.clinicalSummary) ? req.body.clinicalSummary : {};
  if (!FITNESS_STATUSES.has(fitnessStatus) || fitnessStatus === 'pending') return res.status(400).json({ success: false, message: 'A final fitnessStatus is required' });
  try {
    const row = await caseForCorporate(req.params.caseId, corporateId(req));
    if (!row) return res.status(404).json({ success: false, message: 'Pre-employment case not found' });
    if (!row.consented_at) return res.status(409).json({ success: false, code: 'candidate_consent_required', message: 'Candidate consent is required before a clinical outcome can be recorded' });
    await db.transaction(async (transaction) => {
      await db.query(`UPDATE pre_employment_cases SET status='completed',fitness_status=:fitnessStatus,fitness_issued_at=NOW(),clinical_reviewer_user_id=:reviewer,clinical_summary=CAST(:summary AS JSONB),updated_at=NOW() WHERE id=:id`, { replacements: { id: row.id, fitnessStatus, reviewer: actorId(req), summary: JSON.stringify(clinicalSummary) }, transaction });
      await event(row.id, 'clinical', actorId(req), 'fitness_outcome_recorded', { fitnessStatus }, transaction);
    });
    return res.json({ success: true, fitnessStatus });
  } catch { return res.status(500).json({ success: false, message: 'Unable to record clinical outcome' }); }
});

candidateRouter.get('/invitations/:token', invitationLimiter, async (req, res) => {
  const tokenHash = hash(req.params.token);
  const [row] = await db.query(`SELECT pc.*,c.full_name FROM pre_employment_cases pc JOIN pre_employment_candidates c ON c.id=pc.candidate_id WHERE pc.invitation_hash=:hash AND pc.invitation_expires_at>NOW() LIMIT 1`, { replacements: { hash: tokenHash }, type: db.QueryTypes.SELECT });
  if (!row) return res.status(404).json({ success: false, message: 'Invitation is invalid or has expired' });
  return res.json({ success: true, case: publicCase(row), candidateName: row.full_name });
});

candidateRouter.post('/invitations/:token/consent', invitationLimiter, async (req, res) => {
  if (req.body?.accepted !== true) return res.status(400).json({ success: false, message: 'Explicit consent is required' });
  const tokenHash = hash(req.params.token);
  try {
    await db.transaction(async (transaction) => {
      const [row] = await db.query(`SELECT id,status FROM pre_employment_cases WHERE invitation_hash=:hash AND invitation_expires_at>NOW() FOR UPDATE`, { replacements: { hash: tokenHash }, transaction, type: db.QueryTypes.SELECT });
      if (!row) throw Object.assign(new Error('Invitation is invalid or has expired'), { status: 404 });
      if (['completed', 'cancelled'].includes(row.status)) throw Object.assign(new Error('This case cannot accept consent'), { status: 409 });
      await db.query(`UPDATE pre_employment_cases SET status='consented',consent_version=:version,consented_at=COALESCE(consented_at,NOW()),consent_ip_hash=:ipHash,invitation_used_at=NOW(),updated_at=NOW() WHERE id=:id`, { replacements: { id: row.id, version: String(req.body?.consentVersion || 'peme-v1').slice(0, 80), ipHash: hash(req.ip || '') }, transaction });
      await event(row.id, 'candidate', null, 'consent_recorded', {}, transaction);
    });
    return res.json({ success: true, status: 'consented' });
  } catch (error) { console.error('[peme] consent', error); return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to record consent' }); }
});

export { candidateRouter };
export default router;
