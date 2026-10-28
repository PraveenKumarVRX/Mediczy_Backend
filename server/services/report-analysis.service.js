/**
 * Report Analysis Service
 * =======================
 * Decrypts patient reports from MinIO, extracts text/imagery,
 * sends to LLM cascade for structured medical analysis,
 * and stores results in Report.aiAnalysis.
 *
 * Capabilities:
 *  - PDF → text extraction via pdf-parse
 *  - Images (JPEG/PNG/WebP/GIF) → Claude Vision
 *  - Structured output: findings, keyValues, risk indicators
 *  - Feeds extracted lab values into HRA scoring
 */

import {getCorporateReportClient,readCorporateReportFile} from './corporate-report-storage-client.js';
import { downloadDecryptedReport } from './minio-upload.service.js';
import llmProvider from './ai-brain/llm-provider.js';
import Report from '../models/postgres/report.model.postgres.js';
import pool from '../db/pgPool.js';

// ─── Text extraction ────────────────────────────────────────

/**
 * Extract readable text from a decrypted report buffer.
 * PDFs → pdf-parse; images → base64 for vision; others → raw text attempt.
 */
async function extractText(buffer, mimeType) {
  if (mimeType === 'application/pdf') {
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      await parser.load();
      const result = await parser.getText();
      const text = result.text || '';
      const pages = result.totalPages || 0;
      await parser.destroy();
      if (text.trim().length > 10) {
        return { text, pages, method: 'pdf-parse' };
      }
    } catch (pdfErr) {
      console.warn('[ReportAnalysis] PDF parse failed, falling back to text:', pdfErr.message);
    }
    // Fallback: try as raw text (handles mis-labeled files)
    const text = buffer.toString('utf-8');
    if (text.trim().length > 10) {
      return { text, method: 'text-fallback' };
    }
  }

  if (mimeType?.startsWith('image/')) {
    // Return base64 for vision model processing
    return {
      text: null,
      base64: buffer.toString('base64'),
      mimeType,
      method: 'vision'
    };
  }

  // Fallback: try as plain text
  const text = buffer.toString('utf-8');
  return { text, method: 'text-fallback' };
}

// ─── LLM analysis prompts ──────────────────────────────────

const REPORT_ANALYSIS_PROMPT = `You are a medical report analysis AI. Analyze the following medical report text and extract structured information.

IMPORTANT RULES:
1. Extract ALL numerical lab values with their units and reference ranges
2. Flag values that are abnormal (high/low/critical)
3. Identify the report type (blood test, lipid panel, thyroid panel, imaging, etc.)
4. Provide a patient-friendly summary
5. Identify risk indicators relevant to: cardiovascular, diabetes, kidney, liver, thyroid health
6. Do NOT make diagnoses — flag findings for doctor review

Return ONLY valid JSON (no markdown fences):
{
  "reportCategory": "blood_test|lipid_panel|thyroid|cbc|liver_function|kidney_function|imaging|urinalysis|other",
  "labName": "extracted lab/hospital name or null",
  "reportDate": "YYYY-MM-DD if found, else null",
  "patientName": "if found, else null",
  "findings": "2-3 sentence summary of key findings in simple language",
  "assessment": "clinical significance in patient-friendly language",
  "keyValues": {
    "parameter_name": {
      "value": "numeric or string value",
      "unit": "mg/dL, g/dL, etc.",
      "status": "normal|low|high|critical",
      "referenceRange": "e.g. 70-110"
    }
  },
  "abnormalValues": ["list of parameter names that are outside normal range"],
  "riskIndicators": {
    "cardiovascular": { "level": "low|moderate|high", "factors": ["list"] },
    "diabetes": { "level": "low|moderate|high", "factors": ["list"] },
    "kidney": { "level": "low|moderate|high", "factors": ["list"] },
    "liver": { "level": "low|moderate|high", "factors": ["list"] },
    "thyroid": { "level": "low|moderate|high", "factors": ["list"] }
  },
  "recommendations": ["actionable recommendations"],
  "urgency": "routine|soon|urgent|emergency",
  "confidence": 0.85,
  "disclaimer": "This is an AI-assisted analysis for informational purposes. Consult your healthcare provider for medical advice."
}`;

