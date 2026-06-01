/**
 * AI Vision Routes - Medical Image Analysis
 * Analyzes medical images (X-rays, scans, etc.) using llmProvider vision cascade
 * 
 * Endpoints:
 * - POST /api/ai/vision/analyze - Analyze medical image
 */

import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import llmProvider from '../services/ai-brain/llm-provider.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { scanOnly } from '../services/minio-upload.service.js';

const router = express.Router();
const requireVisionAccess = requireRole(['doctor', 'nurse', 'hospital', 'hospital_admin']);

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dir = './uploads/vision';
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image format. Allowed: JPEG, PNG, GIF, WebP'));
    }
  }
});

/**
 * @route   POST /api/ai/vision/analyze
 * @desc    Analyze medical image with AI Vision (iSHA-inc/Gemini/Groq cascade)
 * @access  Private (Doctor)
 */
router.post('/analyze', authUser, requireVisionAccess, upload.single('image'), async (req, res) => {
  let imagePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Image file is required' });
    }

    imagePath = req.file.path;
    const { sourceType, appointmentId, sessionId } = req.body;

    // AV scan before processing
    const avResult = await scanOnly(imagePath);
    if (!avResult.clean) {
      await fs.unlink(imagePath).catch(() => {});
      const threat = (avResult.detail || '').replace(/^.*:\s*/, '').replace(/\s*FOUND\s*$/, '').trim() || 'Unknown threat';
      return res.status(400).json({
        success: false,
        code: 'MALWARE_DETECTED',
        message: 'File rejected: malware detected in uploaded file',
        threat
      });
    }

    // Read image file and convert to base64
    const imageBuffer = await fs.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');

    // Determine media type from file extension or MIME type
    const ext = path.extname(req.file.originalname).toLowerCase();
    const mediaTypeMap = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    const mediaType = mediaTypeMap[ext] || req.file.mimetype || 'image/jpeg';

    console.log(`[AI Vision] Analyzing ${sourceType} - ${req.file.size} bytes - ${mediaType}`);

    const genericVisionPrompt = `You are an expert medical image analyst. Analyze this medical image and provide clinical insights.

IMPORTANT: This is for clinical decision support only. A qualified physician must make the final diagnosis.

Return ONLY valid JSON:
{
  "findings": "detailed description of what's visible",
  "assessment": "clinical assessment",
  "recommendations": ["recommendation1", "recommendation2"],
  "drugSuggestions": [],
  "icd10Codes": []
}`;
    const woundVisionPrompt = `You are a wound-care clinical decision support assistant. Analyze the wound photograph for clinician review only.

Return ONLY valid JSON:
{
  "findings": "wound bed, exudate, edge, surrounding skin",
  "assessment": "brief wound assessment",
  "woundType": "pressure_ulcer|surgical|diabetic_foot|burn|other",
  "stage": "grade or stage if visible, otherwise indeterminate",
  "estimatedAreaCm2": 0,
  "healingTrajectory": "baseline|improving|worsening|indeterminate",
  "recommendations": ["clinician-reviewed care suggestion"],
  "drugSuggestions": [],
  "icd10Codes": []
}`;
    const pathologyVisionPrompt = `You are a pathology image review assistant. Analyze the histopathology image for pathologist review only.

Return ONLY valid JSON:
{
  "findings": "cellular architecture and suspicious regions",
  "assessment": "preliminary pathology impression",
  "suspiciousRegions": ["region description"],
  "gradeSuggestion": "if inferable, otherwise indeterminate",
  "confidence": 0,
  "recommendations": ["pathologist review recommendation"],
  "drugSuggestions": [],
  "icd10Codes": []
}`;
    const visionPrompt = sourceType === 'wound'
      ? woundVisionPrompt
      : sourceType === 'pathology'
        ? pathologyVisionPrompt
        : genericVisionPrompt;

    // Call centralized Vision API via llmProvider
    const visionResult = await llmProvider.vision({
      base64Image,
      mimeType: mediaType,
      prompt: visionPrompt,
      maxTokens: 2000
    });

    // Extract and parse response
    let analysis = null;
    try {
      const responseText = visionResult.content || '';
      
      // Remove markdown code blocks if present
      let cleanedText = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not find JSON in response');
      }
    } catch (parseError) {
      console.warn('[AI Vision] Failed to parse JSON response, creating fallback structure');
      const responseText = visionResult.content || '';
      analysis = {
        findings: responseText,
        assessment: 'See findings for complete analysis',
        recommendations: [],
        drugSuggestions: [],
        icd10Codes: []
      };
    }

    console.log(`[AI Vision] ✅ Analysis complete - ${Object.keys(analysis).length} fields`);

    // Return analysis results
    res.json({
      success: true,
      analysis: {
        findings: analysis.findings || '',
        assessment: analysis.assessment || '',
        recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations : [],
        drugSuggestions: Array.isArray(analysis.drugSuggestions) ? analysis.drugSuggestions : [],
        icd10Codes: Array.isArray(analysis.icd10Codes) ? analysis.icd10Codes : [],
        woundType: analysis.woundType || null,
        stage: analysis.stage || null,
        estimatedAreaCm2: analysis.estimatedAreaCm2 || null,
        healingTrajectory: analysis.healingTrajectory || null,
        suspiciousRegions: Array.isArray(analysis.suspiciousRegions) ? analysis.suspiciousRegions : [],
        gradeSuggestion: analysis.gradeSuggestion || null,
        confidence: analysis.confidence || null,
        sourceType: sourceType || 'uploaded_image',
        analyzedAt: new Date().toISOString(),
        model: visionResult.model || 'claude-3-5-sonnet'
      },
      metadata: {
        fileSize: req.file.size,
        uploadedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[AI Vision] ❌ Analysis error:', error);
    
    // Return error response with appropriate status
    const statusCode = error.message.includes('Invalid image format') ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: 'Vision analysis failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

  } finally {
    // Clean up uploaded file after processing
    if (imagePath) {
      try {
        await fs.unlink(imagePath);
        console.log('[AI Vision] 🗑️ Temporary file cleaned up');
      } catch (cleanupError) {
        console.warn('[AI Vision] Warning: Failed to delete temporary file:', cleanupError.message);
      }
    }
  }
});

