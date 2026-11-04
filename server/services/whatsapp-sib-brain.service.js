import { randomUUID } from 'node:crypto';
import { channelChat } from './medical-channel-chat.service.js';
import { sibPost } from './sib-client.js';
/**
 * WhatsApp SIB Brain Service
 * 
 * Routes ALL WhatsApp messages through SIB (Synthetic Intelligence Brain)
 * for deep reasoning and cognition like a human brain.
 * 
 * SIB considers:
 * - User profile & demographics
 * - Recent interactions & conversation history
 * - Medical history & prescriptions
 * - Appointments & health data
 * - Context-aware intelligent responses
 * 
 * Architecture:
 * WhatsApp Message → SIB Brain → Deep Reasoning → Response
 */

import axios from 'axios';
import whatsAppUserContextService from './whatsapp-user-context.service.js';
import agenticBookingService from './whatsapp-agentic-booking.service.js';
import detectEmergencyKeywords from '../utils/emergencyKeywords.js';
import detectAppointmentIntent from '../utils/appointmentIntent.js';

// SIB FastAPI URL
const SIB_URL = process.env.SIB_URL || 'http://localhost:8001';

class WhatsAppSIBBrainService {
  constructor() {
    this.doctorName = 'Dr. iSHA';
    this.sibTimeout = 10000; // 10 seconds timeout for faster WhatsApp replies
    this.enabled = true;
  }

