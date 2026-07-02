/**
 * Clinical Workflow API Routes
 * SOAP notes, ICD-10/CPT coding, encounter summaries
 */

import express from 'express';
import { authDoctor } from '../middleware/doctor.middleware.js';
import ClinicalNote from '../models/clinical-note.model.js';
import llmProvider from '../services/ai-brain/llm-provider.js';
import { connectPostgres } from '../db/postgres.js';
import { createCodingSuggestions } from '../services/clinical-intelligence.service.js';
import { draftSoapNote } from '../services/healthcare-ai-opportunity.service.js';

const router = express.Router();

// Create/Update Clinical Note
router.post('/notes', authDoctor, async (req, res) => {
  try {
    const {
      appointmentId,
      patientId,
      subjective,
      objective,
      assessment,
      plan,
      chiefComplaint,
      vitals,
      icd10Codes,
      cptCodes
    } = req.body;

    const clinicalNote = await ClinicalNote.create({
      appointmentId,
      patientId,
      doctorId: req.doctor.id,
      subjective,
      objective,
      assessment,
      plan,
      chiefComplaint,
      vitals,
      icd10Codes: icd10Codes || [],
      cptCodes: cptCodes || [],
      status: 'draft'
    });

    res.json({
      success: true,
      data: clinicalNote
    });
  } catch (error) {
    console.error('Clinical note creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create clinical note'
    });
  }
});

// AI-Generate Encounter Summary
router.post('/notes/:id/generate-summary', authDoctor, async (req, res) => {
  try {
    const note = await ClinicalNote.findOne({
      where: { id: req.params.id, doctorId: req.doctor.id }
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Clinical note not found'
      });
    }

    // Generate AI summary
    const prompt = `Generate a concise encounter summary from this SOAP note:
    
Chief Complaint: ${note.chiefComplaint || 'Not documented'}
Subjective: ${note.subjective || 'Not documented'}
Objective: ${note.objective || 'Not documented'}
Assessment: ${note.assessment || 'Not documented'}
Plan: ${note.plan || 'Not documented'}

Provide a 2-3 sentence professional summary suitable for handoff or quick review.`;

    const result = await llmProvider.chat({
      messages: [
        { role: 'system', content: 'You are a medical documentation assistant. Create concise, professional clinical summaries.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      maxTokens: 200
    });

    const encounterSummary = result.content;

    await note.update({
      encounterSummary,
      isAiGenerated: true,
      aiConfidenceScore: 0.95
    });

    res.json({
      success: true,
      data: {
        encounterSummary,
        note
      }
    });
  } catch (error) {
    console.error('Summary generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate summary'
    });
  }
});

// AI draft SOAP note from consultation transcript or rough notes.
// This is assistive only: it returns draft content and optionally creates a draft clinical note.
router.post('/notes/draft-from-transcript', authDoctor, async (req, res) => {
  try {
    const { transcript, context = {}, appointmentId, patientId, persist = false } = req.body || {};

    const result = await draftSoapNote({
      transcript,
      context: {
        ...context,
        appointmentId,
        patientId,
        doctorId: req.doctor.id
      }
    });

    let note = null;
    if (persist) {
      if (!appointmentId || !patientId) {
        return res.status(400).json({
          success: false,
          message: 'appointmentId and patientId are required when persist=true'
        });
      }

      note = await ClinicalNote.create({
        appointmentId,
        patientId,
        doctorId: req.doctor.id,
        chiefComplaint: result.data.chiefComplaint || context.chiefComplaint || '',
        subjective: result.data.subjective || '',
        objective: result.data.objective || '',
        assessment: result.data.assessment || '',
        plan: result.data.plan || '',
        vitals: context.vitals || {},
        icd10Codes: [],
        cptCodes: [],
        encounterSummary: result.data.followUp || null,
        status: 'draft',
        isAiGenerated: true,
        aiConfidenceScore: result.governance.fallbackReason ? 0.55 : 0.82
      });
    }

    res.json({
      success: true,
      data: {
        draft: result.data,
        note,
        governance: result.governance
      }
    });
  } catch (error) {
    const status = error.status || 500;
    console.error('SOAP draft generation error:', error);
    res.status(status).json({
      success: false,
      message: status === 400 ? error.message : 'Failed to draft SOAP note'
    });
  }
});

