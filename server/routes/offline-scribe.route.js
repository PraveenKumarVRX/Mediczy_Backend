/**
 * Offline AI Scribe Route
 * Proxies requests to the local offline scribe Python service
 * 
 * Service: FastAPI on port 8006
 * Features: CPU-only, fully offline, Indic-Gemma-2B, Indian languages
 * Document Types: OPD Prescription, OPD Notes, IPD Notes, Discharge Summary
 */

import express from 'express';
import fetch from 'node-fetch';
import FormData from 'form-data';
import multer from 'multer';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import logger from '../config/logger.js';

const router = express.Router();
const requireScribeAccess = requireRole(['doctor', 'assistant', 'nurse', 'team', 'admin', 'hospital']);

// Offline scribe service URL (Python FastAPI)
const OFFLINE_SCRIBE_URL = process.env.OFFLINE_SCRIBE_URL || 'http://localhost:8006';
const ALLOW_REMOTE_OFFLINE_SCRIBE = process.env.ALLOW_REMOTE_OFFLINE_SCRIBE === 'true';

const INDIAN_LANGUAGE_MAP = {
    auto: 'auto',
    en: 'en',
    english: 'en',
    hi: 'hi',
    hindi: 'hi',
    bn: 'bn',
    bengali: 'bn',
    as: 'as',
    assamese: 'as',
    gu: 'gu',
    gujarati: 'gu',
    kn: 'kn',
    kannada: 'kn',
    ml: 'ml',
    malayalam: 'ml',
    mr: 'mr',
    marathi: 'mr',
    or: 'or',
    odia: 'or',
    pa: 'pa',
    punjabi: 'pa',
    ta: 'ta',
    tamil: 'ta',
    te: 'te',
    telugu: 'te',
    ur: 'ur',
    urdu: 'ur',
    ks: 'ks',
    kashmiri: 'ks',
    sd: 'sd',
    sindhi: 'sd',
    kok: 'kok',
    konkani: 'kok',
    ne: 'ne',
    nepali: 'ne',
    mai: 'mai',
    maithili: 'mai',
    sa: 'sa',
    sanskrit: 'sa',
    sat: 'sat',
    santali: 'sat',
    doi: 'doi',
    dogri: 'doi',
    mni: 'mni',
    manipuri: 'mni',
    bho: 'bho',
    bhojpuri: 'bho',
    mixed: 'auto',
    multi: 'auto',
    multilingual: 'auto',
    'code-switch': 'auto',
    codeswitch: 'auto',
    colloquial: 'auto',
    hinglish: 'auto',
    tanglish: 'auto'
};

const FALLBACK_SUPPORTED_LANGUAGES = {
    auto: 'Auto Detect',
    en: 'English',
    hi: 'Hindi',
    bn: 'Bengali',
    as: 'Assamese',
    gu: 'Gujarati',
    kn: 'Kannada',
    ml: 'Malayalam',
    mr: 'Marathi',
    or: 'Odia',
    pa: 'Punjabi',
    ta: 'Tamil',
    te: 'Telugu',
    ur: 'Urdu',
    ks: 'Kashmiri',
    sd: 'Sindhi',
    kok: 'Konkani',
    ne: 'Nepali',
    mai: 'Maithili',
    sa: 'Sanskrit',
    sat: 'Santali',
    doi: 'Dogri',
    mni: 'Manipuri',
    bho: 'Bhojpuri'
};

function normalizeLanguage(inputLanguage) {
    if (!inputLanguage) return 'auto';
    const normalized = String(inputLanguage).trim().toLowerCase();
    return INDIAN_LANGUAGE_MAP[normalized] || (normalized.length <= 5 ? normalized : 'auto');
}

function mapDocumentTypeForBackend(inputType = 'prescription') {
    const normalized = String(inputType || 'prescription').trim().toLowerCase().replace(/_/g, '-');
    if (normalized === 'opd-notes') return 'opd_notes';
    if (normalized === 'ipd-notes') return 'ipd_notes';
    if (normalized === 'discharge' || normalized === 'discharge-summary') return 'discharge_summary';
    return 'prescription';
}