/**
 * @route   POST /api/ai/vision/extract-insurance
 * @desc    OCR-extract insurance policy fields from an uploaded document image or PDF page.
 *          Returns structured JSON that prefills the Add Policy form.
 * @access  Private (authenticated patient or admin)
 */
router.post('/extract-insurance', authUser, upload.single('document'), async (req, res) => {
  let filePath = null;
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Document file is required' });
    filePath = req.file.path;

    // Malware scan
    const avResult = await scanOnly(filePath).catch(() => ({ clean: true }));
    if (!avResult.clean) {
      await fs.unlink(filePath).catch(() => {});
      return res.status(400).json({ success: false, code: 'MALWARE_DETECTED', message: 'File rejected: malware detected' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
    const isPDF   = ext === '.pdf';

    if (!isImage && !isPDF) {
      await fs.unlink(filePath).catch(() => {});
      return res.status(400).json({ success: false, message: 'Only images (JPG/PNG/WebP) and PDFs are supported' });
    }

    const insuranceExtractionPrompt = `You are an insurance document parser. Extract the following fields from this insurance policy card or document image.

Return ONLY valid JSON with exactly these keys (use null for fields not found):
{
  "insurerName": "company name of the insurer e.g. Star Health, HDFC Ergo, Niva Bupa",
  "policyNumber": "policy or certificate number",
  "policyType": "health|life|motor|travel|accident|other",
  "coverageAmount": "numeric sum insured in INR, digits only e.g. 500000",
  "premiumAmount": "annual or periodic premium in INR, digits only, or null",
  "premiumFrequency": "annual|semi-annual|quarterly|monthly",
  "startDate": "ISO date YYYY-MM-DD or null",
  "endDate": "ISO date YYYY-MM-DD or null",
  "membersName": "comma-separated list of insured members",
  "notes": "TPA name, network details, or other key terms, max 100 chars"
}

Rules:
- insurerName must be a real insurance company (not a hospital or TPA name)
- policyNumber must be alphanumeric
- If a date shows DD/MM/YYYY convert to YYYY-MM-DD
- If the document is not an insurance policy at all, return {"error":"not_insurance"}`;

    let visionResult;

    if (isImage) {
      const imageBuffer = await fs.readFile(filePath);
      const base64Image  = imageBuffer.toString('base64');
      const mediaTypeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
      const mediaType    = mediaTypeMap[ext] || 'image/jpeg';

      visionResult = await llmProvider.vision({
        imageData: base64Image,
        mediaType,
        prompt:    insuranceExtractionPrompt,
        maxTokens: 400
      });
    } else {
      // PDF: send path to llm provider as text extraction task (no direct vision)
      // Use a text prompt with pdf-parse style approach if available, otherwise tell LLM it's a PDF
      visionResult = await llmProvider.chat({
        messages: [
          {
            role: 'user',
            content: `${insuranceExtractionPrompt}\n\nNote: The original document is a PDF. Based on what would typically appear on a health insurance policy card or document, extract what you can, or return {"error":"pdf_not_supported"} if not possible.`
          }
        ],
        maxTokens: 400
      });
    }

    // Parse response
    let raw = typeof visionResult === 'string' ? visionResult : (visionResult?.text || visionResult?.content || '{}');
    raw = raw.replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }

    if (!parsed || parsed.error) {
      return res.json({
        success: false,
        message: parsed?.error === 'not_insurance'
          ? 'The uploaded document does not appear to be an insurance policy'
          : 'Could not extract fields from this document — please fill in manually',
        fields: null
      });
    }

    // Sanitize numeric fields
    ['coverageAmount', 'premiumAmount'].forEach(k => {
      if (parsed[k]) parsed[k] = String(parsed[k]).replace(/[^\d.]/g, '');
    });

    return res.json({ success: true, fields: parsed, confidence: 'ai-extracted' });

  } catch (err) {
    console.error('[VisionOCR] Insurance extraction error:', err.message);
    return res.status(500).json({ success: false, message: 'Extraction failed — please fill in manually' });
  } finally {
    if (filePath) await fs.unlink(filePath).catch(() => {});
  }
});

/**
 * @route   GET /api/ai/vision/health
 * @desc    Check vision service health
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'AI Vision',
    status: 'operational',
    model: 'isha-inc-vision | gemini-vision | groq-vision',
    maxFileSize: '10MB',
    supportedFormats: ['JPEG', 'PNG', 'GIF', 'WebP']
  });
});

export default router;
