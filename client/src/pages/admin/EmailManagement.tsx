import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Mail, 
  Send, 
  CheckCircle,
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Settings, 
  Activity, 
  TestTube, 
  Globe, 
  Shield,
  BarChart3,
  Monitor,
  Users,
  Clock,
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  RefreshCw,
  Download,
  Upload,
  Bell,
  Key,
  FileText,
  Calendar,
  TrendingUp,
  Loader2,
  Info,
  Server,
  Zap,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';

// Email Provider Presets
const emailProviders = {
  'zoho-pro': {
    name: 'Zoho Professional Mail',
    host: 'smtppro.zoho.in',
    port: 465,
    encryption: 'ssl',
    description: 'Zoho Professional Mail Service',
    icon: '🏢',
    color: 'orange'
  },
  'zoho': {
    name: 'Zoho Mail',
    host: 'smtp.zoho.com',
    port: 587,
    encryption: 'tls',
    description: 'Standard Zoho Mail Service',
    icon: '📧',
    color: 'orange'
  },
  'gmail': {
    name: 'Gmail',
    host: 'smtp.gmail.com',
    port: 587,
    encryption: 'tls',
    description: 'Google Gmail Service',
    icon: '📬',
    color: 'red'
  },
  'outlook': {
    name: 'Outlook/Hotmail',
    host: 'smtp-mail.outlook.com',
    port: 587,
    encryption: 'tls',
    description: 'Microsoft Outlook/Hotmail',
    icon: '📮',
    color: 'blue'
  },
  'yahoo': {
    name: 'Yahoo Mail',
    host: 'smtp.mail.yahoo.com',
    port: 587,
    encryption: 'tls',
    description: 'Yahoo Mail Service',
    icon: '💌',
    color: 'purple'
  },
  'rediffmail': {
    name: 'Rediffmail',
    host: 'smtp.rediffmail.com',
    port: 587,
    encryption: 'tls',
    description: 'Rediff Mail Service',
    icon: '📨',
    color: 'red'
  },
  'amazon-ses': {
    name: 'Amazon SES',
    host: 'email-smtp.us-east-1.amazonaws.com',
    port: 587,
    encryption: 'tls',
    description: 'Amazon Simple Email Service',
    icon: '☁️',
    color: 'orange'
  },
  'sendgrid': {
    name: 'SendGrid',
    host: 'smtp.sendgrid.net',
    port: 587,
    encryption: 'tls',
    description: 'SendGrid Email Service',
    icon: '🚀',
    color: 'blue'
  },
  'mailgun': {
    name: 'Mailgun',
    host: 'smtp.mailgun.org',
    port: 587,
    encryption: 'tls',
    description: 'Mailgun Email Service',
    icon: '🔫',
    color: 'red'
  },
  'postmark': {
    name: 'Postmark',
    host: 'smtp.postmarkapp.com',
    port: 587,
    encryption: 'tls',
    description: 'Postmark Email Service',
    icon: '📬',
    color: 'yellow'
  },
  'custom': {
    name: 'Custom SMTP',
    host: '',
    port: 587,
    encryption: 'tls',
    description: 'Custom SMTP Configuration',
    icon: '⚙️',
    color: 'gray'
  }
};

interface SMTPConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: 'none' | 'tls' | 'ssl';
  isDefault: boolean;
  isActive: boolean;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  maxRetries: number;
  retryDelay: number;
  dailyLimit: number;
  monthlyLimit: number;
  provider: string;
  createdAt: string;
  lastTestedAt?: string;
  testStatus: 'pending' | 'success' | 'failed';
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  category: 'appointment' | 'billing' | 'notification' | 'marketing' | 'system';
  variables: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
}

interface EmailLog {
  id: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  templateId?: string;
  smtpConfigId: string;
  smtpConfigName: string;
  status: 'pending' | 'sent' | 'failed' | 'bounced' | 'delivered';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  sentAt?: string;
  deliveredAt?: string;
  failureReason?: string;
  retryCount: number;
  openedAt?: string;
  clickedAt?: string;
  createdAt: string;
}

interface EmailStats {
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalBounced: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  todaysSent: number;
  thisMonthSent: number;
  queuedEmails: number;
  activeTemplates: number;
}

const sampleSMTPConfigs: SMTPConfig[] = [
  {
    id: 'smtp_1763323320742_i4dpiz5yq',
    name: 'Zoho Pro SMTP (Default)',
    host: 'smtppro.zoho.in',
    port: 465,
    username: 'notification@mayden.in',
    password: '***********',
    encryption: 'ssl',
    isDefault: true,
    isActive: true,
    fromName: 'Mayden Notifications',
    fromEmail: 'notification@mayden.in',
    replyTo: '',
    maxRetries: 3,
    retryDelay: 5000,
    dailyLimit: 100,
    monthlyLimit: 30000,
    provider: 'Zoho Pro Mail',
    createdAt: '2025-11-16T20:02:00.742Z',
    lastTestedAt: '2025-11-16T20:03:29.726Z',
    testStatus: 'success'
  }
];

const sampleTemplates: EmailTemplate[] = [
  {
    id: 'tmpl_001',
    name: 'Appointment Confirmation',
    subject: 'Appointment Confirmed - {{doctorName}} on {{appointmentDate}}',
    htmlContent: '<h2>Your appointment is confirmed!</h2><p>Dear {{patientName}},</p><p>Your appointment with Dr. {{doctorName}} is confirmed for {{appointmentDate}} at {{appointmentTime}}.</p>',
    textContent: 'Your appointment with Dr. {{doctorName}} is confirmed for {{appointmentDate}} at {{appointmentTime}}.',
    category: 'appointment',
    variables: ['patientName', 'doctorName', 'appointmentDate', 'appointmentTime'],
    isActive: true,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-11-10T14:30:00Z',
    usageCount: 1250
  },
  {
    id: 'tmpl_002',
    name: 'Invoice Generated',
    subject: 'Invoice {{invoiceNumber}} - Amount Due: {{amount}}',
    htmlContent: '<h2>New Invoice Generated</h2><p>Dear {{clientName}},</p><p>Invoice {{invoiceNumber}} for {{amount}} is now available.</p>',
    textContent: 'Invoice {{invoiceNumber}} for {{amount}} is now available.',
    category: 'billing',
    variables: ['clientName', 'invoiceNumber', 'amount', 'dueDate'],
    isActive: true,
    createdAt: '2024-01-20T11:00:00Z',
    updatedAt: '2024-11-12T09:15:00Z',
    usageCount: 890
  },
  {
    id: 'tmpl_003',
    name: 'Welcome New User',
    subject: 'Welcome to Mediczy Platform!',
    htmlContent: '<h2>Welcome aboard!</h2><p>Dear {{userName}},</p><p>Welcome to Mediczy! Your account has been created successfully.</p>',
    textContent: 'Welcome to Mediczy! Your account has been created successfully.',
    category: 'system',
    variables: ['userName', 'loginUrl', 'supportEmail'],
    isActive: true,
    createdAt: '2024-01-25T16:00:00Z',
    updatedAt: '2024-11-05T10:45:00Z',
    usageCount: 2150
  },
  {
    id: 'tmpl_004',
    name: 'Payment Reminder',
    subject: 'Payment Reminder - Invoice {{invoiceNumber}}',
    htmlContent: '<h2>Payment Reminder</h2><p>Dear {{clientName}},</p><p>This is a friendly reminder that payment for invoice {{invoiceNumber}} is due.</p>',
    textContent: 'Payment reminder for invoice {{invoiceNumber}} is due.',
    category: 'billing',
    variables: ['clientName', 'invoiceNumber', 'amount', 'dueDate'],
    isActive: true,
    createdAt: '2024-02-01T08:30:00Z',
    updatedAt: '2024-11-08T15:20:00Z',
    usageCount: 675
  }
];

const sampleEmailLogs: EmailLog[] = [
  {
    id: 'log_1763323630308_test',
    to: 'sk@mysmarthealth.in',
    subject: '✅ Zoho Pro Mail Integration Successful - Production Ready',
    templateId: undefined,
    smtpConfigId: 'smtp_1763323320742_i4dpiz5yq',
    smtpConfigName: 'Zoho Pro SMTP (Default)',
    status: 'sent',
    priority: 'high',
    sentAt: '2025-11-16T20:03:50.308Z',
    retryCount: 0,
    createdAt: '2025-11-16T20:03:50.308Z'
  },
  {
    id: 'log_1763323329726_test',
    to: 'sk@mysmarthealth.in',
    subject: 'SMTP Test - Zoho Pro SMTP (SSL)',
    templateId: undefined,
    smtpConfigId: 'smtp_1763323320742_i4dpiz5yq',
    smtpConfigName: 'Zoho Pro SMTP (Default)',
    status: 'delivered',
    priority: 'normal',
    sentAt: '2025-11-16T20:03:29.726Z',
    deliveredAt: '2025-11-16T20:03:35.142Z',
    retryCount: 0,
    createdAt: '2025-11-16T20:03:29.726Z'
  }
];

