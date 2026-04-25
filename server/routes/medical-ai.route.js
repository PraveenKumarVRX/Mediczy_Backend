import express from 'express';
import whatsAppUserContextService from '../services/whatsapp-user-context.service.js';
import { authUser, authUserOptional } from '../middleware/auth.middleware.js';
import { createRateLimiter } from '../middleware/rateLimiter.middleware.js';
import handleIntentEscalation, { getDoctorSuggestions } from '../services/intentEscalation.service.js';
import { Appointment } from '../models/appointment.model.intelligent.js';
import doctorModel from '../models/doctor.model.intelligent.js';
import { User } from '../models/user.model.intelligent.js';
import { buildLiveKitJoinData } from '../utils/videoProvider.js';
import llmProvider from '../services/ai-brain/llm-provider.js';

const router = express.Router();
const SIB_URL = process.env.SIB_URL || 'http://localhost:8001';
const SIB_DOCTOR_NAME = 'Dr. iSHA';

// Rate limiter for emergency triage calls — strict to prevent abuse
// 3 calls per 15 min per IP (unauthenticated) or per user (authenticated)
const emergencyTriageLimiter = createRateLimiter('api', {
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 3,
  message: 'Emergency call rate limit reached. Please wait before trying again.',
  skipSuccessfulRequests: false
});

const extractSibResponse = (sibData) => (
  sibData?.response
  || sibData?.primary_response
  || sibData?.chat_answer
  || sibData?.message
  || sibData?.result
);

const buildSibConsultation = (sibData, { sessionId, language }) => {
  const responseText = extractSibResponse(sibData);
  const payload = {
    success: true,
    response: responseText,
    primary_response: responseText,
    doctor: SIB_DOCTOR_NAME,
    sessionId,
    timestamp: new Date().toISOString(),
    language,
    provider: 'sib-fastapi',
    model: sibData?.model || 'SIB-Llama-3.1'
  };

  const confidence = sibData?.confidence ?? sibData?.ai_assessment?.confidence;
  if (typeof confidence === 'number') {
    payload.confidence = confidence;
  }

  return payload;
};

/**
 * @route   POST /api/medical-ai/test
 * @desc    Test medical AI functionality without authentication
 * @access  Public
 */
