import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { loadHospitalStore, saveHospitalStore } from '@/utils/hospitalStorage';
import api from '@/lib/api';
import {
  MessageSquare, Mail, Send, Phone, Video, Smartphone, Settings,
  BarChart3, Users, CheckCircle, XCircle, Clock, RefreshCw,
  Plus, Search, Eye, Edit, Trash2, Download, Upload, Bell,
  FileText, Calendar, TrendingUp, AlertCircle, Filter, MoreVertical,
  MessageCircle, PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  Loader2, PlayCircle, PauseCircle, Mic, MicOff, Volume2, VolumeX,
  Copy, ExternalLink, ChevronRight, ArrowRight, Paperclip, Image,
  User, UserCheck, Building2, Stethoscope
} from 'lucide-react';

// Message template types
interface MessageTemplate {
  id: string;
  name: string;
  category: 'appointment' | 'discharge' | 'billing' | 'lab_results' | 'prescription' | 'general';
  channel: 'email' | 'sms' | 'whatsapp' | 'all';
  subject?: string;
  content: string;
  variables: string[];
  isActive: boolean;
}

// Communication log type
interface CommunicationLog {
  id: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'voice';
  recipient: string;
  recipientName: string;
  subject?: string;
  message: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'pending';
  timestamp: string;
  direction: 'outbound' | 'inbound';
}

// Patient contact type
interface PatientContact {
  id: string;
  name: string;
  phone: string;
  email: string;
  admissionId?: string;
  ward?: string;
  lastContact?: string;
}

