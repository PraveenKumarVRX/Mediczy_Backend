import axios from 'axios';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  variables: string[];
}

interface EmailAlert {
  id: string;
  type: 'appointment_reminder' | 'payment_due' | 'system_notification' | 'welcome' | 'password_reset';
  recipient: string;
  subject: string;
  content: string;
  status: 'pending' | 'sent' | 'failed' | 'queued';
  scheduledAt?: string;
  sentAt?: string;
  errorMessage?: string;
  templateId?: string;
  variables?: Record<string, string>;
}

interface TestEmailRequest {
  to: string;
  subject: string;
  content: string;
  isHtml?: boolean;
}

class EmailService {
  private baseURL = '/api/email';

  // SMTP Configuration
  async getEmailConfig(): Promise<EmailConfig> {
    try {
      const response = await axios.get(`${this.baseURL}/config`);
      return response.data;
    } catch (error) {
      console.error('Failed to get email config:', error);
      throw error;
    }
  }

  async updateEmailConfig(config: EmailConfig): Promise<void> {
    try {
      await axios.put(`${this.baseURL}/config`, config);
    } catch (error) {
      console.error('Failed to update email config:', error);
      throw error;
    }
  }

  async testEmailConnection(config?: EmailConfig): Promise<{ success: boolean; message: string }> {
    try {
      const response = await axios.post(`${this.baseURL}/test-connection`, config || {});
      return response.data;
    } catch (error: any) {
      console.error('Email connection test failed:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Connection test failed'
      };
    }
  }

  // Email Templates
  async getEmailTemplates(): Promise<EmailTemplate[]> {
    try {
      const response = await axios.get(`${this.baseURL}/templates`);
      return response.data;
    } catch (error) {
      console.error('Failed to get email templates:', error);
      throw error;
    }
  }

  async createEmailTemplate(template: Omit<EmailTemplate, 'id'>): Promise<EmailTemplate> {
    try {
      const response = await axios.post(`${this.baseURL}/templates`, template);
      return response.data;
    } catch (error) {
      console.error('Failed to create email template:', error);
      throw error;
    }
  }

  async updateEmailTemplate(id: string, template: Partial<EmailTemplate>): Promise<EmailTemplate> {
    try {
      const response = await axios.put(`${this.baseURL}/templates/${id}`, template);
      return response.data;
    } catch (error) {
      console.error('Failed to update email template:', error);
      throw error;
    }
  }

  async deleteEmailTemplate(id: string): Promise<void> {
    try {
      await axios.delete(`${this.baseURL}/templates/${id}`);
    } catch (error) {
      console.error('Failed to delete email template:', error);
      throw error;
    }
  }

  // Email Alerts & Sending
  async getEmailAlerts(page = 1, limit = 20, status?: string): Promise<{
    alerts: EmailAlert[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(status && { status })
      });
      const response = await axios.get(`${this.baseURL}/alerts?${params}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get email alerts:', error);
      throw error;
    }
  }

  async sendTestEmail(request: TestEmailRequest): Promise<{ success: boolean; message: string }> {
    try {
      const response = await axios.post(`${this.baseURL}/send-test`, request);
      return response.data;
    } catch (error: any) {
      console.error('Failed to send test email:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to send test email'
      };
    }
  }

  async sendEmail({
    to,
    subject,
    content,
    templateId,
    variables,
    isHtml = true
  }: {
    to: string;
    subject: string;
    content?: string;
    templateId?: string;
    variables?: Record<string, string>;
    isHtml?: boolean;
  }): Promise<{ success: boolean; message: string; alertId?: string }> {
    try {
      const response = await axios.post(`${this.baseURL}/send`, {
        to,
        subject,
        content,
        templateId,
        variables,
        isHtml
      });
      return response.data;
    } catch (error: any) {
      console.error('Failed to send email:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to send email'
      };
    }
  }

  async retryFailedEmail(alertId: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await axios.post(`${this.baseURL}/alerts/${alertId}/retry`);
      return response.data;
    } catch (error: any) {
      console.error('Failed to retry email:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to retry email'
      };
    }
  }

  async deleteEmailAlert(alertId: string): Promise<void> {
    try {
      await axios.delete(`${this.baseURL}/alerts/${alertId}`);
    } catch (error) {
      console.error('Failed to delete email alert:', error);
      throw error;
    }
  }

  // Email Analytics
  async getEmailStats(): Promise<{
    totalSent: number;
    totalFailed: number;
    totalPending: number;
    successRate: number;
    todaySent: number;
    weekSent: number;
    monthSent: number;
  }> {
    try {
      const response = await axios.get(`${this.baseURL}/stats`);
      return response.data;
    } catch (error) {
      console.error('Failed to get email stats:', error);
      throw error;
    }
  }

  // Bulk Operations
  async sendBulkEmails(emails: {
    to: string;
    subject: string;
    content?: string;
    templateId?: string;
    variables?: Record<string, string>;
  }[]): Promise<{ success: boolean; message: string; results: any[] }> {
    try {
      const response = await axios.post(`${this.baseURL}/send-bulk`, { emails });
      return response.data;
    } catch (error: any) {
      console.error('Failed to send bulk emails:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to send bulk emails',
        results: []
      };
    }
  }
}

export default new EmailService();
export type { EmailConfig, EmailTemplate, EmailAlert, TestEmailRequest };