function mapDocumentTypeForFrontend(inputType = 'prescription') {
    const normalized = String(inputType || 'prescription').trim().toLowerCase().replace(/_/g, '-');
    if (normalized === 'opd-notes') return 'opd-notes';
    if (normalized === 'ipd-notes') return 'ipd-notes';
    if (normalized === 'discharge-summary') return 'discharge';
    return 'prescription';
}

function normalizeDocumentResponse(result = {}, fallbackType = 'prescription', fallbackLanguage = 'auto') {
    const processingTimeMs =
        Number(result.processing_time_ms) ||
        Number(result.total_processing_time_ms) ||
        (Number(result.total_time) ? Math.round(Number(result.total_time) * 1000) : 0) ||
        (Number(result.generation_time) ? Math.round(Number(result.generation_time) * 1000) : 0) ||
        (Number(result.total_pipeline_time) ? Math.round(Number(result.total_pipeline_time) * 1000) : 0);

    return {
        success: result.success !== false,
        formatted_text: result.formatted_text || result.raw_output || result.text || '',
        structured_data: result.structured_data || result.structured || {},
        document_type: mapDocumentTypeForFrontend(result.document_type || fallbackType),
        language: result.language || result.detected_language || fallbackLanguage,
        processing_time_ms: processingTimeMs,
        ai_badge: result.ai_badge,
        disclaimer: result.disclaimer,
        raw_output: result.raw_output
    };
}

function assertLocalScribeTarget() {
    try {
        const url = new URL(OFFLINE_SCRIBE_URL);
        const host = url.hostname;
        const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';

        if (!isLocalHost && !ALLOW_REMOTE_OFFLINE_SCRIBE) {
            throw new Error(`OFFLINE_SCRIBE_URL must be local for on-prem privacy. Current host: ${host}`);
        }
    } catch (error) {
        throw new Error(`Invalid OFFLINE_SCRIBE_URL configuration: ${error.message}`);
    }
}

