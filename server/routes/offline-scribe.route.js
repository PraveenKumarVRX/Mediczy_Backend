/**
 * AI Scribe Route
 *
 * Doctor dictation/audio -> transcript -> clinician-review clinical drafts.
 * LLM cascade: local Dr iSHA/SIB BiMediX -> Groq -> OpenAI.
 * STT cascade: Groq Whisper -> OpenAI Whisper.
 */

import express from 'express';
import fetch from 'node-fetch';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { File } from 'buffer';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import logger from '../config/logger.js';
import llmProvider from '../services/ai-brain/llm-provider.js';
import { checkPrescriptionSafety } from '../services/prescription-safety.service.js';

const router = express.Router();
const ambientSessions = new Map();
const requireScribeAccess = requireRole(['doctor', 'assistant', 'nurse', 'team', 'admin', 'hospital']);
const DOCTOR_ONLY_DOCUMENT_TYPES = new Set(['prescription']);
const MAX_AMBIENT_SESSIONS = 50;
const AMBIENT_SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const AMBIENT_CHUNK_DIR = path.join(os.tmpdir(), 'mediczy-ambient-chunks');
fs.mkdirSync(AMBIENT_CHUNK_DIR, { recursive: true });

// Evict sessions older than TTL to prevent unbounded Map growth
function _evictExpiredSessions() {
    const cutoff = Date.now() - AMBIENT_SESSION_TTL_MS;
    for (const [id, session] of ambientSessions) {
        if (new Date(session.createdAt).getTime() < cutoff) {
            _cleanupSessionFiles(session);
            ambientSessions.delete(id);
        }
    }
}

function _cleanupSessionFiles(session) {
    for (const chunkPath of (session.chunkPaths || [])) {
        try { fs.unlinkSync(chunkPath); } catch {}
    }
}

function getNormalizedUserRole(req) {
    return String(req.userRole || req.user?.role || '').trim().toLowerCase();
}

function enforceDoctorOnlyDocumentAccess(req, res, documentType) {
    const normalizedType = String(documentType || '').trim().toLowerCase();
    if (!DOCTOR_ONLY_DOCUMENT_TYPES.has(normalizedType)) {
        return true;
    }

    if (getNormalizedUserRole(req) !== 'doctor') {
        res.status(403).json({
            success: false,
            code: 'DOCTOR_ONLY_DOCUMENT_TYPE',
            message: `Only doctor accounts can generate ${normalizedType} documents.`
        });
        return false;
    }

    return true;
}

const SIB_URL = process.env.SIB_URL || 'http://localhost:8001';
const OFFLINE_SCRIBE_URL = process.env.SCRIBE_API_URL || 'http://localhost:8006';
const OFFLINE_SCRIBE_TOKEN = process.env.SCRIBE_TOKEN || '';
const SCRIBE_LLM_CASCADE = ['sib-bimedix', 'isha', 'groq', 'openai'];
const SCRIBE_DISCLAIMER = 'AI-assisted clinical draft. Final responsibility and verification must be completed by the treating clinician.';

const DOCUMENT_LABELS = {
    prescription: 'OPD Prescription',
    opd_notes: 'OPD Clinical Notes',
    ipd_notes: 'IPD Daily Progress Notes',
    discharge_summary: 'Discharge Summary'
};

const KNOWN_DRUGS = [
    'paracetamol', 'dolo', 'crocin', 'acetaminophen', 'azithromycin', 'augmentin',
    'amoxicillin', 'clavulanate', 'combiflam', 'ibuprofen', 'pantoprazole', 'pan',
    'ecosprin', 'aspirin', 'metformin', 'telmisartan', 'amlodipine', 'atorvastatin',
    'cetirizine', 'levocetirizine', 'salbutamol', 'montelukast', 'ondansetron',
    'omeprazole', 'rabeprazole', 'insulin', 'ceftriaxone'
];

