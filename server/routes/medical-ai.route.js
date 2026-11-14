import { patientVideoAccess } from '../utils/patient-video-access.js';
import DoctorAvailability from '../models/doctorAvailability.model.intelligent.js';
import { hasAvailableChatSlot } from '../services/chat-appointment-transaction.js';
import { getChatMedicationReference } from '../services/chat-medication-context.js';
import { recordChatTrace } from '../services/chat-trace.service.js';
import { createChatHandoff } from '../services/chat-handoff.js';
import { WebhookReceiver } from 'livekit-server-sdk';
import { createChatAppointmentActions } from '../services/chat-appointment-actions.js';
import * as appointmentRepository from '../repositories/appointment.repository.js';
import { resolveActor, isOwnedByActor } from '../services/appointment-identity.service.js';
import { cancelAppointment, rescheduleAppointment } from '../controller/appointment.controller.js';
import { resolveChatSubject } from '../services/chat-subject-access.js';
import { canAccessPatient } from '../services/patient-access.service.js';
import { getNotificationPreferences } from '../services/notification-preferences.service.js';
import { reviewMedicalKnowledge, previewMedicalKnowledge } from '../services/medical-knowledge-review.js';
import { createDurableChatSessions } from '../repositories/owned-chat-sessions.js';
import { sibFetch as fetch } from '../services/sib-client.js';
import express from 'express';
import crypto from 'crypto';
import whatsAppUserContextService from '../services/whatsapp-user-context.service.js';
import { authUser, authUserOptional } from '../middleware/auth.middleware.js';
import { createRateLimiter } from '../middleware/rateLimiter.middleware.js';
import handleIntentEscalation, { getDoctorSuggestions } from '../services/intentEscalation.service.js';
import { Appointment } from '../models/appointment.model.intelligent.js';
import doctorModel from '../models/doctor.model.intelligent.js';
import { User } from '../models/user.model.intelligent.js';
import { buildLiveKitJoinData, resolveLiveKitCredentials } from '../utils/videoProvider.js';
import llmProvider from '../services/ai-brain/llm-provider.js';
import { mlog, mwarn, merr } from '../utils/medical-ai-logger.js';
import emergencyTriageService from '../services/ai-emergency-triage.service.js';
import { getWearableContextForUser } from '../services/patient-wearable-context.service.js';
import { canonicalizeAppointmentTime } from '../utils/appointmentSlotTime.js';
import { checkDoctorConflict, checkPatientConflict } from '../services/appointmentEligibility.service.js';
import { notifyCareTeamOfBooking } from '../services/care-team-notification.service.js';
import redisClient from '../config/redis.js';
import { Op } from 'sequelize';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import qualityGates from '../services/ai-quality-gates.service.js';
import pool from '../db/pgPool.js';
import { chatOwner, createChatSessions, buildChatRequest, chatResponseMetadata, requireAIConsent, requireSibSuccess, verifiedChatObservations } from '../services/medical-chat-contract.js';
import { setRlsContext } from '../middleware/rls-context.middleware.js';

const router = express.Router();
router.use((req,res,next) => {
  if (!['/consult','/analyze-symptoms'].includes(req.path)) return next();
  const started=Date.now();
  const traceId=req.chatTraceId || crypto.randomUUID();
  res.setHeader('X-Trace-Id',traceId);res.locals.chatTrace={traceId};
  res.once('finish',()=>{ void recordChatTrace({traceId,channel:'web',latencyMs:Date.now()-started,
    ...res.locals.chatTrace,success:res.statusCode<400,errorType:res.statusCode>=400?`http-${res.statusCode}`:null}); });
  next();
});
const SIB_URL = process.env.SIB_URL || 'http://localhost:8001';
const SIB_DOCTOR_NAME = 'Dr. iSHA';
const chatSessions = createDurableChatSessions(pool);
const chatActions = createChatAppointmentActions({ database: pool, repository: appointmentRepository,
  resolveActor, owns: isOwnedByActor, cancel: cancelAppointment, reschedule: rescheduleAppointment,
  validateTarget:async (appointment,action,transaction)=>{
    if (new Date(`${action.appointmentDate}T${action.appointmentTime}:00+05:30`)<=new Date()) throw Object.assign(new Error('Future slot required'),{statusCode:400});
    const slots=await DoctorAvailability.findAll({where:{doctorId:appointment.doctorId,dayOfWeek:new Date(`${action.appointmentDate}T12:00:00Z`).getUTCDay(),isAvailable:true},transaction,lock:transaction.LOCK.UPDATE});
    if (!hasAvailableChatSlot(slots,action.appointmentTime)) throw Object.assign(new Error('Slot no longer available'),{statusCode:409});
  },
});

const chatHandoff = createChatHandoff({ repository: appointmentRepository, resolveActor, owns: isOwnedByActor,
  verifyEvent: async (raw, authorization) => {
    const {apiKey,apiSecret}=resolveLiveKitCredentials();
    if (!apiKey || !apiSecret) throw Object.assign(new Error('Video provider unavailable'), { statusCode: 503 });
    try { return await new WebhookReceiver(apiKey,apiSecret).receive(raw, authorization); }
    catch { throw Object.assign(new Error('Invalid provider signature'), { statusCode: 401 }); }
  },
});
router.get('/handoffs/:id', authUser, async (req,res) => {
  try { res.json({ success:true, ...await chatHandoff.read(req,req.params.id) }); }
  catch(error) { res.status(error.statusCode || 503).json({ success:false,error:error.statusCode ? error.message : 'Handoff unavailable' }); }
});
router.post('/handoffs/:id/decision', authUser, async (req,res) => {
  try { res.json({ success:true, ...await chatHandoff.decide(req,req.params.id,req.body.status) }); }
  catch(error) { res.status(error.statusCode || 503).json({ success:false,error:error.statusCode ? error.message : 'Handoff unavailable' }); }
});
router.post('/handoffs/provider/events', async (req,res) => {
  try {
    if (!req.rawBody || req.rawBody.length>1000000) return res.status(400).json({error:'Signed raw body required'});
    res.json(await chatHandoff.provider(req.rawBody,req.get('Authorization')));
  } catch(error) { res.status(error.statusCode || 503).json({error:error.statusCode ? error.message : 'Provider event unavailable'}); }
});

// HMAC-based session ID — prevents user ID enumeration via session token
const SESSION_SECRET = process.env.SESSION_HMAC_SECRET || process.env.JWT_SECRET || 'mediczy-session-hmac';
function buildSessionId(userId, prefix = 'mediczy') {
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(String(userId)).digest('hex').slice(0, 16);
  return `${prefix}_${hmac}`;
}
// Rate limiter for feedback (20 per hour per user — prevent spam)
const feedbackLimiter = createRateLimiter('api', {
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many feedback submissions.',
  skipSuccessfulRequests: true
});

// Allowlist for AI-driven navigation redirects — prevents phishing via crafted LLM responses
const SAFE_REDIRECT_PATHS = new Set([
  '/emergency', '/patient/appointments', '/patient/doctors',
  '/patient/dashboard', '/patient/health', '/doctor/dashboard',
]);
function validateRedirectUrl(url) {
  if (!url) return null;
  // Internal relative paths only
  if (url.startsWith('/') && !url.startsWith('//')) {
    const path = url.split('?')[0];
    if (SAFE_REDIRECT_PATHS.has(path) || path.startsWith('/patient/doctors?')) return url;
  }
  return null; // discard unsafe urls
}

// Rate limiter for non-emergency consultations (30 req/min per user)
const consultLimiter = createRateLimiter('api', {
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many consultation requests. Please wait a moment before asking again.',
  skipSuccessfulRequests: false
});

// Rate limiter for emergency triage calls — 3 per 15 min per IP
const emergencyTriageLimiter = createRateLimiter('api', {
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: 'Emergency call rate limit reached. Please wait before trying again.',
  skipSuccessfulRequests: false
});

// Input validation for medical queries
function validateMedicalQuery(query) {
  if (!query || typeof query !== 'string') return 'Medical query is required';
  const trimmed = query.trim();
  if (trimmed.length === 0) return 'Query cannot be empty';
  if (trimmed.length > 2000) return 'Query too long (max 2000 characters)';
  // Detect obvious prompt injection patterns
  const injectionPatterns = [
    /\bignore\b.{0,30}\b(previous|above|system|instructions?)\b/i,
    /\bforget\b.{0,20}\b(context|everything|above)\b/i,
    /^system:/im,
    /\byou are (now|actually|really)\b/i,
  ];
  if (injectionPatterns.some(p => p.test(trimmed))) {
    return 'Invalid request. Please ask a direct health question.';
  }
  return null;
}

// Coerce a SIB field into clean text. SIB / LLM wrappers sometimes return the
// answer as a nested object; naive String() on those yields "[object Object]"
// which surfaced to users as a broken Dr. iSHA reply.
const coerceSibText = (value) => {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    const nested = value.text
      || value.content
      || value.answer
      || value.message
      || value.response
      || value.output
      || value.choices?.[0]?.message?.content;
    if (typeof nested === 'string') return nested.trim();
  }
  return '';
};

const extractSibResponse = (sibData) => {
  const candidates = [
    sibData?.response,
    sibData?.primary_response,
    sibData?.chat_answer,
    sibData?.message,
    sibData?.result,
  ];
  let text = '';
  for (const candidate of candidates) {
    text = coerceSibText(candidate);
    if (text) break;
  }
  // Treat empty / unparseable shapes as a failure so the caller can fall back
  // to the LLM cascade instead of returning garbage to the user.
  if (!text) throw new Error('SIB returned an empty response');
  return text;
};

const buildSibConsultation = (sibData, { sessionId, language }) => {
  const responseText = extractSibResponse(sibData);
  if (responseText === 'Based on the information I gathered, here is my response.') {
    throw new Error('SIB returned a heading without an answer');
  }
  const payload = {
    success: true,
    response: responseText,
    primary_response: responseText,
    doctor: SIB_DOCTOR_NAME,
    sessionId,
    timestamp: new Date().toISOString(),
    language,
    provider: 'sib-fastapi',
    model: sibData?.model || 'unknown'
  };

  Object.assign(payload, chatResponseMetadata(sibData));
  if (sibData?.retrieval?.evidence_status === 'extractive' && payload.evidenceStatus !== 'extractive') throw new Error('Source evidence validation failed');

  const confidence = sibData?.confidence ?? sibData?.ai_assessment?.confidence;
  if (typeof confidence === 'number') payload.confidence = confidence;

  // Forward intent-related fields from SIB — validate redirectUrl to prevent phishing
  if (!payload.emergency && sibData?.intentType) payload.intentType = String(sibData.intentType);
  if (!payload.emergency && sibData?.redirectUrl) {
    const safe = validateRedirectUrl(sibData.redirectUrl);
    if (safe) payload.redirectUrl = safe;
    // silently drop unsafe redirectUrls — do NOT forward them to client
  }
  if (sibData?.suggestedSpecialist) payload.suggestedSpecialist = String(sibData.suggestedSpecialist);
  if (sibData?.specialization)      payload.specialization      = String(sibData.specialization);

  return payload;
};

