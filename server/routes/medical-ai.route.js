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
 * @desc    Emergency triage assessment
 * @access  Private
 */
router.post('/emergency-triage', authUser, async (req, res) => {
  try {
    const { symptoms, description, language = 'en' } = req.body;

    if (!symptoms || !description) {
      return res.status(400).json({
        success: false,
        error: 'Symptoms and description are required for emergency triage'
      });
    }

    const sessionId = `mediczy_emergency_${req.user.id}_${Date.now()}`;

    const triage = await medicalAIService.emergencyTriage(
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

    // Log emergency triage attempts for audit
    console.log(`🚨 Emergency triage requested by user ${req.user.id}:`, {
      symptoms,
      description,
      urgencyLevel: triage.urgencyLevel,
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
    
    // Check for existing appointment
    const existingAppointment = await Appointment.findOne({
      where: {
        doctorId,
        appointmentDate,
        appointmentTime: startTime,
        status: ['scheduled', 'confirmed']
      }
    });

    if (existingAppointment) {
      return res.status(400).json({
        success: false,
        error: 'This time slot is already booked. Please choose another slot.'
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