function extractKnownDrugs(text = '') {
    const lowered = String(text || '').toLowerCase();
    return new Set(KNOWN_DRUGS.filter(drug => new RegExp(`\\b${drug.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i').test(lowered)));
}

function derivePrescriptionStructuredData(formattedText = '', existing = {}) {
    const structured = existing && typeof existing === 'object' ? { ...existing } : {};
    if (Array.isArray(structured.medications) && structured.medications.length) return structured;

    const lines = String(formattedText || '').split('\n').map(line => line.trim()).filter(Boolean);
    const medicationLines = lines.filter(line => {
        const lowered = line.toLowerCase();
        return [...extractKnownDrugs(line)].length || /\b\d+(\.\d+)?\s?(mg|mcg|g|ml|units?|iu)\b/i.test(line) || /\b(od|bd|tds|qid|hs|sos|prn)\b/i.test(lowered);
    });

    if (!medicationLines.length) return structured;

    structured.medications = medicationLines.map(line => {
        const dose = line.match(/\b\d+(\.\d+)?\s?(mg|mcg|g|ml|units?|iu)\b/i)?.[0] || '';
        const frequency = line.match(/\b(OD|BD|TDS|QID|HS|SOS|PRN|once daily|twice daily|three times daily|three times|daily)\b/i)?.[0] || '';
        const duration = line.match(/\b(for\s+\d+\s+(day|days|week|weeks|month|months)|\d+\s+(day|days|week|weeks|month|months))\b/i)?.[0] || '';
        return {
            name: [...extractKnownDrugs(line)][0] || line.replace(/\b\d+(\.\d+)?\s?(mg|mcg|g|ml|units?|iu)\b/ig, '').trim(),
            dosage: dose,
            frequency,
            duration,
            instructions: line
        };
    });
    return structured;
}

function parseJsonObject(content = '') {
    const raw = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try { return JSON.parse(raw); } catch {}
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('LLM did not return valid JSON');
}

function validateScribeOutput(documentType, transcript, formattedText, structuredData = {}) {
    const flags = [];
    const text = String(formattedText || '');
    if (text.trim().length < 30) {
        flags.push({ severity: 'high', code: 'short_output', message: 'Generated draft is too short for clinical use.' });
    }

    if (documentType === 'prescription') {
        const inputDrugs = extractKnownDrugs(transcript);
        const outputDrugs = extractKnownDrugs(text + ' ' + JSON.stringify(structuredData));
        const missing = [...inputDrugs].filter(d => !outputDrugs.has(d));
        const extra = [...outputDrugs].filter(d => !inputDrugs.has(d));
        if (missing.length) flags.push({ severity: 'high', code: 'medication_omission', message: `Medication(s) dictated but absent from draft: ${missing.join(', ')}` });
        if (extra.length) flags.push({ severity: 'high', code: 'possible_medication_hallucination', message: `Medication(s) in draft but not dictated: ${extra.join(', ')}` });
        if (!/\b\d+(\.\d+)?\s?(mg|mcg|g|ml|units?|iu)\b/i.test(text)) flags.push({ severity: 'medium', code: 'missing_dose', message: 'Prescription may be missing dose details.' });
        if (!/\b(OD|BD|TDS|QID|HS|SOS|PRN|once daily|twice daily|three times|daily)\b/i.test(text)) flags.push({ severity: 'medium', code: 'missing_frequency', message: 'Prescription may be missing frequency details.' });
    }

    if (/\b(allergy|allergic|एलर्जी)\b/i.test(transcript) && !/\b(allergy|allergic|एलर्जी)\b/i.test(text)) {
        flags.push({ severity: 'high', code: 'allergy_may_be_missing', message: 'Allergy was mentioned but is not clear in the draft.' });
    }

    const hasHigh = flags.some(flag => flag.severity === 'high');
    return {
        requires_doctor_review: true,
        safety_level: hasHigh ? 'blocked' : flags.length ? 'needs_review' : 'draft_ok',
        flags,
        checks: {
            bimedix_first: true,
            fallback_order: ['dr-isha-local-bimedix', 'groq', 'openai'],
            clinician_final_authority: true,
            ai_badge_required: true
        }
    };
}

async function callSibBimedixScribe(messages, documentType) {
    const started = Date.now();
    const response = await fetch(`${SIB_URL}/scribe/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            patient_id: `ai-scribe-${Date.now()}`,
            messages,
            document_type: documentType,
            max_tokens: documentType === 'discharge_summary' ? 1400 : 1000,
            temperature: 0.05
        }),
        signal: AbortSignal.timeout(60000)
    });
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`SIB BiMediX ${response.status}: ${body.slice(0, 200)}`);
    }
    const data = await response.json();
    return {
        content: data.content || data.chat_answer || data.response || data.agent?.tool_result?.response || '',
        model: data.model || data.agent?.tool_result?.raw?.provider || data.provider || 'sib-bimedix',
        provider: 'sib-bimedix',
        latencyMs: Date.now() - started,
        raw: data
    };
}