router.post('/test', async (req, res) => {
  try {
    const { query, language = 'en', userContext = {} } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Medical query is required'
      });
    }

    // Test user context
    const testSessionId = 'test_' + Date.now();
    const testUserContext = {
      userId: 'test-user-' + Date.now(),
      age: userContext.age || 30,
      gender: userContext.gender || 'unspecified',
      medicalHistory: userContext.medicalHistory || [],
      currentMedications: userContext.currentMedications || [],
      ...userContext
    };

    console.log('Testing Medical AI with query:', query);

    const sibResponse = await fetch(`${SIB_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_id: testSessionId,
        message: query,
        language,
        patient_data: testUserContext
      })
    });

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
    console.error('Medical AI test error:', error);
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
router.post('/consult', authUser, async (req, res) => {
  try {
    const { query, language = 'en', userContext = {}, sessionId: requestedSessionId } = req.body;
    const isEmergencyMode = Boolean(userContext?.emergencyMode);

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Medical query is required'
      });
    }

    // Use provided session ID if present to preserve memory
    const sessionId = requestedSessionId || userContext.sessionId || `mediczy_${req.user.id}`;

    let dbContext = null;
    if (!isEmergencyMode) {
      try {
        dbContext = await whatsAppUserContextService.getFullUserContextByUserId(req.user.id);
      } catch (contextError) {
        console.warn('⚠️ Failed to load user context for Dr. iSHA:', contextError.message);
      }
    }

    // Add user info to context
    const enhancedContext = {
      ...userContext,
      ...(dbContext || {}),
      userId: req.user.id,
      userName: req.user.firstName || 'Patient'
    };

    const timeoutMs = isEmergencyMode ? 15000 : 30000;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    let sibResponse;
    try {
      sibResponse = await fetch(`${SIB_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          patient_id: sessionId,
          message: query,
          language,
          patient_data: {
            ...enhancedContext,
            channel: 'web',
            patientData: dbContext || undefined
          }
        })
      });
    } catch (fetchError) {
      if (fetchError.name === 'AbortError') {
        return res.status(504).json({
          success: false,
          error: 'Consultation timed out. Please try a shorter message.',
          provider: 'sib-fastapi',
          timeoutMs
        });
      }
      throw fetchError;
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (!sibResponse.ok) {
      const errorText = await sibResponse.text().catch(() => '');
      return res.status(503).json({
        success: false,
        error: 'SIB request failed',
        details: errorText || `HTTP ${sibResponse.status}`,
        provider: 'sib-fastapi'
      });
    }

    const sibData = await sibResponse.json();
    const consultation = buildSibConsultation(sibData, {
      sessionId,
      language
    });

    if (!consultation.response) {
      return res.status(502).json({
        success: false,
        error: 'SIB response missing content',
        provider: 'sib-fastapi'
      });
    }

    res.json(consultation);
  } catch (error) {
    console.error('Medical consultation API error:', error);
    res.status(500).json({
      success: false,
      error: 'Medical consultation service temporarily unavailable'
    });
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
      return res.status(400).json({
        success: false,
        error: 'Symptoms array is required'
      });
    }

    const sessionId = req.body.sessionId || `mediczy_symptoms_${req.user.id}_${Date.now()}`;
    const symptomsText = Array.isArray(symptoms) ? symptoms.join(', ') : symptoms;
    const analysisPrompt = `I am experiencing the following symptoms: ${symptomsText}. ${description || ''}. Duration: ${duration || 'not specified'}. Severity: ${severity || 'moderate'}.`;

    const sibResponse = await fetch(`${SIB_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_id: sessionId,
        message: analysisPrompt,
        language,
        patient_data: {
          userId: req.user.id,
          symptoms,
          description,
          severity,
          duration
        }
      })
    });

    if (!sibResponse.ok) {
      const errorText = await sibResponse.text().catch(() => '');
      return res.status(503).json({
        success: false,
        error: 'SIB request failed',
        details: errorText || `HTTP ${sibResponse.status}`,
        provider: 'sib-fastapi'
      });
    }

    const sibData = await sibResponse.json();
    const analysis = buildSibConsultation(sibData, {
      sessionId,
      language
    });

    if (!analysis.response) {
      return res.status(502).json({
        success: false,
        error: 'SIB response missing content',
        provider: 'sib-fastapi'
      });
    }

    res.json({
      ...analysis,
      symptoms,
      description,
      severity,
      duration
    });
  } catch (error) {
    console.error('Symptom analysis API error:', error);
    res.status(500).json({
      success: false,
      error: 'Symptom analysis service temporarily unavailable'
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
    const { symptoms, description, language = 'en', multimodalContext } = req.body;

    if (!symptoms || !description) {
      return res.status(400).json({
        success: false,
        error: 'Symptoms and description are required for emergency triage'
      });
    }

    let triage;
    let sibUsed = false;

    // Build emergency triage prompt for SIB /chat endpoint
    const emergencyPrompt = `EMERGENCY TRIAGE REQUEST:

Symptoms: ${symptoms}
Description: ${description}

Please provide an emergency triage assessment including:
1. Urgency level (CRITICAL, HIGH, MODERATE, LOW)
2. Whether immediate medical attention is required
3. Whether to call an ambulance
4. Recommended actions while waiting for help
5. Any follow-up questions to assess severity`;

    const sibResponse = await fetch(`${SIB_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: emergencyPrompt,
        language,
        patient_id: String(req.user.id),
        user_id: req.user.id,
        include_risk: true,
        context_type: 'emergency_triage'
      })
    });

    if (!sibResponse.ok) {
      const errorText = await sibResponse.text().catch(() => '');
      return res.status(503).json({
        success: false,
        error: 'SIB request failed',
        details: errorText || `HTTP ${sibResponse.status}`,
        provider: 'sib-fastapi'
      });
    }

    const sibResult = await sibResponse.json();
    sibUsed = true;
    
    // Parse urgency from response (look for keywords)
    const responseText = sibResult.response || sibResult.primary_response || sibResult.chat_answer || '';
    const urgencyKeywords = {
      'CRITICAL': /\b(critical|life.?threatening|call.?911|call.?ambulance|immediate.?emergency)\b/i,
      'HIGH': /\b(high.?urgency|urgent|seek.?immediate|emergency.?room|ER)\b/i,
      'MODERATE': /\b(moderate|see.?doctor|within.?24|schedule.?appointment)\b/i,
      'LOW': /\b(low.?urgency|monitor|self.?care|rest)\b/i
    };
    
    let detectedUrgency = 'HIGH'; // Default to HIGH for safety
    for (const [level, pattern] of Object.entries(urgencyKeywords)) {
      if (pattern.test(responseText)) {
        detectedUrgency = level;
        break;
      }
    }
    
    const requiresImmediate = ['CRITICAL', 'HIGH'].includes(detectedUrgency);
    const callAmbulance = detectedUrgency === 'CRITICAL' || /\b(call.?911|call.?ambulance|emergency.?services)\b/i.test(responseText);
    
    // Map SIB response to triage format
    triage = {
      success: true,
      urgencyLevel: detectedUrgency,
      urgencyDetails: {
        level: detectedUrgency,
        reason: `Based on symptoms: ${symptoms}`,
        actions: requiresImmediate ? ['Seek immediate medical attention'] : ['Monitor symptoms', 'Consult doctor if worsening']
      },
      response: responseText,
      requiresImmediateAttention: requiresImmediate,
      callAmbulance: callAmbulance,
      recommendedActions: requiresImmediate 
        ? ['Seek immediate medical attention', 'Do not drive yourself if feeling faint']
        : ['Monitor your symptoms', 'Stay hydrated', 'Rest', 'Consult a doctor if symptoms persist'],
      followUpQuestions: [],
      triageId: `triage_${Date.now()}_${req.user.id}`,
      sibUsed: true,
      processingTime: sibResult.processing_time_ms || null
    };

    // Log emergency triage attempts for audit
    console.log(`🚨 Emergency triage requested by user ${req.user.id}:`, {
      symptoms,
      description,
      urgencyLevel: triage.urgencyLevel,
      sibUsed,
      timestamp: new Date().toISOString()
    });

    res.json(triage);
  } catch (error) {
    console.error('Emergency triage API error:', error);
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
    
    console.log(`🚨 EMERGENCY SOS from user ${userId}:`, {
      reason,
      urgencyLevel,
      location,
      visionAnalysis: visionAnalysis ? {
        distressLevel: visionAnalysis.distressLevel,
        consciousnessLevel: visionAnalysis.consciousnessLevel
      } : null,
      timestamp: new Date().toISOString()
    });

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
          console.error('Push notification to doctor failed:', pushError.message);
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
          console.error('Email to doctor failed:', emailError.message);
        }
      }
    } catch (doctorError) {
      console.error('Doctor notification error:', doctorError.message);
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
          console.error('Organization lookup skipped:', orgError.message);
        }
      }

      // 3. Notify HR (if user has HR contact via organization - future feature)
      if (false) {
        try {
          // Placeholder for HR notification when organization HR contacts are implemented
          notifiedContacts.push({ type: 'hr', name: 'HR Department', method: 'email' });
        } catch (hrError) {
          console.error('HR notification error:', hrError.message);
        }
      }
    } catch (orgError) {
      console.error('Organization/HR notification error:', orgError.message);
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
          console.error(`Contact ${contact.name} notification error:`, contactError.message);
        }
      }
    }

    // Log SOS event for audit
    console.log(`✅ SOS notifications sent:`, {
      userId,
      notifiedCount: notifiedContacts.length,
      contacts: notifiedContacts,
      errors
    });

    res.json({
      success: true,
      message: `Emergency SOS sent to ${notifiedContacts.length} contact(s)`,
      notifiedContacts,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Emergency SOS API error:', error);
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
        'specialization', 'qualifications', 'experience',
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
        consultationFee: doc.onlineConsultationFee || doc.consultationFees || 500,
        rating: 4.5, // Default rating
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
    console.error('Triage doctors fetch error:', error);
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
    const { doctorId, symptoms, urgencyLevel, triageId, paymentMethod, guestEmail, guestPhone, guestName } = req.body;
    const { Doctor, Appointment } = await import('../models/index.js');
    const { User } = await import('../models/user.model.intelligent.js');
    const crypto = await import('crypto');
    
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
        console.log(`📱 Emergency call from unregistered (guest): ${guestEmail}`);
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
      console.log('⚠️ Emergency call from completely anonymous user');
      userId = null;
    }
    
    // Credit checking only applies to registered users
    let canProceedWithHC = false;
    let hcWallet = null;
    let creditsUsed = 0;
    let creditLimit = 1;
    let pendingAmount = 0;
    
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
      
      // Check if user has already used their emergency credit and hasn't paid AND doesn't have HC
      if (creditsUsed >= creditLimit && pendingAmount > 0 && !canProceedWithHC) {
        return res.status(402).json({
          success: false,
          error: 'Emergency credit exhausted',
          message: `You have already used your ${creditLimit} free emergency consultation. Please pay your pending amount of ₹${pendingAmount.toFixed(2)} or use Health Coins to continue.`,
          pendingAmount: pendingAmount,
          paymentRequired: true,
          hcAvailable: hcWallet ? parseFloat(hcWallet.balance || 0) : 0,
          hcRequired: 50
        });
      }
    } else {
      // Guest users (unauthenticated) — allow but track by IP to prevent abuse
      const guestIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
      console.log(`⚠️ Emergency access for guest user from IP: ${guestIp}`);
      
      // Check how many guest emergency appointments were created from this IP in last 24h
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const guestCallsFromIp = await Appointment.count({
        where: {
          userId: null,
          sourceChannel: 'emergency_triage',
          createdAt: { [Symbol.for('gte')]: oneDayAgo }
        }
      });
      
      // Hard limit: max 5 anonymous emergency calls per day total (prevents mass abuse)
      if (guestCallsFromIp > 5) {
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
    const isUsingCredit = creditsUsed < creditLimit && !paymentMethod;
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
      
      console.log(`✅ Deducted ${hcRequired} HC from user ${user.id} for emergency consultation`);
    }
    
    // Get patient info from user or request body (for guests)
    const patientId = user ? user.id : null;
    const patientName = user 
      ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Patient'
      : (guestName || 'Guest Patient');
    const patientEmail = user ? user.email : (guestEmail || '');
    const patientPhone = user ? (user.phoneNumber || '') : (guestPhone || '');
    
    // Create emergency appointment record with credit/pay-later flag
    const appointment = await Appointment.create({
      userId: patientId, // NULL for guest users
      patientId: patientId, // NULL for guest users
      patientName: patientName,
      patientEmail: patientEmail,
      patientPhone: patientPhone,
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
        initiatedAt: new Date().toISOString(),
        guestAccess: !user,
        paymentType: isPayingWithHC ? 'health_coins' : (isUsingCredit ? 'credit' : 'pending'),
        creditUsed: isUsingCredit && user ? true : false,
        healthCoinsUsed: isPayingWithHC ? 50 : 0,
        consultationFee: consultationFee
      },
      consultationType: 'video',
      meetingId: roomId,
      paymentStatus: isPayingWithHC ? 'paid' : (isUsingCredit ? 'credit' : 'pending'),
      paymentAmount: consultationFee,
      sourceChannel: 'emergency_triage'
    });
    
    // Update user's emergency credit usage if using credit (only for authenticated users)
    if (isUsingCredit && user) {
      await User.update({
        emergencyTriageCreditsUsed: creditsUsed + 1,
        emergencyTriagePendingAmount: pendingAmount + consultationFee
      }, {
        where: { id: user.id }
      });
      console.log(`✅ Emergency credit used for user ${user.id}. Credits: ${creditsUsed + 1}/${creditLimit}, Pending: ₹${(pendingAmount + consultationFee).toFixed(2)}`);
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
      console.warn('LiveKit token generation failed, falling back to meet URL:', error.message);
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
      console.log(socketSent ? '✅ Socket notification sent to doctor' : '⚠️ Doctor not connected to socket');
    } catch (socketError) {
      console.warn('Socket notification failed:', socketError.message);
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
      console.warn('Doctor notification failed:', notifyError.message);
    }

    res.json({
      success: true,
      appointment: {
        id: appointment.id,
        status: 'in_progress',
        type: 'emergency_triage'
      },
      doctor: {
        id: doctor.id,
        name: `${doctor.prefix || 'Dr.'} ${doctor.firstName} ${doctor.lastName}`,
        profileImage: doctor.profileImage,
        specialization: doctor.specialization
      },
      videoCall: {
        roomId,
        appointmentId: appointment.id,
        joinUrl: patientJoinUrl,
        patientJoinUrl,
        doctorJoinUrl,
        platform: 'LiveKit',
        livekit: livekitJoinData
      },
      billing: {
        paymentType: isPayingWithHC ? 'health_coins' : (isUsingCredit ? 'credit' : 'pending'),
        consultationFee: consultationFee,
        creditUsed: isUsingCredit,
        healthCoinsUsed: isPayingWithHC ? 50 : 0,
        creditsRemaining: Math.max(0, creditLimit - (creditsUsed + (isUsingCredit ? 1 : 0))),
        pendingAmount: isUsingCredit ? pendingAmount + consultationFee : pendingAmount,
        message: isPayingWithHC 
          ? `Paid with 50 Health Coins for this consultation.`
          : (isUsingCredit 
            ? `This consultation is on credit. Pay ₹${consultationFee} later.`
            : 'Payment pending for this consultation.')
      },
      message: `Connecting you with ${doctor.prefix || 'Dr.'} ${doctor.firstName} ${doctor.lastName}. ${
        isPayingWithHC 
          ? 'Paid with Health Coins.' 
          : (isUsingCredit ? 'This emergency consultation is on credit - pay later.' : '')
      }`
    });
  } catch (error) {
    console.error('Instant triage call error:', error);
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
    console.error('Intent escalation error:', error);
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
router.get('/health', async (req, res) => {
  try {
    const sibResponse = await fetch(`${SIB_URL}/health`);
    if (!sibResponse.ok) {
      const errorText = await sibResponse.text().catch(() => '');
      return res.status(503).json({
        status: 'unavailable',
        provider: 'sib-fastapi',
        error: errorText || `HTTP ${sibResponse.status}`,
        timestamp: new Date().toISOString()
      });
    }

    const sibHealth = await sibResponse.json();
    const statusCode = sibHealth.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json({
      ...sibHealth,
      provider: 'sib-fastapi'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   DELETE /api/medical-ai/session/:sessionId
 * @desc    Clear conversation session
 * @access  Private
 */
router.delete('/session/:sessionId', authUser, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Verify session belongs to user
    if (!sessionId.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to clear this session'
      });
    }

    const sibResponse = await fetch(`${SIB_URL}/chat/history/${sessionId}`, {
      method: 'DELETE'
    });

    if (!sibResponse.ok) {
      const errorText = await sibResponse.text().catch(() => '');
      return res.status(503).json({
        success: false,
        error: 'SIB request failed',
        details: errorText || `HTTP ${sibResponse.status}`,
        provider: 'sib-fastapi'
      });
    }

    res.json({
      success: true,
      message: 'Session cleared',
      sessionId,
      provider: 'sib-fastapi'
    });
  } catch (error) {
    console.error('Clear session API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear session'
    });
  }
});

/**
 * @route   GET /api/medical-ai/session/:sessionId
 * @desc    Get session information
 * @access  Private
 */
router.get('/session/:sessionId', authUser, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Verify session belongs to user
    if (!sessionId.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to access this session'
      });
    }

    const sibResponse = await fetch(`${SIB_URL}/chat/history/${sessionId}`);
    if (!sibResponse.ok) {
      const errorText = await sibResponse.text().catch(() => '');
      return res.status(503).json({
        success: false,
        error: 'SIB request failed',
        details: errorText || `HTTP ${sibResponse.status}`,
        provider: 'sib-fastapi'
      });
    }

    const sibData = await sibResponse.json();
    const history = sibData.history || [];
    const lastEntry = history[history.length - 1] || null;

    res.json({
      sessionId,
      conversationLength: Math.floor(history.length / 2),
      isActive: history.length > 0,
      provider: 'sib-fastapi',
      lastIntent: null,
      lastInteractionAt: lastEntry?.timestamp || null
    });
  } catch (error) {
    console.error('Get session API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve session information'
    });
  }
});

