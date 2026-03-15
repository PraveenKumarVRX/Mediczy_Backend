/**
 * CDSS Knowledge API Routes
 * 
 * Provides endpoints for:
 * - AI-powered CDSS query (using SIB/Groq)
 * - PDF document upload and ingestion
 * - Text/JSON knowledge ingestion
 * - Semantic search in knowledge base
 * - Knowledge base statistics
 */

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pdfKnowledgeService from '../services/pdfKnowledge.service.js';
import cdssService from '../services/cdss.service.js';
import { scanOnly } from '../services/minio-upload.service.js';
import cdssFeedbackService from '../services/cdss-feedback.service.js';

const router = Router();

/**
 * POST /cdss/knowledge/query
 * AI-powered CDSS query using SIB/Groq with knowledge base
 * 
 * Body:
 * {
 *   query: "clinical question",
 *   category: "diagnosis|treatment|drug-info|guidelines|differential|lab-tests|dosage|interactions",
 *   specialty: "general|cardiology|neurology|etc",
 *   searchKnowledge: true,
 *   sources: ["gale", "bmj", "nejm"]
 * }
 */
router.post('/query', async (req, res) => {
  try {
    const { query, category = 'diagnosis', specialty = 'general', searchKnowledge = true, sources = [] } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length < 3) {
      return res.status(400).json({ error: 'Query must be at least 3 characters' });
    }

    console.log(`[CDSS API] Query: "${query.substring(0, 50)}..." | Category: ${category} | Specialty: ${specialty}`);

    const result = await cdssService.query(query.trim(), {
      category,
      specialty,
      searchKnowledge,
      sources
    });

    res.json({
      success: true,
      provider: result.provider,
      model: result.model,
      ...result.data
    });
  } catch (error) {
    console.error('[CDSS API] Query error:', error);
    res.status(200).json({
      success: false,
      error: error.message,
      fallbackMessage: 'AI services temporarily unavailable. Please try again or use the built-in clinical guidelines.'
    });
  }
});

/**
 * GET /cdss/knowledge/health
 * Get CDSS service health status
 */