// Get Clinical Notes for Patient
router.get('/notes/patient/:patientId', authDoctor, async (req, res) => {
  try {
    const notes = await ClinicalNote.findAll({
      where: { patientId: req.params.patientId },
      order: [['createdAt', 'DESC']],
      limit: parseInt(req.query.limit) || 50
    });

    res.json({
      success: true,
      data: notes
    });
  } catch (error) {
    console.error('Fetch notes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notes'
    });
  }
});

// Sign Clinical Note
router.post('/notes/:id/sign', authDoctor, async (req, res) => {
  try {
    const note = await ClinicalNote.findOne({
      where: { id: req.params.id, doctorId: req.doctor.id }
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    const crypto = await import('crypto');
    const signatureHash = crypto.createHash('sha256')
      .update(`${note.id}-${req.doctor.id}-${new Date().toISOString()}`)
      .digest('hex');

    await note.update({
      status: 'signed',
      signedAt: new Date(),
      signatureHash
    });

    const codingSuggestions = await createCodingSuggestions(note);

    let billingBridge = null;
    try {
      const hospitalId = req.doctor?.hospital_id || req.user?.hospital_id || req.user?.tenant_id;
      if (hospitalId) {
        const { bridgeCodingToBilling } = await import('../services/clinical-coding-bridge.service.js');
        billingBridge = await bridgeCodingToBilling(note, hospitalId);
      }
    } catch (e) {
      console.warn('[clinical-workflow] billing bridge:', e.message);
    }

    res.json({
      success: true,
      data: note,
      codingSuggestions,
      billingBridge,
      requiresCodingReview: codingSuggestions.length > 0
    });
  } catch (error) {
    console.error('Sign note error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sign note'
    });
  }
});

// ICD-10 Code Search (real database - 72,750 codes from HuggingFace)
router.get('/icd10/search', authDoctor, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json({ success: true, data: [] });
    }

    const pool = await connectPostgres();
    const searchTerm = q.trim();

    // Use full-text search with fallback to ILIKE
    const result = await pool.query(`
      SELECT code, description, category
      FROM icd10_codes
      WHERE search_vector @@ plainto_tsquery('english', $1)
         OR code ILIKE $2
         OR description ILIKE $3
      ORDER BY
        CASE WHEN code ILIKE $2 THEN 0 ELSE 1 END,
        ts_rank(search_vector, plainto_tsquery('english', $1)) DESC
      LIMIT 20
    `, [searchTerm, `${searchTerm}%`, `%${searchTerm}%`]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('[ICD-10 Search]', error.message);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
});

// SNOMED CT Code Search (real database - 321,864 codes from HuggingFace)
router.get('/snomed/search', authDoctor, async (req, res) => {
  try {
    const { q, valueSet } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json({ success: true, data: [] });
    }

    const pool = await connectPostgres();
    const searchTerm = q.trim();

    let query = `
      SELECT code, description, value_set_name, clinical_focus, code_system
      FROM snomed_codes
      WHERE (search_vector @@ plainto_tsquery('english', $1)
         OR code ILIKE $2
         OR description ILIKE $3)
    `;
    const params = [searchTerm, `${searchTerm}%`, `%${searchTerm}%`];

    if (valueSet) {
      query += ` AND value_set_name ILIKE $4`;
      params.push(`%${valueSet}%`);
    }

    query += `
      ORDER BY
        CASE WHEN code ILIKE $2 THEN 0 ELSE 1 END,
        ts_rank(search_vector, plainto_tsquery('english', $1)) DESC
      LIMIT 20
    `;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('[SNOMED Search]', error.message);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
});