/**
 * @route   POST /api/medical-ai/conversation-history
 * @desc    Get conversation history for user
 * @access  Private
 */
router.post('/conversation-history', authUser, async (req, res) => {
  try {
    const { sessionId, limit = 10 } = req.body;
    const historyUrl = new URL(`${SIB_URL}/chat/history/${sessionId}`);
    if (limit) {
      historyUrl.searchParams.set('last_n', String(limit));
    }

    const sibResponse = await fetch(historyUrl.toString());
    if (!sibResponse.ok) {
      const errorText = await sibResponse.text().catch(() => '');
      return res.status(503).json({
        success: false,
        error: 'SIB request failed',
        details: errorText || `HTTP ${sibResponse.status}`,
        provider: 'sib-fastapi'
      });
    }

    const sibData = await sibResponse.json();
    const history = sibData.history || [];
    const lastEntry = history[history.length - 1] || null;

    res.json({
      success: true,
      sessionInfo: {
        sessionId,
        conversationLength: Math.floor(history.length / 2),
        isActive: history.length > 0,
        provider: 'sib-fastapi',
        lastIntent: null,
        lastInteractionAt: lastEntry?.timestamp || null
      },
      history,
      count: history.length,
      message: 'Conversation history retrieved successfully'
    });
  } catch (error) {
    console.error('Conversation history API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve conversation history'
    });
  }
});

