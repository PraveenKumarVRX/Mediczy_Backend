/**
 * AI Vision Routes - Medical Image Analysis
 * Analyzes medical images (X-rays, scans, etc.) using Claude Vision
 * 
 * Endpoints:
 * - POST /api/ai/vision/analyze - Analyze medical image
 */

import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { authDoctor } from '../middleware/auth.middleware.js';
import { scanOnly } from '../services/minio-upload.service.js';

const router = express.Router();

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

// Initialize Anthropic client
const client = new Anthropic();

/**
 * @route   POST /api/ai/vision/analyze
 * @desc    Analyze medical image with AI Vision (Claude 3.5 Sonnet)
 * @access  Private (Doctor)
 */
router.post('/analyze', authDoctor, upload.single('image'), async (req, res) => {
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
      return res.status(400).json({ success: false, message: 'File rejected: malware detected' });
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

    // Medical image analysis prompt
    const visionPrompt = `You are an expert medical image analyst. Analyze this medical image and provide clinical insights.

IMPORTANT: This is for clinical decision support only. A qualified physician must make the final diagnosis.

Analyze the image and provide:

1. **Findings**: Describe observable features (anatomical structures, pathological findings, artifacts)
2. **Assessment**: Preliminary radiological/clinical assessment based on findings
3. **Recommendations**: Suggested follow-up tests or clinical consultations
4. **Drug Suggestions**: Common medications used for conditions visible in this image
5. **ICD-10 Codes**: Relevant diagnostic codes

Return ONLY valid JSON (no markdown, no code blocks):
{
  "findings": "detailed description of what's visible",
  "assessment": "clinical assessment",
  "recommendations": ["recommendation1", "recommendation2"],
  "drugSuggestions": [
    {
      "name": "medication name",
      "dosage": "strength/form",
      "frequency": "TDS/BID/OD",
      "duration": "5-7 days",
      "reason": "why suggested for this condition"
    }
  ],
  "icd10Codes": [
    {
      "code": "ICD-10 code",
      "description": "diagnostic description"
    }
  ]
}`;

    // Call Claude Vision API
    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image
              }
            },
            {
              type: 'text',
              text: visionPrompt
            }
          ]
        }
      ]
    });

    // Extract and parse response
    let analysis = null;
    try {
      const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
      
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
      const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
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
        sourceType: sourceType || 'uploaded_image',
        analyzedAt: new Date().toISOString(),
        model: 'claude-3-5-sonnet'
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
 * @route   GET /api/ai/vision/health
 * @desc    Check vision service health
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'AI Vision',
    status: 'operational',
    model: 'claude-3-5-sonnet',
    maxFileSize: '10MB',
    supportedFormats: ['JPEG', 'PNG', 'GIF', 'WebP']
  });
});

export default router;
