import React, { useState, useEffect } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { 
  Settings, 
  Mail, 
  Server,
  TestTube,
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  FileText,
  RotateCcw,
  Send
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';

// Email Providers Presets
const emailProviders = {
  'zoho-pro': {
    name: 'Zoho Professional Mail',
    host: 'smtppro.zoho.in',
    port: 465,
    encryption: 'ssl'
  },
  'zoho': {
    name: 'Zoho Mail',
    host: 'smtp.zoho.com',
    port: 587,
    encryption: 'tls'
  },
  'gmail': {
    name: 'Gmail',
    host: 'smtp.gmail.com',
    port: 587,
    encryption: 'tls'
  },
  'outlook': {
    name: 'Outlook/Hotmail',
    host: 'smtp-mail.outlook.com',
    port: 587,
    encryption: 'tls'
  },
  'custom': {
    name: 'Custom SMTP',
    host: '',
    port: 587,
    encryption: 'tls'
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
  provider: string;
  testStatus?: 'pending' | 'success' | 'failed';
}

// ── Email Template Library types ─────────────────────────────────────────────
interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  htmlContent: string;
  updatedAt: string;
}

interface EventTypeMeta {
  eventType: string;
  name: string;
  description: string;
  defaultSubject: string;
  color: string;
  variables: string[];
}

interface EventAssignment {
  templateId: number | null;
  templateName: string | null;
}
// ─────────────────────────────────────────────────────────────────────────────

const mapApiToUiConfig = (item: any): SMTPConfig => ({
  id: item.id,
  name: item.displayName || item.name || item.email || 'SMTP Config',
  host: item.smtpHost || item.imapHost || '',
  port: item.smtpPort || item.imapPort || 587,
  username: item.smtpUsername || item.imapUsername || item.email || '',
  password: '',
  encryption: item.smtpSecure ? 'ssl' : 'tls',
  isDefault: item.isDefault === true,
  isActive: item.isActive !== false,
  fromName: item.displayName || '',
  fromEmail: item.email || '',
  provider: item.provider || 'custom'
});

const buildApiPayload = (config: Partial<SMTPConfig>) => {
  const secure = config.encryption === 'ssl';
  return {
    email: config.fromEmail || config.username,
    displayName: config.fromName || config.name,
    provider: config.provider || 'custom',
    smtpHost: config.host,
    smtpPort: config.port,
    smtpSecure: secure,
    smtpUsername: config.username,
    smtpPassword: config.password,
    imapHost: config.provider === 'zoho-pro' ? 'imappro.zoho.in' : undefined,
    imapPort: 993,
    imapSecure: true,
    imapUsername: config.username,
    imapPassword: config.password,
    isDefault: config.isDefault === true,
    isActive: config.isActive !== false
  };
};

const TeamSettings: React.FC = () => {
  const [smtpConfigs, setSMTPConfigs] = useState<SMTPConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingConfig, setTestingConfig] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [editingConfig, setEditingConfig] = useState<SMTPConfig | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Email Templates state
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [eventTypes, setEventTypes] = useState<EventTypeMeta[]>([]);
  const [assignments, setAssignments] = useState<Record<string, EventAssignment>>({});
  const [templatesLoading, setTemplatesLoading] = useState(false);
  // template editor dialog
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: '', subject: '', htmlContent: '' });
  const [templateSaving, setTemplateSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  // test email
  const [testEmailAddr, setTestEmailAddr] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  
  const [newConfig, setNewConfig] = useState<Partial<SMTPConfig>>({
    provider: 'zoho-pro',
    encryption: 'tls',
    port: 587,
    isActive: true,
    isDefault: false
  });

  useEffect(() => {
    loadConfigs();
    loadEmailTemplates();
  }, []);

  const loadEmailTemplates = async () => {
    try {
      setTemplatesLoading(true);
      const response = await api.get('/team/welcome-email-templates');
      if (response.data.success) {
        const { templates, assignments: asgn, eventTypes: evts } = response.data.data;
        setEmailTemplates(templates || []);
        setAssignments(asgn || {});
        setEventTypes(evts || []);
      }
    } catch (error: any) {
      if (error.response?.status !== 404) console.error('Failed to load email templates:', error);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const openCreateTemplate = () => {
    setIsCreateMode(true);
    setEditingTemplate(null);
    setTemplateForm({ name: '', subject: '', htmlContent: '' });
    setPreviewMode(false);
    setIsTemplateDialogOpen(true);
  };

  const openEditTemplate = (tpl: EmailTemplate) => {
    setIsCreateMode(false);
    setEditingTemplate(tpl);
    setTemplateForm({ name: tpl.name, subject: tpl.subject, htmlContent: tpl.htmlContent });
    setPreviewMode(false);
    setIsTemplateDialogOpen(true);
  };

  const saveTemplate = async () => {
    if (!templateForm.name || !templateForm.subject || !templateForm.htmlContent) {
      toast.error('Name, subject and HTML content are required');
      return;
    }
    try {
      setTemplateSaving(true);
      if (isCreateMode) {
        await api.post('/team/welcome-email-templates', templateForm);
        toast.success('Template created');
      } else if (editingTemplate) {
        await api.put(`/team/welcome-email-templates/${editingTemplate.id}`, templateForm);
        toast.success('Template updated');
      }
      setIsTemplateDialogOpen(false);
      await loadEmailTemplates();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save template');
    } finally {
      setTemplateSaving(false);
    }
  };

  const deleteTemplate = async (id: number) => {
    if (!confirm('Delete this template? Any event using it will fall back to the built-in default.')) return;
    try {
      await api.delete(`/team/welcome-email-templates/${id}`);
      toast.success('Template deleted');
      await loadEmailTemplates();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete template');
    }
  };

  const assignTemplate = async (eventType: string, templateId: number | null) => {
    try {
      await api.put('/team/welcome-email-templates/assign', { eventType, templateId });
      toast.success(templateId ? 'Template assigned to event' : 'Reset to built-in default');
      await loadEmailTemplates();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update assignment');
    }
  };

  const sendTestEmail = async () => {
    if (!editingTemplate && !isCreateMode) return;
    if (!testEmailAddr) { toast.error('Please enter a test email address'); return; }
    if (!templateForm.subject || !templateForm.htmlContent) { toast.error('Fill in subject and HTML content first'); return; }
    try {
      setSendingTest(true);
      const id = editingTemplate?.id ?? 0;
      await api.post(`/team/welcome-email-templates/${id}/test`, {
        testEmail: testEmailAddr,
        subject: templateForm.subject,
        htmlContent: templateForm.htmlContent
      });
      toast.success(`Test email sent to ${testEmailAddr}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to send test email');
    } finally {
      setSendingTest(false);
    }
  };

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const response = await api.get('/email-settings');
      if (response.data.success) {
        const mappedConfigs = (response.data.data || []).map((item: any) => mapApiToUiConfig(item));
        setSMTPConfigs(mappedConfigs);
      }
    } catch (error: any) {
      console.error('❌ loadConfigs error:', error.response?.status, error.response?.data);
      if (error.response?.status !== 404) {
        toast.error(`Failed to load SMTP configurations: ${error.response?.data?.message || error.message}`);
      }
      setSMTPConfigs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = (provider: string) => {
    const preset = emailProviders[provider as keyof typeof emailProviders];
    setNewConfig({
      ...newConfig,
      provider,
      host: preset.host,
      port: preset.port,
      encryption: preset.encryption as 'none' | 'tls' | 'ssl'
    });
  };

  const saveConfig = async () => {
    try {
      if (!newConfig.name || !newConfig.host || !newConfig.username || !newConfig.password || !newConfig.fromEmail) {
        toast.error('Please fill in all required fields');
        return;
      }

      setLoading(true);
      
      const payload = buildApiPayload(newConfig);

      if (editingConfig) {
        // Update existing
        const response = await api.put(`/email-settings/${editingConfig.id}`, payload);
        if (response.data.success) {
          toast.success('SMTP configuration updated successfully');
          setEditingConfig(null);
        }
      } else {
        // Create new
        const response = await api.post('/email-settings', payload);
        if (response.data.success) {
          toast.success('SMTP configuration created successfully');
        }
      }
      
      await loadConfigs();
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save SMTP configuration');
    } finally {
      setLoading(false);
    }
  };

  const testConfig = async (configId: string) => {
    try {
      setTestingConfig(configId);
      const testEmail = prompt('Enter email address to send test email:');
      
      if (!testEmail) return;

      const response = await api.post(`/email-settings/${configId}/test`, {
        testEmail
      });

      if (response.data.success) {
        toast.success('Test email sent successfully! Check your inbox.');
        setSMTPConfigs(configs => 
          configs.map(c => c.id === configId ? { ...c, testStatus: 'success' } : c)
        );
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Test email failed');
      setSMTPConfigs(configs => 
        configs.map(c => c.id === configId ? { ...c, testStatus: 'failed' } : c)
      );
    } finally {
      setTestingConfig(null);
    }
  };

  const deleteConfig = async (configId: string) => {
    if (smtpConfigs.length <= 1) {
      toast.error('At least one SMTP configuration must remain');
      return;
    }

    if (!confirm('Are you sure you want to delete this SMTP configuration?')) return;

    try {
      console.log('🗑️ Deleting config:', configId);
      await api.delete(`/email-settings/${configId}`);
      console.log('✅ Delete successful');
      toast.success('SMTP configuration deleted');
      await loadConfigs();
    } catch (error: any) {
      console.error('❌ Delete error:', error.response?.status, error.response?.data);
      toast.error(error.response?.data?.message || 'Failed to delete configuration');
    }
  };

  const setDefaultConfig = async (configId: string) => {
    try {
      await api.put(`/email-settings/${configId}/set-default`);
      toast.success('Default SMTP configuration updated');
      await loadConfigs();
    } catch (error: any) {
      toast.error('Failed to set default configuration');
    }
  };

  const editConfig = (config: SMTPConfig) => {
    setEditingConfig(config);
    setNewConfig(config);
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setNewConfig({
      provider: 'zoho-pro',
      encryption: 'tls',
      port: 587,
      isActive: true,
      isDefault: false
    });
    setEditingConfig(null);
  };

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Settings className="h-8 w-8" />
              Team Settings
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure SMTP settings, notifications, and team preferences
            </p>
          </div>
        </div>

        <Tabs defaultValue="smtp" className="space-y-6">
          <TabsList>
            <TabsTrigger value="smtp" className="gap-2">
              <Mail className="h-4 w-4" />
              Email & SMTP
            </TabsTrigger>
            <TabsTrigger value="email-templates" className="gap-2">
              <FileText className="h-4 w-4" />
              Email Templates
            </TabsTrigger>
            <TabsTrigger value="notifications">
              Notifications
            </TabsTrigger>
            <TabsTrigger value="preferences">
              Preferences
            </TabsTrigger>
          </TabsList>

          <TabsContent value="smtp" className="space-y-6">
            {/* SMTP Configurations */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Server className="h-5 w-5" />
                      SMTP Configurations
                    </CardTitle>
                    <CardDescription>
                      Manage email server settings for sending emails from the platform
                    </CardDescription>
                  </div>
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={resetForm}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add SMTP Config
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>
                          {editingConfig ? 'Edit SMTP Configuration' : 'Add New SMTP Configuration'}
                        </DialogTitle>
                        <DialogDescription className="sr-only">SMTP configuration form</DialogDescription>
                      </DialogHeader>
                      
                      <div className="space-y-4 py-4">
                        {/* Provider Selection */}
                        <div className="space-y-2">
                          <Label>Email Provider</Label>
                          <Select 
                            value={newConfig.provider} 
                            onValueChange={handleProviderChange}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(emailProviders).map(([key, provider]) => (
                                <SelectItem key={key} value={key}>
                                  {provider.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Configuration Name */}
                        <div className="space-y-2">
                          <Label>Configuration Name *</Label>
                          <Input
                            placeholder="e.g., Main SMTP Server"
                            value={newConfig.name || ''}
                            onChange={(e) => setNewConfig({ ...newConfig, name: e.target.value })}
                          />
                        </div>

                        {/* SMTP Server Details */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>SMTP Host *</Label>
                            <Input
                              placeholder="smtp.example.com"
                              value={newConfig.host || ''}
                              onChange={(e) => setNewConfig({ ...newConfig, host: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Port *</Label>
                            <Input
                              type="number"
                              value={newConfig.port || 587}
                              onChange={(e) => setNewConfig({ ...newConfig, port: parseInt(e.target.value) })}
                            />
                          </div>
                        </div>

                        {/* Authentication */}
                        <div className="space-y-2">
                          <Label>Username / Email *</Label>
                          <Input
                            placeholder="your-email@example.com"
                            value={newConfig.username || ''}
                            onChange={(e) => setNewConfig({ ...newConfig, username: e.target.value })}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Password *</Label>
                          <div className="relative">
                            <Input
                              type={showPassword['new'] ? 'text' : 'password'}
                              placeholder="••••••••"
                              value={newConfig.password || ''}
                              onChange={(e) => setNewConfig({ ...newConfig, password: e.target.value })}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3"
                              onClick={() => setShowPassword({ ...showPassword, new: !showPassword['new'] })}
                            >
                              {showPassword['new'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>

                        {/* From Email */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>From Email *</Label>
                            <Input
                              type="email"
                              placeholder="noreply@example.com"
                              value={newConfig.fromEmail || ''}
                              onChange={(e) => setNewConfig({ ...newConfig, fromEmail: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>From Name *</Label>
                            <Input
                              placeholder="Mediqzy Team"
                              value={newConfig.fromName || ''}
                              onChange={(e) => setNewConfig({ ...newConfig, fromName: e.target.value })}
                            />
                          </div>
                        </div>

                        {/* Encryption */}
                        <div className="space-y-2">
                          <Label>Encryption</Label>
                          <Select 
                            value={newConfig.encryption} 
                            onValueChange={(value: 'none' | 'tls' | 'ssl') => 
                              setNewConfig({ ...newConfig, encryption: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="tls">TLS (Recommended)</SelectItem>
                              <SelectItem value="ssl">SSL</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Options */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label>Set as Default</Label>
                            <Switch
                              checked={newConfig.isDefault || false}
                              onCheckedChange={(checked) => setNewConfig({ ...newConfig, isDefault: checked })}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label>Active</Label>
                            <Switch
                              checked={newConfig.isActive !== false}
                              onCheckedChange={(checked) => setNewConfig({ ...newConfig, isActive: checked })}
                            />
                          </div>
                        </div>
                      </div>

                      <DialogFooter>
                        <Button variant="outline" onClick={() => {
                          setIsDialogOpen(false);
                          resetForm();
                        }}>
                          Cancel
                        </Button>
                        <Button onClick={saveConfig} disabled={loading}>
                          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          <Save className="h-4 w-4 mr-2" />
                          Save Configuration
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {loading && smtpConfigs.length === 0 ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : smtpConfigs.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No SMTP configurations found. Add one to start sending emails.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Host</TableHead>
                        <TableHead>From Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Default</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {smtpConfigs.map((config) => (
                        <TableRow key={config.id}>
                          <TableCell className="font-medium">{config.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {config.host}:{config.port}
                          </TableCell>
                          <TableCell className="text-sm">{config.fromEmail}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {config.isActive ? (
                                <Badge variant="success" className="gap-1">
                                  <CheckCircle className="h-3 w-3" />
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="gap-1">
                                  <XCircle className="h-3 w-3" />
                                  Inactive
                                </Badge>
                              )}
                              {config.testStatus === 'success' && (
                                <Badge variant="outline" className="gap-1">
                                  <CheckCircle className="h-3 w-3 text-green-600" />
                                  Tested
                                </Badge>
                              )}
                              {config.testStatus === 'failed' && (
                                <Badge variant="outline" className="gap-1">
                                  <XCircle className="h-3 w-3 text-red-600" />
                                  Failed
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {config.isDefault ? (
                              <Badge variant="default">Default</Badge>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDefaultConfig(config.id)}
                              >
                                Set Default
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => testConfig(config.id)}
                                disabled={testingConfig === config.id}
                              >
                                {testingConfig === config.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <TestTube className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => editConfig(config)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deleteConfig(config.id)}
                                disabled={smtpConfigs.length <= 1}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="email-templates" className="space-y-6">

            {/* ── Template Library ─────────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Template Library
                    </CardTitle>
                    <CardDescription>
                      Create and manage reusable HTML email templates. Assign them to events below.
                    </CardDescription>
                  </div>
                  <Button onClick={openCreateTemplate}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Template
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {templatesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : emailTemplates.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No templates yet</p>
                    <p className="text-sm mt-1">Click "New Template" to create your first email template.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Last Modified</TableHead>
                        <TableHead className="w-[140px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emailTemplates.map((tpl) => (
                        <TableRow key={tpl.id}>
                          <TableCell className="font-medium">{tpl.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate">{tpl.subject}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(tpl.updatedAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openEditTemplate(tpl)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => deleteTemplate(tpl.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* ── Event Configuration ──────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Event Configuration
                </CardTitle>
                <CardDescription>
                  Choose which template fires for each automatic email event. Select "Built-in default" to use the system template.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {eventTypes.length === 0 && !templatesLoading ? (
                  <p className="text-sm text-muted-foreground py-4">Loading event types…</p>
                ) : (
                  <div className="space-y-0 divide-y">
                    {eventTypes.map((et) => {
                      const current = assignments[et.eventType];
                      return (
                        <div key={et.eventType} className="flex items-center gap-4 py-4">
                          <div
                            className="w-2 h-10 rounded-full flex-shrink-0"
                            style={{ backgroundColor: et.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{et.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{et.description}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {current?.templateId && (
                              <Badge variant="default" className="text-xs hidden sm:flex">Active</Badge>
                            )}
                            <Select
                              value={current?.templateId?.toString() ?? 'default'}
                              onValueChange={(val) =>
                                assignTemplate(et.eventType, val === 'default' ? null : parseInt(val))
                              }
                            >
                              <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="Select template…" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="default">
                                  <span className="flex items-center gap-1.5">
                                    <RotateCcw className="h-3 w-3 text-muted-foreground" />
                                    Built-in default
                                  </span>
                                </SelectItem>
                                {emailTemplates.map((tpl) => (
                                  <SelectItem key={tpl.id} value={tpl.id.toString()}>
                                    {tpl.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Template Editor / Creator Dialog ─────────────────────────── */}
            <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
              <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {isCreateMode ? 'Create New Template' : `Edit: ${editingTemplate?.name}`}
                  </DialogTitle>
                  <DialogDescription>
                    Write the full HTML body. Use{' '}
                    <code className="text-xs bg-muted px-1 rounded">{'{{variableName}}'}</code>{' '}
                    placeholders — click any variable chip to insert it at the cursor.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  {/* Name */}
                  <div className="space-y-1">
                    <Label>Template Name *</Label>
                    <Input
                      placeholder="e.g. Blue Doctor Welcome"
                      value={templateForm.name}
                      onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                    />
                  </div>

                  {/* Subject */}
                  <div className="space-y-1">
                    <Label>Email Subject *</Label>
                    <Input
                      placeholder="e.g. Welcome to Mediqzy — Your login details"
                      value={templateForm.subject}
                      onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                    />
                  </div>

                  {/* Variable chips */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">All available variables (click to insert)</Label>
                    <div className="flex flex-wrap gap-1">
                      {['{{firstName}}','{{lastName}}','{{email}}','{{role}}','{{department}}','{{temporaryPassword}}','{{specialization}}','{{hospitalName}}','{{companyName}}','{{contactPerson}}','{{employeeId}}'].map((v) => (
                        <code
                          key={v}
                          className="text-xs bg-muted px-2 py-1 rounded cursor-pointer select-none hover:bg-primary hover:text-primary-foreground transition-colors"
                          onClick={() => {
                            const el = document.getElementById('tpl-html-editor') as HTMLTextAreaElement;
                            if (el) {
                              const s = el.selectionStart, e2 = el.selectionEnd;
                              const val = templateForm.htmlContent.substring(0, s) + v + templateForm.htmlContent.substring(e2);
                              setTemplateForm(f => ({ ...f, htmlContent: val }));
                              setTimeout(() => { el.selectionStart = el.selectionEnd = s + v.length; el.focus(); }, 0);
                            }
                          }}
                        >
                          {v}
                        </code>
                      ))}
                    </div>
                  </div>

                  {/* Edit / Preview toggle */}
                  <div className="flex items-center gap-2 border-b pb-2">
                    <Button variant={previewMode ? 'outline' : 'default'} size="sm" onClick={() => setPreviewMode(false)}>
                      <Edit className="h-4 w-4 mr-1" /> Edit HTML
                    </Button>
                    <Button variant={previewMode ? 'default' : 'outline'} size="sm" onClick={() => setPreviewMode(true)} disabled={!templateForm.htmlContent}>
                      <Eye className="h-4 w-4 mr-1" /> Preview
                    </Button>
                  </div>

                  {/* Editor or Preview */}
                  {!previewMode ? (
                    <div className="space-y-1">
                      <Label>HTML Content *</Label>
                      <Textarea
                        id="tpl-html-editor"
                        value={templateForm.htmlContent}
                        onChange={(e) => setTemplateForm({ ...templateForm, htmlContent: e.target.value })}
                        placeholder="Paste your full HTML email here. Use {{variableName}} for dynamic content."
                        rows={20}
                        className="font-mono text-xs"
                      />
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <iframe
                        srcDoc={templateForm.htmlContent}
                        title="Email Preview"
                        className="w-full"
                        style={{ height: '480px', border: 'none' }}
                        sandbox="allow-same-origin"
                      />
                    </div>
                  )}

                  {/* Test Email */}
                  <div className="border rounded-lg p-4 space-y-2 bg-muted/20">
                    <Label className="text-sm font-medium">Send Test Email</Label>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder="test@example.com"
                        value={testEmailAddr}
                        onChange={(e) => setTestEmailAddr(e.target.value)}
                        className="flex-1"
                      />
                      <Button variant="outline" onClick={sendTestEmail} disabled={sendingTest || !testEmailAddr}>
                        {sendingTest ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                        Send Test
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sends using the current editor content with sample values substituted for all variables.
                    </p>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsTemplateDialogOpen(false)}>Cancel</Button>
                  <Button onClick={saveTemplate} disabled={templateSaving}>
                    {templateSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
                    {isCreateMode ? 'Create Template' : 'Save Changes'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Configure how you want to receive notifications
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Notification settings coming soon...
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preferences" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Team Preferences</CardTitle>
                <CardDescription>
                  Customize your team workspace settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Team preferences coming soon...
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default TeamSettings;