/**
 * @route   POST /api/medical-ai/feedback
 * @desc    Submit feedback on AI response
 * @access  Private
 */
router.post('/feedback', authUser, async (req, res) => {
  try {
    const { sessionId, rating, feedback, responseHelpful } = req.body;

    // Log feedback for improvement
    console.log(`📝 Medical AI feedback from user ${req.user.id}:`, {
      sessionId,
      rating,
      feedback,
      responseHelpful,
      timestamp: new Date().toISOString()
    });

    // In production, store this in database for AI improvement
    res.json({
      success: true,
      message: 'Feedback submitted successfully'
    });
  } catch (error) {
    console.error('Feedback API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit feedback'
    });
  }
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
    console.error('Get doctors API error:', error);
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
      console.warn('Could not parse doctor weekly schedule:', e.message);
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
    console.error('Get doctor slots API error:', error);
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

    // Parse time slot
    const [startTime] = timeSlot.split('-');
    
    // Check if doctor has an appointment at this time (prevent doctor double-booking)
    const doctorConflict = await Appointment.findOne({
      where: {
        doctorId,
        appointmentDate,
        appointmentTime: startTime,
        status: ['scheduled', 'confirmed', 'pending', 'accepted', 'in-progress']
      }
    });

    if (doctorConflict) {
      return res.status(409).json({
        success: false,
        error: 'This doctor is not available at the selected time. The time slot is already booked by another patient. Please choose another slot.',
        conflict: 'doctor_busy',
        aiResponse: `I'm sorry, but Dr. ${doctor.firstName} ${doctor.lastName} is not available at ${timeSlot} on ${new Date(appointmentDate).toLocaleDateString()}. That time slot is already booked by another patient. 😔\n\nWould you like me to show you other available time slots, or would you prefer to see other doctors?`
      });
    }

    // Check if patient has an appointment at this time (prevent patient double-booking)
    const patientConflict = await Appointment.findOne({
      where: {
        userId: req.user.id,
        appointmentDate,
        appointmentTime: startTime,
        status: ['scheduled', 'confirmed', 'pending', 'accepted', 'in-progress']
      }
    });

    if (patientConflict) {
      const conflictDoctor = await doctorModel.findByPk(patientConflict.doctorId, {
        attributes: ['firstName', 'lastName', 'specialization', 'prefix']
      });
      const conflictDoctorName = conflictDoctor 
        ? `${conflictDoctor.prefix || 'Dr.'} ${conflictDoctor.firstName} ${conflictDoctor.lastName}`
        : 'another doctor';

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
      appointmentTime: startTime,
      duration: 30,
      consultationType: consultationTypeMap[consultationType] || 'video',
      status: 'scheduled',
      consultationFee: doctor.consultationFee || doctor.fee || 500,
      paymentStatus: 'pending',
      symptoms: symptoms || '',
      notes: notes || `Booked via Dr. iSHA Chatbot${sessionId ? ` (Session: ${sessionId})` : ''}`
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
    console.error('Chatbot booking API error:', error);
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
    console.error('Get appointments API error:', error);
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

    console.log(`[Patient Report Analysis] User ${req.user.id} - ${mimeType} - ${Math.round(image.length / 1024)}KB`);

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
      // Graceful fallback if vision provider is unavailable
      return res.json({
        success: true,
        analysis: {
          findings: 'AI Vision service is being configured. Please use the in-app camera analysis or try again shortly.',
          assessment: 'Service temporarily limited',
          recommendations: ['Please try again in a few minutes', 'You can also consult with a doctor for report interpretation'],
          urgency: 'routine',
          keyValues: {}
        }
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

    console.log(`[Patient Report Analysis] ✅ Complete for user ${req.user.id}`);

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
    console.error('[Patient Report Analysis] ❌ Error:', error);
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
    const sessionId = `diet_plan_${req.user.id}_${Date.now()}`;
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
    console.error('[Dr. iSHA Diet Plan] ❌ Error:', error);
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
    console.error('[Health Summary] ❌ Error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate health summary.' });
  }
});

export default router;

