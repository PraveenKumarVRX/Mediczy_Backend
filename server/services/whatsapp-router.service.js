/**
 * WhatsApp Router Service
 * Intelligent routing for multi-number WhatsApp messaging
 */

import WhatsAppNumber from '../models/whatsapp-number.model.js';
import whatsAppService from './whatsapp.service.js';

class WhatsAppRouterService {
  /**
   * Send message using intelligent routing
   * Automatically selects the best number based on route and availability
   */
  async sendMessage({ to, content, route, provider = null, templateName = null, templateParams = null, priority = 'normal' }) {
    try {
      // Get the best number for this route
      const whatsappNumber = await WhatsAppNumber.getBestNumberForRoute(route, provider);
      
      if (!whatsappNumber) {
        throw new Error(`No available WhatsApp number found for route: ${route}`);
      }

      // Check if number is available for sending
      if (!whatsappNumber.isAvailable()) {
        throw new Error(`WhatsApp number ${whatsappNumber.displayName} is not available (limits reached or outside operating hours)`);
      }

      // Configure WhatsApp service to use this provider
      whatsAppService.updateConfig({
        provider: whatsappNumber.provider
      });

      // Prepare message data
      const messageData = {
        to,
        from: whatsappNumber.phoneNumber,
        content,
        type: templateName ? 'template' : 'text',
        templateName,
        templateParams,
        route,
        whatsappNumberId: whatsappNumber._id,
        priority
      };

      // Send message through WhatsApp service
      const result = await whatsAppService.sendMessage(messageData);

      // Increment message count
      await whatsappNumber.incrementMessageCount('sent');

      // Log the routing decision
      console.log(`WhatsApp message routed via: ${whatsappNumber.displayName} (${whatsappNumber.phoneNumber}) - Route: ${route}`);

      return {
        success: true,
        messageId: result.id,
        whatsappNumber: {
          id: whatsappNumber._id,
          displayName: whatsappNumber.displayName,
          phoneNumber: whatsappNumber.phoneNumber,
          provider: whatsappNumber.provider,
          route: whatsappNumber.route
        },
        provider: whatsappNumber.provider,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      throw error;
    }
  }

  /**
   * Send appointment reminder
   */
  async sendAppointmentReminder({ to, patientName, doctorName, appointmentDate, appointmentTime }) {
    const content = `Hello ${patientName}, this is a reminder for your appointment with Dr. ${doctorName} on ${appointmentDate} at ${appointmentTime}. Please reply YES to confirm or NO to reschedule.`;
    
    return await this.sendMessage({
      to,
      content,
      route: 'appointments',
      templateName: 'appointment_reminder',
      templateParams: {
        patientName,
        doctorName,
        appointmentDate,
        appointmentTime
      }
    });
  }

  /**
   * Send prescription notification
   */
  async sendPrescriptionNotification({ to, patientName, doctorName, pharmacyLocation, pharmacyHours }) {
    const content = `Hello ${patientName}, your prescription from Dr. ${doctorName} is ready for pickup at ${pharmacyLocation}. Pharmacy hours: ${pharmacyHours}.`;
    
    return await this.sendMessage({
      to,
      content,
      route: 'prescriptions',
      templateName: 'prescription_ready',
      templateParams: {
        patientName,
        doctorName,
        pharmacyLocation,
        pharmacyHours
      }
    });
  }

  /**
   * Send test results notification
   */
  async sendTestResultsNotification({ to, patientName, testName }) {
    const content = `Hello ${patientName}, your test results for ${testName} are now available. Please log into your Mediczy account to view your results.`;
    
    return await this.sendMessage({
      to,
      content,
      route: 'test-results',
      templateName: 'test_results_ready',
      templateParams: {
        patientName,
        testName
      }
    });
  }

  /**
   * Send emergency alert
   */
  async sendEmergencyAlert({ to, message }) {
    return await this.sendMessage({
      to,
      content: `⚠️ EMERGENCY ALERT: ${message}`,
      route: 'emergency',
      priority: 'urgent'
    });
  }

  /**
   * Send general support message
   */
  async sendSupportMessage({ to, message }) {
    return await this.sendMessage({
      to,
      content: message,
      route: 'general-support'
    });
  }

  /**
   * Send teleconsultation link
   */
  async sendTeleconsultationLink({ to, patientName, doctorName, consultationLink, scheduledTime }) {
    const content = `Hello ${patientName}, your teleconsultation with Dr. ${doctorName} is scheduled for ${scheduledTime}. Join here: ${consultationLink}`;
    
    return await this.sendMessage({
      to,
      content,
      route: 'teleconsultation'
    });
  }

  /**
   * Send billing/payment reminder
   */
  async sendPaymentReminder({ to, patientName, amount, dueDate }) {
    const content = `Hello ${patientName}, this is a reminder that your payment of ₹${amount} is due on ${dueDate}. Please complete your payment to avoid service interruption.`;
    
    return await this.sendMessage({
      to,
      content,
      route: 'billing'
    });
  }

  /**
   * Send medication reminder
   */
  async sendMedicationReminder({ to, patientName, medicationName, dosage, time }) {
    const content = `Hello ${patientName}, it's time to take your medication: ${medicationName} - ${dosage}. Time: ${time}`;
    
    return await this.sendMessage({
      to,
      content,
      route: 'reminders'
    });
  }

  /**
   * Get available numbers for a route
   */
  async getAvailableNumbersForRoute(route, provider = null) {
    const where = {
      route,
      active: true,
      verified: true
    };
    
    if (provider) {
      where.provider = provider;
    }
    
    const numbers = await WhatsAppNumber.findAll({
      where,
      order: [['priority', 'ASC']]
    });
    
    return numbers.filter(num => num.isAvailable());
  }

  /**
   * Get routing statistics
   */
  async getRoutingStats() {
    const numbers = await WhatsAppNumber.findAll({ 
      where: { active: true }
    });
    
    const stats = {
      totalActiveNumbers: numbers.length,
      availableNumbers: numbers.filter(n => n.isAvailable()).length,
      byRoute: {},
      byProvider: {},
      usage: {
        totalToday: 0,
        totalThisMonth: 0,
        capacity: {
          daily: 0,
          monthly: 0
        }
      }
    };
    
    numbers.forEach(num => {
      // Route statistics
      if (!stats.byRoute[num.route]) {
        stats.byRoute[num.route] = {
          total: 0,
          available: 0,
          messagesToday: 0,
          capacity: 0
        };
      }
      stats.byRoute[num.route].total++;
      if (num.isAvailable()) stats.byRoute[num.route].available++;
      stats.byRoute[num.route].messagesToday += num.stats.messagesToday || 0;
      stats.byRoute[num.route].capacity += num.dailyLimit || 0;
      
      // Provider statistics
      if (!stats.byProvider[num.provider]) {
        stats.byProvider[num.provider] = {
          total: 0,
          available: 0,
          messagesToday: 0
        };
      }
      stats.byProvider[num.provider].total++;
      if (num.isAvailable()) stats.byProvider[num.provider].available++;
      stats.byProvider[num.provider].messagesToday += num.stats.messagesToday || 0;
      
      // Overall usage
      stats.usage.totalToday += num.stats.messagesToday || 0;
      stats.usage.totalThisMonth += num.stats.messagesThisMonth || 0;
      stats.usage.capacity.daily += num.dailyLimit || 0;
      stats.usage.capacity.monthly += num.monthlyLimit || 0;
    });
    
    return stats;
  }

  /**
   * Test a specific WhatsApp number
   */
  async testNumber(numberId, testPhoneNumber, testMessage = 'This is a test message from Mediczy WhatsApp system.') {
    try {
      const whatsappNumber = await WhatsAppNumber.findByPk(numberId);
      
      if (!whatsappNumber) {
        throw new Error('WhatsApp number not found');
      }
      
      if (!whatsappNumber.active) {
        throw new Error('WhatsApp number is not active');
      }
      
      // Configure WhatsApp service to use this provider
      whatsAppService.updateConfig({
        provider: whatsappNumber.provider
      });
      
      // Send test message
      const result = await whatsAppService.sendMessage({
        to: testPhoneNumber,
        from: whatsappNumber.phoneNumber,
        content: testMessage,
        type: 'text'
      });
      
      return {
        success: true,
        messageId: result.id,
        whatsappNumber: {
          id: whatsappNumber.id,
          displayName: whatsappNumber.displayName,
          phoneNumber: whatsappNumber.phoneNumber,
          provider: whatsappNumber.provider
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error testing WhatsApp number:', error);
      throw error;
    }
  }

  /**
   * Bulk send messages (e.g., for campaigns)
   */
  async bulkSendMessages({ recipients, content, route, templateName = null, templateParams = null }) {
    const results = {
      total: recipients.length,
      sent: 0,
      failed: 0,
      errors: []
    };
    
    for (const recipient of recipients) {
      try {
        // Replace template parameters for each recipient
        const personalizedContent = templateParams 
          ? this.replaceTemplateParams(content, { ...templateParams, ...recipient })
          : content;
        
        await this.sendMessage({
          to: recipient.phoneNumber,
          content: personalizedContent,
          route,
          templateName,
          templateParams: { ...templateParams, ...recipient }
        });
        
        results.sent++;
        
        // Add small delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        results.failed++;
        results.errors.push({
          recipient: recipient.phoneNumber,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Replace template parameters in content
   */
  replaceTemplateParams(content, params) {
    let result = content;
    Object.keys(params).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, params[key]);
    });
    return result;
  }
}

export default new WhatsAppRouterService();