// CPT Code Search
router.get('/cpt/search', authDoctor, async (req, res) => {
  try {
    const { q } = req.query;
    
    // Static CPT codes (no HF dataset available - standard codes)
    const cptCodes = [
      { code: '99201', description: 'Office visit, new patient, 10 minutes' },
      { code: '99202', description: 'Office visit, new patient, 15-29 minutes' },
      { code: '99203', description: 'Office visit, new patient, 30-44 minutes' },
      { code: '99204', description: 'Office visit, new patient, 45-59 minutes' },
      { code: '99205', description: 'Office visit, new patient, 60-74 minutes' },
      { code: '99211', description: 'Office visit, established patient, 5 minutes' },
      { code: '99212', description: 'Office visit, established patient, 10-19 minutes' },
      { code: '99213', description: 'Office visit, established patient, 20-29 minutes' },
      { code: '99214', description: 'Office visit, established patient, 30-39 minutes' },
      { code: '99215', description: 'Office visit, established patient, 40-54 minutes' },
      { code: '99241', description: 'Consultation, 15 minutes' },
      { code: '99242', description: 'Consultation, 30 minutes' },
      { code: '99243', description: 'Consultation, 40 minutes' },
      { code: '99244', description: 'Consultation, 60 minutes' },
      { code: '99245', description: 'Consultation, 80 minutes' },
      { code: '80048', description: 'Basic metabolic panel (calcium, ionized)' },
      { code: '80050', description: 'General health panel' },
      { code: '80053', description: 'Comprehensive metabolic panel' },
      { code: '80061', description: 'Lipid panel' },
      { code: '80076', description: 'Hepatic function panel' },
      { code: '85025', description: 'Complete blood count (CBC) with differential' },
      { code: '85027', description: 'Complete blood count (CBC), automated' },
      { code: '36415', description: 'Venipuncture for blood collection' },
      { code: '81001', description: 'Urinalysis with microscopy' },
      { code: '87880', description: 'Strep test, rapid' },
      { code: '71046', description: 'Chest X-ray, 2 views' },
      { code: '93000', description: 'Electrocardiogram (ECG), 12-lead' },
      { code: '90658', description: 'Influenza vaccine, intramuscular' },
      { code: '90471', description: 'Immunization administration, injection' },
      { code: '29125', description: 'Short arm splint application' },
      { code: '11102', description: 'Tangential biopsy of skin' },
      { code: '10060', description: 'Incision and drainage of abscess' },
      { code: '12001', description: 'Simple wound repair, 2.5 cm or less' },
      { code: '17000', description: 'Destruction of premalignant lesion, first' },
      { code: '99381', description: 'Preventive visit, new patient, infant' },
      { code: '99391', description: 'Preventive visit, established patient, infant' },
      { code: '99395', description: 'Preventive visit, established patient, 18-39 years' },
      { code: '99396', description: 'Preventive visit, established patient, 40-64 years' },
      { code: '96127', description: 'Depression screening' },
      { code: '99497', description: 'Advance care planning, 16-30 minutes' }
    ].filter(item => 
      !q || item.code.includes(q) ||
      item.description.toLowerCase().includes(q?.toLowerCase() || '')
    );

    res.json({
      success: true,
      data: cptCodes.slice(0, 20)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Search failed' });
  }
});

// Update draft note for autosave
router.put('/notes/:id/draft', authDoctor, async (req, res) => {
  try {
    const note = await ClinicalNote.findOne({ where: { id: req.params.id, doctorId: req.doctor.id } });
    if (!note) return res.status(404).json({ success: false, message: 'Clinical note not found' });
    if (note.status === 'signed') return res.status(409).json({ success: false, message: 'Signed notes cannot be edited' });
    const allowed = ['subjective', 'objective', 'assessment', 'plan', 'chiefComplaint', 'vitals', 'icd10Codes', 'cptCodes'];
    const updates = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
    await note.update({ ...updates, status: 'draft' });
    res.json({ success: true, data: note });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to autosave clinical note' });
  }
});

export default router;