const VISION_ANALYSIS_PROMPT = `You are a medical report analysis AI. Analyze this medical report image and extract structured information.

IMPORTANT RULES:
1. Read ALL text, numbers, and values visible in the image
2. Extract lab values with units and reference ranges where visible
3. Flag any values marked abnormal or outside reference ranges
4. Identify the report type and source lab/hospital
5. Do NOT make diagnoses — flag findings for doctor review

Return ONLY valid JSON (no markdown fences):
{
  "reportCategory": "blood_test|lipid_panel|thyroid|cbc|liver_function|kidney_function|imaging|urinalysis|other",
  "labName": "extracted lab/hospital name or null",
  "reportDate": "YYYY-MM-DD if found, else null",
  "patientName": "if found, else null",
  "findings": "2-3 sentence summary of key findings",
  "assessment": "clinical significance in patient-friendly language",
  "keyValues": {
    "parameter_name": {
      "value": "numeric or string value",
      "unit": "mg/dL, g/dL, etc.",
      "status": "normal|low|high|critical",
      "referenceRange": "e.g. 70-110"
    }
  },
  "abnormalValues": ["list of parameter names outside normal range"],
  "riskIndicators": {
    "cardiovascular": { "level": "low|moderate|high", "factors": ["list"] },
    "diabetes": { "level": "low|moderate|high", "factors": ["list"] },
    "kidney": { "level": "low|moderate|high", "factors": ["list"] },
    "liver": { "level": "low|moderate|high", "factors": ["list"] },
    "thyroid": { "level": "low|moderate|high", "factors": ["list"] }
  },
  "recommendations": ["actionable recommendations"],
  "urgency": "routine|soon|urgent|emergency",
  "confidence": 0.85,
  "disclaimer": "This is an AI-assisted analysis for informational purposes. Consult your healthcare provider for medical advice."
}`;

// ─── Core analysis function ────────────────────────────────

/**
 * Analyze a single report by ID.
 * 1. Load report from DB
 * 2. Download + decrypt from MinIO
 * 3. Extract text / prepare image
 * 4. Send to LLM for structured analysis
 * 5. Store result in Report.aiAnalysis
 *
 * @param {number} reportId
 * @param {number} userId - for ownership verification
 * @param {object} [options]
 * @param {boolean} [options.force=false] - re-analyze even if already completed
 * @returns {object} analysis result
 */
export async function analyzeReport(reportId, userId, options = {}) {
  const report = await Report.findOne({
    where: { id: reportId, userId, status: 'active' }
  });

  if (!report) {
    throw Object.assign(new Error('Report not found'), { statusCode: 404 });
  }

  // Skip if already analyzed (unless forced)
  if (!options.force && report.analysisStatus === 'completed' && report.aiAnalysis) {
    return { cached: true, analysis: report.aiAnalysis };
  }

  // Mark as processing
  await report.update({ analysisStatus: 'processing' });

  try {
    // Decrypt from MinIO
    const meta = report.metadata || {};
    const enc = meta.encryption || {};
    const { buffer } = meta.storageBackend==='corporate_minio'&&!enc.iv ? {buffer:await readCorporateReportFile(report.filePath,meta.bucket)} : await downloadDecryptedReport({
      key: report.filePath,
      bucket: meta.bucket,
      iv: enc.iv,
      authTag: enc.authTag,
      compressionMethod: meta.compressionMethod,
      mimeType: report.mimeType,
      client:meta.storageBackend==='corporate_minio'?getCorporateReportClient():undefined,
    });

    // Extract text or prepare vision input
    const extracted = await extractText(buffer, report.mimeType);

    let analysis;

    if (extracted.method === 'vision') {
      // Use Claude Vision for images
      analysis = await analyzeWithVision(extracted.base64, extracted.mimeType);
    } else if (extracted.text && extracted.text.trim().length > 20) {
      // Use LLM cascade for text-based reports
      analysis = await analyzeWithLLM(extracted.text);
    } else {
      throw new Error('Could not extract readable content from report');
    }

    // Enrich with report metadata
    analysis.sourceReportId = reportId;
    analysis.reportType = report.reportType;
    analysis.analyzedAt = new Date().toISOString();
    analysis.extractionMethod = extracted.method;
    if (extracted.pages) analysis.pageCount = extracted.pages;

    // Save to DB
    await report.update({
      aiAnalysis: analysis,
      analysisStatus: 'completed'
    });

    // Async: update HRA with extracted lab values (non-blocking)
    updateHRAFromReport(userId, analysis).catch(err =>
      console.error('[ReportAnalysis] HRA update error (non-blocking):', err.message)
    );

    return { cached: false, analysis };

  } catch (error) {
    await report.update({
      analysisStatus: 'failed',
      aiAnalysis: { error: error.message, failedAt: new Date().toISOString() }
    });
    throw error;
  }
}

