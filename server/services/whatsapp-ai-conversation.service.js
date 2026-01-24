/**
 * WhatsApp AI Conversation Handler
 * 
 * Handles intelligent AI-powered conversations with WhatsApp users,
 * leveraging their medical history and context for personalized responses.
 * 
 * Now with AGENTIC booking capabilities - the bot can actually book
 * appointments, not just guide users to do it themselves.
 */

import whatsAppUserContextService from './whatsapp-user-context.service.js';
import medicalAIService from './medicalAI.service.js';
import detectEmergencyKeywords from '../utils/emergencyKeywords.js';
import detectAppointmentIntent from '../utils/appointmentIntent.js';
import agenticBookingService from './whatsapp-agentic-booking.service.js';

// Use existing AI service instance
const medicalAI = medicalAIService;

class WhatsAppAIConversationHandler {
  constructor() {
    this.doctorName = 'Dr. iSHA';
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutes
    this.activeSessions = new Map();
  }

  /**
   * Process incoming WhatsApp message and generate intelligent response
   */
  async processMessage(phoneNumber, messageBody, profileName) {
    try {
      // 1. Get user context (identifies user, fetches history)
      const userContext = await whatsAppUserContextService.getFullUserContext(phoneNumber);
      
      // 2. Store incoming message in conversation history
      await whatsAppUserContextService.addToConversationHistory(phoneNumber, {
        role: 'user',
        content: messageBody,
        profileName
      });
      
      // 3. Check for emergency keywords
      const emergencyCheck = detectEmergencyKeywords(messageBody);
      if (emergencyCheck.isEmergency) {
        const emergencyResponse = this.handleEmergency(userContext, emergencyCheck);
        await this.saveResponse(phoneNumber, emergencyResponse);
        return emergencyResponse;
      }
      
      // 4. Check for appointment/booking intent - Use AGENTIC booking service
      const appointmentIntent = detectAppointmentIntent(messageBody);
      
      // Check if there's an active booking session OR this is a new booking intent
      const bookingSession = agenticBookingService.getSessionState(phoneNumber);
      const isActiveBookingSession = bookingSession.state !== 'idle';
      
      // Use action (not intent) - detectAppointmentIntent returns { action: 'book', matched: true, ... }
      const isBookingIntent = appointmentIntent.matched && 
        (appointmentIntent.action === 'book' || appointmentIntent.action === 'schedule' ||
         appointmentIntent.action === 'find' || appointmentIntent.action === 'visit');
      
      if (isActiveBookingSession || isBookingIntent ||
          messageBody.toLowerCase().includes('health check') || 
          messageBody.toLowerCase().includes('checkup')) {
        
        // Use the agentic booking service - this ACTUALLY books appointments!
        const agenticResponse = await agenticBookingService.processBookingIntent(
          phoneNumber, 
          messageBody, 
          userContext
        );
        
        await this.saveResponse(phoneNumber, agenticResponse.response);
        
        return {
          ...agenticResponse,
          isAgentic: true,
          bookingState: agenticResponse.currentState
        };
      }
      
      // For non-booking appointment queries (check status, etc.), use the old handler
      if (appointmentIntent.isAppointmentRelated) {
        const appointmentResponse = await this.handleAppointmentIntent(userContext, appointmentIntent, messageBody);
        await this.saveResponse(phoneNumber, appointmentResponse);
        return appointmentResponse;
      }
      
      // 5. Generate AI response with full context
      const aiResponse = await this.generateContextualResponse(userContext, messageBody, profileName);
      await this.saveResponse(phoneNumber, aiResponse);
      
      return aiResponse;
      
    } catch (error) {
      console.error('WhatsApp AI Error:', error);
      return {
        success: false,
        shouldReply: true,
        response: `I apologize, I'm having trouble processing your request. Please try again or call our helpline at 1800-XXX-XXXX for immediate assistance.`,
        error: error.message
      };
    }
  }

