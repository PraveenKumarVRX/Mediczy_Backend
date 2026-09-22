/**
 * /api/clinical-safety — structured allergies, problem list, prescription safety, reconciliation (WP-1.1 / 1.2).
 *
 * Callers: doctors (doctor token) and hospital/clinic staff (user token). Every patient-scoped endpoint requires an
 * explicit relationship to the patient (services/patient-access.service.js); RLS alone does not decide that.
 */
import express from 'express';
import jwt from 'jsonwebtoken';
import { authUser, authDoctor } from '../middleware/auth.middleware.js';
import { safeRouter } from '../utils/safeRouter.js';
import { requirePatientAccess } from '../services/patient-access.service.js';
import { getAllergyStatus, listAllergies, addAllergy, recordNoKnownAllergy, setAllergyStatus } from '../services/allergy.service.js';
import { listProblems, addProblem, updateProblem } from '../services/problem-list.service.js';
import { checkPrescriptionSafety, getSafetyMode, setSafetyMode, safetyDashboard, orgOfRequest } from '../services/prescription-safety.service.js';
import { loadApprovedClasses } from '../services/drug-class.service.js';
import * as recon from '../services/med-reconciliation.service.js';
import pool from '../db/pgPool.js';

const router = safeRouter(express.Router());

// Doctor tokens are verified by authDoctor, everything else by authUser; the decode only chooses which verifier runs.
const authClinician = (req, res, next) => {
  const t = req.headers.authorization?.split(' ')[1];
  const d = t ? jwt.decode(t) : null;
  return d && String(d.userType || '').toLowerCase() === 'doctor' ? authDoctor(req, res, next) : authUser(req, res, next);
};

const roleOf = (req) => (req.doctor ? 'doctor' : String(req.user?.role || '').toLowerCase());
const CLINICAL = new Set(['doctor', 'nurse', 'pharmacist', 'hospital_admin', 'medical_director', 'admin', 'super_admin', 'consultant', 'clinic_admin']);
const DIRECTORS = new Set(['hospital_admin', 'medical_director', 'admin', 'super_admin']);
const need = (set, message) => (req, res, next) => (set.has(roleOf(req)) ? next() : res.status(403).json({ success: false, message }));
const clinicalOnly = need(CLINICAL, 'Clinical staff only');
const directorsOnly = need(DIRECTORS, 'Medical director or administrator only');
const actorId = (req) => Number(req.doctor?.id ?? req.user?.id) || null;
const access = requirePatientAccess();

router.use(authClinician, clinicalOnly);

// ── dry run: what would the safety check say about these medicines? ────────────
router.post('/check', access, async (req, res) => {
  const { patientId, medications, pregnant } = req.body || {};
  if (!Array.isArray(medications) || medications.length === 0) return res.status(400).json({ success: false, message: 'medications is required' });
  const result = await checkPrescriptionSafety({ patientId, organizationId: orgOfRequest(req), medications, pregnant });
  res.json({ success: true, mode: await getSafetyMode(orgOfRequest(req)), ...result });
});

// ── allergies ────────────────────────────────────────────────────────────────
router.get('/patients/:patientId/allergies', access, async (req, res) => {
  const org = orgOfRequest(req);
  const { status, allergies, noKnownAllergy, recordedAt } = await getAllergyStatus(req.params.patientId, org);
  res.json({ success: true, status, noKnownAllergy, recordedAt: recordedAt ?? null, allergies,
    history: req.query.includeInactive === 'true' ? await listAllergies(req.params.patientId, org, { includeInactive: true }) : undefined });
});
router.post('/patients/:patientId/allergies', access, async (req, res) => {
  const b = req.body || {};
  const row = await addAllergy({ patientId: req.params.patientId, organizationId: orgOfRequest(req), allergenName: b.allergenName, allergenType: b.allergenType, drugClass: b.drugClass, severity: b.severity, reaction: b.reaction, notes: b.notes, enteredBy: actorId(req), verified: roleOf(req) !== 'nurse' ? Boolean(b.verified) : false });
  res.status(201).json({ success: true, data: row });
});
router.post('/patients/:patientId/no-known-allergy', access, async (req, res) => {
  res.status(201).json({ success: true, data: await recordNoKnownAllergy({ patientId: req.params.patientId, organizationId: orgOfRequest(req), enteredBy: actorId(req) }) });
});
router.patch('/patients/:patientId/allergies/:allergyId', access, async (req, res) => {
  const row = await setAllergyStatus({ patientId: req.params.patientId, organizationId: orgOfRequest(req), allergyId: req.params.allergyId, status: req.body?.status, reason: req.body?.reason, by: actorId(req) });
  if (!row) return res.status(404).json({ success: false, message: 'Allergy not found' });
  res.json({ success: true, data: row });
});