/**
 * @route   POST /api/medical-ai/test
 * @desc    Test medical AI functionality (authenticated — dev/staging only)
 * @access  Private
 */
router.post('/test', authUser, async (req, res) => {
  try {
    const { query, language = 'en', userContext = {} } = req.body;

    const queryError = validateMedicalQuery(query);
    if (queryError) return res.status(400).json({ success: false, error: queryError });

    const testSessionId = `test_${req.user.id}_${Date.now()}`;
    const testUserContext = {
      userId: req.user.id,
      age: userContext.age || 30,
      gender: userContext.gender || 'unspecified',
      medicalHistory: userContext.medicalHistory || [],
      currentMedications: userContext.currentMedications || [],
      ...userContext
    };

    mlog('Medical AI test', { userId: req.user.id, lang: language });

    const testController = new AbortController();
    const testTimeout = setTimeout(() => testController.abort(), 20000);
    let sibResponse;
    try {
      sibResponse = await fetch(`${SIB_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: testController.signal,
        body: JSON.stringify({ patient_id: testSessionId, message: query, language, patient_data: testUserContext })
      });
    } catch (fe) {
      if (fe.name === 'AbortError') return res.status(504).json({ success: false, error: 'Test timed out', test: true });
      throw fe;
    } finally { clearTimeout(testTimeout); }

    if (!sibResponse.ok) {
      const errorText = await sibResponse.text().catch(() => '');
      return res.status(503).json({
        success: false,
        error: 'SIB request failed',
        details: errorText || `HTTP ${sibResponse.status}`,
        test: true,
        provider: 'sib-fastapi'
      });
    }

    const sibData = await sibResponse.json();
    const responsePayload = buildSibConsultation(sibData, {
      sessionId: testSessionId,
      language
    });

    if (!responsePayload.response) {
      return res.status(502).json({
        success: false,
        error: 'SIB response missing content',
        test: true,
        provider: 'sib-fastapi'
      });
    }

    res.json({
      ...responsePayload,
      data: responsePayload,
      test: true,
      timestamp: responsePayload.timestamp
    });

  } catch (error) {
    merr("Medical AI test error", { error: error?.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Medical AI service temporarily unavailable',
      test: true
    });
  }
});

/**
 * @route   POST /api/medical-ai/consult
 * @desc    Medical consultation with Dr. Isha
 * @access  Private
 */
router.get('/knowledge/:id/preview', authUser, async (req,res) => {
  try { res.json({success:true,source:await previewMedicalKnowledge(pool,{id:req.params.id,role:req.userRole||req.user.role})}); }
  catch(error) {res.status(error.statusCode||503).json({error:error.statusCode?error.message:'Source preview unavailable'});}
});
router.post('/knowledge/:id/review', authUser, async (req, res) => {
  try {
    const review = await reviewMedicalKnowledge(pool, { ...req.body, id: req.params.id,
      reviewerUid: req.user.unique_id, role: req.userRole || req.user.role });
    res.json({ success: true, review });
  } catch (error) { res.status(error.statusCode || 503).json({ success: false, error: error.statusCode ? error.message : 'Review store unavailable' }); }
});

router.post('/actions/propose', authUser, async (req, res) => {
  if (process.env.CHATBOT_TASK_MUTATIONS_ENABLED === 'false') return res.status(503).json({error:'Chat task mutations are disabled'});
  try { res.json({ success: true, ...await chatActions.propose(req, chatOwner(req), req.body) }); }
  catch (error) { res.status(error.statusCode || 503).json({ success: false, error: error.statusCode ? error.message : 'Appointment actions unavailable' }); }
});
router.post('/actions/confirm', authUser, async (req, res) => {
  if (process.env.CHATBOT_TASK_MUTATIONS_ENABLED === 'false') return res.status(503).json({error:'Chat task mutations are disabled'});
  try { res.json({ success: true, ...await chatActions.confirm(req, chatOwner(req), req.body) }); }
  catch (error) { res.status(error.statusCode || 503).json({ success: false, error: error.statusCode ? error.message : 'Appointment action unavailable' }); }
});

router.post('/consult', authUser, consultLimiter, async (req, res) => {
  try {
    const { query, language = 'en', userContext = {}, sessionId: requested } = req.body;
    const queryError = validateMedicalQuery(query);
    if (queryError) return res.status(400).json({ success: false, error: queryError });
    const subject = userContext.patientUid ? await resolveChatSubject(pool, req, userContext.patientUid, canAccessPatient) : null;
    const subjectId = subject?.id || req.user.id;
    const personal = userContext.useHealthHistory === true || Boolean(subject);
    const owner = `${personal ? 'personal:' : ''}${chatOwner(req)}${subject ? `:subject:${subject.unique_id}` : ''}`;
    const sessionId = await chatSessions.resolve(requested, owner);
    // Client transcripts and role/patient flags never supply authoritative context.
    const history = await chatSessions.load(sessionId, owner);
    const role = String(req.userRole || req.user?.role || 'user').toLowerCase();
    const staff = ['doctor', 'nurse', 'assistant', 'admin', 'team', 'medical_director', 'super_admin'].includes(role);
    if (userContext.patientId || userContext.patientData) {
      return res.status(403).json({ success: false, error: 'Use the authorized clinical chart workflow for another patient' });
    }
    if (personal && process.env.CHATBOT_PERSONAL_CONTEXT_ENABLED === 'false') return res.status(503).json({error:'Personal clinical context is disabled'});
    if (personal && staff && !subject) return res.status(403).json({ success: false, error: 'Use the authorized clinical chart workflow for patient history' });
    let context;
    if (personal) {
      await requireAIConsent(pool, subjectId);
      const full = await whatsAppUserContextService.getFullUserContextByUserId(subjectId);
      const user = full?.user || {};
      context = {
        user: { age: user.age, gender: user.gender, bloodGroup: user.bloodGroup },
        prescriptions: { recent: (subject ? [] : full?.prescriptions?.recent || []).slice(0, 5).map(rx => ({
          medications: rx.medications, diagnosis: rx.diagnosis, createdAt: rx.createdAt,
        })) },
        medicationReference: await getChatMedicationReference({patientId:subjectId,organizationId:subject?.organization_id ?? req.tenant?.id ?? req.user.organization_id}),
        wearables: await getWearableContextForUser(subjectId),
        reminderPreferences: await getNotificationPreferences(subjectId).then(p => ({ appointmentReminders:p.appointmentReminders,medicationReminders:p.medicationReminders,followUpReminders:p.followUpReminders })).catch(() => ({status:'unavailable'})),
        verifiedObservations: await verifiedChatObservations(pool, {
          userId: subjectId, organizationId: subject?.organization_id ?? req.tenant?.id ?? req.user.organization_id,
          organizationUid: req.tenant?.unique_id || req.user.organization_uid, requireOrganizationUid: Boolean(subject),
        }),
      };
    }
    const cancellation = /^cancel (?:my )?appointment\s*#?(\d+)\s*$/i.exec(query.trim());
    const rescheduling = /^reschedule (?:my )?appointment\s*#?(\d+) to (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})\s*$/i.exec(query.trim());
    if (cancellation || rescheduling) {
      if(process.env.CHATBOT_TASK_MUTATIONS_ENABLED === 'false') return res.status(503).json({error:'Chat task mutations are disabled'});
      const proposal = await chatActions.propose(req, chatOwner(req), cancellation
        ? { kind:'cancel',appointmentId:Number(cancellation[1]) }
        : { kind:'reschedule',appointmentId:Number(rescheduling[1]),appointmentDate:rescheduling[2],appointmentTime:rescheduling[3] });
      const text = cancellation ? `Please confirm cancellation of appointment #${cancellation[1]}.`
        : `Please confirm moving appointment #${rescheduling[1]} to ${rescheduling[2]} at ${rescheduling[3]} (Asia/Kolkata).`;
      await chatSessions.append(sessionId,owner,[{role:'user',content:query},{role:'assistant',content:text}]);
      return res.json({success:true,response:text,sessionId,provider:'appointment-workflow',action:proposal});
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let upstream;
    try {
      upstream = await fetch(`${SIB_URL}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({...buildChatRequest({ sessionId, query, language, history,
          userId: subjectId, context, personal }),trace_id:res.locals.chatTrace.traceId}),
      });
      requireSibSuccess(upstream);
      const data = await upstream.json();
      const consultation = buildSibConsultation(data, { sessionId, language });
      await chatSessions.append(sessionId, owner, [
        { role: 'user', content: query }, { role: 'assistant', content: consultation.response },
      ]);
      Object.assign(res.locals.chatTrace,{sessionId,provider:consultation.provider,model:consultation.model,evidenceStatus:consultation.evidenceStatus});
      return res.json({ ...consultation, traceId:res.locals.chatTrace.traceId, conversationLength: Math.floor(history.length / 2) + 1 });
    } finally { clearTimeout(timeout); }
  } catch (error) {
    // An ungoverned generation fallback must not bypass SIB's consent/safety filters.
    const status = error.statusCode || (error.name === 'AbortError' ? 504 : 503);
    merr('Medical consultation failed', { status });
    return res.status(status).json({ success: false,
      error: error.statusCode ? error.message : 'Medical AI service temporarily unavailable. For urgent symptoms, seek immediate medical care.',
      retryAfterSeconds: status >= 500 ? 30 : undefined });
  }
});

/**
 * @route   POST /api/medical-ai/analyze-symptoms
 * @desc    Symptom analysis with Dr. Isha
 * @access  Private
 */
router.post('/analyze-symptoms', authUser, async (req, res) => {
  try {
    const {
      symptoms,
      description,
      language = 'en',
      severity = 'moderate',
      duration = ''
    } = req.body;

    if (!symptoms || !Array.isArray(symptoms) || symptoms.length === 0) {
      return res.status(400).json({ success: false, error: 'Symptoms array is required' });
    }
    if (symptoms.length > 20) {
      return res.status(400).json({ success: false, error: 'Too many symptoms (max 20)' });
    }
    // Validate the free-text description for injection patterns
    if (description) {
      const descError = validateMedicalQuery(description);
      if (descError) return res.status(400).json({ success: false, error: descError });
    }

    const owner = chatOwner(req);
    const sessionId = await chatSessions.resolve(req.body.sessionId, owner);
    const symptomsText = Array.isArray(symptoms) ? symptoms.join(', ') : symptoms;
    const analysisPrompt = `I am experiencing the following symptoms: ${symptomsText}. ${description || ''}. Duration: ${duration || 'not specified'}. Severity: ${severity || 'moderate'}.`;

    const asController = new AbortController();
    const asTimeout = setTimeout(() => asController.abort(), 25000);
    let sibData = null;
    try {
      const sibResponse = await fetch(`${SIB_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: asController.signal,
        body: JSON.stringify(buildChatRequest({ sessionId, query: analysisPrompt, language, history: [] }))
      });
      requireSibSuccess(sibResponse);
      sibData = await sibResponse.json();
    } catch (fe) {
      if (fe.name !== 'AbortError') throw fe;
    } finally { clearTimeout(asTimeout); }

    let analysis;
    if (sibData) {
      try { analysis = buildSibConsultation(sibData, { sessionId, language }); } catch { analysis = null; }
    }
    if (!analysis) return res.status(503).json({ success: false, error: 'Symptom analysis service temporarily unavailable', retryAfterSeconds: 30 });


    res.json({
      ...analysis,
      symptoms,
      description,
      severity,
      duration
    });
  } catch (error) {
    merr("Symptom analysis error", { error: error?.message });
    res.status(error.statusCode || 503).json({
      success: false,
      error: error.statusCode ? error.message : 'Symptom analysis service temporarily unavailable'
    });
  }
});

/**
 * @route   POST /api/medical-ai/emergency-triage
 * @desc    Emergency triage assessment (routed through SIB)
 * @access  Private
 */
router.post('/emergency-triage', authUser, async (req, res) => {
  try {
    const { symptoms, description, language = 'en', multimodalContext, vitals = {}, painScale = null } = req.body;

    if (!symptoms || !description) {
      return res.status(400).json({
        success: false,
        error: 'Symptoms and description are required for emergency triage'
      });
    }

    const symptomText = `${symptoms}. ${description}`.trim();
    const wearableContext = await getWearableContextForUser(req.user.id).catch(() => null);
    const mergedVitals = {
      ...(wearableContext?.wearableSummary?.heart_rate?.value != null
        ? { heart_rate: wearableContext.wearableSummary.heart_rate.value }
        : {}),
      ...(wearableContext?.wearableSummary?.spo2?.value != null
        ? { spo2: wearableContext.wearableSummary.spo2.value }
        : {}),
      ...(wearableContext?.wearableSummary?.blood_pressure?.value != null
        ? { blood_pressure: wearableContext.wearableSummary.blood_pressure.value }
        : {}),
      ...vitals,
    };

    // Governed ESI engine (primary path — SaMD quality gates + LIME)
    const esiResult = await emergencyTriageService.triage({
      symptoms: symptomText,
      vitals: mergedVitals,
      painScale: painScale ?? multimodalContext?.painScale ?? null,
      age: req.user?.dateOfBirth ? Math.floor((Date.now() - new Date(req.user.dateOfBirth)) / (365.25 * 24 * 3600 * 1000)) : null,
      gender: req.user?.gender || null,
      patientId: req.user.id,
    });

    const esiToUrgency = { 1: 'CRITICAL', 2: 'HIGH', 3: 'MODERATE', 4: 'LOW', 5: 'LOW' };
    const urgencyLevel = esiToUrgency[esiResult.esiLevel] || 'HIGH';
    const requiresImmediate = esiResult.esiLevel <= 2;
    const callAmbulance = esiResult.ambulanceNeeded === true;

    // Optional patient-friendly narrative from SIB/LLM (secondary — does not override ESI)
    let narrative = esiResult.esiDescription;
    try {
      const llmRes = await llmProvider.chat({
        messages: [
          { role: 'system', content: 'Summarize triage guidance in 2-3 short sentences for a patient. Do not change urgency level.' },
          { role: 'user', content: `ESI level ${esiResult.esiLevel}. Symptoms: ${symptomText}. Actions: ${(esiResult.immediateActions || []).join('; ')}` },
        ],
        maxTokens: 200,
        temperature: 0.2,
      });
      narrative = llmRes?.content || llmRes?.text || narrative;
    } catch {
      // Non-blocking narrative fallback
    }

    const triage = {
      success: true,
      urgencyLevel,
      esiLevel: esiResult.esiLevel,
      esiDescription: esiResult.esiDescription,
      category: esiResult.category,
      specialty: esiResult.specialty,
      urgencyDetails: {
        level: urgencyLevel,
        reason: `ESI-${esiResult.esiLevel}: ${esiResult.category}`,
        actions: esiResult.immediateActions || [],
      },
      response: narrative,
      requiresImmediateAttention: requiresImmediate,
      callAmbulance,
      recommendedActions: esiResult.immediateActions || [],
      followUpQuestions: [],
      triageId: `triage_${Date.now()}_${req.user.id}`,
      governed: true,
      qualityGate: esiResult.qualityGate || null,
      interpretation: esiResult.interpretation || null,
      confidence: esiResult.confidence ?? null,
      wearableContextUsed: Boolean(wearableContext),
      multimodalContext: multimodalContext || null,
      language,
    };

    mlog('Emergency triage completed (ESI)', { userId: req.user.id, esiLevel: esiResult.esiLevel, urgencyLevel });
    res.json(triage);
  } catch (error) {
    merr("Emergency triage error", { error: error?.message });
    res.status(500).json({
      success: false,
      error: 'Emergency triage service temporarily unavailable',
      urgencyLevel: 'UNKNOWN',
      requiresImmediateAttention: true
    });
  }
});

/**
 * @route   POST /api/medical-ai/emergency-sos
 * @desc    Send emergency SOS alerts to doctor, hospital, HR, and family contacts
 * @access  Private
 */
router.post('/emergency-sos', authUser, async (req, res) => {
  try {
    const { 
      message, 
      reason, 
      location, 
      visionAnalysis, 
      urgencyLevel = 'high',
      contacts = []
    } = req.body;
    
    const userId = req.user.id;
    const notifiedContacts = [];
    const errors = [];

    // Import required services
    const { default: notificationService } = await import('../services/notification.service.js');
    const { Appointment } = await import('../models/index.js');
    const nodemailer = await import('nodemailer');
    
    // Helper to send simple emergency emails via SMTP
    const sendSosEmail = async (to, subject, body) => {
      const smtpPort = parseInt(process.env.SMTP_PORT || '587');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD
        }
      });
      await transporter.sendMail({
        from: `"Mediczy Emergency" <${process.env.SMTP_USER || 'noreply@mediqzy.com'}>`,
        to,
        subject,
        text: body,
        html: `<div style="font-family:sans-serif;padding:20px"><h2 style="color:#dc2626">🚨 ${subject}</h2><pre style="white-space:pre-wrap">${body}</pre></div>`
      });
    };
    
    mlog("Emergency SOS initiated", { userId });

    // Build emergency notification content
    const sosTitle = `🚨 EMERGENCY SOS ALERT - ${urgencyLevel.toUpperCase()}`;
    const sosBody = `
Emergency SOS Alert!

Patient ID: ${userId}
Reason: ${reason}
Time: ${new Date().toLocaleString()}
${location ? `Location: https://www.google.com/maps?q=${location.lat},${location.lng}` : ''}

${visionAnalysis ? `
Vision AI Analysis:
- Distress Level: ${visionAnalysis.distressLevel}
- Consciousness: ${visionAnalysis.consciousnessLevel}
- Breathing: ${visionAnalysis.respiratoryPattern}
${visionAnalysis.alerts ? `- Alerts: ${visionAnalysis.alerts.join(', ')}` : ''}
` : ''}

${message || 'Immediate assistance required!'}

This is an automated emergency alert from Mediczy.
    `.trim();

    // 1. Notify assigned doctor (if user has recent appointment)
    try {
      const recentAppointment = await Appointment.findOne({
        where: { patientId: userId },
        order: [['createdAt', 'DESC']],
        include: [{
          model: (await import('../models/index.js')).Doctor,
          as: 'doctor',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber']
        }]
      });

      if (recentAppointment?.doctor) {
        const doctor = recentAppointment.doctor;
        
        // Send push notification to doctor
        try {
          await notificationService.send({
            userId: doctor.id,
            userType: 'doctor',
            type: 'appointment_request', // Using existing template
            variables: {
              patientName: `Patient #${userId} - EMERGENCY SOS`,
              date: new Date().toLocaleDateString(),
              time: new Date().toLocaleTimeString()
            },
            data: {
              type: 'emergency_sos',
              patientId: userId,
              reason,
              location,
              urgencyLevel
            }
          });
          notifiedContacts.push({ type: 'doctor', name: `Dr. ${doctor.firstName} ${doctor.lastName}`, method: 'push' });
        } catch (pushError) {
          merr("Push notification failed", { error: pushError.message });
        }

        // Send email to doctor
        try {
          if (doctor.email) {
            await sendSosEmail(
              doctor.email,
              sosTitle,
              sosBody
            );
            notifiedContacts.push({ type: 'doctor', name: `Dr. ${doctor.firstName} ${doctor.lastName}`, method: 'email' });
          }
        } catch (emailError) {
          merr("Email notification failed", { error: emailError.message });
        }
      }
    } catch (doctorError) {
      merr("Doctor notification error", { error: doctorError.message });
      errors.push('doctor_notification_failed');
    }

    // 2. Notify hospital emergency (if user belongs to an organization)
    try {
      const { User } = await import('../models/index.js');
      const user = await User.findByPk(userId, {
        attributes: ['id', 'organization_id', 'email']
      });

      if (user?.organization_id) {
        // Organization table may not exist yet - skip if unavailable
        try {
          const { Organization } = await import('../models/index.js');
          if (Organization) {
            const org = await Organization.findByPk(user.organization_id, {
              attributes: ['id', 'name', 'adminEmail', 'emergencyContact']
            });

            if (org?.emergencyContact || org?.adminEmail) {
              const hospitalEmail = org.emergencyContact || org.adminEmail;
              await sendSosEmail(
                hospitalEmail,
                sosTitle,
                sosBody
              );
              notifiedContacts.push({ type: 'hospital', name: org.name, method: 'email' });
            }
          }
        } catch (orgError) {
          mwarn("Org lookup skipped", { error: orgError.message });
        }
      }

      // 3. Notify HR (if user has HR contact via organization - future feature)
      if (false) {
        try {
          // Placeholder for HR notification when organization HR contacts are implemented
          notifiedContacts.push({ type: 'hr', name: 'HR Department', method: 'email' });
        } catch (hrError) {
          merr("HR notification error", { error: hrError.message });
        }
      }
    } catch (orgError) {
      mwarn("Org/HR notification error", { error: orgError.message });
      errors.push('organization_notification_failed');
    }

    // 4. Notify family/emergency contacts provided in request
    for (const contact of contacts) {
      if (contact.email) {
        try {
          await sendSosEmail(
            contact.email,
            sosTitle,
            sosBody
          );
          notifiedContacts.push({ type: contact.type || 'family', name: contact.name, method: 'email' });
        } catch (contactError) {
          mwarn("Contact notification error", { error: contactError.message });
        }
      }
    }

    // Log SOS event for audit
    mlog("SOS notifications sent", { userId });

    res.json({
      success: true,
      message: `Emergency SOS sent to ${notifiedContacts.length} contact(s)`,
      notifiedContacts,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    merr("Emergency SOS error", { error: error?.message });
    res.status(500).json({
      success: false,
      error: 'Failed to send emergency SOS alerts',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/medical-ai/triage-doctors
 * @desc    Get available online triage doctors for instant consultation
 *          Only returns doctors who are ONLINE and have opted for EMERGENCY consultations
 * @access  Private
 */
router.get('/triage-doctors', authUser, async (req, res) => {
  try {
    const { Doctor } = await import('../models/index.js');
    
    // Find doctors who are:
    // 1. Online (isOnline: true)
    // 2. Verified (isVerified: true)
    // 3. Have opted for emergency consultations (acceptsEmergencyCalls: true)
    const availableDoctors = await Doctor.findAll({
      where: {
        isOnline: true,
        isVerified: true,
        acceptsEmergencyCalls: true  // Only doctors who opted for emergency consultations
      },
      attributes: [
        'id', 'uniqueId', 'prefix', 'firstName', 'lastName', 'profileImage',
        'specialization', 'qualifications', 'experience', 'registrationNumber',
        'rating', 'totalReviews',
        'onlineConsultationFee', 'consultationFees',
        'languages', 'isOnline', 'acceptsEmergencyCalls', 'emergencyAvailableUntil'
      ],
      order: [
        ['experience', 'DESC']
      ],
      limit: 10
    });

    // Filter out doctors whose emergency availability has expired
    const now = new Date();
    const triageDoctors = availableDoctors
      .filter(doc => {
        // If no emergencyAvailableUntil set, assume always available
        if (!doc.emergencyAvailableUntil) return true;
        return new Date(doc.emergencyAvailableUntil) > now;
      })
      .map(doc => ({
        id: doc.id,
        uniqueId: doc.uniqueId,
        name: `${doc.prefix || 'Dr.'} ${doc.firstName} ${doc.lastName}`,
        profileImage: doc.profileImage,
        specialization: doc.specialization,
        qualifications: doc.qualifications,
        experience: doc.experience,
        // Telemedicine Practice Guidelines 2020: the patient must see the
        // registration number of the doctor they are about to consult (audit M24).
        registrationNumber: doc.registrationNumber || null,
        consultationFee: doc.onlineConsultationFee || doc.consultationFees || 500,
        // The doctor's real rating, or null — it used to be a hard-coded 4.5.
        rating: doc.rating != null && Number(doc.totalReviews) > 0 ? Number(doc.rating) : null,
        totalReviews: Number(doc.totalReviews) || 0,
        languages: doc.languages || ['English'],
        isOnline: true,
        acceptsEmergency: true
      }));

    res.json({
      success: true,
      count: triageDoctors.length,
      doctors: triageDoctors,
      message: triageDoctors.length > 0 
        ? `${triageDoctors.length} doctor(s) available for instant emergency consultation`
        : 'No emergency doctors currently online. AI triage will continue to assist you.'
    });
  } catch (error) {
    merr("Triage doctors fetch error", { error: error?.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available triage doctors',
      doctors: []
    });
  }
});

/**
 * @route   POST /api/medical-ai/instant-triage-call
 * @desc    Create instant video call room with triage doctor
 *          EMERGENCY ENDPOINT - Optional auth (authenticated users get identity)
 *          Rate-limited: 3 calls per 15 minutes per IP/user
 *          Uses CREDIT SYSTEM - 1 free emergency consultation per user (pay later)
 * @access  Public (emergency - auth optional, rate-limited)
 */
router.post('/instant-triage-call', authUserOptional, emergencyTriageLimiter, async (req, res) => {
  try {
    const videoCredentials=resolveLiveKitCredentials();
    if (!videoCredentials.apiKey || !videoCredentials.apiSecret) return res.status(503).json({success:false,error:'Video consultation is unavailable; seek immediate medical care if urgent.'});
    const { doctorId, symptoms, urgencyLevel, triageId, paymentMethod, guestEmail, guestPhone, guestName } = req.body;
    const { Doctor, Appointment } = await import('../models/index.js');
    const { User } = await import('../models/user.model.intelligent.js');
    const crypto = await import('crypto');
    const guestIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    
    // Check if user is authenticated (optional for emergencies)
    let user = null;
    let userId = req.user?.id;
    
    // If unauthenticated, create temporary guest record
    if (!userId && guestEmail) {
      // Try to find user by email (in case they have account but aren't logged in)
      user = await User.findOne({ where: { email: guestEmail } });
      if (user) {
        userId = user.id;
      } else {
        // Create temporary guest emergency record
        mlog("Guest emergency call", { ip: guestIp });
        userId = null; // Will handle as guest user
      }
    } else if (userId) {
      // Find authenticated user
      user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
    } else {
      // Emergency without auth and without guest email - still allow but with restrictions
      mlog("Anonymous emergency call");
      userId = null;
    }
    
    // Credit checking only applies to registered users
    let canProceedWithHC = false;
    let hcWallet = null;
    let creditsUsed = 0;
    let creditLimit = 1;
    let pendingAmount = 0;
    // True when the consultation goes ahead on an unpaid balance: care first,
    // billing afterwards. Surfaced in the response so the client can show what
    // is owed without standing between the patient and the doctor.
    let billingDeferred = false;
    
    if (user) {
      // Check credits for authenticated users
      creditsUsed = user.emergencyTriageCreditsUsed || 0;
      creditLimit = user.emergencyTriageCreditLimit || 1;
      pendingAmount = parseFloat(user.emergencyTriagePendingAmount || 0);
      
      // Check if user wants to pay with Health Coins
      if (paymentMethod === 'hc' || (creditsUsed >= creditLimit && pendingAmount > 0)) {
        // Import UserWallet to check health coins balance
        const UserWallet = (await import('../models/postgres/user-wallet.model.postgres.js')).default;
        hcWallet = await UserWallet.findOne({ where: { userId: userId } });
        
        if (hcWallet) {
          const hcBalance = parseFloat(hcWallet.balance || 0);
          // Emergency consultation typically costs 500 INR = 50 HC (10:1 ratio)
          const hcRequired = 50;
          canProceedWithHC = hcBalance >= hcRequired;
        }
      }
      
      // An unpaid balance must NEVER withhold an emergency consultation.
      //
      // This used to return 402 Payment Required, so a signed-in patient with
      // a pending amount was refused an emergency doctor and told to top up
      // Health Coins first — while an unauthenticated stranger was waved
      // through, up to five a day. A patient in an emergency is the one person
      // who cannot be asked to settle an invoice, and the account telling us
      // they have used this before is the account most likely to need it again.
      //
      // The call proceeds; the fee is still recorded below, so the balance
      // stays accurate and billing can follow up afterwards.
      if (creditsUsed >= creditLimit && pendingAmount > 0 && !canProceedWithHC) {
        billingDeferred = true;
        mlog("Emergency proceeding with unpaid balance", {
          userId: user.id, pendingAmount, creditsUsed, creditLimit
        });
      }
    } else {
      // Guest users (unauthenticated) — allow but track by IP to prevent abuse
      mlog("Emergency guest access", { ip: guestIp });
      
      // Check how many guest emergency appointments were created from this IP in last 24h
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const guestCallsFromIp = await Appointment.count({
        where: {
          userId: null,
          sourceChannel: 'emergency_triage',
          createdAt: { [Op.gte]: oneDayAgo }
        }
      });
      
      // Hard limit: max 5 anonymous emergency calls per day total (prevents mass abuse)
      if (guestCallsFromIp > 5) {
        res.set('Retry-After', '86400'); // the window is a rolling day
        return res.status(429).json({
          success: false,
          error: 'Guest emergency limit reached',
          message: 'Too many anonymous emergency requests. Please create an account or sign in to continue.',
          loginRequired: true
        });
      }
    }
    
    // Find only doctors who are online AND have opted for emergency consultations
    let doctor;
    if (doctorId) {
      doctor = await Doctor.findOne({
        where: {
          id: doctorId,
          isOnline: true,
          isVerified: true,
          acceptsEmergencyCalls: true
        }
      });
    }
    
    // If no specific doctor or doctor not available, find any emergency-enabled doctor
    if (!doctor) {
      doctor = await Doctor.findOne({
        where: {
          isOnline: true,
          isVerified: true,
          acceptsEmergencyCalls: true
        },
        order: [['experience', 'DESC']]
      });
    }

    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: 'No emergency doctors available',
        aiTriageAvailable: true,
        message: 'No doctors with emergency consultation enabled are currently online. Continue with AI triage or try again later.'
      });
    }
    
    // Calculate consultation fee (for credit tracking)
    const consultationFee = parseFloat(doctor.onlineConsultationFee || doctor.consultationFees || 500);
    const isUsingCredit = !!user && creditsUsed < creditLimit && !paymentMethod;
    const isPayingWithHC = paymentMethod === 'hc' && canProceedWithHC;

    // Generate unique room ID for LiveKit
    const roomId = `triage_${crypto.randomBytes(8).toString('hex')}_${Date.now()}`;
    
    // Deduct Health Coins if paying with HC (only for authenticated users)
    if (isPayingWithHC && hcWallet && user) {
      const hcRequired = 50; // 500 INR = 50 HC
      const HealthCoinsTransaction = (await import('../models/postgres/health-coins-transaction.model.postgres.js')).default;
      
      await hcWallet.update({
        balance: parseFloat(hcWallet.balance) - hcRequired,
        totalSpent: parseFloat(hcWallet.totalSpent || 0) + hcRequired
      });
      
      await HealthCoinsTransaction.create({
        userId: user.id,
        type: 'SPEND',
        amount: hcRequired,
        description: `Emergency consultation with Dr. ${doctor.firstName} ${doctor.lastName}`,
        reference: `EMERGENCY_CONSULT`,
        balanceAfter: parseFloat(hcWallet.balance) - hcRequired
      });
      
      mlog("HC deducted", { userId: user.id, hc: hcRequired });
    }
    
    // Get patient info from user or request body (for guests)
    const patientId = user ? user.id : null;
    const patientName = user 
      ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Patient'
      : (guestName || 'Guest Patient');
    const patientEmail = user ? user.email : (guestEmail || '');
    const patientPhone = user ? (user.phoneNumber || '') : (guestPhone || '');
    
    // Create emergency appointment record with an RLS context that matches the
    // selected doctor/org. Guest calls have no patient identity, so doctorId is
    // the only guaranteed policy match when the doctor is independent.
    const appointmentOrgId = doctor.organization_id || doctor.tenantId || null;
    const appointmentTenantId = doctor.tenantId || null;
    const appointmentRlsUserId = user ? user.id : doctor.id;
    let appointment;
    let rlsTransaction;

    try {
      rlsTransaction = await postgresSequelize.transaction();
      await setRlsContext(rlsTransaction, {
        orgId: appointmentOrgId || appointmentTenantId || 0,
        userId: appointmentRlsUserId,
        isPlatformAdmin: false
      });

      appointment = await Appointment.create({
        userId: patientId, // NULL for guest users
        patientId: patientId, // NULL for guest users
        patientName: patientName,
        patientEmail: patientEmail,
        patientPhone: patientPhone || 'N/A',
        doctorId: doctor.id,
        doctorName: `${doctor.prefix || 'Dr.'} ${doctor.firstName} ${doctor.lastName}`,
        specialization: doctor.specialization,
        appointmentDate: new Date(),
        appointmentTime: new Date().toTimeString().slice(0, 5),
        status: 'confirmed',
        reason: `Emergency Triage: ${symptoms || 'Immediate consultation requested'}`,
        symptoms: Array.isArray(symptoms) ? symptoms : (symptoms ? [symptoms] : ['Emergency triage consultation']),
        notes: `Emergency Triage Request - Urgency: ${urgencyLevel || 'HIGH'} | Patient Type: ${user ? 'Registered' : 'Guest'} | Payment: ${isPayingWithHC ? 'HEALTH_COINS' : (isUsingCredit ? 'CREDIT (Pay Later)' : 'Pending')}`,
        notes_json: {
          triageId,
          urgencyLevel,
          symptoms,
          roomId,
          type: 'emergency_triage',
          handoff: { status: 'offered', offeredAt: new Date().toISOString() },
          initiatedAt: new Date().toISOString(),
          guestAccess: !user,
          paymentType: isPayingWithHC ? 'health_coins' : (isUsingCredit ? 'credit' : 'pending'),
          creditUsed: isUsingCredit,
          healthCoinsUsed: isPayingWithHC ? 50 : 0,
          consultationFee: consultationFee
        },
        consultationType: 'online',
        meetingId: roomId,
        paymentStatus: isPayingWithHC ? 'paid' : 'pending',
        paymentAmount: consultationFee,
        organization_id: appointmentOrgId,
        organization_type: doctor.organization_type || (appointmentOrgId ? 'clinic' : 'individual'),
        tenant_id: appointmentTenantId,
        sourceChannel: 'emergency_triage'
      }, { transaction: rlsTransaction });

      // Record the consultation against the account whenever it was not paid
      // for with Health Coins — both the free credit and a deferred-billing
      // call. Recording only the credit case left a deferred call untracked,
      // so care given on an unpaid balance never reached the balance.
      if ((isUsingCredit || billingDeferred) && user) {
        await User.update({
          emergencyTriageCreditsUsed: creditsUsed + 1,
          emergencyTriagePendingAmount: pendingAmount + consultationFee
        }, {
          where: { id: user.id },
          transaction: rlsTransaction
        });
        mlog("Emergency credit used", { userId: user.id });
      }

      await rlsTransaction.commit();
    } catch (appointmentError) {
      if (rlsTransaction) await rlsTransaction.rollback().catch(() => {});
      throw appointmentError;
    }

    // LiveKit URLs (tokenized when config is available)
    const livekitBaseUrl = process.env.LIVEKIT_MEET_URL || 'https://video.mediqzy.com';
    let patientJoinUrl = `${livekitBaseUrl}/rooms/${roomId}`;
    let doctorJoinUrl = `${livekitBaseUrl}/rooms/${roomId}`;
    let livekitJoinData = null;

    try {
      // Create unique identity for guest vs registered users
      const patientIdentity = user ? `user-${user.id}` : `guest-${appointment.id}`;
      const patientLivekit = await buildLiveKitJoinData({
        meetingId: roomId,
        identity: patientIdentity,
        name: patientName
      });
      const doctorLivekit = await buildLiveKitJoinData({
        meetingId: roomId,
        identity: `doctor-${doctor.id}`,
        name: `${doctor.prefix || 'Dr.'} ${doctor.firstName} ${doctor.lastName}`.trim()
      });

      patientJoinUrl = patientLivekit.joinUrl;
      doctorJoinUrl = doctorLivekit.joinUrl;
      livekitJoinData = {
        patient: patientLivekit,
        doctor: doctorLivekit
      };
    } catch (error) {
      mwarn("LiveKit token failed, using fallback", { error: error.message });
    }

    // Send real-time socket notification to doctor (WhatsApp-style call notification)
    try {
      const { emitTriageCallRequest } = await import('../chat/chathandler.controller.js');
      const callData = {
        appointmentId: appointment.id,
        roomId,
        patientId: patientId,
        patientName: patientName,
        patientPhone: patientPhone,
        patientType: user ? 'registered' : 'guest',
        symptoms: symptoms || 'Emergency consultation',
        urgencyLevel: urgencyLevel || 'HIGH',
        joinUrl: doctorJoinUrl,
        timestamp: new Date().toISOString(),
        status: 'pending'
      };
      
      const socketSent = emitTriageCallRequest(doctor.id, callData);
      mlog(socketSent ? "Socket notified doctor" : "Doctor not on socket");
    } catch (socketError) {
      mwarn("Socket notification failed", { error: socketError.message });
    }

    // Notify doctor via notification service (fallback)
    try {
      const notificationService = (await import('../services/notification.service.js')).default;
      await notificationService.send({
        userId: doctor.id,
        userType: 'doctor',
        type: 'video_ready',
        variables: {
          doctorName: `${doctor.firstName} ${doctor.lastName}`,
          patientName: patientName
        },
        data: {
          appointmentId: appointment.id,
          roomId,
          patientId: patientId,
          patientName: patientName,
          patientType: user ? 'registered' : 'guest',
          symptoms,
          urgencyLevel,
          joinUrl: doctorJoinUrl
        },
        channels: ['push', 'in-app']
      });
    } catch (notifyError) {
      mwarn("Doctor notification failed", { error: notifyError.message });
    }

    res.json({
      success: true,
      appointment: {
        id: appointment.id,
        status: appointment.status,
        handoffStatus: 'offered',
        type: 'emergency_triage'
      },
      doctor: {
        id: doctor.id,
        name: `${doctor.prefix || 'Dr.'} ${doctor.firstName} ${doctor.lastName}`,
        profileImage: doctor.profileImage,
        specialization: doctor.specialization
      },
      videoCall: patientVideoAccess({roomId,appointmentId:appointment.id,patientJoinUrl,livekitJoinData}),
      billing: {
        paymentType: isPayingWithHC ? 'health_coins' : (isUsingCredit ? 'credit' : 'pending'),
        consultationFee: consultationFee,
        creditUsed: isUsingCredit,
        healthCoinsUsed: isPayingWithHC ? 50 : 0,
        creditsRemaining: Math.max(0, creditLimit - (creditsUsed + (isUsingCredit ? 1 : 0))),
        pendingAmount: (isUsingCredit || billingDeferred) ? pendingAmount + consultationFee : pendingAmount,
        // The call was connected despite an unpaid balance; the client shows
        // what is owed afterwards, and never gates the consultation on it.
        billingDeferred,
        message: isPayingWithHC
          ? `Paid with 50 Health Coins for this consultation.`
          : (isUsingCredit
            ? `This consultation is on credit. Pay ₹${consultationFee} later.`
            : (billingDeferred
              ? `Connected now. ₹${(pendingAmount + consultationFee).toFixed(2)} is outstanding on your account and can be settled afterwards.`
              : 'Payment pending for this consultation.'))
      },
      message: `Consultation requested with ${doctor.prefix || 'Dr.'} ${doctor.firstName} ${doctor.lastName}. ${
        isPayingWithHC 
          ? 'Paid with Health Coins.' 
          : (isUsingCredit ? 'This emergency consultation is on credit - pay later.' : '')
      }`
    });
  } catch (error) {
    merr("Instant triage call error", { error: error?.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create instant consultation',
      aiTriageAvailable: true
    });
  }
});

/**
 * @route   POST /api/medical-ai/intent-escalation
 * @desc    Escalate emergency/appointment intents and notify on-call doctors
 * @access  Private
 */
router.post('/intent-escalation', authUser, async (req, res) => {
  try {
    const { intentType, message, keywords = [], specialization } = req.body;

    if (!intentType || !message) {
      return res.status(400).json({
        success: false,
        error: 'intentType and message are required'
      });
    }

    const escalationResult = await handleIntentEscalation({
      intentType,
      userId: req.user.id,
      message,
      keywords,
      specialization
    });

    res.json({
      success: true,
      ...escalationResult
    });
  } catch (error) {
    merr("Intent escalation error", { error: error?.message });
    res.status(500).json({
      success: false,
      error: 'Failed to escalate intent'
    });
  }
});

/**
 * @route   GET /api/medical-ai/health
 * @desc    Check Medical AI service health
 * @access  Public
 */

/**
 * @route   GET /api/medical-ai/languages
 * @desc    Supported languages for Dr. iSHA
 * @access  Public
 */
router.get('/languages', (_req, res) => {
  res.json({
    success: true,
    supported_languages: [
      { code: 'en', name: 'English',    nativeName: 'English'    },
      { code: 'hi', name: 'Hindi',      nativeName: 'हिंदी'        },
      { code: 'ta', name: 'Tamil',      nativeName: 'தமிழ்'       },
      { code: 'te', name: 'Telugu',     nativeName: 'తెలుగు'       },
      { code: 'kn', name: 'Kannada',    nativeName: 'ಕನ್ನಡ'       },
      { code: 'ml', name: 'Malayalam',  nativeName: 'മലയാളം'      },
      { code: 'gu', name: 'Gujarati',   nativeName: 'ગુજરાતી'      },
      { code: 'mr', name: 'Marathi',    nativeName: 'मराठी'        },
      { code: 'bn', name: 'Bengali',    nativeName: 'বাংলা'        },
      { code: 'pa', name: 'Punjabi',    nativeName: 'ਪੰਜਾਬੀ'       },
      { code: 'ur', name: 'Urdu',       nativeName: 'اردو'         },
    ],
    default: 'en',
    provider: 'sib-fastapi',
  });
});

router.get('/health', async (req, res) => {
  // BUG-03: report the WHOLE Dr. iSHA cascade, not just the SIB primary, so a
  // monitor/operator can see whether ANY provider can answer (and which are
  // unconfigured or circuit-open — i.e. is this a key/quota/endpoint problem).
  let primary = { status: 'unavailable', provider: 'sib-fastapi' };
  try {
    const r = await fetch(`${SIB_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      primary = { ...(await r.json().catch(() => ({}))), provider: 'sib-fastapi' };
    } else {
      primary.error = (await r.text().catch(() => '')) || `HTTP ${r.status}`;
    }
  } catch (error) {
    primary.error = error.message;
  }

  let providers = [];
  try {
    providers = (llmProvider.listProviders() || []).map((p) => {
      let circuitOpen = false;
      try { circuitOpen = llmProvider.isProviderCircuitOpen(p.name); } catch { /* not tracked */ }
      return { ...p, circuitOpen };
    });
  } catch { /* listProviders unavailable */ }

  // Usable if the primary is healthy OR any cascade provider is configured and
  // its circuit is closed.
  const usable = primary.status === 'healthy'
    || providers.some((p) => p.available && !p.circuitOpen);

  res.status(usable ? 200 : 503).json({
    status: usable ? 'healthy' : 'degraded',
    usable,
    primary,
    providers,
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   DELETE /api/medical-ai/session/:sessionId
 * @desc    Clear conversation session
 * @access  Private
 */
router.delete('/session/:sessionId', authUser, async (req, res) => {
  try {
    // Server-managed conversations are stored only here, not in Python history.
    await chatSessions.clear(req.params.sessionId, chatOwner(req));
    res.json({ success: true });
  } catch (error) {
    res.status(error.statusCode || 503).json({ success: false, error: error.statusCode ? error.message : 'Conversation store unavailable' });
  }
});
/**
 * @route   GET /api/medical-ai/session/:sessionId
 * @desc    Get session information
 * @access  Private
 */
router.get('/session/:sessionId', authUser, async (req, res) => {
  try {
    const subject = req.query.patientUid ? await resolveChatSubject(pool, req, req.query.patientUid, canAccessPatient) : null;
    const personal = req.query.useHealthHistory === 'true' || Boolean(subject);
    if (personal) await requireAIConsent(pool, subject?.id || req.user.id);
    const history = await chatSessions.load(req.params.sessionId, `${personal ? 'personal:' : ''}${chatOwner(req)}${subject ? `:subject:${subject.unique_id}` : ''}`);
    res.json({ success: true, sessionId: req.params.sessionId, history, count: history.length,
      conversationLength: Math.floor(history.length / 2), isActive: true });
  } catch (error) {
    res.status(error.statusCode || 503).json({ success: false, error: error.statusCode ? error.message : 'Conversation store unavailable' });
  }
});
/**
 * @route   POST /api/medical-ai/conversation-history
 * @desc    Get conversation history for user
 * @access  Private
 */
router.post('/conversation-history', authUser, async (req, res) => {
  try {
    const subject = req.body.patientUid ? await resolveChatSubject(pool, req, req.body.patientUid, canAccessPatient) : null;
    const personal = req.body.useHealthHistory === true || Boolean(subject);
    if (personal) await requireAIConsent(pool, subject?.id || req.user.id);
    const history = await chatSessions.load(req.body.sessionId, `${personal ? 'personal:' : ''}${chatOwner(req)}${subject ? `:subject:${subject.unique_id}` : ''}`);
    const limit = Number.isInteger(req.body.limit) ? Math.max(1, Math.min(30, req.body.limit)) : 10;
    const selected = history.slice(-limit);
    res.json({ success: true, sessionInfo: { sessionId: req.body.sessionId }, history: selected, count: selected.length });
  } catch (error) {
    res.status(error.statusCode || 503).json({ success: false, error: error.statusCode ? error.message : 'Conversation store unavailable' });
  }
});
/**
 * @route   POST /api/medical-ai/feedback
 * @desc    Submit feedback on AI response
 * @access  Private
 */
router.post('/feedback', authUser, feedbackLimiter, async (req,res) => {
  try {
    const {sessionId,rating,feedback='',useHealthHistory=false,patientUid}=req.body;
    if (!sessionId || !Number.isInteger(rating) || rating<1 || rating>5 || typeof feedback!=='string' || feedback.length>1000) return res.status(400).json({error:'Session and rating from 1 to 5 required'});
    const subject=patientUid ? await resolveChatSubject(pool,req,patientUid,canAccessPatient) : null;
    const personal=useHealthHistory===true||Boolean(subject);
    if(personal) await requireAIConsent(pool,subject?.id||req.user.id);
    const owner=`${personal?'personal:':''}${chatOwner(req)}${subject?`:subject:${subject.unique_id}`:''}`;
    await chatSessions.load(sessionId,owner);
    const record={rating,comment:feedback,actorUid:req.user.unique_id||null,role:req.userRole||req.user.role,recordedAt:new Date().toISOString()};
    const {rowCount}=await pool.query(`UPDATE chatbot_sessions SET metadata=jsonb_set(metadata,'{feedback}',COALESCE(metadata->'feedback','[]'::jsonb)||jsonb_build_array($3::jsonb)),updated_at=NOW()
      WHERE session_id=$1 AND owner_scope=$2 AND active AND expires_at>NOW() AND jsonb_array_length(COALESCE(metadata->'feedback','[]'::jsonb))<50`,[sessionId,owner,JSON.stringify(record)]);
    if(!rowCount) return res.status(409).json({error:'Feedback session expired or limit reached'});
    res.json({success:true,message:'Feedback recorded for review'});
  } catch(error) {res.status(error.statusCode||503).json({error:error.statusCode?error.message:'Feedback store unavailable'});}
});
/**
 * @route   GET /api/medical-ai/doctors
 * @desc    Get available doctors for booking (optionally filtered by specialization)
 * @access  Private
 */
router.get('/doctors', authUser, async (req, res) => {
  try {
    const { specialization, limit = 5 } = req.query;
    
    const doctors = await getDoctorSuggestions({
      specialization: specialization || null,
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      doctors,
      count: doctors.length,
      specialization: specialization || 'all'
    });
  } catch (error) {
    merr("Get doctors error", { error: error?.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve doctors'
    });
  }
});

/**
 * @route   GET /api/medical-ai/doctors/:doctorId/slots
 * @desc    Get available time slots for a doctor
 * @access  Private
 */
router.get('/doctors/:doctorId/slots', authUser, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;

    const doctor = await doctorModel.findByPk(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: 'Doctor not found'
      });
    }

    // Generate available slots based on doctor's availability
    const targetDate = date ? new Date(date) : new Date();
    const dayOfWeek = targetDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    
    // Get doctor's slot duration setting (default to 15 minutes)
    const slotDuration = parseInt(doctor.slotDuration) || 15;
    
    // Parse doctor's weekly schedule if available
    let weeklySchedule = null;
    try {
      weeklySchedule = doctor.weeklySchedule ? JSON.parse(doctor.weeklySchedule) : null;
    } catch (e) {
      mwarn("Doctor schedule parse error", { error: e.message });
    }
    
    // Generate slots based on doctor's configured slot duration
    const generateTimeSlots = (duration = 15) => {
      const slots = [];
      let morningStart = 9, morningEnd = 13; // 9 AM to 1 PM
      let afternoonStart = 14, afternoonEnd = 18; // 2 PM to 6 PM
      
      // Use doctor's schedule if available
      if (weeklySchedule && weeklySchedule[dayOfWeek] && !weeklySchedule[dayOfWeek].isOff) {
        const dayConfig = weeklySchedule[dayOfWeek];
        
        // Online slots
        if (dayConfig.online?.enabled) {
          const startParts = dayConfig.online.startTime.split(':').map(Number);
          const endParts = dayConfig.online.endTime.split(':').map(Number);
          morningStart = startParts[0];
          morningEnd = endParts[0];
        }
        
        // In-person slots (afternoon)
        if (dayConfig.inPerson?.enabled) {
          const startParts = dayConfig.inPerson.startTime.split(':').map(Number);
          const endParts = dayConfig.inPerson.endTime.split(':').map(Number);
          afternoonStart = startParts[0];
          afternoonEnd = endParts[0];
        }
      }
      
      // Generate morning slots
      for (let hour = morningStart; hour < morningEnd; hour++) {
        for (let min = 0; min < 60; min += duration) {
          const startTime = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
          const totalEndMin = min + duration;
          const endHour = hour + Math.floor(totalEndMin / 60);
          const endMin = totalEndMin % 60;
          if (endHour <= morningEnd) {
            const endTime = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
            slots.push(`${startTime}-${endTime}`);
          }
        }
      }
      
      // Generate afternoon slots
      for (let hour = afternoonStart; hour < afternoonEnd; hour++) {
        for (let min = 0; min < 60; min += duration) {
          const startTime = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
          const totalEndMin = min + duration;
          const endHour = hour + Math.floor(totalEndMin / 60);
          const endMin = totalEndMin % 60;
          if (endHour <= afternoonEnd) {
            const endTime = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
            slots.push(`${startTime}-${endTime}`);
          }
        }
      }
      return slots;
    };
    const defaultSlots = generateTimeSlots(slotDuration);

    // Check for existing appointments on this date
    const existingAppointments = await Appointment.findAll({
      where: {
        doctorId,
        appointmentDate: targetDate.toISOString().split('T')[0],
        status: ['pending', 'confirmed', 'scheduled']
      },
      attributes: ['appointmentTime']
    });

    const bookedTimes = existingAppointments.map(apt => apt.appointmentTime);
    const availableSlots = defaultSlots.filter(slot => {
      const slotStartTime = slot.split('-')[0];
      return !bookedTimes.includes(slotStartTime);
    });

    res.json({
      success: true,
      doctorId: parseInt(doctorId),
      doctorName: `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim(),
      date: targetDate.toISOString().split('T')[0],
      dayOfWeek,
      slotDuration,
      availableSlots,
      totalSlots: defaultSlots.length,
      bookedCount: bookedTimes.length
    });
  } catch (error) {
    merr("Get doctor slots error", { error: error?.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve available slots'
    });
  }
});

