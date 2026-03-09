import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import MainLayout from '@/components/layout/MainLayout';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import {
  MessageSquare,
  Plus,
  Search,
  Edit2,
  Trash2,
  Copy,
  Eye,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  ArrowLeft,
  Send,
  FileText,
  BarChart3,
  RefreshCw,
  AlertCircle,
  Smartphone,
} from 'lucide-react';
import { Link } from 'react-router-dom';

// ─── Types ───────────────────────────────────────────────────────────────────
interface WhatsAppTemplate {
  id: string;
  name: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  header?: string;
  body: string;
  footer?: string;
  createdAt: string;
  lastUsed: string | null;
  usageCount: number;
}

// ─── Template Category Config ────────────────────────────────────────────────
const CATEGORIES = [
  { value: 'UTILITY', label: 'Utility', description: 'Appointment reminders, order updates, billing alerts' },
  { value: 'MARKETING', label: 'Marketing', description: 'Promotions, health campaigns, newsletters' },
  { value: 'AUTHENTICATION', label: 'Authentication', description: 'OTP, login verification, password reset' },
];

const LANGUAGES = [
  { value: 'en_US', label: 'English (US)' },
  { value: 'en_IN', label: 'English (India)' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'kn', label: 'Kannada' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'mr', label: 'Marathi' },
  { value: 'bn', label: 'Bengali' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'pa', label: 'Punjabi' },
];

// Healthcare-specific template presets
const TEMPLATE_PRESETS = [
  {
    name: 'appointment_reminder',
    category: 'UTILITY' as const,
    language: 'en_US',
    header: 'Appointment Reminder',
    body: 'Hello {{1}}, this is a reminder for your appointment with Dr. {{2}} on {{3}} at {{4}}. Please reply YES to confirm or NO to reschedule.',
    footer: 'Mediczy Healthcare',
  },
  {
    name: 'prescription_ready',
    category: 'UTILITY' as const,
    language: 'en_US',
    header: 'Prescription Ready',
    body: 'Hi {{1}}, your prescription is ready for pickup at our pharmacy. Prescription ID: {{2}}. Visit {{3}} before {{4}}.',
    footer: 'Mediczy Pharmacy',
  },
  {
    name: 'test_results',
    category: 'UTILITY' as const,
    language: 'en_US',
    header: 'Test Results Available',
    body: 'Dear {{1}}, your test results for {{2}} are now available. Report ID: {{3}}. View online or collect from the lab.',
    footer: 'Mediczy Labs',
  },
  {
    name: 'payment_reminder',
    category: 'UTILITY' as const,
    language: 'en_US',
    header: 'Payment Reminder',
    body: 'Hi {{1}}, you have an outstanding balance of ₹{{2}} for {{3}}. Please complete payment by {{4}} to avoid late fees.',
    footer: 'Mediczy Billing',
  },
  {
    name: 'health_campaign',
    category: 'MARKETING' as const,
    language: 'en_US',
    header: 'Health Awareness',
    body: 'Dear {{1}}, join our {{2}} awareness campaign! Free health checkup on {{3}} at {{4}}. Limited slots — book now.',
    footer: 'Mediczy Health Campaigns',
  },
  {
    name: 'otp_verification',
    category: 'AUTHENTICATION' as const,
    language: 'en_US',
    header: '',
    body: 'Your Mediczy verification code is {{1}}. This code expires in 10 minutes. Do not share this code with anyone.',
    footer: 'Mediczy',
  },
  {
    name: 'teleconsult_link',
    category: 'UTILITY' as const,
    language: 'en_US',
    header: 'Video Consultation',
    body: 'Hi {{1}}, your teleconsultation with Dr. {{2}} starts at {{3}}. Join here: {{4}}. Please be ready 5 minutes early.',
    footer: 'Mediczy Telehealth',
  },
  {
    name: 'discharge_summary',
    category: 'UTILITY' as const,
    language: 'en_US',
    header: 'Discharge Summary',
    body: 'Dear {{1}}, your discharge summary is ready. Patient ID: {{2}}. Download from {{3}} or collect from the hospital reception.',
    footer: 'Mediczy Hospital',
  },
];

// ─── Status Badge Component ─────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'APPROVED':
      return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>;
    case 'PENDING':
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
    case 'REJECTED':
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 gap-1"><XCircle className="h-3 w-3" /> Rejected</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// ─── Category Badge Component ────────────────────────────────────────────────
function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    UTILITY: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    MARKETING: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    AUTHENTICATION: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  };
  return <Badge className={colors[category] || 'bg-gray-100 text-gray-700'}>{category}</Badge>;
}