router.get('/health', async (req, res) => {
  try {
    const health = await cdssService.getHealth();
    res.json(health);
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * POST /cdss/knowledge/drug-interactions
 * Check for potential drug interactions using CIMS data
 * 
 * Body:
 * {
 *   medications: [
 *     { name: "Paracetamol", genericName: "Acetaminophen" },
 *     { name: "Ibuprofen", genericName: "Ibuprofen" }
 *   ]
 * }
 */
router.post('/drug-interactions', async (req, res) => {
  try {
    const { medications = [] } = req.body;

    if (!medications || medications.length < 2) {
      return res.status(400).json({ 
        success: false, 
        error: 'At least 2 medications required to check interactions' 
      });
    }

    const result = await cdssService.checkDrugInteractions(medications);

    res.json({
      success: true,
      ...result,
      message: result.hasInteractions 
        ? `Found ${result.interactions.length} potential interaction(s)` 
        : 'No significant interactions detected'
    });
  } catch (error) {
    console.error('[CDSS API] Drug interaction check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /cdss/knowledge/medication-alternatives
 * Get alternative medications from CIMS for a given drug
 * 
 * Body:
 * {
 *   genericName: "Paracetamol",
 *   limit: 5
 * }
 */
router.post('/medication-alternatives', async (req, res) => {
  try {
    const { genericName, limit = 5 } = req.body;

    if (!genericName || typeof genericName !== 'string' || genericName.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Generic drug name is required' 
      });
    }

    const alternatives = await cdssService.getMedicationAlternatives(genericName.trim(), limit);

    res.json({
      success: true,
      genericName,
      count: alternatives.length,
      data: alternatives,
      source: 'CIMS Database'
    });
  } catch (error) {
    console.error('[CDSS API] Medication alternatives error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Configure multer for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'knowledge');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

/**
 * POST /cdss/knowledge/upload
 * Upload and ingest a PDF document into the knowledge base
 * 
 * Body (multipart/form-data):
 * - file: PDF file
 * - source: Source name (e.g., "gale_encyclopedia")
 * - category: Category (e.g., "medical", "pharmacology")
 * - title: Document title (optional, defaults to filename)
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    // AV scan before processing
    const avResult = await scanOnly(req.file.path);
    if (!avResult.clean) {
      fs.unlink(req.file.path, () => {});
      const threat = (avResult.detail || '').replace(/^.*:\s*/, '').replace(/\s*FOUND\s*$/, '').trim() || 'Unknown threat';
      return res.status(400).json({
        success: false,
        code: 'MALWARE_DETECTED',
        message: 'File rejected: malware detected in uploaded file',
        threat
      });
    }

    const { source = 'uploaded_pdf', category = 'medical', title } = req.body;
    
    console.log(`[CDSS Knowledge] Processing PDF: ${req.file.originalname}`);

    const result = await pdfKnowledgeService.ingestPDF(req.file.path, {
      source,
      category,
      title: title || req.file.originalname.replace('.pdf', ''),
      namespace: 'cdss_knowledge'
    });

    // Clean up uploaded file after processing
    fs.unlink(req.file.path, (err) => {
      if (err) console.warn('[CDSS Knowledge] Failed to clean up temp file:', err.message);
    });

    res.json({
      success: true,
      message: `Successfully ingested ${result.chunksIngested} chunks from "${result.title}"`,
      ...result
    });
  } catch (error) {
    console.error('[CDSS Knowledge] Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /cdss/knowledge/ingest
 * Ingest text entries directly (JSON format)
 * 
 * Body:
 * {
 *   entries: [
 *     { text: "...", title: "...", topic: "...", section: "..." },
 *     ...
 *   ],
 *   source: "source_name",
 *   category: "category_name"
 * }
 */
router.post('/ingest', async (req, res) => {
  try {
    const { entries, source = 'manual', category = 'medical' } = req.body;

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'No entries provided' });
    }

    const result = await pdfKnowledgeService.ingestText(entries, {
      source,
      category,
      namespace: 'cdss_knowledge'
    });

    res.json({
      success: true,
      message: `Successfully ingested ${result.entriesIngested} entries`,
      ...result
    });
  } catch (error) {
    console.error('[CDSS Knowledge] Ingest error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /cdss/knowledge/search
 * Semantic search in the knowledge base
 * 
 * Body:
 * {
 *   query: "search query",
 *   k: 5,
 *   source: "optional_source_filter",
 *   category: "optional_category_filter",
 *   minSimilarity: 0.5
 * }
 */
router.post('/search', async (req, res) => {
  try {
    const { query, k = 5, source, category, minSimilarity = 0.5 } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

    const results = await pdfKnowledgeService.search(query, {
      k,
      source,
      category,
      minSimilarity,
      namespace: 'cdss_knowledge'
    });

    res.json({
      success: true,
      query,
      resultsCount: results.length,
      results
    });
  } catch (error) {
    console.error('[CDSS Knowledge] Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /cdss/knowledge/stats
 * Get statistics about the knowledge base
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await pdfKnowledgeService.getStats('cdss_knowledge');
    res.json({ success: true, ...stats });
  } catch (error) {
    console.error('[CDSS Knowledge] Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /cdss/knowledge/sources
 * List all available sources in the knowledge base
 */
router.get('/sources', async (req, res) => {
  try {
    const stats = await pdfKnowledgeService.getStats('cdss_knowledge');
    res.json({
      success: true,
      sources: stats.sources || [],
      count: stats.unique_sources || 0
    });
  } catch (error) {
    console.error('[CDSS Knowledge] Sources error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /cdss/knowledge/source/:source
 * Delete all entries from a specific source
 */
router.delete('/source/:source', async (req, res) => {
  try {
    const { source } = req.params;
    const result = await pdfKnowledgeService.deleteBySource(source, 'cdss_knowledge');
    res.json({
      success: true,
      message: `Deleted ${result.deleted} entries from source "${source}"`,
      ...result
    });
  } catch (error) {
    console.error('[CDSS Knowledge] Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /cdss/knowledge/ingest-gale
 * Special endpoint to ingest Gale Encyclopedia of Medicine entries
 * Accepts structured medical entries with conditions, symptoms, treatments
 */
router.post('/ingest-gale', async (req, res) => {
  try {
    const { entries } = req.body;

    if (!entries || !Array.isArray(entries)) {
      return res.status(400).json({ error: 'Entries array is required' });
    }

    // Format entries for ingestion
    const formattedEntries = entries.map((entry, idx) => {
      let text = '';
      
      if (entry.condition) text += `Condition: ${entry.condition}. `;
      if (entry.definition) text += `Definition: ${entry.definition}. `;
      if (entry.symptoms) text += `Symptoms: ${entry.symptoms}. `;
      if (entry.causes) text += `Causes: ${entry.causes}. `;
      if (entry.diagnosis) text += `Diagnosis: ${entry.diagnosis}. `;
      if (entry.treatment) text += `Treatment: ${entry.treatment}. `;
      if (entry.prevention) text += `Prevention: ${entry.prevention}. `;
      if (entry.prognosis) text += `Prognosis: ${entry.prognosis}. `;
      if (entry.complications) text += `Complications: ${entry.complications}. `;
      
      // Fallback to raw text if no structured fields
      if (!text && entry.text) text = entry.text;
      if (!text && entry.content) text = entry.content;

      return {
        id: `gale_${entry.condition || idx}_${Date.now()}`,
        text: text.trim(),
        title: entry.condition || entry.title || `Entry ${idx + 1}`,
        topic: entry.specialty || entry.topic || 'General Medicine',
        section: entry.section || 'Encyclopedia Entry',
        metadata: {
          icd10: entry.icd10 || null,
          specialty: entry.specialty || null,
          relatedConditions: entry.relatedConditions || []
        }
      };
    });

    const result = await pdfKnowledgeService.ingestText(formattedEntries, {
      source: 'gale_encyclopedia',
      category: 'medical_encyclopedia',
      namespace: 'cdss_knowledge'
    });

    res.json({
      success: true,
      message: `Successfully ingested ${result.entriesIngested} Gale Encyclopedia entries`,
      ...result
    });
  } catch (error) {
    console.error('[CDSS Knowledge] Gale ingest error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── CDSS Feedback (Phase 2 Learning Loop) ──────────────────────
router.post('/feedback', async (req, res) => {
  try {
    const { queryId, action, feedbackType, originalResponse, modification, reason, codesKept, codesRemoved, codesAdded, queryText } = req.body;
    if (!queryId || !action) return res.status(400).json({ error: 'queryId and action required' });
    if (!['accepted', 'modified', 'rejected'].includes(action)) return res.status(400).json({ error: 'action must be accepted, modified, or rejected' });
    const result = await cdssFeedbackService.recordFeedback({
      queryId, userId: req.user?.id, action, feedbackType, originalResponse, modification, reason,
      codesKept, codesRemoved, codesAdded, queryText, tenantId: req.tenant?.id || 'default'
    });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[CDSS Feedback] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/feedback/stats', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const stats = await cdssFeedbackService.getFeedbackStats(days);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/feedback/recent', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const data = await cdssFeedbackService.getRecentFeedback(limit);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