function buildScribeMessages({ documentType, transcript, patientContext = {}, language = 'auto' }) {
    const label = DOCUMENT_LABELS[documentType] || DOCUMENT_LABELS.prescription;
    const patient = JSON.stringify(patientContext || {});
    const schema = documentType === 'prescription'
        ? `structured_data must include: chiefComplaints, diagnosis, medications array [{name,dosage,frequency,duration,instructions}], instructions array, labTests array, vitals object, notes.`
        : documentType === 'discharge_summary'
        ? `structured_data must include: admissionDiagnosis, hospitalCourse, investigations, procedures, dischargeMedications array, conditionAtDischarge, advice, followUp.`
        : documentType === 'ipd_notes'
        ? `structured_data must include SOAP fields: subjective, objective, assessment, plan, vitals, medications, investigations.`
        : `structured_data must include: chiefComplaint, history, examination, vitals, diagnosis, plan, medications, investigations, followUp.`;

    return [
        {
            role: 'system',
            content: `You are the Mediczy AI Scribe document formatter using Dr iSHA clinical intelligence. This is NOT patient advice and NOT the Dr iSHA voice assistant. Convert doctor dictation into a clinician-review draft only. Copy only facts explicitly present in the transcript. Do not add, infer, substitute, or recommend medicines, diagnoses, tests, or advice. If missing, write "Not documented" or an empty array. Return JSON only.`
        },
        {
            role: 'user',
            content: `Create ${label} from this doctor dictation. Language hint: ${language}. Patient context: ${patient}. ${schema}\n\nReturn exactly this JSON object:\n{\n  "formatted_text": "human readable clinical draft",\n  "structured_data": {},\n  "missing_fields": [],\n  "review_notes": [],\n  "confidence": 0.0\n}\n\nTranscript:\n${transcript}`
        }
    ];
}

