// Email Service Utility for SMTP Integration
// This would typically connect to your backend API

import api from '@/utils/api';

export interface SMTPTestResult {
  success: boolean;
  message: string;
  latency?: number;
  error?: string;
}

export interface EmailSendRequest {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  htmlContent?: string;
  textContent?: string;
  templateId?: string;
  templateVariables?: Record<string, any>;
  smtpConfigId?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  scheduledAt?: Date;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType: string;
  }>;
}

export interface EmailSendResponse {
  messageId: string;
  status: 'queued' | 'sent' | 'failed';
  message: string;
  estimatedDelivery?: Date;
}

export class EmailService {
  // Shared Axios client already uses baseURL '/api', so do not include '/api' here.
  private baseUrl = '/email'; // Your backend API base URL

  /**
   * Test SMTP configuration
   */
  async testSMTPConfig(configId: string, testEmail: string): Promise<SMTPTestResult> {
    try {
      const startTime = Date.now();

      const response = await api.post(
        `${this.baseUrl}/smtp/test`,
        {
          configId,
          testEmail,
          testType: 'connection_and_send',
        }
      );

      const result = response.data;
      const latency = Date.now() - startTime;

      if ((result as any)?.success !== false) {
        return {
          success: true,
          message: `Test email sent successfully to ${testEmail}`,
          latency
        };
      } else {
        return {
          success: false,
          message: result.message || 'SMTP test failed',
          error: result.error
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'Network error during SMTP test',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send email using configured SMTP
   */
  async sendEmail(emailRequest: EmailSendRequest): Promise<EmailSendResponse> {
    try {
      const response = await api.post(`${this.baseUrl}/send`, emailRequest);
      return response.data;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Email send failed');
    }
  }

  /**
   * Get email delivery statistics
   */
  async getEmailStats(period: 'day' | 'week' | 'month' | 'year' = 'month') {
    try {
      const response = await api.get(`${this.baseUrl}/stats`, { params: { period } });
      return response.data;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Stats fetch failed');
    }
  }

  /**
   * Validate email template with variables
   */
  async validateTemplate(templateId: string, variables: Record<string, any>) {
    try {
      const response = await api.post(`${this.baseUrl}/templates/${templateId}/validate`, { variables });
      return response.data;
    } catch (error) {
      throw new Error('Template validation failed');
    }
  }

  /**
   * Preview email template with variables
   */
  async previewTemplate(templateId: string, variables: Record<string, any>) {
    try {
      const response = await api.post(`${this.baseUrl}/templates/${templateId}/preview`, { variables });
      return response.data;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Preview failed');
    }
  }

  /**
   * Get email logs with filtering
   */
  async getEmailLogs(filters: {
    status?: string;
    dateFrom?: Date;
    dateTo?: Date;
    recipient?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    try {
      const params: Record<string, any> = {};
      if (filters.status) params.status = filters.status;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom.toISOString();
      if (filters.dateTo) params.dateTo = filters.dateTo.toISOString();
      if (filters.recipient) params.recipient = filters.recipient;
      if (filters.limit) params.limit = filters.limit;
      if (filters.offset) params.offset = filters.offset;

      const response = await api.get(`${this.baseUrl}/logs`, { params });
      return response.data;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Logs fetch failed');
    }
  }

  /**
   * Retry failed email
   */
  async retryEmail(emailLogId: string): Promise<EmailSendResponse> {
    try {
      const response = await api.post(`${this.baseUrl}/logs/${emailLogId}/retry`, {});
      return response.data;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Email retry failed');
    }
  }

  /**
   * Send bulk emails
   */
  async sendBulkEmails(emails: EmailSendRequest[]) {
    try {
      const response = await api.post(`${this.baseUrl}/bulk-send`, { emails });
      return response.data;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Bulk send failed');
    }
  }

  /**
   * Get SMTP configuration health status
   */
  async getSMTPHealth() {
    try {
      const response = await api.get(`${this.baseUrl}/smtp/health`);
      return response.data;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Health check failed');
    }
  }
}

// Export singleton instance
export const emailService = new EmailService();

// Email notification types for the platform
export const EMAIL_NOTIFICATION_TYPES = {
  // Appointment related
  APPOINTMENT_CONFIRMED: 'appointment_confirmed',
  APPOINTMENT_REMINDER: 'appointment_reminder',
  APPOINTMENT_CANCELLED: 'appointment_cancelled',
  APPOINTMENT_RESCHEDULED: 'appointment_rescheduled',
  
  // Billing related
  INVOICE_GENERATED: 'invoice_generated',
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_FAILED: 'payment_failed',
  PAYMENT_REMINDER: 'payment_reminder',
  
  // User management
  USER_WELCOME: 'user_welcome',
  PASSWORD_RESET: 'password_reset',
  ACCOUNT_VERIFICATION: 'account_verification',
  ACCOUNT_SUSPENDED: 'account_suspended',
  
  // System notifications
  SYSTEM_MAINTENANCE: 'system_maintenance',
  SECURITY_ALERT: 'security_alert',
  BACKUP_STATUS: 'backup_status',
  PERFORMANCE_ALERT: 'performance_alert',
  
  // Medical related
  PRESCRIPTION_READY: 'prescription_ready',
  LAB_RESULTS_READY: 'lab_results_ready',
  HEALTH_REMINDER: 'health_reminder',
  MEDICATION_REMINDER: 'medication_reminder',
  
  // Marketing
  NEWSLETTER: 'newsletter',
  PROMOTIONAL_OFFER: 'promotional_offer',
  HEALTH_TIPS: 'health_tips',
  PLATFORM_UPDATES: 'platform_updates'
} as const;

export type EmailNotificationType = typeof EMAIL_NOTIFICATION_TYPES[keyof typeof EMAIL_NOTIFICATION_TYPES];

/**
 * Helper function to format email addresses
 */
export function formatEmailAddress(email: string, name?: string): string {
  if (name) {
    return `"${name}" <${email}>`;
  }
  return email;
}

/**
 * Helper function to validate email address
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Helper function to validate multiple email addresses
 */
export function validateEmailList(emails: string[]): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  
  emails.forEach(email => {
    if (isValidEmail(email.trim())) {
      valid.push(email.trim());
    } else {
      invalid.push(email.trim());
    }
  });
  
  return { valid, invalid };
}