  /**
   * Handle emergency situations
   */
  handleEmergency(userContext, emergencyCheck) {
    const userName = userContext.isKnownUser ? userContext.user.firstName : 'there';
    
    let response = `🚨 *EMERGENCY DETECTED*\n\n`;
    response += `${userName}, I understand this is urgent. `;
    
    if (emergencyCheck.severity === 'critical') {
      response += `Please call *112* or *108* (Ambulance) IMMEDIATELY.\n\n`;
    }
    
    response += `*Immediate steps:*\n`;
    response += `1. Call emergency services: *112*\n`;
    response += `2. Stay calm and don't move unless necessary\n`;
    response += `3. If possible, have someone stay with you\n\n`;
    
    if (userContext.isKnownUser && userContext.user.bloodGroup) {
      response += `📋 Your blood group: *${userContext.user.bloodGroup}*\n`;
    }
    
    if (userContext.activeMedications?.length > 0) {
      response += `💊 Current medications: ${userContext.activeMedications.slice(0, 3).map(m => m.name || m.medicineName || m).join(', ')}\n`;
      response += `(Share this with emergency responders)\n`;
    }
    
    response += `\n🏥 Our emergency coordinator has been notified and will contact you shortly.`;
    
    return {
      success: true,
      shouldReply: true,
      response,
      isEmergency: true,
      emergencyType: emergencyCheck.category,
      escalate: true,
      notifyTeam: true
    };
  }

  /**
   * Handle appointment-related intents
   */
  async handleAppointmentIntent(userContext, intent, originalMessage) {
    const userName = userContext.isKnownUser ? userContext.user.firstName : 'there';
    let response = '';
    
    switch (intent.intent) {
      case 'book':
      case 'schedule':
        response = `Hi ${userName}! 📅 I'd be happy to help you book an appointment.\n\n`;
        
        if (userContext.isKnownUser && userContext.appointments.recent.length > 0) {
          const lastDoc = userContext.appointments.recent[0];
          response += `I see you last visited *${lastDoc.doctorName}* (${lastDoc.specialization || 'General'}). Would you like to book with the same doctor?\n\n`;
        }
        
        response += `Please tell me:\n`;
        response += `1. What type of consultation do you need?\n`;
        response += `2. Any preferred doctor or specialization?\n`;
        response += `3. Preferred date and time?\n\n`;
        response += `Or you can book directly: https://mediqzy.com/book-appointment`;
        break;
        
      case 'check':
      case 'status':
        if (userContext.isKnownUser && userContext.appointments.upcoming.length > 0) {
          response = `Hi ${userName}! Here are your upcoming appointments:\n\n`;
          userContext.appointments.upcoming.forEach((apt, i) => {
            response += `${i + 1}. *${apt.doctorName}*\n`;
            response += `   📅 ${apt.appointmentDate} at ${apt.appointmentTime}\n`;
            response += `   📍 ${apt.consultationType || 'In-person'}\n`;
            response += `   Status: ${apt.status}\n\n`;
          });
        } else if (userContext.isKnownUser) {
          response = `Hi ${userName}! You don't have any upcoming appointments scheduled.\n\n`;
          response += `Would you like to book one? Just say "book appointment" or visit: https://mediqzy.com/book-appointment`;
        } else {
          response = `Hi! To check your appointments, I'll need to verify your identity.\n\n`;
          response += `Please provide your registered email or phone number, or log in at: https://mediqzy.com/login`;
        }
        break;
        
      case 'cancel':
      case 'reschedule':
        if (userContext.isKnownUser && userContext.appointments.upcoming.length > 0) {
          response = `Hi ${userName}! I can help you ${intent.intent} your appointment.\n\n`;
          response += `Your upcoming appointments:\n`;
          userContext.appointments.upcoming.forEach((apt, i) => {
            response += `${i + 1}. ${apt.doctorName} - ${apt.appointmentDate} at ${apt.appointmentTime}\n`;
          });
          response += `\nWhich appointment would you like to ${intent.intent}? Please reply with the number.`;
        } else {
          response = `Hi ${userName}! I don't see any upcoming appointments to ${intent.intent}.\n\n`;
          response += `If you recently booked, it may take a few minutes to appear. Please check: https://mediqzy.com/my-appointments`;
        }
        break;
        
      default:
        response = `Hi ${userName}! I can help you with appointments. What would you like to do?\n\n`;
        response += `• Book a new appointment\n`;
        response += `• Check existing appointments\n`;
        response += `• Reschedule an appointment\n`;
        response += `• Cancel an appointment`;
    }
    
    return {
      success: true,
      shouldReply: true,
      response,
      intent: 'appointment',
      subIntent: intent.intent
    };
  }