async function generateScribeDocument({ documentType, transcript, patientContext = {}, language = 'auto', organizationId = null }) {
    const normalizedType = mapDocumentTypeForBackend(documentType);
    const messages = buildScribeMessages({ documentType: normalizedType, transcript, patientContext, language });
    const cascade = [];
    let lastError = null;

    for (const provider of SCRIBE_LLM_CASCADE) {
        try {
            const llm = provider === 'sib-bimedix'
                ? await callSibBimedixScribe(messages, normalizedType)
                : await llmProvider.chat({
                    messages,
                    forceProvider: provider,
                    responseFormat: { type: 'json_object' },
                    temperature: 0.05,
                    maxTokens: normalizedType === 'discharge_summary' ? 1400 : 1000,
                    skipCache: true,
                    cognitiveTier: 'deep'
                });
            const parsed = parseJsonObject(llm.content || '');
            const formattedText = parsed.formatted_text || parsed.formattedText || llm.content || '';
            let structuredData = parsed.structured_data || parsed.structuredData || {};
            if (normalizedType === 'prescription') {
                structuredData = derivePrescriptionStructuredData(formattedText, structuredData);
            }
            const safety = validateScribeOutput(normalizedType, transcript, formattedText, structuredData);
            // Prescription draft: attach an allergy/interaction check as a visible flag, never a block — this route never
            // saves a prescription itself, the actual write path (routes/prescription.route.js) enforces the real gate.
            const patientId = patientContext.patientId || patientContext.patient_id;
            if (normalizedType === 'prescription' && patientId && Array.isArray(structuredData.medications) && structuredData.medications.length) {
                try {
                    const check = await checkPrescriptionSafety({ patientId, organizationId, medications: structuredData.medications });
                    safety.prescriptionSafety = { blockers: check.blockers, warnings: check.warnings, allergyStatus: check.allergyStatus };
                    if (check.blockers.length) safety.safety_level = 'high_risk';
                } catch (safetyErr) {
                    safety.prescriptionSafety = { unavailable: true };
                }
            }
            cascade.push({ provider, status: 'success', model: llm.model, latencyMs: llm.latencyMs });
            return {
                success: true,
                formatted_text: formattedText,
                structured_data: structuredData,
                document_type: mapDocumentTypeForFrontend(normalizedType),
                language,
                processing_time_ms: llm.latencyMs || 0,
                ai_badge: true,
                requires_review: true,
                clinical_safety: safety,
                missing_fields: parsed.missing_fields || [],
                review_notes: parsed.review_notes || [],
                confidence: Number(parsed.confidence || 0),
                provider: ['sib-bimedix', 'isha'].includes(provider) ? 'dr-isha-local-bimedix' : provider,
                model: llm.model,
                cascade,
                disclaimer: SCRIBE_DISCLAIMER,
                raw_output: formattedText
            };
        } catch (error) {
            lastError = error;
            cascade.push({ provider, status: 'error', error: error.message });
            logger.warn('AI Scribe LLM provider failed', { provider, error: error.message });
        }
    }

    const err = new Error(`AI Scribe generation failed across BiMediX/Groq/OpenAI: ${lastError?.message || 'unknown error'}`);
    err.cascade = cascade;
    throw err;
}

async function transcribeWithCloudFallback(file, language = 'auto') {
    const selectedLanguage = language === 'auto' ? null : language;
    const fileLike = new File([file.buffer], file.originalname || 'scribe-audio.webm', { type: file.mimetype || 'audio/webm' });
    const result = await llmProvider.transcribe(fileLike, { language: selectedLanguage, responseFormat: 'verbose_json' });
    if (!result.success) throw new Error(result.error || 'Transcription failed');
    return {
        success: true,
        text: result.text || '',
        language: result.language || selectedLanguage || 'auto',
        detected_language: result.language || selectedLanguage || 'auto',
        duration_seconds: result.duration || null,
        provider: result.provider
    };
}

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

// ===================================
// Health Check
// ===================================

/**
 * @route   GET /api/offline-scribe/health
 * @desc    Check AI Scribe service health
 * @access  Public
 */
router.get('/health', async (req, res) => {
    const started = Date.now();
    const sibHealth = await fetch(`${SIB_URL}/health`, { signal: AbortSignal.timeout(5000) })
        .then(r => r.ok ? r.json() : { status: 'degraded', httpStatus: r.status })
        .catch(e => ({ status: 'degraded', error: e.message }));

    res.json({
        status: sibHealth.status === 'healthy' ? 'ok' : 'degraded',
        service: 'ai-scribe',
        mode: 'bimedix-cascade',
        llm: {
            primary: 'dr-isha-local-bimedix',
            fallbacks: ['dr-isha-local-bimedix-direct', 'groq', 'openai'],
            sib: sibHealth
        },
        stt: {
            primary: 'groq-whisper',
            fallbacks: ['openai-whisper']
        },
        offline_scribe_required: false,
        latency_ms: Date.now() - started,
        timestamp: new Date().toISOString()
    });
});

/**
 * @route   GET /api/offline-scribe/languages
 * @desc    Get supported languages
 * @access  Public
 */
