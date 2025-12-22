// Email Service Utility for SMTP Integration
// This would typically connect to your backend API

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
  private baseUrl = '/api/email'; // Your backend API base URL

  /**
   * Test SMTP configuration
   */
  async testSMTPConfig(configId: string, testEmail: string): Promise<SMTPTestResult> {
    try {
      const startTime = Date.now();
      
      // Simulate API call to backend
      const response = await fetch(`${this.baseUrl}/smtp/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify({
          configId,
          testEmail,
          testType: 'connection_and_send'
        })
      });

      const result = await response.json();
      const latency = Date.now() - startTime;

      if (response.ok) {
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
      const response = await fetch(`${this.baseUrl}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify(emailRequest)
      });

      const result = await response.json();

      if (response.ok) {
        return result;
      } else {
        throw new Error(result.message || 'Failed to send email');
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Email send failed');
    }
  }

  /**
   * Get email delivery statistics
   */
  async getEmailStats(period: 'day' | 'week' | 'month' | 'year' = 'month') {
    try {
      const response = await fetch(`${this.baseUrl}/stats?period=${period}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });

      if (response.ok) {
        return await response.json();
      } else {
        throw new Error('Failed to fetch email statistics');
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Stats fetch failed');
    }
  }

  /**
   * Validate email template with variables
   */
  async validateTemplate(templateId: string, variables: Record<string, any>) {
    try {
      const response = await fetch(`${this.baseUrl}/templates/${templateId}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify({ variables })
      });

      return await response.json();
    } catch (error) {
      throw new Error('Template validation failed');
    }
  }

  /**
   * Preview email template with variables
   */
  async previewTemplate(templateId: string, variables: Record<string, any>) {
    try {
      const response = await fetch(`${this.baseUrl}/templates/${templateId}/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify({ variables })
      });

      if (response.ok) {
        return await response.json();
      } else {
        throw new Error('Template preview failed');
      }
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
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom.toISOString());
      if (filters.dateTo) params.append('dateTo', filters.dateTo.toISOString());
      if (filters.recipient) params.append('recipient', filters.recipient);
      if (filters.limit) params.append('limit', filters.limit.toString());
      if (filters.offset) params.append('offset', filters.offset.toString());

      const response = await fetch(`${this.baseUrl}/logs?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });

      if (response.ok) {
        return await response.json();
      } else {
        throw new Error('Failed to fetch email logs');
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Logs fetch failed');
    }
  }

  /**
   * Retry failed email
   */
  async retryEmail(emailLogId: string): Promise<EmailSendResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/logs/${emailLogId}/retry`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });

      const result = await response.json();

      if (response.ok) {
        return result;
      } else {
        throw new Error(result.message || 'Failed to retry email');
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Email retry failed');
    }
  }

  /**
   * Send bulk emails
   */
  async sendBulkEmails(emails: EmailSendRequest[]) {
    try {
      const response = await fetch(`${this.baseUrl}/bulk-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify({ emails })
      });

      if (response.ok) {
        return await response.json();
      } else {
        throw new Error('Bulk email send failed');
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Bulk send failed');
    }
  }

  /**
   * Get SMTP configuration health status
   */
  async getSMTPHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/smtp/health`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });

      if (response.ok) {
        return await response.json();
      } else {
        throw new Error('Failed to fetch SMTP health');
      }
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