const EmailManagement = () => {
  // Set admin token immediately for development
  if (!localStorage.getItem('adminToken')) {
    localStorage.setItem('adminToken', 'dev-admin-token');
  }

  const [activeTab, setActiveTab] = useState('dashboard');
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [emailStats, setEmailStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>(sampleTemplates);
  const [smtpConfigs, setSMTPConfigs] = useState<SMTPConfig[]>(sampleSMTPConfigs);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>(sampleEmailLogs);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | EmailLog['status']>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | EmailTemplate['category']>('all');
  const [editingSMTP, setEditingSMTP] = useState<SMTPConfig | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [previewingTemplate, setPreviewingTemplate] = useState<EmailTemplate | null>(null);
  const [showAddSMTPDialog, setShowAddSMTPDialog] = useState(false);
  const [showEditSMTPDialog, setShowEditSMTPDialog] = useState(false);
  const [editSMTPConfig, setEditSMTPConfig] = useState<Partial<SMTPConfig>>({});
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [showQuickSendDialog, setShowQuickSendDialog] = useState(false);
  const [showNewTemplateDialog, setShowNewTemplateDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [quickSendData, setQuickSendData] = useState({
    to: '',
    subject: '',
    message: '',
    priority: 'normal' as 'low' | 'normal' | 'high' | 'urgent'
  });
  const [newTemplateData, setNewTemplateData] = useState({
    name: '',
    category: 'notification' as EmailTemplate['category'],
    subject: '',
    htmlContent: '',
    textContent: '',
    variables: [] as string[]
  });
  const [newSMTPConfig, setNewSMTPConfig] = useState<Partial<SMTPConfig>>({
    name: 'Zoho Pro Mail',
    host: 'smtppro.zoho.in',
    port: 465,
    username: 'notification@mayden.in',
    password: '',
    encryption: 'ssl',
    isDefault: false,
    isActive: true,
    fromName: 'Mayden Notifications',
    fromEmail: 'notification@mayden.in',
    replyTo: '',
    maxRetries: 3,
    retryDelay: 5000,
    dailyLimit: 1000,
    monthlyLimit: 30000,
    provider: 'Zoho Professional Mail'
  });
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedTestConfig, setSelectedTestConfig] = useState<string>('');
  const [selectedTestingTabConfig, setSelectedTestingTabConfig] = useState<string>('');

  const fetchConfig = async () => {
    try {
      const { data } = await api.get('/email/stats');
      setEmailStats(data.data);
    } catch (error) {
      console.error('Error fetching config:', error);
      toast.error('Failed to load email configuration');
    } finally {
      setLoading(false);
    }
  };

  const fetchSMTPConfigs = async () => {
    try {
      const { data } = await api.get('/email/configs');
      if (data) {
        // Transform intelligent model data to match frontend interface
        const transformedConfigs = (data.data || []).map((config: any) => ({
          ...config,
          dailyLimit: config.dailyLimit || config.rateLimits?.perDay || 1000,
          monthlyLimit: config.monthlyLimit || config.rateLimits?.perMonth || 30000,
          encryption: config.encryption || (config.secure ? 'ssl' : 'tls'),
          provider: config.provider || 'Custom SMTP',
          testStatus: config.testStatus || (config.testResult?.success ? 'success' : 'pending'),
          retryDelay: config.retryDelay || 5000,
          maxRetries: config.maxRetries || 3
        }));
        // If backend has configs, use them; otherwise keep sample configs
        if (transformedConfigs.length > 0) {
          setSMTPConfigs(transformedConfigs);
        }
      }
    } catch (error) {
      console.error('Error fetching SMTP configs:', error);
      // Keep sample configs on error
    }
  };

  const fetchEmailLogs = async () => {
    try {
      const { data } = await api.get('/email/logs', { params: { limit: 20 } });
      setEmailLogs(data.data || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchSMTPConfigs();
    fetchEmailLogs();
  }, []);

  // Update selected test config when configs change
  useEffect(() => {
    if (smtpConfigs.length > 0) {
      const defaultConfig = smtpConfigs.find(c => c.isDefault) || smtpConfigs[0];
      if (!selectedTestConfig) {
        setSelectedTestConfig(defaultConfig?.id || '');
      }
      if (!selectedTestingTabConfig) {
        setSelectedTestingTabConfig(defaultConfig?.id || '');
      }
    }
  }, [smtpConfigs, selectedTestConfig, selectedTestingTabConfig]);

  const testSMTP = async (smtpId: string) => {
    setTesting(prev => ({ ...prev, [smtpId]: true }));
    try {
      const { data } = await api.post(`/email/configs/${smtpId}/test`, { testEmail });
      toast.success('SMTP test successful');
      setTestResult({ success: true, message: data?.message || 'SMTP test successful' });
    } catch (error: any) {
      console.error('Error testing SMTP:', error);
      const errorMsg = error?.response?.data?.message || 'SMTP test failed';

      // Check if it's a password issue
      if (errorMsg.includes('Password not configured') || errorMsg.includes('Authentication failed')) {
        toast.error('Password not set - please edit the configuration and add your Zoho password');
        setTestResult({
          success: false,
          message: 'Password not configured. Click Edit to set your Zoho mail password.'
        });
      } else if (errorMsg.includes('timeout')) {
        toast.error('Connection timeout - check network/firewall settings');
        setTestResult({
          success: false,
          message: 'Connection timeout. Ensure port 465 is not blocked by firewall.'
        });
      } else {
        toast.error('SMTP test failed');
        setTestResult({ success: false, message: errorMsg });
      }
    } finally {
      setTesting(prev => ({ ...prev, [smtpId]: false }));
    }
  };

  const addSMTPConfig = async () => {
    setSaving(true);
    try {
      const { data } = await api.post('/email/configs', newSMTPConfig);
        toast.success('SMTP configuration added successfully');
        
        // Transform the new config data to match frontend interface
        const transformedConfig = {
          ...data.data,
          dailyLimit: data.data.dailyLimit || data.data.rateLimits?.perDay || 1000,
          monthlyLimit: data.data.monthlyLimit || data.data.rateLimits?.perMonth || 30000,
          encryption: data.data.encryption || (data.data.secure ? 'ssl' : 'tls'),
          provider: data.data.provider || 'Custom SMTP',
          testStatus: data.data.testStatus || (data.data.testResult?.success ? 'success' : 'pending'),
          retryDelay: data.data.retryDelay || 5000,
          maxRetries: data.data.maxRetries || 3
        };
        
        setSMTPConfigs([...smtpConfigs, transformedConfig]);
        setShowAddSMTPDialog(false);
        
        // Reset form
        resetSMTPForm();
        
        // Refresh the configurations list from server
        await fetchSMTPConfigs();
    } catch (error: any) {
      console.error('Error adding SMTP config:', error);
      const errorData = error?.response?.data;
      const errorList = errorData?.errors || [];
      const errorMessages = Array.isArray(errorList)
        ? errorList.map((err: any) => `${err.path}: ${err.msg}`).join(', ')
        : '';
      toast.error(errorData?.message || (errorMessages ? `Validation failed: ${errorMessages}` : 'Failed to add SMTP configuration'));
    } finally {
      setSaving(false);
    }
  };

  const updateSMTPConfig = async () => {
    if (!editingSMTP) return;
    
    setSaving(true);
    try {
      const updateData = { ...editSMTPConfig };
      
      // Remove empty password field to keep existing password
      if (!updateData.password || updateData.password.trim() === '') {
        delete updateData.password;
      }
      
      await api.put(`/email/configs/${editingSMTP.id}`, updateData);

      toast.success('SMTP configuration updated successfully');
      
      setShowEditSMTPDialog(false);
      setEditingSMTP(null);
      setEditSMTPConfig({});
      
      // Refresh the configurations list from server
      await fetchSMTPConfigs();
    } catch (error: any) {
      console.error('Error updating SMTP config:', error);
      const errorData = error?.response?.data;
      const errorList = errorData?.errors || [];
      const errorMessages = Array.isArray(errorList)
        ? errorList.map((err: any) => `${err.path}: ${err.msg}`).join(', ')
        : '';
      toast.error(errorData?.message || (errorMessages ? `Validation failed: ${errorMessages}` : 'Failed to update SMTP configuration'));
    } finally {
      setSaving(false);
    }
  };

  const openEditDialog = (config: SMTPConfig) => {
    setEditingSMTP(config);
    setEditSMTPConfig({
      name: config.name,
      host: config.host,
      port: config.port,
      username: config.username,
      password: '', // Don't pre-fill password for security
      encryption: config.encryption,
      isDefault: config.isDefault,
      isActive: config.isActive,
      fromName: config.fromName,
      fromEmail: config.fromEmail,
      replyTo: config.replyTo,
      maxRetries: config.maxRetries,
      retryDelay: config.retryDelay,
      dailyLimit: config.dailyLimit,
      monthlyLimit: config.monthlyLimit,
      provider: config.provider
    });
    setShowEditSMTPDialog(true);
  };

  const deleteSMTPConfig = async (configId: string, configName: string) => {
    if (!confirm(`Are you sure you want to delete "${configName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await api.delete(`/email/configs/${configId}`);
      toast.success('SMTP configuration deleted successfully');
      await fetchSMTPConfigs();
    } catch (error: any) {
      console.error('Error deleting SMTP config:', error);
      const errorData = error?.response?.data;
      toast.error(errorData?.message || 'Failed to delete SMTP configuration');
    }
  };

  // Quick Actions Functions
  const handleQuickSend = async () => {
    if (!quickSendData.to || !quickSendData.subject || !quickSendData.message) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      await api.post('/email/send', {
        to: quickSendData.to,
        subject: quickSendData.subject,
        htmlContent: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">${quickSendData.message.replace(/\n/g, '<br>')}</div>`,
        priority: quickSendData.priority,
        tracking: true
      });

      toast.success('Email sent successfully!');
      setShowQuickSendDialog(false);
      setQuickSendData({ to: '', subject: '', message: '', priority: 'normal' });
      await fetchEmailLogs();
    } catch (error: any) {
      console.error('Error sending email:', error);
      const errorData = error?.response?.data;
      toast.error(errorData?.message || 'Failed to send email');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateData.name || !newTemplateData.subject || !newTemplateData.htmlContent) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      await api.post('/email/templates', {
        ...newTemplateData,
        textContent: newTemplateData.textContent || newTemplateData.htmlContent.replace(/<[^>]*>/g, ''),
        isActive: true
      });

      toast.success('Template created successfully!');
      setShowNewTemplateDialog(false);
      setNewTemplateData({
        name: '',
        category: 'notification',
        subject: '',
        htmlContent: '',
        textContent: '',
        variables: []
      });
      // Refresh templates if on templates tab
      if (activeTab === 'templates') {
        window.location.reload();
      }
    } catch (error: any) {
      console.error('Error creating template:', error);
      const errorData = error?.response?.data;
      toast.error(errorData?.message || 'Failed to create template');
    } finally {
      setSaving(false);
    }
  };

  const handleTestDefaultSMTP = async () => {
    const defaultConfig = smtpConfigs.find(c => c.isDefault);
    if (!defaultConfig) {
      toast.error('No default SMTP configuration found');
      return;
    }
    
    const testEmail = prompt('Enter test email address:', 'test@example.com');
    if (!testEmail) return;
    
    await testSMTP(defaultConfig.id);
  };

  const handleExportData = () => {
    setShowExportDialog(true);
  };

  const exportEmailLogs = async (format: 'csv' | 'json') => {
    try {
      const response = await api.get('/email/logs/export', {
        params: { format },
        responseType: 'blob'
      });

      const blob = response.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `email-logs-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`Email logs exported as ${format.toUpperCase()}`);
      setShowExportDialog(false);
    } catch (error: any) {
      console.error('Error exporting logs:', error);
      const errorData = error?.response?.data;
      toast.error(errorData?.message || 'Failed to export email logs');
    }
  };

  const applyProviderPreset = (providerId: string) => {
    const provider = emailProviders[providerId];
    if (!provider) return;
    
    setSelectedProvider(providerId);
    setNewSMTPConfig({
      ...newSMTPConfig,
      name: provider.name,
      host: provider.host,
      port: provider.port,
      encryption: provider.encryption,
      provider: provider.name,
      fromName: newSMTPConfig.fromName || 'Mayden Notifications',
      fromEmail: newSMTPConfig.fromEmail || newSMTPConfig.username
    });
  };

  const resetSMTPForm = () => {
    setSelectedProvider('');
    setNewSMTPConfig({
      name: '',
      host: '',
      port: 587,
      username: '',
      password: '',
      encryption: 'tls',
      isDefault: false,
      isActive: true,
      fromName: '',
      fromEmail: '',
      replyTo: '',
      maxRetries: 3,
      retryDelay: 5000,
      dailyLimit: 1000,
      monthlyLimit: 30000,
      provider: 'Custom SMTP'
    });
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20">
          <div className="flex items-center justify-center h-96">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Loading email management system...</span>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // Filter functions
  const filteredLogs = emailLogs.filter(log => {
    const matchesSearch = searchTerm
      ? log.to.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.subject.toLowerCase().includes(searchTerm.toLowerCase())
      : true;
    const matchesStatus = statusFilter === 'all' ? true : log.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredTemplates = templates.filter(template => {
    const matchesCategory = categoryFilter === 'all' ? true : template.category === categoryFilter;
    const matchesSearch = searchTerm
      ? template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.subject.toLowerCase().includes(searchTerm.toLowerCase())
      : true;
    return matchesCategory && matchesSearch;
  });

  // Calculate stats
  const calculatedStats: EmailStats = {
    totalSent: emailLogs.filter(log => ['sent', 'delivered', 'bounced'].includes(log.status)).length,
    totalDelivered: emailLogs.filter(log => log.status === 'delivered').length,
    totalFailed: emailLogs.filter(log => log.status === 'failed').length,
    totalBounced: emailLogs.filter(log => log.status === 'bounced').length,
    deliveryRate: emailLogs.length > 0 ? (emailLogs.filter(log => log.status === 'delivered').length / emailLogs.length) * 100 : 0,
    openRate: emailLogs.filter(log => log.openedAt).length / Math.max(emailLogs.filter(log => log.status === 'delivered').length, 1) * 100,
    clickRate: emailLogs.filter(log => log.clickedAt).length / Math.max(emailLogs.filter(log => log.openedAt).length, 1) * 100,
    todaysSent: emailLogs.filter(log => 
      log.sentAt && new Date(log.sentAt).toDateString() === new Date().toDateString()
    ).length,
    thisMonthSent: emailLogs.filter(log => 
      log.sentAt && new Date(log.sentAt).getMonth() === new Date().getMonth()
    ).length,
    queuedEmails: emailLogs.filter(log => log.status === 'pending').length,
    activeTemplates: templates.filter(template => template.isActive).length
  };

  // Helper functions
  const getStatusBadge = (status: EmailLog['status']) => {
    const badges = {
      pending: { className: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Pending', icon: Clock },
      sent: { className: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Sent', icon: Send },
      delivered: { className: 'bg-green-100 text-green-700 border-green-200', label: 'Delivered', icon: CheckCircle },
      failed: { className: 'bg-red-100 text-red-700 border-red-200', label: 'Failed', icon: XCircle },
      bounced: { className: 'bg-orange-100 text-orange-700 border-orange-200', label: 'Bounced', icon: AlertTriangle }
    };
    return badges[status];
  };

  const getPriorityBadge = (priority: EmailLog['priority']) => {
    const badges = {
      low: { className: 'bg-gray-100 text-gray-700', label: 'Low' },
      normal: { className: 'bg-blue-100 text-blue-700', label: 'Normal' },
      high: { className: 'bg-orange-100 text-orange-700', label: 'High' },
      urgent: { className: 'bg-red-100 text-red-700', label: 'Urgent' }
    };
    return badges[priority];
  };

  const getCategoryBadge = (category: EmailTemplate['category']) => {
    const badges = {
      appointment: { className: 'bg-blue-100 text-blue-700', label: 'Appointment' },
      billing: { className: 'bg-green-100 text-green-700', label: 'Billing' },
      notification: { className: 'bg-purple-100 text-purple-700', label: 'Notification' },
      marketing: { className: 'bg-pink-100 text-pink-700', label: 'Marketing' },
      system: { className: 'bg-gray-100 text-gray-700', label: 'System' }
    };
    return badges[category];
  };

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-slate-50/30 to-teal-50/20 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="space-y-6 lg:space-y-8">
          {/* Enhanced Header */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 p-6 lg:p-8 text-white shadow-2xl">
            <div className="absolute inset-0 bg-black/10" />
            <div className="absolute -top-4 -right-4 opacity-10">
              <Mail className="h-32 w-32" />
            </div>
            <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex-1">
                <h2 className="text-3xl lg:text-4xl font-bold mb-2 flex items-center gap-3">
                  <Mail className="h-8 w-8 lg:h-10 lg:w-10" />
                  Email Management System
                </h2>
                <p className="text-blue-100 text-base lg:text-lg opacity-90">
                  Comprehensive SMTP configuration, templates, and delivery analytics
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 hidden lg:block">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{calculatedStats.totalSent.toLocaleString()}</div>
                    <div className="text-xs text-blue-200">Emails Sent</div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="bg-white/20 hover:bg-white/30 border-white/30 text-white"
                  onClick={handleExportData}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export Logs
                </Button>
                <Button
                  className="bg-white/20 hover:bg-white/30 border border-white/30 backdrop-blur-sm text-white shadow-lg transition-all duration-200 hover:scale-105"
                  onClick={() => setShowQuickSendDialog(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Quick Send
                </Button>
              </div>
            </div>
          </div>

          {/* Enhanced Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 lg:gap-6">
            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-teal-500/10 via-teal-500/5 to-background shadow-lg hover:shadow-xl transition-all duration-300 group admin-card">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-xs lg:text-sm font-medium text-teal-600 dark:text-teal-400 uppercase tracking-wide">Total Sent</p>
                    <p className="text-xl lg:text-2xl font-bold text-foreground group-hover:scale-105 transition-transform duration-200">
                      {calculatedStats.totalDelivered.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-teal-500/15 group-hover:bg-teal-500/20 transition-colors duration-200">
                    <Send className="h-6 w-6 lg:h-7 lg:w-7 text-teal-600" />
                  </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-teal-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-green-500/10 via-green-500/5 to-background shadow-lg hover:shadow-xl transition-all duration-300 group admin-card">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-xs lg:text-sm font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">Delivered</p>
                    <p className="text-xl lg:text-2xl font-bold text-foreground group-hover:scale-105 transition-transform duration-200">
                      {calculatedStats.totalSent.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-green-500/15 group-hover:bg-green-500/20 transition-colors duration-200">
                    <CheckCircle className="h-6 w-6 lg:h-7 lg:w-7 text-green-600" />
                  </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-red-500/10 via-red-500/5 to-background shadow-lg hover:shadow-xl transition-all duration-300 group admin-card">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-xs lg:text-sm font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">Failed</p>
                    <p className="text-xl lg:text-2xl font-bold text-foreground group-hover:scale-105 transition-transform duration-200">
                      {calculatedStats.totalFailed.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-red-500/15 group-hover:bg-red-500/20 transition-colors duration-200">
                    <XCircle className="h-6 w-6 lg:h-7 lg:w-7 text-red-600" />
                  </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-background shadow-lg hover:shadow-xl transition-all duration-300 group admin-card">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-xs lg:text-sm font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">Pending</p>
                    <p className="text-xl lg:text-2xl font-bold text-foreground group-hover:scale-105 transition-transform duration-200">
                      {calculatedStats.queuedEmails.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-500/15 group-hover:bg-amber-500/20 transition-colors duration-200">
                    <Clock className="h-6 w-6 lg:h-7 lg:w-7 text-amber-600" />
                  </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-background shadow-lg hover:shadow-xl transition-all duration-300 group admin-card">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-xs lg:text-sm font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Delivery Rate</p>
                    <p className="text-xl lg:text-2xl font-bold text-foreground group-hover:scale-105 transition-transform duration-200">
                      {calculatedStats.deliveryRate.toFixed(1)}%
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-500/15 group-hover:bg-emerald-500/20 transition-colors duration-200">
                    <TrendingUp className="h-6 w-6 lg:h-7 lg:w-7 text-emerald-600" />
                  </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-teal-500/10 via-teal-500/5 to-background shadow-lg hover:shadow-xl transition-all duration-300 group admin-card">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-xs lg:text-sm font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">Open Rate</p>
                    <p className="text-xl lg:text-2xl font-bold text-foreground group-hover:scale-105 transition-transform duration-200">
                      {calculatedStats.openRate.toFixed(1)}%
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-purple-500/15 group-hover:bg-purple-500/20 transition-colors duration-200">
                    <Eye className="h-6 w-6 lg:h-7 lg:w-7 text-purple-600" />
                  </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-teal-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-background shadow-lg hover:shadow-xl transition-all duration-300 group admin-card">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-xs lg:text-sm font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wide">This Month</p>
                    <p className="text-xl lg:text-2xl font-bold text-foreground group-hover:scale-105 transition-transform duration-200">
                      {calculatedStats.thisMonthSent.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-orange-500/15 group-hover:bg-orange-500/20 transition-colors duration-200">
                    <Calendar className="h-6 w-6 lg:h-7 lg:w-7 text-orange-600" />
                  </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </CardContent>
            </Card>
          </div>

          {/* Enhanced Tabs Section */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="h-12 p-1 bg-muted/50 backdrop-blur-sm border border-border/50">
              <TabsTrigger value="dashboard" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Activity className="mr-2 h-4 w-4" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="smtp" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Server className="mr-2 h-4 w-4" />
                SMTP Configuration
              </TabsTrigger>
              <TabsTrigger value="templates" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <FileText className="mr-2 h-4 w-4" />
                Email Templates
              </TabsTrigger>
              <TabsTrigger value="logs" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <BarChart3 className="mr-2 h-4 w-4" />
                Logs & Analytics
              </TabsTrigger>
              <TabsTrigger value="testing" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <TestTube className="mr-2 h-4 w-4" />
                Testing
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="space-y-6">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* SMTP Status Cards */}
                <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-teal-50/50 to-background dark:from-teal-950/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <div className="p-2 rounded-lg bg-blue-500/10">
                        <Server className="h-4 w-4 text-blue-600" />
                      </div>
                      SMTP Servers
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {smtpConfigs.slice(0, 3).map(config => (
                        <div key={config.id} className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${config.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
                            <div>
                              <div className="font-medium text-sm">{config.name}</div>
                              <div className="text-xs text-muted-foreground">{config.provider || 'Custom SMTP'}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {config.isDefault && (
                              <Badge variant="outline" className="text-xs bg-blue-100 text-blue-700 border-blue-200">Default</Badge>
                            )}
                            <Badge variant="outline" className={`text-xs ${
                              (config.testStatus || 'success') === 'success' ? 'bg-green-100 text-green-700 border-green-200' :
                              (config.testStatus || 'success') === 'failed' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-yellow-100 text-yellow-700 border-yellow-200'
                            }`}>
                              {config.testStatus || 'success'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full mt-4 bg-blue-500/10 hover:bg-blue-500/20 border-blue-200 text-blue-700"
                      onClick={() => setActiveTab('smtp')}
                    >
                      <Settings className="mr-2 h-3 w-3" />
                      Manage SMTP
                    </Button>
                  </CardContent>
                </Card>

                {/* Recent Activity */}
                <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-green-50/50 to-background">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <div className="p-2 rounded-lg bg-green-500/10">
                        <Activity className="h-4 w-4 text-green-600" />
                      </div>
                      Recent Activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {emailLogs.slice(0, 4).map(log => {
                        const statusBadge = getStatusBadge(log.status);
                        const StatusIcon = statusBadge.icon;
                        return (
                          <div key={log.id} className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50">
                            <div>
                              <div className="font-medium text-sm truncate max-w-[120px]">{log.to}</div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(log.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                            <Badge variant="outline" className={`${statusBadge.className} flex items-center gap-1`}>
                              <StatusIcon className="h-3 w-3" />
                              {statusBadge.label}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full mt-4 bg-green-500/10 hover:bg-green-500/20 border-green-200 text-green-700"
                      onClick={() => setActiveTab('logs')}
                    >
                      <BarChart3 className="mr-2 h-3 w-3" />
                      View All Logs
                    </Button>
                  </CardContent>
                </Card>

                {/* Popular Templates */}
                <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-slate-50/50 to-background dark:from-slate-950/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <div className="p-2 rounded-lg bg-purple-500/10">
                        <TrendingUp className="h-4 w-4 text-purple-600" />
                      </div>
                      Popular Templates
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {templates
                        .sort((a, b) => b.usageCount - a.usageCount)
                        .slice(0, 4)
                        .map(template => {
                          const categoryBadge = getCategoryBadge(template.category);
                          return (
                            <div key={template.id} className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50">
                              <div>
                                <div className="font-medium text-sm">{template.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {template.usageCount} uses
                                </div>
                              </div>
                              <Badge variant="outline" className={categoryBadge.className}>
                                {categoryBadge.label}
                              </Badge>
                            </div>
                          );
                        })}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full mt-4 bg-purple-500/10 hover:bg-purple-500/20 border-purple-200 text-purple-700"
                      onClick={() => setActiveTab('templates')}
                    >
                      <FileText className="mr-2 h-3 w-3" />
                      Manage Templates
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Quick Actions */}
              <Card className="border-0 shadow-lg bg-gradient-to-r from-teal-500/5 via-slate-500/5 to-teal-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-blue-600" />
                    Quick Actions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Button 
                      className="h-20 flex flex-col gap-2 bg-blue-500 hover:bg-blue-600 text-white"
                      onClick={() => setShowQuickSendDialog(true)}
                    >
                      <Send className="h-5 w-5" />
                      <span className="text-sm">Send Email</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      className="h-20 flex flex-col gap-2 border-green-200 text-green-700 hover:bg-green-50"
                      onClick={() => setShowNewTemplateDialog(true)}
                    >
                      <Plus className="h-5 w-5" />
                      <span className="text-sm">New Template</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      className="h-20 flex flex-col gap-2 border-purple-200 text-purple-700 hover:bg-purple-50"
                      onClick={handleTestDefaultSMTP}
                    >
                      <TestTube className="h-5 w-5" />
                      <span className="text-sm">Test SMTP</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      className="h-20 flex flex-col gap-2 border-orange-200 text-orange-700 hover:bg-orange-50"
                      onClick={handleExportData}
                    >
                      <Download className="h-5 w-5" />
                      <span className="text-sm">Export Data</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="smtp" className="space-y-6">
              {/* Zoho Mail Configuration Info */}
              <Alert className="border-orange-300 bg-orange-50">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-orange-900">
                  <div className="space-y-2">
                    <p className="font-bold text-base">⚠️ Action Required: Set Your Zoho Mail Password</p>
                    <p className="text-sm">The Zoho Pro SMTP configuration is set up for <strong>notification@mayden.in</strong>, but the password needs to be configured.</p>
                    <div className="mt-3 p-3 bg-white rounded border border-orange-200">
                      <p className="font-semibold text-sm mb-2">📝 Steps to Complete Setup:</p>
                      <ol className="list-decimal list-inside space-y-1 text-sm ml-2">
                        <li>Click the <strong>Edit</strong> button on the "Zoho Pro SMTP (Default)" card below</li>
                        <li>Enter your Zoho mail password in the Password field</li>
                        <li>Click <strong>Save Changes</strong></li>
                        <li>Test the connection using the <strong>Test SMTP</strong> button</li>
                      </ol>
                    </div>
                    <details className="mt-3">
                      <summary className="cursor-pointer font-semibold text-sm">🔧 SMTP Configuration Details</summary>
                      <ul className="list-disc list-inside ml-4 space-y-1 text-sm mt-2">
                        <li><strong>Host:</strong> smtppro.zoho.in | Port 465 (SSL)</li>
                        <li><strong>Alternative:</strong> smtp.zoho.com | Port 587 (TLS)</li>
                        <li><strong>Username:</strong> notification@mayden.in</li>
                        <li><strong>Security Tip:</strong> Use App-Specific Password from Zoho Mail Settings for better security</li>
                      </ul>
                    </details>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {smtpConfigs.map(config => (
                  <Card key={config.id} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 group">
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-3 rounded-xl ${config.isActive ? 'bg-green-500/10' : 'bg-red-500/10'} transition-colors duration-200`}>
                              <Server className={`h-5 w-5 ${config.isActive ? 'text-green-600' : 'text-red-600'}`} />
                            </div>
                            <div>
                              <div className="font-semibold flex items-center gap-2 group-hover:text-blue-600 transition-colors duration-200">
                                {config.name}
                                {config.isDefault && (
                                  <Badge className="bg-blue-500/15 text-blue-700 text-xs border-blue-200">Default</Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground">{config.provider || 'Custom SMTP'}</div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <Badge variant="outline" className={`${config.isActive ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'} transition-all duration-200`}>
                              {config.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                            <Badge variant="outline" className={`transition-all duration-200 ${
                              (config.testStatus || 'success') === 'success' ? 'bg-green-100 text-green-700 border-green-200' :
                              (config.testStatus || 'success') === 'failed' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-yellow-100 text-yellow-700 border-yellow-200'
                            }`}>
                              {config.testStatus || 'success'}
                            </Badge>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                            <span className="text-sm text-muted-foreground">Host</span>
                            <span className="font-medium text-sm">{config.host}:{config.port}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                            <span className="text-sm text-muted-foreground">From Email</span>
                            <span className="font-medium text-sm">{config.fromEmail}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                            <span className="text-sm text-muted-foreground">Daily Limit</span>
                            <span className="font-medium text-sm">{(config.dailyLimit || config.rateLimits?.perDay || 1000).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                            <span className="text-sm text-muted-foreground">Encryption</span>
                            <Badge variant="outline" className="font-medium text-xs">
                              {(config.encryption || (config.secure ? 'SSL' : 'TLS')).toUpperCase()}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="flex-1 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors duration-200" 
                            onClick={() => openEditDialog(config)}
                          >
                            <Settings className="mr-2 h-3 w-3" />
                            Configure
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="flex-1 hover:bg-green-50 hover:border-green-200 hover:text-green-700 transition-colors duration-200"
                            onClick={() => testSMTP(config.id)}
                            disabled={testing[config.id]}
                          >
                            {testing[config.id] ? (
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            ) : (
                              <TestTube className="mr-2 h-3 w-3" />
                            )}
                            Test
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-colors duration-200"
                            onClick={() => deleteSMTPConfig(config.id, config.name)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>

                        {config.lastTestedAt && (
                          <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded-lg">
                            Last tested: {new Date(config.lastTestedAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {/* Add New SMTP Configuration Card */}
                <Card className="border-2 border-dashed border-muted-foreground/25 hover:border-blue-300 transition-colors duration-200 cursor-pointer group">
                  <CardContent className="p-6 flex flex-col items-center justify-center h-full min-h-[400px] text-center">
                    <div className="p-4 rounded-xl bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors duration-200 mb-4">
                      <Plus className="h-8 w-8 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Add New SMTP Configuration</h3>
                    <p className="text-sm text-muted-foreground mb-4">Configure a new email server for sending</p>
                    <Button 
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => setShowAddSMTPDialog(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Configuration
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Test Result Alert */}
              {testResult && (
                <Alert className={`border-0 ${testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <AlertCircle className={`h-4 w-4 ${testResult.success ? 'text-green-600' : 'text-red-600'}`} />
                  <AlertDescription className={testResult.success ? 'text-green-800' : 'text-red-800'}>
                    {testResult.message}
                  </AlertDescription>
                </Alert>
              )}

              {/* SMTP Test Panel */}
              <Card className="border-0 shadow-lg bg-gradient-to-r from-teal-50/50 to-slate-50/50 dark:from-teal-950/20 dark:to-slate-950/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TestTube className="h-5 w-5 text-blue-600" />
                    SMTP Test Panel
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="testEmail">Test Email Address</Label>
                      <Input
                        id="testEmail"
                        type="email"
                        placeholder="test@example.com"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Select Configuration</Label>
                      <Select 
                        value={selectedTestConfig} 
                        onValueChange={setSelectedTestConfig}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Choose configuration" />
                        </SelectTrigger>
                        <SelectContent>
                          {smtpConfigs.filter(c => c.isActive).map(config => (
                            <SelectItem key={config.id} value={config.id}>
                              {config.name} ({config.provider})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button 
                    onClick={() => {
                      if (selectedTestConfig) {
                        testSMTP(selectedTestConfig);
                      } else {
                        toast.error('Please select a configuration to test');
                      }
                    }}
                    className="w-full bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white"
                    disabled={!testEmail || testing[selectedTestConfig] || !selectedTestConfig}
                  >
                    {testing[selectedTestConfig] ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Testing Connection...
                      </>
                    ) : (
                      <>
                        <TestTube className="mr-2 h-4 w-4" />
                        Send Test Email
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

          <TabsContent value="templates">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Email Templates ({filteredTemplates.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Filters */}
                <div className="flex flex-col lg:flex-row gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search templates..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as any)}>
                    <SelectTrigger className="w-full lg:w-[200px]">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="appointment">Appointment</SelectItem>
                      <SelectItem value="billing">Billing</SelectItem>
                      <SelectItem value="notification">Notification</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Templates Grid */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredTemplates.map(template => {
                    const categoryBadge = getCategoryBadge(template.category);
                    return (
                      <Card key={template.id}>
                        <CardContent className="p-6">
                          <div className="space-y-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="font-semibold">{template.name}</div>
                                <div className="text-sm text-muted-foreground mt-1">{template.subject}</div>
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <Badge variant="outline" className={categoryBadge.className}>
                                  {categoryBadge.label}
                                </Badge>
                                <Badge variant="outline" className={template.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                                  {template.isActive ? 'Active' : 'Inactive'}
                                </Badge>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">Usage Count</span>
                                <span className="font-medium">{template.usageCount.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">Variables</span>
                                <span className="font-medium">{template.variables.length}</span>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Updated: {new Date(template.updatedAt).toLocaleDateString()}
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditingTemplate(template)}>
                                <Edit className="mr-2 h-3 w-3" />
                                Edit
                              </Button>
                              <Button size="sm" variant="outline" className="flex-1" onClick={() => setPreviewingTemplate(template)}>
                                <Eye className="mr-2 h-3 w-3" />
                                Preview
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Email Delivery Logs ({filteredLogs.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Filters */}
                <div className="flex flex-col lg:flex-row gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search email logs..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                    <SelectTrigger className="w-full lg:w-[150px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="bounced">Bounced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Logs Table */}
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>SMTP Config</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Sent At</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log) => {
                        const statusBadge = getStatusBadge(log.status);
                        const priorityBadge = getPriorityBadge(log.priority);
                        const StatusIcon = statusBadge.icon;
                        
                        return (
                          <TableRow key={log.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium text-sm">{log.to}</div>
                                {log.cc && (
                                  <div className="text-xs text-muted-foreground">CC: {log.cc}</div>
                                )}
                                {log.retryCount > 0 && (
                                  <div className="text-xs text-orange-600">
                                    Retry: {log.retryCount}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="max-w-[200px] truncate font-medium text-sm">
                                {log.subject}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <div className="font-medium">{log.smtpConfigName}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`${statusBadge.className} flex items-center gap-1 w-fit`}>
                                <StatusIcon className="h-3 w-3" />
                                {statusBadge.label}
                              </Badge>
                              {log.failureReason && (
                                <div className="text-xs text-red-600 mt-1">
                                  {log.failureReason}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={priorityBadge.className}>
                                {priorityBadge.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {log.sentAt ? new Date(log.sentAt).toLocaleString() : 'Not sent'}
                              </div>
                              {log.deliveredAt && (
                                <div className="text-xs text-green-600">
                                  Delivered: {new Date(log.deliveredAt).toLocaleString()}
                                </div>
                              )}
                              {log.openedAt && (
                                <div className="text-xs text-blue-600">
                                  Opened: {new Date(log.openedAt).toLocaleString()}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                                  <Eye className="h-3 w-3" />
                                </Button>
                                {log.status === 'failed' && (
                                  <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-blue-600">
                                    <RefreshCw className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="testing">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>SMTP Connection Test</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Select SMTP Configuration</Label>
                    <Select 
                      value={selectedTestingTabConfig}
                      onValueChange={setSelectedTestingTabConfig}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose configuration" />
                      </SelectTrigger>
                      <SelectContent>
                        {smtpConfigs.map(config => (
                          <SelectItem key={config.id} value={config.id}>
                            {config.name} ({config.provider})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Test Email Address</Label>
                    <Input
                      type="email"
                      placeholder="test@example.com"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                    />
                  </div>
                  <Button 
                    onClick={() => testSMTP(selectedTestingTabConfig)}
                    disabled={testing[selectedTestingTabConfig] || !testEmail}
                    className="w-full"
                  >
                    <TestTube className="mr-2 h-4 w-4" />
                    {testing[selectedTestingTabConfig] ? 'Testing...' : 'Send Test Email'}
                  </Button>
                  {testResult && (
                    <div className={`p-4 rounded-lg ${
                      testResult.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      <div className="flex items-center gap-2">
                        {testResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                        {testResult.message}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Template Testing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Select Template</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.filter(t => t.isActive).map(template => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Test Variables (JSON)</Label>
                    <Textarea
                      placeholder='{"patientName": "John Doe", "doctorName": "Dr. Smith"}'
                      rows={4}
                    />
                  </div>
                  <Button className="w-full">
                    <Eye className="mr-2 h-4 w-4" />
                    Preview Template
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="analytics">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Delivery Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>Delivery Rate</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-500 h-2 rounded-full" 
                            style={{ width: `${calculatedStats.deliveryRate}%` }}
                          />
                        </div>
                        <span className="font-medium">{calculatedStats.deliveryRate.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Open Rate</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-500 h-2 rounded-full" 
                            style={{ width: `${calculatedStats.openRate}%` }}
                          />
                        </div>
                        <span className="font-medium">{calculatedStats.openRate.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Click Rate</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-purple-500 h-2 rounded-full" 
                            style={{ width: `${calculatedStats.clickRate}%` }}
                          />
                        </div>
                        <span className="font-medium">{calculatedStats.clickRate.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Email Volume by Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-green-500" />
                        <span>Delivered</span>
                      </div>
                      <span className="font-medium">{calculatedStats.totalDelivered}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-red-500" />
                        <span>Failed</span>
                      </div>
                      <span className="font-medium">{calculatedStats.totalFailed}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-orange-500" />
                        <span>Bounced</span>
                      </div>
                      <span className="font-medium">{calculatedStats.totalBounced}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-yellow-500" />
                        <span>Queued</span>
                      </div>
                      <span className="font-medium">{calculatedStats.queuedEmails}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
        </div>
      </div>

      {/* Add SMTP Configuration Dialog */}
      <Dialog open={showAddSMTPDialog} onOpenChange={setShowAddSMTPDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Add New SMTP Configuration
            </DialogTitle>
            <DialogDescription>
              Configure a new email provider to send emails from your platform
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Provider Selection */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Email Provider
              </h4>
              <Select value={selectedProvider} onValueChange={applyProviderPreset}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose an email provider or configure custom SMTP" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {Object.entries(emailProviders).map(([key, provider]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{provider.icon}</span>
                        <div>
                          <div className="font-medium">{provider.name}</div>
                          <div className="text-xs text-muted-foreground">{provider.description}</div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {selectedProvider && selectedProvider !== 'custom' && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="flex items-center gap-2 text-blue-700 text-sm">
                    <Info className="h-4 w-4" />
                    <span>Configuration auto-filled for {emailProviders[selectedProvider].name}</span>
                  </div>
                  <div className="text-xs text-blue-600 mt-1">
                    Server: {emailProviders[selectedProvider].host}:{emailProviders[selectedProvider].port} ({emailProviders[selectedProvider].encryption.toUpperCase()})
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Basic Configuration */}
              <div className="space-y-4">
                <h4 className="font-medium">Basic Configuration</h4>
                
                <div>
                  <Label htmlFor="smtp-name">Configuration Name</Label>
                  <Input
                    id="smtp-name"
                    placeholder="e.g., Zoho Mail Production"
                    value={newSMTPConfig.name}
                    onChange={(e) => setNewSMTPConfig({...newSMTPConfig, name: e.target.value})}
                  />
                </div>

                <div>
                  <Label htmlFor="smtp-host">SMTP Host</Label>
                  <Input
                    id="smtp-host"
                    placeholder="smtppro.zoho.in"
                    value={newSMTPConfig.host}
                    onChange={(e) => setNewSMTPConfig({...newSMTPConfig, host: e.target.value})}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Zoho Pro: smtppro.zoho.in (SSL/465) or smtp.zoho.com (TLS/587)</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="smtp-port">Port</Label>
                    <Input
                      id="smtp-port"
                      type="number"
                      placeholder="587"
                      value={newSMTPConfig.port}
                      onChange={(e) => setNewSMTPConfig({...newSMTPConfig, port: parseInt(e.target.value) || 587})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="smtp-encryption">Encryption</Label>
                    <Select 
                      value={newSMTPConfig.encryption} 
                      onValueChange={(value) => setNewSMTPConfig({...newSMTPConfig, encryption: value as any})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="tls">TLS</SelectItem>
                        <SelectItem value="ssl">SSL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Authentication */}
              <div className="space-y-4">
                <h4 className="font-medium">Authentication</h4>
                
                <div>
                  <Label htmlFor="smtp-username">Username/Email</Label>
                  <Input
                    id="smtp-username"
                    placeholder="notification@mayden.in"
                    value={newSMTPConfig.username}
                    onChange={(e) => {
                      const username = e.target.value;
                      setNewSMTPConfig({
                        ...newSMTPConfig, 
                        username,
                        // Auto-fill fromEmail if it's empty and username looks like email
                        fromEmail: !newSMTPConfig.fromEmail && username.includes('@') ? username : newSMTPConfig.fromEmail
                      });
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Your Zoho mail account username</p>
                </div>

                <div>
                  <Label htmlFor="smtp-password">Password/App Password</Label>
                  <Input
                    id="smtp-password"
                    type="password"
                    placeholder="Your app password"
                    value={newSMTPConfig.password}
                    onChange={(e) => setNewSMTPConfig({...newSMTPConfig, password: e.target.value})}
                  />
                  {(selectedProvider === 'gmail' || selectedProvider === 'yahoo' || selectedProvider === 'outlook') && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Use App Password, not regular password
                    </p>
                  )}
                  {selectedProvider === 'zoho' || selectedProvider === 'zoho-pro' && (
                    <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      Use your regular Zoho password or App Password
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Email Settings */}
            <div className="space-y-4">
              <h4 className="font-medium">Email Settings</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="smtp-from-name">From Name *</Label>
                  <Input
                    id="smtp-from-name"
                    placeholder="Mayden Notifications"
                    value={newSMTPConfig.fromName}
                    onChange={(e) => setNewSMTPConfig({...newSMTPConfig, fromName: e.target.value})}
                    className={!newSMTPConfig.fromName ? "border-red-300 focus:border-red-500" : ""}
                  />
                  {!newSMTPConfig.fromName && (
                    <p className="text-sm text-red-600 mt-1">From name is required</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="smtp-from-email">From Email *</Label>
                  <Input
                    id="smtp-from-email"
                    placeholder="notification@mayden.in"
                    value={newSMTPConfig.fromEmail}
                    onChange={(e) => setNewSMTPConfig({...newSMTPConfig, fromEmail: e.target.value})}
                    className={!newSMTPConfig.fromEmail ? "border-red-300 focus:border-red-500" : ""}
                  />
                  {!newSMTPConfig.fromEmail && (
                    <p className="text-sm text-red-600 mt-1">From email is required</p>
                  )}
                  <p className="text-xs text-blue-600 mt-1">Configured: notification@mayden.in (Zoho Mail)</p>
                </div>

                <div>
                  <Label htmlFor="smtp-reply-to">Reply To (Optional)</Label>
                  <Input
                    id="smtp-reply-to"
                    placeholder="support@yourdomain.com"
                    value={newSMTPConfig.replyTo}
                    onChange={(e) => setNewSMTPConfig({...newSMTPConfig, replyTo: e.target.value})}
                  />
                </div>

                <div>
                  <Label htmlFor="smtp-daily-limit">Daily Limit</Label>
                  <Input
                    id="smtp-daily-limit"
                    type="number"
                    placeholder="1000"
                    value={newSMTPConfig.dailyLimit}
                    onChange={(e) => setNewSMTPConfig({...newSMTPConfig, dailyLimit: parseInt(e.target.value) || 1000})}
                  />
                </div>
              </div>
            </div>

            {/* Settings */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Switch
                  id="smtp-active"
                  checked={newSMTPConfig.isActive}
                  onCheckedChange={(checked) => setNewSMTPConfig({...newSMTPConfig, isActive: checked})}
                />
                <Label htmlFor="smtp-active">Active</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="smtp-default"
                  checked={newSMTPConfig.isDefault}
                  onCheckedChange={(checked) => setNewSMTPConfig({...newSMTPConfig, isDefault: checked})}
                />
                <Label htmlFor="smtp-default">Set as Default</Label>
              </div>
            </div>

            {/* Provider-specific Help */}
            {selectedProvider && selectedProvider !== 'custom' && (
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <h5 className="font-medium text-sm flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  {emailProviders[selectedProvider].name} Setup Tips
                </h5>
                <div className="text-xs text-gray-600 space-y-1">
                  {selectedProvider === 'gmail' && (
                    <>
                      <p>• Enable 2-factor authentication in your Google account</p>
                      <p>• Generate an App Password: Google Account → Security → App passwords</p>
                      <p>• Use the 16-character app password, not your regular password</p>
                    </>
                  )}
                  {selectedProvider === 'yahoo' && (
                    <>
                      <p>• Enable 2-factor authentication in Yahoo account</p>
                      <p>• Generate App Password: Yahoo Account → Security → App passwords</p>
                      <p>• Use the generated app password for authentication</p>
                    </>
                  )}
                  {selectedProvider === 'outlook' && (
                    <>
                      <p>• Enable 2-factor authentication in Microsoft account</p>
                      <p>• Create App Password: Microsoft Account → Security → App passwords</p>
                      <p>• Use the app password instead of regular password</p>
                    </>
                  )}
                  {(selectedProvider === 'zoho' || selectedProvider === 'zoho-pro') && (
                    <>
                      <p>• Use your regular Zoho email and password</p>
                      <p>• For enhanced security, enable 2FA and use App Password</p>
                      <p>• Professional accounts may require app-specific passwords</p>
                    </>
                  )}
                  {selectedProvider === 'rediffmail' && (
                    <>
                      <p>• Use your Rediffmail email and password</p>
                      <p>• Ensure SMTP access is enabled in your account settings</p>
                      <p>• Contact support if authentication fails</p>
                    </>
                  )}
                  {['amazon-ses', 'sendgrid', 'mailgun', 'postmark'].includes(selectedProvider) && (
                    <>
                      <p>• Use API credentials from your service dashboard</p>
                      <p>• Username is typically 'apikey' or service-specific</p>
                      <p>• Password is your API key or token</p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowAddSMTPDialog(false);
                  resetSMTPForm();
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                onClick={addSMTPConfig}
                disabled={saving || !newSMTPConfig.name || !newSMTPConfig.host || !newSMTPConfig.username || !newSMTPConfig.password || !newSMTPConfig.fromName || !newSMTPConfig.fromEmail}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Configuration
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit SMTP Configuration Dialog */}
      <Dialog open={showEditSMTPDialog} onOpenChange={setShowEditSMTPDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Edit SMTP Configuration
            </DialogTitle>
            <DialogDescription>
              Update the settings for your email provider configuration
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Basic Configuration */}
              <div className="space-y-4">
                <h4 className="font-medium">Basic Configuration</h4>
                
                <div>
                  <Label htmlFor="edit-smtp-name">Configuration Name</Label>
                  <Input
                    id="edit-smtp-name"
                    placeholder="e.g., Zoho Mail Production"
                    value={editSMTPConfig.name || ''}
                    onChange={(e) => setEditSMTPConfig({...editSMTPConfig, name: e.target.value})}
                  />
                </div>

                <div>
                  <Label htmlFor="edit-smtp-host">SMTP Host</Label>
                  <Input
                    id="edit-smtp-host"
                    placeholder="smtppro.zoho.in"
                    value={editSMTPConfig.host || ''}
                    onChange={(e) => setEditSMTPConfig({...editSMTPConfig, host: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="edit-smtp-port">Port</Label>
                    <Input
                      id="edit-smtp-port"
                      type="number"
                      placeholder="465"
                      value={editSMTPConfig.port || ''}
                      onChange={(e) => setEditSMTPConfig({...editSMTPConfig, port: parseInt(e.target.value) || 587})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-smtp-encryption">Encryption</Label>
                    <Select 
                      value={editSMTPConfig.encryption || 'tls'} 
                      onValueChange={(value) => setEditSMTPConfig({...editSMTPConfig, encryption: value as any})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="tls">TLS</SelectItem>
                        <SelectItem value="ssl">SSL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Authentication */}
              <div className="space-y-4">
                <h4 className="font-medium">Authentication</h4>
                
                <div>
                  <Label htmlFor="edit-smtp-username">Username/Email</Label>
                  <Input
                    id="edit-smtp-username"
                    placeholder="notification@mayden.in"
                    value={editSMTPConfig.username || ''}
                    onChange={(e) => setEditSMTPConfig({...editSMTPConfig, username: e.target.value})}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Your Zoho mail account username</p>
                </div>

                <div>
                  <Label htmlFor="edit-smtp-password">Password (leave blank to keep current)</Label>
                  <Input
                    id="edit-smtp-password"
                    type="password"
                    placeholder="Enter new password or leave blank"
                    value={editSMTPConfig.password || ''}
                    onChange={(e) => setEditSMTPConfig({...editSMTPConfig, password: e.target.value})}
                  />
                </div>
              </div>
            </div>

            {/* Email Settings */}
            <div className="space-y-4">
              <h4 className="font-medium">Email Settings</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-smtp-from-name">From Name *</Label>
                  <Input
                    id="edit-smtp-from-name"
                    placeholder="Mayden Notifications"
                    value={editSMTPConfig.fromName || ''}
                    onChange={(e) => setEditSMTPConfig({...editSMTPConfig, fromName: e.target.value})}
                    className={!editSMTPConfig.fromName ? "border-red-300 focus:border-red-500" : ""}
                  />
                  {!editSMTPConfig.fromName && (
                    <p className="text-sm text-red-600 mt-1">From name is required</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="edit-smtp-from-email">From Email *</Label>
                  <Input
                    id="edit-smtp-from-email"
                    placeholder="notification@mayden.in"
                    value={editSMTPConfig.fromEmail || ''}
                    onChange={(e) => setEditSMTPConfig({...editSMTPConfig, fromEmail: e.target.value})}
                    className={!editSMTPConfig.fromEmail ? "border-red-300 focus:border-red-500" : ""}
                  />
                  {!editSMTPConfig.fromEmail && (
                    <p className="text-sm text-red-600 mt-1">From email is required</p>
                  )}
                  <p className="text-xs text-blue-600 mt-1">Configured: notification@mayden.in (Zoho Mail)</p>
                </div>

                <div>
                  <Label htmlFor="edit-smtp-reply-to">Reply To (Optional)</Label>
                  <Input
                    id="edit-smtp-reply-to"
                    placeholder="support@mayden.in"
                    value={editSMTPConfig.replyTo || ''}
                    onChange={(e) => setEditSMTPConfig({...editSMTPConfig, replyTo: e.target.value})}
                  />
                </div>

                <div>
                  <Label htmlFor="edit-smtp-daily-limit">Daily Limit</Label>
                  <Input
                    id="edit-smtp-daily-limit"
                    type="number"
                    placeholder="1000"
                    value={editSMTPConfig.dailyLimit || ''}
                    onChange={(e) => setEditSMTPConfig({...editSMTPConfig, dailyLimit: parseInt(e.target.value) || 1000})}
                  />
                </div>
              </div>
            </div>

            {/* Settings */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-smtp-active"
                  checked={editSMTPConfig.isActive}
                  onCheckedChange={(checked) => setEditSMTPConfig({...editSMTPConfig, isActive: checked})}
                />
                <Label htmlFor="edit-smtp-active">Active</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-smtp-default"
                  checked={editSMTPConfig.isDefault}
                  onCheckedChange={(checked) => setEditSMTPConfig({...editSMTPConfig, isDefault: checked})}
                />
                <Label htmlFor="edit-smtp-default">Set as Default</Label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowEditSMTPDialog(false);
                  setEditingSMTP(null);
                  setEditSMTPConfig({});
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                onClick={updateSMTPConfig}
                disabled={saving || !editSMTPConfig.name || !editSMTPConfig.host || !editSMTPConfig.username || !editSMTPConfig.fromName || !editSMTPConfig.fromEmail}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Settings className="mr-2 h-4 w-4" />
                    Update Configuration
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Send Email Dialog */}
      <Dialog open={showQuickSendDialog} onOpenChange={setShowQuickSendDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Quick Send Email
            </DialogTitle>
            <DialogDescription>
              Send a quick test email to verify your SMTP configuration
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="quick-to">To Email</Label>
              <Input
                id="quick-to"
                type="email"
                placeholder="recipient@example.com"
                value={quickSendData.to}
                onChange={(e) => setQuickSendData({...quickSendData, to: e.target.value})}
              />
            </div>
            
            <div>
              <Label htmlFor="quick-subject">Subject</Label>
              <Input
                id="quick-subject"
                placeholder="Email subject"
                value={quickSendData.subject}
                onChange={(e) => setQuickSendData({...quickSendData, subject: e.target.value})}
              />
            </div>
            
            <div>
              <Label htmlFor="quick-message">Message</Label>
              <Textarea
                id="quick-message"
                placeholder="Your message here..."
                rows={4}
                value={quickSendData.message}
                onChange={(e) => setQuickSendData({...quickSendData, message: e.target.value})}
              />
            </div>
            
            <div>
              <Label htmlFor="quick-priority">Priority</Label>
              <Select 
                value={quickSendData.priority} 
                onValueChange={(value) => setQuickSendData({...quickSendData, priority: value as any})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowQuickSendDialog(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                onClick={handleQuickSend}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send Email
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Template Dialog */}
      <Dialog open={showNewTemplateDialog} onOpenChange={setShowNewTemplateDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New Template
            </DialogTitle>
            <DialogDescription>
              Create a reusable email template with custom content and variables
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="template-name">Template Name</Label>
                <Input
                  id="template-name"
                  placeholder="e.g., Welcome Email"
                  value={newTemplateData.name}
                  onChange={(e) => setNewTemplateData({...newTemplateData, name: e.target.value})}
                />
              </div>
              
              <div>
                <Label htmlFor="template-category">Category</Label>
                <Select 
                  value={newTemplateData.category} 
                  onValueChange={(value) => setNewTemplateData({...newTemplateData, category: value as any})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="notification">Notification</SelectItem>
                    <SelectItem value="welcome">Welcome</SelectItem>
                    <SelectItem value="reminder">Reminder</SelectItem>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label htmlFor="template-subject">Subject Line</Label>
              <Input
                id="template-subject"
                placeholder="Email subject with {{variables}}"
                value={newTemplateData.subject}
                onChange={(e) => setNewTemplateData({...newTemplateData, subject: e.target.value})}
              />
            </div>
            
            <div>
              <Label htmlFor="template-html">HTML Content</Label>
              <Textarea
                id="template-html"
                placeholder="<h1>Hello {{name}}!</h1><p>Welcome to our platform.</p>"
                rows={8}
                value={newTemplateData.htmlContent}
                onChange={(e) => setNewTemplateData({...newTemplateData, htmlContent: e.target.value})}
              />
            </div>
            
            <div>
              <Label htmlFor="template-text">Text Content (Optional)</Label>
              <Textarea
                id="template-text"
                placeholder="Plain text version"
                rows={4}
                value={newTemplateData.textContent}
                onChange={(e) => setNewTemplateData({...newTemplateData, textContent: e.target.value})}
              />
            </div>
            
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowNewTemplateDialog(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={handleCreateTemplate}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Template
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Template Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit Email Template
            </DialogTitle>
            <DialogDescription>
              Update the template content and settings
            </DialogDescription>
          </DialogHeader>
          
          {editingTemplate && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-template-name">Template Name</Label>
                  <Input
                    id="edit-template-name"
                    value={editingTemplate.name}
                    onChange={(e) => setEditingTemplate({...editingTemplate, name: e.target.value})}
                  />
                </div>
                
                <div>
                  <Label htmlFor="edit-template-category">Category</Label>
                  <Select 
                    value={editingTemplate.category} 
                    onValueChange={(value) => setEditingTemplate({...editingTemplate, category: value as any})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="notification">Notification</SelectItem>
                      <SelectItem value="appointment">Appointment</SelectItem>
                      <SelectItem value="billing">Billing</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <Label htmlFor="edit-template-subject">Subject Line</Label>
                <Input
                  id="edit-template-subject"
                  value={editingTemplate.subject}
                  onChange={(e) => setEditingTemplate({...editingTemplate, subject: e.target.value})}
                />
              </div>
              
              <div>
                <Label htmlFor="edit-template-html">HTML Content</Label>
                <Textarea
                  id="edit-template-html"
                  rows={10}
                  value={editingTemplate.htmlContent}
                  onChange={(e) => setEditingTemplate({...editingTemplate, htmlContent: e.target.value})}
                  className="font-mono text-sm"
                />
              </div>
              
              <div>
                <Label htmlFor="edit-template-text">Text Content (Optional)</Label>
                <Textarea
                  id="edit-template-text"
                  rows={4}
                  value={editingTemplate.textContent}
                  onChange={(e) => setEditingTemplate({...editingTemplate, textContent: e.target.value})}
                />
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <Label>Active Status</Label>
                  <p className="text-sm text-muted-foreground">Enable or disable this template</p>
                </div>
                <Switch
                  checked={editingTemplate.isActive}
                  onCheckedChange={(checked) => setEditingTemplate({...editingTemplate, isActive: checked})}
                />
              </div>
              
              {editingTemplate.variables.length > 0 && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <Label className="text-blue-700">Available Variables</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {editingTemplate.variables.map((variable) => (
                      <Badge key={variable} variant="outline" className="bg-white">
                        {`{{${variable}}}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setEditingTemplate(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    // Update template in state
                    setTemplates(templates.map(t => 
                      t.id === editingTemplate.id ? {...editingTemplate, updatedAt: new Date().toISOString()} : t
                    ));
                    toast.success('Template updated successfully');
                    setEditingTemplate(null);
                  }}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview Template Dialog */}
      <Dialog open={!!previewingTemplate} onOpenChange={(open) => !open && setPreviewingTemplate(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Template Preview
            </DialogTitle>
            <DialogDescription>
              Preview how your email template will appear to recipients
            </DialogDescription>
          </DialogHeader>
          
          {previewingTemplate && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <span className="text-sm text-muted-foreground">Template Name:</span>
                  <p className="font-medium">{previewingTemplate.name}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Category:</span>
                  <p className="font-medium capitalize">{previewingTemplate.category}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-sm text-muted-foreground">Subject:</span>
                  <p className="font-medium">{previewingTemplate.subject}</p>
                </div>
              </div>
              
              {previewingTemplate.variables.length > 0 && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <Label className="text-blue-700">Template Variables</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {previewingTemplate.variables.map((variable) => (
                      <Badge key={variable} variant="outline" className="bg-white">
                        {`{{${variable}}}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              <div>
                <Label className="mb-2 block">HTML Preview</Label>
                <div className="border rounded-lg p-4 bg-white min-h-[300px]">
                  <div 
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: previewingTemplate.htmlContent }}
                  />
                </div>
              </div>
              
              {previewingTemplate.textContent && (
                <div>
                  <Label className="mb-2 block">Plain Text Version</Label>
                  <div className="border rounded-lg p-4 bg-gray-50 font-mono text-sm whitespace-pre-wrap">
                    {previewingTemplate.textContent}
                  </div>
                </div>
              )}
              
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setPreviewingTemplate(null)}
                >
                  Close
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    setPreviewingTemplate(null);
                    setEditingTemplate(previewingTemplate);
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Template
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Export Data Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export Email Data
            </DialogTitle>
            <DialogDescription>
              Export your email logs and analytics data in various formats
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              Choose the format for exporting your email logs and analytics data.
            </div>
            
            <div className="grid gap-3">
              <Button
                variant="outline"
                className="flex items-center justify-between h-auto p-4"
                onClick={() => exportEmailLogs('csv')}
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-green-600" />
                  <div className="text-left">
                    <div className="font-medium">CSV Format</div>
                    <div className="text-xs text-gray-500">Spreadsheet compatible</div>
                  </div>
                </div>
                <Download className="h-4 w-4" />
              </Button>
              
              <Button
                variant="outline"
                className="flex items-center justify-between h-auto p-4"
                onClick={() => exportEmailLogs('json')}
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <div className="text-left">
                    <div className="font-medium">JSON Format</div>
                    <div className="text-xs text-gray-500">Developer friendly</div>
                  </div>
                </div>
                <Download className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="pt-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowExportDialog(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default EmailManagement;