router.get('/languages', async (req, res) => {
    return res.json({
        success: true,
        mode: 'ai-scribe-bimedix-cascade',
        languages: FALLBACK_SUPPORTED_LANGUAGES,
        supported_languages: Object.entries(FALLBACK_SUPPORTED_LANGUAGES).map(([code, name]) => ({
            code,
            name,
            native_name: name
        })),
        default_language: 'auto',
        total: Object.keys(FALLBACK_SUPPORTED_LANGUAGES).length
    });
});

/**
 * @route   GET /api/offline-scribe/templates
 * @desc    Get available document templates
 * @access  Public
 */
router.get('/templates', async (req, res) => {
    return res.json({
        templates: {
            prescription: { name: 'OPD Prescription', max_tokens: 1000, sections: ['chief_complaints', 'diagnosis', 'medications', 'advice', 'follow_up'] },
            opd_notes: { name: 'OPD Clinical Notes', max_tokens: 1000, sections: ['chief_complaint', 'history', 'examination', 'diagnosis', 'plan'] },
            ipd_notes: { name: 'IPD Daily Progress Notes', max_tokens: 1000, sections: ['subjective', 'objective', 'assessment', 'plan'] },
            discharge_summary: { name: 'Discharge Summary', max_tokens: 1400, sections: ['admission_diagnosis', 'hospital_course', 'investigations', 'discharge_medications', 'follow_up'] }
        },
        mode: 'dr-isha-local-bimedix-primary'
    });
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
        if (!req.file) {
            return res.status(400).json({
                error: 'No audio file provided',
                help: 'Upload audio file with field name "audio"'
            });
        }

        const language = normalizeLanguage(req.body.language || 'auto');
        const result = await transcribeWithCloudFallback(req.file, language);

        // Log for audit
        logger.info('Audio transcribed via AI Scribe cloud STT cascade', {
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
        const language = normalizeLanguage(req.body.language || 'auto');
        if (!text) {
            return res.status(400).json({ error: 'Text is required', help: 'Provide "text" in request body' });
        }

        // Proxy to the Python offline scribe normalizer (full Indian medical normalization).
        // Falls back to the 5-rule stub if the scribe service is unreachable.
        try {
            const scribeRes = await fetch(`${OFFLINE_SCRIBE_URL}/api/scribe/normalize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Scribe-Token': OFFLINE_SCRIBE_TOKEN,
                },
                body: JSON.stringify({ text, language }),
                signal: AbortSignal.timeout(10000),
            });
            if (scribeRes.ok) {
                const data = await scribeRes.json();
                return res.json(data);
            }
            logger.warn('Offline scribe normalize returned non-OK status', { status: scribeRes.status });
        } catch (proxyErr) {
            logger.warn('Offline scribe unreachable for normalize, using basic fallback', { error: proxyErr.message });
        }

        // Basic fallback (5-rule stub)
        const normalized = String(text)
            .replace(/\btwice daily\b/gi, 'BD')
            .replace(/\bonce daily\b/gi, 'OD')
            .replace(/\bthree times daily\b/gi, 'TDS')
            .replace(/\bafter food\b/gi, 'after meals (PC)')
            .replace(/\bbefore food\b/gi, 'before meals (AC)');
        return res.json({
            success: true,
            original_text: text,
            normalized_text: normalized,
            changes: normalized === text ? [] : [{ type: 'basic_medical_normalization' }],
            confidence: 0.6,
            language,
            processing_time: 0,
            source: 'basic_fallback'
        });
    } catch (error) {
        logger.error('AI Scribe normalization failed:', { error: error.message, userId: req.user?.id });
        return res.status(500).json({ error: 'Normalization failed', message: error.message });
    }
});

// ===================================
// Document Generation
// ===================================

async function handleTextDocumentGeneration(req, res, documentType) {
    try {
        const { dictation, transcript, text: rawText, notes, patient_context = {} } = req.body;
        const language = normalizeLanguage(req.body.language || 'auto');
        const text = String(dictation || transcript || rawText || notes || '').trim();

        if (!text) {
            return res.status(400).json({
                error: 'Dictation text is required',
                help: 'Provide "dictation" or "transcript" in request body'
            });
        }

        const result = await generateScribeDocument({
            documentType,
            transcript: text,
            patientContext: patient_context,
            language
        });

        logger.info('AI Scribe document generated', {
            userId: req.user?.id,
            doctorId: req.user?.doctorId || req.user?.id,
            documentType,
            provider: result.provider,
            safety: result.clinical_safety?.safety_level
        });

        return res.json(result);
    } catch (error) {
        logger.error('AI Scribe document generation failed:', { error: error.message, cascade: error.cascade, userId: req.user?.id });
        return res.status(500).json({
            error: 'AI Scribe document generation failed',
            message: error.message,
            cascade: error.cascade || []
        });
    }
}

/**
 * @route   POST /api/offline-scribe/prescription
 * @desc    Generate OPD prescription from dictation via Dr iSHA BiMediX → Groq → OpenAI
 * @access  Protected (Doctor/Staff)
 */
router.post('/generate-document', authUser, requireScribeAccess, (req, res) => {
    const documentType = mapDocumentTypeForBackend(req.body.documentType || req.body.document_type || req.body.type || 'prescription');
    if (!enforceDoctorOnlyDocumentAccess(req, res, documentType)) return;
    return handleTextDocumentGeneration(req, res, documentType);
});

router.post('/prescription', authUser, requireScribeAccess, (req, res) => {
    if (!enforceDoctorOnlyDocumentAccess(req, res, 'prescription')) return;
    return handleTextDocumentGeneration(req, res, 'prescription');
});

/**
 * @route   POST /api/offline-scribe/opd-notes
 * @desc    Generate OPD notes from dictation via Dr iSHA BiMediX → Groq → OpenAI
 * @access  Protected (Doctor/Staff)
 */
router.post('/opd-notes', authUser, requireScribeAccess, (req, res) => {
    return handleTextDocumentGeneration(req, res, 'opd_notes');
});

/**
 * @route   POST /api/offline-scribe/ipd-notes
 * @desc    Generate IPD notes from dictation via Dr iSHA BiMediX → Groq → OpenAI
 * @access  Protected (Doctor/Staff)
 */
router.post('/ipd-notes', authUser, requireScribeAccess, (req, res) => {
    return handleTextDocumentGeneration(req, res, 'ipd_notes');
});

/**
 * @route   POST /api/offline-scribe/discharge
 * @desc    Generate discharge summary from dictation via Dr iSHA BiMediX → Groq → OpenAI
 * @access  Protected (Doctor/Staff)
 */
router.post('/discharge', authUser, requireScribeAccess, (req, res) => {
    return handleTextDocumentGeneration(req, res, 'discharge_summary');
});


// ===================================
// Ambient streaming MVP
// ===================================

router.post('/sessions', authUser, requireScribeAccess, async (req, res) => {
    _evictExpiredSessions();
    if (ambientSessions.size >= MAX_AMBIENT_SESSIONS) {
        return res.status(429).json({ success: false, message: 'Too many active ambient sessions. Please finalize or wait.' });
    }
    const requestedDocumentType = mapDocumentTypeForBackend(req.body.document_type || 'opd-notes');
    if (!enforceDoctorOnlyDocumentAccess(req, res, requestedDocumentType)) return;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    ambientSessions.set(id, {
        id,
        ownerId: req.user?.id,
        language: normalizeLanguage(req.body.language || 'auto'),
        documentType: requestedDocumentType,
        patientContext: req.body.patient_context || {},
        chunkPaths: [],   // disk paths instead of in-memory buffers
        chunkCount: 0,
        createdAt: new Date().toISOString()
    });
    res.status(201).json({ success: true, sessionId: id });
});

router.post('/sessions/:id/chunks', authUser, requireScribeAccess, upload.single('audio'), async (req, res) => {
    const session = ambientSessions.get(req.params.id);
    if (!session || session.ownerId !== req.user?.id) {
        return res.status(404).json({ success: false, message: 'Ambient session not found' });
    }
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Upload audio chunk with field name "audio"' });
    }
    // Write chunk buffer to disk immediately — never held in Node.js RAM
    const chunkPath = path.join(AMBIENT_CHUNK_DIR, `${req.params.id}_${session.chunkCount}.webm`);
    fs.writeFileSync(chunkPath, req.file.buffer);
    session.chunkPaths.push(chunkPath);
    session.chunkCount++;
    return res.status(202).json({ success: true, chunkCount: session.chunkCount });
});

router.post('/sessions/:id/finalize', authUser, requireScribeAccess, async (req, res) => {
    const session = ambientSessions.get(req.params.id);
    if (!session || session.ownerId !== req.user?.id) {
        return res.status(404).json({ success: false, message: 'Ambient session not found' });
    }
    if (!session.chunkPaths.length) {
        return res.status(400).json({ success: false, message: 'No audio chunks uploaded' });
    }

    try {
        // Concatenate chunk files from disk — avoids holding all audio in RAM at once
        const chunks = session.chunkPaths.map(p => fs.readFileSync(p));
        const audioFile = {
            buffer: Buffer.concat(chunks),
            originalname: 'ambient-session.webm',
            mimetype: 'audio/webm'
        };
        const transcription = await transcribeWithCloudFallback(audioFile, session.language);
        const document = await generateScribeDocument({
            documentType: session.documentType,
            transcript: transcription.text,
            patientContext: session.patientContext,
            language: transcription.language || session.language
        });
        const result = {
            success: true,
            transcription,
            transcript: transcription.text,
            document,
            formatted_text: document.formatted_text,
            structured_data: document.structured_data,
            document_type: mapDocumentTypeForFrontend(session.documentType),
            stt_provider: transcription.provider,
            llm_provider: document.provider,
            cascade: document.cascade,
            clinical_safety: document.clinical_safety,
            requires_review: true,
            ai_badge: true,
            disclaimer: SCRIBE_DISCLAIMER
        };
        _cleanupSessionFiles(session);
        ambientSessions.delete(req.params.id);
        return res.json({ success: true, sessionId: req.params.id, result });
    } catch (error) {
        logger.error('Ambient scribe finalize failed:', { error: error.message, userId: req.user?.id });
        _cleanupSessionFiles(session);
        ambientSessions.delete(req.params.id);
        return res.status(500).json({ success: false, message: error.message });
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
        if (!req.file) {
            return res.status(400).json({
                error: 'No audio file provided',
                help: 'Upload audio file with field name "audio"'
            });
        }

        const language = normalizeLanguage(req.body.language || 'auto');
        const documentType = mapDocumentTypeForBackend(req.body.document_type || 'prescription');
        if (!enforceDoctorOnlyDocumentAccess(req, res, documentType)) return;
        let patientContext = {};
        try {
            patientContext = req.body.patient_context ? JSON.parse(req.body.patient_context) : {};
        } catch {
            patientContext = {};
        }
        patientContext = {
            ...patientContext,
            name: patientContext.name || patientContext.patient_name || req.body.patient_name || '',
            age: patientContext.age || patientContext.patient_age || req.body.patient_age || '',
            gender: patientContext.gender || patientContext.patient_gender || req.body.patient_gender || ''
        };

        const started = Date.now();
        const transcription = await transcribeWithCloudFallback(req.file, language);
        const document = await generateScribeDocument({
            documentType,
            transcript: transcription.text,
            patientContext,
            language: transcription.language || language
        });

        const result = {
            success: true,
            transcription,
            transcript: transcription.text,
            detected_language: transcription.detected_language || transcription.language,
            document_type: mapDocumentTypeForFrontend(documentType),
            document,
            formatted_text: document.formatted_text,
            structured_data: document.structured_data,
            language: transcription.language || language,
            total_processing_time_ms: Date.now() - started,
            stt_provider: transcription.provider,
            llm_provider: document.provider,
            cascade: document.cascade,
            clinical_safety: document.clinical_safety,
            ai_badge: true,
            requires_review: true,
            disclaimer: SCRIBE_DISCLAIMER
        };

        logger.info('AI Scribe full pipeline completed', {
            userId: req.user?.id,
            doctorId: req.user?.doctorId || req.user?.id,
            documentType,
            sttProvider: transcription.provider,
            llmProvider: document.provider,
            safety: document.clinical_safety?.safety_level
        });

        return res.json(result);
    } catch (error) {
        logger.error('AI Scribe full pipeline failed:', { error: error.message, cascade: error.cascade, userId: req.user?.id });
        return res.status(500).json({
            error: 'AI Scribe full pipeline failed',
            message: error.message,
            cascade: error.cascade || []
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
        const language = normalizeLanguage(req.body.language || 'auto');

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Items array is required' });
        }
        if (items.length > 10) {
            return res.status(400).json({ error: 'Maximum 10 items per batch' });
        }

        const doctorOnlyRequested = items.some((item) => {
            const docType = mapDocumentTypeForBackend(item.document_type || 'prescription');
            return DOCTOR_ONLY_DOCUMENT_TYPES.has(docType);
        });
        if (doctorOnlyRequested && getNormalizedUserRole(req) !== 'doctor') {
            return res.status(403).json({
                success: false,
                code: 'DOCTOR_ONLY_DOCUMENT_TYPE',
                message: 'Only doctor accounts can generate prescription documents in batch requests.'
            });
        }

        const results = [];
        const errors = [];
        for (let i = 0; i < items.length; i += 1) {
            const item = items[i];
            try {
                const text = String(item.dictation || item.transcript || '').trim();
                if (!text) throw new Error('Missing dictation');
                const docType = mapDocumentTypeForBackend(item.document_type || 'prescription');
                const result = await generateScribeDocument({
                    documentType: docType,
                    transcript: text,
                    patientContext: item.patient_context || {},
                    language: normalizeLanguage(item.language || language)
                });
                results.push({ index: i, status: 'success', result });
            } catch (error) {
                errors.push({ index: i, status: 'error', error: error.message, cascade: error.cascade || [] });
            }
        }

        logger.info('AI Scribe batch completed', {
            doctorId: req.user?.doctorId || req.user?.id,
            totalItems: items.length,
            successCount: results.length,
            errorCount: errors.length
        });

        return res.json({ total: items.length, successful: results.length, failed: errors.length, results, errors });
    } catch (error) {
        logger.error('AI Scribe batch failed:', { error: error.message, userId: req.user?.id });
        return res.status(500).json({ error: 'AI Scribe batch failed', message: error.message });
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
    const sibHealth = await fetch(`${SIB_URL}/health`, { signal: AbortSignal.timeout(5000) })
        .then(r => r.ok ? r.json() : { status: 'degraded', httpStatus: r.status })
        .catch(e => ({ status: 'degraded', error: e.message }));

    return res.json({
        service: 'ai-scribe',
        status: sibHealth.status === 'healthy' ? 'ok' : 'degraded',
        mode: 'dr-isha-local-bimedix-primary',
        llm: {
            primary: 'dr-isha-local-bimedix',
            cascade: ['sib-bimedix', 'dr-isha-local-bimedix-direct', 'groq', 'openai'],
            sib: sibHealth
        },
        stt: {
            primary: 'groq-whisper',
            cascade: ['groq-whisper', 'openai-whisper']
        },
        documentTypes: Object.entries(DOCUMENT_LABELS).map(([type, name]) => ({ type: mapDocumentTypeForFrontend(type), name })),
        languages: FALLBACK_SUPPORTED_LANGUAGES,
        safeguards: [
            'doctor-review-required',
            'medication-hallucination-check',
            'medication-omission-check',
            'allergy-presence-check',
            'JSON structured output'
        ],
        offline_scribe_required: false,
        timestamp: new Date().toISOString()
    });
});

export default router;
