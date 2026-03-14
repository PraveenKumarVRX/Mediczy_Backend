/**
 * Clinical Workflow API Routes
 * SOAP notes, ICD-10/CPT coding, encounter summaries
 */

import express from 'express';
import { authDoctor } from '../middleware/doctor.middleware.js';
import ClinicalNote from '../models/clinical-note.model.js';
import llmProvider from '../services/ai-brain/llm-provider.js';

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

    res.json({
      success: true,
      data: note
    });
  } catch (error) {
    console.error('Sign note error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sign note'
    });
  }
});

// ICD-10 Code Search
router.get('/icd10/search', authDoctor, async (req, res) => {
  try {
    const { q } = req.query;
    
    // Mock ICD-10 data - in production, integrate with actual ICD-10 API
    const mockResults = [
      { code: 'J06.9', description: 'Acute upper respiratory infection, unspecified' },
      { code: 'I10', description: 'Essential (primary) hypertension' },
      { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
      { code: 'M79.3', description: 'Panniculitis, unspecified' }
    ].filter(item => 
      item.code.toLowerCase().includes(q?.toLowerCase() || '') ||
      item.description.toLowerCase().includes(q?.toLowerCase() || '')
    );

    res.json({
      success: true,
      data: mockResults
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Search failed'
    });
  }
});

// CPT Code Search
router.get('/cpt/search', authDoctor, async (req, res) => {
  try {
    const { q } = req.query;
    
    // Mock CPT data - in production, integrate with actual CPT API
    const mockResults = [
      { code: '99213', description: 'Office visit, established patient, 20-29 minutes' },
      { code: '99214', description: 'Office visit, established patient, 30-39 minutes' },
      { code: '80053', description: 'Comprehensive metabolic panel' },
      { code: '85025', description: 'Complete blood count (CBC) with differential' }
    ].filter(item => 
      item.code.includes(q || '') ||
      item.description.toLowerCase().includes(q?.toLowerCase() || '')
    );

    res.json({
      success: true,
      data: mockResults
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Search failed'
    });
  }
});

export default router;
