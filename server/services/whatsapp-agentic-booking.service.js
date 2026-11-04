import { randomUUID } from 'node:crypto';
import { createTransactionalChatBooking } from './chat-appointment-transaction.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { setRlsContext } from '../middleware/rls-context.middleware.js';
import { checkDoctorConflict, checkPatientConflict } from './appointmentEligibility.service.js';
/**
 * WhatsApp Agentic Booking Service
 * 
 * Provides true agentic AI capabilities for booking health checkups
 * and appointments via WhatsApp conversations.
 * 
 * Flow:
 * 1. Detect booking intent
 * 2. Extract/gather required information
 * 3. Search for available slots FROM DATABASE
 * 4. Execute booking action
 * 5. Confirm with user via WhatsApp
 * 
 * NOTE: Uses Redis for session storage to work across clustered instances
 */

import { Appointment } from '../models/appointment.model.intelligent.js';
import doctorModel from '../models/doctor.model.intelligent.js';
import DoctorAvailability from '../models/doctorAvailability.model.intelligent.js';
import Lab from '../models/lab.model.enhanced.js';
import { User } from '../models/user.model.intelligent.js';
import { Op } from 'sequelize';
import whatsAppProductionService from './whatsapp-production.service.js';
import medicalAIService from './medicalAI.service.js';
import Redis from 'ioredis';

// Booking state machine
const BOOKING_STATES = {
  IDLE: 'idle',
  GATHERING_TYPE: 'gathering_type',
  GATHERING_DATE: 'gathering_date',
  GATHERING_TIME: 'gathering_time',
  GATHERING_DOCTOR: 'gathering_doctor',
  CONFIRMING: 'confirming',
  COMPLETED: 'completed'
};

// Health checkup packages
const HEALTH_PACKAGES = {
  basic: {
    name: 'Basic Health Checkup',
    description: 'CBC, Blood Sugar, Lipid Profile, Liver & Kidney Function',
    duration: 60,
    price: 1499
  },
  comprehensive: {
    name: 'Comprehensive Health Checkup',
    description: 'All basic tests + Thyroid, Vitamin D, B12, ECG, Chest X-ray',
    duration: 120,
    price: 3499
  },
  cardiac: {
    name: 'Cardiac Health Checkup',
    description: 'ECG, 2D Echo, TMT, Lipid Profile, Cardiac Markers',
    duration: 90,
    price: 4999
  },
  diabetic: {
    name: 'Diabetic Care Checkup',
    description: 'HbA1c, Fasting & PP Sugar, Kidney Function, Foot Exam',
    duration: 60,
    price: 1999
  },
  women: {
    name: "Women's Wellness Checkup",
    description: 'CBC, Thyroid, Vitamin D, B12, Pap Smear, Breast Exam',
    duration: 90,
    price: 3999
  },
  senior: {
    name: 'Senior Citizen Health Checkup',
    description: 'Complete body checkup + Bone density, Vision, Hearing test',
    duration: 150,
    price: 5999
  }
};

// Redis client for session storage (works across clustered instances)
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  keyPrefix: 'booking:'
});

// Session TTL (15 minutes)
const SESSION_TTL = 15 * 60;