/**
 * @route   POST /api/medical-ai/book-appointment
 * @desc    Book an appointment through the chatbot
 * @access  Private
 */
router.post('/book-appointment', authUser, async (req, res) => {
  try {
    const { 
      doctorId, 
      appointmentDate, 
      timeSlot,
      consultationType = 'online',
      symptoms,
      notes,
      sessionId
    } = req.body;

    // Validate required fields
    if (!doctorId || !appointmentDate || !timeSlot) {
      return res.status(400).json({
        success: false,
        error: 'doctorId, appointmentDate, and timeSlot are required'
      });
    }

    // Get doctor details
    const doctor = await doctorModel.findByPk(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: 'Doctor not found'
      });
    }

    // Get patient details
    const patient = await User.findByPk(req.user.id);
    if (!patient) {
      return res.status(404).json({
        success: false,
        error: 'Patient not found'
      });
    }

    const canonicalStartTime = canonicalizeAppointmentTime(timeSlot.split('-')[0]);

    const doctorConflictResult = await checkDoctorConflict(doctorId, appointmentDate, canonicalStartTime);

    if (doctorConflictResult.conflict) {
      return res.status(409).json({
        success: false,
        error: 'This doctor is not available at the selected time. The time slot is already booked by another patient. Please choose another slot.',
        conflict: 'doctor_busy',
        aiResponse: `I'm sorry, but Dr. ${doctor.firstName} ${doctor.lastName} is not available at ${timeSlot} on ${new Date(appointmentDate).toLocaleDateString()}. That time slot is already booked by another patient. 😔\n\nWould you like me to show you other available time slots, or would you prefer to see other doctors?`
      });
    }

    const patientConflictResult = await checkPatientConflict(req.user.id, appointmentDate, canonicalStartTime);

    if (patientConflictResult.conflict) {
      const conflictDoctorName = patientConflictResult.conflictDoctorName || 'another doctor';
      const patientConflict = patientConflictResult.existingAppointment;

      return res.status(409).json({
        success: false,
        error: `You already have an appointment at ${timeSlot} on ${new Date(appointmentDate).toLocaleDateString()}. You cannot book multiple appointments at the same time.`,
        conflict: 'patient_busy',
        existingAppointment: {
          id: patientConflict.id,
          doctorName: conflictDoctorName,
          timeSlot: timeSlot,
          date: appointmentDate
        },
        aiResponse: `I noticed you already have an appointment scheduled at ${timeSlot} on ${new Date(appointmentDate).toLocaleDateString()} with ${conflictDoctorName}. 📅\n\nYou can only have one appointment at a time. Would you like to:\n\n1️⃣ Choose a different time slot\n2️⃣ Cancel your existing appointment first\n3️⃣ See your current appointments\n\nWhat would you prefer?`
      });
    }

    // Build doctor and patient names
    const doctorName = `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim() || 'Doctor';
    const patientName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Patient';
    const patientEmail = patient.email || 'unknown@example.com';
    const patientPhone = patient.phone || patient.phoneNumber || '0000000000';
    
    // Map consultation type to model enum (now only online/in-person)
    const consultationTypeMap = {
      'online': 'online',
      'video': 'online',
      'audio': 'online',
      'chat': 'online',
      'in-person': 'in-person',
      'walkIn': 'in-person',
      'inPerson': 'in-person'
    };

    // Create the appointment
    const appointment = await Appointment.create({
      userId: req.user.id,
      patientId: req.user.id, // Link patient for doctor queries
      patientName,
      patientEmail,
      patientPhone,
      doctorId,
      doctorName,
      specialization: doctor.specialization || 'General',
      appointmentDate,
      appointmentTime: canonicalStartTime,
      duration: 30,
      consultationType: consultationTypeMap[consultationType] || 'video',
      status: 'scheduled',
      consultationFee: doctor.consultationFee || doctor.fee || 500,
      paymentStatus: 'pending',
      symptoms: symptoms || '',
      notes: notes || `Booked via Dr. iSHA Chatbot${sessionId ? ` (Session: ${sessionId})` : ''}`
    });

    notifyCareTeamOfBooking({
      appointment,
      patient,
      doctor,
      bookingSource: 'medical-ai-chatbot'
    });

    // Generate a confirmation response from Dr. iSHA
    const confirmationMessage = `Great news! 🎉 I've successfully booked your appointment:\n\n` +
      `👨‍⚕️ **Doctor:** ${doctor.firstName || ''} ${doctor.lastName || ''}\n` +
      `📅 **Date:** ${new Date(appointmentDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n` +
      `⏰ **Time:** ${timeSlot}\n` +
      `💻 **Type:** ${consultationType.charAt(0).toUpperCase() + consultationType.slice(1)} Consultation\n\n` +
      `Your appointment ID is **#${appointment.id}**. You'll receive a confirmation notification shortly.\n\n` +
      `Is there anything else I can help you with? 😊`;

    res.json({
      success: true,
      message: 'Appointment booked successfully',
      appointment: {
        id: appointment.id,
        doctorId,
        doctorName: `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim(),
        specialization: doctor.specialization,
        patientName: `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
        appointmentDate,
        timeSlot,
        consultationType,
        status: 'pending'
      },
      aiResponse: confirmationMessage
    });
  } catch (error) {
    merr("Chatbot booking error", { error: error?.message });
    res.status(500).json({
      success: false,
      error: 'Failed to book appointment. Please try again.'
    });
  }
});