// Configure multer for audio file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max for audio files
    },
    fileFilter: (req, file, cb) => {
        // Accept common audio formats
        const allowedMimes = [
            'audio/wav',
            'audio/wave',
            'audio/x-wav',
            'audio/mp3',
            'audio/mpeg',
            'audio/webm',
            'audio/ogg',
            'audio/m4a',
            'audio/mp4',
            'audio/flac',
            'video/webm' // Sometimes webm audio comes as video/webm
        ];
        
        if (allowedMimes.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}. Only audio files are allowed.`));
        }
    }
});

// Helper function to proxy requests to offline scribe service
async function proxyToScribe(endpoint, method = 'GET', body = null, contentType = 'application/json') {
    assertLocalScribeTarget();
    const url = `${OFFLINE_SCRIBE_URL}${endpoint}`;
    
    const options = {
        method,
        headers: {}
    };
    
    if (body) {
        if (body instanceof FormData) {
            options.body = body;
            // Don't set Content-Type for FormData, let node-fetch handle it
        } else {
            options.headers['Content-Type'] = contentType;
            options.body = JSON.stringify(body);
        }
    }
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.detail || error.error || `Service error: ${response.status}`);
    }
    
    return response.json();
}

// ===================================
// Health Check
// ===================================

/**
 * @route   GET /api/offline-scribe/health
 * @desc    Check offline scribe service health
 * @access  Public
 */
router.get('/health', async (req, res) => {
    try {
        const result = await proxyToScribe('/api/scribe/health');
        res.json({
            status: 'ok',
            service: 'offline-scribe',
            backend: result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Offline scribe health check failed:', { error: error.message });
        res.status(503).json({
            status: 'error',
            service: 'offline-scribe',
            error: error.message,
            message: 'Offline scribe service is not available. Please ensure the service is running.',
            help: 'Start the service: cd offline_scribe && python main.py',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @route   GET /api/offline-scribe/languages
 * @desc    Get supported languages
 * @access  Public
 */
router.get('/languages', async (req, res) => {
    try {
        const result = await proxyToScribe('/api/scribe/languages');
        if (result && typeof result === 'object') {
            const merged = { ...FALLBACK_SUPPORTED_LANGUAGES, ...(result.languages || result) };
            return res.json({
                success: true,
                mode: 'offline-local',
                languages: merged,
                total: Object.keys(merged).length
            });
        }

        res.json({
            success: true,
            mode: 'offline-local',
            languages: FALLBACK_SUPPORTED_LANGUAGES,
            total: Object.keys(FALLBACK_SUPPORTED_LANGUAGES).length
        });
    } catch (error) {
        logger.error('Failed to get supported languages:', { error: error.message });
        res.status(200).json({
            success: true,
            mode: 'offline-local-fallback',
            warning: error.message,
            languages: FALLBACK_SUPPORTED_LANGUAGES,
            total: Object.keys(FALLBACK_SUPPORTED_LANGUAGES).length
        });
    }
});

/**
 * @route   GET /api/offline-scribe/templates
 * @desc    Get available document templates
 * @access  Public
 */
router.get('/templates', async (req, res) => {
    try {
        const result = await proxyToScribe('/api/scribe/templates');
        res.json(result);
    } catch (error) {
        logger.error('Failed to get templates:', { error: error.message });
        res.status(503).json({
            error: 'Service unavailable',
            message: error.message
        });
    }
});

// ===================================
// Speech-to-Text
// ===================================

/**
 * @route   POST /api/offline-scribe/transcribe
 * @desc    Transcribe audio file to text
 * @access  Protected (Doctor/Staff)
 */
router.post('/transcribe', authUser, requireScribeAccess, upload.single('audio'), async (req, res) => {
    try {
        assertLocalScribeTarget();

        if (!req.file) {
            return res.status(400).json({
                error: 'No audio file provided',
                help: 'Upload audio file with field name "audio"'
            });
        }

        const language = normalizeLanguage(req.body.language || 'auto');
        const dominantLanguage = req.body.dominant_language ? normalizeLanguage(req.body.dominant_language) : null;
        const chunkSeconds = Number(req.body.chunk_seconds || 30);
        const vad = String(req.body.vad || 'true') === 'true';
        const beamSize = Number(req.body.beam_size || 1);

        // Create FormData for multipart upload
        const formData = new FormData();
        formData.append('file', req.file.buffer, {
            filename: req.file.originalname || 'audio.wav',
            contentType: req.file.mimetype
        });
        formData.append('language', language);
        if (dominantLanguage && dominantLanguage !== 'auto') {
            formData.append('dominant_language', dominantLanguage);
        }
        formData.append('chunk_seconds', String(chunkSeconds));
        formData.append('vad', String(vad));
        formData.append('beam_size', String(beamSize));

        const url = `${OFFLINE_SCRIBE_URL}/api/scribe/transcribe`;
        
        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.detail || error.error || `Transcription failed: ${response.status}`);
        }

        const result = await response.json();

        // Log for audit
        logger.info('Audio transcribed via offline scribe', {
            userId: req.user?.id,
            doctorId: req.user?.doctorId,
            language: result.detected_language || language,
            duration: result.duration_seconds,
            textLength: result.text?.length
        });

        res.json(result);

    } catch (error) {
        logger.error('Transcription failed:', { error: error.message, userId: req.user?.id });
        res.status(500).json({
            error: 'Transcription failed',
            message: error.message
        });
    }
});

// ===================================
// Text Normalization
// ===================================

/**
 * @route   POST /api/offline-scribe/normalize
 * @desc    Normalize medical text (drug names, vitals, frequencies)
 * @access  Protected (Doctor/Staff)
 */
router.post('/normalize', authUser, requireScribeAccess, async (req, res) => {
    try {
        const { text } = req.body;
        const language = normalizeLanguage(req.body.language || 'hi');

        if (!text) {
            return res.status(400).json({
                error: 'Text is required',
                help: 'Provide "text" in request body'
            });
        }

        const result = await proxyToScribe('/api/scribe/normalize', 'POST', { text, language });

        logger.info('Text normalized via offline scribe', {
            userId: req.user?.id,
            inputLength: text.length,
            outputLength: result.normalized_text?.length
        });

        res.json(result);

    } catch (error) {
        logger.error('Normalization failed:', { error: error.message, userId: req.user?.id });
        res.status(500).json({
            error: 'Normalization failed',
            message: error.message
        });
    }
});

// ===================================
// Document Generation
// ===================================

/**
 * @route   POST /api/offline-scribe/prescription
 * @desc    Generate OPD prescription from dictation
 * @access  Protected (Doctor only)
 */
router.post('/prescription', authUser, requireScribeAccess, async (req, res) => {
    try {
        const { dictation, patient_context = {} } = req.body;
        const language = normalizeLanguage(req.body.language || 'hi');

        if (!dictation) {
            return res.status(400).json({
                error: 'Dictation text is required',
                help: 'Provide "dictation" in request body'
            });
        }

        // Ensure doctor context
        const doctor_context = {
            doctor_id: req.user?.doctorId || req.user?.id,
            doctor_name: req.user?.name || 'Dr.',
            organization_id: req.user?.organization_id
        };

        // Map to Python service expected format (uses 'transcript' not 'dictation')
        const result = await proxyToScribe('/api/scribe/prescription', 'POST', {
            transcript: dictation,  // Python service expects 'transcript'
            patient_name: patient_context.name || patient_context.patient_name,
            patient_age: patient_context.age || patient_context.patient_age,
            patient_gender: patient_context.gender || patient_context.patient_gender
        });

        logger.info('Prescription generated via offline scribe', {
            doctorId: doctor_context.doctor_id,
            patientId: patient_context.patient_id,
            language,
            medicationsCount: result.structured?.medications?.length
        });

        res.json(normalizeDocumentResponse(result, 'prescription', language));

    } catch (error) {
        logger.error('Prescription generation failed:', { error: error.message, userId: req.user?.id });
        res.status(500).json({
            error: 'Prescription generation failed',
            message: error.message
        });
    }
});

/**
 * @route   POST /api/offline-scribe/opd-notes
 * @desc    Generate OPD notes from dictation
 * @access  Protected (Doctor only)
 */
router.post('/opd-notes', authUser, requireScribeAccess, async (req, res) => {
    try {
        const { dictation, patient_context = {} } = req.body;
        const language = normalizeLanguage(req.body.language || 'hi');

        if (!dictation) {
            return res.status(400).json({
                error: 'Dictation text is required'
            });
        }

        const doctor_context = {
            doctor_id: req.user?.doctorId || req.user?.id,
            doctor_name: req.user?.name || 'Dr.',
            organization_id: req.user?.organization_id
        };

        const result = await proxyToScribe('/api/scribe/opd-notes', 'POST', {
            transcript: dictation,
            patient_info: {
                name: patient_context.name || patient_context.patient_name,
                age: patient_context.age || patient_context.patient_age,
                gender: patient_context.gender || patient_context.patient_gender
            }
        });

        logger.info('OPD notes generated via offline scribe', {
            doctorId: doctor_context.doctor_id,
            patientId: patient_context.patient_id,
            language
        });

        res.json(normalizeDocumentResponse(result, 'opd-notes', language));

    } catch (error) {
        logger.error('OPD notes generation failed:', { error: error.message, userId: req.user?.id });
        res.status(500).json({
            error: 'OPD notes generation failed',
            message: error.message
        });
    }
});

/**
 * @route   POST /api/offline-scribe/ipd-notes
 * @desc    Generate IPD notes from dictation
 * @access  Protected (Doctor only)
 */
router.post('/ipd-notes', authUser, requireScribeAccess, async (req, res) => {
    try {
        const { dictation, patient_context = {} } = req.body;
        const language = normalizeLanguage(req.body.language || 'hi');

        if (!dictation) {
            return res.status(400).json({
                error: 'Dictation text is required'
            });
        }

        const doctor_context = {
            doctor_id: req.user?.doctorId || req.user?.id,
            doctor_name: req.user?.name || 'Dr.',
            organization_id: req.user?.organization_id
        };

        const result = await proxyToScribe('/api/scribe/ipd-notes', 'POST', {
            transcript: dictation,
            patient_info: {
                name: patient_context.name || patient_context.patient_name,
                age: patient_context.age || patient_context.patient_age,
                gender: patient_context.gender || patient_context.patient_gender
            }
        });

        logger.info('IPD notes generated via offline scribe', {
            doctorId: doctor_context.doctor_id,
            patientId: patient_context.patient_id,
            language
        });

        res.json(normalizeDocumentResponse(result, 'ipd-notes', language));

    } catch (error) {
        logger.error('IPD notes generation failed:', { error: error.message, userId: req.user?.id });
        res.status(500).json({
            error: 'IPD notes generation failed',
            message: error.message
        });
    }
});

/**
 * @route   POST /api/offline-scribe/discharge
 * @desc    Generate discharge summary from dictation
 * @access  Protected (Doctor only)
 */
router.post('/discharge', authUser, requireScribeAccess, async (req, res) => {
    try {
        const { dictation, patient_context = {} } = req.body;
        const language = normalizeLanguage(req.body.language || 'hi');

        if (!dictation) {
            return res.status(400).json({
                error: 'Dictation text is required'
            });
        }

        const doctor_context = {
            doctor_id: req.user?.doctorId || req.user?.id,
            doctor_name: req.user?.name || 'Dr.',
            organization_id: req.user?.organization_id
        };

        const result = await proxyToScribe('/api/scribe/discharge', 'POST', {
            transcript: dictation,
            patient_info: {
                name: patient_context.name || patient_context.patient_name,
                age: patient_context.age || patient_context.patient_age,
                gender: patient_context.gender || patient_context.patient_gender
            }
        });

        logger.info('Discharge summary generated via offline scribe', {
            doctorId: doctor_context.doctor_id,
            patientId: patient_context.patient_id,
            language
        });

        res.json(normalizeDocumentResponse(result, 'discharge', language));

    } catch (error) {
        logger.error('Discharge summary generation failed:', { error: error.message, userId: req.user?.id });
        res.status(500).json({
            error: 'Discharge summary generation failed',
            message: error.message
        });
    }
});

// ===================================
// Full Pipeline
// ===================================

/**
 * @route   POST /api/offline-scribe/full-pipeline
 * @desc    Full audio-to-document pipeline
 * @access  Protected (Doctor only)
 */
router.post('/full-pipeline', authUser, requireScribeAccess, upload.single('audio'), async (req, res) => {
    try {
        assertLocalScribeTarget();

        if (!req.file) {
            return res.status(400).json({
                error: 'No audio file provided',
                help: 'Upload audio file with field name "audio"'
            });
        }

        const language = normalizeLanguage(req.body.language || 'auto');
        const documentType = mapDocumentTypeForBackend(req.body.document_type || 'prescription');
        const chunkSeconds = Number(req.body.chunk_seconds || 30);
        const vad = String(req.body.vad || 'true') === 'true';
        const beamSize = Number(req.body.beam_size || 1);
        
        let patientContext = {};
        try {
            patientContext = req.body.patient_context ? JSON.parse(req.body.patient_context) : {};
        } catch (e) {
            // If parsing fails, use as-is or empty
            patientContext = {};
        }

        // Create FormData for multipart upload
        const formData = new FormData();
        formData.append('file', req.file.buffer, {
            filename: req.file.originalname || 'audio.wav',
            contentType: req.file.mimetype
        });
        formData.append('language', language);
        formData.append('document_type', documentType);
        formData.append('patient_name', patientContext.name || patientContext.patient_name || '');
        formData.append('patient_age', patientContext.age || patientContext.patient_age || '');
        formData.append('patient_gender', patientContext.gender || patientContext.patient_gender || '');
        formData.append('chunk_seconds', String(chunkSeconds));
        formData.append('vad', String(vad));
        formData.append('beam_size', String(beamSize));

        const url = `${OFFLINE_SCRIBE_URL}/api/scribe/full-pipeline`;
        
        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.detail || error.error || `Pipeline failed: ${response.status}`);
        }

        const result = await response.json();

        // Log for audit
        logger.info('Full pipeline completed via offline scribe', {
            userId: req.user?.id,
            doctorId: req.user?.doctorId,
            documentType,
            language: result.language,
            processingTime: result.total_processing_time_ms || result.total_pipeline_time
        });

        res.json(result);

    } catch (error) {
        logger.error('Full pipeline failed:', { error: error.message, userId: req.user?.id });
        res.status(500).json({
            error: 'Full pipeline failed',
            message: error.message
        });
    }
});

// ===================================
// Batch Processing
// ===================================

/**
 * @route   POST /api/offline-scribe/batch
 * @desc    Process multiple dictations in batch
 * @access  Protected (Doctor only)
 */
router.post('/batch', authUser, requireScribeAccess, async (req, res) => {
    try {
        const { items } = req.body;
        const language = normalizeLanguage(req.body.language || 'hi');

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                error: 'Items array is required',
                help: 'Provide "items" array with dictations'
            });
        }

        if (items.length > 10) {
            return res.status(400).json({
                error: 'Maximum 10 items per batch',
                help: 'Split your request into smaller batches'
            });
        }

        const doctor_context = {
            doctor_id: req.user?.doctorId || req.user?.id,
            doctor_name: req.user?.name || 'Dr.',
            organization_id: req.user?.organization_id
        };

        // Process items sequentially to avoid overwhelming the service
        const results = [];
        const errors = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            try {
                const endpoint = `/api/scribe/${mapDocumentTypeForBackend(item.document_type || 'prescription')}`;
                const result = await proxyToScribe(endpoint, 'POST', {
                    transcript: item.dictation,
                    patient_info: {
                        name: item.patient_context?.name || item.patient_context?.patient_name,
                        age: item.patient_context?.age || item.patient_context?.patient_age,
                        gender: item.patient_context?.gender || item.patient_context?.patient_gender
                    }
                });
                results.push({
                    index: i,
                    status: 'success',
                    result: normalizeDocumentResponse(
                        result,
                        mapDocumentTypeForFrontend(item.document_type || 'prescription'),
                        normalizeLanguage(item.language || language)
                    )
                });
            } catch (error) {
                errors.push({
                    index: i,
                    status: 'error',
                    error: error.message
                });
            }
        }

        logger.info('Batch processing completed via offline scribe', {
            doctorId: doctor_context.doctor_id,
            totalItems: items.length,
            successCount: results.length,
            errorCount: errors.length
        });

        res.json({
            total: items.length,
            successful: results.length,
            failed: errors.length,
            results,
            errors
        });

    } catch (error) {
        logger.error('Batch processing failed:', { error: error.message, userId: req.user?.id });
        res.status(500).json({
            error: 'Batch processing failed',
            message: error.message
        });
    }
});

// ===================================
// Service Status
// ===================================

/**
 * @route   GET /api/offline-scribe/status
 * @desc    Get detailed service status including model info
 * @access  Protected (Admin/Doctor)
 */
router.get('/status', authUser, requireScribeAccess, async (req, res) => {
    try {
        const [health, languages, templates] = await Promise.all([
            proxyToScribe('/api/scribe/health').catch(e => ({ error: e.message })),
            proxyToScribe('/api/scribe/languages').catch(e => ({ error: e.message })),
            proxyToScribe('/api/scribe/templates').catch(e => ({ error: e.message }))
        ]);

        res.json({
            service: 'offline-scribe',
            status: health.status || 'error',
            health,
            languages,
            templates,
            configuration: {
                serviceUrl: OFFLINE_SCRIBE_URL,
                features: [
                    'CPU-only inference (no GPU required)',
                    'Fully offline operation',
                    'All major Indian language support via local model',
                    'Language normalization (code/name aliases)',
                    'Efficient chunked transcription (default 30s)',
                    'VAD enabled by default for faster processing',
                    'OPD Prescriptions',
                    'OPD Notes',
                    'IPD Notes',
                    'Discharge Summaries'
                ],
                model: 'Indic-Gemma-2B-Navarasa (Q4_K_M)'
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Status check failed:', { error: error.message });
        res.status(503).json({
            service: 'offline-scribe',
            status: 'error',
            error: error.message,
            help: 'Ensure the offline scribe service is running: python offline_scribe/main.py'
        });
    }
});

export default router;