// ── problem list ─────────────────────────────────────────────────────────────
router.get('/patients/:patientId/problems', access, async (req, res) => {
  res.json({ success: true, data: await listProblems(req.params.patientId, orgOfRequest(req), { includeResolved: req.query.includeResolved === 'true' }) });
});
router.post('/patients/:patientId/problems', access, async (req, res) => {
  const b = req.body || {};
  const row = await addProblem({ patientId: req.params.patientId, organizationId: orgOfRequest(req), conditionName: b.conditionName, icd10Code: b.icd10Code, snomedCode: b.snomedCode, conditionType: b.conditionType, severity: b.severity, onsetDate: b.onsetDate, notes: b.notes, notedBy: actorId(req), encounterId: b.encounterId });
  res.status(201).json({ success: true, data: row });
});
router.patch('/patients/:patientId/problems/:problemId', access, async (req, res) => {
  const row = await updateProblem({ patientId: req.params.patientId, organizationId: orgOfRequest(req), problemId: req.params.problemId, status: req.body?.status, notes: req.body?.notes, severity: req.body?.severity });
  if (!row) return res.status(404).json({ success: false, message: 'Problem not found' });
  res.json({ success: true, data: row });
});

// ── reconciliation ───────────────────────────────────────────────────────────
router.post('/reconciliations', access, async (req, res) => {
  const b = req.body || {};
  const data = await recon.startReconciliation({ organizationId: orgOfRequest(req), patientId: b.patientId, admissionId: b.admissionId ?? null, type: b.type, items: Array.isArray(b.items) ? b.items : [], createdBy: actorId(req) });
  res.status(201).json({ success: true, data });
});
router.get('/patients/:patientId/reconciliations', access, async (req, res) => {
  res.json({ success: true, data: await recon.listForPatient({ organizationId: orgOfRequest(req), patientId: req.params.patientId, userId: actorId(req) }) });
});
router.get('/reconciliations/:id', async (req, res) => {
  const data = await recon.getReconciliation({ organizationId: orgOfRequest(req), id: Number(req.params.id), userId: actorId(req) });
  if (!data) return res.status(404).json({ success: false, message: 'Reconciliation not found' });
  res.json({ success: true, data });
});
router.post('/reconciliations/:id/items', async (req, res) => {
  res.status(201).json({ success: true, data: await recon.addItem({ organizationId: orgOfRequest(req), id: Number(req.params.id), item: req.body || {}, userId: actorId(req) }) });
});
router.patch('/reconciliations/:id/items/:itemId', async (req, res) => {
  const b = req.body || {};
  res.json({ success: true, data: await recon.decideItem({ organizationId: orgOfRequest(req), id: Number(req.params.id), itemId: Number(req.params.itemId), action: b.action, reason: b.reason, resultingOrderId: b.resultingOrderId, userId: actorId(req) }) });
});
router.post('/reconciliations/:id/sign', need(new Set(['doctor', 'hospital_admin', 'medical_director', 'admin', 'super_admin', 'consultant']), 'Only a doctor can sign a reconciliation'), async (req, res) => {
  res.json({ success: true, data: await recon.signReconciliation({ organizationId: orgOfRequest(req), id: Number(req.params.id), signedBy: actorId(req) }) });
});

// ── governance: mode, dashboard, class map ───────────────────────────────────
router.get('/settings', async (req, res) => res.json({ success: true, mode: await getSafetyMode(orgOfRequest(req)) }));
router.put('/settings', directorsOnly, async (req, res) => {
  const mode = req.body?.mode;
  if (!['shadow', 'enforce'].includes(mode)) return res.status(400).json({ success: false, message: "mode must be 'shadow' or 'enforce'" });
  res.json({ success: true, ...(await setSafetyMode(orgOfRequest(req), mode, actorId(req))) });
});
router.get('/dashboard', directorsOnly, async (req, res) => res.json({ success: true, data: await safetyDashboard(orgOfRequest(req), Number(req.query.days) || 30) }));
router.get('/drug-classes', async (_req, res) => {
  const approved = await loadApprovedClasses();
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM clinical_knowledge_rules WHERE domain_key = 'drug_class_map' AND status <> 'approved' AND status <> 'retired'`);
  res.json({ success: true, approved: approved.map((c) => ({ classKey: c.classKey, label: c.label, members: c.members.length })), awaitingApproval: rows[0].n,
    note: 'Class-level allergy matching uses only medical-director-approved classes. Approve drafts in the Knowledge Rules review tab.' });
});

export default router;
