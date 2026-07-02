/**
 * Hospital HMIS clinical notes — progress notes from hospital portal (EHR, ward rounds).
 */
import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import {
  createClinicalNote,
  listClinicalNotes,
  updateClinicalNote,
  signClinicalNote,
  getClinicalNoteById,
  resolveDoctorId,
} from '../services/clinical-notes.service.js';
import ClinicalNote from '../models/clinical-note.model.js';
import llmProvider from '../services/ai-brain/llm-provider.js';

const router = express.Router();

const authHospital = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Hospital token required' });
  try {
    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    const role = decoded.role || decoded.userType;
    const validRoles = ['hospital', 'hospital_admin', 'doctor', 'staff', 'nurse', 'cmo', 'medical_superintendent', 'ms', 'ceo', 'coo', 'cfo'];
    if (!validRoles.includes(role)) {
      return res.status(403).json({ success: false, message: 'Hospital role required' });
    }
    req.hospitalUser = decoded;
    req.hospitalId = decoded.hospital_id || decoded.tenant_id || decoded.id || decoded.hospitalId;
    req.userId = decoded.id;
    req.userRole = role;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid hospital token' });
  }
};

const actorDoctorId = async (req) => resolveDoctorId({
  userId: req.userId,
  organizationId: req.hospitalId,
});

router.post('/notes', authHospital, async (req, res) => {
  try {
    const doctorId = await actorDoctorId(req);
    const {
      patientId, admissionId, noteType, subject, content,
      subjective, objective, assessment, plan,
      chiefComplaint, vitals, icd10Codes, cptCodes,
    } = req.body;

    if (!patientId) return res.status(400).json({ success: false, message: 'patientId is required' });

    const bodyText = content || subjective || '';
    const note = await createClinicalNote({
      patientId: Number(patientId),
      admissionId: admissionId ? Number(admissionId) : null,
      noteType: noteType || 'progress_note',
      authorRole: req.userRole,
      organizationId: req.hospitalId,
      doctorId,
      chiefComplaint: chiefComplaint || subject || '',
      subjective: subjective || bodyText,
      objective: objective || '',
      assessment: assessment || '',
      plan: plan || '',
      vitals: vitals || {},
      icd10Codes: icd10Codes || [],
      cptCodes: cptCodes || [],
    });
    res.status(201).json({ success: true, data: note });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/notes/patient/:patientId', authHospital, async (req, res) => {
  try {
    const notes = await listClinicalNotes({
      patientId: Number(req.params.patientId),
      admissionId: req.query.admissionId ? Number(req.query.admissionId) : undefined,
      limit: req.query.limit,
    });
    res.json({ success: true, data: notes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/notes/admission/:admissionId', authHospital, async (req, res) => {
  try {
    const notes = await listClinicalNotes({
      admissionId: Number(req.params.admissionId),
      limit: req.query.limit,
    });
    res.json({ success: true, data: notes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/notes/:id', authHospital, async (req, res) => {
  try {
    const doctorId = await actorDoctorId(req);
    const note = await updateClinicalNote(Number(req.params.id), doctorId, req.body);
    if (!note) return res.status(404).json({ success: false, message: 'Note not found' });
    res.json({ success: true, data: note });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/notes/:id/sign', authHospital, async (req, res) => {
  try {
    const doctorId = await actorDoctorId(req);
    const note = await signClinicalNote(Number(req.params.id), doctorId);
    if (!note) return res.status(404).json({ success: false, message: 'Note not found' });
    res.json({ success: true, data: note });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/notes/:id/generate-summary', authHospital, async (req, res) => {
  try {
    const doctorId = await actorDoctorId(req);
    const note = await ClinicalNote.findOne({ where: { id: req.params.id, doctorId } });
    if (!note) return res.status(404).json({ success: false, message: 'Note not found' });

    const result = await llmProvider.chat({
      messages: [
        { role: 'system', content: 'You are a medical documentation assistant. Create concise professional clinical summaries.' },
        { role: 'user', content: `Generate a 2-3 sentence encounter summary:\nS: ${note.subjective}\nO: ${note.objective}\nA: ${note.assessment}\nP: ${note.plan}` },
      ],
      temperature: 0.3,
      maxTokens: 200,
    });
    await note.update({ encounterSummary: result.content, isAiGenerated: true });
    res.json({ success: true, data: { encounterSummary: result.content, note } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
