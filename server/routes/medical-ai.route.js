import express from 'express';
import medicalAIService from '../services/medicalAI.service.js';
import { authUser } from '../middleware/auth.middleware.js';
import handleIntentEscalation, { getDoctorSuggestions } from '../services/intentEscalation.service.js';
import { Appointment } from '../models/appointment.model.intelligent.js';
import doctorModel from '../models/doctor.model.intelligent.js';
import { User } from '../models/user.model.intelligent.js';

const router = express.Router();

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

    const response = await medicalAIService.consultMedical(
      query,
      testSessionId,
      language,
      testUserContext
    );

    res.json({
      success: true,
      data: response,
      test: true,
      timestamp: new Date().toISOString()
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
    const { query, language = 'en', userContext = {} } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Medical query is required'
      });
    }

    // Generate session ID based on user ID
    const sessionId = `mediczy_${req.user.id}_${Date.now()}`;

    // Add user info to context
    const enhancedContext = {
      ...userContext,
      userId: req.user.id,
      userName: req.user.firstName || 'Patient'
    };

    const consultation = await medicalAIService.consultMedical(
      query,
      sessionId,
      language,
      enhancedContext
    );

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

    const sessionId = `mediczy_symptoms_${req.user.id}_${Date.now()}`;

    const analysis = await medicalAIService.analyzeSymptoms(
      symptoms,
      description || '',
      sessionId,
      language,
      { severity, duration }
    );

    res.json(analysis);
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

    // Try SIB first for centralized triage
    const SIB_URL = process.env.SIB_URL || 'http://localhost:8001';
    let triage;
    let sibUsed = false;

    try {
      const sibResponse = await fetch(`${SIB_URL}/emergency-triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symptoms,
          description,
          language,
          patient_id: req.user.id,
          patient_data: {
            patient_id: req.user.id,
            name: `${req.user.firstName || 'Patient'} ${req.user.lastName || ''}`.trim(),
            age: req.user.age || null,
            gender: req.user.gender || null,
            conditions: req.user.medicalConditions || null
          },
          multimodal_context: multimodalContext || null
        })
      });

      if (sibResponse.ok) {
        const sibResult = await sibResponse.json();
        sibUsed = true;
        
        // Map SIB response to existing format
        triage = {
          success: true,
          urgencyLevel: sibResult.urgency_level,
          urgencyDetails: sibResult.urgency_details,
          response: sibResult.ai_assessment?.response || sibResult.response,
          requiresImmediateAttention: sibResult.requires_immediate_attention,
          callAmbulance: sibResult.call_ambulance,
          recommendedActions: sibResult.recommended_actions || sibResult.urgency_details?.actions,
          followUpQuestions: sibResult.follow_up_questions || [],
          triageId: sibResult.triage_id,
          sibUsed: true,
          processingTime: sibResult.processing_time_ms
        };
      }
    } catch (sibError) {
      console.warn('SIB emergency triage fallback:', sibError.message);
    }

    // Fallback to local medicalAIService if SIB fails
    if (!sibUsed) {
      const sessionId = `mediczy_emergency_${req.user.id}_${Date.now()}`;
      const localResult = await medicalAIService.emergencyTriage(
        symptoms,
        description,
        sessionId,
        language,
        {
          userId: req.user.id,
          userName: `${req.user.firstName || 'Patient'} ${req.user.lastName || ''}`.trim(),
          intentType: 'emergency'
        }
      );
      triage = {
        ...localResult,
        sibUsed: false
      };
    }

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
 *          Uses CREDIT SYSTEM - 1 free emergency consultation per user (pay later)
 * @access  Private
 */
router.post('/instant-triage-call', authUser, async (req, res) => {
  try {
    const { doctorId, symptoms, urgencyLevel, triageId } = req.body;
    const { Doctor, Appointment } = await import('../models/index.js');
    const { User } = await import('../models/user.model.intelligent.js');
    const crypto = await import('crypto');
    
    // Check user's emergency triage credit
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const creditsUsed = user.emergencyTriageCreditsUsed || 0;
    const creditLimit = user.emergencyTriageCreditLimit || 1;
    const pendingAmount = parseFloat(user.emergencyTriagePendingAmount || 0);
    
    // Check if user has already used their emergency credit and hasn't paid
    if (creditsUsed >= creditLimit && pendingAmount > 0) {
      return res.status(402).json({
        success: false,
        error: 'Emergency credit exhausted',
        message: `You have already used your ${creditLimit} free emergency consultation. Please pay your pending amount of ₹${pendingAmount.toFixed(2)} before requesting another emergency consultation.`,
        pendingAmount: pendingAmount,
        paymentRequired: true
      });
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
    const isUsingCredit = creditsUsed < creditLimit;

    // Generate unique room ID for LiveKit
    const roomId = `triage_${crypto.randomBytes(8).toString('hex')}_${Date.now()}`;
    
    // Create emergency appointment record with credit/pay-later flag
    const appointment = await Appointment.create({
      userId: req.user.id,
      patientName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Patient',
      patientEmail: req.user.email,
      patientPhone: req.user.phoneNumber || '',
      doctorId: doctor.id,
      doctorName: `${doctor.prefix || 'Dr.'} ${doctor.firstName} ${doctor.lastName}`,
      specialization: doctor.specialization,
      appointmentDate: new Date(),
      appointmentTime: new Date().toTimeString().slice(0, 5),
      status: 'confirmed',
      reason: `Emergency Triage: ${symptoms || 'Immediate consultation requested'}`,
      symptoms: Array.isArray(symptoms) ? symptoms : (symptoms ? [symptoms] : ['Emergency triage consultation']),
      notes: `Emergency Triage Request - Urgency: ${urgencyLevel || 'HIGH'} | Payment: ${isUsingCredit ? 'CREDIT (Pay Later)' : 'Pending'}`,
      notes_json: {
        triageId,
        urgencyLevel,
        symptoms,
        roomId,
        type: 'emergency_triage',
        initiatedAt: new Date().toISOString(),
        paymentType: isUsingCredit ? 'credit' : 'pending',
        creditUsed: isUsingCredit,
        consultationFee: consultationFee
      },
      consultationType: 'video',
      meetingId: roomId,
      paymentStatus: isUsingCredit ? 'credit' : 'pending',
      paymentAmount: consultationFee,
      sourceChannel: 'emergency_triage'
    });
    
    // Update user's emergency credit usage if using credit
    if (isUsingCredit) {
      await User.update({
        emergencyTriageCreditsUsed: creditsUsed + 1,
        emergencyTriagePendingAmount: pendingAmount + consultationFee
      }, {
        where: { id: req.user.id }
      });
      console.log(`✅ Emergency credit used for user ${req.user.id}. Credits: ${creditsUsed + 1}/${creditLimit}, Pending: ₹${(pendingAmount + consultationFee).toFixed(2)}`);
    }

    // LiveKit URL
    const livekitBaseUrl = process.env.LIVEKIT_MEET_URL || 'https://video.mediqzy.com';
    const patientJoinUrl = `${livekitBaseUrl}/rooms/${roomId}`;
    const doctorJoinUrl = `${livekitBaseUrl}/rooms/${roomId}`;

    // Send real-time socket notification to doctor (WhatsApp-style call notification)
    try {
      const { emitTriageCallRequest } = await import('../chat/chathandler.controller.js');
      const callData = {
        appointmentId: appointment.id,
        roomId,
        patientId: req.user.id,
        patientName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Patient',
        patientPhone: req.user.phoneNumber || '',
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
          patientName: req.user.firstName || 'Patient'
        },
        data: {
          appointmentId: appointment.id,
          roomId,
          patientId: req.user.id,
          patientName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim(),
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
        patientJoinUrl,
        doctorJoinUrl,
        platform: 'LiveKit'
      },
      billing: {
        paymentType: isUsingCredit ? 'credit' : 'pending',
        consultationFee: consultationFee,
        creditUsed: isUsingCredit,
        creditsRemaining: Math.max(0, creditLimit - (creditsUsed + (isUsingCredit ? 1 : 0))),
        pendingAmount: isUsingCredit ? pendingAmount + consultationFee : pendingAmount,
        message: isUsingCredit 
          ? `This consultation is on credit. Pay ₹${consultationFee} later.`
          : 'Payment pending for this consultation.'
      },
      message: `Connecting you with ${doctor.prefix || 'Dr.'} ${doctor.firstName} ${doctor.lastName}. ${isUsingCredit ? 'This emergency consultation is on credit - pay later.' : ''}`
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
    const healthStatus = await medicalAIService.healthCheck();
    const statusCode = healthStatus.status === 'healthy'
      ? 200
      : healthStatus.status === 'degraded'
        ? 206
        : 503;
    res.status(statusCode).json(healthStatus);
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

    const result = await medicalAIService.clearSession(sessionId);
    res.json(result);
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

    const sessionInfo = await medicalAIService.getSessionInfo(sessionId);
    res.json(sessionInfo);
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
    
    // This would typically fetch from database in production
    // For now, return session info
    const sessionInfo = await medicalAIService.getSessionInfo(sessionId);
    
    res.json({
      success: true,
      sessionInfo: sessionInfo,
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

export default router;