  /**
   * Generate contextual AI response using medical history
   */
  async generateContextualResponse(userContext, messageBody, profileName) {
    // Build system prompt with user context
    const systemPrompt = this.buildSystemPrompt(userContext);
    
    // Build conversation messages
    const messages = this.buildConversationMessages(userContext, messageBody);
    
    try {
      // Try to get response from Medical AI Service
      const sessionId = userContext.isKnownUser 
        ? `whatsapp_user_${userContext.user.id}` 
        : `whatsapp_${userContext.phoneNumber.replace(/[^\d]/g, '')}`;
      
      const aiResponse = await medicalAI.consultMedical(
        messageBody,
        sessionId,
        'en',  // language
        {
          systemPrompt: systemPrompt,
          conversationHistory: messages,
          source: 'whatsapp',
          userSummary: userContext.isKnownUser ? userContext.summary : null,
          isKnownUser: userContext.isKnownUser
        }
      );
      
      // Format response for WhatsApp
      let response = this.formatForWhatsApp(aiResponse.response || aiResponse.message || aiResponse);
      
      // Add personalization
      if (userContext.isKnownUser) {
        // Check if we should add relevant context
        if (this.shouldMentionUpcomingAppointment(messageBody, userContext)) {
          response += `\n\n📅 *Reminder:* You have an upcoming appointment with ${userContext.appointments.upcoming[0].doctorName} on ${userContext.appointments.upcoming[0].appointmentDate}.`;
        }
        
        if (this.shouldMentionMedications(messageBody, userContext)) {
          const meds = userContext.activeMedications.slice(0, 2).map(m => m.name || m.medicineName || m).join(', ');
          response += `\n\n💊 Don't forget your current medications: ${meds}`;
        }
      }
      
      return {
        success: true,
        shouldReply: true,
        response,
        provider: aiResponse.provider || 'medical-ai',
        isKnownUser: userContext.isKnownUser
      };
      
    } catch (error) {
      console.error('AI Response Error:', error);
      
      // Fallback to static response
      return this.getFallbackResponse(userContext, messageBody);
    }
  }

  /**
   * Build system prompt with user context
   */
  buildSystemPrompt(userContext) {
    let prompt = `You are Dr. iSHA (Intelligent Smart Health Assistant), a compassionate and knowledgeable AI medical assistant for Mediczy Healthcare Platform, communicating via WhatsApp.

IMPORTANT GUIDELINES:
- Be warm, friendly, and conversational - this is WhatsApp, not a clinical report
- Keep responses concise (max 3-4 short paragraphs)
- Use simple language, avoid complex medical jargon
- Use emojis sparingly but appropriately 🏥💊
- Always recommend consulting a doctor for serious concerns
- Never diagnose conditions - only provide general health information
- For emergencies, always direct to call 112 or visit nearest hospital

`;

    if (userContext.isKnownUser) {
      prompt += `PATIENT CONTEXT (use this to personalize your responses):
${userContext.summary}

Remember their name is ${userContext.user.firstName}. Address them personally and reference their history when relevant.
`;
    } else {
      prompt += `This is a new user not yet registered in our system. Be welcoming and offer to help them register for a better experience.
`;
    }

    return prompt;
  }

  /**
   * Build conversation messages array
   */
  buildConversationMessages(userContext, currentMessage) {
    const messages = [];
    
    // Add recent conversation history
    if (userContext.conversationHistory && userContext.conversationHistory.length > 0) {
      const recentHistory = userContext.conversationHistory.slice(0, 5).reverse();
      recentHistory.forEach(msg => {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      });
    }
    
    // Add current message
    messages.push({
      role: 'user',
      content: currentMessage
    });
    
    return messages;
  }