  /**
   * Main entry point - Process WhatsApp message through SIB Brain
   */
  async processMessage(phoneNumber, messageBody, profileName) {
    const startTime = Date.now();
    
    try {
      console.log('🧠 SIB Brain processing WhatsApp message:', {
        phone: phoneNumber.substring(0, 8) + '***',
        messageLength: messageBody.length,
        profile: profileName
      });

      // 1. Get comprehensive user context from database
      const userContext = await this.getEnrichedUserContext(phoneNumber);
      
      // 2. Store incoming message
      await whatsAppUserContextService.addToConversationHistory(phoneNumber, {
        role: 'user',
        content: messageBody,
        profileName,
        timestamp: new Date().toISOString()
      });

      // 3. Check for emergency (always handle locally for speed)
      const emergencyCheck = detectEmergencyKeywords(messageBody);
      if (emergencyCheck.isEmergency) {
        console.log('🚨 Emergency detected, handling locally for speed');
        return this.handleEmergencyLocally(userContext, emergencyCheck);
      }

      // 4. Check if this is an active booking session (handle locally for state consistency)
      // IMPORTANT: await since getSessionState is now async (Redis-backed)
      const bookingSession = await agenticBookingService.getSessionState(phoneNumber);
      const appointmentIntent = detectAppointmentIntent(messageBody);
      
      console.log('📅 Checking booking session for:', phoneNumber.substring(0, 8) + '***', 
                  'state:', bookingSession.state);
      
      const isActiveBookingSession = bookingSession.state !== 'idle';
      const isBookingIntent = appointmentIntent.matched && 
        (appointmentIntent.action === 'book' || appointmentIntent.action === 'schedule' ||
         appointmentIntent.action === 'find' || appointmentIntent.action === 'visit');
      
      const isCheckupRequest = messageBody.toLowerCase().includes('health check') || 
                               messageBody.toLowerCase().includes('checkup');

      if (isActiveBookingSession || isBookingIntent || isCheckupRequest) {
        if (!userContext.identityVerified) return { success: false, shouldReply: true, response: "Please verify your account before booking." };
        console.log('📅 Booking intent detected, using agentic booking service');
        const agenticResponse = await agenticBookingService.processBookingIntent(
          phoneNumber, 
          messageBody, 
          userContext
        );
        
        await this.saveResponse(phoneNumber, agenticResponse.response);
        
        return {
          ...agenticResponse,
          isAgentic: true,
          bookingState: agenticResponse.currentState,
          provider: 'agentic-booking',
          processingTime: Date.now() - startTime
        };
      }

      // 5. Route through SIB Brain for deep reasoning
      console.log('🧠 Routing to SIB Brain for deep reasoning...');
      const sibResponse = await this.consultSIBBrain(
        messageBody,
        userContext,
        profileName
      );

      console.log('📤 SIB response received, provider:', sibResponse.provider);
      
      // Save response to history
      await this.saveResponse(phoneNumber, sibResponse.response);

      return {
        success: true,
        shouldReply: true,
        response: sibResponse.response,
        provider: sibResponse.provider || 'sib-brain',
        reasoning: sibResponse.reasoning,
        confidence: sibResponse.confidence,
        processingTime: Date.now() - startTime,
        userContext: {
          isKnownUser: userContext.isKnownUser,
          userId: userContext.user?.id,
          name: userContext.user?.firstName
        }
      };

    } catch (error) {
      console.error('❌ SIB Brain Error:', error);
      
      // Fallback response
      return {
        success: false,
        shouldReply: true,
        response: `I apologize, I'm having trouble processing your request right now. Please try again or call our helpline at 1800-XXX-XXXX for immediate assistance.\n\n- ${this.doctorName}`,
        error: error.message,
        provider: 'fallback',
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Consult SIB Brain for deep reasoning
   */
  async consultSIBBrain(message, userContext, profileName) {
    try {
      // Build comprehensive context for SIB
      console.log('🔧 Building SIB payload...');

      
      console.log('🧠 Consulting SIB Brain at', SIB_URL);



      // Call SIB Chat endpoint
      const response = await channelChat({ channel: 'whatsapp-legacy',
        binding: userContext.identityVerified ? userContext.phoneNumber : randomUUID(),
        owner: JSON.stringify(['whatsapp-legacy', userContext.phoneNumber || profileName || 'anonymous']),
        message, personal: false });

      const result = response.data;
      
      console.log('✅ SIB Brain response:', {
        provider: result.provider,
        hasResponse: !!result.chat_answer,
        turnCount: result.turn_count
      });

      // Format response for WhatsApp - with null safety
      let formattedResponse = result.chat_answer || result.answer;
      
      // Handle case where SIB returns no response
      if (!formattedResponse) {
        console.warn('⚠️ SIB returned empty response, using fallback');
        return this.fallbackReasoning(message, userContext, profileName);
      }
      
      // Add personalization and signature
      if (userContext.isKnownUser && userContext.user?.firstName) {
        if (!formattedResponse.toLowerCase().includes(userContext.user.firstName.toLowerCase())) {
          formattedResponse = `Hi ${userContext.user.firstName}! ${formattedResponse}`;
        }
      }

      // Add signature if not present
      if (!formattedResponse.includes('Dr. iSHA') && !formattedResponse.includes('iSHA')) {
        formattedResponse += `\n\n- ${this.doctorName} 🩺`;
      }

      return {
        response: formattedResponse,
        provider: result.provider || 'sib',
        reasoning: result.reasoning,
        confidence: result.confidence,
        conversationId: result.conversation_id,
        turnCount: result.turn_count,
        risk: result.risk
      };

    } catch (error) {
      console.error('❌ SIB API Error:', error.message);
      if (error.response) {
        console.error('❌ SIB Response Error:', {
          status: error.response.status,
          category: 'upstream_error'
        });
      } else if (error.code) {
        console.error('❌ SIB Connection Error:', error.code);
      }
      
      // If SIB is unavailable, use fallback reasoning
      return this.fallbackReasoning(message, userContext, profileName);
    }
  }

  /**
   * Build comprehensive payload for SIB
   */
  buildSIBPayload(message, userContext, profileName) {
    try {
      // Create a patient ID from phone or user ID
      const patientId = userContext.isKnownUser 
        ? `user_${userContext.user.id}` 
        : `whatsapp_${(userContext.phoneNumber || '').replace(/[^\d]/g, '')}`;

      // Build patient data object with all context
      const patientData = {
        // Basic demographics
        name: userContext.user?.firstName || profileName || 'User',
        age: this.calculateAge(userContext.user?.dateOfBirth),
        gender: userContext.user?.gender,
        bloodGroup: userContext.user?.bloodType || userContext.user?.bloodGroup,
        location: userContext.user?.address_city,
        
        // Medical history
        medicalConditions: userContext.medicalConditions || [],
        allergies: userContext.allergies || [],
        
        // Current medications
        activeMedications: (userContext.activeMedications || []).map(m => ({
          name: m.medicineName || m.name,
          dosage: m.dosage,
          frequency: m.frequency
        })),
        
        // Recent health data
        recentVitals: userContext.healthData?.recent || {},
        
        // Appointment history
        recentAppointments: (userContext.appointments?.recent || []).slice(0, 5).map(a => ({
          doctor: a.doctorName,
          specialization: a.specialization,
          date: a.appointmentDate,
          status: a.status
        })),
        
        upcomingAppointments: (userContext.appointments?.upcoming || []).slice(0, 3).map(a => ({
          doctor: a.doctorName,
          date: a.appointmentDate,
          time: a.appointmentTime
        })),
        
        // Recent prescriptions
        recentPrescriptions: (userContext.prescriptions || []).slice(0, 3).map(p => ({
          doctor: p.doctorName,
          date: p.prescriptionDate,
          diagnosis: p.diagnosis
        })),
        
        // Conversation context
        recentInteractions: (userContext.conversationHistory || []).slice(-10),
        
        // User preferences
        preferredLanguage: userContext.preferredLanguage || 'en',
        isKnownUser: userContext.isKnownUser,
        memberSince: userContext.user?.createdAt
      };

      // Build the message with deep context
      const enrichedMessage = `
[WhatsApp User Context]
${userContext.isKnownUser ? `Known User: ${patientData.name} (ID: ${userContext.user?.id})` : 'Anonymous User'}
${patientData.age ? `Age: ${patientData.age} years` : ''}
${patientData.gender ? `Gender: ${patientData.gender}` : ''}
${patientData.bloodGroup ? `Blood Group: ${patientData.bloodGroup}` : ''}
${patientData.activeMedications.length > 0 ? `Current Medications: ${patientData.activeMedications.map(m => m.name).join(', ')}` : ''}
${patientData.medicalConditions.length > 0 ? `Medical Conditions: ${patientData.medicalConditions.join(', ')}` : ''}
${patientData.upcomingAppointments.length > 0 ? `Upcoming Appointments: ${patientData.upcomingAppointments.length}` : ''}

[Recent Conversation Summary]
${this.summarizeRecentInteractions(patientData.recentInteractions)}

[Current Message]
${message}
`.trim();

      console.log('✅ SIB payload built successfully for:', patientId);

      return {
        patient_id: patientId,
        message: enrichedMessage,
        include_risk: true,
        patient_data: patientData
      };
    } catch (error) {
      console.error('❌ Error building SIB payload:', error.message);
      // Return minimal payload
      return {
        patient_id: `whatsapp_unknown`,
        message: message,
        include_risk: false,
        patient_data: { name: profileName || 'User', isKnownUser: false }
      };
    }
  }

  /**
   * Summarize recent interactions for context
   */
  summarizeRecentInteractions(interactions) {
    if (!interactions || interactions.length === 0) {
      return 'No recent conversation history.';
    }

    return interactions
      .slice(-5) // Last 5 messages
      .map(i => `${i.role}: ${i.content?.substring(0, 100)}${i.content?.length > 100 ? '...' : ''}`)
      .join('\n');
  }

  /**
   * Calculate age from date of birth
   */
  calculateAge(dateOfBirth) {
    if (!dateOfBirth) return null;
    const dob = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }

  /**
   * Get enriched user context with all relevant data
   */
  async getEnrichedUserContext(phoneNumber) {
    try {
      // Use existing user context service
      const context = await whatsAppUserContextService.getFullUserContext(phoneNumber);
      
      // Always include phone number in context
      context.phoneNumber = phoneNumber;
      
      // Enrich with additional data if user is known
      if (context.isKnownUser && context.user?.id) {
        // Get recent interactions summary
        const recentSummary = await whatsAppUserContextService.getConversationHistory(phoneNumber);
        context.conversationHistory = recentSummary || [];
        
        // Get user preferences if available
        context.preferredLanguage = context.user?.preferredLanguage || 'en';
      }
      
      return context;
    } catch (error) {
      console.error('Error getting enriched context:', error);
      return {
        isKnownUser: false,
        phoneNumber,
        user: null,
        conversationHistory: []
      };
    }
  }

  /**
   * Handle emergency locally for speed
   */
  handleEmergencyLocally(userContext, emergencyCheck) {
    const userName = userContext.isKnownUser ? userContext.user?.firstName : 'there';
    
    let response = `🚨 *EMERGENCY DETECTED*\n\n`;
    response += `${userName}, I understand this is urgent. `;
    
    if (emergencyCheck.severity === 'critical') {
      response += `Please call *112* or *108* (Ambulance) IMMEDIATELY.\n\n`;
    }
    
    response += `*Immediate steps:*\n`;
    response += `1. Call emergency services: *112*\n`;
    response += `2. Stay calm and don't move unless necessary\n`;
    response += `3. If possible, have someone stay with you\n\n`;
    
    if (userContext.isKnownUser && userContext.user?.bloodType) {
      response += `📋 Your blood group: *${userContext.user.bloodType}*\n`;
    }
    
    if (userContext.activeMedications?.length > 0) {
      response += `💊 Current medications: ${userContext.activeMedications.slice(0, 3).map(m => m.name || m.medicineName || m).join(', ')}\n`;
      response += `(Share this with emergency responders)\n`;
    }
    
    response += `\n🏥 Our emergency coordinator has been notified and will contact you shortly.`;
    response += `\n\n- ${this.doctorName} 🩺`;
    
    return {
      success: true,
      shouldReply: true,
      response,
      isEmergency: true,
      emergencyType: emergencyCheck.category,
      severity: emergencyCheck.severity,
      escalate: true,
      notifyTeam: true,
      provider: 'emergency-handler'
    };
  }

  /**
   * Fallback reasoning when SIB is unavailable
   */
  async fallbackReasoning() {
    return { success: false, shouldReply: true, provider: 'unavailable',
      response: 'Medical guidance is temporarily unavailable. If this is urgent, seek immediate medical care.' };
  }

  /** Save non-clinical delivery state. */

  async saveResponse(phoneNumber, response) {
    try {
      await whatsAppUserContextService.addToConversationHistory(phoneNumber, {
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error saving response to history:', error.message);
    }
  }

  /**
   * Check SIB health
   */
  async checkSIBHealth() {
    try {
      const response = await axios.get(`${SIB_URL}/health`, {
        timeout: 5000
      });
      return {
        healthy: true,
        status: response.data
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
const whatsAppSIBBrainService = new WhatsAppSIBBrainService();
export default whatsAppSIBBrainService;