class WhatsAppAgenticBookingService {
  constructor() {
    this.sessionTimeout = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Get or create booking session for a phone number (Redis-backed)
   */
  async getSession(phoneNumber) {
    const normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');
    const key = `session:${normalizedPhone}`;
    
    try {
      const sessionData = await redis.get(key);
      
      if (sessionData) {
        const session = JSON.parse(sessionData);
        // Refresh TTL on access
        await redis.expire(key, SESSION_TTL);
        return session;
      }
    } catch (err) {
      console.error('Redis get error:', err);
    }
    
    // Create new session
    const newSession = {
      state: BOOKING_STATES.IDLE,
      data: {},
      lastActivity: Date.now(),
      history: []
    };
    
    await this.saveSession(normalizedPhone, newSession);
    return newSession;
  }
  
  /**
   * Save session to Redis
   */
  async saveSession(phoneNumber, session) {
    const normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');
    const key = `session:${normalizedPhone}`;
    
    try {
      session.lastActivity = Date.now();
      await redis.set(key, JSON.stringify(session), 'EX', SESSION_TTL);
    } catch (err) {
      console.error('Redis save error:', err);
    }
  }

  /**
   * Process booking-related message with agentic behavior
   */
  async processBookingIntent(phoneNumber, message, userContext) {
    // CRITICAL: await getSession since it's now async with Redis
    const session = await this.getSession(phoneNumber);
    const userName = userContext.isKnownUser ? userContext.user.firstName : 'there';
    const lowerMessage = String(message || '').toLowerCase();
    
    console.log('📅 Booking session state:', session.state, 'for phone:', phoneNumber.substring(0, 8) + '***');
    
    // Allow users to exit booking flow or switch topics
    const exitKeywords = ['cancel', 'stop', 'not now', 'later', 'exit', 'quit', 'end'];
    const nonBookingKeywords = ['membership', 'benefits', 'plan', 'coverage', 'policy', 'subscription'];
    const wantsExit = exitKeywords.some(k => lowerMessage.includes(k)) || nonBookingKeywords.some(k => lowerMessage.includes(k));
    if (wantsExit && session.state !== BOOKING_STATES.IDLE) {
      session.state = BOOKING_STATES.IDLE;
      session.data = {};
      session.history.push({ role: 'user', content: message, timestamp: Date.now() });
      const response = `No problem, ${userName}. I've paused the booking flow.\n\n` +
        `If you need membership plan benefits, please share your membership ID or corporate name, and I can help.`;
      session.history.push({ role: 'assistant', content: response, timestamp: Date.now() });
      await this.saveSession(phoneNumber, session);
      return {
        success: true,
        shouldReply: true,
        response,
        isAgenticAction: true,
        currentState: session.state
      };
    }

    // Exit booking flow if user pivots to non-booking queries
    const isSimpleOption = /^[1-6]$/.test(String(message || '').trim());
    const isDateLike = this.isDateLike(message);
    const isBookingRelated = this.isBookingRelated(message);

    if (session.state !== BOOKING_STATES.IDLE && !isBookingRelated && !isDateLike && !isSimpleOption) {
      session.state = BOOKING_STATES.IDLE;
      session.data = {};
      session.history.push({ role: 'user', content: message, timestamp: Date.now() });

      const response = `Got it, ${userName}. I’ll pause the booking flow.\n\nPlease share your symptoms or question, and I’ll help you right away.`;
      session.history.push({ role: 'assistant', content: response, timestamp: Date.now() });
      await this.saveSession(phoneNumber, session);

      return {
        success: true,
        shouldReply: true,
        response,
        isAgenticAction: true,
        currentState: session.state
      };
    }

    // Handle appointment status queries directly
    if (/(status|track|existing appointment|my appointment)/i.test(message)) {
      session.state = BOOKING_STATES.IDLE;
      session.data = {};
      session.history.push({ role: 'user', content: message, timestamp: Date.now() });
      const response = `Sure ${userName}, please share your appointment ID or the doctor name and date so I can check the status.`;
      session.history.push({ role: 'assistant', content: response, timestamp: Date.now() });
      await this.saveSession(phoneNumber, session);
      return {
        success: true,
        shouldReply: true,
        response,
        isAgenticAction: true,
        currentState: session.state
      };
    }

    // Store message in session history
    session.history.push({ role: 'user', content: message, timestamp: Date.now() });
    
    let response;
    
    switch (session.state) {
      case BOOKING_STATES.IDLE:
        response = await this.handleIdleState(session, message, userName, userContext);
        break;
        
      case BOOKING_STATES.GATHERING_TYPE:
        response = await this.handleTypeSelection(session, message, userName);
        break;
        
      case BOOKING_STATES.GATHERING_DATE:
        response = await this.handleDateSelection(session, message, userName);
        break;
        
      case BOOKING_STATES.GATHERING_TIME:
        response = await this.handleTimeSelection(session, message, userName, userContext);
        break;
        
      case BOOKING_STATES.GATHERING_DOCTOR:
        response = await this.handleDoctorSelection(session, message, userName);
        break;
        
      case BOOKING_STATES.CONFIRMING:
        response = await this.handleConfirmation(session, message, userName, userContext, phoneNumber);
        break;
        
      default:
        response = this.handleUnknownState(session, userName);
    }
    
    // Store response in session history
    session.history.push({ role: 'assistant', content: response.response, timestamp: Date.now() });
    
    // CRITICAL: Save session state to Redis after processing
    await this.saveSession(phoneNumber, session);
    console.log('📅 Session saved with state:', session.state);
    
    return response;
  }

  /**
   * Handle initial booking intent
   */
  async handleIdleState(session, message, userName, userContext) {
    const lowerMessage = message.toLowerCase();

    // Mental-health requests are handled as a real booking flow.  Previously
    // these messages fell through to the general consultation menu, and the
    // SIB response often redirected the patient to an external service.  Keep
    // the provider search and appointment write deterministic, just like all
    // other WhatsApp bookings.
    const requestsMentalHealthBooking =
      /(book|schedule|arrange|find|search|connect|see|talk|speak|consult)/i.test(lowerMessage) &&
      /(psycholog|counsel+or|therapist|mental\s+health|psychiatr|grief|bereavement)/i.test(lowerMessage);

    if (requestsMentalHealthBooking) {
      session.state = BOOKING_STATES.GATHERING_DATE;
      session.data.bookingType = 'doctor_appointment';
      session.data.specialization = /psychiatr/i.test(lowerMessage) ? 'Psychiatry' : 'Psychology';
      session.data.consultationType = 'online';
      session.data.mentalHealth = true;
      session.data.virtualRequested = true;

      return {
        success: true,
        shouldReply: true,
        response: `I can help with that. I’ll look for a qualified ${session.data.specialization === 'Psychiatry' ? 'psychiatrist' : 'psychology counsellor'} for a private virtual consultation.\n\n` +
          `What date would you prefer? You can say “tomorrow”, “this Saturday”, or give a specific date. I’ll then show verified online slots for you to confirm.`,
        isAgenticAction: true,
        currentState: session.state,
        specialty: session.data.specialization,
        consultationType: session.data.consultationType
      };
    }
    
    // Detect what type of booking they want
    if (lowerMessage.includes('health check') || lowerMessage.includes('checkup') || lowerMessage.includes('full body')) {
      session.state = BOOKING_STATES.GATHERING_TYPE;
      session.data.bookingType = 'health_checkup';
      
      let response = `Hi ${userName}! 🏥 I can help you book a health checkup.\n\n`;
      response += `*Available Health Packages:*\n\n`;
      
      Object.entries(HEALTH_PACKAGES).forEach(([key, pkg], i) => {
        response += `*${i + 1}. ${pkg.name}*\n`;
        response += `   ₹${pkg.price} | ${pkg.duration} mins\n`;
        response += `   _${pkg.description}_\n\n`;
      });
      
      response += `Which package would you like? Reply with the *number* (1-6) or the package name.`;
      
      return {
        success: true,
        shouldReply: true,
        response,
        isAgenticAction: true,
        currentState: session.state
      };
    }
    
    // Default appointment booking
    session.state = BOOKING_STATES.GATHERING_TYPE;
    session.data.bookingType = 'consultation';
    
    let response = `Hi ${userName}! 📅 I'll help you book an appointment.\n\n`;
    response += `What type of consultation do you need?\n\n`;
    response += `1️⃣ General Consultation\n`;
    response += `2️⃣ Specialist Consultation\n`;
    response += `3️⃣ Health Checkup Package\n`;
    response += `4️⃣ Follow-up Visit\n\n`;
    response += `Reply with the number or describe what you need.`;
    
    return {
      success: true,
      shouldReply: true,
      response,
      isAgenticAction: true,
      currentState: session.state
    };
  }

  /**
   * Handle package/type selection
   */
  async handleTypeSelection(session, message, userName) {
    const lowerMessage = message.toLowerCase();
    const numberMatch = message.match(/^[1-6]$/);
    
    // If they selected a health package number
    if (session.data.bookingType === 'health_checkup') {
      const packageKeys = Object.keys(HEALTH_PACKAGES);
      let selectedPackage = null;
      
      if (numberMatch) {
        const index = parseInt(numberMatch[0]) - 1;
        if (index >= 0 && index < packageKeys.length) {
          selectedPackage = packageKeys[index];
        }
      } else {
        // Try to match by name
        selectedPackage = packageKeys.find(key => 
          lowerMessage.includes(key) || 
          lowerMessage.includes(HEALTH_PACKAGES[key].name.toLowerCase())
        );
      }
      
      if (selectedPackage) {
        session.data.package = selectedPackage;
        session.data.packageDetails = HEALTH_PACKAGES[selectedPackage];
        session.state = BOOKING_STATES.GATHERING_DATE;
        
        let response = `✅ Great choice! You've selected:\n\n`;
        response += `*${HEALTH_PACKAGES[selectedPackage].name}*\n`;
        response += `💰 ₹${HEALTH_PACKAGES[selectedPackage].price}\n`;
        response += `⏱️ Duration: ${HEALTH_PACKAGES[selectedPackage].duration} mins\n\n`;
        response += `📅 When would you like to schedule this?\n\n`;
        response += `You can say:\n`;
        response += `• "Tomorrow"\n`;
        response += `• "Next Monday"\n`;
        response += `• "January 25"\n`;
        response += `• Or any specific date`;
        
        return {
          success: true,
          shouldReply: true,
          response,
          isAgenticAction: true,
          currentState: session.state,
          selectedPackage: session.data.packageDetails
        };
      }
    }
    
    // Handle consultation type selection
    if (lowerMessage.includes('general') || message === '1') {
      session.data.consultationType = 'general';
      session.data.specialization = 'General Medicine';
    } else if (lowerMessage.includes('specialist') || message === '2') {
      session.state = BOOKING_STATES.GATHERING_TYPE; // Stay in this state for specialization
      return {
        success: true,
        shouldReply: true,
        response: `Which specialist do you need?\n\n` +
          `• Cardiologist (Heart)\n` +
          `• Neurologist (Brain/Nerves)\n` +
          `• Orthopedic (Bones/Joints)\n` +
          `• Dermatologist (Skin)\n` +
          `• ENT (Ear/Nose/Throat)\n` +
          `• Gynecologist\n` +
          `• Pediatrician (Children)\n\n` +
          `Or describe your health concern and I'll suggest the right specialist.`,
        isAgenticAction: true,
        currentState: session.state
      };
    } else if (lowerMessage.includes('checkup') || lowerMessage.includes('health check') || message === '3') {
      session.data.bookingType = 'health_checkup';
      return this.handleIdleState(session, 'health checkup', userName, {});
    } else if (lowerMessage.includes('follow') || message === '4') {
      session.data.consultationType = 'follow_up';
    } else {
      // Try to infer specialization from symptoms
      const specialization = this.inferSpecializationFromMessage(message);
      if (specialization) {
        session.data.specialization = specialization;
        session.data.consultationType = 'specialist';
      } else {
        session.data.consultationType = 'general';
        session.data.specialization = 'General Medicine';
      }
    }
    
    session.state = BOOKING_STATES.GATHERING_DATE;
    
    return {
      success: true,
      shouldReply: true,
      response: `Got it! I'll find a *${session.data.specialization || 'General'}* doctor for you.\n\n` +
        `📅 When would you like to book?\n\n` +
        `Say something like:\n` +
        `• "Tomorrow morning"\n` +
        `• "This Saturday"\n` +
        `• "25th January at 10 AM"`,
      isAgenticAction: true,
      currentState: session.state
    };
  }

  /**
   * Handle date selection
   */
  async handleDateSelection(session, message, userName) {
    const parsedDate = this.parseDate(message);
    
    if (!parsedDate) {
      return {
        success: true,
        shouldReply: true,
        response: `I couldn't understand that date. Please try again with:\n\n` +
          `• "Tomorrow"\n` +
          `• "Next Monday"\n` +
          `• "25th January"\n` +
          `• "2026-01-25"`,
        isAgenticAction: true,
        currentState: session.state
      };
    }
    
    // Check if date is in the past
    if (parsedDate < new Date()) {
      return {
        success: true,
        shouldReply: true,
        response: `That date has already passed. Please choose a future date.`,
        isAgenticAction: true,
        currentState: session.state
      };
    }
    
    session.data.preferredDate = parsedDate;
    session.state = BOOKING_STATES.GATHERING_TIME;
    
    const dateStr = parsedDate.toLocaleDateString('en-IN', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    return {
      success: true,
      shouldReply: true,
      response: `📅 Perfect! *${dateStr}*\n\n` +
        `What time works best for you?\n\n` +
        `🌅 Morning (9 AM - 12 PM)\n` +
        `☀️ Afternoon (12 PM - 4 PM)\n` +
        `🌆 Evening (4 PM - 8 PM)\n\n` +
        `Or specify a time like "10:30 AM"`,
      isAgenticAction: true,
      currentState: session.state
    };
  }

  /**
   * Handle time selection and find available slots
   */
  async handleTimeSelection(session, message, userName, userContext) {
    const lowerMessage = message.toLowerCase();
    let timeSlot;
    
    // Parse time preference
    if (lowerMessage.includes('morning')) {
      timeSlot = { start: '09:00', end: '12:00', preference: 'morning' };
    } else if (lowerMessage.includes('afternoon')) {
      timeSlot = { start: '12:00', end: '16:00', preference: 'afternoon' };
    } else if (lowerMessage.includes('evening')) {
      timeSlot = { start: '16:00', end: '20:00', preference: 'evening' };
    } else {
      // Try to parse specific time
      const timeMatch = message.match(/(\d{1,2})[:.]?(\d{2})?\s*(am|pm)?/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        const period = timeMatch[3]?.toLowerCase();
        
        if (period === 'pm' && hours < 12) hours += 12;
        if (period === 'am' && hours === 12) hours = 0;
        
        const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        timeSlot = { start: timeStr, end: timeStr, preference: 'specific', specificTime: timeStr };
      }
    }
    
    if (!timeSlot) {
      return {
        success: true,
        shouldReply: true,
        response: `I couldn't understand the time. Please say:\n\n` +
          `• "Morning", "Afternoon", or "Evening"\n` +
          `• Or a specific time like "10:30 AM"`,
        isAgenticAction: true,
        currentState: session.state
      };
    }
    
    session.data.timePreference = timeSlot;
    
    // Find available doctors/slots
    const availableSlots = await this.findAvailableSlots(session.data);
    
    if (availableSlots.length === 0) {
      const dateObj = session.data.preferredDate instanceof Date
        ? session.data.preferredDate
        : new Date(session.data.preferredDate);
      const dateLabel = Number.isNaN(dateObj.getTime())
        ? 'that date'
        : dateObj.toLocaleDateString('en-IN');
      return {
        success: true,
        shouldReply: true,
        response: `😔 Sorry, no verified online slots are available for that time on ${dateLabel}.\n\n` +
          `Would you like to:\n` +
          `1️⃣ Try a different time\n` +
          `2️⃣ Check another date\n` +
          `3️⃣ Join waitlist for this slot`,
        isAgenticAction: true,
        currentState: session.state
      };
    }
    
    session.data.availableSlots = availableSlots;
    session.state = BOOKING_STATES.CONFIRMING;
    
    // Build slot options
    let response = `🎉 Great news! I found available slots:\n\n`;
    
    availableSlots.slice(0, 3).forEach((slot, i) => {
      response += `*${i + 1}. ${slot.time}*\n`;
      if (slot.doctorName) {
        response += `   👨‍⚕️ Dr. ${slot.doctorName}\n`;
      }
      if (slot.location) {
        response += `   📍 ${slot.location}\n`;
      }
      response += `   💰 ₹${slot.price || session.data.packageDetails?.price || 500}\n\n`;
    });
    
    response += `Reply with the *slot number* to confirm your booking.`;
    
    return {
      success: true,
      shouldReply: true,
      response,
      isAgenticAction: true,
      currentState: session.state,
      availableSlots
    };
  }

  /**
   * Handle booking confirmation - THIS IS THE AGENTIC ACTION!
   */
  async handleConfirmation(session, message, userName, userContext, phoneNumber) {
    const lowerMessage = message.toLowerCase();
    
    // Check for cancellation
    if (lowerMessage.includes('cancel') || lowerMessage.includes('no') || lowerMessage.includes('stop')) {
      session.state = BOOKING_STATES.IDLE;
      session.data = {};
      return {
        success: true,
        shouldReply: true,
        response: `No problem, ${userName}! I've cancelled this booking.\n\n` +
          `Feel free to start again whenever you're ready. Just say "book appointment" or "health checkup".`,
        isAgenticAction: true,
        currentState: BOOKING_STATES.IDLE
      };
    }
    
    // Parse slot selection
    const numberMatch = message.match(/^[1-3]$/);
    let selectedSlot;
    
    if (numberMatch && session.data.availableSlots) {
      const index = parseInt(numberMatch[0]) - 1;
      selectedSlot = session.data.availableSlots[index];
    } else if (lowerMessage.includes('confirm') || lowerMessage.includes('yes') || lowerMessage.includes('book')) {
      selectedSlot = session.data.availableSlots?.[0];
    }
    
    if (!selectedSlot) {
      return {
        success: true,
        shouldReply: true,
        response: `Please select a slot by replying with:\n\n` +
          `• "1", "2", or "3" for the slot number\n` +
          `• "confirm" to book the first available slot\n` +
          `• "cancel" to start over`,
        isAgenticAction: true,
        currentState: session.state
      };
    }
    
    session.data.selectedSlot = selectedSlot;
    session.data.bookingRequestId ||= randomUUID();
    await this.saveSession(phoneNumber, session);
    
    // 🎯 EXECUTE THE BOOKING - This is the agentic action!
    try {
      const bookingResult = await this.executeBooking(session.data, userContext, phoneNumber);
      
      if (bookingResult.success) {
        session.state = BOOKING_STATES.COMPLETED;
        
        // Ensure date is properly formatted (may be string from Redis)
        const dateObj = session.data.preferredDate instanceof Date 
          ? session.data.preferredDate 
          : new Date(session.data.preferredDate);
        const dateStr = dateObj.toLocaleDateString('en-IN', { 
          weekday: 'long', 
          day: 'numeric', 
          month: 'long', 
          year: 'numeric' 
        });
        
        let response = `✅ *BOOKING CONFIRMED!*\n\n`;
        response += `📋 *Booking ID:* ${bookingResult.bookingId}\n`;
        response += `📅 *Date:* ${dateStr}\n`;
        response += `⏰ *Time:* ${selectedSlot.time}\n`;
        
        if (session.data.packageDetails) {
          response += `🏥 *Package:* ${session.data.packageDetails.name}\n`;
          response += `💰 *Amount:* ₹${session.data.packageDetails.price}\n`;
        }
        
        if (selectedSlot.doctorName || bookingResult.doctorName) {
          response += `👨‍⚕️ *Doctor:* ${selectedSlot.doctorName || bookingResult.doctorName}\n`;
        }
        
        if (selectedSlot.location) {
          response += `📍 *Location:* ${selectedSlot.location}\n`;
        }
        
        response += `\n*What's Next:*\n`;
        response += `• You'll receive a confirmation message shortly\n`;
        if (session.data.consultationType === 'online' || session.data.virtualRequested) {
          response += `• The secure video-call details will be shared before the appointment\n`;
        } else {
          response += `• Please arrive 15 minutes early\n`;
          response += `• Bring a valid ID and any previous reports\n`;
        }
        response += `\n`;
        response += `Need to reschedule? Just say "reschedule my appointment"\n\n`;
        response += `Thank you for choosing Mediczy! 💙`;
        
        // Reset session for next booking
        session.state = BOOKING_STATES.IDLE;
        session.data = {};
        
        return {
          success: true,
          shouldReply: true,
          response,
          isAgenticAction: true,
          actionTaken: 'BOOKING_CREATED',
          bookingDetails: bookingResult,
          currentState: BOOKING_STATES.COMPLETED
        };
      } else {
        throw new Error(bookingResult.error || 'Booking failed');
      }
      
    } catch (error) {
      console.error('Booking execution error:', error);
      
      return {
        success: false,
        shouldReply: true,
        response: `😔 I'm sorry, I couldn't complete the booking due to a technical issue.\n\n` +
          `Please try again or contact support through the app.`,
        isAgenticAction: true,
        error: error.message
      };
    }
  }

  /**
   * Execute the actual booking in the database
   */
  async executeBooking(bookingData, userContext, phoneNumber) {
    try {
      if (process.env.CHATBOT_TASK_MUTATIONS_ENABLED === 'false') throw new Error('Chat booking mutations are disabled');
      const user = userContext?.isKnownUser ? userContext.user : null;
      const userId = user?.id;
      if (!userId) throw new Error('Link your existing patient account before booking');
      const normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');

      const patientName = user?.firstName && user?.lastName 
        ? `${user.firstName} ${user.lastName}` 
        : user?.firstName || 'WhatsApp User';
      
      // Get doctor name from slot or use default
      const doctorName = bookingData.selectedSlot?.doctorName || 
        (bookingData.specialization === 'General Medicine' ? 'Dr. General Physician' : 
         `Dr. ${bookingData.specialization || 'Consultant'}`);
      
      // Ensure preferredDate is a proper Date object (may be string from Redis)
      const appointmentDate = bookingData.preferredDate instanceof Date 
        ? bookingData.preferredDate 
        : new Date(bookingData.preferredDate);
      
      // Validate the date
      if (isNaN(appointmentDate.getTime())) {
        throw new Error('Invalid appointment date');
      }
      
      // Convert time string to 24-hour format for database
      const timeStr = bookingData.selectedSlot.time; // e.g., "10:00 AM" or "02:00 PM"
      let appointmentTime = timeStr;
      
      // Parse and convert to 24-hour format if needed
      const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = timeMatch[2];
        const period = timeMatch[3]?.toUpperCase();
        
        if (period === 'PM' && hours < 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        
        appointmentTime = `${hours.toString().padStart(2, '0')}:${minutes}:00`;
      }
      
      // Create the appointment with all required fields
      const { appointment, replayed } = await createTransactionalChatBooking({
        database: postgresSequelize, Appointment, Availability: DoctorAvailability,
        setContext: setRlsContext, checkDoctor: checkDoctorConflict, checkPatient: checkPatientConflict,
      }, {
        userId: userId,
        patientName: patientName,
        patientPhone: normalizedPhone,
        patientEmail: user?.email || null,
        doctorId: bookingData.selectedSlot?.doctorId || null,
        doctorName: doctorName,
        appointmentDate: appointmentDate,
        appointmentTime: appointmentTime,
        consultationType: bookingData.bookingType === 'health_checkup' ? 'in-person' : 'online',
        specialization: bookingData.selectedSlot?.specialization || bookingData.specialization || 'General Medicine',
        status: 'confirmed',
        reason: bookingData.bookingType === 'health_checkup' 
          ? `Health Checkup: ${bookingData.packageDetails?.name || 'General Checkup'}` 
          : bookingData.mentalHealth
            ? 'Mental health counselling consultation'
            : 'Doctor Consultation',
        notes: `Booked via WhatsApp. Package: ${bookingData.packageDetails?.name || 'N/A'}. Source: agentic-booking`,
        patientDetails: {
          bookedVia: 'whatsapp',
          profileName: userContext.profileName,
          bookingTimestamp: new Date().toISOString()
        }
      }, { requestId: bookingData.bookingRequestId, organizationId: user.organization_id });
      
      // Send confirmation SMS via WhatsApp
      try {
        if (replayed) return { success: true, replayed: true, bookingId: `MED${String(appointment.id).padStart(6, '0')}`, appointmentId: appointment.id, appointment, doctorName };
        const confirmDateStr = appointmentDate.toLocaleDateString('en-IN', { 
          weekday: 'short', day: 'numeric', month: 'short' 
        });
        await whatsAppProductionService.sendMessage(phoneNumber, 
          `Your booking #${appointment.id} is confirmed for ${confirmDateStr} at ${bookingData.selectedSlot.time}. - Mediczy`
        );
      } catch (smsError) {
        console.error('Failed to send confirmation SMS:', smsError);
      }
      
      return {
        success: true,
        bookingId: `MED${appointment.id.toString().padStart(6, '0')}`,
        appointmentId: appointment.id,
        appointment,
        doctorName: doctorName
      };
      
    } catch (error) {
      console.error('Execute booking error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Find available slots for booking - CHECKS ACTUAL DATABASE
   */
  async findAvailableSlots(bookingData) {
    try {
      const { preferredDate, timePreference, specialization, bookingType } = bookingData;
      const date = preferredDate instanceof Date ? preferredDate : new Date(preferredDate);
      if (Number.isNaN(date.getTime())) return [];
      
      // Get day of week (0=Sunday, 6=Saturday)
      const dayOfWeek = date.getDay();
      
      // For health checkups, check lab availability
      if (bookingType === 'health_checkup') {
        return await this.findLabSlots(date, timePreference, bookingData.packageDetails);
      }
      
      // For consultations, check doctor availability from DB
      if (bookingData.mentalHealth || bookingData.virtualRequested || specialization === 'Psychology' || specialization === 'Psychiatry') {
        return await this.findMentalHealthDoctorSlots(date, dayOfWeek, timePreference, specialization);
      }
      return await this.findDoctorSlots(date, dayOfWeek, timePreference, specialization);
      
    } catch (error) {
      console.error('Find slots error:', error);
      if (bookingData?.mentalHealth || bookingData?.virtualRequested || bookingData?.specialization === 'Psychology' || bookingData?.specialization === 'Psychiatry') {
        return [];
      }
      // Availability failures must never become bookable invented slots.
      return [];
    }
  }

  /**
   * Search only active mental-health providers and online-capable slots.
   * Returning no slots is intentional: a fallback placeholder must never look
   * like a real counsellor or create a booking that the database cannot honour.
   */
  async findMentalHealthDoctorSlots(preferredDate, dayOfWeek, timePreference, specialization) {
    try {
      const doctors = await doctorModel.findAll({
        where: {
          isActive: true,
          [Op.or]: [
            { specialization: { [Op.iLike]: '%psych%' } },
            { specialization: { [Op.iLike]: '%counsel%' } },
            { specialization: { [Op.iLike]: '%mental%' } },
            { specialization: { [Op.iLike]: '%psychiatr%' } },
            { specialization: { [Op.iLike]: '%therap%' } }
          ]
        },
        limit: 25,
        order: [['firstName', 'ASC'], ['lastName', 'ASC']]
      });

      if (!doctors?.length) return [];
      const doctorIds = doctors.map(doctor => doctor.id);
      const availabilities = await DoctorAvailability.findAll({
        where: {
          doctorId: { [Op.in]: doctorIds },
          dayOfWeek,
          isAvailable: true,
          [Op.or]: [
            { consultationType: 'online' },
            { consultationType: 'both' }
          ]
        }
      });
      if (!availabilities?.length) return [];

      const existingAppointments = await Appointment.findAll({
        where: {
          appointmentDate: preferredDate,
          doctorId: { [Op.in]: doctorIds },
          status: { [Op.notIn]: ['cancelled', 'rejected', 'no-show'] }
        },
        attributes: ['appointmentTime', 'doctorId']
      });
      const bookedSlots = existingAppointments.map(appointment => ({
        time: appointment.appointmentTime,
        doctorId: appointment.doctorId
      }));
      const availableSlots = [];

      for (const availability of availabilities) {
        const doctor = doctors.find(candidate => candidate.id === availability.doctorId);
        if (!doctor) continue;
        const startHour = parseInt(String(availability.startTime).split(':')[0], 10);
        const endHour = parseInt(String(availability.endTime).split(':')[0], 10);
        const slotDuration = availability.slotDuration || 30;
        for (let hour = startHour; hour < endHour; hour += 1) {
          for (let minute = 0; minute < 60; minute += slotDuration) {
            const timeValue = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            if (!this.matchesTimePreference(hour, timePreference)) continue;
            if (bookedSlots.some(slot => slot.doctorId === doctor.id && String(slot.time).startsWith(timeValue))) continue;
            availableSlots.push({
              time: this.formatTimeDisplay(hour, minute),
              timeValue,
              doctorId: doctor.id,
              doctorName: `${doctor.firstName} ${doctor.lastName}`.trim(),
              specialization: doctor.specialization || specialization,
              price: doctor.consultationFee || 500,
              location: 'Virtual consultation',
              type: 'consultation',
              consultationType: 'online',
              virtual: true
            });
          }
        }
      }
      return availableSlots.sort((a, b) => a.timeValue.localeCompare(b.timeValue)).slice(0, 3);
    } catch (error) {
      console.error('Error finding mental-health doctor slots:', error);
      return [];
    }
  }

  /**
   * Find available lab slots from database
   */
  async findLabSlots(preferredDate, timePreference, packageDetails) {
    try {
      // 1. Get active labs with health checkup services
      const labs = await Lab.findAll({
        where: {
          isActive: true
        },
        limit: 5,
        order: [['name', 'ASC']]
      });

      if (!labs || labs.length === 0) {
        console.log('No labs found in database');
        return this.getDefaultLabSlots(preferredDate, timePreference, packageDetails);
      }

      // 2. Get existing appointments for that date to avoid conflicts
      const existingAppointments = await Appointment.findAll({
        where: {
          appointmentDate: preferredDate,
          consultationType: 'Health Checkup',
          status: {
            [Op.notIn]: ['cancelled', 'rejected', 'no-show']
          }
        },
        attributes: ['appointmentTime', 'hospitalId']
      });

      const bookedSlots = existingAppointments.map(apt => ({
        time: apt.appointmentTime,
        labId: apt.hospitalId
      }));

      // 3. Generate available slots based on lab operating hours
      const availableSlots = [];
      
      for (const lab of labs) {
        // Parse operating hours (e.g., { monday: "09:00-18:00", ... })
        const operatingHours = lab.operatingHours || {};
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[preferredDate.getDay()];
        const todayHours = operatingHours[dayName] || '09:00-18:00';
        
        // Parse start/end times
        const [openTime, closeTime] = todayHours.split('-').map(t => t.trim());
        const openHour = parseInt(openTime.split(':')[0]);
        const closeHour = parseInt(closeTime.split(':')[0]);

        // Generate slots every 90 mins (health checkup duration)
        const slotDuration = packageDetails?.duration || 60;
        
        for (let hour = openHour; hour < closeHour - 1; hour += 1.5) {
          const slotHour = Math.floor(hour);
          const slotMin = (hour % 1) * 60;
          const timeStr = `${slotHour.toString().padStart(2, '0')}:${slotMin.toString().padStart(2, '0')}`;
          const displayTime = this.formatTimeDisplay(slotHour, slotMin);
          
          // Check time preference
          if (!this.matchesTimePreference(slotHour, timePreference)) continue;
          
          // Check if slot is already booked at this lab
          const isBooked = bookedSlots.some(bs => 
            bs.labId === lab.id && bs.time === timeStr
          );
          
          if (!isBooked) {
            availableSlots.push({
              time: displayTime,
              timeValue: timeStr,
              labId: lab.id,
              labName: lab.name,
              location: lab.address?.city || lab.address?.area || 'Main Center',
              price: packageDetails?.price || 1499,
              type: 'health_checkup',
              accreditation: lab.accreditation || []
            });
          }
        }
      }

      // Sort by time and limit to 3 options
      availableSlots.sort((a, b) => a.timeValue.localeCompare(b.timeValue));
      
      if (availableSlots.length === 0) {
        return this.getDefaultLabSlots(preferredDate, timePreference, packageDetails);
      }
      
      return availableSlots.slice(0, 3);
      
    } catch (error) {
      console.error('Error finding lab slots:', error);
      return this.getDefaultLabSlots(preferredDate, timePreference, packageDetails);
    }
  }

  /**
   * Find available doctor slots from database
   */
  async findDoctorSlots(preferredDate, dayOfWeek, timePreference, specialization) {
    try {
      // 1. Find doctors with matching specialization
      const doctors = await doctorModel.findAll({
        where: {
          specialization: specialization || 'General Medicine',
          isActive: true
        },
        limit: 10
      });

      if (!doctors || doctors.length === 0) {
        console.log('No doctors found for specialization:', specialization);
        return this.getDefaultDoctorSlots(timePreference, specialization);
      }

      // 2. Get availability for these doctors on the selected day
      const doctorIds = doctors.map(d => d.id);
      
      const availabilities = await DoctorAvailability.findAll({
        where: {
          doctorId: { [Op.in]: doctorIds },
          dayOfWeek: dayOfWeek,
          isAvailable: true
        }
      });

      if (!availabilities || availabilities.length === 0) {
        console.log('No availability found for doctors on day:', dayOfWeek);
        return this.getDefaultDoctorSlots(timePreference, specialization);
      }

      // 3. Get existing appointments to check for conflicts
      const existingAppointments = await Appointment.findAll({
        where: {
          appointmentDate: preferredDate,
          doctorId: { [Op.in]: doctorIds },
          status: {
            [Op.notIn]: ['cancelled', 'rejected', 'no-show']
          }
        },
        attributes: ['appointmentTime', 'doctorId']
      });

      const bookedSlots = existingAppointments.map(apt => ({
        time: apt.appointmentTime,
        doctorId: apt.doctorId
      }));

      // 4. Generate available slots
      const availableSlots = [];
      
      for (const availability of availabilities) {
        const doctor = doctors.find(d => d.id === availability.doctorId);
        if (!doctor) continue;

        // Parse start/end times from availability
        const startParts = availability.startTime.split(':');
        const endParts = availability.endTime.split(':');
        const startHour = parseInt(startParts[0]);
        const endHour = parseInt(endParts[0]);
        const slotDuration = availability.slotDuration || 30;

        // Generate slots
        for (let hour = startHour; hour < endHour; hour++) {
          for (let min = 0; min < 60; min += slotDuration) {
            const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
            const displayTime = this.formatTimeDisplay(hour, min);
            
            // Check time preference
            if (!this.matchesTimePreference(hour, timePreference)) continue;
            
            // Check if slot is booked
            const isBooked = bookedSlots.some(bs => 
              bs.doctorId === doctor.id && bs.time === timeStr
            );
            
            // Check max appointments limit
            const slotsForDoctor = availableSlots.filter(s => s.doctorId === doctor.id).length;
            if (availability.maxAppointments && slotsForDoctor >= availability.maxAppointments) {
              continue;
            }
            
            if (!isBooked) {
              availableSlots.push({
                time: displayTime,
                timeValue: timeStr,
                doctorId: doctor.id,
                doctorName: `${doctor.firstName} ${doctor.lastName}`,
                specialization: doctor.specialization,
                price: doctor.consultationFee || 500,
                location: doctor.clinicName || 'Mediczy Clinic',
                type: 'consultation',
                consultationType: availability.consultationType || 'both'
              });
            }
          }
        }
      }

      // Sort by time and limit
      availableSlots.sort((a, b) => a.timeValue.localeCompare(b.timeValue));
      
      if (availableSlots.length === 0) {
        return this.getDefaultDoctorSlots(timePreference, specialization);
      }
      
      return availableSlots.slice(0, 3);
      
    } catch (error) {
      console.error('Error finding doctor slots:', error);
      return this.getDefaultDoctorSlots(timePreference, specialization);
    }
  }

  /**
   * Check if hour matches time preference
   */
  matchesTimePreference(hour, timePreference) {
    if (!timePreference || !timePreference.preference) return true;
    
    switch (timePreference.preference) {
      case 'morning':
        return hour >= 9 && hour < 12;
      case 'afternoon':
        return hour >= 12 && hour < 16;
      case 'evening':
        return hour >= 16 && hour < 20;
      case 'specific':
        // Within 1 hour of specific time
        const specificHour = parseInt(timePreference.specificTime?.split(':')[0] || 10);
        return Math.abs(hour - specificHour) <= 1;
      default:
        return true;
    }
  }

  /**
   * Format time for display (e.g., "10:30 AM")
   */
  formatTimeDisplay(hour, minutes) {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
    const displayMin = minutes.toString().padStart(2, '0');
    return `${displayHour}:${displayMin} ${period}`;
  }

  /**
   * Default lab slots when DB lookup fails
   */
  getDefaultLabSlots(preferredDate, timePreference, packageDetails) {
    // No authoritative availability: never fabricate a slot or price.
    return [];
  }

  /**
   * Default doctor slots when DB lookup fails
   */
  getDefaultDoctorSlots(timePreference, specialization) {
    // No authoritative availability: never fabricate a slot or price.
    return [];
  }

  /**
   * Parse natural language date
   */
  parseDate(message) {
    const lowerMessage = message.toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Strip time-of-day words to improve date parsing
    const cleanedMessage = lowerMessage
      .replace(/\b(morning|afternoon|evening|night|tonight)\b/g, '')
      .replace(/\b(at|by|around|on)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Handle relative dates
    if (lowerMessage.includes('today')) {
      return today;
    }
    
    if (lowerMessage.includes('tomorrow')) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    
    if (lowerMessage.includes('day after tomorrow')) {
      const dat = new Date(today);
      dat.setDate(dat.getDate() + 2);
      return dat;
    }
    
    // Handle "next [day]"
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const nextDayMatch = lowerMessage.match(/next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
    if (nextDayMatch) {
      const targetDay = dayNames.indexOf(nextDayMatch[1]);
      const result = new Date(today);
      const daysUntil = (targetDay - today.getDay() + 7) % 7 || 7;
      result.setDate(result.getDate() + daysUntil);
      return result;
    }
    
    // Handle "this [day]"
    const thisDayMatch = lowerMessage.match(/this\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
    if (thisDayMatch) {
      const targetDay = dayNames.indexOf(thisDayMatch[1]);
      const result = new Date(today);
      const daysUntil = (targetDay - today.getDay() + 7) % 7;
      result.setDate(result.getDate() + daysUntil);
      return result;
    }
    
    // Handle specific dates like "25th January" or "January 25"
    const dateMatch = cleanedMessage.match(/(\d{1,2})(?:st|nd|rd|th)?\s*(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)/i) ||
              cleanedMessage.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s*(\d{1,2})(?:st|nd|rd|th)?/i);
    
    if (dateMatch) {
      const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const shortMonths = {
        jan: 0,
        feb: 1,
        mar: 2,
        apr: 3,
        jun: 5,
        jul: 6,
        aug: 7,
        sep: 8,
        sept: 8,
        oct: 9,
        nov: 10,
        dec: 11
      };
      let day, month;
      
      if (isNaN(dateMatch[1])) {
        const monthToken = dateMatch[1].toLowerCase();
        month = months.indexOf(monthToken);
        if (month === -1 && shortMonths[monthToken] !== undefined) {
          month = shortMonths[monthToken];
        }
        day = parseInt(dateMatch[2]);
      } else {
        day = parseInt(dateMatch[1]);
        const monthToken = dateMatch[2].toLowerCase();
        month = months.indexOf(monthToken);
        if (month === -1 && shortMonths[monthToken] !== undefined) {
          month = shortMonths[monthToken];
        }
      }
      
      if (month !== -1 && day >= 1 && day <= 31) {
        const result = new Date(today.getFullYear(), month, day);
        if (result < today) {
          result.setFullYear(result.getFullYear() + 1);
        }
        return result;
      }
    }
    
    // Handle ISO date format
    const isoMatch = message.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return new Date(isoMatch[1], parseInt(isoMatch[2]) - 1, isoMatch[3]);
    }
    
    // Handle DD/MM format
    const shortDateMatch = message.match(/(\d{1,2})[\/\-](\d{1,2})/);
    if (shortDateMatch) {
      const day = parseInt(shortDateMatch[1]);
      const month = parseInt(shortDateMatch[2]) - 1;
      const result = new Date(today.getFullYear(), month, day);
      if (result < today) {
        result.setFullYear(result.getFullYear() + 1);
      }
      return result;
    }
    
    return null;
  }

  /**
   * Infer specialization from symptoms/keywords
   */
  inferSpecializationFromMessage(message) {
    const lowerMessage = message.toLowerCase();
    
    const mappings = {
      'Cardiology': ['heart', 'chest pain', 'bp', 'blood pressure', 'cardiac', 'palpitation'],
      'Neurology': ['headache', 'migraine', 'brain', 'nerve', 'seizure', 'dizziness', 'vertigo'],
      'Orthopedics': ['bone', 'joint', 'knee', 'back pain', 'spine', 'fracture', 'arthritis'],
      'Dermatology': ['skin', 'rash', 'acne', 'hair', 'itching', 'allergy'],
      'ENT': ['ear', 'nose', 'throat', 'hearing', 'sinus', 'tonsil'],
      'Gynecology': ['period', 'menstrual', 'pregnancy', 'pcod', 'pcos', 'gynec'],
      'Pediatrics': ['child', 'baby', 'infant', 'kid'],
      'Gastroenterology': ['stomach', 'digestion', 'gastric', 'acidity', 'liver'],
      'Pulmonology': ['breathing', 'lungs', 'asthma', 'cough', 'respiratory'],
      'Ophthalmology': ['eye', 'vision', 'glasses', 'cataract'],
      'Psychiatry': ['anxiety', 'depression', 'stress', 'mental', 'sleep'],
      'Urology': ['kidney', 'urine', 'prostate', 'uti'],
      'Endocrinology': ['diabetes', 'thyroid', 'hormone', 'sugar']
    };
    
    for (const [specialization, keywords] of Object.entries(mappings)) {
      if (keywords.some(keyword => lowerMessage.includes(keyword))) {
        return specialization;
      }
    }
    
    return null;
  }

  /**
   * Handle unknown state
   */
  handleUnknownState(session, userName) {
    session.state = BOOKING_STATES.IDLE;
    session.data = {};
    
    return {
      success: true,
      shouldReply: true,
      response: `Hi ${userName}! Something went wrong with our conversation.\n\n` +
        `Let's start fresh. How can I help you?\n\n` +
        `• Book an appointment\n` +
        `• Schedule a health checkup\n` +
        `• Check my appointments`,
      isAgenticAction: true,
      currentState: BOOKING_STATES.IDLE
    };
  }

  /**
   * Check if message is booking-related
   */
  isBookingRelated(message) {
    const lowerMessage = message.toLowerCase();
    const bookingKeywords = [
      'book', 'appointment', 'schedule', 'checkup', 'check-up', 'health check',
      'slot', 'available', 'doctor', 'consult', 'visit', 'clinic',
      'tomorrow', 'next week', 'reschedule', 'cancel',
      'psychology', 'psychologist', 'counselor', 'counsellor', 'therapist',
      'mental health', 'psychiatrist', 'psychiatry', 'virtual', 'video call', 'online'
    ];

    if (lowerMessage.includes('status') || lowerMessage.includes('track')) {
      return false;
    }
    
    return bookingKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Check if message looks like a date/time input
   */
  isDateLike(message = '') {
    const text = message.toLowerCase();
    return /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/.test(text) ||
      /\d{1,2}(?:st|nd|rd|th)?\s*(january|february|march|april|may|june|july|august|september|october|november|december)/i.test(message) ||
      /\d{4}-\d{2}-\d{2}/.test(text) ||
      /\d{1,2}[\/\-]\d{1,2}/.test(text) ||
      /\b(morning|afternoon|evening|night)\b/.test(text);
  }

  /**
   * Get session state for debugging (async Redis-based)
   */
  async getSessionState(phoneNumber) {
    const session = await this.getSession(phoneNumber);
    return {
      state: session.state,
      data: session.data,
      historyLength: session.history.length
    };
  }
}

export default new WhatsAppAgenticBookingService();