// ─── LLM text analysis (iSHA → Groq → OpenAI cascade) ─────

async function analyzeWithLLM(reportText) {
  // Truncate very long reports to avoid token limits
  const truncated = reportText.length > 12000
    ? reportText.substring(0, 12000) + '\n\n[... report truncated for analysis ...]'
    : reportText;

  const result = await llmProvider.chat({
    messages: [
      { role: 'system', content: REPORT_ANALYSIS_PROMPT },
      { role: 'user', content: `Here is the medical report text:\n\n${truncated}` }
    ],
    temperature: 0.2,
    maxTokens: 4096,
  });

  return parseAnalysisResponse(result.content, result.provider);
}

// ─── Claude Vision image analysis ──────────────────────────

async function analyzeWithVision(base64Image, mimeType) {
  try {
    const visionResult = await llmProvider.vision({
      base64Image,
      mimeType,
      prompt: VISION_ANALYSIS_PROMPT,
      maxTokens: 3000
    });

    return parseAnalysisResponse(visionResult.content, visionResult.provider);
  } catch (visionError) {
    console.warn('[Report-Analysis] Vision failed:', visionError.message);
    // Fallback gracefully
    return {
      findings: 'Image analysis is temporarily unavailable. Please upload a PDF version of this report for text-based analysis.',
      assessment: 'Vision service not configured',
      keyValues: {},
      abnormalValues: [],
      riskIndicators: {},
      recommendations: ['Upload a PDF version of your report for detailed analysis'],
      urgency: 'routine',
      confidence: 0,
      disclaimer: 'Vision analysis unavailable'
    };
  }
}

// ─── Response parsing ──────────────────────────────────────

function parseAnalysisResponse(responseText, provider) {
  if (!responseText) {
    throw new Error('Empty response from AI provider');
  }

  // Strip markdown fences if any
  let cleaned = responseText
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Couldn't parse structured JSON — return as freetext
    return {
      findings: responseText.substring(0, 1000),
      assessment: 'Structured extraction failed — see findings for raw analysis',
      keyValues: {},
      abnormalValues: [],
      riskIndicators: {},
      recommendations: ['Consult your healthcare provider for detailed interpretation'],
      urgency: 'routine',
      confidence: 0.3,
      provider,
      disclaimer: 'AI analysis — consult your doctor for medical advice.'
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    parsed.provider = provider;
    return parsed;
  } catch {
    // Attempt to fix truncated JSON by closing brackets
    try {
      let fixable = jsonMatch[0];
      // Count unclosed braces/brackets
      const openBraces = (fixable.match(/\{/g) || []).length;
      const closeBraces = (fixable.match(/\}/g) || []).length;
      const openBrackets = (fixable.match(/\[/g) || []).length;
      const closeBrackets = (fixable.match(/\]/g) || []).length;
      // Remove trailing comma or partial string
      fixable = fixable.replace(/,\s*$/, '').replace(/,\s*"[^"]*$/, '');
      fixable += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
      fixable += '}'.repeat(Math.max(0, openBraces - closeBraces));
      const parsed = JSON.parse(fixable);
      parsed.provider = provider;
      parsed.truncated = true;
      return parsed;
    } catch {
      return {
        findings: responseText.substring(0, 1000),
        assessment: 'JSON parse failed — see findings for raw analysis',
        keyValues: {},
        abnormalValues: [],
        riskIndicators: {},
        recommendations: ['Consult your healthcare provider for detailed interpretation'],
        urgency: 'routine',
        confidence: 0.3,
        provider,
        disclaimer: 'AI analysis — consult your doctor for medical advice.'
      };
    }
  }
}