/**
 * @route   GET /api/medical-ai/my-appointments
 * @desc    Get user's appointments
 * @access  Private
 */
router.get('/my-appointments', authUser, async (req, res) => {
  try {
    const { status, limit = 10 } = req.query;

    const whereClause = { userId: req.user.id };
    if (status) {
      whereClause.status = status;
    }

    const appointments = await Appointment.findAll({
      where: whereClause,
      order: [['appointmentDate', 'DESC'], ['appointmentTime', 'DESC']],
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      appointments: appointments.map(apt => ({
        id: apt.id,
        doctorId: apt.doctorId,
        doctorName: apt.doctorName,
        specialization: apt.specialization || 'General',
        appointmentDate: apt.appointmentDate,
        appointmentTime: apt.appointmentTime,
        type: apt.consultationType,
        status: apt.status,
        symptoms: apt.symptoms
      })),
      count: appointments.length
    });
  } catch (error) {
    merr("Get appointments error", { error: error?.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve appointments'
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
//  PATIENT REPORT ANALYSIS (AI Vision for patients)
// ════════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/medical-ai/analyze-report
 * Patient-facing medical report analysis using Claude Vision
 * Accepts base64 image data (no file upload needed)
 */
router.post('/analyze-report', authUser, async (req, res) => {
  try {
    const { image, mimeType = 'image/jpeg', query = 'Analyze this medical report' } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, error: 'Image data (base64) is required' });
    }

    // Validate image size (max ~7MB base64 = ~5MB raw)
    if (image.length > 7 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'Image too large. Maximum 5MB.' });
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(mimeType)) {
      return res.status(400).json({ success: false, error: 'Invalid image format. Use JPEG, PNG, GIF, or WebP.' });
    }

    mlog("Report analysis started", { userId: req.user.id, mimeType });

    const patientPrompt = `You are a compassionate medical AI assistant helping a patient understand their medical report.

IMPORTANT GUIDELINES:
1. Explain findings in SIMPLE, patient-friendly language
2. Do NOT make definitive diagnoses
3. Highlight abnormal values clearly
4. Always recommend consulting a doctor for proper interpretation
5. Be reassuring but honest

Analyze this medical image/report and provide:

Return ONLY valid JSON (no markdown, no code blocks):
{
  "findings": "Clear, simple description of what the report shows",
  "assessment": "What this might mean in simple terms",
  "recommendations": ["actionable recommendation 1", "recommendation 2"],
  "urgency": "routine|soon|urgent|emergency",
  "keyValues": {
    "parameter name": {
      "value": "the value found",
      "status": "normal|borderline|abnormal|critical",
      "reference": "normal reference range"
    }
  },
  "summary": "One-paragraph plain-language summary for the patient"
}

Patient's question: ${query}`;

    let visionResult;
    try {
      visionResult = await llmProvider.vision({
        base64Image: image,
        mimeType,
        prompt: patientPrompt,
        maxTokens: 2000
      });
    } catch (visionError) {
      // A provider outage or an unreadable image is not a clinical finding.
      // Return a failure so clients cannot render "Routine / no concern" for
      // a report that was never analysed.
      mwarn('Report vision analysis unavailable', { error: visionError?.message, userId: req.user.id });
      return res.status(503).json({
        success: false,
        error: 'Report analysis is temporarily unavailable. Please retry or ask a clinician to review the report.',
        retryAfterSeconds: 30,
      });
    }

    let analysis = null;
    try {
      const responseText = visionResult.content || '';
      let cleanedText = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse JSON');
      }
    } catch (parseError) {
      const responseText = visionResult.content || '';
      analysis = {
        findings: responseText,
        assessment: 'See findings above for complete analysis',
        recommendations: ['Please consult with your doctor to discuss these findings'],
        urgency: 'routine',
        keyValues: {},
        summary: responseText.substring(0, 200)
      };
    }

    mlog("Report analysis complete", { userId: req.user.id });

    res.json({
      success: true,
      analysis: {
        findings: analysis.findings || '',
        assessment: analysis.assessment || '',
        recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations : [],
        urgency: analysis.urgency || 'routine',
        keyValues: analysis.keyValues || {},
        summary: analysis.summary || '',
        analyzedAt: new Date().toISOString(),
        model: visionResult.model || 'claude-3.5-sonnet',
        disclaimer: 'This AI analysis is for informational purposes only. Always consult a qualified healthcare professional for medical advice.'
      }
    });

  } catch (error) {
    merr("Report analysis error", { error: error?.message });
    res.status(500).json({
      success: false,
      error: 'Report analysis failed. Please try again.'
    });
  }
});