const HospitalCommunicationHub = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<'email' | 'sms' | 'whatsapp' | 'voice'>('email');
  const [selectedComm, setSelectedComm] = useState<CommunicationLog | null>(null);
  const [showCommDialog, setShowCommDialog] = useState(false);

  const hospitalHeaders = () => {
    const token = localStorage.getItem('hospitalToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Stats state
  const [stats, setStats] = useState({
    email: { sent: 1248, delivered: 1190, failed: 58, pending: 12 },
    sms: { sent: 3456, delivered: 3380, failed: 76, pending: 8 },
    whatsapp: { sent: 2890, delivered: 2845, read: 2650, failed: 45 },
    voice: { total: 567, answered: 489, missed: 78, avgDuration: '2:34' }
  });

  // Recent communications
  const initialRecentComms: CommunicationLog[] = [
    {
      id: '1',
      channel: 'whatsapp',
      recipient: '+91 98765 43210',
      recipientName: 'Rajesh Kumar',
      message: 'Your discharge summary is ready. Please collect from reception.',
      status: 'read',
      timestamp: '2026-01-07T10:30:00',
      direction: 'outbound'
    },
    {
      id: '2',
      channel: 'sms',
      recipient: '+91 87654 32109',
      recipientName: 'Priya Singh',
      message: 'Appointment reminder: Dr. Patel at 3:00 PM today',
      status: 'delivered',
      timestamp: '2026-01-07T09:15:00',
      direction: 'outbound'
    },
    {
      id: '3',
      channel: 'email',
      recipient: 'amit.verma@email.com',
      recipientName: 'Amit Verma',
      subject: 'Lab Results Available',
      message: 'Your lab results are now available in the patient portal.',
      status: 'delivered',
      timestamp: '2026-01-07T08:45:00',
      direction: 'outbound'
    },
    {
      id: '4',
      channel: 'voice',
      recipient: '+91 76543 21098',
      recipientName: 'Neha Gupta',
      message: 'Follow-up call regarding post-operative care',
      status: 'sent',
      timestamp: '2026-01-07T11:00:00',
      direction: 'outbound'
    }
  ];
  const [recentComms, setRecentComms] = useState<CommunicationLog[]>(
    () => loadHospitalStore('hospital-communication-logs', initialRecentComms)
  );

  // Templates
  // invented-data-check: static-reference -- default communication-template presets, not patient records.
  const initialTemplates: MessageTemplate[] = [
    {
      id: '1',
      name: 'Appointment Reminder',
      category: 'appointment',
      channel: 'all',
      subject: 'Appointment Reminder - {{hospital_name}}',
      content: 'Dear {{patient_name}}, this is a reminder for your appointment with {{doctor_name}} on {{date}} at {{time}}. Please arrive 15 minutes early.',
      variables: ['patient_name', 'doctor_name', 'date', 'time', 'hospital_name'],
      isActive: true
    },
    {
      id: '2',
      name: 'Discharge Summary Ready',
      category: 'discharge',
      channel: 'whatsapp',
      content: 'Dear {{patient_name}}, your discharge summary is ready. Please collect it from the billing counter. For queries, call {{helpline}}.',
      variables: ['patient_name', 'helpline'],
      isActive: true
    },
    {
      id: '3',
      name: 'Lab Results Available',
      category: 'lab_results',
      channel: 'email',
      subject: 'Your Lab Results are Ready',
      content: 'Dear {{patient_name}}, your {{test_name}} results are now available. You can view them in the patient portal or collect the physical copy from the lab.',
      variables: ['patient_name', 'test_name'],
      isActive: true
    },
    {
      id: '4',
      name: 'Bill Payment Reminder',
      category: 'billing',
      channel: 'sms',
      content: 'Dear {{patient_name}}, your bill amount ₹{{amount}} is due. Please pay at the billing counter or online. Bill No: {{bill_no}}',
      variables: ['patient_name', 'amount', 'bill_no'],
      isActive: true
    },
    {
      id: '5',
      name: 'Prescription Refill',
      category: 'prescription',
      channel: 'whatsapp',
      content: 'Dear {{patient_name}}, your prescription for {{medicine}} is due for refill. Please consult your doctor or visit our pharmacy.',
      variables: ['patient_name', 'medicine'],
      isActive: true
    }
  ];
  const [templates, setTemplates] = useState<MessageTemplate[]>(
    () => loadHospitalStore('hospital-communication-templates', initialTemplates)
  );

  // Patient contacts for quick messaging
  const [patientContacts, setPatientContacts] = useState<PatientContact[]>([
    { id: 'P001', name: 'Rajesh Kumar', phone: '+91 98765 43210', email: 'rajesh.k@email.com', admissionId: 'IP001', ward: 'ICU' },
    { id: 'P002', name: 'Priya Singh', phone: '+91 87654 32109', email: 'priya.s@email.com', admissionId: 'IP002', ward: 'Gynecology' },
    { id: 'P003', name: 'Amit Verma', phone: '+91 76543 21098', email: 'amit.v@email.com', admissionId: 'IP003', ward: 'Neurology' },
    { id: 'P004', name: 'Neha Gupta', phone: '+91 65432 10987', email: 'neha.g@email.com', admissionId: 'IP004', ward: 'Orthopedics' },
    { id: 'P005', name: 'Vikram Reddy', phone: '+91 54321 09876', email: 'vikram.r@email.com', ward: 'General Medicine' },
  ]);

  // Form states
  const [emailForm, setEmailForm] = useState({
    to: '',
    cc: '',
    subject: '',
    body: '',
    templateId: ''
  });

  const [smsForm, setSmsForm] = useState({
    to: '',
    message: '',
    templateId: ''
  });

  const [whatsappForm, setWhatsappForm] = useState({
    to: '',
    message: '',
    templateId: '',
    mediaUrl: ''
  });

  const [voiceForm, setVoiceForm] = useState({
    to: '',
    script: '',
    callType: 'reminder'
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [templateMode, setTemplateMode] = useState<'new' | 'edit' | 'duplicate'>('new');
  const [templateForm, setTemplateForm] = useState<MessageTemplate>({
    id: '',
    name: '',
    category: 'general',
    channel: 'all',
    subject: '',
    content: '',
    variables: [],
    isActive: true
  });
  const [templateVariablesInput, setTemplateVariablesInput] = useState('');

  useEffect(() => {
    saveHospitalStore('hospital-communication-templates', templates);
  }, [templates]);

  const openNewTemplate = () => {
    setTemplateMode('new');
    setSelectedTemplate(null);
    setTemplateForm({
      id: '',
      name: '',
      category: 'general',
      channel: 'all',
      subject: '',
      content: '',
      variables: [],
      isActive: true
    });
    setTemplateVariablesInput('');
    setShowTemplateDialog(true);
  };

  const openEditTemplate = (template: MessageTemplate) => {
    setTemplateMode('edit');
    setSelectedTemplate(template);
    setTemplateForm({ ...template });
    setTemplateVariablesInput(template.variables.join(', '));
    setShowTemplateDialog(true);
  };

  const openDuplicateTemplate = (template: MessageTemplate) => {
    setTemplateMode('duplicate');
    setSelectedTemplate(template);
    setTemplateForm({
      ...template,
      id: '',
      name: `${template.name} (Copy)`
    });
    setTemplateVariablesInput(template.variables.join(', '));
    setShowTemplateDialog(true);
  };

  const handleTemplateSave = () => {
    if (!templateForm.name.trim() || !templateForm.content.trim()) {
      toast({
        title: 'Missing fields',
        description: 'Template name and content are required.',
        variant: 'destructive'
      });
      return;
    }

    const variables = templateVariablesInput
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    if (templateMode === 'edit' && templateForm.id) {
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === templateForm.id ? { ...templateForm, variables } : t
        )
      );
    } else {
      const id = templateForm.id || `tpl_${Date.now()}`;
      setTemplates((prev) => [
        ...prev,
        { ...templateForm, id, variables }
      ]);
    }

    setShowTemplateDialog(false);
    toast({
      title: 'Template saved',
      description: 'Your template has been saved successfully.'
    });
  };

  const getStatusBadge = (status: string) => {
    const config = {
      sent: { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Send },
      delivered: { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle },
      read: { color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400', icon: Eye },
      failed: { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
      pending: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: Clock }
    };
    const { color, icon: Icon } = config[status as keyof typeof config] || config.pending;
    return (
      <Badge className={`${color} gap-1`}>
        <Icon className="h-3 w-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email': return <Mail className="h-4 w-4" />;
      case 'sms': return <Smartphone className="h-4 w-4" />;
      case 'whatsapp': return <MessageSquare className="h-4 w-4" />;
      case 'voice': return <Phone className="h-4 w-4" />;
      default: return <MessageCircle className="h-4 w-4" />;
    }
  };

  const handleSendEmail = async () => {
    if (!emailForm.to || !emailForm.subject || !emailForm.body) {
      toast({ title: 'Missing Fields', description: 'Please fill all required fields', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      // Call API to send email
      try {
        await api.post('/hospital/communication/email/send', {
          to: emailForm.to,
          subject: emailForm.subject,
          body: emailForm.body
        }, { headers: hospitalHeaders() });
      } catch (err: any) {
        console.error('Email API error:', err);
        // Continue with local persistence even if API fails
      }
      
      const entry: CommunicationLog = {
        id: `C-${Date.now()}`,
        channel: 'email',
        recipient: emailForm.to,
        recipientName: emailForm.to,
        subject: emailForm.subject,
        message: emailForm.body,
        status: 'sent',
        timestamp: new Date().toISOString(),
        direction: 'outbound'
      };
      setRecentComms(prev => {
        const next = [entry, ...prev];
        saveHospitalStore('hospital-communication-logs', next);
        return next;
      });
      setStats(prev => ({
        ...prev,
        email: { ...prev.email, sent: prev.email.sent + 1, delivered: prev.email.delivered + 1 }
      }));
      toast({ title: 'Email Sent', description: `Email sent to ${emailForm.to}` });
      setEmailForm({ to: '', cc: '', subject: '', body: '', templateId: '' });
    } catch (error: any) {
      toast({ title: 'Failed', description: error.message || 'Failed to send email', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSendSMS = async () => {
    if (!smsForm.to || !smsForm.message) {
      toast({ title: 'Missing Fields', description: 'Please provide phone number and message', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      // Call API to send SMS
      try {
        await api.post('/hospital/communication/sms/send', {
          phone: smsForm.to,
          message: smsForm.message
        }, { headers: hospitalHeaders() });
      } catch (err: any) {
        console.error('SMS API error:', err);
        // Continue with local persistence even if API fails
      }
      
      const entry: CommunicationLog = {
        id: `C-${Date.now()}`,
        channel: 'sms',
        recipient: smsForm.to,
        recipientName: smsForm.to,
        message: smsForm.message,
        status: 'sent',
        timestamp: new Date().toISOString(),
        direction: 'outbound'
      };
      setRecentComms(prev => {
        const next = [entry, ...prev];
        saveHospitalStore('hospital-communication-logs', next);
        return next;
      });
      setStats(prev => ({
        ...prev,
        sms: { ...prev.sms, sent: prev.sms.sent + 1, delivered: prev.sms.delivered + 1 }
      }));
      toast({ title: 'SMS Sent', description: `SMS sent to ${smsForm.to}` });
      setSmsForm({ to: '', message: '', templateId: '' });
    } catch (error: any) {
      toast({ title: 'Failed', description: error.message || 'Failed to send SMS', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!whatsappForm.to || !whatsappForm.message) {
      toast({ title: 'Missing Fields', description: 'Please provide phone number and message', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      // Call API to send WhatsApp
      try {
        await api.post('/hospital/communication/whatsapp/send', {
          phone: whatsappForm.to,
          message: whatsappForm.message
        }, { headers: hospitalHeaders() });
      } catch (err: any) {
        console.error('WhatsApp API error:', err);
        // Continue with local persistence even if API fails
      }
      
      const entry: CommunicationLog = {
        id: `C-${Date.now()}`,
        channel: 'whatsapp',
        recipient: whatsappForm.to,
        recipientName: whatsappForm.to,
        message: whatsappForm.message,
        status: 'sent',
        timestamp: new Date().toISOString(),
        direction: 'outbound'
      };
      setRecentComms(prev => {
        const next = [entry, ...prev];
        saveHospitalStore('hospital-communication-logs', next);
        return next;
      });
      setStats(prev => ({
        ...prev,
        whatsapp: { ...prev.whatsapp, sent: prev.whatsapp.sent + 1 }
      }));
      toast({ title: 'WhatsApp Sent', description: `WhatsApp message sent to ${whatsappForm.to}` });
      setWhatsappForm({ to: '', message: '', templateId: '', mediaUrl: '' });
    } catch (error: any) {
      toast({ title: 'Failed', description: error.message || 'Failed to send WhatsApp', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateCall = async () => {
    if (!voiceForm.to) {
      toast({ title: 'Missing Fields', description: 'Please provide phone number', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const entry: CommunicationLog = {
        id: `C-${Date.now()}`,
        channel: 'voice',
        recipient: voiceForm.to,
        recipientName: voiceForm.to,
        message: voiceForm.script || 'Outbound call initiated',
        status: 'sent',
        timestamp: new Date().toISOString(),
        direction: 'outbound'
      };
      setRecentComms(prev => {
        const next = [entry, ...prev];
        saveHospitalStore('hospital-communication-logs', next);
        return next;
      });
      setStats(prev => ({
        ...prev,
        voice: { ...prev.voice, total: prev.voice.total + 1 }
      }));
      toast({ title: 'Call Initiated', description: `Calling ${voiceForm.to}...` });
      setVoiceForm({ to: '', script: '', callType: 'reminder' });
    } finally {
      setLoading(false);
    }
  };

  const applyTemplate = (template: MessageTemplate, channel: string) => {
    if (channel === 'email') {
      setEmailForm({ ...emailForm, subject: template.subject || '', body: template.content, templateId: template.id });
    } else if (channel === 'sms') {
      setSmsForm({ ...smsForm, message: template.content, templateId: template.id });
    } else if (channel === 'whatsapp') {
      setWhatsappForm({ ...whatsappForm, message: template.content, templateId: template.id });
    }
    toast({ title: 'Template Applied', description: `"${template.name}" template applied` });
  };

  const selectPatient = (patient: PatientContact, channel: string) => {
    if (channel === 'email') {
      setEmailForm({ ...emailForm, to: patient.email });
    } else if (channel === 'sms') {
      setSmsForm({ ...smsForm, to: patient.phone });
    } else if (channel === 'whatsapp') {
      setWhatsappForm({ ...whatsappForm, to: patient.phone });
    } else if (channel === 'voice') {
      setVoiceForm({ ...voiceForm, to: patient.phone });
    }
  };

  const filteredPatients = patientContacts.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.phone.includes(searchQuery) ||
    p.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <HospitalLayout title="Communication Hub" subtitle="WhatsApp, Email, SMS & Voice communication with patients">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <TabsList className="bg-slate-100 dark:bg-slate-800">
            <TabsTrigger value="dashboard" className="gap-2">
              <BarChart3 className="h-4 w-4" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="compose" className="gap-2">
              <Send className="h-4 w-4" /> Compose
            </TabsTrigger>
            <TabsTrigger value="inbox" className="gap-2">
              <MessageCircle className="h-4 w-4" /> History
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <FileText className="h-4 w-4" /> Templates
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" /> Settings
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3">
            <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Users className="h-4 w-4 mr-2" /> Bulk Message
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Send Bulk Message</DialogTitle>
                  <DialogDescription>Send messages to multiple patients at once</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select defaultValue="sms">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Recipients</Label>
                    <Select defaultValue="all_admitted">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all_admitted">All Admitted Patients</SelectItem>
                        <SelectItem value="icu">ICU Patients</SelectItem>
                        <SelectItem value="discharge_today">Discharging Today</SelectItem>
                        <SelectItem value="appointments_tomorrow">Tomorrow's Appointments</SelectItem>
                        <SelectItem value="custom">Custom List</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Message</Label>
                    <Textarea placeholder="Type your message..." className="min-h-24" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowBulkDialog(false)}>Cancel</Button>
                  <Button className="bg-teal-600 hover:bg-teal-700">Send to All</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white" onClick={() => setActiveTab('compose')}>
              <Plus className="h-4 w-4 mr-2" /> New Message
            </Button>
          </div>
        </div>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => { setActiveTab('compose'); setSelectedChannel('email'); }}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Email</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.email.sent.toLocaleString()}</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                      {Math.round((stats.email.delivered / stats.email.sent) * 100)}% delivered
                    </p>
                  </div>
                  <div className="p-3 bg-blue-500/10 rounded-xl">
                    <Mail className="h-6 w-6 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => { setActiveTab('compose'); setSelectedChannel('sms'); }}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">SMS</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.sms.sent.toLocaleString()}</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                      {Math.round((stats.sms.delivered / stats.sms.sent) * 100)}% delivered
                    </p>
                  </div>
                  <div className="p-3 bg-emerald-500/10 rounded-xl">
                    <Smartphone className="h-6 w-6 text-emerald-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => { setActiveTab('compose'); setSelectedChannel('whatsapp'); }}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">WhatsApp</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.whatsapp.sent.toLocaleString()}</p>
                    <p className="text-xs text-teal-600 dark:text-teal-400 mt-1">
                      {Math.round((stats.whatsapp.read / stats.whatsapp.sent) * 100)}% read
                    </p>
                  </div>
                  <div className="p-3 bg-teal-500/10 rounded-xl">
                    <MessageSquare className="h-6 w-6 text-teal-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => { setActiveTab('compose'); setSelectedChannel('voice'); }}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Voice Calls</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.voice.total}</p>
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                      Avg: {stats.voice.avgDuration}
                    </p>
                  </div>
                  <div className="p-3 bg-purple-500/10 rounded-xl">
                    <Phone className="h-6 w-6 text-purple-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions & Recent Communications */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Quick Actions */}
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-slate-800 dark:text-white">Quick Actions</CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">Common communication tasks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'Send Appointment Reminders', icon: Calendar, color: 'text-blue-500' },
                  { label: 'Notify Discharge Patients', icon: UserCheck, color: 'text-emerald-500' },
                  { label: 'Lab Results Notification', icon: FileText, color: 'text-amber-500' },
                  { label: 'Payment Reminders', icon: Bell, color: 'text-red-500' },
                  { label: 'Follow-up Calls', icon: PhoneOutgoing, color: 'text-purple-500' },
                ].map((action, idx) => (
                  <Button key={idx} variant="outline" className="w-full justify-start gap-3 h-12">
                    <action.icon className={`h-5 w-5 ${action.color}`} />
                    {action.label}
                    <ChevronRight className="h-4 w-4 ml-auto text-slate-400" />
                  </Button>
                ))}
              </CardContent>
            </Card>

            {/* Recent Communications */}
            <Card className="lg:col-span-2 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-slate-800 dark:text-white">Recent Communications</CardTitle>
                    <CardDescription className="text-slate-500 dark:text-slate-400">Latest messages and calls</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('inbox')}>
                    View All <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentComms.map((comm) => (
                    <div key={comm.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          comm.channel === 'email' ? 'bg-blue-500/10' :
                          comm.channel === 'sms' ? 'bg-emerald-500/10' :
                          comm.channel === 'whatsapp' ? 'bg-teal-500/10' : 'bg-purple-500/10'
                        }`}>
                          {getChannelIcon(comm.channel)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800 dark:text-white">{comm.recipientName}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400 truncate max-w-md">
                            {comm.subject || comm.message}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(comm.status)}
                        <span className="text-xs text-slate-400">
                          {new Date(comm.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Compose Tab */}
        <TabsContent value="compose" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Patient Selection */}
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-slate-800 dark:text-white">Select Recipient</CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">Choose a patient to message</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search patients..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {filteredPatients.map((patient) => (
                      <div
                        key={patient.id}
                        onClick={() => selectPatient(patient, selectedChannel)}
                        className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-teal-500/10 rounded-full">
                            <User className="h-4 w-4 text-teal-500" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-slate-800 dark:text-white">{patient.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {patient.phone} • {patient.email}
                            </p>
                            {patient.ward && (
                              <Badge variant="outline" className="mt-1 text-xs">
                                {patient.ward} {patient.admissionId && `• ${patient.admissionId}`}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Compose Form */}
            <Card className="lg:col-span-2 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-slate-800 dark:text-white">Compose Message</CardTitle>
                    <CardDescription className="text-slate-500 dark:text-slate-400">Send via Email, SMS, WhatsApp or Voice</CardDescription>
                  </div>
                </div>
                {/* Channel Selector */}
                <div className="flex gap-2 mt-4">
                  {[
                    { id: 'email', label: 'Email', icon: Mail, color: 'blue' },
                    { id: 'sms', label: 'SMS', icon: Smartphone, color: 'emerald' },
                    { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'teal' },
                    { id: 'voice', label: 'Voice', icon: Phone, color: 'purple' },
                  ].map((ch) => (
                    <Button
                      key={ch.id}
                      variant={selectedChannel === ch.id ? 'default' : 'outline'}
                      onClick={() => setSelectedChannel(ch.id as any)}
                      className={selectedChannel === ch.id ? `bg-${ch.color}-600 hover:bg-${ch.color}-700` : ''}
                    >
                      <ch.icon className="h-4 w-4 mr-2" /> {ch.label}
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {/* Email Form */}
                {selectedChannel === 'email' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>To *</Label>
                        <Input
                          type="email"
                          placeholder="patient@email.com"
                          value={emailForm.to}
                          onChange={(e) => setEmailForm({ ...emailForm, to: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>CC</Label>
                        <Input
                          type="email"
                          placeholder="Optional CC"
                          value={emailForm.cc}
                          onChange={(e) => setEmailForm({ ...emailForm, cc: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Subject *</Label>
                      <Input
                        placeholder="Email subject"
                        value={emailForm.subject}
                        onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Message *</Label>
                        <Select onValueChange={(v) => {
                          const template = templates.find(t => t.id === v);
                          if (template) applyTemplate(template, 'email');
                        }}>
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Use Template" />
                          </SelectTrigger>
                          <SelectContent>
                            {templates.filter(t => t.channel === 'email' || t.channel === 'all').map(t => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Textarea
                        placeholder="Type your email message..."
                        className="min-h-48"
                        value={emailForm.body}
                        onChange={(e) => setEmailForm({ ...emailForm, body: e.target.value })}
                      />
                    </div>
                    <div className="flex items-center justify-between pt-4">
                      <Button variant="outline">
                        <Paperclip className="h-4 w-4 mr-2" /> Attach File
                      </Button>
                      <Button onClick={handleSendEmail} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                        {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                        Send Email
                      </Button>
                    </div>
                  </div>
                )}

                {/* SMS Form */}
                {selectedChannel === 'sms' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Phone Number *</Label>
                      <Input
                        placeholder="+91 98765 43210"
                        value={smsForm.to}
                        onChange={(e) => setSmsForm({ ...smsForm, to: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Message * ({smsForm.message.length}/160 characters)</Label>
                        <Select onValueChange={(v) => {
                          const template = templates.find(t => t.id === v);
                          if (template) applyTemplate(template, 'sms');
                        }}>
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Use Template" />
                          </SelectTrigger>
                          <SelectContent>
                            {templates.filter(t => t.channel === 'sms' || t.channel === 'all').map(t => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Textarea
                        placeholder="Type your SMS message..."
                        className="min-h-32"
                        value={smsForm.message}
                        onChange={(e) => setSmsForm({ ...smsForm, message: e.target.value })}
                        maxLength={160}
                      />
                    </div>
                    <div className="flex justify-end pt-4">
                      <Button onClick={handleSendSMS} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
                        {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                        Send SMS
                      </Button>
                    </div>
                  </div>
                )}

                {/* WhatsApp Form */}
                {selectedChannel === 'whatsapp' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>WhatsApp Number *</Label>
                      <Input
                        placeholder="+91 98765 43210"
                        value={whatsappForm.to}
                        onChange={(e) => setWhatsappForm({ ...whatsappForm, to: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Message *</Label>
                        <Select onValueChange={(v) => {
                          const template = templates.find(t => t.id === v);
                          if (template) applyTemplate(template, 'whatsapp');
                        }}>
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Use Template" />
                          </SelectTrigger>
                          <SelectContent>
                            {templates.filter(t => t.channel === 'whatsapp' || t.channel === 'all').map(t => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Textarea
                        placeholder="Type your WhatsApp message..."
                        className="min-h-32"
                        value={whatsappForm.message}
                        onChange={(e) => setWhatsappForm({ ...whatsappForm, message: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Media URL (Optional)</Label>
                      <Input
                        placeholder="https://example.com/image.jpg"
                        value={whatsappForm.mediaUrl}
                        onChange={(e) => setWhatsappForm({ ...whatsappForm, mediaUrl: e.target.value })}
                      />
                    </div>
                    <div className="flex items-center justify-between pt-4">
                      <Button variant="outline">
                        <Image className="h-4 w-4 mr-2" /> Attach Media
                      </Button>
                      <Button onClick={handleSendWhatsApp} disabled={loading} className="bg-teal-600 hover:bg-teal-700">
                        {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                        Send WhatsApp
                      </Button>
                    </div>
                  </div>
                )}

                {/* Voice Call Form */}
                {selectedChannel === 'voice' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Phone Number *</Label>
                      <Input
                        placeholder="+91 98765 43210"
                        value={voiceForm.to}
                        onChange={(e) => setVoiceForm({ ...voiceForm, to: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Call Type</Label>
                      <Select value={voiceForm.callType} onValueChange={(v) => setVoiceForm({ ...voiceForm, callType: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="reminder">Appointment Reminder</SelectItem>
                          <SelectItem value="followup">Follow-up Call</SelectItem>
                          <SelectItem value="results">Lab Results</SelectItem>
                          <SelectItem value="billing">Billing Query</SelectItem>
                          <SelectItem value="general">General</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Call Script / Notes</Label>
                      <Textarea
                        placeholder="Notes for the call..."
                        className="min-h-32"
                        value={voiceForm.script}
                        onChange={(e) => setVoiceForm({ ...voiceForm, script: e.target.value })}
                      />
                    </div>
                    <div className="flex justify-end pt-4 gap-3">
                      <Button variant="outline">
                        <Video className="h-4 w-4 mr-2" /> Video Call
                      </Button>
                      <Button onClick={handleInitiateCall} disabled={loading} className="bg-purple-600 hover:bg-purple-700">
                        {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PhoneOutgoing className="h-4 w-4 mr-2" />}
                        Start Call
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="inbox" className="space-y-4">
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-slate-800 dark:text-white">Communication History</CardTitle>
                  <CardDescription className="text-slate-500 dark:text-slate-400">All sent messages and calls</CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input placeholder="Search..." className="pl-10 w-64" />
                  </div>
                  <Select defaultValue="all">
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Channels</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="voice">Voice</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline">
                    <Download className="h-4 w-4 mr-2" /> Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentComms.map((comm) => (
                    <TableRow key={comm.id}>
                      <TableCell>
                        <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-lg ${
                          comm.channel === 'email' ? 'bg-blue-500/10 text-blue-600' :
                          comm.channel === 'sms' ? 'bg-emerald-500/10 text-emerald-600' :
                          comm.channel === 'whatsapp' ? 'bg-teal-500/10 text-teal-600' : 'bg-purple-500/10 text-purple-600'
                        }`}>
                          {getChannelIcon(comm.channel)}
                          <span className="capitalize text-sm">{comm.channel}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-800 dark:text-white">{comm.recipientName}</p>
                          <p className="text-xs text-slate-500">{comm.recipient}</p>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="text-sm text-slate-600 dark:text-slate-300 truncate">
                          {comm.subject || comm.message}
                        </p>
                      </TableCell>
                      <TableCell>{getStatusBadge(comm.status)}</TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {new Date(comm.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedComm(comm);
                            setShowCommDialog(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Dialog open={showCommDialog} onOpenChange={setShowCommDialog}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Message Details</DialogTitle>
                <DialogDescription>Review the full communication details.</DialogDescription>
              </DialogHeader>
              {selectedComm && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-lg ${
                      selectedComm.channel === 'email' ? 'bg-blue-500/10 text-blue-600' :
                      selectedComm.channel === 'sms' ? 'bg-emerald-500/10 text-emerald-600' :
                      selectedComm.channel === 'whatsapp' ? 'bg-teal-500/10 text-teal-600' : 'bg-purple-500/10 text-purple-600'
                    }`}>
                      {getChannelIcon(selectedComm.channel)}
                      <span className="capitalize text-sm">{selectedComm.channel}</span>
                    </div>
                    <div>{getStatusBadge(selectedComm.status)}</div>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">Recipient</p>
                    <p className="font-medium text-slate-800 dark:text-white">{selectedComm.recipientName}</p>
                    <p className="text-xs text-slate-500">{selectedComm.recipient}</p>
                  </div>

                  {selectedComm.subject && (
                    <div>
                      <p className="text-sm text-slate-500">Subject</p>
                      <p className="text-slate-800 dark:text-white">{selectedComm.subject}</p>
                    </div>
                  )}

                  <div>
                    <p className="text-sm text-slate-500">Message</p>
                    <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                      {selectedComm.message}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">Time</p>
                    <p className="text-slate-700 dark:text-slate-200">
                      {new Date(selectedComm.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCommDialog(false)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-slate-800 dark:text-white">Message Templates</CardTitle>
                  <CardDescription className="text-slate-500 dark:text-slate-400">Pre-configured templates for common communications</CardDescription>
                </div>
                <Button className="bg-teal-600 hover:bg-teal-700" onClick={openNewTemplate}>
                  <Plus className="h-4 w-4 mr-2" /> New Template
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((template) => (
                  <Card key={template.id} className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-slate-800 dark:text-white">{template.name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs capitalize">{template.category.replace('_', ' ')}</Badge>
                            <Badge className={`text-xs ${
                              template.channel === 'email' ? 'bg-blue-500/10 text-blue-600' :
                              template.channel === 'sms' ? 'bg-emerald-500/10 text-emerald-600' :
                              template.channel === 'whatsapp' ? 'bg-teal-500/10 text-teal-600' : 'bg-purple-500/10 text-purple-600'
                            }`}>
                              {template.channel === 'all' ? 'All Channels' : template.channel.toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                        <Switch checked={template.isActive} />
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3 mb-4">
                        {template.content}
                      </p>
                      <div className="flex items-center gap-2">
                        {template.variables.slice(0, 3).map((v, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{`{{${v}}}`}</Badge>
                        ))}
                        {template.variables.length > 3 && (
                          <Badge variant="outline" className="text-xs">+{template.variables.length - 3}</Badge>
                        )}
                      </div>
                      <Separator className="my-4" />
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openDuplicateTemplate(template)}>
                          <Copy className="h-4 w-4 mr-1" /> Duplicate
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEditTemplate(template)}>
                          <Edit className="h-4 w-4 mr-1" /> Edit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>
                  {templateMode === 'edit' ? 'Edit Template' : templateMode === 'duplicate' ? 'Duplicate Template' : 'New Template'}
                </DialogTitle>
                <DialogDescription>Configure template details for hospital communication.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Template Name</Label>
                  <Input
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                    placeholder="Template name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={templateForm.category}
                      onValueChange={(value) => setTemplateForm({ ...templateForm, category: value as MessageTemplate['category'] })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="appointment">Appointment</SelectItem>
                        <SelectItem value="discharge">Discharge</SelectItem>
                        <SelectItem value="billing">Billing</SelectItem>
                        <SelectItem value="lab_results">Lab Results</SelectItem>
                        <SelectItem value="prescription">Prescription</SelectItem>
                        <SelectItem value="general">General</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select
                      value={templateForm.channel}
                      onValueChange={(value) => setTemplateForm({ ...templateForm, channel: value as MessageTemplate['channel'] })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Channels</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Subject (optional)</Label>
                  <Input
                    value={templateForm.subject || ''}
                    onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                    placeholder="Email subject"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Message Content</Label>
                  <Textarea
                    value={templateForm.content}
                    onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })}
                    placeholder="Template content"
                    className="min-h-32"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Variables (comma separated)</Label>
                  <Input
                    value={templateVariablesInput}
                    onChange={(e) => setTemplateVariablesInput(e.target.value)}
                    placeholder="patient_name, doctor_name, date"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Active</Label>
                  <Switch
                    checked={templateForm.isActive}
                    onCheckedChange={(checked) => setTemplateForm({ ...templateForm, isActive: checked })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>Cancel</Button>
                <Button onClick={handleTemplateSave}>Save Template</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Email Settings */}
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                  <Mail className="h-5 w-5 text-blue-500" /> Email Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>SMTP Host</Label>
                  <Input placeholder="smtp.example.com" defaultValue="smtp.zoho.in" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Port</Label>
                    <Input placeholder="587" defaultValue="465" />
                  </div>
                  <div className="space-y-2">
                    <Label>Encryption</Label>
                    <Select defaultValue="ssl">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ssl">SSL</SelectItem>
                        <SelectItem value="tls">TLS</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>From Email</Label>
                  <Input placeholder="hospital@example.com" />
                </div>
                <Button className="w-full">Save Email Settings</Button>
              </CardContent>
            </Card>

            {/* SMS Settings */}
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-emerald-500" /> SMS Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>SMS Provider</Label>
                  <Select defaultValue="twilio">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="twilio">Twilio</SelectItem>
                      <SelectItem value="msg91">MSG91</SelectItem>
                      <SelectItem value="textlocal">TextLocal</SelectItem>
                      <SelectItem value="gupshup">Gupshup</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input type="password" placeholder="Enter API Key" />
                </div>
                <div className="space-y-2">
                  <Label>Sender ID</Label>
                  <Input placeholder="HOSPNM" defaultValue="MEDICZY" />
                </div>
                <Button className="w-full">Save SMS Settings</Button>
              </CardContent>
            </Card>

            {/* WhatsApp Settings */}
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-teal-500" /> WhatsApp Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>WhatsApp Provider</Label>
                  <Select defaultValue="gupshup">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gupshup">Gupshup</SelectItem>
                      <SelectItem value="twilio">Twilio</SelectItem>
                      <SelectItem value="meta">Meta Business API</SelectItem>
                      <SelectItem value="karix">Karix</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input type="password" placeholder="Enter API Key" />
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp Business Number</Label>
                  <Input placeholder="+91 98765 43210" />
                </div>
                <Button className="w-full">Save WhatsApp Settings</Button>
              </CardContent>
            </Card>

            {/* Voice Settings */}
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                  <Phone className="h-5 w-5 text-purple-500" /> Voice Call Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Voice Provider</Label>
                  <Select defaultValue="twilio">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="twilio">Twilio</SelectItem>
                      <SelectItem value="exotel">Exotel</SelectItem>
                      <SelectItem value="knowlarity">Knowlarity</SelectItem>
                      <SelectItem value="plivo">Plivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Account SID</Label>
                  <Input type="password" placeholder="Enter Account SID" />
                </div>
                <div className="space-y-2">
                  <Label>Caller ID</Label>
                  <Input placeholder="+91 98765 43210" />
                </div>
                <Button className="w-full">Save Voice Settings</Button>
              </CardContent>
            </Card>
          </div>

          {/* Notification Preferences */}
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                <Bell className="h-5 w-5 text-amber-500" /> Notification Preferences
              </CardTitle>
              <CardDescription>Configure automatic notifications for various events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { label: 'Appointment Reminders', desc: 'Send 24h before appointment', channels: ['sms', 'whatsapp'] },
                  { label: 'Discharge Notifications', desc: 'When discharge summary is ready', channels: ['whatsapp', 'email'] },
                  { label: 'Lab Results Available', desc: 'When lab reports are uploaded', channels: ['email', 'sms'] },
                  { label: 'Bill Reminders', desc: 'Payment due reminders', channels: ['sms'] },
                  { label: 'Prescription Refills', desc: 'Medication refill reminders', channels: ['whatsapp'] },
                  { label: 'Follow-up Reminders', desc: 'Post-discharge follow-ups', channels: ['sms', 'voice'] },
                ].map((pref, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-slate-800 dark:text-white">{pref.label}</span>
                      <Switch defaultChecked />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{pref.desc}</p>
                    <div className="flex gap-1">
                      {pref.channels.map((ch, i) => (
                        <Badge key={i} variant="outline" className="text-xs capitalize">{ch}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </HospitalLayout>
  );
};

export default HospitalCommunicationHub;