// ─── HRA integration ──────────────────────────────────────

/**
 * Update HRA scoring with lab values extracted from a report.
 * Stores extracted values in ai_report_lab_values table and
 * triggers a risk score recalculation.
 */
async function updateHRAFromReport(userId, analysis) {
  const db = pool;

  if (!analysis.keyValues || Object.keys(analysis.keyValues).length === 0) {
    return; // No lab values to feed
  }

  // Find patient_id from userId
  const { rows: patients } = await db.query(
    'SELECT id FROM patients WHERE "userId" = $1 LIMIT 1',
    [userId]
  );
  if (patients.length === 0) return;
  const patientId = patients[0].id;

  // Ensure the lab values table exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS ai_report_lab_values (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id),
      report_id INTEGER REFERENCES reports(id),
      parameter_name VARCHAR(255) NOT NULL,
      value VARCHAR(100),
      unit VARCHAR(50),
      status VARCHAR(20),
      reference_range VARCHAR(100),
      report_date DATE,
      extracted_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(patient_id, report_id, parameter_name)
    )
  `);

  // Insert extracted lab values
  const keyValues = analysis.keyValues;
  const reportId = analysis.sourceReportId;
  const reportDate = analysis.reportDate || null;

  for (const [param, info] of Object.entries(keyValues)) {
    if (!info || typeof info !== 'object') continue;
    await db.query(`
      INSERT INTO ai_report_lab_values (patient_id, report_id, parameter_name, value, unit, status, reference_range, report_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (patient_id, report_id, parameter_name) DO UPDATE SET
        value = EXCLUDED.value,
        unit = EXCLUDED.unit,
        status = EXCLUDED.status,
        reference_range = EXCLUDED.reference_range,
        extracted_at = NOW()
    `, [
      patientId,
      reportId,
      param.substring(0, 255),
      String(info.value || '').substring(0, 100),
      (info.unit || '').substring(0, 50),
      (info.status || 'normal').substring(0, 20),
      (info.referenceRange || '').substring(0, 100),
      reportDate
    ]);
  }

  // Store risk indicators in health_risk_scores data_sources
  if (analysis.riskIndicators && Object.keys(analysis.riskIndicators).length > 0) {
    await db.query(`
      UPDATE ai_health_risk_scores
      SET data_sources = COALESCE(data_sources, '{}'::jsonb) || $1::jsonb,
          updated_at = NOW()
      WHERE patient_id = $2
    `, [
      JSON.stringify({ report_analysis: analysis.riskIndicators }),
      patientId
    ]);
  }

  console.log(`[ReportAnalysis] ✅ HRA updated for patient ${patientId}: ${Object.keys(keyValues).length} lab values stored`);
}

/**
 * Get all extracted lab values for a patient (for HRA dashboard).
 */
export async function getPatientLabValues(userId) {
  const db = pool;

  const { rows: patients } = await db.query(
    'SELECT id FROM patients WHERE "userId" = $1 LIMIT 1',
    [userId]
  );
  if (patients.length === 0) return [];
  const patientId = patients[0].id;

  try {
    const { rows } = await db.query(`
      SELECT lv.*, r."fileName", r."reportType", r."testName"
      FROM ai_report_lab_values lv
      LEFT JOIN reports r ON r.id = lv.report_id
      WHERE lv.patient_id = $1
      ORDER BY lv.extracted_at DESC
    `, [patientId]);
    return rows;
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Analyze all pending reports for a user.
 */
export async function analyzeAllPending(userId) {
  const reports = await Report.findAll({
    where: { userId, status: 'active', analysisStatus: 'pending' },
    order: [['uploadedAt', 'DESC']],
    limit: 10
  });

  const results = [];
  for (const report of reports) {
    try {
      const result = await analyzeReport(report.id, userId);
      results.push({ reportId: report.id, success: true, ...result });
    } catch (error) {
      results.push({ reportId: report.id, success: false, error: error.message });
    }
  }
  return results;
}

export default { analyzeReport, analyzeAllPending, getPatientLabValues };