  /**
   * Format response for WhatsApp (markdown, length, etc.)
   */
  formatForWhatsApp(response) {
    if (!response) return 'I apologize, I could not generate a response. Please try again.';
    
    let formatted = response;
    
    // Convert markdown headers to WhatsApp bold
    formatted = formatted.replace(/^### (.*?)$/gm, '*$1*');
    formatted = formatted.replace(/^## (.*?)$/gm, '*$1*');
    formatted = formatted.replace(/^# (.*?)$/gm, '*$1*');
    
    // Convert markdown bold
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '*$1*');
    
    // Convert markdown italic
    formatted = formatted.replace(/__(.*?)__/g, '_$1_');
    
    // Limit length for WhatsApp
    if (formatted.length > 1500) {
      formatted = formatted.substring(0, 1450) + '\n\n... _Reply "more" to continue._';
    }
    
    return formatted;
  }

  /**
   * Check if we should mention upcoming appointment
   */
  shouldMentionUpcomingAppointment(message, userContext) {
    if (!userContext.appointments?.upcoming?.length) return false;
    
    const keywords = ['appointment', 'doctor', 'checkup', 'visit', 'consultation', 'schedule'];
    const messageLower = message.toLowerCase();
    
    return keywords.some(k => messageLower.includes(k));
  }

  /**
   * Check if we should mention medications
   */
  shouldMentionMedications(message, userContext) {
    if (!userContext.activeMedications?.length) return false;
    
    const keywords = ['medicine', 'medication', 'tablet', 'pill', 'dose', 'prescription', 'drug'];
    const messageLower = message.toLowerCase();
    
    return keywords.some(k => messageLower.includes(k));
  }

  /**
   * Get fallback response when AI fails
   */
  getFallbackResponse(userContext, messageBody) {
    const userName = userContext.isKnownUser ? userContext.user.firstName : 'there';
    
    let response = `Hi ${userName}! 👋\n\n`;
    response += `I'm Dr. iSHA, your AI health assistant. I'm here to help with:\n\n`;
    response += `🏥 *Health Information* - General health queries\n`;
    response += `📅 *Appointments* - Book, check, or reschedule\n`;
    response += `💊 *Medications* - Information about medicines\n`;
    response += `🩺 *Symptoms* - Understand your symptoms\n\n`;
    
    if (userContext.isKnownUser) {
      response += `I have your medical history on file, so I can provide personalized guidance.\n\n`;
    }
    
    response += `How can I assist you today?`;
    
    return {
      success: true,
      shouldReply: true,
      response,
      isFallback: true
    };
  }

  /**
   * Save AI response to conversation history
   */
  async saveResponse(phoneNumber, responseObj) {
    try {
      await whatsAppUserContextService.addToConversationHistory(phoneNumber, {
        role: 'assistant',
        content: responseObj.response,
        isEmergency: responseObj.isEmergency || false,
        intent: responseObj.intent
      });
    } catch (e) {
      console.error('Error saving response to history:', e.message);
    }
  }

  /**
   * Get greeting message for new conversation
   */
  async getGreeting(phoneNumber, profileName) {
    const userContext = await whatsAppUserContextService.getFullUserContext(phoneNumber);
    
    let greeting = '';
    
    if (userContext.isKnownUser) {
      const timeOfDay = this.getTimeOfDay();
      greeting = `Good ${timeOfDay}, ${userContext.user.firstName}! 👋\n\n`;
      greeting += `Welcome back to Mediczy. I'm Dr. iSHA, your AI health assistant.\n\n`;
      
      // Add relevant context
      if (userContext.appointments.upcoming.length > 0) {
        const next = userContext.appointments.upcoming[0];
        greeting += `📅 *Upcoming:* You have an appointment with ${next.doctorName} on ${next.appointmentDate}.\n\n`;
      }
      
      greeting += `How can I help you today?`;
    } else {
      greeting = `Hello ${profileName || 'there'}! 👋\n\n`;
      greeting += `Welcome to Mediczy Healthcare! I'm Dr. iSHA, your AI health assistant.\n\n`;
      greeting += `I can help you with:\n`;
      greeting += `• Health queries and information\n`;
      greeting += `• Booking appointments\n`;
      greeting += `• Understanding symptoms\n`;
      greeting += `• Medication guidance\n\n`;
      greeting += `For a personalized experience, register at: https://mediqzy.com/register\n\n`;
      greeting += `How can I assist you today?`;
    }
    
    return {
      success: true,
      shouldReply: true,
      response: greeting,
      isGreeting: true
    };
  }

  /**
   * Get time of day for greeting
   */
  getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  }
}

// Export singleton instance
const whatsAppAIHandler = new WhatsAppAIConversationHandler();
export default whatsAppAIHandler;
export { WhatsAppAIConversationHandler };
