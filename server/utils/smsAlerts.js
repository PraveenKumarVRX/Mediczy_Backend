import { SMSService, SMSTemplateManager } from '../services/sms.service.js';
import OTP from '../models/otp.model.intelligent.js';

/**
 * SMS Alert & Notification Helper
 * Centralized SMS sending for various use cases
 */

// Initialize SMS service
let smsService = null;
const smsConfig = {
  provider: process.env.SMS_PROVIDER || 'twilio',
  apiKey: process.env.SMS_API_KEY || process.env.TWILIO_ACCOUNT_SID,
  apiSecret: process.env.SMS_API_SECRET || process.env.TWILIO_AUTH_TOKEN,
  senderId: process.env.SMS_SENDER_ID || process.env.TWILIO_PHONE_NUMBER || 'MEDICZY'
};

if (smsConfig.apiKey && smsConfig.apiSecret) {
  smsService = new SMSService(smsConfig);
  console.log('✅ SMS Alert service initialized');
} else {
  console.warn('⚠️  SMS Alert service not configured. Set SMS credentials in .env');
}

/**
 * Send appointment reminder
 */
export async function sendAppointmentReminder({ phone, name, doctor, date, time }) {
  if (!smsService) {
    console.warn('SMS service not configured');
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    const message = SMSTemplateManager.renderTemplate('appointment_reminder', {
      name,
      doctor,
      date,
      time
    });

    const result = await smsService.sendSMS({ to: phone, message });
    console.log(`✅ Appointment reminder sent to ${phone}`);
    return result;
  } catch (error) {
    console.error('Error sending appointment reminder:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send appointment confirmation
 */
export async function sendAppointmentConfirmation({ phone, name, doctor, date, time, appointmentId }) {
  if (!smsService) {
    console.warn('SMS service not configured');
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    const message = SMSTemplateManager.renderTemplate('appointment_confirmation', {
      name,
      doctor,
      date,
      time,
      id: appointmentId
    });

    const result = await smsService.sendSMS({ to: phone, message });
    console.log(`✅ Appointment confirmation sent to ${phone}`);
    return result;
  } catch (error) {
    console.error('Error sending appointment confirmation:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send OTP
 */
export async function sendOTPSMS({ phone, purpose = 'login' }) {
  if (!smsService) {
    console.warn('SMS service not configured');
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    // Generate OTP
    const otp = await OTP.generate({ phone, purpose, expiryMinutes: 10 });

    // Send SMS
    const message = SMSTemplateManager.renderTemplate('otp_verification', {
      otp: otp.code
    });

    const result = await smsService.sendSMS({ 
      to: phone, 
      message,
      templateId: process.env.SMS_OTP_TEMPLATE_ID
    });
    console.log(`✅ OTP sent to ${phone}: ${otp.code}`);
    
    return {
      success: true,
      otpId: otp.id,
      expiresAt: otp.expiresAt,
      ...(process.env.NODE_ENV === 'development' && { otp: otp.code })
    };
  } catch (error) {
    console.error('Error sending OTP SMS:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send prescription ready notification
 */
export async function sendPrescriptionReadyAlert({ phone, name, pharmacy, orderId }) {
  if (!smsService) {
    console.warn('SMS service not configured');
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    const message = SMSTemplateManager.renderTemplate('prescription_ready', {
      name,
      pharmacy,
      orderId
    });

    const result = await smsService.sendSMS({ to: phone, message });
    console.log(`✅ Prescription ready alert sent to ${phone}`);
    return result;
  } catch (error) {
    console.error('Error sending prescription alert:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send test results notification
 */
export async function sendTestResultsAlert({ phone, name }) {
  if (!smsService) {
    console.warn('SMS service not configured');
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    const message = SMSTemplateManager.renderTemplate('test_results', {
      name
    });

    const result = await smsService.sendSMS({ to: phone, message });
    console.log(`✅ Test results alert sent to ${phone}`);
    return result;
  } catch (error) {
    console.error('Error sending test results alert:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send payment reminder
 */
export async function sendPaymentReminder({ phone, name, amount, service, dueDate }) {
  if (!smsService) {
    console.warn('SMS service not configured');
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    const message = SMSTemplateManager.renderTemplate('payment_reminder', {
      name,
      amount,
      service,
      dueDate
    });

    const result = await smsService.sendSMS({ to: phone, message });
    console.log(`✅ Payment reminder sent to ${phone}`);
    return result;
  } catch (error) {
    console.error('Error sending payment reminder:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send welcome message
 */
export async function sendWelcomeMessage({ phone, name }) {
  if (!smsService) {
    console.warn('SMS service not configured');
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    const message = SMSTemplateManager.renderTemplate('welcome_message', {
      name
    });

    const result = await smsService.sendSMS({ to: phone, message });
    console.log(`✅ Welcome message sent to ${phone}`);
    return result;
  } catch (error) {
    console.error('Error sending welcome message:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send emergency alert
 */
export async function sendEmergencyAlert({ phone, patientName, location, contactPhone }) {
  if (!smsService) {
    console.warn('SMS service not configured');
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    const message = SMSTemplateManager.renderTemplate('emergency_alert', {
      name: patientName,
      location,
      phone: contactPhone
    });

    const result = await smsService.sendSMS({ to: phone, message });
    console.log(`✅ Emergency alert sent to ${phone}`);
    return result;
  } catch (error) {
    console.error('Error sending emergency alert:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send medication reminder
 */
export async function sendMedicationReminder({ phone, name, medication, time, nextDose }) {
  if (!smsService) {
    console.warn('SMS service not configured');
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    const message = SMSTemplateManager.renderTemplate('medication_reminder', {
      name,
      medication,
      time,
      nextDose
    });

    const result = await smsService.sendSMS({ to: phone, message });
    console.log(`✅ Medication reminder sent to ${phone}`);
    return result;
  } catch (error) {
    console.error('Error sending medication reminder:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send insurance claim update
 */
export async function sendInsuranceClaimUpdate({ phone, claimId, status, amount }) {
  if (!smsService) {
    console.warn('SMS service not configured');
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    const message = SMSTemplateManager.renderTemplate('insurance_claim', {
      claimId,
      status,
      amount
    });

    const result = await smsService.sendSMS({ to: phone, message });
    console.log(`✅ Insurance claim update sent to ${phone}`);
    return result;
  } catch (error) {
    console.error('Error sending insurance claim update:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send custom SMS (for admin use)
 */
export async function sendCustomSMS({ phone, message }) {
  if (!smsService) {
    console.warn('SMS service not configured');
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    const result = await smsService.sendSMS({ to: phone, message });
    console.log(`✅ Custom SMS sent to ${phone}`);
    return result;
  } catch (error) {
    console.error('Error sending custom SMS:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send bulk SMS (for admin campaigns)
 */
export async function sendBulkSMS({ recipients, message, templateId, variables }) {
  if (!smsService) {
    console.warn('SMS service not configured');
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    const messages = recipients.map(recipient => ({
      to: recipient.phone,
      message: templateId 
        ? SMSTemplateManager.renderTemplate(templateId, { ...variables, ...recipient.variables })
        : message
    }));

    const results = await smsService.sendBulkSMS(messages);
    console.log(`✅ Bulk SMS sent to ${recipients.length} recipients`);
    return results;
  } catch (error) {
    console.error('Error sending bulk SMS:', error);
    return { success: false, error: error.message };
  }
}

// Export all functions
export default {
  sendAppointmentReminder,
  sendAppointmentConfirmation,
  sendOTPSMS,
  sendPrescriptionReadyAlert,
  sendTestResultsAlert,
  sendPaymentReminder,
  sendWelcomeMessage,
  sendEmergencyAlert,
  sendMedicationReminder,
  sendInsuranceClaimUpdate,
  sendCustomSMS,
  sendBulkSMS
};
