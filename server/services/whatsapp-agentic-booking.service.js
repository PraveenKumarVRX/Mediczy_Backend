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
 */

import { Appointment } from '../models/appointment.model.intelligent.js';
import doctorModel from '../models/doctor.model.intelligent.js';
import DoctorAvailability from '../models/doctorAvailability.model.intelligent.js';
import Lab from '../models/lab.model.enhanced.js';
import { User } from '../models/user.model.intelligent.js';
import { Op } from 'sequelize';
import whatsAppProductionService from './whatsapp-production.service.js';
import medicalAIService from './medicalAI.service.js';

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

// In-memory booking sessions (use Redis in production)
const bookingSessions = new Map();

class WhatsAppAgenticBookingService {
  constructor() {
    this.sessionTimeout = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Get or create booking session for a phone number
   */
  getSession(phoneNumber) {
    const normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');
    
    if (!bookingSessions.has(normalizedPhone)) {
      bookingSessions.set(normalizedPhone, {
        state: BOOKING_STATES.IDLE,
        data: {},
        lastActivity: Date.now(),
        history: []
      });
    }
    
    const session = bookingSessions.get(normalizedPhone);
    
    // Check if session expired
    if (Date.now() - session.lastActivity > this.sessionTimeout) {
      session.state = BOOKING_STATES.IDLE;
      session.data = {};
    }
    
    session.lastActivity = Date.now();
    return session;
  }

  /**
   * Process booking-related message with agentic behavior
   */
  async processBookingIntent(phoneNumber, message, userContext) {
    const session = this.getSession(phoneNumber);
    const userName = userContext.isKnownUser ? userContext.user.firstName : 'there';
    
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
    
    return response;
  }

  /**
   * Handle initial booking intent
   */
  async handleIdleState(session, message, userName, userContext) {
    const lowerMessage = message.toLowerCase();
    
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
      return {
        success: true,
        shouldReply: true,
        response: `😔 Sorry, no slots available for that time on ${session.data.preferredDate.toLocaleDateString()}.\n\n` +
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
    
    // 🎯 EXECUTE THE BOOKING - This is the agentic action!
    try {
      const bookingResult = await this.executeBooking(session.data, userContext, phoneNumber);
      
      if (bookingResult.success) {
        session.state = BOOKING_STATES.COMPLETED;
        
        let response = `✅ *BOOKING CONFIRMED!*\n\n`;
        response += `📋 *Booking ID:* ${bookingResult.bookingId}\n`;
        response += `📅 *Date:* ${session.data.preferredDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n`;
        response += `⏰ *Time:* ${selectedSlot.time}\n`;
        
        if (session.data.packageDetails) {
          response += `🏥 *Package:* ${session.data.packageDetails.name}\n`;
          response += `💰 *Amount:* ₹${session.data.packageDetails.price}\n`;
        }
        
        if (selectedSlot.doctorName) {
          response += `👨‍⚕️ *Doctor:* Dr. ${selectedSlot.doctorName}\n`;
        }
        
        if (selectedSlot.location) {
          response += `📍 *Location:* ${selectedSlot.location}\n`;
        }
        
        response += `\n*What's Next:*\n`;
        response += `• You'll receive a confirmation SMS shortly\n`;
        response += `• Please arrive 15 minutes early\n`;
        response += `• Bring a valid ID and any previous reports\n\n`;
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
          `Please try again or call our helpline: *1800-XXX-XXXX*\n\n` +
          `Error: ${error.message}`,
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
      // Get or create user
      let userId = userContext.isKnownUser ? userContext.user.id : null;
      
      if (!userId) {
        // Create a new user record for this phone number
        const newUser = await User.create({
          phoneNumber: phoneNumber.replace(/[^\d+]/g, ''),
          firstName: 'WhatsApp',
          lastName: 'User',
          registrationSource: 'whatsapp_booking'
        });
        userId = newUser.id;
      }
      
      // Create the appointment
      const appointment = await Appointment.create({
        userId: userId,
        doctorId: bookingData.selectedSlot.doctorId || null,
        appointmentDate: bookingData.preferredDate,
        appointmentTime: bookingData.selectedSlot.time,
        consultationType: bookingData.bookingType === 'health_checkup' ? 'Health Checkup' : 'Consultation',
        packageType: bookingData.package || null,
        packageName: bookingData.packageDetails?.name || null,
        amount: bookingData.packageDetails?.price || bookingData.selectedSlot.price || 500,
        status: 'confirmed',
        bookingSource: 'whatsapp',
        notes: `Booked via WhatsApp. Package: ${bookingData.packageDetails?.name || 'N/A'}`,
        specialization: bookingData.specialization || 'General Medicine'
      });
      
      // Send confirmation SMS via WhatsApp
      try {
        await whatsAppProductionService.sendMessage(phoneNumber, 
          `Your booking #${appointment.id} is confirmed for ${bookingData.preferredDate.toLocaleDateString()} at ${bookingData.selectedSlot.time}. - Mediczy`
        );
      } catch (smsError) {
        console.error('Failed to send confirmation SMS:', smsError);
      }
      
      return {
        success: true,
        bookingId: `MED${appointment.id.toString().padStart(6, '0')}`,
        appointmentId: appointment.id,
        appointment
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
      
      // Get day of week (0=Sunday, 6=Saturday)
      const dayOfWeek = preferredDate.getDay();
      
      // For health checkups, check lab availability
      if (bookingType === 'health_checkup') {
        return await this.findLabSlots(preferredDate, timePreference, bookingData.packageDetails);
      }
      
      // For consultations, check doctor availability from DB
      return await this.findDoctorSlots(preferredDate, dayOfWeek, timePreference, specialization);
      
    } catch (error) {
      console.error('Find slots error:', error);
      // Return default slots on error
      return [
        { time: '10:00 AM', price: 500, note: 'Slot availability to be confirmed' },
        { time: '02:00 PM', price: 500, note: 'Slot availability to be confirmed' },
        { time: '05:00 PM', price: 500, note: 'Slot availability to be confirmed' }
      ];
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
        console.log('No labs found in database, using default slots');
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
    const baseSlots = [
      { time: '09:00 AM', timeValue: '09:00' },
      { time: '10:30 AM', timeValue: '10:30' },
      { time: '02:00 PM', timeValue: '14:00' },
      { time: '04:00 PM', timeValue: '16:00' }
    ];
    
    const filtered = baseSlots.filter(slot => {
      const hour = parseInt(slot.timeValue.split(':')[0]);
      return this.matchesTimePreference(hour, timePreference);
    });
    
    return filtered.slice(0, 3).map(slot => ({
      ...slot,
      location: 'Mediczy Health Center',
      price: packageDetails?.price || 1499,
      type: 'health_checkup',
      note: 'Please call to confirm availability'
    }));
  }

  /**
   * Default doctor slots when DB lookup fails
   */
  getDefaultDoctorSlots(timePreference, specialization) {
    const baseSlots = [
      { time: '10:00 AM', timeValue: '10:00' },
      { time: '11:30 AM', timeValue: '11:30' },
      { time: '02:00 PM', timeValue: '14:00' },
      { time: '04:00 PM', timeValue: '16:00' },
      { time: '06:00 PM', timeValue: '18:00' }
    ];
    
    const filtered = baseSlots.filter(slot => {
      const hour = parseInt(slot.timeValue.split(':')[0]);
      return this.matchesTimePreference(hour, timePreference);
    });
    
    return filtered.slice(0, 3).map(slot => ({
      ...slot,
      doctorName: 'Available Doctor',
      specialization: specialization || 'General Medicine',
      price: 500,
      type: 'consultation',
      note: 'Doctor will be assigned based on availability'
    }));
  }

  /**
   * Parse natural language date
   */
  parseDate(message) {
    const lowerMessage = message.toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
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
    const dateMatch = message.match(/(\d{1,2})(?:st|nd|rd|th)?\s*(january|february|march|april|may|june|july|august|september|october|november|december)/i) ||
                      message.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s*(\d{1,2})/i);
    
    if (dateMatch) {
      const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      let day, month;
      
      if (isNaN(dateMatch[1])) {
        month = months.indexOf(dateMatch[1].toLowerCase());
        day = parseInt(dateMatch[2]);
      } else {
        day = parseInt(dateMatch[1]);
        month = months.indexOf(dateMatch[2].toLowerCase());
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
      'tomorrow', 'next week', 'reschedule', 'cancel'
    ];
    
    return bookingKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Get session state for debugging
   */
  getSessionState(phoneNumber) {
    const session = this.getSession(phoneNumber);
    return {
      state: session.state,
      data: session.data,
      historyLength: session.history.length
    };
  }
}

export default new WhatsAppAgenticBookingService();