// ─── Phone Preview Component ─────────────────────────────────────────────────
function PhonePreview({ header, body, footer }: { header?: string; body: string; footer?: string }) {
  // Replace {{n}} placeholders with sample values
  const sampleValues: Record<string, string> = {
    '{{1}}': 'Rahul',
    '{{2}}': 'Dr. Sharma',
    '{{3}}': '10 Mar 2026',
    '{{4}}': '10:30 AM',
    '{{5}}': 'Sample Value',
  };
  let previewBody = body;
  Object.entries(sampleValues).forEach(([key, val]) => {
    previewBody = previewBody.replace(key, val);
  });

  return (
    <div className="flex justify-center">
      <div className="w-[280px] bg-gray-100 dark:bg-gray-950 rounded-[2rem] p-3 border-4 border-gray-300 dark:border-gray-700 shadow-xl">
        {/* Phone top bar */}
        <div className="bg-[#075e54] rounded-t-xl px-3 py-2 flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-white" />
          <span className="text-white text-xs font-medium">Mediczy</span>
          <span className="ml-auto text-white/70 text-[10px]">WhatsApp</span>
        </div>
        {/* Chat area */}
        <div className="bg-[#ece5dd] dark:bg-[#0b141a] min-h-[200px] p-3 flex flex-col justify-end">
          <div className="bg-white dark:bg-[#1f2c34] rounded-lg p-3 shadow-sm max-w-[240px] text-sm">
            {header && (
              <div className="font-bold text-[13px] mb-1 text-gray-900 dark:text-gray-100">{header}</div>
            )}
            <div className="text-gray-800 dark:text-gray-200 text-[12px] leading-relaxed whitespace-pre-wrap">{previewBody}</div>
            {footer && (
              <div className="text-gray-400 text-[10px] mt-2 italic">{footer}</div>
            )}
            <div className="text-right text-[10px] text-gray-400 mt-1">10:30 AM ✓✓</div>
          </div>
        </div>
        {/* Phone bottom bar */}
        <div className="bg-gray-200 dark:bg-gray-800 rounded-b-xl px-3 py-2">
          <div className="bg-white dark:bg-gray-700 rounded-full px-3 py-1 text-[10px] text-gray-400">Type a message...</div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function WhatsAppTemplates() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPresetsDialog, setShowPresetsDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    category: 'UTILITY',
    language: 'en_US',
    header: '',
    body: '',
    footer: 'Mediczy Healthcare',
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/whatsapp/templates');
      setTemplates(data.data || []);
    } catch (err: any) {
      console.error('Failed to load templates:', err);
      toast({ title: 'Error', description: 'Failed to load WhatsApp templates', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.body) {
      toast({ title: 'Validation Error', description: 'Template name and body are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/whatsapp/templates', formData);
      toast({ title: 'Template Created', description: `"${formData.name}" submitted for approval` });
      setShowCreateDialog(false);
      resetForm();
      fetchTemplates();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.response?.data?.message || 'Failed to create template', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      await api.put(`/whatsapp/templates/${selectedTemplate.id}`, formData);
      toast({ title: 'Template Updated', description: `"${formData.name}" updated and resubmitted for approval` });
      setShowEditDialog(false);
      resetForm();
      fetchTemplates();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.response?.data?.message || 'Failed to update template', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      await api.delete(`/whatsapp/templates/${selectedTemplate.id}`);
      toast({ title: 'Template Deleted', description: `"${selectedTemplate.name}" has been deleted` });
      setShowDeleteDialog(false);
      setSelectedTemplate(null);
      fetchTemplates();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.response?.data?.message || 'Failed to delete template', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = (template: WhatsAppTemplate) => {
    setFormData({
      name: `${template.name}_copy`,
      category: template.category,
      language: template.language,
      header: template.header || '',
      body: template.body,
      footer: template.footer || '',
    });
    setShowCreateDialog(true);
  };

  const openEditDialog = (template: WhatsAppTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      category: template.category,
      language: template.language,
      header: template.header || '',
      body: template.body,
      footer: template.footer || '',
    });
    setShowEditDialog(true);
  };

  const resetForm = () => {
    setFormData({ name: '', category: 'UTILITY', language: 'en_US', header: '', body: '', footer: 'Mediczy Healthcare' });
    setSelectedTemplate(null);
  };

  const loadPreset = (preset: typeof TEMPLATE_PRESETS[0]) => {
    setFormData({
      name: preset.name,
      category: preset.category,
      language: preset.language,
      header: preset.header || '',
      body: preset.body,
      footer: preset.footer || '',
    });
    setShowPresetsDialog(false);
    setShowCreateDialog(true);
  };

  // Count template variables {{n}} in body
  const countVariables = (text: string) => {
    const matches = text.match(/\{\{\d+\}\}/g);
    return matches ? new Set(matches).size : 0;
  };

  // Filter templates
  const filtered = templates.filter((t) => {
    if (filterCategory !== 'all' && t.category !== filterCategory) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase()) && !t.body.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: templates.length,
    approved: templates.filter(t => t.status === 'APPROVED').length,
    pending: templates.filter(t => t.status === 'PENDING').length,
    rejected: templates.filter(t => t.status === 'REJECTED').length,
  };

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/team/dashboard">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <MessageSquare className="h-6 w-6 text-green-600" />
                WhatsApp Templates
              </h1>
              <p className="text-sm text-muted-foreground mt-1">Create and manage message templates for WhatsApp Business</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowPresetsDialog(true)}>
              <FileText className="h-4 w-4 mr-2" /> Use Preset
            </Button>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => { resetForm(); setShowCreateDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" /> New Template
            </Button>
          </div>
        </div>

        {/* ── Stats ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm text-muted-foreground">Total Templates</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
              <div className="text-sm text-muted-foreground">Approved</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
              <div className="text-sm text-muted-foreground">Pending Review</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
              <div className="text-sm text-muted-foreground">Rejected</div>
            </CardContent>
          </Card>
        </div>

        {/* ── Filters ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates by name or content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchTemplates} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* ── Template List ───────────────────────────────────────────── */}
        {loading ? (
          <div className="py-20 text-center">
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-green-600" />
            <p className="text-muted-foreground mt-3">Loading templates...</p>
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <h3 className="text-lg font-semibold mt-4">No templates found</h3>
              <p className="text-muted-foreground mt-1">
                {templates.length === 0 ? 'Create your first WhatsApp template or start from a preset.' : 'Try adjusting your filters.'}
              </p>
              {templates.length === 0 && (
                <div className="flex gap-2 justify-center mt-4">
                  <Button variant="outline" onClick={() => setShowPresetsDialog(true)}>
                    <FileText className="h-4 w-4 mr-2" /> Healthcare Presets
                  </Button>
                  <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => { resetForm(); setShowCreateDialog(true); }}>
                    <Plus className="h-4 w-4 mr-2" /> Create Template
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filtered.map((template) => (
              <Card key={template.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base">{template.name.replace(/_/g, ' ')}</h3>
                        <StatusBadge status={template.status} />
                        <CategoryBadge category={template.category} />
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{template.body}</p>
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                        <span>Language: {LANGUAGES.find(l => l.value === template.language)?.label || template.language}</span>
                        <span>Variables: {countVariables(template.body)}</span>
                        <span>Used: {template.usageCount || 0} times</span>
                        {template.lastUsed && <span>Last used: {new Date(template.lastUsed).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" title="Preview" onClick={() => { setSelectedTemplate(template); setShowPreviewDialog(true); }}>
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Edit" onClick={() => openEditDialog(template)}>
                        <Edit2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Duplicate" onClick={() => handleDuplicate(template)}>
                        <Copy className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Delete" onClick={() => { setSelectedTemplate(template); setShowDeleteDialog(true); }}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── Create / Edit Dialog ────────────────────────────────────── */}
        <Dialog open={showCreateDialog || showEditDialog} onOpenChange={(open) => { if (!open) { setShowCreateDialog(false); setShowEditDialog(false); resetForm(); } }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-green-600" />
                {showEditDialog ? 'Edit Template' : 'Create New Template'}
              </DialogTitle>
              <DialogDescription>
                {showEditDialog
                  ? 'Modify this template. Changes will require re-approval from WhatsApp.'
                  : 'Design a new WhatsApp message template. It will be submitted for approval.'}
              </DialogDescription>
            </DialogHeader>

            <div className="grid md:grid-cols-2 gap-6 mt-4">
              {/* ── Form ─────────────────────────────────── */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="tpl-name">Template Name *</Label>
                  <Input
                    id="tpl-name"
                    placeholder="e.g. appointment_reminder"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Lowercase, underscores only. e.g. appointment_reminder</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Category *</Label>
                    <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => (
                          <SelectItem key={c.value} value={c.value}>
                            <div>
                              <div className="font-medium">{c.label}</div>
                              <div className="text-xs text-muted-foreground">{c.description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Language *</Label>
                    <Select value={formData.language} onValueChange={(v) => setFormData({ ...formData, language: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="tpl-header">Header (optional)</Label>
                  <Input
                    id="tpl-header"
                    placeholder="e.g. Appointment Reminder"
                    value={formData.header}
                    onChange={(e) => setFormData({ ...formData, header: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="tpl-body">Message Body *</Label>
                  <Textarea
                    id="tpl-body"
                    placeholder="Hello {{1}}, your appointment with Dr. {{2}} is on {{3}} at {{4}}."
                    value={formData.body}
                    onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                    rows={5}
                    className="resize-none"
                  />
                  <div className="flex justify-between mt-1">
                    <p className="text-xs text-muted-foreground">
                      Use {'{{1}}'}, {'{{2}}'}, etc. for dynamic values. Max 1024 chars.
                    </p>
                    <span className={`text-xs ${formData.body.length > 1024 ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                      {formData.body.length}/1024
                    </span>
                  </div>
                </div>

                <div>
                  <Label htmlFor="tpl-footer">Footer (optional)</Label>
                  <Input
                    id="tpl-footer"
                    placeholder="e.g. Mediczy Healthcare"
                    value={formData.footer}
                    onChange={(e) => setFormData({ ...formData, footer: e.target.value })}
                  />
                </div>

                {formData.body.length > 1024 && (
                  <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Body exceeds 1024 character limit. WhatsApp will reject this template.
                  </div>
                )}
              </div>

              {/* ── Live Preview ──────────────────────────── */}
              <div>
                <Label className="mb-3 block">Live Preview</Label>
                <PhonePreview header={formData.header} body={formData.body || 'Your message will appear here...'} footer={formData.footer} />
                <div className="mt-4 bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                  <h4 className="font-medium flex items-center gap-1"><AlertCircle className="h-4 w-4" /> Template Guidelines</h4>
                  <ul className="text-muted-foreground space-y-1 text-xs pl-5 list-disc">
                    <li>Templates must follow WhatsApp Business policy</li>
                    <li>UTILITY: Transactional messages (reminders, updates)</li>
                    <li>MARKETING: Promotional content (needs user opt-in)</li>
                    <li>AUTHENTICATION: OTPs and verification codes</li>
                    <li>Avoid aggressive language, all-caps, excessive punctuation</li>
                    <li>Include opt-out option in marketing templates</li>
                  </ul>
                </div>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={() => { setShowCreateDialog(false); setShowEditDialog(false); resetForm(); }}>
                Cancel
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={showEditDialog ? handleUpdate : handleCreate}
                disabled={saving || !formData.name || !formData.body || formData.body.length > 1024}
              >
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                {showEditDialog ? 'Update & Resubmit' : 'Create Template'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Preview Dialog ──────────────────────────────────────────── */}
        <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" /> Template Preview
              </DialogTitle>
              <DialogDescription>
                {selectedTemplate?.name.replace(/_/g, ' ')} — {selectedTemplate?.status}
              </DialogDescription>
            </DialogHeader>
            {selectedTemplate && (
              <div className="mt-4">
                <PhonePreview header={selectedTemplate.header} body={selectedTemplate.body} footer={selectedTemplate.footer} />
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-muted/50 p-2 rounded">
                    <span className="text-muted-foreground">Category:</span>
                    <span className="ml-1 font-medium">{selectedTemplate.category}</span>
                  </div>
                  <div className="bg-muted/50 p-2 rounded">
                    <span className="text-muted-foreground">Language:</span>
                    <span className="ml-1 font-medium">{LANGUAGES.find(l => l.value === selectedTemplate.language)?.label}</span>
                  </div>
                  <div className="bg-muted/50 p-2 rounded">
                    <span className="text-muted-foreground">Variables:</span>
                    <span className="ml-1 font-medium">{countVariables(selectedTemplate.body)}</span>
                  </div>
                  <div className="bg-muted/50 p-2 rounded">
                    <span className="text-muted-foreground">Used:</span>
                    <span className="ml-1 font-medium">{selectedTemplate.usageCount || 0} times</span>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Delete Confirmation Dialog ───────────────────────────────── */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" /> Delete Template
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete <strong>"{selectedTemplate?.name.replace(/_/g, ' ')}"</strong>? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Healthcare Presets Dialog ────────────────────────────────── */}
        <Dialog open={showPresetsDialog} onOpenChange={setShowPresetsDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-green-600" /> Healthcare Template Presets
              </DialogTitle>
              <DialogDescription>
                Choose a pre-built healthcare template as a starting point. You can customize it before saving.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 mt-4">
              {TEMPLATE_PRESETS.map((preset, idx) => (
                <Card key={idx} className="hover:border-green-500/50 cursor-pointer transition-colors" onClick={() => loadPreset(preset)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-sm">{preset.name.replace(/_/g, ' ')}</h4>
                          <CategoryBadge category={preset.category} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{preset.body}</p>
                      </div>
                      <Button variant="outline" size="sm" className="shrink-0">
                        <Plus className="h-3 w-3 mr-1" /> Use
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