/**
 * POST /api/medical-ai/diet-plan
 * Dr. iSHA Bespoke Diet Recommendation
 * Uses the user's full health profile (conditions, allergies, family history,
 * medications, lifestyle) to generate a deeply personalised AI diet plan.
 */
router.post('/diet-plan', authUser, async (req, res) => {
  try {
    const {
      goal = 'maintenance',
      weight,
      height,
      age,
      gender,
      bmi,
      dailyCalories,
      dietaryPreference = 'balanced',
      cuisineRegion = 'north_indian',
      language = 'en'
    } = req.body;

    // Pull full profile from DB for deep personalisation
    const userRecord = await User.findByPk(req.user.id, {
      attributes: [
        'firstName', 'lastName', 'gender', 'dateOfBirth', 'weight', 'height',
        'bloodType', 'allergies', 'medications', 'chronicConditions',
        'medicalHistory', 'familyHistory', 'personalHistory'
      ]
    });

    if (!userRecord) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const u = userRecord.toJSON();

    // ── Build rich health profile string ──────────────────────────────────
    const profileParts = [];

    if (u.allergies?.length)         profileParts.push(`Food Allergies / Intolerances: ${u.allergies.join(', ')}`);
    if (u.medications?.length)       profileParts.push(`Current Medications: ${u.medications.join(', ')}`);
    if (u.chronicConditions?.length) profileParts.push(`Chronic Health Conditions: ${u.chronicConditions.join(', ')}`);
    if (u.bloodType)                 profileParts.push(`Blood Group: ${u.bloodType}`);

    // Family history
    const fh = u.familyHistory || {};
    const fhFlags = [];
    if (fh.diabetes)     fhFlags.push('Diabetes');
    if (fh.hypertension) fhFlags.push('Hypertension');
    if (fh.heartDisease) fhFlags.push('Heart Disease');
    if (fh.cancer)       fhFlags.push('Cancer');
    if (fh.stroke)       fhFlags.push('Stroke');
    if (fh.asthma)       fhFlags.push('Asthma');
    if (fh.thyroid)      fhFlags.push('Thyroid disorder');
    if (fh.mentalHealth) fhFlags.push('Mental Health condition');
    if (fh.kidney)       fhFlags.push('Kidney disease');
    if (fh.details)      fhFlags.push(fh.details);
    if (fhFlags.length)  profileParts.push(`Family Medical History: ${fhFlags.join(', ')}`);

    // Lifestyle
    const ph = u.personalHistory || {};
    const lifestyle = [];
    if (ph.smoking && ph.smoking !== 'never')    lifestyle.push(`Smoking: ${ph.smoking}`);
    if (ph.alcohol && ph.alcohol !== 'never')    lifestyle.push(`Alcohol: ${ph.alcohol}`);
    if (ph.exercise)                             lifestyle.push(`Exercise: ${ph.exercise}`);
    if (ph.sleep)                                lifestyle.push(`Sleep: ${ph.sleep}`);
    if (ph.stressLevel && ph.stressLevel !== 'low') lifestyle.push(`Stress level: ${ph.stressLevel}`);
    if (ph.occupation)                           lifestyle.push(`Occupation: ${ph.occupation}`);
    if (lifestyle.length)                        profileParts.push(`Lifestyle: ${lifestyle.join(', ')}`);

    const goalLabels = {
      weight_loss: 'Weight Loss', weight_gain: 'Weight Gain', maintenance: 'Weight Maintenance'
    };

    const prompt = `You are Dr. iSHA, an expert AI nutritionist and lifestyle physician at MySmart Health.

A patient needs a deeply personalised, bespoke dietary recommendation. Use ALL of their health data below to craft specific, actionable advice.

PATIENT HEALTH PROFILE:
- Name: ${u.firstName || 'Patient'}
- Age: ${age || 'unknown'} years | Gender: ${gender || u.gender || 'unknown'}
- Weight: ${weight || u.weight || 'unknown'} kg | Height: ${height || u.height || 'unknown'} cm | BMI: ${bmi || 'unknown'}
- Health Goal: ${goalLabels[goal] || goal}
- Daily Calorie Target: ${dailyCalories || 'to be determined'} kcal
- Dietary Preference: ${dietaryPreference} | Cuisine Region: ${cuisineRegion.replace(/_/g, ' ')}
${profileParts.length > 0 ? '\n' + profileParts.join('\n') : '\nNo additional health conditions on record.'}

Please provide:

1. **Dr. iSHA's Clinical Assessment** (2-3 sentences on the patient's health picture and dietary priorities)

2. **Condition-Specific Dietary Rules** (based on their conditions, medications, and family history — list key foods to AVOID and why)

3. **Priority Foods to Include** (specific to their conditions and cuisine preference — 8-10 items with brief reason)

4. **Weekly Meal Rhythm Guidance** (how to structure their week — e.g. intermittent fasting, meal timing, portion sizing for their specific profile)

5. **Supplement Considerations** (based on conditions and medications — note any deficiencies to watch for)

6. **Lifestyle & Dietary Caution Flags** (any specific warnings based on medication interactions, family history risk factors)

Keep advice practical, specific, and rooted in clinical nutrition principles. Be warm and encouraging as Dr. iSHA always is.`;

    // ── Call Dr. iSHA (SIB) ───────────────────────────────────────────────
    const sessionId = buildSessionId(req.user.id, "diet_plan");
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 40000);

    let sibResponse;
    try {
      sibResponse = await fetch(`${SIB_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          patient_id: sessionId,
          message: prompt,
          language,
          patient_data: {
            userId: req.user.id,
            channel: 'diet_plan',
            healthProfile: {
              allergies:         u.allergies,
              medications:       u.medications,
              chronicConditions: u.chronicConditions,
              familyHistory:     u.familyHistory,
              personalHistory:   u.personalHistory
            }
          }
        })
      });
    } catch (fetchError) {
      clearTimeout(timeoutHandle);
      if (fetchError.name === 'AbortError') {
        return res.status(504).json({ success: false, error: 'Dr. iSHA is taking too long. Please try again.' });
      }
      throw fetchError;
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (!sibResponse.ok) {
      const errText = await sibResponse.text().catch(() => '');
      return res.status(503).json({ success: false, error: 'Dr. iSHA service unavailable', details: errText });
    }

    const sibData = await sibResponse.json();
    const recommendation = sibData.response || sibData.chat_answer || sibData.message || sibData.text || sibData.answer || '';

    if (!recommendation) {
      return res.status(502).json({ success: false, error: 'Empty response from Dr. iSHA' });
    }

    // ── Build structured response ──────────────────────────────────────────
    const hasConditions = u.chronicConditions?.length > 0 || fhFlags.length > 0 || u.allergies?.length > 0;

    res.json({
      success: true,
      recommendation,
      healthProfile: {
        hasConditions,
        chronicConditions: u.chronicConditions || [],
        allergies:         u.allergies || [],
        medications:       u.medications || [],
        familyRiskFlags:   fhFlags,
        lifestyle: {
          exercise:    ph.exercise || null,
          stressLevel: ph.stressLevel || null,
          sleep:       ph.sleep || null
        }
      },
      meta: {
        model:     sibData.model || 'Dr. iSHA (SIB)',
        goal,
        bmi,
        dailyCalories,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    merr("Diet plan error", { error: error?.message });
    res.status(500).json({ success: false, error: 'Dr. iSHA diet recommendation failed. Please try again.' });
  }
});

/**
 * GET /api/medical-ai/health-summary
 * Returns a patient health summary aggregated from profile, appointments, and assessment data.
 */
router.get('/health-summary', authUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findByPk(userId, {
      attributes: [
        'id', 'firstName', 'lastName', 'gender', 'dateOfBirth',
        'weight', 'height', 'bloodType',
        'allergies', 'medications', 'chronicConditions',
        'medicalHistory', 'familyHistory'
      ]
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const u = user.toJSON ? user.toJSON() : user;

    // Compute age
    let age = null;
    if (u.dateOfBirth) {
      const dob = new Date(u.dateOfBirth);
      age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    }

    // Compute BMI
    let bmi = null;
    if (u.weight && u.height) {
      const hm = u.height / 100;
      bmi = parseFloat((u.weight / (hm * hm)).toFixed(1));
    }

    // Upcoming appointment count
    let upcomingAppointments = 0;
    try {
      const { Op } = await import('sequelize');
      upcomingAppointments = await Appointment.count({
        where: { patientId: userId, appointmentDate: { [Op.gte]: new Date() }, status: { [Op.notIn]: ['cancelled', 'completed'] } }
      });
    } catch (_) { /* non-critical */ }

    res.json({
      success: true,
      healthSummary: {
        profile: {
          name: [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Patient',
          age,
          gender: u.gender || null,
          bloodType: u.bloodType || null,
          weight: u.weight || null,
          height: u.height || null,
          bmi
        },
        conditions: {
          chronicConditions: u.chronicConditions || [],
          allergies: u.allergies || [],
          medications: u.medications || [],
          familyHistory: u.familyHistory || []
        },
        upcomingAppointments,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    merr("Health summary error", { error: error?.message });
    res.status(500).json({ success: false, error: 'Failed to generate health summary.' });
  }
});

/**
 * GET /api/medical-ai/nearby-hospitals?lat=&lng=&radius=
 *
 * The shipped mobile app's Find Hospital screen calls this and got a 404 — the
 * route never existed. It is a directory lookup over our own 10,645 geocoded
 * hospitals, not an AI endpoint; it lives here only because this is the path
 * the app asks for. Distances are real, so the screen can finally show them.
 */
router.get('/nearby-hospitals', authUser, async (req, res) => {
  try {
    const lat = Number(req.query.lat ?? req.query.latitude);
    const lng = Number(req.query.lng ?? req.query.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ success: false, message: 'Valid lat and lng are required.' });
    }
    const radiusMeters = Number(req.query.radius) > 0 ? Number(req.query.radius) : 10000;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const { nearbyFromDatabase } = await import('../services/nearby-places.service.js');
    const results = await nearbyFromDatabase(lat, lng, 'hospital', radiusMeters, limit);
    return res.json({
      success: true,
      count: results.length,
      hospitals: results.map((place) => ({
        name: place.name,
        address: place.vicinity,
        phone: place.formatted_phone_number || null,
        latitude: place.geometry.location.lat,
        longitude: place.geometry.location.lng,
        distanceKm: place.distance_km,
        rating: place.rating || null,
      })),
      // Google-Places-shaped alias, for callers that already parse that form.
      results,
    });
  } catch (error) {
    console.error('nearby-hospitals error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load nearby hospitals.' });
  }
});

export default router;
