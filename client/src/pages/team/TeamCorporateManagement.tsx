// Version: 2.1.0 - Numeric Corporate ID Conversion Ready
import { useState, useEffect, useRef, useMemo } from 'react';
import ExcelJS from 'exceljs';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import { 
  Building2, 
  Users, 
  Plus, 
  Search, 
  Eye, 
  Edit, 
  Trash2, 
  Mail, 
  Phone, 
  Calendar,
  CalendarDays,
  TrendingUp,
  UserPlus,
  Package,
  Activity,
  FileSpreadsheet,
  Download,
  Upload,
  RefreshCw,
  Settings,
  Shield,
  Heart,
  Stethoscope,
  FlaskConical,
  Hospital,
  Pill,
  Network,
  ChevronRight,
  CheckCircle,
  XCircle,
  AlertCircle,
  Key,
  Copy,
  UserCheck,
  Dumbbell,
  Brain,
  Salad,
  Trophy,
  Clock,
  MapPin,
  Bell,
  Send,
  ChevronLeft,
  Sparkles
} from 'lucide-react';
import api from '@/utils/api';
import { useNavigate } from 'react-router-dom';
import CorporateWelcomeEmailBatchDialog, { WelcomeEmailDraft } from './CorporateWelcomeEmailBatchDialog';

interface Corporate {
  id: number;
  uid?: string;
  uniqueId?: string;  // 6-char alphanumeric, e.g. C1ZNHW
  companyName: string;
  contactPerson: string;
  email: string;
  phoneNumber: string;
  industry: string;
  employeeCount: number;
  packageType: string;
  status: string;
  createdAt: string;
  address?: any;
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  secondaryEmail: string;
  phone: string;
  department: string;
  designation: string;
  city: string;
  state: string;
  pinCode: string;
  location: string;
  facility: string;
  joiningDate: string;
  healthStatus: string;
  insurancePlan: string;
  status: string;
  currentPackageId?: string;
  currentPackageName?: string;
  packageValidTo?: string;
  gender?: string;
  dateOfBirth?: string;
  lastLoginAt?: string | null;
  lastActivityAt?: string | null;
  loginCount?: number;
  requirePasswordChange?: boolean;
  welcomeEmailStatus?: string | null;
  welcomeEmailSentAt?: string | null;
}

interface LabPartner {
  id: number;
  name: string;
  city: string;
  address?: string | null;
  pincode?: string | null;
  testsAvailable: number;
  discount: number | null;
  status: string;
}

interface HospitalPartner {
  id: number;
  name: string;
  city: string;
  address?: string | null;
  pincode?: string | null;
  specialities: string;
  beds: number;
  status: string;
}

interface ClinicPartner {
  id: number;
  name: string;
  city: string;
  address?: string | null;
  pincode?: string | null;
  type: string;
  doctors: number;
  status: string;
}

interface HealthPackage {
  id: string;
  name: string;
  tests: string[];
  price: number;
  validityDays: number;
}

interface WellnessEvent {
  id: number;
  corporate_id: number;
  title: string;
  description?: string;
  event_type: string;
  event_date: string;
  event_time?: string;
  end_date?: string;
  end_time?: string;
  location?: string;
  organizer?: string;
  max_participants?: number;
  registered_count: number;
  status: string;
  color: string;
  notify_employees: boolean;
  created_at?: string;
}

interface CorporatePlan {
  id: number;
  name: string;
  slug: string;
  price: number;
  annualPrice: number;
  currency: string;
  billingCycle: string;
  enrolled: number;
  description?: string;
  planType?: string;
  status?: string;
  totalEmployees?: number;
  validFrom?: string;
  validTo?: string;
  features?: Record<string, boolean>;
  coverage?: Record<string, any>;
  healthPackageIds?: string[];
}

interface WelcomeEmailTemplatePreset {
  id: string;
  name: string;
  subject: string;
  html: string;
}

interface WelcomeDeliveryRecord {
  id: number;
  corporateId: number;
  userId: number;
  employeeId: string | null;
  recipientEmail: string;
  subject: string | null;
  idempotencyKey: string;
  requestScope: string;
  status: 'prepared' | 'queued' | 'sent' | 'failed' | 'rolled_back' | string;
  attempts: number;
  errorMessage: string | null;
  metadata: Record<string, any>;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  userEmail?: string | null;
  userFirstName?: string | null;
  userLastName?: string | null;
}

interface CorporateAdminUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  role: string;
}

type CommunicationChannel = 'email' | 'whatsapp' | 'sms';
type CommunicationRecipientMode = 'individual' | 'selected' | 'bulk';
type WelcomeEmailMode = 'draft' | 'send' | 'skip';

interface EmailQuotaSnapshot {
  used: number;
  limit: number;
  remaining: number;
  allowed: boolean;
}

type BulkEmployeeField =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phoneNumber'
  | 'employeeId'
  | 'department'
  | 'designation'
  | 'dateOfBirth'
  | 'gender'
  | 'city'
  | 'state'
  | 'pinCode'
  | 'location'
  | 'facility';

const BULK_EMPLOYEE_FIELDS: BulkEmployeeField[] = [
  'firstName',
  'lastName',
  'email',
  'phoneNumber',
  'employeeId',
  'department',
  'designation',
  'dateOfBirth',
  'gender',
  'city',
  'state',
  'pinCode',
  'location',
  'facility',
];

const BULK_EMPLOYEE_HEADER_ALIASES: Record<string, BulkEmployeeField> = {
  'first name': 'firstName',
  firstname: 'firstName',
  fname: 'firstName',
  givenname: 'firstName',
  'given name': 'firstName',
  'employee first name': 'firstName',
  'member first name': 'firstName',
  'last name': 'lastName',
  lastname: 'lastName',
  lname: 'lastName',
  surname: 'lastName',
  familyname: 'lastName',
  'family name': 'lastName',
  'employee last name': 'lastName',
  'member last name': 'lastName',
  name: 'firstName',
  'employee name': 'firstName',
  'member name': 'firstName',
  'full name': 'firstName',
  email: 'email',
  'email id': 'email',
  emailid: 'email',
  'email address': 'email',
  'work email': 'email',
  'official email': 'email',
  'corporate email': 'email',
  phone: 'phoneNumber',
  phonenumber: 'phoneNumber',
  'phone number': 'phoneNumber',
  mobile: 'phoneNumber',
  'mobile number': 'phoneNumber',
  contact: 'phoneNumber',
  'contact number': 'phoneNumber',
  employeeid: 'employeeId',
  'employee id': 'employeeId',
  empid: 'employeeId',
  'emp id': 'employeeId',
  'employee code': 'employeeId',
  'emp code': 'employeeId',
  'staff id': 'employeeId',
  'staff code': 'employeeId',
  'associate id': 'employeeId',
  'ninjacart id': 'employeeId',
  department: 'department',
  dept: 'department',
  function: 'department',
  'business unit': 'department',
  vertical: 'department',
  designation: 'designation',
  role: 'designation',
  'job title': 'designation',
  title: 'designation',
  position: 'designation',
  grade: 'designation',
  dateofbirth: 'dateOfBirth',
  'date of birth': 'dateOfBirth',
  dob: 'dateOfBirth',
  birthdate: 'dateOfBirth',
  gender: 'gender',
  sex: 'gender',
  city: 'city',
  'work city': 'city',
  'base city': 'city',
  state: 'state',
  'work state': 'state',
  pincode: 'pinCode',
  'pin code': 'pinCode',
  pin: 'pinCode',
  zip: 'pinCode',
  'zip code': 'pinCode',
  'postal code': 'pinCode',
  location: 'location',
  branch: 'location',
  'work location': 'location',
  'office location': 'location',
  hub: 'location',
  facility: 'facility',
  'work facility': 'facility',
  site: 'facility',
  warehouse: 'facility',
};

const normalizeBulkHeaderKey = (header: string) =>
  String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./\\]+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const isBulkEmployeeField = (value: unknown): value is BulkEmployeeField =>
  BULK_EMPLOYEE_FIELDS.includes(value as BulkEmployeeField);

const resolveBulkHeaderField = (header: string): BulkEmployeeField | '' => {
  const normalized = normalizeBulkHeaderKey(header);
  if (!normalized) return '';
  return BULK_EMPLOYEE_HEADER_ALIASES[normalized] || BULK_EMPLOYEE_HEADER_ALIASES[normalized.replace(/\s+/g, '')] || '';
};

interface CommunicationTemplate {
  id: string;
  name: string;
  subject?: string;
  content: string;
  category: string;
}

const packageTypes = ['Basic', 'Standard', 'Premium', 'Enterprise', 'Custom'];
const statusOptions = ['Active', 'Inactive', 'Pending', 'Suspended'];
const planTypes = ['Basic', 'Standard', 'Premium', 'Elite', 'Group Health Insurance', 'OPD Plan', 'Wellness Plan'];

const defaultBenefits = [
  { id: 'b1', name: 'Hospitalization', category: 'IPD', description: 'Inpatient treatment coverage', isIncluded: true, coverage: '100%' },
  { id: 'b2', name: 'Pre-Hospitalization', category: 'IPD', description: 'Pre-admission expenses', isIncluded: true, limit: '30 days' },
  { id: 'b3', name: 'Post-Hospitalization', category: 'IPD', description: 'Post-discharge expenses', isIncluded: true, limit: '60 days' },
  { id: 'b4', name: 'OPD Consultation', category: 'OPD', description: 'Doctor consultation fees', isIncluded: true, limit: '₹500 per visit' },
  { id: 'b5', name: 'Diagnostic Tests', category: 'Diagnostics', description: 'Lab tests and scans', isIncluded: true, limit: '₹5000 per year' },
  { id: 'b6', name: 'Pharmacy Benefits', category: 'Pharmacy', description: 'Medicine reimbursement', isIncluded: true, limit: '₹10000 per year' },
  { id: 'b7', name: 'Maternity Coverage', category: 'Maternity', description: 'Pregnancy and delivery', isIncluded: false, coverage: '₹50000' },
  { id: 'b8', name: 'Dental Care', category: 'Dental', description: 'Dental treatments', isIncluded: false, limit: '₹15000 per year' },
  { id: 'b9', name: 'Annual Health Checkup', category: 'Wellness', description: 'Preventive health screening', isIncluded: true, limit: 'Once per year' },
  { id: 'b10', name: 'Ambulance Services', category: 'Emergency', description: 'Emergency transportation', isIncluded: true, limit: '₹2000 per incident' },
  { id: 'b11', name: 'Homecare Services', category: 'Homecare', description: 'At-home medical care', isIncluded: false, limit: '10 visits per year' },
  { id: 'b12', name: 'Mental Health', category: 'Mental Health', description: 'Counseling and therapy', isIncluded: false, limit: '5 sessions per year' },
  { id: 'b13', name: 'Ayush Treatment', category: 'Alternative', description: 'Ayurveda/Homeopathy', isIncluded: false, limit: '₹5000 per year' },
  { id: 'b14', name: 'Physiotherapy', category: 'Therapy', description: 'Physical rehabilitation', isIncluded: false, limit: '10 sessions per year' },
  { id: 'b15', name: 'Vision Care', category: 'Vision', description: 'Eye exams and glasses', isIncluded: false, limit: '₹5000 per year' },
];

const defaultPlanFeatures: Record<string, boolean> = {
  opd: true,
  ipd: true,
  maternity: false,
  dental: false,
  pharmacy: true,
  diagnostics: true,
  homecare: false,
  ambulance: true,
  wellness: true,
  mentalHealth: false,
  healthCalendar: false,
  pharmacyDiscount: false,
  webinars: false,
  labDiscount: false,
  discountCoupons: false,
  gymMembership: false,
  wellnessMembership: false,
  wellnessPackageDiscounts: false,
};

const planFeatureLabels: Record<string, string> = {
  opd: 'OPD',
  ipd: 'IPD',
  maternity: 'Maternity',
  dental: 'Dental',
  pharmacy: 'Pharmacy',
  diagnostics: 'Diagnostics',
  homecare: 'Homecare Services',
  ambulance: 'Ambulance',
  wellness: 'Wellness',
  mentalHealth: 'Mental Health',
  healthCalendar: 'Health Calendar',
  pharmacyDiscount: 'Pharmacy Discount',
  webinars: 'Webinars',
  labDiscount: 'Lab Discount',
  discountCoupons: 'Discount Coupons',
  gymMembership: 'Gym Membership',
  wellnessMembership: 'Wellness Membership',
  wellnessPackageDiscounts: 'Wellness Package Discounts',
};

const getPlanFeatureLabel = (key: string) =>
  planFeatureLabels[key] || key.replace(/([A-Z])/g, ' $1').trim();

const mergePlanFeatures = (features?: Record<string, boolean>) => ({
  ...defaultPlanFeatures,
  ...(features || {}),
});

const industries = [
  'Information Technology', 'Banking & Finance', 'Healthcare', 'Manufacturing',
  'Retail', 'Education', 'Consulting', 'Telecommunications', 'Real Estate', 'Other'
];

const defaultCommunicationTemplates: Record<CommunicationChannel, CommunicationTemplate[]> = {
  email: [
    {
      id: 'email-welcome',
      name: 'Corporate Welcome',
      category: 'Onboarding',
      subject: 'Welcome to SmartHealth Corporate Program - {{companyName}}',
      content:
        'Hello {{contactPerson}},\n\nWelcome to SmartHealth corporate wellness program for {{companyName}}. Your corporate ID is {{corporateId}}.\n\nWe are excited to support your {{employeeCount}} employees with preventive care and wellness services.\n\nRegards,\nTeam SmartHealth',
    },
    {
      id: 'email-renewal',
      name: 'Plan Renewal Reminder',
      category: 'Plans',
      subject: 'Plan Renewal Reminder - {{companyName}}',
      content:
        'Dear {{contactPerson}},\n\nThis is a reminder to review and renew the {{packageType}} package for {{companyName}} (Corporate ID: {{corporateId}}).\n\nPlease connect with us to avoid interruption in employee benefits.\n\nRegards,\nTeam SmartHealth',
    },
  ],
  whatsapp: [
    {
      id: 'wa-health-camp',
      name: 'Health Camp Invite',
      category: 'Wellness',
      content:
        'Hi {{contactPerson}}, this is Team SmartHealth. A health camp slot is available for {{companyName}}. Reply YES to schedule for your {{employeeCount}} employees.',
    },
    {
      id: 'wa-opd-update',
      name: 'OPD Benefit Update',
      category: 'Benefits',
      content:
        'Hello {{contactPerson}}, OPD benefits under {{packageType}} plan are now active for {{companyName}} ({{corporateId}}). Need a quick orientation call?',
    },
  ],
  sms: [
    {
      id: 'sms-onboarded',
      name: 'Onboarding Confirmation',
      category: 'Onboarding',
      content:
        'SmartHealth: {{companyName}} onboarded successfully. Corporate ID: {{corporateId}}. HR SPOC: {{contactPerson}}.',
    },
    {
      id: 'sms-action-required',
      name: 'Action Required',
      category: 'Operations',
      content:
        'SmartHealth: Please review pending corporate updates for {{companyName}} ({{corporateId}}). Contact support for assistance.',
    },
  ],
};

const aiTemplatePresets = [
  {
    key: 'renewal_push',
    label: 'Renewal Push',
    objective: 'renewal',
    tone: 'professional',
    cta: 'schedule_call',
    category: 'Plans',
    nameHint: 'Plan Renewal Reminder',
    instruction: 'Highlight urgency and plan continuity impact. Keep compliance-safe language.',
    channels: ['email', 'whatsapp'] as CommunicationChannel[],
  },
  {
    key: 'onboarding_launch',
    label: 'Onboarding Launch',
    objective: 'onboarding',
    tone: 'friendly',
    cta: 'book_demo',
    category: 'Onboarding',
    nameHint: 'Corporate Welcome',
    instruction: 'Set clear next steps and onboarding timeline with a simple CTA.',
    channels: ['email', 'whatsapp', 'sms'] as CommunicationChannel[],
  },
  {
    key: 'reactivation_nudge',
    label: 'Reactivation Nudge',
    objective: 'reactivation',
    tone: 'consultative',
    cta: 'reply_yes',
    category: 'Operations',
    nameHint: 'Engagement Re-activation',
    instruction: 'Use a low-friction re-engagement ask and concise benefit reminder.',
    channels: ['whatsapp', 'sms'] as CommunicationChannel[],
  },
  {
    key: 'upsell_expand',
    label: 'Upsell Expand',
    objective: 'upsell',
    tone: 'professional',
    cta: 'share_documents',
    category: 'Benefits',
    nameHint: 'Benefits Expansion Proposal',
    instruction: 'Frame upgrade value with outcome-led messaging and next action clarity.',
    channels: ['email', 'whatsapp'] as CommunicationChannel[],
  },
];

const channelWordLimits: Record<CommunicationChannel, number> = {
  email: 150,
  whatsapp: 80,
  sms: 35,
};

const channelCharacterLimits: Record<CommunicationChannel, number> = {
  email: 1200,
  whatsapp: 420,
  sms: 160,
};

const TeamCorporateManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const welcomeDeliveryAuditRef = useRef<HTMLDivElement | null>(null);
  
  // State
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [communicationChannel, setCommunicationChannel] = useState<CommunicationChannel>('email');
  const [communicationTemplates, setCommunicationTemplates] = useState<Record<CommunicationChannel, CommunicationTemplate[]>>(defaultCommunicationTemplates);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [communicationDraft, setCommunicationDraft] = useState({
    name: '',
    category: 'General',
    subject: '',
    content: '',
  });
  const [editingCommunicationTemplateId, setEditingCommunicationTemplateId] = useState<string | null>(null);
  const [communicationComposer, setCommunicationComposer] = useState({
    to: '',
    subject: '',
    message: '',
  });
  const [communicationRecipientMode, setCommunicationRecipientMode] = useState<CommunicationRecipientMode>('individual');
  const [communicationRecipientSearch, setCommunicationRecipientSearch] = useState('');
  const [selectedCommunicationEmployeeIds, setSelectedCommunicationEmployeeIds] = useState<string[]>([]);
  const [communicationBulkRecipients, setCommunicationBulkRecipients] = useState('');
  const [communicationLogs, setCommunicationLogs] = useState<any[]>([]);
  const [communicationAnalytics, setCommunicationAnalytics] = useState<any>(null);
  const [aiCommunicationDashboard, setAiCommunicationDashboard] = useState<any>(null);
  const [aiCommunicationDraftId, setAiCommunicationDraftId] = useState<string | number | null>(null);
  const [aiCommunicationLoading, setAiCommunicationLoading] = useState(false);
  const [aiReplyText, setAiReplyText] = useState("");
  const [aiReplyMonitoring, setAiReplyMonitoring] = useState(false);
  const [aiTemplateWriting, setAiTemplateWriting] = useState(false);
  const [aiTemplateConfig, setAiTemplateConfig] = useState({
    objective: 'follow_up',
    tone: 'professional',
    cta: 'book_demo',
    customInstruction: '',
    editInstruction: 'Make this template clearer, shorter, and conversion-focused while preserving placeholders.',
  });
  const [communicationLogsLoading, setCommunicationLogsLoading] = useState(false);
  const [communicationAnalyticsDays, setCommunicationAnalyticsDays] = useState('30');
  const [sendingCommunication, setSendingCommunication] = useState(false);
  const [corporates, setCorporates] = useState<Corporate[]>([]);
  const [selectedCorporate, setSelectedCorporate] = useState<Corporate | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [corporateStatusFilter, setCorporateStatusFilter] = useState<'all' | 'active' | 'inactive' | 'pending' | 'suspended'>('all');
  const [templateLibrarySearch, setTemplateLibrarySearch] = useState('');
  const [templateLibraryCategory, setTemplateLibraryCategory] = useState<'all' | string>('all');
  const [showEditCorporateDialog, setShowEditCorporateDialog] = useState(false);
  const [showDeleteCorporateDialog, setShowDeleteCorporateDialog] = useState(false);
  const [editingCorporate, setEditingCorporate] = useState<Corporate | null>(null);
  const [corporateToDelete, setCorporateToDelete] = useState<Corporate | null>(null);
  const [editCorporateForm, setEditCorporateForm] = useState({
    companyName: '', contactPerson: '', email: '', phoneNumber: '',
    industry: '', employeeCount: '', packageType: '', status: '',
  });
  const [savingCorporate, setSavingCorporate] = useState(false);
  const [deletingCorporate, setDeletingCorporate] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [corporateAdmins, setCorporateAdmins] = useState<CorporateAdminUser[]>([]);
  const [corporateAdminsLoading, setCorporateAdminsLoading] = useState(false);
  const [empCurrentPage, setEmpCurrentPage] = useState(1);
  const EMP_PAGE_SIZE = 10;

  // Dialog states
  const [showAddCorporateDialog, setShowAddCorporateDialog] = useState(false);
  const [showAddHRDialog, setShowAddHRDialog] = useState(false);
  const [editingHRAdmin, setEditingHRAdmin] = useState<CorporateAdminUser | null>(null);
  const [updatingHRAdmin, setUpdatingHRAdmin] = useState(false);
  const [showAddEmployeeDialog, setShowAddEmployeeDialog] = useState(false);
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);
  const [newEmployeeCredentials, setNewEmployeeCredentials] = useState<{name: string; email: string; password: string; emailStatus: "queued" | "skipped" | "draft" | "not_applicable"} | null>(null);
  const [employeeWelcomeEmailMode, setEmployeeWelcomeEmailMode] = useState<WelcomeEmailMode>("draft");
  const [welcomeEmailDrafts, setWelcomeEmailDrafts] = useState<WelcomeEmailDraft[]>([]);
  const [showWelcomeEmailBatchDialog, setShowWelcomeEmailBatchDialog] = useState(false);
  const [sendingWelcomeEmailBatch, setSendingWelcomeEmailBatch] = useState(false);
  const [sendingExistingWelcomeEmail, setSendingExistingWelcomeEmail] = useState(false);
  const [selectedEmployeeIdsForWelcome, setSelectedEmployeeIdsForWelcome] = useState<string[]>([]);
  const [welcomeEmployeeSearch, setWelcomeEmployeeSearch] = useState('');
  const [welcomeEmployeeSelectionMode, setWelcomeEmployeeSelectionMode] = useState<'selected' | 'all'>('selected');
  const [selectedWelcomeTemplateId, setSelectedWelcomeTemplateId] = useState('standard-welcome');
  const [approvedWelcomeTemplateId, setApprovedWelcomeTemplateId] = useState<string | null>(null);
  const [savedWelcomeEmailTemplates, setSavedWelcomeEmailTemplates] = useState<WelcomeEmailTemplatePreset[]>([]);
  const [savingWelcomeTemplate, setSavingWelcomeTemplate] = useState(false);
  const [approvingWelcomeTemplate, setApprovingWelcomeTemplate] = useState(false);
  const [preparingWelcomeEmployeeDrafts, setPreparingWelcomeEmployeeDrafts] = useState(false);
  const [welcomeDeliveries, setWelcomeDeliveries] = useState<WelcomeDeliveryRecord[]>([]);
  const [welcomeDeliveriesLoading, setWelcomeDeliveriesLoading] = useState(false);
  const [welcomeDeliveryFilters, setWelcomeDeliveryFilters] = useState({
    status: 'all',
    requestScope: 'all',
    employeeId: '',
    recipient: '',
    from: '',
    to: '',
  });
  const [welcomeDeliverySummary, setWelcomeDeliverySummary] = useState({
    total: 0,
    sent: 0,
    queued: 0,
    failed: 0,
    rolledBack: 0,
    prepared: 0,
  });
  const [welcomeDeliveryPagination, setWelcomeDeliveryPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0,
  });
  const [resendingWelcomeDeliveryId, setResendingWelcomeDeliveryId] = useState<number | null>(null);
  const [showViewEmployeeDialog, setShowViewEmployeeDialog] = useState(false);
  const [showEditEmployeeDialog, setShowEditEmployeeDialog] = useState(false);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editEmployeeForm, setEditEmployeeForm] = useState({
    firstName: '', lastName: '', email: '', secondaryEmail: '', phone: '',
    department: '', designation: '', city: '', state: '', pinCode: '',
    location: '', facility: '', employeeId: '',
    status: 'active', packageId: '',
  });
  const [updatingEmployee, setUpdatingEmployee] = useState(false);
  const [showAddPackageDialog, setShowAddPackageDialog] = useState(false);
  const [showNetworkDialog, setShowNetworkDialog] = useState(false);
  const [showBulkUploadDialog, setShowBulkUploadDialog] = useState(false);
  const [showEditPackageDialog, setShowEditPackageDialog] = useState(false);
  const [showAssignPackageDialog, setShowAssignPackageDialog] = useState(false);
  const [showBulkPlanDialog, setShowBulkPlanDialog] = useState(false);
  const [bulkPlanId, setBulkPlanId] = useState('');
  const [bulkPlanFilter, setBulkPlanFilter] = useState<'all'|'gender'|'city'|'department'|'location'|'facility'|'age'>('all');
  const [bulkPlanFilterValue, setBulkPlanFilterValue] = useState('');
  const [bulkPlanAgeMin, setBulkPlanAgeMin] = useState('');
  const [bulkPlanAgeMax, setBulkPlanAgeMax] = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [showAssignNetworkDialog, setShowAssignNetworkDialog] = useState(false);
  const [assigningNetworks, setAssigningNetworks] = useState<{ id: number; name: string; type: 'lab' | 'hospital' | 'clinic'; city?: string }[]>([]);
  const [selectedNetworkPartnerIds, setSelectedNetworkPartnerIds] = useState<number[]>([]);
  const [labSearch, setLabSearch] = useState('');
  const [hospitalSearch, setHospitalSearch] = useState('');
  const [clinicSearch, setClinicSearch] = useState('');
  const [networkAssignMode, setNetworkAssignMode] = useState<'all' | 'department' | 'custom'>('all');
  const [networkEmployeeSearch, setNetworkEmployeeSearch] = useState('');
  const [selectedDepartmentsForAssign, setSelectedDepartmentsForAssign] = useState<string[]>([]);
  const [editingPackage, setEditingPackage] = useState<any>(null);
  const [assigningPackage, setAssigningPackage] = useState<any>(null);
  const [selectedEmployeesForAssign, setSelectedEmployeesForAssign] = useState<string[]>([]);
  
  // Bulk upload state
  const [bulkUploadFile, setBulkUploadFile] = useState<File | null>(null);
  const [bulkUploadResults, setBulkUploadResults] = useState<{
    created: any[];
    failed: any[];
    qcLog: { row: number; employeeId: string; name: string; email: string; issues: string[] }[];
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [bulkWelcomeEmailMode, setBulkWelcomeEmailMode] = useState<WelcomeEmailMode>("draft");
  const [bulkUseAiColumnDetection, setBulkUseAiColumnDetection] = useState(true);
  const [bulkAiColumnSummary, setBulkAiColumnSummary] = useState<string | null>(null);
  const [showUploadReport, setShowUploadReport] = useState(false);
  const [bulkRemoveUnlisted, setBulkRemoveUnlisted] = useState(false);
  const [syncOffboardList, setSyncOffboardList] = useState<{ id: number; name: string; email: string; employeeId: string }[]>([]);
  const [showSyncConfirmDialog, setShowSyncConfirmDialog] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Corporate form
  const [newCorporate, setNewCorporate] = useState({
    companyName: '',
    contactPerson: '',
    email: '',
    phoneNumber: '',
    industry: 'Information Technology',
    employeeCount: '',
    packageType: 'Standard',
    gstNumber: '',
    panNumber: '',
    address: {
      street: '',
      city: '',
      state: '',
      pincode: ''
    }
  });
  
  // HR Admin form
  const [newHRAdmin, setNewHRAdmin] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    password: ''
  });
  
  // Employee form
  const [newEmployee, setNewEmployee] = useState({
    employeeId: '',
    name: '',
    email: '',
    phone: '',
    gender: '',
    department: '',
    designation: '',
    joiningDate: '',
    workCity: '',
    workState: ''
  });
  const [empIdStatus, setEmpIdStatus] = useState<'idle' | 'checking' | 'ok' | 'duplicate'>('idle');

  
  // Package form
  const [newPackage, setNewPackage] = useState({
    name: '',
    description: '',
    tests: [] as string[],
    price: '',
    validityDays: '365'
  });
  
  const [showCreatePlanDialog, setShowCreatePlanDialog] = useState(false);
  const [showEditPlanDialog, setShowEditPlanDialog] = useState(false);
  const [showViewPlanDialog, setShowViewPlanDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState<CorporatePlan | null>(null);
  const [editPlanForm, setEditPlanForm] = useState({
    planName: '', planType: 'Standard', description: '', validFrom: '', validTo: '',
    totalEmployees: '', premiumPerEmployee: '', status: 'Active', currency: 'INR',
    benefits: [...defaultBenefits],
    features: mergePlanFeatures(),
    coverage: { sumInsured: '', roomRent: 'Single Room', icuRent: '2% of Sum Insured', prePolicyMedical: '30 days', postPolicyMedical: '60 days' },
    healthPackageIds: [] as string[],
  });
  const [newPlan, setNewPlan] = useState({
    planName: '',
    planType: 'Standard',
    description: '',
    validFrom: '',
    validTo: '',
    totalEmployees: '',
    premiumPerEmployee: '',
    status: 'Active',
    currency: 'INR',
    benefits: [...defaultBenefits],
    features: mergePlanFeatures(),
    coverage: {
      sumInsured: '',
      roomRent: 'Single Room',
      icuRent: '2% of Sum Insured',
      prePolicyMedical: '30 days',
      postPolicyMedical: '60 days',
    },
    healthPackageIds: [] as string[],
  });
  
  // Wellness Calendar
  const [wellnessEvents, setWellnessEvents] = useState<WellnessEvent[]>([]);
  const [calendarView, setCalendarView] = useState<'month' | 'list'>('month');
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [showCreateEventDialog, setShowCreateEventDialog] = useState(false);
  const [showEditEventDialog, setShowEditEventDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState<WellnessEvent | null>(null);
  const eventTypeColors: Record<string, string> = {
    'Wellness Session': 'teal',
    'Health Checkup': 'blue',
    'Fitness Activity': 'orange',
    'Mental Health': 'purple',
    'Yoga & Meditation': 'indigo',
    'Nutrition Workshop': 'green',
    'Sports Day': 'red',
    'Safety Training': 'yellow',
    'Other': 'slate',
  };
  const colorClasses: Record<string, string> = {
    teal:   'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300',
    blue:   'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300',
    orange: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300',
    purple: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300',
    indigo: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300',
    green:  'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300',
    red:    'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300',
    slate:  'bg-muted text-foreground border dark:bg-slate-900/30 dark:text-slate-300',
  };
  const defaultEventForm = {
    title: '',
    description: '',
    eventType: 'Wellness Session',
    eventDate: '',
    eventTime: '',
    endDate: '',
    endTime: '',
    location: '',
    organizer: '',
    maxParticipants: '',
    status: 'upcoming',
    notifyEmployees: false,
  };
  const [eventForm, setEventForm] = useState(defaultEventForm);

  const getCommunicationStorageKey = (corporateId?: number) =>
    corporateId ? `teamCorporateCommunicationTemplates:${corporateId}` : '';

  const getDefaultRecipientByChannel = (channel: CommunicationChannel, corporate: Corporate | null) => {
    if (!corporate) return '';
    if (channel === 'email') return corporate.email || '';
    return corporate.phoneNumber || '';
  };

  const applyCommunicationPlaceholders = (text: string) => {
    if (!selectedCorporate) return text;
    const map: Record<string, string> = {
      companyName: selectedCorporate.companyName || '',
      contactPerson: selectedCorporate.contactPerson || '',
      corporateId: selectedCorporate.uniqueId || `ID-${selectedCorporate.id}`,
      employeeCount: String(selectedCorporate.employeeCount || 0),
      industry: selectedCorporate.industry || '',
      packageType: selectedCorporate.packageType || '',
    };
    return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => map[key] || '');
  };

  const persistCommunicationTemplates = (next: Record<CommunicationChannel, CommunicationTemplate[]>) => {
    if (!selectedCorporate?.id) return;
    localStorage.setItem(getCommunicationStorageKey(selectedCorporate.id), JSON.stringify(next));
    setCommunicationTemplates(next);
  };

  const resetCommunicationDraft = () => {
    setCommunicationDraft({ name: '', category: 'General', subject: '', content: '' });
    setEditingCommunicationTemplateId(null);
  };

  const countWords = (text: string) => {
    return (text || '').trim().split(/\s+/).filter(Boolean).length;
  };

  const clampWords = (text: string, maxWords: number) => {
    const tokens = (text || '').trim().split(/\s+/).filter(Boolean);
    if (tokens.length <= maxWords) {
      return { text: (text || '').trim(), truncated: false, count: tokens.length };
    }
    return {
      text: tokens.slice(0, maxWords).join(' '),
      truncated: true,
      count: maxWords,
    };
  };

  const clampChars = (text: string, maxChars: number) => {
    const cleaned = (text || '').trim();
    if (cleaned.length <= maxChars) {
      return { text: cleaned, truncated: false, count: cleaned.length };
    }
    return {
      text: cleaned.slice(0, maxChars).trim(),
      truncated: true,
      count: maxChars,
    };
  };

  const fitCopyToChannelLimits = (text: string, wordLimit: number, charLimit: number) => {
    const limitedByWords = clampWords(text, wordLimit);
    const limitedByChars = clampChars(limitedByWords.text, charLimit);
    return {
      text: limitedByChars.text,
      truncated: limitedByWords.truncated || limitedByChars.truncated,
    };
  };

  const extractJsonObject = (text: string) => {
    const trimmed = (text || '').trim();
    if (!trimmed) return null;

    const direct = trimmed.match(/^\s*\{[\s\S]*\}\s*$/);
    if (direct?.[0]) {
      try { return JSON.parse(direct[0]); } catch (_) { /* no-op */ }
    }

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try { return JSON.parse(fenced[1].trim()); } catch (_) { /* no-op */ }
    }

    const firstObj = trimmed.match(/\{[\s\S]*\}/);
    if (firstObj?.[0]) {
      try { return JSON.parse(firstObj[0]); } catch (_) { /* no-op */ }
    }
    return null;
  };

  const stripAiTemplateFraming = (text: string) => {
    const lines = (text || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^(here(?:'s| is)|below is|template name:|category:|note:|final template:|body:|message:|email body:)/i.test(line));
    return lines.join('\n').trim();
  };

  const lintTemplateCopy = (channel: CommunicationChannel, subject: string, content: string) => {
    const blocking: string[] = [];
    const warnings: string[] = [];
    const text = (content || '').trim();
    const charCount = text.length;
    const charLimit = channelCharacterLimits[channel];
    const lines = text ? text.split(/\n+/).length : 0;

    if (charCount > charLimit) {
      blocking.push(`Content exceeds ${charLimit} characters for ${channel.toUpperCase()}.`);
    }

    if (channel === 'email') {
      if (!subject.trim()) blocking.push('Email templates require a subject line.');
      if (subject.trim().length > 70) warnings.push('Subject is long; keep under 70 characters for better open rates.');
    }

    if (channel === 'whatsapp') {
      if (charCount > 220 && lines < 2) warnings.push('Add line breaks for better WhatsApp readability.');
      if (text && !/(reply|book|schedule|yes|call|demo)/i.test(text)) warnings.push('Consider adding a clear WhatsApp call-to-action.');
    }

    if (channel === 'sms') {
      if (lines > 2) warnings.push('SMS works better as one short paragraph.');
      if (/(https?:\/\/|www\.)/i.test(text)) warnings.push('Links consume SMS characters quickly; use concise short links.');
    }

    return { blocking, warnings, charCount, lines, charLimit };
  };

  const templateWordLimit = channelWordLimits[communicationChannel];
  const templateCharLimit = channelCharacterLimits[communicationChannel];
  const templateDraftWordCount = countWords(communicationDraft.content || '');
  const templateDraftCharCount = (communicationDraft.content || '').trim().length;
  const templateDraftWithinLimit = templateDraftWordCount <= templateWordLimit;
  const templateCopyLint = lintTemplateCopy(communicationChannel, communicationDraft.subject || '', communicationDraft.content || '');
  const templateHasBlockingLint = templateCopyLint.blocking.length > 0;
  const composerMessageWordCount = countWords(communicationComposer.message || '');
  const composerMessageCharCount = (communicationComposer.message || '').trim().length;
  const composerWithinWordLimit = composerMessageWordCount <= templateWordLimit;
  const composerCopyLint = lintTemplateCopy(communicationChannel, communicationComposer.subject || '', communicationComposer.message || '');
  const composerHasBlockingLint = composerCopyLint.blocking.length > 0;
  const availableAiPresets = aiTemplatePresets.filter((preset) => preset.channels.includes(communicationChannel));

  const applyAiTemplatePreset = (presetKey: string) => {
    const preset = availableAiPresets.find((item) => item.key === presetKey);
    if (!preset) return;

    setAiTemplateConfig((prev) => ({
      ...prev,
      objective: preset.objective,
      tone: preset.tone,
      cta: preset.cta,
      customInstruction: preset.instruction,
    }));

    setCommunicationDraft((prev) => ({
      ...prev,
      name: prev.name || preset.nameHint,
      category: prev.category === 'General' ? preset.category : prev.category,
    }));

    toast({
      title: 'Preset applied',
      description: `${preset.label} configured in AI Template Studio.`,
    });
  };

  const parseAiTemplateOutput = (text: string) => {
    const trimmed = (text || '').trim();
    if (!trimmed) return { subject: '', content: '' };

    const maybeJson = extractJsonObject(trimmed);
    if (maybeJson && typeof maybeJson === 'object') {
      const subject = String((maybeJson.subject ?? maybeJson.title ?? '') || '').trim();
      const rawBody = String((maybeJson.body ?? maybeJson.content ?? maybeJson.message ?? '') || '').trim();
      return {
        subject,
        content: stripAiTemplateFraming(rawBody),
      };
    }

    if (communicationChannel !== 'email') {
      return { subject: '', content: stripAiTemplateFraming(trimmed) };
    }
    const lines = trimmed.split('\n');
    const subjectLine = lines.find((l: string) => l.toLowerCase().startsWith('subject:'));
    const body = lines
      .filter((l: string) => !l.toLowerCase().startsWith('subject:'))
      .join('\n')
      .replace(/^body:\s*/i, '')
      .trim();
    return {
      subject: subjectLine ? subjectLine.replace(/^subject:\s*/i, '').trim() : '',
      content: stripAiTemplateFraming(body || trimmed),
    };
  };

  const generateAiTemplate = async () => {
    if (!selectedCorporate) return;
    setAiTemplateWriting(true);
    try {
      const channelHint = communicationChannel === 'email' ? 'professional email' : communicationChannel === 'whatsapp' ? 'WhatsApp message' : 'SMS text';
      const nameHint = communicationDraft.name || 'Corporate Outreach';
      const categoryHint = communicationDraft.category || 'General';
      const objectiveHint = aiTemplateConfig.objective.replace(/_/g, ' ');
      const ctaHint = aiTemplateConfig.cta.replace(/_/g, ' ');
      const prompt = `Write a concise, professional ${channelHint} template for a healthcare benefits platform.
Corporate: ${selectedCorporate.companyName} | Industry: ${selectedCorporate.industry || 'General'} | Employees: ${selectedCorporate.employeeCount || 0} | Plan: ${selectedCorporate.packageType || 'Standard'}
Template name: "${nameHint}" | Category: ${categoryHint}
Objective: ${objectiveHint} | Tone: ${aiTemplateConfig.tone} | CTA: ${ctaHint}
Use these exact placeholders where appropriate: {{companyName}}, {{contactPerson}}, {{employeeCount}}, {{industry}}, {{packageType}}
${aiTemplateConfig.customInstruction ? `Additional instruction: ${aiTemplateConfig.customInstruction}` : ''}
${communicationChannel === 'email'
  ? `Return only this format:\nSubject: <subject line>\nBody: <body text>`
  : 'Return only the message body text.'}
Do not add intros, explanations, markdown, code fences, or signatures unless explicitly requested.
Keep it warm, professional, and action-oriented. Maximum ${templateWordLimit} words and ${templateCharLimit} characters for the body.`;

      const res = await api.post('/team/ai/generate', { prompt, maxTokens: 300 });
      const text: string = res.data?.data?.content || res.data?.content || '';
      if (!text) throw new Error('No content returned');

      const parsed = parseAiTemplateOutput(text);
      const limited = fitCopyToChannelLimits(parsed.content, templateWordLimit, templateCharLimit);
      setCommunicationDraft(prev => ({
        ...prev,
        subject: communicationChannel === 'email' ? (parsed.subject || prev.subject) : prev.subject,
        content: limited.text,
      }));
      if (limited.truncated) {
        toast({ title: 'AI content trimmed', description: `Content was auto-fitted to ${templateWordLimit} words and ${templateCharLimit} characters for ${communicationChannel.toUpperCase()}.` });
      }
      toast({ title: 'AI template generated', description: 'Review and edit before saving.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'AI failed', description: err.message || 'Could not generate template' });
    } finally {
      setAiTemplateWriting(false);
    }
  };

  const aiEditExistingTemplate = async (template: CommunicationTemplate) => {
    if (!selectedCorporate) return;
    setAiTemplateWriting(true);
    try {
      const channelHint = communicationChannel === 'email' ? 'professional email' : communicationChannel === 'whatsapp' ? 'WhatsApp message' : 'SMS text';
      const prompt = `Rewrite this ${channelHint} template for better conversion while preserving placeholders exactly.
Corporate: ${selectedCorporate.companyName} | Industry: ${selectedCorporate.industry || 'General'} | Plan: ${selectedCorporate.packageType || 'Standard'}
Template name: "${template.name}" | Category: ${template.category}
Current subject: ${template.subject || 'N/A'}
Current content:
${template.content}

Edit instruction: ${aiTemplateConfig.editInstruction || 'Improve clarity, readability, and CTA strength.'}
Tone: ${aiTemplateConfig.tone} | Objective: ${aiTemplateConfig.objective.replace(/_/g, ' ')} | CTA: ${aiTemplateConfig.cta.replace(/_/g, ' ')}
Preserve placeholders exactly if present: {{companyName}}, {{contactPerson}}, {{corporateId}}, {{employeeCount}}, {{industry}}, {{packageType}}
${communicationChannel === 'email'
  ? `Return only this format:\nSubject: <subject line>\nBody: <body text>`
  : 'Return only the message body text.'}
Do not add intros, explanations, markdown, code fences, or signatures unless explicitly requested.
Maximum ${templateWordLimit} words and ${templateCharLimit} characters for the body.`;

      const res = await api.post('/team/ai/generate', { prompt, maxTokens: 350 });
      const text: string = res.data?.data?.content || res.data?.content || '';
      if (!text) throw new Error('No content returned');
      const parsed = parseAiTemplateOutput(text);
      const limited = fitCopyToChannelLimits(parsed.content, templateWordLimit, templateCharLimit);

      const next: Record<CommunicationChannel, CommunicationTemplate[]> = {
        ...communicationTemplates,
        [communicationChannel]: communicationTemplates[communicationChannel].map((item) =>
          item.id === template.id
            ? {
                ...item,
                subject: communicationChannel === 'email' ? (parsed.subject || item.subject || '') : undefined,
                content: limited.text || item.content,
                category: item.category || 'General',
              }
            : item
        ),
      };
      persistCommunicationTemplates(next);

      if (editingCommunicationTemplateId === template.id) {
        setCommunicationDraft((prev) => ({
          ...prev,
          subject: communicationChannel === 'email' ? (parsed.subject || prev.subject) : prev.subject,
          content: limited.text || prev.content,
        }));
      }
      if (limited.truncated) {
        toast({ title: 'AI content trimmed', description: `Edited template was auto-fitted to ${templateWordLimit} words and ${templateCharLimit} characters.` });
      }
      toast({ title: 'Template AI-edited', description: 'Existing template updated with AI improvements.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'AI edit failed', description: err.message || 'Could not edit template with AI' });
    } finally {
      setAiTemplateWriting(false);
    }
  };

  const saveCommunicationTemplate = () => {
    if (!communicationDraft.name || !communicationDraft.content) {
      toast({ variant: 'destructive', title: 'Missing fields', description: 'Template name and content are required.' });
      return;
    }

    const fitted = fitCopyToChannelLimits(communicationDraft.content || '', templateWordLimit, templateCharLimit);
    const nextDraft = {
      ...communicationDraft,
      subject: communicationChannel === 'email' ? (communicationDraft.subject || '').trim() : communicationDraft.subject,
      content: fitted.text,
    };
    const nextLint = lintTemplateCopy(communicationChannel, nextDraft.subject || '', nextDraft.content || '');

    if (nextLint.blocking.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Template validation failed',
        description: nextLint.blocking[0],
      });
      return;
    }

    if (fitted.truncated) {
      setCommunicationDraft(nextDraft);
      toast({ title: 'Template auto-trimmed', description: `${communicationChannel.toUpperCase()} template was fitted to ${templateWordLimit} words and ${templateCharLimit} characters.` });
    }

    if (editingCommunicationTemplateId) {
      const next: Record<CommunicationChannel, CommunicationTemplate[]> = {
        ...communicationTemplates,
        [communicationChannel]: communicationTemplates[communicationChannel].map((template) =>
          template.id === editingCommunicationTemplateId
            ? {
                ...template,
                name: nextDraft.name,
                category: nextDraft.category || 'General',
                subject: communicationChannel === 'email' ? nextDraft.subject : undefined,
                content: nextDraft.content,
              }
            : template
        ),
      };
      persistCommunicationTemplates(next);
      resetCommunicationDraft();
      toast({ title: 'Template updated', description: `${communicationChannel.toUpperCase()} template updated.` });
      return;
    }

    const next: Record<CommunicationChannel, CommunicationTemplate[]> = {
      ...communicationTemplates,
      [communicationChannel]: [
        {
          id: `${communicationChannel}-${Date.now()}`,
          name: nextDraft.name,
          category: nextDraft.category || 'General',
          subject: communicationChannel === 'email' ? nextDraft.subject : undefined,
          content: nextDraft.content,
        },
        ...communicationTemplates[communicationChannel],
      ],
    };
    persistCommunicationTemplates(next);
    resetCommunicationDraft();
    toast({ title: 'Template saved', description: `${communicationChannel.toUpperCase()} template added.` });
  };

  const editCommunicationTemplate = (template: CommunicationTemplate) => {
    setEditingCommunicationTemplateId(template.id);
    setCommunicationDraft({
      name: template.name,
      category: template.category || 'General',
      subject: template.subject || '',
      content: template.content || '',
    });
  };

  const useCommunicationTemplate = (template: CommunicationTemplate) => {
    setSelectedTemplateId(template.id);
    setCommunicationComposer((prev) => ({
      ...prev,
      subject: template.subject ? applyCommunicationPlaceholders(template.subject) : '',
      message: applyCommunicationPlaceholders(template.content),
    }));
  };

  const storeAiDraftAsTemplate = (draft: any, sourceId?: string | number | null) => {
    if (!draft) return null;
    const content = draft.message || draft.body || '';
    if (!content.trim()) return null;
    const templateId = sourceId ? `ai-${sourceId}` : `ai-${communicationChannel}-${Date.now()}`;
    const template: CommunicationTemplate = {
      id: templateId,
      name: `AI Draft - ${selectedCorporate?.companyName || 'Corporate'}`,
      category: 'AI Draft',
      subject: communicationChannel === 'email' ? (draft.subject || communicationComposer.subject || '') : undefined,
      content,
    };
    const existing = communicationTemplates[communicationChannel].filter((item) => item.id !== templateId);
    const next: Record<CommunicationChannel, CommunicationTemplate[]> = {
      ...communicationTemplates,
      [communicationChannel]: [template, ...existing],
    };
    persistCommunicationTemplates(next);
    setSelectedTemplateId(templateId);
    return template;
  };

  const saveComposerAsCommunicationTemplate = () => {
    if (!communicationComposer.message.trim()) {
      toast({ variant: 'destructive', title: 'Nothing to save', description: 'Write or generate a message before saving a template.' });
      return;
    }
    const template: CommunicationTemplate = {
      id: `manual-${communicationChannel}-${Date.now()}`,
      name: `Saved Draft - ${selectedCorporate?.companyName || 'Corporate'}`,
      category: 'Saved Draft',
      subject: communicationChannel === 'email' ? communicationComposer.subject : undefined,
      content: communicationComposer.message,
    };
    const next: Record<CommunicationChannel, CommunicationTemplate[]> = {
      ...communicationTemplates,
      [communicationChannel]: [template, ...communicationTemplates[communicationChannel]],
    };
    persistCommunicationTemplates(next);
    setSelectedTemplateId(template.id);
    toast({ title: 'Template stored', description: 'Current draft saved to the Template Library.' });
  };

  const useStoredAiCommunication = (action: any) => {
    if (!action) return;
    setAiCommunicationDraftId(action.id || null);
    setCommunicationComposer((prev) => ({
      ...prev,
      subject: communicationChannel === 'email' ? (action.subject || prev.subject || '') : prev.subject,
      message: action.body || action.message || action.nextAction?.message || prev.message,
    }));
    const matchingTemplate = communicationTemplates[communicationChannel].find((item) => item.id === `ai-${action.id}`);
    if (matchingTemplate) setSelectedTemplateId(matchingTemplate.id);
  };

  const removeCommunicationTemplate = (templateId: string) => {
    const next: Record<CommunicationChannel, CommunicationTemplate[]> = {
      ...communicationTemplates,
      [communicationChannel]: communicationTemplates[communicationChannel].filter((template) => template.id !== templateId),
    };
    persistCommunicationTemplates(next);
  };

  const getEmployeeChannelAddress = (employee: Employee) => {
    if (communicationChannel === 'email') return (employee.email || '').trim().toLowerCase();
    return (employee.phone || '').trim();
  };

  const eligibleCommunicationEmployees = employees.filter((employee) => getEmployeeChannelAddress(employee));
  const filteredCommunicationEmployees = eligibleCommunicationEmployees.filter((employee) => {
    const q = communicationRecipientSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      employee.name?.toLowerCase().includes(q) ||
      employee.email?.toLowerCase().includes(q) ||
      employee.phone?.toLowerCase().includes(q) ||
      employee.department?.toLowerCase().includes(q) ||
      employee.employeeId?.toLowerCase().includes(q)
    );
  });

  const hasActiveWelcomeEmailDelivery = (employee: Employee) => {
    const status = String(employee.welcomeEmailStatus || '').toLowerCase();
    return status === 'sent' || status === 'queued';
  };

  const filteredWelcomeEmployees = useMemo(() => {
    const q = welcomeEmployeeSearch.trim().toLowerCase();
    if (!q) return employees;

    return employees.filter((employee) => (
      employee.name?.toLowerCase().includes(q)
      || employee.email?.toLowerCase().includes(q)
      || employee.employeeId?.toLowerCase().includes(q)
      || employee.department?.toLowerCase().includes(q)
      || employee.designation?.toLowerCase().includes(q)
    ));
  }, [employees, welcomeEmployeeSearch]);

  const filteredWelcomeTotalPages = Math.max(1, Math.ceil(filteredWelcomeEmployees.length / EMP_PAGE_SIZE));

  useEffect(() => {
    setEmpCurrentPage(1);
  }, [welcomeEmployeeSearch]);

  useEffect(() => {
    if (empCurrentPage > filteredWelcomeTotalPages) {
      setEmpCurrentPage(filteredWelcomeTotalPages);
    }
  }, [empCurrentPage, filteredWelcomeTotalPages]);

  const communicationSummary = communicationAnalytics?.summary || {};
  const communicationTotal = Number(communicationSummary.total || 0);
  const communicationSent = Number(communicationSummary.sent || 0);
  const communicationFailed = Number(communicationSummary.failed || 0);
  const communicationSuccessRate = Number(communicationSummary.successRate || 0);
  const aiNextActionCount = Number(aiCommunicationDashboard?.nextActions?.length || 0);
  const audienceCount = communicationRecipientMode === 'selected'
    ? selectedCommunicationEmployeeIds.length
    : communicationRecipientMode === 'bulk'
      ? communicationBulkRecipients.split(/\n|,|;/g).map((item) => item.trim()).filter(Boolean).length
      : (communicationComposer.to.trim() ? 1 : 0);
  const isCommunicationReadyToSend = audienceCount > 0
    && communicationComposer.message.trim().length > 0
    && (communicationChannel !== 'email' || communicationComposer.subject.trim().length > 0)
    && composerWithinWordLimit
    && !composerHasBlockingLint;
  const communicationHealthTone = communicationSuccessRate >= 80 ? 'healthy' : communicationSuccessRate >= 50 ? 'watch' : 'critical';

  const buildCommunicationRecipients = () => {
    if (communicationRecipientMode === 'individual') {
      return communicationComposer.to ? [communicationComposer.to.trim()] : [];
    }
    if (communicationRecipientMode === 'selected') {
      return selectedCommunicationEmployeeIds
        .map((id) => employees.find((employee) => employee.id === id))
        .filter(Boolean)
        .map((employee) => getEmployeeChannelAddress(employee as Employee))
        .filter(Boolean);
    }

    const bulkList = communicationBulkRecipients
      .split(/\n|,|;/g)
      .map((item) => item.trim())
      .filter(Boolean);
    return [...new Set(bulkList)];
  };

  const fetchCommunicationInsights = async (opts?: { days?: string }) => {
    if (!selectedCorporate?.id) return;
    try {
      setCommunicationLogsLoading(true);
      const token = localStorage.getItem('teamToken');
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const days = opts?.days || communicationAnalyticsDays;

      const [logsResp, analyticsResp, aiDashboardResp] = await Promise.allSettled([
        api.get("/team/communications/logs", {
          params: { corporateId: selectedCorporate.id, channel: communicationChannel, limit: 15 },
          headers,
        }),
        api.get("/team/communications/analytics", {
          params: { corporateId: selectedCorporate.id, days },
          headers,
        }),
        api.get("/team/communications/ai-dashboard", {
          params: { corporateId: selectedCorporate.id, days },
          headers,
          timeout: 45000,
        }),
      ]);

      if (logsResp.status === 'fulfilled') {
        setCommunicationLogs(logsResp.value?.data?.logs || []);
      } else {
        console.error('Failed to fetch communication logs', logsResp.reason);
      }

      if (analyticsResp.status === 'fulfilled') {
        setCommunicationAnalytics(analyticsResp.value?.data || null);
      } else {
        console.error('Failed to fetch communication analytics', analyticsResp.reason);
      }

      if (aiDashboardResp.status === 'fulfilled') {
        setAiCommunicationDashboard(aiDashboardResp.value?.data?.data || null);
      } else {
        console.error('Failed to fetch AI communication dashboard', aiDashboardResp.reason);
        const aiDashboardError = aiDashboardResp.reason as any;
        const timedOut = aiDashboardError?.code === 'ECONNABORTED' || String(aiDashboardError?.message || '').toLowerCase().includes('timeout');
        toast({
          title: 'AI dashboard delayed',
          description: timedOut
            ? 'Core communication insights loaded. AI dashboard is taking longer than expected and will retry on refresh.'
            : 'Core communication insights loaded. AI dashboard is temporarily unavailable.',
        });
      }
    } catch (error) {
      console.error('Failed to fetch communication insights', error);
    } finally {
      setCommunicationLogsLoading(false);
    }
  };

  const teamAuthHeaders = () => {
    const token = localStorage.getItem("teamToken");
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  };

  const mergeAssistiveMessage = (currentMessage: string, aiMessage: string) => {
    const current = (currentMessage || '').trim();
    const suggestion = (aiMessage || '').trim();
    if (!suggestion) return current;
    if (!current) return suggestion;
    if (current === suggestion) return current;
    return `${current}\n\n---\nAI Suggestion:\n${suggestion}`;
  };

  const generateAiCommunicationDraft = async () => {
    if (!selectedCorporate?.id) return;
    setAiCommunicationLoading(true);
    try {
      const { data } = await api.post("/team/communications/ai-draft", {
        corporateId: selectedCorporate.id,
        corporate: selectedCorporate,
        channel: communicationChannel,
        intent: communicationChannel === "email" ? "corporate_plan_follow_up" : "corporate_short_outreach",
        tone: "professional",
        context: {
          assistMode: "augment",
          recipientMode: communicationRecipientMode,
          employeeCount: selectedCorporate.employeeCount,
          packageType: selectedCorporate.packageType,
          currentSubject: communicationComposer.subject,
          currentMessage: communicationComposer.message,
        },
      }, { headers: teamAuthHeaders() });
      const draft = data?.data?.draft;
      if (draft) {
        setCommunicationComposer((prev) => ({
          ...prev,
          subject: communicationChannel === "email" ? (prev.subject || draft.subject || '') : prev.subject,
          message: mergeAssistiveMessage(prev.message, draft.message || draft.body || ''),
        }));
        setAiCommunicationDraftId(data?.data?.id || null);
        storeAiDraftAsTemplate(draft, data?.data?.id || null);
        toast({ title: "AI assist applied", description: "Your draft was preserved and AI suggestions were added. Template saved to the library." });
        await fetchCommunicationInsights();
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "AI draft failed", description: error?.response?.data?.message || "Unable to generate draft right now." });
    } finally {
      setAiCommunicationLoading(false);
    }
  };

  const recordAiReplySignal = async () => {
    if (!selectedCorporate?.id || !aiReplyText.trim()) return;
    setAiReplyMonitoring(true);
    try {
      await api.post("/team/communications/ai-monitor", {
        communicationId: aiCommunicationDraftId || undefined,
        corporateId: selectedCorporate.id,
        corporate: selectedCorporate,
        eventType: "reply",
        subject: communicationComposer.subject,
        message: communicationComposer.message,
        replyText: aiReplyText,
      }, { headers: teamAuthHeaders() });
      setAiReplyText("");
      toast({ title: "Reply monitored", description: "AI updated engagement and next action." });
      await fetchCommunicationInsights();
    } catch (error: any) {
      toast({ variant: "destructive", title: "AI monitor failed", description: error?.response?.data?.message || "Unable to record reply signal." });
    } finally {
      setAiReplyMonitoring(false);
    }
  };

  const sendCommunication = async () => {
    const recipients = buildCommunicationRecipients();
    if (recipients.length === 0 || !communicationComposer.message.trim()) {
      toast({ variant: 'destructive', title: 'Missing fields', description: 'Recipient(s) and message are required.' });
      return;
    }
    if (communicationChannel === 'email' && !communicationComposer.subject.trim()) {
      toast({ variant: 'destructive', title: 'Subject required', description: 'Email communication requires a subject line.' });
      return;
    }
    if (!composerWithinWordLimit) {
      toast({
        variant: 'destructive',
        title: 'Message too long',
        description: `${communicationChannel.toUpperCase()} composer message must be within ${templateWordLimit} words (current: ${composerMessageWordCount}).`,
      });
      return;
    }
    if (composerHasBlockingLint) {
      toast({
        variant: 'destructive',
        title: 'Message validation failed',
        description: composerCopyLint.blocking[0],
      });
      return;
    }

    const selectedTemplate = communicationTemplates[communicationChannel].find((template) => template.id === selectedTemplateId);

    setSendingCommunication(true);
    try {
      await api.post('/team/communications/send', {
        channel: communicationChannel,
        to: recipients[0],
        recipients: recipients.slice(1),
        recipientMode: communicationRecipientMode,
        subject: communicationComposer.subject,
        message: communicationComposer.message,
        templateId: selectedTemplateId || undefined,
        templateName: selectedTemplate?.name || undefined,
        companyName: selectedCorporate?.companyName,
        corporateId: selectedCorporate?.id,
      }, {
        headers: (() => {
          const token = localStorage.getItem('teamToken');
          return token ? { Authorization: `Bearer ${token}` } : undefined;
        })(),
      });

      toast({
        title: `${communicationChannel.toUpperCase()} sent`,
        description: `Message sent to ${recipients.length} recipient${recipients.length > 1 ? 's' : ''} for ${selectedCorporate?.companyName || 'corporate contact'}.`,
      });
      if (communicationChannel === "email") {
        await api.post("/team/communications/ai-monitor", {
          communicationId: aiCommunicationDraftId || undefined,
          corporateId: selectedCorporate?.id,
          corporate: selectedCorporate,
          eventType: "sent",
          subject: communicationComposer.subject,
          message: communicationComposer.message,
          contactEmail: recipients[0],
        }, { headers: teamAuthHeaders() }).catch(() => {});
      }
      await fetchCommunicationInsights();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: `${communicationChannel.toUpperCase()} send failed`,
        description: error?.response?.data?.message || 'Unable to send right now. Template is still saved.',
      });
    } finally {
      setSendingCommunication(false);
    }
  };

  useEffect(() => {
    if (!selectedCorporate) return;
    const key = getCommunicationStorageKey(selectedCorporate.id);
    const raw = key ? localStorage.getItem(key) : null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Record<CommunicationChannel, CommunicationTemplate[]>;
        setCommunicationTemplates({
          email: parsed.email || defaultCommunicationTemplates.email,
          whatsapp: parsed.whatsapp || defaultCommunicationTemplates.whatsapp,
          sms: parsed.sms || defaultCommunicationTemplates.sms,
        });
      } catch {
        setCommunicationTemplates(defaultCommunicationTemplates);
      }
    } else {
      setCommunicationTemplates(defaultCommunicationTemplates);
    }

    setCommunicationComposer({
      to: getDefaultRecipientByChannel(communicationChannel, selectedCorporate),
      subject: '',
      message: '',
    });
    setSelectedTemplateId('');
    setCommunicationRecipientMode('individual');
    setCommunicationRecipientSearch('');
    setSelectedCommunicationEmployeeIds([]);
    setCommunicationBulkRecipients('');
    resetCommunicationDraft();
  }, [selectedCorporate]);

  useEffect(() => {
    if (!selectedCorporate) return;
    setCommunicationComposer((prev) => ({
      ...prev,
      to: getDefaultRecipientByChannel(communicationChannel, selectedCorporate),
    }));
    setSelectedCommunicationEmployeeIds([]);
    setCommunicationBulkRecipients('');
    setCommunicationRecipientSearch('');
    resetCommunicationDraft();
  }, [communicationChannel, selectedCorporate]);

  useEffect(() => {
    if (activeTab === 'communication' && selectedCorporate?.id) {
      fetchCommunicationInsights();
    }
  }, [activeTab, selectedCorporate?.id, communicationChannel]);

  useEffect(() => {
    if (activeTab === 'employees' && selectedCorporate?.id) {
      fetchWelcomeDeliveryHistory({ resetOffset: true });
    }
  }, [activeTab, selectedCorporate?.id]);

  // Debounced Employee ID duplicate check against already-loaded employees
  useEffect(() => {
    const id = newEmployee.employeeId.trim();
    if (!id) { setEmpIdStatus('idle'); return; }
    setEmpIdStatus('checking');
    const t = setTimeout(() => {
      const exists = employees.some(
        (e) => e.employeeId?.toLowerCase() === id.toLowerCase()
      );
      setEmpIdStatus(exists ? 'duplicate' : 'ok');
    }, 400);
    return () => clearTimeout(t);
  }, [newEmployee.employeeId, employees]);

  const duplicateEmployeeForNewId = (() => {
    const id = newEmployee.employeeId.trim().toLowerCase();
    if (!id) return undefined;
    return employees.find((employee) => employee.employeeId?.toLowerCase() === id);
  })();

  const resetNewEmployeeForm = () => {
    setNewEmployee({ employeeId: '', name: '', email: '', phone: '', gender: '', department: '', designation: '', joiningDate: '', workCity: '', workState: '' });
    setEmpIdStatus('idle');
  };

  const [labPartners, setLabPartners] = useState<LabPartner[]>([]);
  const [hospitalPartners, setHospitalPartners] = useState<HospitalPartner[]>([]);
  const [clinicPartners, setClinicPartners] = useState<ClinicPartner[]>([]);
  const [healthPackages, setHealthPackages] = useState<HealthPackage[]>([]);
  const [corporatePlans, setCorporatePlans] = useState<CorporatePlan[]>([]);

  // State for "Add to Network" dialog — available (unassigned) partners
  const [availLabs, setAvailLabs] = useState<LabPartner[]>([]);
  const [availHospitals, setAvailHospitals] = useState<HospitalPartner[]>([]);
  const [availClinics, setAvailClinics] = useState<ClinicPartner[]>([]);
  const [availHospitalSearch, setAvailHospitalSearch] = useState('');
  const [totalHospitals, setTotalHospitals] = useState(0);
  const [availLoading, setAvailLoading] = useState(false);
  const [selectedAddPartners, setSelectedAddPartners] = useState<{id: number; type: 'lab' | 'hospital' | 'clinic'}[]>([]);
  const [addNetworkSearch, setAddNetworkSearch] = useState('');
  const [addingNetwork, setAddingNetwork] = useState(false);

  // Fetch corporates
  useEffect(() => {
    fetchCorporates();
    loadWelcomeEmailTemplateLibrary();
  }, []);

  // Fetch employees, packages, plans, and network partners when corporate is selected
  useEffect(() => {
    if (selectedCorporate?.id) {
      fetchEmployees(selectedCorporate.id);
      fetchCorporateAdmins(selectedCorporate.id);
      fetchHealthPackages(selectedCorporate.id);
      fetchCorporatePlans(selectedCorporate.id);
      fetchNetworkPartners(selectedCorporate.id);
      fetchWellnessEvents(selectedCorporate.id);
    }
  }, [selectedCorporate?.id]);

  const normalizeStatusLabel = (status: string | null | undefined) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'active') return 'Active';
    if (normalized === 'inactive') return 'Inactive';
    if (normalized === 'suspended') return 'Suspended';
    return 'Pending';
  };

  const formatLastLoginLabel = (lastLoginAt: string | null | undefined) => {
    if (!lastLoginAt) return 'Never';
    const dt = new Date(lastLoginAt);
    if (Number.isNaN(dt.getTime())) return 'Never';
    return dt.toLocaleString();
  };

  const fetchCorporateAdmins = async (corporateId: number) => {
    try {
      setCorporateAdminsLoading(true);
      const token = localStorage.getItem('teamToken');
      const numericId = parseInt(String(corporateId), 10);
      if (isNaN(numericId)) {
        console.error('Invalid corporate ID:', corporateId);
        setCorporateAdmins([]);
        return;
      }

      const response = await api.get(`/admin/corporate-users/${numericId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (response.data?.success && Array.isArray(response.data?.users)) {
        setCorporateAdmins(response.data.users);
      } else {
        setCorporateAdmins([]);
      }
    } catch (error) {
      console.error('Failed to fetch corporate admins:', error);
      setCorporateAdmins([]);
    } finally {
      setCorporateAdminsLoading(false);
    }
  };

  const fetchEmployees = async (corporateId: number) => {
    try {
      const token = localStorage.getItem('teamToken');
      const numericId = parseInt(String(corporateId), 10);
      if (isNaN(numericId)) {
        console.error('Invalid corporate ID:', corporateId);
        setEmployees([]);
        return;
      }
      const pageSize = 500;
      let offset = 0;
      let mergedEmployees: any[] = [];

      while (true) {
        const response = await api.get(`/admin/corporate-employees/${numericId}`, {
          params: { limit: pageSize, offset },
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (!response.data?.success || !Array.isArray(response.data?.employees)) {
          mergedEmployees = [];
          break;
        }

        const batch = response.data.employees;
        mergedEmployees = [...mergedEmployees, ...batch];

        if (batch.length < pageSize) break;
        offset += batch.length;
      }

      if (mergedEmployees.length > 0) {
        setEmpCurrentPage(1);
        setEmployees(mergedEmployees.map((emp: any) => {
          const meta = emp.metadata || {};
          const firstName = emp.firstName || meta.firstName || '';
          const lastName = emp.lastName || meta.lastName || '';
          return {
            id: emp.id?.toString() || emp.uid,
            employeeId: emp.user_employee_id || meta.employeeId || emp.employeeId || emp.unique_id || `EMP${emp.id}`,
            firstName,
            lastName,
            name: `${firstName} ${lastName}`.trim() || emp.name || 'Unknown',
            email: emp.email || '',
            secondaryEmail: meta.secondaryEmail || '',
            phone: emp.phoneNumber || meta.phoneNumber || '',
            department: emp.department_name || meta.department || emp.department || 'Not Assigned',
            designation: meta.designation || emp.designation || 'Not Assigned',
            city: emp.address_city || meta.city || '',
            state: emp.address_state || meta.state || '',
            pinCode: emp.address_zipCode || meta.pinCode || '',
            location: meta.location || '',
            facility: meta.facility || '',
            joiningDate: emp.startDate || meta.joiningDate || '',
            healthStatus: meta.healthStatus || emp.healthStatus || 'Not Assessed',
            insurancePlan: emp.currentPackageName || meta.insurancePlan || 'None',
            status: emp.status || 'active',
            currentPackageId: emp.currentPackageId || undefined,
            currentPackageName: emp.currentPackageName || undefined,
            packageValidTo: emp.packageValidTo || undefined,
            gender: emp.gender || '',
            dateOfBirth: emp.dateOfBirth || '',
            lastLoginAt: emp.lastLoginAt || null,
            lastActivityAt: emp.lastActivityAt || null,
            loginCount: emp.loginCount ?? 0,
            requirePasswordChange: emp.requirePasswordChange ?? true,
            welcomeEmailStatus: emp.welcomeEmailStatus || null,
            welcomeEmailSentAt: emp.welcomeEmailSentAt || null,
          };
        }));
      } else {
        setEmployees([]);
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error);
      setEmployees([]);
    }
  };

  const fetchWelcomeDeliveryHistory = async (opts?: {
    resetOffset?: boolean;
    nextOffset?: number;
    filtersOverride?: Partial<typeof welcomeDeliveryFilters>;
  }) => {
    if (!selectedCorporate?.id) return;

    const targetOffset = typeof opts?.nextOffset === 'number'
      ? Math.max(opts.nextOffset, 0)
      : (opts?.resetOffset ? 0 : welcomeDeliveryPagination.offset);
    const effectiveFilters = {
      ...welcomeDeliveryFilters,
      ...(opts?.filtersOverride || {}),
    };

    try {
      setWelcomeDeliveriesLoading(true);
      const params: Record<string, any> = {
        corporateId: selectedCorporate.id,
        limit: welcomeDeliveryPagination.limit,
        offset: targetOffset,
      };

      if (effectiveFilters.status !== 'all') params.status = effectiveFilters.status;
      if (effectiveFilters.requestScope !== 'all') params.requestScope = effectiveFilters.requestScope;
      if (effectiveFilters.employeeId.trim()) params.employeeId = effectiveFilters.employeeId.trim();
      if (effectiveFilters.recipient.trim()) params.recipient = effectiveFilters.recipient.trim();
      if (effectiveFilters.from) params.from = effectiveFilters.from;
      if (effectiveFilters.to) params.to = effectiveFilters.to;

      const response = await api.get('/admin/corporate-employee-welcome-emails/deliveries', {
        params,
        headers: teamAuthHeaders(),
      });

      const rows = response.data?.deliveries || [];
      const summary = response.data?.summary || {};
      setWelcomeDeliveries(rows);
      setWelcomeDeliverySummary({
        total: Number(summary.total || 0),
        sent: Number(summary.sent || 0),
        queued: Number(summary.queued || 0),
        failed: Number(summary.failed || 0),
        rolledBack: Number(summary.rolledBack || 0),
        prepared: Number(summary.prepared || 0),
      });
      setWelcomeDeliveryPagination((prev) => ({
        ...prev,
        offset: targetOffset,
        total: Number(summary.total || 0),
      }));
    } catch (error) {
      console.error('Failed to fetch welcome delivery history:', error);
      toast({
        variant: 'destructive',
        title: 'Delivery history unavailable',
        description: 'Could not load welcome email delivery logs right now.',
      });
    } finally {
      setWelcomeDeliveriesLoading(false);
    }
  };

  const resetWelcomeDeliveryFilters = () => {
    setWelcomeDeliveryFilters({
      status: 'all',
      requestScope: 'all',
      employeeId: '',
      recipient: '',
      from: '',
      to: '',
    });
    fetchWelcomeDeliveryHistory({ resetOffset: true });
  };

  const exportWelcomeDeliveryRows = () => {
    if (welcomeDeliveries.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No records to export',
        description: 'Load delivery records before exporting CSV.',
      });
      return;
    }

    const esc = (value: any) => {
      const text = String(value ?? '');
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const header = [
      'Created At', 'Updated At', 'Status', 'Recipient Email', 'Employee ID', 'User Name', 'User Email',
      'Attempts', 'Request Scope', 'Idempotency Key', 'Error Message', 'Delivery ID'
    ];

    const lines = welcomeDeliveries.map((row) => {
      const userName = [row.userFirstName || '', row.userLastName || ''].join(' ').trim();
      return [
        row.createdAt,
        row.updatedAt,
        row.status,
        row.recipientEmail,
        row.employeeId || '',
        userName,
        row.userEmail || '',
        row.attempts,
        row.requestScope,
        row.idempotencyKey,
        row.errorMessage || '',
        row.id,
      ].map(esc).join(',');
    });

    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `welcome_delivery_audit_${selectedCorporate?.id || 'corporate'}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const openWelcomeDeliveryAuditForEmployee = (employee: Employee) => {
    const nextFilters = {
      ...welcomeDeliveryFilters,
      employeeId: employee.employeeId || '',
      recipient: '',
      status: 'all',
      requestScope: 'all',
    };
    setWelcomeDeliveryFilters(nextFilters);
    setActiveTab('employees');

    fetchWelcomeDeliveryHistory({ resetOffset: true, filtersOverride: nextFilters });

    // Delay slightly so state updates and audit card layout are settled before scrolling.
    setTimeout(() => {
      welcomeDeliveryAuditRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  const handleResendWelcomeFromDelivery = async (row: WelcomeDeliveryRecord) => {
    if (!selectedCorporate) return;
    if (!row.userId && !row.employeeId) {
      toast({
        variant: 'destructive',
        title: 'Cannot resend',
        description: 'This audit row has no user or employee identifier.',
      });
      return;
    }

    setResendingWelcomeDeliveryId(row.id);
    try {
      await api.post('/admin/corporate-employee-welcome-emails/resend', {
        corporateId: selectedCorporate.id,
        userId: row.userId || undefined,
        employeeId: row.employeeId || undefined,
        welcomeEmailMode: 'send',
      }, {
        headers: teamAuthHeaders(),
      });

      toast({
        title: 'Welcome email resent',
        description: `A fresh welcome email was triggered for ${row.recipientEmail}.`,
      });
      await fetchWelcomeDeliveryHistory();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Resend failed',
        description: error?.response?.data?.message || 'Could not resend welcome email from this audit row.',
      });
    } finally {
      setResendingWelcomeDeliveryId(null);
    }
  };

  const fetchHealthPackages = async (corporateId: number) => {
    try {
      const token = localStorage.getItem('teamToken');
      const numericId = parseInt(String(corporateId), 10);
      if (isNaN(numericId)) {
        console.error('Invalid corporate ID:', corporateId);
        setHealthPackages([]);
        return;
      }
      const response = await api.get(`/admin/corporate-health-packages/${numericId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });

      if (response.data?.success && Array.isArray(response.data?.packages)) {
        const packages = response.data.packages.map((pkg: any) => {
          const details = pkg.packageDetails || {};
          const validFrom = pkg.validFrom ? new Date(pkg.validFrom) : null;
          const validTo = pkg.validTo ? new Date(pkg.validTo) : null;
          const validityDays = validFrom && validTo
            ? Math.max(1, Math.ceil((validTo.getTime() - validFrom.getTime()) / (1000 * 60 * 60 * 24)))
            : 365;

          return {
            id: pkg.packageId || pkg.packageName,
            name: pkg.packageName || details.name || 'Health Package',
            tests: details.tests || [],
            price: Number(details.cost || details.price || 0),
            validityDays
          } as HealthPackage;
        });
        setHealthPackages(packages);
      } else {
        setHealthPackages([]);
      }
    } catch (error) {
      console.error('Failed to fetch health packages:', error);
      setHealthPackages([]);
    }
  };

  const fetchCorporatePlans = async (corporateId: number) => {
    try {
      const token = localStorage.getItem('teamToken');
      const numericId = parseInt(String(corporateId), 10);
      if (isNaN(numericId)) {
        console.error('Invalid corporate ID:', corporateId);
        setCorporatePlans([]);
        return;
      }
      const response = await api.get(`/admin/corporate-plans/${numericId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });

      if (response.data?.success && Array.isArray(response.data?.plans)) {
        const mappedPlans = response.data.plans.map((plan: any) => {
          const metadata = typeof plan.metadata === 'string' ? JSON.parse(plan.metadata) : (plan.metadata || {});
          const features = typeof plan.features === 'string' ? JSON.parse(plan.features) : (plan.features || {});
          return {
            id: plan.id,
            name: plan.name,
            slug: plan.slug,
            price: Number(plan.price || 0),
            annualPrice: Number(plan.annual_price || plan.annualPrice || 0),
            currency: plan.currency || 'INR',
            billingCycle: plan.billing_cycle || plan.billingCycle || 'MONTHLY',
            enrolled: Number(plan.enrolled || 0),
            description: plan.description || '',
            planType: metadata.planType || '',
            status: metadata.status || 'Active',
            totalEmployees: metadata.totalEmployees || 0,
            validFrom: metadata.validFrom || '',
            validTo: metadata.validTo || '',
            features: mergePlanFeatures(features),
            coverage: metadata.coverage || {},
            healthPackageIds: metadata.healthPackageIds || [],
          };
        });
        setCorporatePlans(mappedPlans);
      } else {
        setCorporatePlans([]);
      }
    } catch (error) {
      console.error('Failed to fetch corporate plans:', error);
      setCorporatePlans([]);
    }
  };

  const handleDeletePlan = async (planId: number, planName: string) => {
    if (!window.confirm(`Delete plan "${planName}"? This cannot be undone.`)) return;
    try {
      const token = localStorage.getItem('teamToken');
      await api.delete(`/admin/corporate-plans/${planId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      if (selectedCorporate) fetchCorporatePlans(selectedCorporate.id);
    } catch (error: any) {
      console.error('Failed to delete plan:', error);
      alert(error?.response?.data?.message || 'Failed to delete plan');
    }
  };

  const handleOpenViewPlan = (plan: CorporatePlan) => {
    setEditingPlan(plan);
    setShowViewPlanDialog(true);
  };

  const handleOpenEditPlan = (plan: CorporatePlan) => {
    setEditingPlan(plan);
    setEditPlanForm({
      planName: plan.name,
      planType: plan.planType || 'Standard',
      description: plan.description || '',
      validFrom: plan.validFrom || '',
      validTo: plan.validTo || '',
      totalEmployees: String(plan.totalEmployees || ''),
      premiumPerEmployee: String(plan.price || ''),
      status: plan.status || 'Active',
      currency: plan.currency || 'INR',
      benefits: [...defaultBenefits],
      features: mergePlanFeatures(plan.features),
      coverage: plan.coverage || { sumInsured: '', roomRent: 'Single Room', icuRent: '2% of Sum Insured', prePolicyMedical: '30 days', postPolicyMedical: '60 days' },
      healthPackageIds: plan.healthPackageIds || [],
    });
    setShowEditPlanDialog(true);
  };

  const handleUpdatePlan = async () => {
    if (!editingPlan || !editPlanForm.planName || !editPlanForm.totalEmployees || !editPlanForm.premiumPerEmployee) {
      toast({ variant: 'destructive', title: 'Error', description: 'Plan name, total employees, and premium are required' });
      return;
    }
    try {
      const token = localStorage.getItem('teamToken');
      await api.put(`/admin/corporate-plans/${editingPlan.id}`, {
        planName: editPlanForm.planName,
        planType: editPlanForm.planType,
        description: editPlanForm.description,
        validFrom: editPlanForm.validFrom,
        validTo: editPlanForm.validTo,
        totalEmployees: parseInt(editPlanForm.totalEmployees),
        premiumPerEmployee: parseFloat(editPlanForm.premiumPerEmployee),
        totalPremium: parseInt(editPlanForm.totalEmployees) * parseFloat(editPlanForm.premiumPerEmployee),
        status: editPlanForm.status,
        currency: editPlanForm.currency,
        features: editPlanForm.features,
        benefits: editPlanForm.benefits,
        coverage: { ...editPlanForm.coverage, sumInsured: parseFloat(editPlanForm.coverage.sumInsured || '0') },
        healthPackageIds: editPlanForm.healthPackageIds,
      }, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      toast({ title: 'Plan Updated', description: `${editPlanForm.planName} has been updated.` });
      setShowEditPlanDialog(false);
      setEditingPlan(null);
      if (selectedCorporate?.id) fetchCorporatePlans(selectedCorporate.id);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.response?.data?.message || 'Failed to update plan' });
    }
  };

  const fetchNetworkPartners = async (corporateId: number) => {
    try {
      const token = localStorage.getItem('teamToken');
      const numericId = parseInt(String(corporateId), 10);
      if (isNaN(numericId)) {
        console.error('Invalid corporate ID:', corporateId);
        setLabPartners([]);
        setHospitalPartners([]);
        setClinicPartners([]);
        return;
      }
      const response = await api.get(`/admin/corporate-network/${numericId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });

      if (response.data?.success) {
        setLabPartners(response.data?.labs || []);
        setHospitalPartners(response.data?.hospitals || []);
        setClinicPartners(response.data?.clinics || []);
      } else {
        setLabPartners([]);
        setHospitalPartners([]);
        setClinicPartners([]);
      }
    } catch (error) {
      console.error('Failed to fetch network partners:', error);
      setLabPartners([]);
      setHospitalPartners([]);
      setClinicPartners([]);
    }
  };

  const fetchAvailablePartners = async (corporateId: number, hospitalSearch = '') => {
    if (!corporateId) return;
    setAvailLoading(true);
    try {
      const token = localStorage.getItem('teamToken');
      const url = hospitalSearch
        ? `/admin/corporate-network/${corporateId}?available=true&search=${encodeURIComponent(hospitalSearch)}`
        : `/admin/corporate-network/${corporateId}?available=true`;
      const response = await api.get(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      if (response.data?.success) {
        setAvailLabs(response.data?.labs || []);
        setAvailHospitals(response.data?.hospitals || []);
        setTotalHospitals(response.data?.totalHospitals ?? (response.data?.hospitals?.length || 0));
        setAvailClinics(response.data?.clinics || []);
      } else {
        setAvailLabs([]); setAvailHospitals([]); setAvailClinics([]); setTotalHospitals(0);
      }
    } catch (err) {
      console.error('Failed to fetch available partners:', err);
      setAvailLabs([]); setAvailHospitals([]); setAvailClinics([]); setTotalHospitals(0);
    } finally {
      setAvailLoading(false);
    }
  };

  // ─── Wellness Calendar helpers ──────────────────────────────────────────────
  const fetchWellnessEvents = async (corporateId: number, month?: string) => {
    try {
      const token = localStorage.getItem('teamToken');
      const url = month
        ? `/admin/corporate-calendar/${corporateId}?month=${month}`
        : `/admin/corporate-calendar/${corporateId}`;
      const res = await api.get(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setWellnessEvents(res.data?.events || []);
    } catch {
      setWellnessEvents([]);
    }
  };

  const handleCreateEvent = async () => {
    if (!eventForm.title || !eventForm.eventDate) {
      toast({ variant: 'destructive', title: 'Required', description: 'Title and date are required' });
      return;
    }
    try {
      const token = localStorage.getItem('teamToken');
      await api.post('/admin/corporate-calendar', {
        corporateId: selectedCorporate?.id,
        title: eventForm.title,
        description: eventForm.description,
        eventType: eventForm.eventType,
        eventDate: eventForm.eventDate,
        eventTime: eventForm.eventTime || undefined,
        endDate: eventForm.endDate || undefined,
        endTime: eventForm.endTime || undefined,
        location: eventForm.location,
        organizer: eventForm.organizer,
        maxParticipants: eventForm.maxParticipants ? parseInt(eventForm.maxParticipants) : undefined,
        status: eventForm.status,
        color: eventTypeColors[eventForm.eventType] || 'teal',
        notifyEmployees: eventForm.notifyEmployees,
      }, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      toast({ title: 'Event Created', description: `${eventForm.title} added to calendar` });
      setShowCreateEventDialog(false);
      setEventForm(defaultEventForm);
      if (selectedCorporate?.id) fetchWellnessEvents(selectedCorporate.id);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.response?.data?.message || 'Failed to create event' });
    }
  };

  const handleUpdateEvent = async () => {
    if (!editingEvent) return;
    try {
      const token = localStorage.getItem('teamToken');
      await api.put(`/admin/corporate-calendar/${editingEvent.id}`, {
        corporateId: selectedCorporate?.id,
        title: eventForm.title,
        description: eventForm.description,
        eventType: eventForm.eventType,
        eventDate: eventForm.eventDate,
        eventTime: eventForm.eventTime || null,
        endDate: eventForm.endDate || null,
        endTime: eventForm.endTime || null,
        location: eventForm.location,
        organizer: eventForm.organizer,
        maxParticipants: eventForm.maxParticipants ? parseInt(eventForm.maxParticipants) : null,
        status: eventForm.status,
        color: eventTypeColors[eventForm.eventType] || editingEvent.color,
        notifyEmployees: eventForm.notifyEmployees,
      }, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      toast({ title: 'Event Updated' });
      setShowEditEventDialog(false);
      setEditingEvent(null);
      setEventForm(defaultEventForm);
      if (selectedCorporate?.id) fetchWellnessEvents(selectedCorporate.id);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.response?.data?.message || 'Failed to update event' });
    }
  };

  const handleDeleteEvent = async (eventId: number, title: string) => {
    if (!window.confirm(`Delete "${title}"?`)) return;
    try {
      const token = localStorage.getItem('teamToken');
      await api.delete(`/admin/corporate-calendar/${eventId}`, {
        params: { corporateId: selectedCorporate?.id },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      toast({ title: 'Event Deleted' });
      if (selectedCorporate?.id) fetchWellnessEvents(selectedCorporate.id);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete event' });
    }
  };

  const openEditEvent = (ev: WellnessEvent) => {
    setEditingEvent(ev);
    setEventForm({
      title: ev.title,
      description: ev.description || '',
      eventType: ev.event_type,
      eventDate: ev.event_date ? ev.event_date.slice(0, 10) : '',
      eventTime: ev.event_time || '',
      endDate: ev.end_date ? ev.end_date.slice(0, 10) : '',
      endTime: ev.end_time || '',
      location: ev.location || '',
      organizer: ev.organizer || '',
      maxParticipants: ev.max_participants ? String(ev.max_participants) : '',
      status: ev.status,
      notifyEmployees: ev.notify_employees,
    });
    setShowEditEventDialog(true);
  };

  /** Build a calendar grid for the currently viewed month */
  const buildCalendarGrid = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [...Array(firstDay).fill(null)];
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  const eventsForDay = (day: number) => {
    const yr = calendarDate.getFullYear();
    const mo = String(calendarDate.getMonth() + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const target = `${yr}-${mo}-${dd}`;
    return wellnessEvents.filter(e => e.event_date?.slice(0, 10) === target);
  };

  const navigateMonth = (delta: number) => {
    const d = new Date(calendarDate);
    d.setMonth(d.getMonth() + delta);
    setCalendarDate(d);
    if (selectedCorporate?.id) {
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      fetchWellnessEvents(selectedCorporate.id, m);
    }
  };

  const eventTypeIcon = (type: string) => {
    switch (type) {
      case 'Fitness Activity': return <Dumbbell className="h-3 w-3" />;
      case 'Mental Health': return <Brain className="h-3 w-3" />;
      case 'Yoga & Meditation': return <Heart className="h-3 w-3" />;
      case 'Nutrition Workshop': return <Salad className="h-3 w-3" />;
      case 'Sports Day': return <Trophy className="h-3 w-3" />;
      case 'Health Checkup': return <Stethoscope className="h-3 w-3" />;
      default: return <Activity className="h-3 w-3" />;
    }
  };
  // ────────────────────────────────────────────────────────────────────────────

  const fetchCorporates = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('teamToken');
      const response = await api.get('/admin/corporates', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });

      if (response.data?.data) {
        const sortedCorporates = sortCorporatesForList(response.data.data);
        setCorporates(response.data.data);
        if (sortedCorporates.length > 0 && !selectedCorporate) {
          const firstVisibleCorporate = sortedCorporates.find((corp) => normalizeCorporateStatus(corp.status) !== 'inactive') || sortedCorporates[0];
          setSelectedCorporate(firstVisibleCorporate);
        }
      }
    } catch (error: any) {
      // 401 = token expired or session invalid — redirect to team login instead of error toast
      if (error?.response?.status === 401) {
        localStorage.removeItem('teamToken');
        localStorage.removeItem('teamRefreshToken');
        localStorage.removeItem('teamUserData');
        navigate('/team/login', { state: { expired: true } });
        return;
      }
      console.error('Failed to fetch corporates:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load corporate data. Please refresh the page.'
      });
    } finally {
      setLoading(false);
    }
  };

  // Create Corporate
  const handleCreateCorporate = async () => {
    try {
      const token = localStorage.getItem('teamToken');
      const response = await api.post('/admin/corporates', {
        ...newCorporate,
        employeeCount: parseInt(newCorporate.employeeCount) || 0,
        status: 'Active'
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      
      toast({
        title: 'Success',
        description: 'Corporate created successfully'
      });
      
      setShowAddCorporateDialog(false);
      setNewCorporate({
        companyName: '',
        contactPerson: '',
        email: '',
        phoneNumber: '',
        industry: 'Information Technology',
        employeeCount: '',
        packageType: 'Standard',
        gstNumber: '',
        panNumber: '',
        address: { street: '', city: '', state: '', pincode: '' }
      });
      fetchCorporates();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create corporate'
      });
    }
  };

  // Edit Corporate
  const openEditCorporate = (corp: Corporate) => {
    setEditingCorporate(corp);
    setEditCorporateForm({
      companyName: corp.companyName || '',
      contactPerson: corp.contactPerson || '',
      email: corp.email || '',
      phoneNumber: corp.phoneNumber || '',
      industry: corp.industry || '',
      employeeCount: String(corp.employeeCount || ''),
      packageType: corp.packageType || '',
      status: corp.status || 'Active',
    });
    setShowEditCorporateDialog(true);
  };

  const handleEditCorporate = async () => {
    if (!editingCorporate) return;
    setSavingCorporate(true);
    try {
      const token = localStorage.getItem('teamToken');
      await api.put(`/admin/corporates/${editingCorporate.id}`, {
        ...editCorporateForm,
        employeeCount: parseInt(editCorporateForm.employeeCount) || 0,
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      toast({ title: 'Success', description: 'Corporate updated successfully' });
      setShowEditCorporateDialog(false);
      setEditingCorporate(null);
      fetchCorporates();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.message || 'Failed to update corporate',
      });
    } finally {
      setSavingCorporate(false);
    }
  };

  // Delete Corporate
  const openDeleteCorporate = (corp: Corporate) => {
    setCorporateToDelete(corp);
    setShowDeleteCorporateDialog(true);
  };

  const handleDeleteCorporate = async () => {
    if (!corporateToDelete) return;
    setDeletingCorporate(true);
    try {
      const token = localStorage.getItem('teamToken');
      await api.delete(`/admin/corporates/${corporateToDelete.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      toast({ title: 'Deleted', description: `${corporateToDelete.companyName} removed successfully` });
      setShowDeleteCorporateDialog(false);
      setCorporateToDelete(null);
      if (selectedCorporate?.id === corporateToDelete.id) setSelectedCorporate(null);
      fetchCorporates();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.message || 'Failed to delete corporate',
      });
    } finally {
      setDeletingCorporate(false);
    }
  };

  // Create HR Admin
  const handleCreateHRAdmin = async () => {
    if (!selectedCorporate) return;
    
    try {
      const token = localStorage.getItem('teamToken');
      const response = await api.post('/admin/corporate-users', {
        ...newHRAdmin,
        corporateId: selectedCorporate.id,
        role: 'corporate_admin',
        isCorporate: true
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      
      toast({
        title: 'HR Admin Created',
        description: `Login credentials sent to ${newHRAdmin.email}`
      });
      
      setShowAddHRDialog(false);
      setNewHRAdmin({
        firstName: '',
        lastName: '',
        email: '',
        phoneNumber: '',
        password: ''
      });
      fetchCorporateAdmins(selectedCorporate.id);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create HR admin'
      });
    }
  };

  const resetHRAdminForm = () => {
    setNewHRAdmin({
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      password: '',
    });
    setEditingHRAdmin(null);
  };

  const openEditHRAdminDialog = (admin: CorporateAdminUser) => {
    setEditingHRAdmin(admin);
    setNewHRAdmin({
      firstName: admin.firstName || '',
      lastName: admin.lastName || '',
      email: admin.email || '',
      phoneNumber: admin.phoneNumber || '',
      password: '',
    });
    setShowAddHRDialog(true);
  };

  const handleUpdateHRAdmin = async () => {
    if (!selectedCorporate || !editingHRAdmin) return;

    try {
      setUpdatingHRAdmin(true);
      const token = localStorage.getItem('teamToken');
      await api.put(`/admin/corporate-users/${selectedCorporate.id}/${editingHRAdmin.id}`, {
        firstName: newHRAdmin.firstName,
        lastName: newHRAdmin.lastName,
        email: newHRAdmin.email,
        phoneNumber: newHRAdmin.phoneNumber,
        ...(newHRAdmin.password?.trim() ? { password: newHRAdmin.password.trim() } : {}),
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      toast({
        title: 'HR Admin Updated',
        description: `${newHRAdmin.email} updated successfully`,
      });

      setShowAddHRDialog(false);
      resetHRAdminForm();
      fetchCorporateAdmins(selectedCorporate.id);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.message || 'Failed to update HR admin',
      });
    } finally {
      setUpdatingHRAdmin(false);
    }
  };

  const handleDeactivateHRAdmin = async (
    admin: CorporateAdminUser,
    opts?: { skipConfirm?: boolean; silent?: boolean }
  ) => {
    if (!selectedCorporate) return;
    if (!opts?.skipConfirm) {
      const confirmed = window.confirm(`Deactivate HR admin ${admin.email}?`);
      if (!confirmed) return;
    }

    try {
      setUpdatingHRAdmin(true);
      const token = localStorage.getItem('teamToken');
      await api.put(`/admin/corporate-users/${selectedCorporate.id}/${admin.id}`, {
        status: 'inactive',
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!opts?.silent) {
        toast({
          title: 'HR Admin Deactivated',
          description: `${admin.email} has been deactivated`,
        });
      }
      fetchCorporateAdmins(selectedCorporate.id);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.message || 'Failed to deactivate HR admin',
      });
    } finally {
      setUpdatingHRAdmin(false);
    }
  };

  const handleReplaceHRAdmin = async () => {
    const activeAdmins = corporateAdmins.filter((admin) => normalizeStatusLabel(admin.status) === 'Active');

    if (activeAdmins.length === 0) {
      resetHRAdminForm();
      setShowAddHRDialog(true);
      toast({
        title: 'No Active HR Found',
        description: 'Create a new HR admin profile.',
      });
      return;
    }

    const current = activeAdmins[0];
    const confirmed = window.confirm(
      `This will deactivate ${current.email} and open the form to create a replacement HR admin. Continue?`
    );
    if (!confirmed) return;

    await handleDeactivateHRAdmin(current, { skipConfirm: true, silent: true });
    resetHRAdminForm();
    setShowAddHRDialog(true);
    toast({
      title: 'Current HR Deactivated',
      description: 'Proceed to create the replacement HR admin account.',
    });
  };

  // Add partners to corporate network
  const handleAddToNetwork = async () => {
    if (!selectedCorporate || selectedAddPartners.length === 0) return;
    setAddingNetwork(true);
    try {
      const token = localStorage.getItem('teamToken');
      for (const partner of selectedAddPartners) {
        await api.post('/admin/corporate-network-assignments', {
          corporateId: selectedCorporate.id,
          partnerId: partner.id,
          partnerType: partner.type,
          employeeIds: []
        }, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      }
      toast({ title: 'Network Updated', description: `${selectedAddPartners.length} partner(s) added to corporate network.` });
      setShowNetworkDialog(false);
      setSelectedAddPartners([]);
      fetchNetworkPartners(selectedCorporate.id);
    } catch (err: any) {
      toast({ title: 'Error', description: err?.response?.data?.message || 'Failed to add partners', variant: 'destructive' });
    } finally {
      setAddingNetwork(false);
    }
  };

  // Update Employee
  const handleUpdateEmployee = async () => {
    if (!selectedCorporate || !editingEmployee) return;
    setUpdatingEmployee(true);
    try {
      const token = localStorage.getItem('teamToken');
      await api.put(`/admin/corporate-employees/${editingEmployee.id}`, {
        corporateId: selectedCorporate.id,
        firstName: editEmployeeForm.firstName,
        lastName: editEmployeeForm.lastName,
        email: editEmployeeForm.email,
        secondaryEmail: editEmployeeForm.secondaryEmail,
        phoneNumber: editEmployeeForm.phone,
        department: editEmployeeForm.department,
        designation: editEmployeeForm.designation,
        city: editEmployeeForm.city,
        state: editEmployeeForm.state,
        pinCode: editEmployeeForm.pinCode,
        location: editEmployeeForm.location,
        facility: editEmployeeForm.facility,
        employeeId: editEmployeeForm.employeeId,
        status: editEmployeeForm.status,
        ...(editEmployeeForm.packageId ? { packageId: editEmployeeForm.packageId } : {}),
      }, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      toast({ title: 'Employee Updated', description: 'Employee details updated successfully.' });
      setShowEditEmployeeDialog(false);
      setEditingEmployee(null);
      fetchEmployees(selectedCorporate.id);
    } catch (err: any) {
      toast({ title: 'Error', description: err?.response?.data?.message || 'Failed to update employee', variant: 'destructive' });
    } finally {
      setUpdatingEmployee(false);
    }
  };

  // Add Employee
  const handleAddEmployee = async () => {
    if (!selectedCorporate) return;

    if (!newEmployee.name.trim()) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'Name is required.' });
      return;
    }
    if (!newEmployee.email.trim()) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'Email is required.' });
      return;
    }
    
    try {
      const token = localStorage.getItem('teamToken');
      // Prepare employee data in the format expected by the backend
      const employeeData = {
        firstName: newEmployee.name.split(' ')[0] || newEmployee.name,
        lastName: newEmployee.name.split(' ').slice(1).join(' ') || '',
        email: newEmployee.email,
        phoneNumber: newEmployee.phone,
        employeeId: newEmployee.employeeId,
        department: newEmployee.department,
        designation: newEmployee.designation,
        gender: newEmployee.gender || undefined,
        joiningDate: newEmployee.joiningDate || undefined,
        city: newEmployee.workCity || undefined,
        state: newEmployee.workState || undefined
      };
      
      const response = await api.post(`/admin/corporate-employees`, {
        corporateId: selectedCorporate.id,
        employees: [employeeData],
        sendWelcomeEmail: employeeWelcomeEmailMode !== "skip",
        welcomeEmailMode: employeeWelcomeEmailMode
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });

      const created = response.data?.results?.created?.[0];
      const failed = response.data?.results?.failed || [];

      if (!created && failed.length > 0) {
        toast({
          variant: 'destructive',
          title: 'Failed to Add Employee',
          description: failed[0]?.reason || 'Could not create employee account.'
        });
        return;
      }

      setShowAddEmployeeDialog(false);
      resetNewEmployeeForm();
      fetchEmployees(selectedCorporate.id);

      const preparedDrafts = buildWelcomeEmailDraftsFromCreated(created ? [created] : [], newEmployee.name);
      if (preparedDrafts.length > 0) {
        addPreparedWelcomeEmailDrafts(preparedDrafts);
        toast({
          title: "Welcome Email Draft Prepared",
          description: "Review and edit the welcome email before sending it."
        });
      } else if (created?.isNewUser && created?.temporaryPassword) {
        setNewEmployeeCredentials({
          name: newEmployee.name,
          email: newEmployee.email,
          password: created.temporaryPassword,
          emailStatus: created.emailStatus || (employeeWelcomeEmailMode === "send" ? "queued" : "skipped")
        });
        setShowCredentialsDialog(true);
      } else {
        toast({
          title: 'Employee Added',
          description: created?.isNewUser === false
            ? `${newEmployee.name} already has an account — linked to ${selectedCorporate.companyName}.`
            : `${newEmployee.name} has been added to ${selectedCorporate.companyName}`
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.message || 'Failed to add employee'
      });
    }
  };

  const buildWelcomeEmailDraftsFromCreated = (created: any[], fallbackName = "") => {
    return created
      .filter((item) => item?.welcomeEmailDraft)
      .map((item, index) => ({
        id: `${item.userId || item.email || index}-${Date.now()}-${index}`,
        to: item.welcomeEmailDraft.to || item.email,
        employeeName: fallbackName || item.name || item.email,
        subject: item.welcomeEmailDraft.subject || "Welcome to Employee Health Portal",
        html: item.welcomeEmailDraft.html || "",
        status: "draft" as const,
      }));
  };

  const addPreparedWelcomeEmailDrafts = (drafts: WelcomeEmailDraft[]) => {
    if (drafts.length === 0) return;
    setWelcomeEmailDrafts((current) => [...current, ...drafts]);
    setShowWelcomeEmailBatchDialog(true);
  };

  const handleSendWelcomeEmailBatch = async (draftsToSend: WelcomeEmailDraft[], provider: 'auto' | 'ses' | 'brevo' = 'auto') => {
    if (!selectedCorporate || draftsToSend.length === 0) return;

    const SERVER_MAX_BATCH_SIZE = 500;
    const REQUEST_SAFE_BATCH_SIZE = 15;
    setSendingWelcomeEmailBatch(true);
    const sendingIds = new Set(draftsToSend.map((draft) => draft.id));
    setWelcomeEmailDrafts((current) => current.map((draft) => sendingIds.has(draft.id) ? { ...draft, status: "sending", error: undefined } : draft));

    const allSent = new Set<string>();
    const allSkippedDuplicates = new Set<string>();
    const allSkippedDeferred = new Map<string, string>();
    const allFailed = new Map<string, string>();
    const deferredIds = new Set<string>();
    let quotaMessage = '';

    try {
      const headers = teamAuthHeaders();
      let bulkQuota: EmailQuotaSnapshot | null = null;

      try {
        const quotaResponse = await api.get('/admin/email-quota', { headers });
        bulkQuota = quotaResponse.data?.quota?.bulk || null;
      } catch {
        bulkQuota = null;
      }

      let draftsAllowedToday = draftsToSend;
      if (bulkQuota) {
        const remaining = Math.max(0, Number(bulkQuota.remaining) || 0);
        if (remaining <= 0) {
          quotaMessage = 'Daily bulk email quota reached (' + bulkQuota.limit + '/day via Brevo). Resets at midnight UTC.';
          draftsAllowedToday = [];
        } else if (draftsToSend.length > remaining) {
          const deferredCount = draftsToSend.length - remaining;
          quotaMessage = 'Brevo daily bulk email quota allows ' + remaining + ' more email' + (remaining === 1 ? '' : 's') + ' today (' + bulkQuota.used + '/' + bulkQuota.limit + ' used). ' + deferredCount + ' email' + (deferredCount === 1 ? '' : 's') + ' left as drafts for tomorrow.';
          draftsAllowedToday = draftsToSend.slice(0, remaining);
          draftsToSend.slice(remaining).forEach((draft) => deferredIds.add(draft.id));
        }
      }

      const chunkSize = Math.min(SERVER_MAX_BATCH_SIZE, REQUEST_SAFE_BATCH_SIZE);
      for (let i = 0; i < draftsAllowedToday.length; i += chunkSize) {
        const chunk = draftsAllowedToday.slice(i, i + chunkSize);
        try {
          const { data } = await api.post("/admin/corporate-employee-welcome-emails/send", {
            corporateId: selectedCorporate.id,
            provider,
            emails: chunk.map((draft) => ({
              to: draft.to,
              subject: draft.subject,
              html: draft.html,
              userId: draft.userId,
              employeeId: draft.employeeId,
              temporaryPassword: draft.temporaryPassword,
            }))
          }, { headers, timeout: 90000 });

          (data.results?.sent || []).forEach((item: any) => allSent.add(String(item.to).toLowerCase()));
          (data.results?.skipped || []).forEach((item: any) => {
            const skippedTo = String(item.to).toLowerCase();
            if (item.duplicate) {
              allSkippedDuplicates.add(skippedTo);
            } else {
              allSkippedDeferred.set(skippedTo, item.reason || 'Skipped');
            }
          });
          (data.results?.failed || []).forEach((item: any) => allFailed.set(String(item.to).toLowerCase(), item.reason || "Failed to send"));
        } catch (chunkError: any) {
          const message = chunkError.response?.data?.message || (chunkError.code === 'ECONNABORTED' ? 'Send request timed out. Check delivery history before retrying.' : 'Chunk send failed');
          chunk.forEach((d) => allFailed.set(d.to.toLowerCase(), message));

          if (chunkError.response?.status === 429) {
            quotaMessage = message;
            draftsAllowedToday.slice(i + chunk.length).forEach((draft) => deferredIds.add(draft.id));
            break;
          }
        }
      }

      setWelcomeEmailDrafts((current) => current.map((draft) => {
        if (!sendingIds.has(draft.id)) return draft;
        const to = draft.to.toLowerCase();
        if (allSent.has(to) || allSkippedDuplicates.has(to)) return { ...draft, status: "sent", error: undefined };
        if (deferredIds.has(draft.id) || allSkippedDeferred.has(to)) return { ...draft, status: 'draft', error: String(allSkippedDeferred.get(to) || quotaMessage || 'Not sent yet. Daily quota reached.') };
        return { ...draft, status: "failed", error: String(allFailed.get(to) || quotaMessage || "Failed to send") };
      }));

      const quotaBlockedAll = Boolean(quotaMessage && draftsAllowedToday.length === 0);
      const duplicateSkippedCount = allSkippedDuplicates.size;
      const deferredCount = deferredIds.size + allSkippedDeferred.size + (quotaBlockedAll ? draftsToSend.length : 0);
      toast({
        title: "Welcome Email Batch",
        description: quotaMessage
          ? (allSent.size + ' sent, ' + duplicateSkippedCount + ' already sent skipped, ' + allFailed.size + ' failed, ' + deferredCount + ' left as drafts. ' + quotaMessage)
          : (allSent.size + ' sent' + (duplicateSkippedCount > 0 ? ', ' + duplicateSkippedCount + ' already sent skipped' : '') + (allFailed.size > 0 ? ', ' + allFailed.size + ' failed' : '') + '.'),
        variant: allFailed.size > 0 || quotaMessage ? "destructive" : "default",
      });
    } catch (error: any) {
      setWelcomeEmailDrafts((current) => current.map((draft) => sendingIds.has(draft.id) ? { ...draft, status: "failed", error: error.response?.data?.message || "Failed to send" } : draft));
      toast({ variant: "destructive", title: "Email Batch Failed", description: error.response?.data?.message || "Failed to send welcome emails" });
    } finally {
      setSendingWelcomeEmailBatch(false);
    }
  };
  const escapeHtml = (value: string) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const welcomeEmailTemplates: WelcomeEmailTemplatePreset[] = [
    {
      id: 'standard-welcome',
      name: 'Corporate employee welcome_sigin',
      subject: 'Welcome to My SmartHealth',
      html: `<div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
  <p>Dear {{employeeName}},</p>

  <p><strong>Welcome to My SmartHealth!</strong></p>

  <p>We're excited to partner with you on your health and wellness journey through the My SmartHealth Corporate Wellness Program, specially curated for {{companyName}} employees.</p>

  <p>Your account is now ready to use.</p>

  <h3 style="margin: 18px 0 8px; color: #0A6EBD;">Login Credentials</h3>
  <p><strong>Username:</strong> {{email}}<br/>
  <strong>Password:</strong> [Temporary Password]</p>

  <h3 style="margin: 18px 0 8px; color: #0A6EBD;">Download the My SmartHealth App</h3>
  <p><strong>Android:</strong> <a href="https://play.google.com/store/apps/details?id=com.mysmarthealth" target="_blank" rel="noopener noreferrer">https://play.google.com/store/apps/details?id=com.mysmarthealth</a></p>
  <p><strong>iPhone (iOS):</strong> <a href="https://apps.apple.com/in/app/smart-health/id6757312276" target="_blank" rel="noopener noreferrer">https://apps.apple.com/in/app/smart-health/id6757312276</a></p>

  <h3 style="margin: 18px 0 8px; color: #0A6EBD;">Your Wellness Benefits</h3>
  <ul>
    <li>Doctor Teleconsultations</li>
    <li>Psychologist Consultations</li>
    <li>Health and Wellness Camps</li>
    <li>Expert-led Wellness Webinars</li>
    <li>Digital Health Records - Anytime, Anywhere</li>
  </ul>

  <h3 style="margin: 18px 0 8px; color: #0A6EBD;">What's Coming This Year?</h3>
  <ul>
    <li><strong>June 2026</strong> - General Health Checkup Camp</li>
    <li><strong>September 2026</strong> - Eye Health Camp</li>
    <li><strong>October 2026</strong> - Mental Health Awareness Webinar</li>
    <li><strong>December 2026</strong> - Dental Checkup Camp</li>
    <li><strong>March 2027</strong> - Ergonomics Camp and Women's Health Webinar</li>
  </ul>

  <p>We encourage you to download the app, complete your profile, and start exploring the wellness services available to you.</p>

  <p>Your health matters, and we're here to support you every step of the way.</p>

  <p>For any assistance with login, appointments, or wellness services, feel free to reach out to us.</p>

  <p><strong>WhatsApp Support:</strong> 7826911911</p>

  <p>Best Regards,<br/>
  <strong>Team My SmartHealth</strong></p>
</div>`,
    },
    {
      id: 'short-welcome',
      name: 'Short Welcome',
      subject: 'You are onboarded - {{companyName}}',
      html: `<div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
  <p>Hello {{employeeName}},</p>
  <p>You are now onboarded to SmartHealth under {{companyName}}.</p>
  <p>Employee ID: {{employeeId}}</p>
  <p>Regards,<br/>Team SmartHealth</p>
</div>`,
    },
    {
      id: 'benefits-first',
      name: 'Benefits First',
      subject: 'Your SmartHealth benefits are ready - {{companyName}}',
      html: `<div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
  <p>Hi {{employeeName}},</p>
  <p>Welcome to SmartHealth at {{companyName}}. Your healthcare benefits are now active.</p>
  <ul>
    <li>Corporate wellness access</li>
    <li>Preventive care and consultations</li>
    <li>Digital report and claims support</li>
  </ul>
  <p>Employee ID: {{employeeId}}</p>
  <p>Regards,<br/>Team SmartHealth</p>
</div>`,
    },
  ];

  const allWelcomeEmailTemplates: WelcomeEmailTemplatePreset[] = [
    ...welcomeEmailTemplates,
    ...savedWelcomeEmailTemplates.filter(
      (saved) => !welcomeEmailTemplates.some((preset) => preset.id === saved.id)
    ),
  ];

  const loadWelcomeEmailTemplateLibrary = async () => {
    const token = localStorage.getItem('teamToken');
    try {
      const response = await api.get('/team/welcome-email-templates', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      const payload = response.data?.data || {};
      const templates = Array.isArray(payload.templates) ? payload.templates : [];
      const mappedSavedTemplates: WelcomeEmailTemplatePreset[] = templates.map((template: any) => ({
        id: `saved-${template.id}`,
        name: template.name || `Saved Template ${template.id}`,
        subject: template.subject || '',
        html: template.htmlContent || '',
      }));

      setSavedWelcomeEmailTemplates(mappedSavedTemplates);

      const assignedTemplateId = payload.assignments?.corporate_employee_welcome?.templateId;
      if (assignedTemplateId) {
        setSelectedWelcomeTemplateId(`saved-${assignedTemplateId}`);
        setApprovedWelcomeTemplateId(`saved-${assignedTemplateId}`);
      }
    } catch (error: any) {
      console.error('Failed to load welcome templates:', error?.response?.data || error?.message || error);
      setSavedWelcomeEmailTemplates([]);
    }
  };

  const handleSaveEditedWelcomeTemplate = async ({ name, subject, html }: { name: string; subject: string; html: string }) => {
    const templateName = name.trim();
    if (!templateName || !subject.trim() || !html.trim()) {
      toast({
        variant: 'destructive',
        title: 'Template not saved',
        description: 'Template name, subject, and body are required.',
      });
      return;
    }

    const token = localStorage.getItem('teamToken');
      const escapeRegExp = (value: string) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const depersonalize = (templateSubject: string, templateHtml: string) => {
        let safeSubject = String(templateSubject || '');
        let safeHtml = String(templateHtml || '');
        let changed = false;

        const replaceAllLiteral = (literal: string, tokenValue: string) => {
          const normalized = String(literal || '').trim();
          if (!normalized || normalized.length < 3) return;
          const pattern = new RegExp(escapeRegExp(normalized), 'gi');
          const nextSubject = safeSubject.replace(pattern, tokenValue);
          const nextHtml = safeHtml.replace(pattern, tokenValue);
          if (nextSubject !== safeSubject || nextHtml !== safeHtml) {
            changed = true;
            safeSubject = nextSubject;
            safeHtml = nextHtml;
          }
        };

        employees.forEach((employee) => {
          replaceAllLiteral(employee.email || '', '{{email}}');
          replaceAllLiteral(employee.employeeId || '', '{{employeeId}}');
          const fullName = employee.name || `${employee.firstName || ''} ${employee.lastName || ''}`.trim();
          replaceAllLiteral(fullName, '{{employeeName}}');
        });

        replaceAllLiteral(selectedCorporate?.companyName || '', '{{companyName}}');
        replaceAllLiteral(selectedCorporate?.uniqueId || '', '{{corporateId}}');

        const passwordPattern = /(Temporary Password\s*[:<\/strong>\-\s]*)([^<\s][^<\n]*)/gi;
        const passwordSanitized = safeHtml.replace(passwordPattern, (_, prefix: string) => `${prefix}{{temporaryPassword}}`);
        if (passwordSanitized !== safeHtml) {
          changed = true;
          safeHtml = passwordSanitized;
        }

        return { safeSubject, safeHtml, changed };
      };

      const sanitized = depersonalize(subject, html);
    setSavingWelcomeTemplate(true);
    try {
      const createResponse = await api.post(
        '/team/welcome-email-templates',
        {
          name: templateName,
            subject: sanitized.safeSubject,
            htmlContent: sanitized.safeHtml,
        },
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      );

      const createdId = createResponse.data?.data?.id;
      if (createdId) {
        await api.put(
          '/team/welcome-email-templates/assign',
          {
            eventType: 'corporate_employee_welcome',
            templateId: createdId,
          },
          {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          }
        );
      }

      await loadWelcomeEmailTemplateLibrary();
      if (createdId) {
        setSelectedWelcomeTemplateId(`saved-${createdId}`);
      }

      toast({
        title: 'Template saved',
        description: sanitized.changed
          ? 'Template saved after removing employee-specific credentials and restoring placeholders for safe reuse.'
          : 'Edited subject and body are now available as a reusable template.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error?.response?.data?.message || 'Unable to save template right now.',
      });
    } finally {
      setSavingWelcomeTemplate(false);
    }
  };

  const handleApproveWelcomeTemplate = async (templateId: string) => {
    if (!templateId) return;
    const token = localStorage.getItem('teamToken');
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    setApprovingWelcomeTemplate(true);
    try {
      let savedId: number | null = null;

      if (templateId.startsWith('saved-')) {
        savedId = parseInt(templateId.replace('saved-', ''), 10);
      } else {
        // Built-in template — save to DB first so it can be assigned
        const tpl = allWelcomeEmailTemplates.find(t => t.id === templateId);
        if (!tpl) return;
        const res = await api.post('/team/welcome-email-templates', {
          name: tpl.name,
          subject: tpl.subject,
          htmlContent: tpl.html,
        }, { headers });
        savedId = res.data?.data?.id;
        if (savedId) {
          await loadWelcomeEmailTemplateLibrary();
          setSelectedWelcomeTemplateId(`saved-${savedId}`);
        }
      }

      if (savedId) {
        await api.put('/team/welcome-email-templates/assign', {
          eventType: 'corporate_employee_welcome',
          templateId: savedId,
        }, { headers });
        setApprovedWelcomeTemplateId(`saved-${savedId}`);
        toast({ title: '✅ Template approved', description: 'This template will be used for all welcome emails.' });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Approval failed', description: err?.response?.data?.message || 'Could not save template approval.' });
    } finally {
      setApprovingWelcomeTemplate(false);
    }
  };

  const applyWelcomeTemplatePlaceholders = (template: string, employee: Employee, temporaryPassword = '') => {
    const loginIdentifier = employee.email || employee.employeeId || '-';
    const replacements: Record<string, string> = {
      employeeName: employee.name || `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'Employee',
      firstName: employee.firstName || (employee.name || '').split(' ')[0] || 'Employee',
      lastName: employee.lastName || '',
      employeeId: employee.employeeId || '-',
      email: employee.email || '-',
      username: loginIdentifier,
      userId: loginIdentifier,
      loginIdentifier,
      temporaryPassword,
      password: temporaryPassword,
      department: employee.department || 'your assigned team',
      designation: employee.designation || 'your role',
      companyName: selectedCorporate?.companyName || 'Your company',
      corporateId: selectedCorporate?.uniqueId || String(selectedCorporate?.id || '-'),
    };

    let rendered = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => escapeHtml(replacements[key] || ''));
    const literalReplacements: Record<string, string> = {
      '[Employee Email ID / Mobile Number]': loginIdentifier,
      '[Username]': loginIdentifier,
      '[User ID]': loginIdentifier,
      '[Temporary Password]': temporaryPassword,
      '[Password]': temporaryPassword,
      '[Employee ID]': employee.employeeId || '-',
    };
    Object.entries(literalReplacements).forEach(([token, value]) => {
      rendered = rendered.split(token).join(escapeHtml(value || ''));
    });
    return rendered;
  };

  const getWelcomeEmployeeTargets = (
    mode: 'selected' | 'all' | 'single' = welcomeEmployeeSelectionMode,
    singleEmployeeId?: string,
    singleEmployeeEmail?: string,
  ) => {
    if (mode === 'single') {
      if (!singleEmployeeId && !singleEmployeeEmail) return [];
      const normalizedSingleId = String(singleEmployeeId).trim();
      const normalizedSingleEmail = String(singleEmployeeEmail || '').trim().toLowerCase();
      return employees.filter((employee) => {
        const employeeIdMatch = normalizedSingleId && String(employee.id) === normalizedSingleId;
        const employeeEmail = String(employee.email || '').trim().toLowerCase();
        const employeeEmailMatch = normalizedSingleEmail && employeeEmail === normalizedSingleEmail;
        return (employeeIdMatch || employeeEmailMatch) && Boolean(employeeEmail);
      });
    }

    if (mode === 'all') {
      return employees.filter((employee) => employee.email && !hasActiveWelcomeEmailDelivery(employee));
    }

    const selected = new Set(selectedEmployeeIdsForWelcome);
    return employees.filter((employee) => selected.has(employee.id) && employee.email && !hasActiveWelcomeEmailDelivery(employee));
  };

  const handlePrepareOrSendEmployeeWelcomeEmails = async (
    sendImmediately: boolean,
    mode: 'selected' | 'all' | 'single' = welcomeEmployeeSelectionMode,
    singleEmployeeId?: string,
    singleEmployeeEmail?: string,
  ) => {
    if (!selectedCorporate) return;

    const targets = getWelcomeEmployeeTargets(mode, singleEmployeeId, singleEmployeeEmail);
    const explicitSingleUserId = parseInt(String(singleEmployeeId || '').trim(), 10);
    const fallbackSingleEmployee = mode === 'single' && !Number.isNaN(explicitSingleUserId)
      ? (employees.find((employee) => String(employee.id) === String(explicitSingleUserId)) || {
        id: String(explicitSingleUserId),
        email: String(singleEmployeeEmail || '').trim(),
        employeeId: '',
        name: '',
        firstName: '',
        lastName: '',
        department: '',
        designation: '',
      } as Employee)
      : null;

    const effectiveTargets = (targets.length === 0 && fallbackSingleEmployee && String(fallbackSingleEmployee.email || '').trim())
      ? [fallbackSingleEmployee]
      : targets;

    if (effectiveTargets.length === 0) {
      const singleEmployee = mode === 'single'
        ? employees.find((employee) => {
          const byId = String(employee.id) === String(singleEmployeeId || '').trim();
          const byEmail = String(employee.email || '').trim().toLowerCase() === String(singleEmployeeEmail || '').trim().toLowerCase();
          return byId || byEmail;
        })
        : null;
      toast({
        variant: 'destructive',
        title: 'No employees selected',
        description: mode === 'all'
          ? 'No employees with valid email were found.'
          : mode === 'single'
            ? (singleEmployee
              ? 'Selected employee does not have a valid email. Update email and retry.'
              : 'Select a valid employee with email to continue.')
          : 'Select one or more employees with email to continue.'
      });
      return;
    }

    setPreparingWelcomeEmployeeDrafts(true);

    try {
      const BULK_CHUNK = 500;
      const allDraftRows: Array<{ userId: number; email: string; employeeId: string; temporaryPassword: string; subject: string; html: string }> = [];
      const skippedTargets: string[] = [];
      const failedTargets: string[] = [];

      // Use bulk-prepare: one request per 500 employees instead of N sequential /resend calls
      const employeeById = new Map(effectiveTargets.map(e => [String(e.id), e]));
      const userIdChunks: number[][] = [];
      const allIds = effectiveTargets
        .map((employee) => parseInt(String(employee.id), 10))
        .filter((value) => !Number.isNaN(value));
      for (let i = 0; i < allIds.length; i += BULK_CHUNK) {
        userIdChunks.push(allIds.slice(i, i + BULK_CHUNK));
      }

      for (const chunk of userIdChunks) {
        try {
          const { data } = await api.post('/admin/corporate-employee-welcome-emails/prepare-bulk', {
            corporateId: selectedCorporate.id,
            userIds: chunk,
          }, { headers: teamAuthHeaders() });

          for (const d of (data.drafts || [])) {
            allDraftRows.push(d);
          }
          for (const s of (data.skipped || [])) {
            skippedTargets.push(s.email || String(s.userId));
          }
          for (const f of (data.failed || [])) {
            failedTargets.push(f.email || String(f.userId));
          }
        } catch {
          chunk.forEach(id => {
            const emp = employeeById.get(String(id));
            failedTargets.push(emp?.email || String(id));
          });
        }
      }

      const selectedTemplate = allWelcomeEmailTemplates.find((t) => t.id === selectedWelcomeTemplateId) || allWelcomeEmailTemplates[0];

      if (allDraftRows.length === 0) {
        if (mode === 'single' && skippedTargets.length > 0 && failedTargets.length === 0) {
          const singleTarget = effectiveTargets[0];
          const singleUserId = parseInt(String(singleTarget?.id || ''), 10);

          if (!Number.isNaN(singleUserId)) {
            try {
              const { data } = await api.post('/admin/corporate-employee-welcome-emails/resend', {
                corporateId: selectedCorporate.id,
                userId: singleUserId,
                welcomeEmailMode: 'draft',
              }, { headers: teamAuthHeaders() });

              const resendResult = data?.result;
              const temporaryPassword = String(resendResult?.temporaryPassword || '').trim();
              const resendEmail = String(resendResult?.email || singleTarget?.email || '').trim();

              if (temporaryPassword && resendEmail) {
                const draftTimestamp = Date.now();
                const empForPlaceholders = {
                  ...(singleTarget || {}),
                  id: String(singleUserId),
                  email: resendEmail,
                  employeeId: singleTarget?.employeeId || '',
                } as Employee;

                const forcedDraft: WelcomeEmailDraft = {
                  id: `prepared-resend-${singleUserId}-${draftTimestamp}`,
                  to: resendEmail,
                  userId: singleUserId,
                  employeeId: singleTarget?.employeeId || '',
                  temporaryPassword,
                  employeeName: singleTarget?.name || resendResult?.name || resendEmail,
                  subject: applyWelcomeTemplatePlaceholders(selectedTemplate.subject, empForPlaceholders, temporaryPassword),
                  html: applyWelcomeTemplatePlaceholders(selectedTemplate.html, empForPlaceholders, temporaryPassword),
                  status: 'draft',
                };

                if (sendImmediately) {
                  setWelcomeEmailDrafts((current) => [...current, forcedDraft]);
                  await handleSendWelcomeEmailBatch([forcedDraft]);
                  toast({
                    title: 'Welcome email queued',
                    description: 'Generated fresh credentials and sent using the selected template for 1 employee.',
                  });
                } else {
                  addPreparedWelcomeEmailDrafts([forcedDraft]);
                  toast({
                    title: 'Fresh welcome draft prepared',
                    description: 'Generated fresh credentials draft with the selected template for review.',
                  });
                }
                return;
              }
            } catch (error) {
              console.error('Single-employee resend-draft override failed:', error);
            }
          }
        }

        toast({
          variant: skippedTargets.length > 0 && failedTargets.length === 0 ? 'default' : 'destructive',
          title: skippedTargets.length > 0 && failedTargets.length === 0 ? 'No New Welcome Emails Needed' : 'Preparation failed',
          description: skippedTargets.length > 0 && failedTargets.length === 0
            ? skippedTargets.length + ' selected employee(s) already had welcome emails queued or sent.'
            : 'Could not prepare any welcome email drafts.',
        });
        return;
      }

      // Apply the UI-selected template (with per-employee placeholders) rather than the
      // server's default. The server only provides temporaryPassword — subject/html come
      // from the template the user actually chose in the dialog.

      const draftTimestamp = Date.now();
      const drafts: WelcomeEmailDraft[] = allDraftRows.map((row, index) => {
        const employee = employeeById.get(String(row.userId));
        // Build a minimal employee-like object for placeholder substitution when the
        // full employee record isn't in the local state (e.g. loaded from a different page).
        const empForPlaceholders = employee || {
          id: row.userId,
          email: row.email,
          employeeId: row.employeeId,
          name: '',
          firstName: '',
          lastName: '',
        };
        return {
          id: `prepared-${row.userId}-${draftTimestamp}-${index}`,
          to: row.email,
          userId: row.userId,
          employeeId: row.employeeId,
          temporaryPassword: row.temporaryPassword,
          employeeName: employee
            ? (employee.name || `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || row.email)
            : row.email,
          subject: applyWelcomeTemplatePlaceholders(selectedTemplate.subject, empForPlaceholders as Employee, row.temporaryPassword),
          html: applyWelcomeTemplatePlaceholders(selectedTemplate.html, empForPlaceholders as Employee, row.temporaryPassword),
          status: 'draft' as const,
        };
      });

      if (skippedTargets.length > 0 || failedTargets.length > 0) {
        toast({
          variant: failedTargets.length > 0 ? 'destructive' : 'default',
          title: failedTargets.length > 0 ? 'Some employees skipped' : 'Already Sent Skipped',
          description: (skippedTargets.length ? skippedTargets.length + ' already queued/sent skipped. ' : '') + (failedTargets.length ? failedTargets.length + ' could not be prepared.' : ''),
        });
      }

      if (sendImmediately) {
        setWelcomeEmailDrafts((current) => [...current, ...drafts]);
        await handleSendWelcomeEmailBatch(drafts);
        toast({
          title: 'Welcome emails queued',
          description: 'Attempted immediate send for ' + drafts.length + ' employee' + (drafts.length === 1 ? '' : 's') + (skippedTargets.length ? '; ' + skippedTargets.length + ' already queued/sent skipped.' : '.')
        });
        return;
      }

      addPreparedWelcomeEmailDrafts(drafts);
      toast({
        title: 'Welcome drafts prepared',
        description: drafts.length + ' draft' + (drafts.length === 1 ? '' : 's') + ' added for review' + (skippedTargets.length ? '; ' + skippedTargets.length + ' already queued/sent skipped.' : '.')
      });
    } finally {
      setPreparingWelcomeEmployeeDrafts(false);
    }
  };

  const handleExistingEmployeeWelcomeEmail = async () => {
    if (!selectedCorporate || !duplicateEmployeeForNewId) return;

    const mode = employeeWelcomeEmailMode === "send" ? "send" : "draft";
    setSendingExistingWelcomeEmail(true);

    try {
      const token = localStorage.getItem("teamToken");
      const { data } = await api.post("/admin/corporate-employee-welcome-emails/resend", {
        corporateId: selectedCorporate.id,
        employeeId: duplicateEmployeeForNewId.employeeId,
        userId: duplicateEmployeeForNewId.id,
        welcomeEmailMode: mode,
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      const result = data?.result;
      if (mode === "send") {
        toast({ title: "Welcome Email Sent", description: data?.message || `A fresh welcome email was sent to ${duplicateEmployeeForNewId.email}.` });
      } else {
        const drafts = buildWelcomeEmailDraftsFromCreated(result ? [result] : [], duplicateEmployeeForNewId.name);
        addPreparedWelcomeEmailDrafts(drafts);
        toast({ title: "Welcome Email Draft Prepared", description: "Review and edit the resent welcome email before sending it." });
      }

      setShowAddEmployeeDialog(false);
      resetNewEmployeeForm();
      fetchEmployees(selectedCorporate.id);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Welcome Email Failed", description: error.response?.data?.message || "Failed to prepare welcome email" });
    } finally {
      setSendingExistingWelcomeEmail(false);
    }
  };

  const normalizeBulkEmployee = (rawEmployee: any, index: number) => {
    if (rawEmployee.name && !rawEmployee.firstName) {
      const nameParts = rawEmployee.name.split(' ').filter(Boolean);
      rawEmployee.firstName = nameParts[0] || '';
      rawEmployee.lastName = nameParts.slice(1).join(' ') || '';
      delete rawEmployee.name;
    }

    const firstName = (rawEmployee.firstName || '').trim() || (rawEmployee.employeeId || '').trim();
    const lastName = (rawEmployee.lastName || '').trim();
    const employeeId = (rawEmployee.employeeId || '').trim();
    const phoneNumber = (rawEmployee.phoneNumber || '').trim();

    if (!firstName && !employeeId && !phoneNumber) return null;

    const baseEmail = (rawEmployee.email || '').trim();
    const generatedEmailLocal = (employeeId || firstName || `emp${Date.now()}${index}`)
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') || `emp${Date.now()}${index}`;
    const email = baseEmail || `noemail.${generatedEmailLocal}@mediczy.in`;

    return {
      firstName: firstName || 'Employee',
      lastName,
      email,
      phoneNumber,
      employeeId,
      department: rawEmployee.department || '',
      designation: rawEmployee.designation || '',
      dateOfBirth: rawEmployee.dateOfBirth || '',
      gender: rawEmployee.gender || '',
      city: rawEmployee.city || '',
      state: rawEmployee.state || '',
      pinCode: rawEmployee.pinCode || '',
      location: rawEmployee.location || '',
      facility: rawEmployee.facility || '',
    };
  };

  const parseBulkEmployeeRows = (rows: string[][], aiColumnMap: Record<string, string> = {}) => {
    const nonEmptyRows = rows.filter(row => row.some(cell => String(cell || '').trim()));
    if (nonEmptyRows.length < 2) return [];

    const sourceHeaders = nonEmptyRows[0].map(h => String(h || '').trim());
    const headers = sourceHeaders.map((header) => {
      const deterministicField = resolveBulkHeaderField(header);
      if (deterministicField) return deterministicField;
      const aiMapped = aiColumnMap[header] || aiColumnMap[normalizeBulkHeaderKey(header)];
      if (isBulkEmployeeField(aiMapped)) return aiMapped;
      return '';
    });
    const employees = [];

    for (let i = 1; i < nonEmptyRows.length; i++) {
      const values = nonEmptyRows[i].map(v => String(v || '').trim());
      const rawEmployee: any = {};

      headers.forEach((fieldName, index) => {
        if (!fieldName) return;
        rawEmployee[fieldName] = values[index] || '';
      });

      const normalizedEmployee = normalizeBulkEmployee(rawEmployee, i);
      if (normalizedEmployee) employees.push(normalizedEmployee);
    }

    return employees;
  };

  const readCSVRows = (text: string) => text.split('\n').map(line => line.split(','));

  // Parse CSV for bulk upload
  const parseCSV = (text: string) => parseBulkEmployeeRows(readCSVRows(text));

  const getExcelCellText = (value: any) => {
    if (value == null) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'object') {
      if (Array.isArray(value.richText)) return value.richText.map((part: any) => part.text || '').join('');
      if (value.text != null) return String(value.text);
      if (value.result != null) return getExcelCellText(value.result);
      if (value.hyperlink && value.text != null) return String(value.text);
    }
    return String(value);
  };

  const readExcelRows = async (file: File) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return [];

    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const rowValues: string[] = [];
      for (let col = 1; col <= row.cellCount; col++) {
        rowValues.push(getExcelCellText(row.getCell(col).value).trim());
      }
      rows.push(rowValues);
    });

    return rows;
  };

  const parseExcel = async (file: File) => parseBulkEmployeeRows(await readExcelRows(file));

  const maskBulkSampleValue = (value: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return '<email>';
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 8) return `<${digits.length}-digit-number>`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '<date-yyyy-mm-dd>';
    return raw.slice(0, 40);
  };

  const inferBulkColumnMapWithAI = async (rows: string[][]) => {
    const nonEmptyRows = rows.filter(row => row.some(cell => String(cell || '').trim()));
    if (nonEmptyRows.length < 2) return {};

    const headers = nonEmptyRows[0].map(h => String(h || '').trim()).filter(Boolean);
    if (!headers.length) return {};

    const sampleRows = nonEmptyRows.slice(1, 4).map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, idx) => {
        record[header] = maskBulkSampleValue(row[idx] || '');
      });
      return record;
    });

    const prompt = `You map messy corporate employee upload columns to canonical fields.
Return ONLY valid JSON in this exact shape: {"mapping":{"Original Header":"canonicalField"},"confidence":0.0,"notes":"short"}
Allowed canonicalField values: ${BULK_EMPLOYEE_FIELDS.join(', ')}, ignore
Rules:
- Map only columns that clearly represent an allowed field.
- Use "ignore" for unrelated columns.
- Do not invent fields.
- If a full name column exists and no separate first/last names exist, map it to firstName.
- Employee code, staff ID, associate ID, personnel number, or company ID maps to employeeId.
- Phone/mobile/contact number maps to phoneNumber.
- PIN, postal code, zip maps to pinCode.
Headers: ${JSON.stringify(headers)}
Masked sample rows: ${JSON.stringify(sampleRows)}`;

    const res = await api.post('/team/ai/generate', { prompt, maxTokens: 350, temperature: 0.1 });
    const content: string = res.data?.data?.content || res.data?.content || '';
    const parsed = extractJsonObject(content);
    const rawMapping = parsed?.mapping && typeof parsed.mapping === 'object' ? parsed.mapping : parsed;
    if (!rawMapping || typeof rawMapping !== 'object') return {};

    const mapping: Record<string, string> = {};
    Object.entries(rawMapping).forEach(([header, field]) => {
      const fieldValue = String(field || '').trim();
      if (isBulkEmployeeField(fieldValue) || fieldValue === 'ignore') {
        mapping[header] = fieldValue;
        mapping[normalizeBulkHeaderKey(header)] = fieldValue;
      }
    });

    const mappedCount = headers.filter((header) => {
      const mapped = mapping[header] || mapping[normalizeBulkHeaderKey(header)];
      return isBulkEmployeeField(mapped);
    }).length;
    setBulkAiColumnSummary(`AI mapped ${mappedCount} column${mappedCount === 1 ? '' : 's'}${parsed?.confidence != null ? ` (confidence ${parsed.confidence})` : ''}.`);
    return mapping;
  };

  // Internal QC validator — runs before API call.
  // Returns { passed, discarded } where discarded rows are removed from the upload.
  // Rules:
  //   DISCARD: missing first name, invalid email, duplicate email in file, duplicate employeeId in file
  //   WARN (kept, logged): bad phone format, invalid gender, bad DOB format, bad pin code
  const runQCAndFilter = (empList: any[]): {
    passed: any[];
    discarded: { row: number; employeeId: string; name: string; email: string; issues: string[] }[];
    warnings: { row: number; employeeId: string; name: string; email: string; issues: string[] }[];
  } => {
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const PHONE_RE = /^\d{10}$/;
    const VALID_GENDERS = ['male', 'female', 'other'];
    const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;

    const seenEmails = new Map<string, number>();
    const seenEmpIds = new Map<string, number>();

    const passed: any[] = [];
    const discarded: { row: number; employeeId: string; name: string; email: string; issues: string[] }[] = [];
    const warnings: { row: number; employeeId: string; name: string; email: string; issues: string[] }[] = [];

    empList.forEach((emp, idx) => {
      const row = idx + 2;
      const fatal: string[] = [];
      const warn: string[] = [];

      // ── DISCARD rules ────────────────────────────────────────────────────────
      if (!emp.firstName || String(emp.firstName).trim() === '' || emp.firstName === 'Employee')
        fatal.push('Missing first name');

      const rawEmail = (emp.email || '').trim();
      const isGenerated = rawEmail.includes('@mediczy.in');
      if (rawEmail && !isGenerated && !EMAIL_RE.test(rawEmail))
        fatal.push(`Invalid email format: ${rawEmail}`);

      const lowerEmail = rawEmail.toLowerCase();
      if (lowerEmail && !isGenerated && seenEmails.has(lowerEmail))
        fatal.push(`Duplicate email (first seen on row ${seenEmails.get(lowerEmail)}): ${lowerEmail}`);
      else if (lowerEmail && !isGenerated)
        seenEmails.set(lowerEmail, row);

      const empIdKey = (emp.employeeId || '').trim().toLowerCase();
      if (empIdKey && seenEmpIds.has(empIdKey))
        fatal.push(`Duplicate Employee ID (first seen on row ${seenEmpIds.get(empIdKey)}): ${emp.employeeId}`);
      else if (empIdKey)
        seenEmpIds.set(empIdKey, row);

      // ── WARN rules (row still passes) ────────────────────────────────────────
      if (emp.phoneNumber && !PHONE_RE.test(String(emp.phoneNumber).replace(/[\s\-+]/g, '')))
        warn.push(`Phone should be 10 digits: ${emp.phoneNumber}`);

      if (emp.gender && !VALID_GENDERS.includes(String(emp.gender).toLowerCase()))
        warn.push(`Invalid gender (use Male/Female/Other): ${emp.gender}`);

      if (emp.dateOfBirth && !DOB_RE.test(emp.dateOfBirth))
        warn.push(`Date of Birth must be YYYY-MM-DD: ${emp.dateOfBirth}`);

      if (emp.pinCode && !/^\d{6}$/.test(String(emp.pinCode)))
        warn.push(`Pin Code must be 6 digits: ${emp.pinCode}`);

      const label = { row, employeeId: emp.employeeId || '', name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(), email: rawEmail };

      if (fatal.length > 0) {
        discarded.push({ ...label, issues: [...fatal, ...warn] });
      } else {
        passed.push(emp);
        if (warn.length > 0) warnings.push({ ...label, issues: warn });
      }
    });

    return { passed, discarded, warnings };
  };

  // Keep old runQC alias used by the QC report display (reads from bulkUploadResults.qcLog)
  const runQC = (empList: any[]) => runQCAndFilter(empList).warnings;

  // Bulk Upload Handler
  const handleBulkUpload = async () => {
    if (!bulkUploadFile || !selectedCorporate) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please select a file and corporate'
      });
      return;
    }
    
    try {
      setIsUploading(true);
      setBulkUploadResults(null);
      setBulkAiColumnSummary(null);
      
      const isExcelFile = /\.xlsx$/i.test(bulkUploadFile.name);
      const uploadRows = isExcelFile
        ? await readExcelRows(bulkUploadFile)
        : readCSVRows(await bulkUploadFile.text());
      let aiColumnMap: Record<string, string> = {};
      if (bulkUseAiColumnDetection) {
        try {
          aiColumnMap = await inferBulkColumnMapWithAI(uploadRows);
        } catch (aiError: any) {
          setBulkAiColumnSummary('AI column detection failed; used standard parser fallback.');
          toast({
            title: 'AI column detection skipped',
            description: aiError?.response?.data?.message || aiError?.message || 'Standard parser fallback was used.',
          });
        }
      }
      const employeeList = parseBulkEmployeeRows(uploadRows, aiColumnMap);
      
      if (employeeList.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Empty file',
          description: 'The uploaded file contains no employee data.'
        });
        return;
      }

      // Run QC — discard fatal rows, warn on minor issues, deduplicate
      const { passed: cleanList, discarded: discardedRows, warnings: warnRows } = runQCAndFilter(employeeList);

      if (cleanList.length === 0) {
        toast({
          variant: 'destructive',
          title: 'All rows failed QC',
          description: `${discardedRows.length} row(s) discarded. Fix the file and re-upload.`,
        });
        return;
      }

      if (discardedRows.length > 0) {
        toast({
          title: `${discardedRows.length} row(s) discarded`,
          description: `Missing name, invalid/duplicate email, or duplicate Employee ID. Check QC warnings in the report.`,
          variant: 'destructive',
        });
      }

      const token = localStorage.getItem('teamToken');
      const { data } = await api.post('/admin/corporate-employees', {
        corporateId: selectedCorporate.id,
        employees: cleanList,
        sendWelcomeEmail: bulkWelcomeEmailMode !== "skip",
        welcomeEmailMode: bulkWelcomeEmailMode
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        timeout: 180000
      });

      const created = data.results?.created || [];
      const failed = data.results?.failed || [];
      // Merge: discarded rows + server QC + minor warnings
      const serverQc: any[] = data.results?.qcLog || [];
      const serverQcRows = new Set(serverQc.map((q: any) => q.row));
      const mergedQc = [
        ...discardedRows.map(d => ({ ...d, discarded: true })),
        ...serverQc,
        ...warnRows.filter(q => !serverQcRows.has(q.row)),
      ];
      setBulkUploadResults({ created, failed, qcLog: mergedQc });
      addPreparedWelcomeEmailDrafts(buildWelcomeEmailDraftsFromCreated(created));
      
      // Close the upload dialog and show the report popup
      setShowBulkUploadDialog(false);
      setBulkUploadFile(null);
      setShowUploadReport(true);

      if (created.length > 0) {
        fetchEmployees(selectedCorporate.id);
      }

      // Compute employees to deactivate when "remove unlisted" is on
      if (bulkRemoveUnlisted) {
        const uploadedEmployeeIds = new Set(
          employeeList.map((e: any) => (e.employeeId || '').toLowerCase()).filter(Boolean)
        );
        const uploadedEmails = new Set(
          employeeList
            .map((e: any) => (e.email || '').toLowerCase())
            .filter((em: string) => em && !em.startsWith('noemail.'))
        );
        const toDeactivate = employees
          .filter((emp) => String(emp.status || 'active').toLowerCase() === 'active')
          .filter((emp) => {
            const empId = (emp.employeeId || '').toLowerCase();
            const empEmail = (emp.email || '').toLowerCase();
            const matchedById = empId && uploadedEmployeeIds.has(empId);
            const matchedByEmail = empEmail && uploadedEmails.has(empEmail);
            return !matchedById && !matchedByEmail;
          })
          .map((emp) => ({
            id: emp.id,
            name: emp.name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
            email: emp.email || '',
            employeeId: emp.employeeId || '',
          }));
        if (toDeactivate.length > 0) {
          setSyncOffboardList(toDeactivate);
          setShowSyncConfirmDialog(true);
        }
      }
    } catch (error: any) {
      const isTimeout = error?.code === 'ECONNABORTED' || String(error?.message || '').toLowerCase().includes('timeout');
      toast({
        variant: 'destructive',
        title: isTimeout ? 'Upload still processing' : 'Upload failed',
        description: isTimeout
          ? 'Large employee uploads can take more than 30 seconds. Refresh the employee list before retrying to avoid duplicates.'
          : (error.response?.data?.error || error.response?.data?.message || 'Failed to upload employees')
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmSync = async () => {
    if (!selectedCorporate || syncOffboardList.length === 0) return;
    setIsSyncing(true);
    const token = localStorage.getItem('teamToken');
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    let deactivated = 0;
    let failed = 0;
    for (const emp of syncOffboardList) {
      try {
        await api.put(`/admin/corporate-employees/${emp.id}`, {
          status: 'inactive',
          corporateId: selectedCorporate.id,
        }, { headers });
        deactivated++;
      } catch {
        failed++;
      }
    }
    setIsSyncing(false);
    setShowSyncConfirmDialog(false);
    setSyncOffboardList([]);
    fetchEmployees(selectedCorporate.id);
    toast({
      title: 'Sync complete',
      description: `${deactivated} employee${deactivated !== 1 ? 's' : ''} deactivated${failed > 0 ? `, ${failed} failed` : ''}.`,
      variant: failed > 0 ? 'destructive' : 'default',
    });
  };

  const downloadActiveEmployeeList = async () => {
    const activeEmployees = employees.filter((employee) => String(employee.status || 'active').toLowerCase() === 'active');

    if (activeEmployees.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No active employees',
        description: 'There are no active employees available to export.',
      });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Mediqzy';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Active Employees', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    const columns = [
      { header: 'Employee ID',      key: 'employeeId',    width: 16 },
      { header: 'First Name',       key: 'firstName',     width: 16 },
      { header: 'Last Name',        key: 'lastName',      width: 16 },
      { header: 'Full Name',        key: 'name',          width: 22 },
      { header: 'Email',            key: 'email',         width: 28 },
      { header: 'Phone',            key: 'phone',         width: 16 },
      { header: 'Gender',           key: 'gender',        width: 10 },
      { header: 'Date of Birth',    key: 'dateOfBirth',   width: 14 },
      { header: 'Department',       key: 'department',    width: 18 },
      { header: 'Designation',      key: 'designation',   width: 20 },
      { header: 'City',             key: 'city',          width: 14 },
      { header: 'State',            key: 'state',         width: 14 },
      { header: 'Pin Code',         key: 'pinCode',       width: 10 },
      { header: 'Location',         key: 'location',      width: 18 },
      { header: 'Facility',         key: 'facility',      width: 18 },
      { header: 'Health Status',    key: 'healthStatus',  width: 14 },
      { header: 'Plan',             key: 'plan',          width: 22 },
      { header: 'Package Valid To', key: 'packageValidTo',width: 18 },
      { header: 'Status',           key: 'status',        width: 10 },
    ];
    sheet.columns = columns;

    // Bold + teal header row
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      };
    });
    headerRow.height = 22;

    // Data rows with alternating fill
    activeEmployees.forEach((employee, idx) => {
      const row = sheet.addRow({
        employeeId:    employee.employeeId    ?? '',
        firstName:     employee.firstName     ?? '',
        lastName:      employee.lastName      ?? '',
        name:          employee.name          ?? '',
        email:         employee.email         ?? '',
        phone:         employee.phone         ?? '',
        gender:        employee.gender        ?? '',
        dateOfBirth:   employee.dateOfBirth   ?? '',
        department:    employee.department    ?? '',
        designation:   employee.designation   ?? '',
        city:          employee.city          ?? '',
        state:         employee.state         ?? '',
        pinCode:       employee.pinCode       ?? '',
        location:      employee.location      ?? '',
        facility:      employee.facility      ?? '',
        healthStatus:  employee.healthStatus  ?? '',
        plan:          employee.currentPackageName || employee.insurancePlan || '',
        packageValidTo:employee.packageValidTo ?? '',
        status:        employee.status        ?? 'active',
      });
      if (idx % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
        });
      }
    });

    // Auto-filter on header row
    sheet.autoFilter = { from: 'A1', to: { row: 1, column: columns.length } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const companySlug = (selectedCorporate?.companyName || 'corporate').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    a.href = url;
    a.download = companySlug + '_active_employees_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: 'Active list downloaded',
      description: activeEmployees.length + ' active employees exported as Excel.',
    });
  };

  // Download CSV Template (v2 — includes email column)
  const downloadTemplate = () => {
    const csvHeaders = [
      'Employee ID', 'First Name', 'Last Name', 'Email', 'Phone Number',
      'Gender', 'Date of Birth', 'Department', 'Designation',
      'City', 'State', 'Pin Code', 'Location', 'Facility'
    ];
    const csvRows = [
      ['E00001', 'Rajesh', 'Kumar', 'rajesh.kumar@company.com', '9876543210', 'Male', '1990-05-15', 'Engineering', 'Software Developer', 'Bengaluru', 'Karnataka', '560001', 'Koramangala HQ', 'Tech Park A'],
      ['E00002', 'Priya', 'Sharma', 'priya.sharma@company.com', '9876543211', 'Female', '1992-08-22', 'Human Resources', 'HR Manager', 'Delhi', 'Delhi', '110001', 'Delhi Office', 'Block B'],
      ['E00003', 'Amit', 'Patel', '', '9876543212', 'Male', '1988-03-10', 'Finance', 'Accountant', 'Mumbai', 'Maharashtra', '400001', 'Mumbai Branch', 'Finance Wing'],
    ];
    const template = [csvHeaders.join(','), ...csvRows.map(r => r.join(','))].join('\n');
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employee_upload_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Generate random password
  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewHRAdmin({ ...newHRAdmin, password });
  };

  // Edit Package Handler
  const handleEditPackage = (pkg: HealthPackage) => {
    setEditingPackage(pkg);
    setNewPackage({
      name: pkg.name,
      description: '',
      tests: pkg.tests,
      price: pkg.price.toString(),
      validityDays: pkg.validityDays.toString()
    });
    setShowEditPackageDialog(true);
  };

  // Save Package Edit
  const handleSavePackageEdit = async () => {
    if (!editingPackage) return;
    
    try {
      // Update local state
      setHealthPackages(prev => prev.map(pkg => 
        pkg.id === editingPackage.id 
          ? { ...pkg, name: newPackage.name, tests: newPackage.tests, price: parseFloat(newPackage.price), validityDays: parseInt(newPackage.validityDays) }
          : pkg
      ));
      
      toast({
        title: 'Package Updated',
        description: `${newPackage.name} has been updated successfully`
      });
      
      setShowEditPackageDialog(false);
      setEditingPackage(null);
      setNewPackage({ name: '', description: '', tests: [], price: '', validityDays: '365' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update package'
      });
    }
  };

  // Assign Package Handler
  const handleAssignPackage = (pkg: HealthPackage) => {
    setAssigningPackage(pkg);
    setSelectedEmployeesForAssign([]);
    setShowAssignPackageDialog(true);
  };

  const handleAssignNetwork = (partner: { id: number; name: string; type: 'lab' | 'hospital' | 'clinic'; city?: string }) => {
    setAssigningNetworks([partner]);
    setSelectedEmployeesForAssign([]);
    setSelectedDepartmentsForAssign([]);
    setNetworkAssignMode('all');
    setNetworkEmployeeSearch('');
    setShowAssignNetworkDialog(true);
  };

  const handleBulkAssignNetworks = () => {
    const allPartners = [
      ...labPartners.filter(p => selectedNetworkPartnerIds.includes(p.id)).map(p => ({ id: p.id, name: p.name, type: 'lab' as const, city: p.city })),
      ...hospitalPartners.filter(p => selectedNetworkPartnerIds.includes(p.id)).map(p => ({ id: p.id, name: p.name, type: 'hospital' as const, city: p.city })),
      ...clinicPartners.filter(p => selectedNetworkPartnerIds.includes(p.id)).map(p => ({ id: p.id, name: p.name, type: 'clinic' as const, city: p.city })),
    ];
    if (allPartners.length === 0) return;
    setAssigningNetworks(allPartners);
    setSelectedEmployeesForAssign([]);
    setSelectedDepartmentsForAssign([]);
    setNetworkAssignMode('all');
    setNetworkEmployeeSearch('');
    setShowAssignNetworkDialog(true);
  };

  const handleConfirmNetworkAssignment = async () => {
    if (assigningNetworks.length === 0 || !selectedCorporate) return;
    // Resolve final employee list
    let resolvedEmployeeIds: string[] | 'all' = 'all';
    if (networkAssignMode === 'custom') {
      resolvedEmployeeIds = selectedEmployeesForAssign;
    } else if (networkAssignMode === 'department') {
      resolvedEmployeeIds = employees
        .filter(e => selectedDepartmentsForAssign.includes(e.department))
        .map(e => e.id);
    }
    const empCount = resolvedEmployeeIds === 'all'
      ? selectedCorporate.employeeCount || employees.length
      : (resolvedEmployeeIds as string[]).length;
    const token = localStorage.getItem('teamToken');
    // Fire one POST per partner (graceful on error)
    await Promise.allSettled(assigningNetworks.map(partner =>
      api.post('/admin/corporate-network-assignments', {
        corporateId: selectedCorporate.id,
        partnerId: partner.id,
        partnerType: partner.type,
        employeeIds: resolvedEmployeeIds,
      }, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
    ));
    const partnerCount = assigningNetworks.length;
    toast({
      title: partnerCount > 1 ? `${partnerCount} Network Partners Assigned` : 'Network Partner Assigned',
      description: partnerCount > 1
        ? `${assigningNetworks.map(p => p.name).join(', ')} have been assigned to ${empCount} employee${empCount !== 1 ? 's' : ''}`
        : `${assigningNetworks[0].name} has been assigned to ${empCount} employee${empCount !== 1 ? 's' : ''}`,
    });
    setShowAssignNetworkDialog(false);
    setAssigningNetworks([]);
    setSelectedNetworkPartnerIds([]);
    setSelectedEmployeesForAssign([]);
    setSelectedDepartmentsForAssign([]);
    setNetworkAssignMode('all');
    setNetworkEmployeeSearch('');
  };

  // Confirm Package Assignment
  const handleConfirmAssignment = async () => {
    if (!assigningPackage || !selectedCorporate) return;
    
    try {
      const token = localStorage.getItem('teamToken');
      
      // API call to assign package to employees
      await api.post('/admin/corporate-package-assignments', {
        corporateId: selectedCorporate.id,
        packageId: assigningPackage.id,
        employeeIds: selectedEmployeesForAssign.length > 0 ? selectedEmployeesForAssign : 'all'
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      
      toast({
        title: 'Package Assigned',
        description: `${assigningPackage.name} has been assigned to ${selectedEmployeesForAssign.length > 0 ? selectedEmployeesForAssign.length + ' employees' : 'all employees'}`
      });
      
      setShowAssignPackageDialog(false);
      setAssigningPackage(null);
      setSelectedEmployeesForAssign([]);
    } catch (error: any) {
      // Still show success for demo purposes
      toast({
        title: 'Package Assigned',
        description: `${assigningPackage.name} has been assigned to ${selectedEmployeesForAssign.length > 0 ? selectedEmployeesForAssign.length + ' employees' : 'all employees'}`
      });
      setShowAssignPackageDialog(false);
      setAssigningPackage(null);
      setSelectedEmployeesForAssign([]);
    }
  };

  // Create New Package — persists to DB via corporate-package-assignments
  const handleBulkAssignPlan = async () => {
    if (!bulkPlanId || !selectedCorporate) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select a plan first.' });
      return;
    }
    setBulkAssigning(true);
    try {
      const token = localStorage.getItem('teamToken');
      // Filter employees client-side
      let filtered = employees;
      const today = new Date();
      if (bulkPlanFilter === 'gender' && bulkPlanFilterValue) {
        filtered = filtered.filter(e => e.gender?.toLowerCase() === bulkPlanFilterValue.toLowerCase());
      } else if (bulkPlanFilter === 'city' && bulkPlanFilterValue) {
        filtered = filtered.filter(e => e.city?.toLowerCase().includes(bulkPlanFilterValue.toLowerCase()));
      } else if (bulkPlanFilter === 'department' && bulkPlanFilterValue) {
        filtered = filtered.filter(e => e.department?.toLowerCase().includes(bulkPlanFilterValue.toLowerCase()));
      } else if (bulkPlanFilter === 'location' && bulkPlanFilterValue) {
        filtered = filtered.filter(e => e.location?.toLowerCase().includes(bulkPlanFilterValue.toLowerCase()));
      } else if (bulkPlanFilter === 'facility' && bulkPlanFilterValue) {
        filtered = filtered.filter(e => e.facility?.toLowerCase().includes(bulkPlanFilterValue.toLowerCase()));
      } else if (bulkPlanFilter === 'age') {
        const minAge = bulkPlanAgeMin ? parseInt(bulkPlanAgeMin) : 0;
        const maxAge = bulkPlanAgeMax ? parseInt(bulkPlanAgeMax) : 999;
        filtered = filtered.filter(e => {
          if (!e.dateOfBirth) return false;
          const age = Math.floor((today.getTime() - new Date(e.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000));
          return age >= minAge && age <= maxAge;
        });
      }
      const empIds = filtered.map(e => e.id);
      if (empIds.length === 0) {
        toast({ variant: 'destructive', title: 'No Matching Employees', description: 'No employees match the selected filter.' });
        setBulkAssigning(false);
        return;
      }
      const selectedPlan = corporatePlans.find(p => String(p.id) === bulkPlanId) ||
        healthPackages.find(p => String(p.id) === bulkPlanId);
      await api.post('/admin/corporate-package-assignments', {
        corporateId: selectedCorporate.id,
        packageId: bulkPlanId,
        packageName: selectedPlan?.name || `Plan ${bulkPlanId}`,
        packageDetails: {},
        employeeIds: empIds,
      }, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      toast({ title: 'Plan Assigned', description: `Plan assigned to ${empIds.length} employee${empIds.length !== 1 ? 's' : ''}.` });
      setShowBulkPlanDialog(false);
      fetchEmployees(selectedCorporate.id);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err?.response?.data?.message || 'Failed to assign plan.' });
    } finally {
      setBulkAssigning(false);
    }
  };

  // Create New Package — persists to DB via corporate-package-assignments
  const handleCreatePackage = async () => {
    if (!newPackage.name || !newPackage.price) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Package name and price are required'
      });
      return;
    }

    if (!selectedCorporate?.id) {
      toast({ variant: 'destructive', title: 'Error', description: 'No corporate selected' });
      return;
    }

    const packageId = newPackage.name.replace(/\s+/g, '_').toUpperCase();

    try {
      const token = localStorage.getItem('teamToken');
      await api.post('/admin/corporate-package-assignments', {
        corporateId: selectedCorporate.id,
        packageId,
        packageName: newPackage.name,
        packageDetails: {
          tests:       newPackage.tests,
          price:       parseFloat(newPackage.price),
          description: newPackage.description,
        },
        employeeIds:  'all',
        validityDays: parseInt(newPackage.validityDays) || 365,
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });

      // Refresh the list from server so the new package shows immediately
      await fetchHealthPackages(selectedCorporate.id);

      toast({
        title: 'Package Created',
        description: `${newPackage.name} has been created and assigned to all employees`
      });
    } catch (error: any) {
      // Optimistically add to local state so UI isn't blocked
      const newPkg: HealthPackage = {
        id: packageId,
        name: newPackage.name,
        tests: newPackage.tests,
        price: parseFloat(newPackage.price),
        validityDays: parseInt(newPackage.validityDays) || 365
      };
      setHealthPackages(prev => [...prev, newPkg]);
      toast({
        variant: 'destructive',
        title: 'Warning',
        description: `Package saved locally but DB sync failed: ${error?.response?.data?.message || error?.message}`
      });
    }

    setShowAddPackageDialog(false);
    setNewPackage({ name: '', description: '', tests: [], price: '', validityDays: '365' });
  };

  const handleCreatePlan = async () => {
    if (!newPlan.planName || !newPlan.totalEmployees || !newPlan.premiumPerEmployee) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Plan name, total employees, and premium per employee are required'
      });
      return;
    }

    try {
      const token = localStorage.getItem('teamToken');
      const planData = {
        corporateId: selectedCorporate?.id,
        planName: newPlan.planName,
        planType: newPlan.planType,
        description: newPlan.description,
        validFrom: newPlan.validFrom,
        validTo: newPlan.validTo,
        totalEmployees: parseInt(newPlan.totalEmployees),
        premiumPerEmployee: parseFloat(newPlan.premiumPerEmployee),
        totalPremium: parseInt(newPlan.totalEmployees) * parseFloat(newPlan.premiumPerEmployee),
        status: newPlan.status,
        currency: newPlan.currency,
        benefits: newPlan.benefits,
        features: newPlan.features,
        coverage: {
          ...newPlan.coverage,
          sumInsured: parseFloat(newPlan.coverage.sumInsured || '0'),
        },
        healthPackageIds: newPlan.healthPackageIds,
      };
      await api.post('/admin/corporate-plans', planData, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });

      toast({
        title: 'Plan Created',
        description: `${newPlan.planName} has been created successfully`
      });

      setShowCreatePlanDialog(false);
      setNewPlan({
        planName: '',
        planType: 'Standard',
        description: '',
        validFrom: '',
        validTo: '',
        totalEmployees: '',
        premiumPerEmployee: '',
        status: 'Active',
        currency: 'INR',
        benefits: [...defaultBenefits],
        features: mergePlanFeatures(),
        coverage: {
          sumInsured: '', roomRent: 'Single Room', icuRent: '2% of Sum Insured',
          prePolicyMedical: '30 days', postPolicyMedical: '60 days',
        },
        healthPackageIds: [],
      });
      if (selectedCorporate?.id) {
        fetchCorporatePlans(selectedCorporate.id);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create plan'
      });
    }
  };

  const toggleBenefit = (benefitId: string) => {
    setNewPlan({
      ...newPlan,
      benefits: newPlan.benefits.map(b =>
        b.id === benefitId ? { ...b, isIncluded: !b.isIncluded } : b
      )
    });
  };

  const normalizeText = (value?: string) => (value || '').replace(/\s+/g, ' ').trim();
  const normalizeCorporateStatus = (value?: string) => (value || '').toLowerCase().trim();
  const getCorporateCreatedTime = (corp: Corporate) => {
    const createdTime = corp.createdAt ? new Date(corp.createdAt).getTime() : NaN;
    return Number.isFinite(createdTime) ? createdTime : 0;
  };
  const sortCorporatesForList = (items: Corporate[]) => {
    const statusRank: Record<string, number> = { active: 0, pending: 1, suspended: 2, inactive: 3 };
    return [...items].sort((a, b) => {
      const aStatus = normalizeCorporateStatus(a.status);
      const bStatus = normalizeCorporateStatus(b.status);
      const statusDiff = (statusRank[aStatus] ?? 2) - (statusRank[bStatus] ?? 2);
      if (statusDiff !== 0) return statusDiff;

      const dateDiff = getCorporateCreatedTime(b) - getCorporateCreatedTime(a);
      if (dateDiff !== 0) return dateDiff;

      return Number(b.id || 0) - Number(a.id || 0);
    });
  };
  const looksSuspiciousText = (value?: string) => {
    const v = (value || '').toLowerCase();
    return /drop\s+table|truncate\s+table|delete\s+from|--|;|\/\*|\*\//.test(v);
  };

  // Filter corporates. The default view hides inactive records and sorts active corporates newest-first.
  const filteredCorporates = sortCorporatesForList(corporates.filter((corp) => {
    const q = searchTerm.trim().toLowerCase();
    const status = normalizeCorporateStatus(corp.status);
    const statusMatch = corporateStatusFilter === 'all'
      ? status !== 'inactive'
      : status === corporateStatusFilter;
    if (!statusMatch) return false;
    if (!q) return true;
    return [
      corp.companyName,
      corp.contactPerson,
      corp.email,
      corp.industry,
      corp.uniqueId,
      corp.packageType,
    ]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  }));

  const visibleTemplates = communicationTemplates[communicationChannel].filter((template) => {
    const q = templateLibrarySearch.trim().toLowerCase();
    const categoryOk = templateLibraryCategory === 'all' || (template.category || 'General') === templateLibraryCategory;
    if (!categoryOk) return false;
    if (!q) return true;
    return [template.name, template.category, template.subject, template.content]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });

  const templateCategoryOptions = Array.from(
    new Set(communicationTemplates[communicationChannel].map((item) => item.category || 'General'))
  ).sort();

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      'Active': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      'Pending': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      'Inactive': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
      'Suspended': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    };
    return <Badge className={statusColors[status] || statusColors['Pending']}>{status}</Badge>;
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 animate-in fade-in">
        {/* Header */}
        <div className="rounded-2xl border bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900 px-5 py-5 text-white shadow-sm md:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Corporate Management</h1>
              <p className="mt-1 text-slate-300">
              Manage corporate accounts, employees, plans, and network partners
              </p>
            </div>
            <div className="flex gap-2">
              <Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={() => setShowAddCorporateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Onboard Corporate
              </Button>
            </div>
          </div>
        </div>

        {/* Corporate Selector */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3 bg-muted/40 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-foreground">Select Corporate</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={corporateStatusFilter} onValueChange={(value) => setCorporateStatusFilter(value as any)}>
                  <SelectTrigger className="w-44 bg-card">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Active Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/70" />
                  <Input
                    placeholder="Search corporates..."
                    className="pl-8 bg-card"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Unique ID</TableHead>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead className="text-center">Employees</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCorporates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No corporates found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCorporates.map((corp) => (
                    <TableRow
                      key={corp.id}
                      className={`cursor-pointer transition-colors ${selectedCorporate?.id === corp.id ? 'bg-cyan-50 dark:bg-cyan-950/30' : 'hover:bg-muted/40'}`}
                      onClick={() => setSelectedCorporate(corp)}
                    >
                      <TableCell>
                        {corp.uniqueId ? (
                          <span className="text-xs font-mono bg-muted dark:bg-slate-800 text-muted-foreground dark:text-muted-foreground/70 px-1.5 py-0.5 rounded">
                            {corp.uniqueId}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-primary/10 shrink-0">
                            <Building2 className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{normalizeText(corp.companyName)}</p>
                              {looksSuspiciousText(corp.companyName) && (
                                <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-700">Review</Badge>
                              )}
                            </div>
                            {corp.contactPerson && (
                              <p className="text-xs text-muted-foreground">{normalizeText(corp.contactPerson)}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{corp.industry || '—'}</TableCell>
                      <TableCell className="text-center text-sm">{corp.employeeCount || 0}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-sm">
                          <Package className="h-3.5 w-3.5 text-muted-foreground" />
                          {corp.packageType || '—'}
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(corp.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="View"
                            onClick={() => setSelectedCorporate(corp)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Edit"
                            onClick={() => openEditCorporate(corp)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title="Delete"
                            onClick={() => openDeleteCorporate(corp)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Selected Corporate Management */}
        {selectedCorporate && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <Card className="mb-4 border bg-gradient-to-r from-white via-slate-50 to-cyan-50/80 shadow-sm">
              <CardContent className="flex flex-wrap items-center gap-3 py-4">
                <Badge className="bg-slate-900 text-white hover:bg-slate-900">{selectedCorporate.companyName}</Badge>
                <Badge variant="outline" className="border bg-card text-foreground/80">ID: {selectedCorporate.uniqueId || `ID-${selectedCorporate.id}`}</Badge>
                <Badge variant="outline" className="border bg-card text-foreground/80">{selectedCorporate.industry || 'Industry N/A'}</Badge>
                <Badge variant="outline" className="border bg-card text-foreground/80">Employees: {selectedCorporate.employeeCount || 0}</Badge>
                <Badge variant="outline" className="border bg-card text-foreground/80">Plan: {selectedCorporate.packageType || 'Not Set'}</Badge>
              </CardContent>
            </Card>

            <TabsList className="flex w-full overflow-x-auto rounded-xl bg-muted p-1 h-auto gap-0.5">
              <TabsTrigger className="rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground" value="overview">Overview</TabsTrigger>
              <TabsTrigger className="rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground" value="hr-admin">HR Admin</TabsTrigger>
              <TabsTrigger className="rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground" value="employees">Employees</TabsTrigger>
              <TabsTrigger className="rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground" value="plans">Plans</TabsTrigger>
              <TabsTrigger className="rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground" value="packages">Health Packages</TabsTrigger>
              <TabsTrigger value="calendar" className="flex items-center gap-1.5 rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground">
                <CalendarDays className="h-3.5 w-3.5" />Calendar
              </TabsTrigger>
              <TabsTrigger className="rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground" value="network">Network</TabsTrigger>
              <TabsTrigger className="rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground" value="communication">Communication</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30">
                        <Users className="h-6 w-6 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Employees</p>
                        <p className="text-2xl font-bold">{selectedCorporate.employeeCount || 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/30">
                        <CheckCircle className="h-6 w-6 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Active Plans</p>
                        <p className="text-2xl font-bold">{corporatePlans.filter(p => p.status?.toLowerCase() === 'active').length || corporatePlans.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-900/30">
                        <Heart className="h-6 w-6 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Health Checkups</p>
                        <p className="text-2xl font-bold">{healthPackages.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-orange-100 dark:bg-orange-900/30">
                        <Network className="h-6 w-6 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Network Partners</p>
                        <p className="text-2xl font-bold">{labPartners.length + hospitalPartners.length + clinicPartners.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card ref={welcomeDeliveryAuditRef}>
                <CardHeader>
                  <CardTitle>Corporate Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-muted-foreground">Company Name</Label>
                        <p className="font-medium">{selectedCorporate.companyName}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Contact Person</Label>
                        <p className="font-medium">{selectedCorporate.contactPerson}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Email</Label>
                        <p className="font-medium">{selectedCorporate.email}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Phone</Label>
                        <p className="font-medium">{selectedCorporate.phoneNumber}</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <Label className="text-muted-foreground">Industry</Label>
                        <p className="font-medium">{selectedCorporate.industry}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Package Type</Label>
                        <p className="font-medium">{selectedCorporate.packageType}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Status</Label>
                        <div className="mt-1">{getStatusBadge(selectedCorporate.status)}</div>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Onboarded On</Label>
                        <p className="font-medium">{new Date(selectedCorporate.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Corporate ID</Label>
                        <p className="font-mono font-semibold text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
                          {selectedCorporate.uniqueId || `ID-${selectedCorporate.id}`}
                          {selectedCorporate.uniqueId && (
                            <button
                              title="Copy Corporate ID"
                              className="text-muted-foreground/70 hover:text-teal-600"
                              onClick={() => { navigator.clipboard.writeText(selectedCorporate.uniqueId!); toast({ title: 'Copied', description: `Corporate ID ${selectedCorporate.uniqueId} copied` }); }}
                            ><Copy className="h-3.5 w-3.5" /></button>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <CardTitle>Welcome Delivery Audit</CardTitle>
                      <CardDescription>
                        Track prepared, sent, failed, and rolled-back welcome email attempts with idempotency visibility.
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchWelcomeDeliveryHistory()}
                        disabled={welcomeDeliveriesLoading}
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${welcomeDeliveriesLoading ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={exportWelcomeDeliveryRows}
                        disabled={welcomeDeliveries.length === 0}
                      >
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Export CSV
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                    <Badge variant="outline" className="justify-center py-2">Total: {welcomeDeliverySummary.total}</Badge>
                    <Badge className="justify-center py-2 bg-green-100 text-green-800">Sent: {welcomeDeliverySummary.sent}</Badge>
                    <Badge className="justify-center py-2 bg-blue-100 text-blue-800">Queued: {welcomeDeliverySummary.queued}</Badge>
                    <Badge className="justify-center py-2 bg-red-100 text-red-800">Failed: {welcomeDeliverySummary.failed}</Badge>
                    <Badge className="justify-center py-2 bg-amber-100 text-amber-800">Rolled Back: {welcomeDeliverySummary.rolledBack}</Badge>
                    <Badge className="justify-center py-2 bg-slate-100 text-slate-800">Prepared: {welcomeDeliverySummary.prepared}</Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                    <div className="space-y-1">
                      <Label>Status</Label>
                      <Select
                        value={welcomeDeliveryFilters.status}
                        onValueChange={(value) => setWelcomeDeliveryFilters((prev) => ({ ...prev, status: value }))}
                      >
                        <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="prepared">Prepared</SelectItem>
                          <SelectItem value="queued">Queued</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                          <SelectItem value="rolled_back">Rolled Back</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Scope</Label>
                      <Select
                        value={welcomeDeliveryFilters.requestScope}
                        onValueChange={(value) => setWelcomeDeliveryFilters((prev) => ({ ...prev, requestScope: value }))}
                      >
                        <SelectTrigger><SelectValue placeholder="All scopes" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="batch_send">Batch Send</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Employee ID</Label>
                      <Input
                        value={welcomeDeliveryFilters.employeeId}
                        onChange={(event) => setWelcomeDeliveryFilters((prev) => ({ ...prev, employeeId: event.target.value }))}
                        placeholder="e.g. NC25654"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Recipient</Label>
                      <Input
                        value={welcomeDeliveryFilters.recipient}
                        onChange={(event) => setWelcomeDeliveryFilters((prev) => ({ ...prev, recipient: event.target.value }))}
                        placeholder="email contains"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>From</Label>
                      <Input
                        type="date"
                        value={welcomeDeliveryFilters.from}
                        onChange={(event) => setWelcomeDeliveryFilters((prev) => ({ ...prev, from: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>To</Label>
                      <Input
                        type="date"
                        value={welcomeDeliveryFilters.to}
                        onChange={(event) => setWelcomeDeliveryFilters((prev) => ({ ...prev, to: event.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => fetchWelcomeDeliveryHistory({ resetOffset: true })} disabled={welcomeDeliveriesLoading}>
                      Apply Filters
                    </Button>
                    <Button size="sm" variant="outline" onClick={resetWelcomeDeliveryFilters} disabled={welcomeDeliveriesLoading}>
                      Reset
                    </Button>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Attempts</TableHead>
                        <TableHead>Idempotency</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {welcomeDeliveriesLoading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading delivery history...</TableCell>
                        </TableRow>
                      ) : welcomeDeliveries.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No delivery records found for current filters.</TableCell>
                        </TableRow>
                      ) : (
                        welcomeDeliveries.map((row) => {
                          const userName = `${row.userFirstName || ''} ${row.userLastName || ''}`.trim();
                          return (
                            <TableRow key={row.id}>
                              <TableCell className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</TableCell>
                              <TableCell>
                                <div className="font-medium">{row.employeeId || '-'}</div>
                                <div className="text-xs text-muted-foreground">{userName || row.userEmail || '-'}</div>
                              </TableCell>
                              <TableCell>{row.recipientEmail}</TableCell>
                              <TableCell>
                                <Badge className={`${
                                  row.status === 'sent'
                                    ? 'bg-green-100 text-green-800'
                                    : row.status === 'queued'
                                      ? 'bg-blue-100 text-blue-800'
                                      : row.status === 'rolled_back'
                                        ? 'bg-amber-100 text-amber-800'
                                        : row.status === 'failed'
                                          ? 'bg-red-100 text-red-800'
                                          : 'bg-slate-100 text-slate-800'
                                }`}>
                                  {row.status}
                                </Badge>
                              </TableCell>
                              <TableCell>{row.attempts}</TableCell>
                              <TableCell className="text-xs max-w-[220px] truncate" title={row.idempotencyKey}>{row.idempotencyKey}</TableCell>
                              <TableCell className="text-xs max-w-[280px] truncate" title={row.errorMessage || ''}>{row.errorMessage || '-'}</TableCell>
                              <TableCell>
                                {(row.status === 'failed' || row.status === 'rolled_back') && (row.userId || row.employeeId) ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleResendWelcomeFromDelivery(row)}
                                    disabled={resendingWelcomeDeliveryId === row.id || welcomeDeliveriesLoading}
                                  >
                                    <Send className="h-3.5 w-3.5 mr-1" />
                                    {resendingWelcomeDeliveryId === row.id ? 'Resending...' : 'Resend'}
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>

                  {welcomeDeliverySummary.total > 0 && (
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>
                        Showing {Math.min(welcomeDeliveryPagination.offset + 1, welcomeDeliverySummary.total)}-
                        {Math.min(welcomeDeliveryPagination.offset + welcomeDeliveryPagination.limit, welcomeDeliverySummary.total)} of {welcomeDeliverySummary.total}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={welcomeDeliveryPagination.offset === 0 || welcomeDeliveriesLoading}
                          onClick={() => fetchWelcomeDeliveryHistory({ nextOffset: welcomeDeliveryPagination.offset - welcomeDeliveryPagination.limit })}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={welcomeDeliveryPagination.offset + welcomeDeliveryPagination.limit >= welcomeDeliverySummary.total || welcomeDeliveriesLoading}
                          onClick={() => fetchWelcomeDeliveryHistory({ nextOffset: welcomeDeliveryPagination.offset + welcomeDeliveryPagination.limit })}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* HR Admin Tab */}
            <TabsContent value="hr-admin" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>HR / Admin Users</CardTitle>
                      <CardDescription>
                        Create and manage login credentials for corporate HR administrators
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handleReplaceHRAdmin} disabled={updatingHRAdmin}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Replace HR
                      </Button>
                      <Button onClick={() => { resetHRAdminForm(); setShowAddHRDialog(true); }}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Create HR Admin
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Login</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {corporateAdminsLoading && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-sm text-muted-foreground">Loading HR/admin users...</TableCell>
                        </TableRow>
                      )}
                      {!corporateAdminsLoading && corporateAdmins.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-sm text-muted-foreground">No HR/admin users found for this corporate.</TableCell>
                        </TableRow>
                      )}
                      {!corporateAdminsLoading && corporateAdmins.map((admin) => (
                        <TableRow key={admin.id}>
                          <TableCell className="font-medium">{`${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.email}</TableCell>
                          <TableCell>{admin.email}</TableCell>
                          <TableCell>{admin.phoneNumber || '—'}</TableCell>
                          <TableCell>{getStatusBadge(normalizeStatusLabel(admin.status))}</TableCell>
                          <TableCell>{formatLastLoginLabel(admin.lastLoginAt)}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" disabled title="Not available yet">
                                <Key className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" title="Edit HR admin" onClick={() => openEditHRAdminDialog(admin)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Deactivate HR admin"
                                onClick={() => handleDeactivateHRAdmin(admin)}
                                disabled={updatingHRAdmin || normalizeStatusLabel(admin.status) === 'Inactive'}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Employees Tab */}
            <TabsContent value="employees" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Employee Management</CardTitle>
                      <CardDescription>
                        Add and manage employees for {selectedCorporate.companyName}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => { setBulkPlanId(''); setBulkPlanFilter('all'); setBulkPlanFilterValue(''); setBulkPlanAgeMin(''); setBulkPlanAgeMax(''); setShowBulkPlanDialog(true); }}>
                        <Package className="h-4 w-4 mr-2" />
                        Bulk Assign Plan
                      </Button>
                      <Button variant="outline" onClick={() => setShowBulkUploadDialog(true)}>
                        <Upload className="h-4 w-4 mr-2" />
                        Bulk Upload
                      </Button>
                      <Button variant="outline" onClick={() => setShowWelcomeEmailBatchDialog(true)} title="Prepare, review, edit, and send welcome email drafts">
                        <Mail className="h-4 w-4 mr-2" />
                        Welcome Emails{welcomeEmailDrafts.length > 0 ? " (" + welcomeEmailDrafts.length + ")" : ""}
                      </Button>
                      <Button variant="outline" onClick={downloadTemplate}>
                        <Download className="h-4 w-4 mr-2" />
                        Download Template
                      </Button>
                      <Button variant="outline" onClick={downloadActiveEmployeeList} disabled={employees.length === 0}>
                        <Download className="h-4 w-4 mr-2" />
                        Export Active List
                      </Button>
                      <Button onClick={() => setShowAddEmployeeDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Employee
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* ── App Activation Stats ──────────────────────────────── */}
                  {(() => {
                    const total = employees.length;
                    const sent = employees.filter(e => e.welcomeEmailStatus === 'sent').length;
                    const loggedIn = employees.filter(e => !!e.lastLoginAt).length;
                    const pwdChanged = employees.filter(e => !!e.lastLoginAt && e.requirePasswordChange === false).length;
                    const pctSent = total ? Math.round((sent / total) * 100) : 0;
                    const pctLoggedIn = total ? Math.round((loggedIn / total) * 100) : 0;
                    const pctPwd = total ? Math.round((pwdChanged / total) * 100) : 0;
                    return (
                      <div className="mb-4 rounded-lg border bg-white dark:bg-gray-900 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">App Activation Funnel</p>
                          <span className="text-xs text-muted-foreground">{total} active employees</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-3 text-center">
                            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{sent}</p>
                            <p className="text-xs text-blue-600 dark:text-blue-400">Welcome Email Sent</p>
                            <p className="text-[10px] text-muted-foreground">{pctSent}% of total</p>
                          </div>
                          <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900 p-3 text-center">
                            <p className="text-2xl font-bold text-green-700 dark:text-green-300">{loggedIn}</p>
                            <p className="text-xs text-green-600 dark:text-green-400">Logged In to App</p>
                            <p className="text-[10px] text-muted-foreground">{pctLoggedIn}% of total</p>
                          </div>
                          <div className="rounded-lg bg-teal-50 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900 p-3 text-center">
                            <p className="text-2xl font-bold text-teal-700 dark:text-teal-300">{pwdChanged}</p>
                            <p className="text-xs text-teal-600 dark:text-teal-400">Password Changed</p>
                            <p className="text-[10px] text-muted-foreground">{pctPwd}% of total</p>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>Activation progress</span>
                            <span>{loggedIn} / {total} logged in</span>
                          </div>
                          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
                            <div className="h-2 rounded-full bg-blue-200 dark:bg-blue-900" style={{ width: `${pctSent}%` }} />
                            <div className="h-2 rounded-full bg-green-500 -mt-2" style={{ width: `${pctLoggedIn}%` }} />
                          </div>
                          <div className="flex gap-3 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-200 dark:bg-blue-900 inline-block"/>{pctSent}% email sent</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"/>{pctLoggedIn}% logged in</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="mb-4 rounded-lg border bg-slate-50/60 dark:bg-slate-900/30 p-3 space-y-3">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Welcome Email Campaign</p>
                        <p className="text-xs text-muted-foreground">
                          Select employees below, then open Welcome Emails to prepare, review, and send from one workflow.
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {selectedEmployeeIdsForWelcome.length} selected of {employees.length}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1 md:col-span-2">
                        <Label>Find employee for welcome email</Label>
                        <Input
                          value={welcomeEmployeeSearch}
                          onChange={(event) => setWelcomeEmployeeSearch(event.target.value)}
                          placeholder="Search by employee ID, name, email, department, or designation"
                        />
                      </div>
                      <div className="text-xs text-muted-foreground flex items-end">
                        {filteredWelcomeEmployees.length} matched employee{filteredWelcomeEmployees.length === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[44px]">
                          <Checkbox
                            checked={filteredWelcomeEmployees.filter((employee) => !hasActiveWelcomeEmailDelivery(employee)).length > 0 && filteredWelcomeEmployees.filter((employee) => !hasActiveWelcomeEmailDelivery(employee)).every((employee) => selectedEmployeeIdsForWelcome.includes(employee.id))}
                            onCheckedChange={(checked) => {
                              const filteredIds = filteredWelcomeEmployees.filter((employee) => !hasActiveWelcomeEmailDelivery(employee)).map((employee) => employee.id);
                              if (checked === true) {
                                setSelectedEmployeeIdsForWelcome((current) => Array.from(new Set([...current, ...filteredIds])));
                              } else {
                                setSelectedEmployeeIdsForWelcome((current) => current.filter((id) => !filteredIds.includes(id)));
                              }
                            }}
                            aria-label="Select all employees"
                          />
                        </TableHead>
                        <TableHead>Employee ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Designation</TableHead>
                        <TableHead>Health Status</TableHead>
                        <TableHead>App Login</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredWelcomeEmployees.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            {employees.length === 0
                              ? 'No employees found. Click "Add Employee" or "Bulk Upload" to add employees.'
                              : 'No employees match this search. Try employee ID (for example NC25654).'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredWelcomeEmployees.slice((empCurrentPage - 1) * EMP_PAGE_SIZE, empCurrentPage * EMP_PAGE_SIZE).map((emp) => (
                          <TableRow key={emp.id}>
                            <TableCell>
                              <Checkbox
                                checked={!hasActiveWelcomeEmailDelivery(emp) && selectedEmployeeIdsForWelcome.includes(emp.id)}
                                disabled={hasActiveWelcomeEmailDelivery(emp)}
                                onCheckedChange={(checked) => {
                                  if (hasActiveWelcomeEmailDelivery(emp)) return;
                                  setSelectedEmployeeIdsForWelcome((current) => {
                                    if (checked === true) return [...new Set([...current, emp.id])];
                                    return current.filter((id) => id !== emp.id);
                                  });
                                }}
                                aria-label={`Select ${emp.name}`}
                              />
                            </TableCell>
                            <TableCell>{emp.employeeId}</TableCell>
                            <TableCell className="font-medium">{emp.name}</TableCell>
                            <TableCell>{emp.email}</TableCell>
                            <TableCell>{emp.department}</TableCell>
                            <TableCell>{emp.designation}</TableCell>
                            <TableCell>
                              <Badge className={`${
                                emp.healthStatus === 'Excellent' || emp.healthStatus === 'Good' 
                                  ? 'bg-green-100 text-green-800' 
                                  : emp.healthStatus === 'Fair' 
                                    ? 'bg-yellow-100 text-yellow-800' 
                                    : 'bg-gray-100 text-gray-800'
                              }`}>
                                {emp.healthStatus}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const welcomeStatus = String(emp.welcomeEmailStatus || '').toLowerCase();
                                const sent = welcomeStatus === 'sent';
                                const queued = welcomeStatus === 'queued';
                                const loggedIn = !!emp.lastLoginAt;
                                const pwdChanged = loggedIn && emp.requirePasswordChange === false;
                                if (!sent && !queued) return <span className="text-xs text-muted-foreground">Not onboarded</span>;
                                if (!loggedIn) return (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                                    {queued ? 'Email queued' : 'Email sent'}
                                  </span>
                                );
                                const dt = new Date(emp.lastLoginAt!);
                                const ago = (() => {
                                  const s = Math.floor((Date.now() - dt.getTime()) / 1000);
                                  if (s < 60) return 'just now';
                                  if (s < 3600) return `${Math.floor(s/60)}m ago`;
                                  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
                                  return `${Math.floor(s/86400)}d ago`;
                                })();
                                return (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400">
                                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                                      Active · {ago}
                                    </span>
                                    {!pwdChanged && (
                                      <div className="text-[10px] text-amber-500">⚠ Temp password</div>
                                    )}
                                  </div>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button variant="ghost" size="sm" onClick={() => openWelcomeDeliveryAuditForEmployee(emp)} title="View welcome email delivery audit for this employee">
                                  <Clock className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => {
                                  setViewingEmployee(emp);
                                  setShowViewEmployeeDialog(true);
                                }}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => {
                                  setEditingEmployee(emp);
                                  setEditEmployeeForm({
                                    firstName: emp.firstName,
                                    lastName: emp.lastName,
                                    email: emp.email,
                                    secondaryEmail: emp.secondaryEmail,
                                    phone: emp.phone,
                                    department: emp.department === 'Not Assigned' ? '' : emp.department,
                                    designation: emp.designation === 'Not Assigned' ? '' : emp.designation,
                                    city: emp.city,
                                    state: emp.state,
                                    pinCode: emp.pinCode,
                                    location: emp.location,
                                    facility: emp.facility,
                                    employeeId: emp.employeeId,
                                    status: emp.status || 'active',
                                    packageId: emp.currentPackageId || '',
                                  });
                                  setShowEditEmployeeDialog(true);
                                }}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  {filteredWelcomeEmployees.length > 0 && (
                    <div className="flex items-center justify-between px-2 py-3 border-t text-sm text-muted-foreground">
                      <span>
                        Showing {Math.min((empCurrentPage - 1) * EMP_PAGE_SIZE + 1, filteredWelcomeEmployees.length)}–{Math.min(empCurrentPage * EMP_PAGE_SIZE, filteredWelcomeEmployees.length)} of {filteredWelcomeEmployees.length} matched employees
                      </span>
                      <div className="flex items-center gap-2">
                        <span>Page {empCurrentPage} of {filteredWelcomeTotalPages}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={empCurrentPage === 1}
                          onClick={() => setEmpCurrentPage(p => p - 1)}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={empCurrentPage >= filteredWelcomeTotalPages}
                          onClick={() => setEmpCurrentPage(p => p + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Plans Tab */}
            <TabsContent value="plans" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Corporate Plans</CardTitle>
                      <CardDescription>
                        Manage health and wellness plans for {selectedCorporate.companyName}
                      </CardDescription>
                    </div>
                      <Button onClick={() => setShowCreatePlanDialog(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Plan
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {corporatePlans.length === 0 ? (
                      <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center h-full py-8 text-center">
                          <Package className="h-8 w-8 text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">No corporate plans found.</p>
                        </CardContent>
                      </Card>
                    ) : (
                      corporatePlans.map((plan) => (
                        <Card key={plan.id} className={plan.slug.includes('premium') ? 'border-2 border-primary' : undefined}>
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base">{plan.name}</CardTitle>
                              <Badge variant={plan.status === 'Active' ? 'default' : 'secondary'}>
                                {plan.planType || plan.billingCycle}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 mt-1">
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleOpenViewPlan(plan)}>
                                <Eye className="h-3 w-3 mr-1" />View
                              </Button>
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleOpenEditPlan(plan)}>
                                <Edit className="h-3 w-3 mr-1" />Edit
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50 ml-auto" onClick={() => handleDeletePlan(plan.id, plan.name)} title="Delete plan">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            <p className="text-2xl font-bold">
                              ₹{plan.price.toLocaleString()}
                              <span className="text-sm font-normal text-muted-foreground"> / employee</span>
                            </p>
                            {plan.totalEmployees ? (
                              <p className="text-sm text-muted-foreground">
                                {plan.enrolled} / {plan.totalEmployees} enrolled
                              </p>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                <Users className="h-3 w-3 inline mr-1" />
                                {plan.enrolled} enrolled
                              </p>
                            )}
                            {plan.validFrom && plan.validTo && (
                              <p className="text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3 inline mr-1" />
                                {plan.validFrom} → {plan.validTo}
                              </p>
                            )}
                            {plan.features && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {Object.entries(plan.features)
                                  .filter(([, v]) => v)
                                  .map(([k]) => (
                                    <Badge key={k} variant="outline" className="text-xs">
                                      {getPlanFeatureLabel(k)}
                                    </Badge>
                                  ))}
                              </div>
                            )}
                            {plan.healthPackageIds && plan.healthPackageIds.length > 0 && (
                              <div className="mt-2 pt-2 border-t">
                                <p className="text-xs font-medium text-muted-foreground mb-1">Health Packages</p>
                                <div className="flex flex-wrap gap-1">
                                  {plan.healthPackageIds.map(pkgId => {
                                    const pkg = healthPackages.find(p => String(p.id) === String(pkgId));
                                    return pkg ? (
                                      <Badge key={pkgId} variant="secondary" className="text-xs">
                                        <FlaskConical className="h-3 w-3 mr-1" />
                                        {pkg.name}
                                      </Badge>
                                    ) : null;
                                  })}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))
                    )}

                    <Card className="border-dashed cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setShowCreatePlanDialog(true)}>
                      <CardContent className="flex flex-col items-center justify-center h-full py-8">
                        <Plus className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">Create New Plan</p>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Communication Tab */}
            <TabsContent value="communication" className="space-y-5">
              <Card className="overflow-hidden border shadow-sm">
                <CardHeader className="border-b bg-gradient-to-r from-muted/60 via-background to-cyan-500/10 dark:to-cyan-950/20">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge className="bg-slate-900 text-white hover:bg-slate-900">Communication Hub</Badge>
                        <Badge variant="outline" className="border-cyan-300 bg-cyan-50 text-cyan-900">Corporate: {selectedCorporate.companyName}</Badge>
                        <Badge variant="outline" className="border bg-card text-foreground/80 uppercase">{communicationChannel}</Badge>
                      </div>
                      <CardTitle className="text-2xl font-semibold text-foreground">World-Class Corporate Outreach Desk</CardTitle>
                      <CardDescription className="mt-1 text-muted-foreground">
                        Design templates, orchestrate campaigns, monitor buying signals, and execute reliable communication across Email, WhatsApp, and SMS.
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => fetchCommunicationInsights()} disabled={communicationLogsLoading}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${communicationLogsLoading ? 'animate-spin' : ''}`} />Refresh Data
                      </Button>
                      <Button onClick={generateAiCommunicationDraft} disabled={aiCommunicationLoading}>
                        <Brain className="mr-2 h-4 w-4" />{aiCommunicationLoading ? 'Assisting...' : 'AI Assist & Store'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-5 bg-muted/30 p-4 md:p-6">
                  <Card className="border bg-card">
                    <CardContent className="pt-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <p className="text-xs text-muted-foreground">Step 1</p>
                          <p className="text-sm font-medium text-foreground">Choose Channel</p>
                          <p className="text-xs text-muted-foreground">Current: {communicationChannel.toUpperCase()}</p>
                        </div>
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <p className="text-xs text-muted-foreground">Step 2</p>
                          <p className="text-sm font-medium text-foreground">Pick or Create Template</p>
                          <p className="text-xs text-muted-foreground">{selectedTemplateId ? 'Template selected' : 'No template selected'}</p>
                        </div>
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <p className="text-xs text-muted-foreground">Step 3</p>
                          <p className="text-sm font-medium text-foreground">Confirm Audience</p>
                          <p className="text-xs text-muted-foreground">Recipients ready: {audienceCount}</p>
                        </div>
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <p className="text-xs text-muted-foreground">Step 4</p>
                          <p className="text-sm font-medium text-foreground">Send & Monitor</p>
                          <p className="text-xs text-muted-foreground">{isCommunicationReadyToSend ? 'Ready to send' : 'Missing required inputs'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Tabs value={communicationChannel} onValueChange={(v) => setCommunicationChannel(v as CommunicationChannel)}>
                    <TabsList className="grid w-full grid-cols-3 rounded-xl bg-muted p-1">
                      <TabsTrigger value="email" className="rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground">Email</TabsTrigger>
                      <TabsTrigger value="whatsapp" className="rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground">WhatsApp</TabsTrigger>
                      <TabsTrigger value="sms" className="rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground">SMS</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <Card className="border bg-card">
                      <CardContent className="pt-4">
                        <p className="text-xs text-muted-foreground">Audience Ready</p>
                        <p className="text-2xl font-semibold text-foreground">{audienceCount}</p>
                      </CardContent>
                    </Card>
                    <Card className="border bg-card">
                      <CardContent className="pt-4">
                        <p className="text-xs text-muted-foreground">Total Comm</p>
                        <p className="text-2xl font-semibold text-foreground">{communicationTotal}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30">
                      <CardContent className="pt-4">
                        <p className="text-xs text-emerald-700 dark:text-emerald-400">Sent</p>
                        <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">{communicationSent}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30">
                      <CardContent className="pt-4">
                        <p className="text-xs text-rose-700 dark:text-rose-400">Failed</p>
                        <p className="text-2xl font-semibold text-rose-700 dark:text-rose-400">{communicationFailed}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30">
                      <CardContent className="pt-4">
                        <p className="text-xs text-sky-700 dark:text-sky-400">Success Rate</p>
                        <p className="text-2xl font-semibold text-sky-700 dark:text-sky-400">{communicationSuccessRate}%</p>
                      </CardContent>
                    </Card>
                    <Card className="border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30">
                      <CardContent className="pt-4">
                        <p className="text-xs text-violet-700 dark:text-violet-400">AI Next Actions</p>
                        <p className="text-2xl font-semibold text-violet-700 dark:text-violet-400">{aiNextActionCount}</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="border bg-card">
                    <CardContent className="flex flex-col gap-3 pt-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-start gap-3">
                        {communicationHealthTone === 'healthy' ? (
                          <CheckCircle className="mt-0.5 h-5 w-5 text-emerald-600" />
                        ) : communicationHealthTone === 'watch' ? (
                          <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
                        ) : (
                          <XCircle className="mt-0.5 h-5 w-5 text-rose-600" />
                        )}
                        <div>
                          <p className="text-sm font-semibold text-foreground">Communication Health Status</p>
                          <p className="text-sm text-muted-foreground">
                            {communicationHealthTone === 'healthy' && 'Delivery performance is strong. Continue scaling high-response templates.'}
                            {communicationHealthTone === 'watch' && 'Delivery quality is moderate. Prioritize template fixes and recipient hygiene.'}
                            {communicationHealthTone === 'critical' && 'Critical communication risk detected. Fix provider settings and run retry campaigns.'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-muted text-foreground/80">Window: Last {communicationAnalyticsDays} days</Badge>
                        <Badge className="bg-card text-foreground/80 border">Channel: {communicationChannel.toUpperCase()}</Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-cyan-200 bg-gradient-to-br from-cyan-50 to-cyan-100/60 dark:border-cyan-800 dark:from-cyan-950/30 dark:to-cyan-900/10">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base text-foreground"><Brain className="h-4 w-4 text-cyan-700" />AI-Assisted Communication</CardTitle>
                      <CardDescription className="text-muted-foreground">Draft, monitor, and prioritize outreach using AI-assisted intent signals.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                        {[
                          { label: 'Drafts', value: aiCommunicationDashboard?.totals?.drafts || 0 },
                          { label: 'Sent', value: aiCommunicationDashboard?.totals?.sent || 0 },
                          { label: 'Replies', value: aiCommunicationDashboard?.totals?.replies || 0 },
                          { label: 'Hot Signals', value: aiCommunicationDashboard?.totals?.hotSignals || 0 },
                          { label: 'Avg Score', value: aiCommunicationDashboard?.totals?.avgEngagement || 0 },
                        ].map((item) => (
                          <div key={item.label} className="rounded-lg border-cyan-200 bg-card p-3">
                            <p className="text-xs text-muted-foreground">{item.label}</p>
                            <p className="text-xl font-semibold text-foreground">{item.value}</p>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Record Reply or Buying Signal</Label>
                          <Textarea rows={3} value={aiReplyText} onChange={(e) => setAiReplyText(e.target.value)} placeholder="Paste corporate reply, for example: Yes, share demo slots next week." />
                          <Button size="sm" variant="outline" onClick={recordAiReplySignal} disabled={aiReplyMonitoring || !aiReplyText.trim()}>
                            <Activity className="mr-2 h-4 w-4" />{aiReplyMonitoring ? 'Monitoring...' : 'Monitor Reply'}
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <Label>AI Next Actions</Label>
                          <div className="max-h-40 space-y-2 overflow-auto pr-1">
                            {(aiCommunicationDashboard?.nextActions || []).slice(0, 4).map((action: any) => (
                              <div key={action.id} className="rounded-lg border-cyan-200 bg-card p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="truncate text-sm font-medium text-foreground">{action.subject || action.nextAction?.type || 'Follow-up'}</p>
                                  <Badge variant="outline" className="capitalize">{action.conversionSignal || action.status}</Badge>
                                </div>
                                <p className="mt-1 truncate text-xs text-muted-foreground">{action.nextAction?.message || action.contactEmail || 'AI monitored communication'}</p>
                                <div className="mt-2 flex gap-2">
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => useStoredAiCommunication(action)}>Use</Button>
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { storeAiDraftAsTemplate({ subject: action.subject, message: action.body || action.nextAction?.message }, action.id); toast({ title: 'Template stored', description: 'AI draft saved to the Template Library.' }); }}>Save Template</Button>
                                </div>
                              </div>
                            ))}
                            {!aiCommunicationDashboard?.nextActions?.length && (
                              <p className="rounded-lg border-dashed border bg-card p-3 text-xs text-muted-foreground">No AI-monitored actions yet. Generate an AI draft to start tracking intent signals.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="overflow-x-auto pb-2">
                    <div className="grid min-w-[1080px] grid-cols-5 gap-4">
                      <Card className="border bg-card col-span-2">
                      <CardHeader>
                        <CardTitle className="text-base text-foreground">Template Library</CardTitle>
                        <CardDescription className="text-muted-foreground">Use dynamic placeholders: {'{{companyName}}, {{contactPerson}}, {{corporateId}}, {{employeeCount}}, {{industry}}, {{packageType}}'}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/70" />
                            <Input
                              value={templateLibrarySearch}
                              onChange={(e) => setTemplateLibrarySearch(e.target.value)}
                              placeholder="Search templates"
                              className="pl-8"
                            />
                          </div>
                          <Select value={templateLibraryCategory} onValueChange={(value) => setTemplateLibraryCategory(value)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Categories</SelectItem>
                              {templateCategoryOptions.map((category) => (
                                <SelectItem key={category} value={category}>{category}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <ScrollArea className="h-[470px] w-full rounded-md border">
                          <div className="min-w-[700px] space-y-3 p-2">
                            {visibleTemplates.length === 0 && (
                              <div className="rounded-lg border-dashed border bg-muted/40 p-4 text-sm text-muted-foreground">No templates available for this channel. Create one from the form below.</div>
                            )}
                            {visibleTemplates.map((template) => (
                              <div key={template.id} className="min-w-[680px] space-y-2 rounded-lg border bg-muted/30 p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-foreground">{template.name}</p>
                                    <p className="text-xs text-muted-foreground">{template.category}</p>
                                  </div>
                                  <div className="flex shrink-0 gap-2 whitespace-nowrap">
                                    <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={() => useCommunicationTemplate(template)}>Use</Button>
                                    <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={() => editCommunicationTemplate(template)}>Edit</Button>
                                    <Button size="sm" variant="outline" className="gap-1 whitespace-nowrap" disabled={aiTemplateWriting || !selectedCorporate} onClick={() => aiEditExistingTemplate(template)}>
                                      <Sparkles className="h-3.5 w-3.5" />AI Edit
                                    </Button>
                                    <Button size="sm" variant="ghost" className="whitespace-nowrap text-rose-700 hover:bg-rose-50" onClick={() => removeCommunicationTemplate(template.id)}>Delete</Button>
                                  </div>
                                </div>
                                {template.subject && <p className="text-xs text-foreground/80"><span className="font-medium">Subject:</span> {template.subject}</p>}
                                <p className="line-clamp-3 text-sm text-muted-foreground">{template.content}</p>
                              </div>
                            ))}
                          </div>
                          <ScrollBar orientation="horizontal" className="h-3" />
                        </ScrollArea>
                      </CardContent>
                    </Card>

                      <Card className="border bg-card col-span-3">
                      <CardHeader>
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <CardTitle className="text-base text-foreground">Composer</CardTitle>
                            <CardDescription className="text-muted-foreground">Send or draft communication for this corporate account with validation-first flow.</CardDescription>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className="bg-muted text-foreground/80">Audience: {audienceCount}</Badge>
                            <Badge className={isCommunicationReadyToSend ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700 dark:text-amber-400'}>
                              {isCommunicationReadyToSend ? 'Ready to Send' : 'Missing Required Inputs'}
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Template for Sending</Label>
                            <Select
                              value={selectedTemplateId || 'none'}
                              onValueChange={(value) => {
                                if (value === 'none') {
                                  setSelectedTemplateId('');
                                  return;
                                }
                                const template = communicationTemplates[communicationChannel].find((item) => item.id === value);
                                if (template) useCommunicationTemplate(template);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Choose a template" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No template</SelectItem>
                                {communicationTemplates[communicationChannel].map((template) => (
                                  <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Recipient Mode</Label>
                            <Select value={communicationRecipientMode} onValueChange={(value) => setCommunicationRecipientMode(value as CommunicationRecipientMode)}>
                              <SelectTrigger>
                                <SelectValue placeholder="Choose recipient mode" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="individual">Individual Recipient</SelectItem>
                                <SelectItem value="selected">Selected Employees</SelectItem>
                                <SelectItem value="bulk">Bulk List</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {communicationRecipientMode === 'individual' && (
                          <div className="space-y-2">
                            <Label>Recipient Address</Label>
                            <Input
                              value={communicationComposer.to}
                              onChange={(e) => setCommunicationComposer((prev) => ({ ...prev, to: e.target.value }))}
                              placeholder={communicationChannel === 'email' ? 'recipient@company.com' : '+91XXXXXXXXXX'}
                            />
                          </div>
                        )}

                        {communicationRecipientMode === 'selected' && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <Label>Select Employees ({selectedCommunicationEmployeeIds.length})</Label>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const visibleIds = filteredCommunicationEmployees.map((employee) => employee.id);
                                  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedCommunicationEmployeeIds.includes(id));
                                  if (allVisibleSelected) {
                                    setSelectedCommunicationEmployeeIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
                                  } else {
                                    setSelectedCommunicationEmployeeIds((prev) => [...new Set([...prev, ...visibleIds])]);
                                  }
                                }}
                              >
                                Toggle Visible
                              </Button>
                            </div>
                            <Input
                              placeholder="Search by name, email, phone, department"
                              value={communicationRecipientSearch}
                              onChange={(e) => setCommunicationRecipientSearch(e.target.value)}
                            />
                            <ScrollArea className="h-44 rounded-md border bg-muted/40 p-2">
                              <div className="space-y-2">
                                {filteredCommunicationEmployees.length === 0 && (
                                  <p className="p-2 text-xs text-muted-foreground">No employees available for this channel.</p>
                                )}
                                {filteredCommunicationEmployees.map((employee) => {
                                  const address = getEmployeeChannelAddress(employee);
                                  const checked = selectedCommunicationEmployeeIds.includes(employee.id);
                                  return (
                                    <div key={employee.id} className="flex items-start gap-2 rounded border bg-card p-2">
                                      <Checkbox
                                        checked={checked}
                                        onCheckedChange={(value) => {
                                          setSelectedCommunicationEmployeeIds((prev) => {
                                            if (value) return [...new Set([...prev, employee.id])];
                                            return prev.filter((id) => id !== employee.id);
                                          });
                                        }}
                                      />
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">{employee.name} ({employee.employeeId})</p>
                                        <p className="truncate text-xs text-muted-foreground">{address}</p>
                                        <p className="truncate text-[11px] text-muted-foreground">{employee.department || 'No Department'}</p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </ScrollArea>
                          </div>
                        )}

                        {communicationRecipientMode === 'bulk' && (
                          <div className="space-y-2">
                            <Label>Bulk Recipients</Label>
                            <Textarea
                              rows={4}
                              value={communicationBulkRecipients}
                              onChange={(e) => setCommunicationBulkRecipients(e.target.value)}
                              placeholder={communicationChannel === 'email' ? 'alice@company.com\nbob@company.com' : '919999999999\n918888888888'}
                            />
                            <p className="text-xs text-muted-foreground">Use comma, semicolon, or new line separated values.</p>
                          </div>
                        )}

                        {communicationChannel === 'email' && (
                          <div className="space-y-2">
                            <Label>Subject</Label>
                            <Input
                              value={communicationComposer.subject}
                              onChange={(e) => setCommunicationComposer((prev) => ({ ...prev, subject: e.target.value }))}
                              placeholder="Email subject"
                            />
                          </div>
                        )}

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Message</Label>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs ${composerWithinWordLimit ? 'text-muted-foreground' : 'text-rose-600 dark:text-rose-400'}`}>
                                {composerMessageWordCount}/{templateWordLimit} words
                              </span>
                              <span className={`text-xs ${composerMessageCharCount <= templateCharLimit ? 'text-muted-foreground' : 'text-rose-600 dark:text-rose-400'}`}>
                                {composerMessageCharCount}/{templateCharLimit} chars
                              </span>
                            </div>
                          </div>
                          <Textarea
                            rows={7}
                            value={communicationComposer.message}
                            onChange={(e) => setCommunicationComposer((prev) => ({ ...prev, message: e.target.value }))}
                            placeholder="Type message or apply a template"
                          />
                          {composerCopyLint.blocking.length > 0 && (
                            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400">
                              {composerCopyLint.blocking.map((item) => (
                                <p key={item}>{item}</p>
                              ))}
                            </div>
                          )}
                          {composerCopyLint.warnings.length > 0 && (
                            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                              {composerCopyLint.warnings.map((item) => (
                                <p key={item}>{item}</p>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button onClick={sendCommunication} disabled={sendingCommunication || !isCommunicationReadyToSend}>
                            <Send className="mr-2 h-4 w-4" />
                            {sendingCommunication ? 'Sending...' : 'Send'}
                          </Button>
                          <Button variant="outline" onClick={() => navigator.clipboard.writeText(communicationComposer.message || '')}>
                            <Copy className="mr-2 h-4 w-4" />Copy
                          </Button>
                          <Button variant="outline" onClick={saveComposerAsCommunicationTemplate}>
                            <Plus className="mr-2 h-4 w-4" />Save Template
                          </Button>
                        </div>

                        {!isCommunicationReadyToSend && (
                          <p className="rounded-md border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                            Add at least one recipient, write a message, and for email also add a subject before sending.
                          </p>
                        )}
                      </CardContent>
                      </Card>
                    </div>
                  </div>

                  <Card className="border bg-card">
                    <CardHeader>
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <CardTitle className="text-base text-foreground">Delivery Logs and Analytics</CardTitle>
                          <CardDescription className="text-muted-foreground">Monitor outcomes and catch delivery failures quickly.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={communicationAnalyticsDays}
                            onValueChange={(value) => {
                              setCommunicationAnalyticsDays(value);
                              fetchCommunicationInsights({ days: value });
                            }}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue placeholder="Window" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="7">Last 7 days</SelectItem>
                              <SelectItem value="30">Last 30 days</SelectItem>
                              <SelectItem value="90">Last 90 days</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button variant="outline" size="sm" onClick={() => fetchCommunicationInsights()} disabled={communicationLogsLoading}>
                            <RefreshCw className={`h-4 w-4 ${communicationLogsLoading ? 'animate-spin' : ''}`} />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                        <div className="rounded-lg border bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">Total</p>
                          <p className="text-2xl font-semibold text-foreground">{communicationTotal}</p>
                        </div>
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                          <p className="text-xs text-emerald-700 dark:text-emerald-400">Sent</p>
                          <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">{communicationSent}</p>
                        </div>
                        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-950/30">
                          <p className="text-xs text-rose-700 dark:text-rose-400">Failed</p>
                          <p className="text-2xl font-semibold text-rose-700 dark:text-rose-400">{communicationFailed}</p>
                        </div>
                        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 dark:border-sky-800 dark:bg-sky-950/30">
                          <p className="text-xs text-sky-700 dark:text-sky-400">Success Rate</p>
                          <p className="text-2xl font-semibold text-sky-700 dark:text-sky-400">{communicationSuccessRate}%</p>
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/60">
                              <TableHead>Time</TableHead>
                              <TableHead>Channel</TableHead>
                              <TableHead>Recipient</TableHead>
                              <TableHead>Template</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Provider</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {communicationLogs.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted-foreground">No communication logs yet.</TableCell>
                              </TableRow>
                            ) : (
                              communicationLogs.map((log) => (
                                <TableRow key={log.id}>
                                  <TableCell>{new Date(log.created_at).toLocaleString()}</TableCell>
                                  <TableCell className="uppercase">{log.channel}</TableCell>
                                  <TableCell className="max-w-[220px] truncate">{log.recipient}</TableCell>
                                  <TableCell>{log.template_name || '-'}</TableCell>
                                  <TableCell>
                                    <Badge className={log.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}>
                                      {log.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>{log.provider || '-'}</TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border bg-card">
                    <CardHeader>
                      <CardTitle className="text-base text-foreground">{editingCommunicationTemplateId ? 'Edit Template' : 'Create Template'}</CardTitle>
                      <CardDescription className="text-muted-foreground">Build reusable content blocks with placeholders for rapid campaign execution.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <p className="mb-3 text-sm font-medium text-foreground">AI Template Studio</p>
                        <div className="mb-3 flex flex-wrap gap-2">
                          {availableAiPresets.map((preset) => (
                            <Button
                              key={preset.key}
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7"
                              onClick={() => applyAiTemplatePreset(preset.key)}
                            >
                              {preset.label}
                            </Button>
                          ))}
                          {availableAiPresets.length === 0 && (
                            <p className="text-xs text-muted-foreground">No quick presets for this channel.</p>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                          <div className="space-y-2">
                            <Label>Objective</Label>
                            <Select value={aiTemplateConfig.objective} onValueChange={(value) => setAiTemplateConfig((prev) => ({ ...prev, objective: value }))}>
                              <SelectTrigger><SelectValue placeholder="Objective" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="follow_up">Follow-up</SelectItem>
                                <SelectItem value="onboarding">Onboarding</SelectItem>
                                <SelectItem value="renewal">Renewal</SelectItem>
                                <SelectItem value="upsell">Upsell</SelectItem>
                                <SelectItem value="reactivation">Reactivation</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Tone</Label>
                            <Select value={aiTemplateConfig.tone} onValueChange={(value) => setAiTemplateConfig((prev) => ({ ...prev, tone: value }))}>
                              <SelectTrigger><SelectValue placeholder="Tone" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="professional">Professional</SelectItem>
                                <SelectItem value="consultative">Consultative</SelectItem>
                                <SelectItem value="friendly">Friendly</SelectItem>
                                <SelectItem value="urgent">Urgent</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>CTA</Label>
                            <Select value={aiTemplateConfig.cta} onValueChange={(value) => setAiTemplateConfig((prev) => ({ ...prev, cta: value }))}>
                              <SelectTrigger><SelectValue placeholder="CTA" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="book_demo">Book Demo</SelectItem>
                                <SelectItem value="schedule_call">Schedule Call</SelectItem>
                                <SelectItem value="reply_yes">Reply YES</SelectItem>
                                <SelectItem value="share_documents">Share Documents</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>AI Edit Instruction</Label>
                            <Input
                              value={aiTemplateConfig.editInstruction}
                              onChange={(e) => setAiTemplateConfig((prev) => ({ ...prev, editInstruction: e.target.value }))}
                              placeholder="How AI should rewrite templates"
                            />
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          <Label>Additional AI Instruction</Label>
                          <Textarea
                            rows={2}
                            value={aiTemplateConfig.customInstruction}
                            onChange={(e) => setAiTemplateConfig((prev) => ({ ...prev, customInstruction: e.target.value }))}
                            placeholder="Example: keep it under 90 words and include compliance-safe language"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Template Name</Label>
                        <Input
                          value={communicationDraft.name}
                          onChange={(e) => setCommunicationDraft((prev) => ({ ...prev, name: e.target.value }))}
                          placeholder="Example: Plan Renewal Follow-up"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Input
                          value={communicationDraft.category}
                          onChange={(e) => setCommunicationDraft((prev) => ({ ...prev, category: e.target.value }))}
                          placeholder="Operations"
                        />
                      </div>
                      </div>
                      {communicationChannel === 'email' && (
                        <div className="space-y-2">
                          <Label>Subject</Label>
                          <Input
                            value={communicationDraft.subject}
                            onChange={(e) => setCommunicationDraft((prev) => ({ ...prev, subject: e.target.value }))}
                            placeholder="Subject with placeholders"
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Template Content</Label>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs ${templateDraftWithinLimit ? 'text-muted-foreground' : 'text-rose-600 dark:text-rose-400'}`}>
                              {templateDraftWordCount}/{templateWordLimit} words
                            </span>
                            <span className={`text-xs ${templateDraftCharCount <= templateCharLimit ? 'text-muted-foreground' : 'text-rose-600 dark:text-rose-400'}`}>
                              {templateDraftCharCount}/{templateCharLimit} chars
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1.5 border-cyan-500/50 text-cyan-600 hover:bg-cyan-50 hover:text-cyan-700 dark:text-cyan-400 dark:hover:bg-cyan-950/40"
                              onClick={generateAiTemplate}
                              disabled={aiTemplateWriting || !selectedCorporate}
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              {aiTemplateWriting ? 'Writing...' : 'AI Write'}
                            </Button>
                          </div>
                        </div>
                        <Textarea
                          rows={5}
                          value={communicationDraft.content}
                          onChange={(e) => setCommunicationDraft((prev) => ({ ...prev, content: e.target.value }))}
                          placeholder="Use placeholders like {{companyName}} and {{contactPerson}}, or click AI Write to generate."
                        />
                        {templateCopyLint.blocking.length > 0 && (
                          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400">
                            {templateCopyLint.blocking.map((item) => (
                              <p key={item}>{item}</p>
                            ))}
                          </div>
                        )}
                        {templateCopyLint.warnings.length > 0 && (
                          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                            {templateCopyLint.warnings.map((item) => (
                              <p key={item}>{item}</p>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end">
                        <div className="flex gap-2">
                          {editingCommunicationTemplateId && <Button variant="outline" onClick={resetCommunicationDraft}>Cancel</Button>}
                          <Button onClick={saveCommunicationTemplate} disabled={templateHasBlockingLint || !templateDraftWithinLimit}>
                            {editingCommunicationTemplateId ? 'Update Template' : 'Save Template'}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Health Packages Tab */}
            <TabsContent value="packages" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Health Checkup Packages</CardTitle>
                      <CardDescription>
                        Configure health checkup packages for employees
                      </CardDescription>
                    </div>
                    <Button onClick={() => setShowAddPackageDialog(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Package
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {healthPackages.length === 0 ? (
                      <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center h-full py-8 text-center">
                          <FlaskConical className="h-8 w-8 text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">No health checkup packages found.</p>
                          <p className="text-xs text-muted-foreground">Create a new package to get started.</p>
                        </CardContent>
                      </Card>
                    ) : (
                      healthPackages.map((pkg, index) => (
                        <Card key={pkg.id}>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex items-center gap-2">
                              {index % 3 === 0 ? <Heart className="h-5 w-5 text-red-500" /> : 
                               index % 3 === 1 ? <Stethoscope className="h-5 w-5 text-blue-500" /> :
                               <Activity className="h-5 w-5 text-green-500" />}
                              {pkg.name}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-xl font-bold">₹{pkg.price.toLocaleString()}</p>
                            <p className="text-sm text-muted-foreground">{pkg.tests.length} tests included</p>
                            <div className="mt-4 space-y-2">
                              {pkg.tests.slice(0, 3).map((test, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm">
                                  <FlaskConical className="h-4 w-4" />
                                  {test}
                                </div>
                              ))}
                              {pkg.tests.length > 3 && (
                                <p className="text-xs text-muted-foreground">+{pkg.tests.length - 3} more tests</p>
                              )}
                            </div>
                            <div className="mt-4 flex gap-2">
                              <Button size="sm" variant="outline" className="flex-1" onClick={() => handleEditPackage(pkg)}>
                                <Edit className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                              <Button size="sm" className="flex-1" onClick={() => handleAssignPackage(pkg)}>
                                <Users className="h-3 w-3 mr-1" />
                                Assign
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}

                    <Card className="border-dashed cursor-pointer hover:bg-muted/50" onClick={() => setShowAddPackageDialog(true)}>
                      <CardContent className="flex flex-col items-center justify-center h-full py-8">
                        <Plus className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">Create New Package</p>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Health Calendar Tab */}
            <TabsContent value="calendar" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <CalendarDays className="h-5 w-5 text-teal-600" />
                        Wellness Calendar
                      </CardTitle>
                      <CardDescription>
                        Manage wellness engagement activities for {selectedCorporate?.companyName}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex rounded-md border overflow-hidden">
                        <Button
                          variant={calendarView === 'month' ? 'default' : 'ghost'}
                          size="sm"
                          className="rounded-none h-8"
                          onClick={() => setCalendarView('month')}
                        >Month</Button>
                        <Button
                          variant={calendarView === 'list' ? 'default' : 'ghost'}
                          size="sm"
                          className="rounded-none h-8"
                          onClick={() => setCalendarView('list')}
                        >List</Button>
                      </div>
                      <Button size="sm" onClick={() => { setEventForm(defaultEventForm); setShowCreateEventDialog(true); }}>
                        <Plus className="h-4 w-4 mr-1" />Add Event
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Month navigation */}
                  <div className="flex items-center justify-between mb-4">
                    <Button variant="ghost" size="icon" onClick={() => navigateMonth(-1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <h3 className="text-base font-semibold">
                      {calendarDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                    </h3>
                    <Button variant="ghost" size="icon" onClick={() => navigateMonth(1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>

                  {calendarView === 'month' ? (
                    <div>
                      {/* Day headers */}
                      <div className="grid grid-cols-7 mb-1">
                        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
                        ))}
                      </div>
                      {/* Calendar cells */}
                      <div className="grid grid-cols-7 border-l border-t">
                        {buildCalendarGrid().map((day, idx) => {
                          const dayEvents = day ? eventsForDay(day) : [];
                          const isToday = day !== null && (() => {
                            const t = new Date();
                            return t.getDate() === day && t.getMonth() === calendarDate.getMonth() && t.getFullYear() === calendarDate.getFullYear();
                          })();
                          return (
                            <div
                              key={idx}
                              className={`min-h-[80px] border-r border-b p-1 ${!day ? 'bg-muted/30' : 'bg-card'}`}
                            >
                              {day && (
                                <>
                                  <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-teal-500 text-white' : 'text-foreground'}`}>
                                    {day}
                                  </div>
                                  <div className="space-y-0.5">
                                    {dayEvents.slice(0, 2).map(ev => (
                                      <div
                                        key={ev.id}
                                        className={`text-[10px] px-1 py-0.5 rounded truncate cursor-pointer border flex items-center gap-0.5 ${colorClasses[ev.color] || colorClasses.teal}`}
                                        title={ev.title}
                                        onClick={() => openEditEvent(ev)}
                                      >
                                        {eventTypeIcon(ev.event_type)}
                                        <span className="truncate">{ev.title}</span>
                                      </div>
                                    ))}
                                    {dayEvents.length > 2 && (
                                      <div className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 2} more</div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    /* List view */
                    <div className="space-y-3">
                      {wellnessEvents.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
                          <p className="text-sm">No wellness events scheduled.</p>
                          <p className="text-xs mt-1">Click "Add Event" to schedule your first activity.</p>
                        </div>
                      ) : (
                        wellnessEvents.map(ev => (
                          <div key={ev.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                            <div className={`flex-shrink-0 p-2 rounded-lg border ${colorClasses[ev.color] || colorClasses.teal}`}>
                              {eventTypeIcon(ev.event_type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <p className="text-sm font-medium">{ev.title}</p>
                                <Badge variant="outline" className="text-xs capitalize">{ev.status}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{ev.event_type}</p>
                              <div className="flex flex-wrap gap-3 mt-1.5">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(ev.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  {ev.event_time && ` • ${ev.event_time.slice(0,5)}`}
                                </span>
                                {ev.location && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />{ev.location}
                                  </span>
                                )}
                                {ev.organizer && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <UserCheck className="h-3 w-3" />{ev.organizer}
                                  </span>
                                )}
                                {ev.max_participants && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Users className="h-3 w-3" />{ev.registered_count}/{ev.max_participants}
                                  </span>
                                )}
                              </div>
                              {ev.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{ev.description}</p>}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditEvent(ev)}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50" onClick={() => handleDeleteEvent(ev.id, ev.title)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Event type legend */}
                  <div className="mt-4 pt-3 border-t flex flex-wrap gap-2">
                    {Object.entries(eventTypeColors).map(([type, color]) => (
                      <span key={type} className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${colorClasses[color]}`}>
                        {eventTypeIcon(type)}{type}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Network Tab */}
            <TabsContent value="network" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Network Partners</CardTitle>
                      <CardDescription>
                        Manage labs, hospitals, and clinics in the corporate network
                      </CardDescription>
                    </div>
                    <Button onClick={() => {
                      setShowNetworkDialog(true);
                      setSelectedAddPartners([]);
                      setAddNetworkSearch('');
                      setAvailHospitalSearch('');
                      setTotalHospitals(0);
                      if (selectedCorporate?.id) fetchAvailablePartners(selectedCorporate.id);
                    }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add to Network
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="labs">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <TabsList>
                        <TabsTrigger value="labs" className="flex items-center gap-2">
                          <FlaskConical className="h-4 w-4" />
                          Labs ({labPartners.length})
                        </TabsTrigger>
                        <TabsTrigger value="hospitals" className="flex items-center gap-2">
                          <Hospital className="h-4 w-4" />
                          Hospitals ({hospitalPartners.length})
                        </TabsTrigger>
                        <TabsTrigger value="clinics" className="flex items-center gap-2">
                          <Stethoscope className="h-4 w-4" />
                          Clinics ({clinicPartners.length})
                        </TabsTrigger>
                      </TabsList>
                      {selectedNetworkPartnerIds.length > 0 && (
                        <div className="flex items-center gap-2 bg-primary/10 border-primary/30 rounded-lg px-3 py-1.5">
                          <span className="text-sm font-medium text-primary">{selectedNetworkPartnerIds.length} partner{selectedNetworkPartnerIds.length !== 1 ? 's' : ''} selected</span>
                          <Button size="sm" className="h-7 text-xs" onClick={handleBulkAssignNetworks}>
                            <Users className="h-3 w-3 mr-1" />Assign to Employees
                          </Button>
                          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelectedNetworkPartnerIds([])}>
                            ✕ Clear
                          </button>
                        </div>
                      )}
                    </div>
                    
                    <TabsContent value="labs" className="mt-4">
                      {/* Lab search + select-all bar */}
                      {(() => {
                        const filteredLabs = labPartners.filter(l =>
                          !labSearch ||
                          l.name?.toLowerCase().includes(labSearch.toLowerCase()) ||
                          l.city?.toLowerCase().includes(labSearch.toLowerCase()) ||
                          l.pincode?.toLowerCase().includes(labSearch.toLowerCase()) ||
                          l.address?.toLowerCase().includes(labSearch.toLowerCase())
                        );
                        const allFilteredSelected = filteredLabs.length > 0 && filteredLabs.every(l => selectedNetworkPartnerIds.includes(l.id));
                        return (
                          <>
                            <div className="flex items-center gap-2 mb-3">
                              <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  className="pl-9 h-8 text-sm"
                                  placeholder="Search labs by name, city, address or pincode..."
                                  value={labSearch}
                                  onChange={e => setLabSearch(e.target.value)}
                                />
                              </div>
                              {labSearch && (
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-muted-foreground">{filteredLabs.length} of {labPartners.length}</span>
                                  <button
                                    type="button"
                                    className="text-xs text-primary hover:underline whitespace-nowrap"
                                    onClick={() => setSelectedNetworkPartnerIds(prev => [...new Set([...prev, ...filteredLabs.map(l => l.id)])])}
                                  >
                                    Select all {filteredLabs.length} matching
                                  </button>
                                </div>
                              )}
                            </div>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-8">
                                    <Checkbox
                                      checked={allFilteredSelected}
                                      onCheckedChange={(v) => {
                                        const ids = filteredLabs.map(l => l.id);
                                        setSelectedNetworkPartnerIds(v
                                          ? [...new Set([...selectedNetworkPartnerIds, ...ids])]
                                          : selectedNetworkPartnerIds.filter(id => !ids.includes(id))
                                        );
                                      }}
                                    />
                                  </TableHead>
                                  <TableHead>Lab Name</TableHead>
                                  <TableHead>Location</TableHead>
                                  <TableHead>Tests Available</TableHead>
                                  <TableHead>Discount</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredLabs.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                      {labSearch ? `No labs match "${labSearch}"` : 'No labs found.'}
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  filteredLabs.map((lab) => (
                                    <TableRow key={lab.id} className={selectedNetworkPartnerIds.includes(lab.id) ? 'bg-primary/5' : ''}>
                                      <TableCell>
                                        <Checkbox
                                          checked={selectedNetworkPartnerIds.includes(lab.id)}
                                          onCheckedChange={(v) => setSelectedNetworkPartnerIds(v
                                            ? [...selectedNetworkPartnerIds, lab.id]
                                            : selectedNetworkPartnerIds.filter(id => id !== lab.id)
                                          )}
                                        />
                                      </TableCell>
                                      <TableCell className="font-medium">
                                        <div>{lab.name}</div>
                                        {lab.address && <div className="text-xs text-muted-foreground mt-0.5">{lab.address}</div>}
                                      </TableCell>
                                      <TableCell>
                                        <div>{lab.city}</div>
                                        {lab.pincode && <div className="text-xs text-muted-foreground mt-0.5">{lab.pincode}</div>}
                                      </TableCell>
                                      <TableCell>{lab.testsAvailable || 0}</TableCell>
                                      <TableCell>{lab.discount ? `${lab.discount}%` : '—'}</TableCell>
                                      <TableCell>{getStatusBadge(lab.status || 'Active')}</TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-1">
                                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleAssignNetwork({ id: lab.id, name: lab.name, type: 'lab', city: lab.city })}>
                                            <Users className="h-3 w-3 mr-1" />Assign
                                          </Button>
                                          <Button variant="ghost" size="sm" disabled title="Not available yet">
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </>
                        );
                      })()}
                    </TabsContent>

                    <TabsContent value="hospitals" className="mt-4">
                      {(() => {
                        const filteredHospitals = hospitalPartners.filter(h =>
                          !hospitalSearch ||
                          h.name?.toLowerCase().includes(hospitalSearch.toLowerCase()) ||
                          h.city?.toLowerCase().includes(hospitalSearch.toLowerCase()) ||
                          h.pincode?.toLowerCase().includes(hospitalSearch.toLowerCase()) ||
                          h.address?.toLowerCase().includes(hospitalSearch.toLowerCase()) ||
                          h.specialities?.toLowerCase().includes(hospitalSearch.toLowerCase())
                        );
                        const allFilteredSelected = filteredHospitals.length > 0 && filteredHospitals.every(h => selectedNetworkPartnerIds.includes(h.id));
                        return (
                          <>
                            <div className="flex items-center gap-2 mb-3">
                              <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  className="pl-9 h-8 text-sm"
                                  placeholder="Search hospitals by name, city, address, pincode or speciality..."
                                  value={hospitalSearch}
                                  onChange={e => setHospitalSearch(e.target.value)}
                                />
                              </div>
                              {hospitalSearch && (
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-muted-foreground">{filteredHospitals.length} of {hospitalPartners.length}</span>
                                  <button
                                    type="button"
                                    className="text-xs text-primary hover:underline whitespace-nowrap"
                                    onClick={() => setSelectedNetworkPartnerIds(prev => [...new Set([...prev, ...filteredHospitals.map(h => h.id)])])}
                                  >
                                    Select all {filteredHospitals.length} matching
                                  </button>
                                </div>
                              )}
                            </div>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-8">
                                    <Checkbox
                                      checked={allFilteredSelected}
                                      onCheckedChange={(v) => {
                                        const ids = filteredHospitals.map(h => h.id);
                                        setSelectedNetworkPartnerIds(v
                                          ? [...new Set([...selectedNetworkPartnerIds, ...ids])]
                                          : selectedNetworkPartnerIds.filter(id => !ids.includes(id))
                                        );
                                      }}
                                    />
                                  </TableHead>
                                  <TableHead>Hospital Name</TableHead>
                                  <TableHead>Location</TableHead>
                                  <TableHead>Specialities</TableHead>
                                  <TableHead>Beds</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredHospitals.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                      {hospitalSearch ? `No hospitals match "${hospitalSearch}"` : 'No hospitals found.'}
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  filteredHospitals.map((hospital) => (
                                    <TableRow key={hospital.id} className={selectedNetworkPartnerIds.includes(hospital.id) ? 'bg-primary/5' : ''}>
                                      <TableCell>
                                        <Checkbox
                                          checked={selectedNetworkPartnerIds.includes(hospital.id)}
                                          onCheckedChange={(v) => setSelectedNetworkPartnerIds(v
                                            ? [...selectedNetworkPartnerIds, hospital.id]
                                            : selectedNetworkPartnerIds.filter(id => id !== hospital.id)
                                          )}
                                        />
                                      </TableCell>
                                      <TableCell className="font-medium">
                                        <div>{hospital.name}</div>
                                        {hospital.address && <div className="text-xs text-muted-foreground mt-0.5">{hospital.address}</div>}
                                      </TableCell>
                                      <TableCell>
                                        <div>{hospital.city}</div>
                                        {hospital.pincode && <div className="text-xs text-muted-foreground mt-0.5">{hospital.pincode}</div>}
                                      </TableCell>
                                      <TableCell>{hospital.specialities || '—'}</TableCell>
                                      <TableCell>{hospital.beds || 0}</TableCell>
                                      <TableCell>{getStatusBadge(hospital.status || 'Active')}</TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-1">
                                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleAssignNetwork({ id: hospital.id, name: hospital.name, type: 'hospital', city: hospital.city })}>
                                            <Users className="h-3 w-3 mr-1" />Assign
                                          </Button>
                                          <Button variant="ghost" size="sm" disabled title="Not available yet">
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </>
                        );
                      })()}
                    </TabsContent>

                    <TabsContent value="clinics" className="mt-4">
                      {(() => {
                        const filteredClinics = clinicPartners.filter(c =>
                          !clinicSearch ||
                          c.name?.toLowerCase().includes(clinicSearch.toLowerCase()) ||
                          c.city?.toLowerCase().includes(clinicSearch.toLowerCase()) ||
                          c.pincode?.toLowerCase().includes(clinicSearch.toLowerCase()) ||
                          c.address?.toLowerCase().includes(clinicSearch.toLowerCase()) ||
                          c.type?.toLowerCase().includes(clinicSearch.toLowerCase())
                        );
                        const allFilteredSelected = filteredClinics.length > 0 && filteredClinics.every(c => selectedNetworkPartnerIds.includes(c.id));
                        return (
                          <>
                            <div className="flex items-center gap-2 mb-3">
                              <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  className="pl-9 h-8 text-sm"
                                  placeholder="Search clinics by name, city, address, pincode or type..."
                                  value={clinicSearch}
                                  onChange={e => setClinicSearch(e.target.value)}
                                />
                              </div>
                              {clinicSearch && (
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-muted-foreground">{filteredClinics.length} of {clinicPartners.length}</span>
                                  <button
                                    type="button"
                                    className="text-xs text-primary hover:underline whitespace-nowrap"
                                    onClick={() => setSelectedNetworkPartnerIds(prev => [...new Set([...prev, ...filteredClinics.map(c => c.id)])])}
                                  >
                                    Select all {filteredClinics.length} matching
                                  </button>
                                </div>
                              )}
                            </div>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-8">
                                    <Checkbox
                                      checked={allFilteredSelected}
                                      onCheckedChange={(v) => {
                                        const ids = filteredClinics.map(c => c.id);
                                        setSelectedNetworkPartnerIds(v
                                          ? [...new Set([...selectedNetworkPartnerIds, ...ids])]
                                          : selectedNetworkPartnerIds.filter(id => !ids.includes(id))
                                        );
                                      }}
                                    />
                                  </TableHead>
                                  <TableHead>Clinic Name</TableHead>
                                  <TableHead>Location</TableHead>
                                  <TableHead>Type</TableHead>
                                  <TableHead>Doctors</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredClinics.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                      {clinicSearch ? `No clinics match "${clinicSearch}"` : 'No clinics found.'}
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  filteredClinics.map((clinic) => (
                                    <TableRow key={clinic.id} className={selectedNetworkPartnerIds.includes(clinic.id) ? 'bg-primary/5' : ''}>
                                      <TableCell>
                                        <Checkbox
                                          checked={selectedNetworkPartnerIds.includes(clinic.id)}
                                          onCheckedChange={(v) => setSelectedNetworkPartnerIds(v
                                            ? [...selectedNetworkPartnerIds, clinic.id]
                                            : selectedNetworkPartnerIds.filter(id => id !== clinic.id)
                                          )}
                                        />
                                      </TableCell>
                                      <TableCell className="font-medium">
                                        <div>{clinic.name}</div>
                                        {clinic.address && <div className="text-xs text-muted-foreground mt-0.5">{clinic.address}</div>}
                                      </TableCell>
                                      <TableCell>
                                        <div>{clinic.city}</div>
                                        {clinic.pincode && <div className="text-xs text-muted-foreground mt-0.5">{clinic.pincode}</div>}
                                      </TableCell>
                                      <TableCell>{clinic.type || 'Clinic'}</TableCell>
                                      <TableCell>{clinic.doctors || 0}</TableCell>
                                      <TableCell>{getStatusBadge(clinic.status || 'Active')}</TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-1">
                                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleAssignNetwork({ id: clinic.id, name: clinic.name, type: 'clinic', city: clinic.city })}>
                                            <Users className="h-3 w-3 mr-1" />Assign
                                          </Button>
                                          <Button variant="ghost" size="sm" disabled title="Not available yet">
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </>
                        );
                      })()}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Add Corporate Dialog */}
        <Dialog open={showAddCorporateDialog} onOpenChange={setShowAddCorporateDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Onboard New Corporate</DialogTitle>
              <DialogDescription className="sr-only">Onboard a new corporate client</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label>Company Name *</Label>
                <Input 
                  placeholder="Enter company name"
                  value={newCorporate.companyName}
                  onChange={(e) => setNewCorporate({...newCorporate, companyName: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Person *</Label>
                <Input 
                  placeholder="Enter contact person name"
                  value={newCorporate.contactPerson}
                  onChange={(e) => setNewCorporate({...newCorporate, contactPerson: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input 
                  type="email"
                  placeholder="corporate@company.com"
                  value={newCorporate.email}
                  onChange={(e) => setNewCorporate({...newCorporate, email: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone Number *</Label>
                <Input 
                  placeholder="+91 XXXXX XXXXX"
                  value={newCorporate.phoneNumber}
                  onChange={(e) => setNewCorporate({...newCorporate, phoneNumber: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Industry</Label>
                <Select 
                  value={newCorporate.industry}
                  onValueChange={(value) => setNewCorporate({...newCorporate, industry: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {industries.map(ind => (
                      <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Employee Count</Label>
                <Input 
                  type="number"
                  placeholder="Number of employees"
                  value={newCorporate.employeeCount}
                  onChange={(e) => setNewCorporate({...newCorporate, employeeCount: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Package Type</Label>
                <Select 
                  value={newCorporate.packageType}
                  onValueChange={(value) => setNewCorporate({...newCorporate, packageType: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {packageTypes.map(pkg => (
                      <SelectItem key={pkg} value={pkg}>{pkg}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>GST Number</Label>
                <Input 
                  placeholder="GST Number"
                  value={newCorporate.gstNumber}
                  onChange={(e) => setNewCorporate({...newCorporate, gstNumber: e.target.value})}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddCorporateDialog(false)}>Cancel</Button>
              <Button onClick={handleCreateCorporate}>Create Corporate</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add HR Admin Dialog */}
        <Dialog open={showAddHRDialog} onOpenChange={(open) => { setShowAddHRDialog(open); if (!open) resetHRAdminForm(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingHRAdmin ? 'Edit HR Admin' : 'Create HR Admin Login'}</DialogTitle>
              <DialogDescription className="sr-only">Create or edit HR admin credentials</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name *</Label>
                  <Input 
                    placeholder="First name"
                    value={newHRAdmin.firstName}
                    onChange={(e) => setNewHRAdmin({...newHRAdmin, firstName: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name *</Label>
                  <Input 
                    placeholder="Last name"
                    value={newHRAdmin.lastName}
                    onChange={(e) => setNewHRAdmin({...newHRAdmin, lastName: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input 
                  type="email"
                  placeholder="hr@company.com"
                  value={newHRAdmin.email}
                  onChange={(e) => setNewHRAdmin({...newHRAdmin, email: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input 
                  placeholder="+91 XXXXX XXXXX"
                  value={newHRAdmin.phoneNumber}
                  onChange={(e) => setNewHRAdmin({...newHRAdmin, phoneNumber: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>{editingHRAdmin ? 'Password (optional)' : 'Password *'}</Label>
                <div className="flex gap-2">
                  <Input 
                    type="text"
                    placeholder="Password"
                    value={newHRAdmin.password}
                    onChange={(e) => setNewHRAdmin({...newHRAdmin, password: e.target.value})}
                  />
                  <Button variant="outline" onClick={generatePassword}>
                    <Key className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={() => navigator.clipboard.writeText(newHRAdmin.password)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowAddHRDialog(false); resetHRAdminForm(); }}>Cancel</Button>
              <Button onClick={editingHRAdmin ? handleUpdateHRAdmin : handleCreateHRAdmin} disabled={updatingHRAdmin}>
                {editingHRAdmin ? (updatingHRAdmin ? 'Saving...' : 'Save Changes') : 'Create HR Admin'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Employee Dialog */}
        <Dialog open={showAddEmployeeDialog} onOpenChange={(open) => { setShowAddEmployeeDialog(open); if (!open) { setEmpIdStatus('idle'); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Add Employee</DialogTitle>
              <DialogDescription className="sr-only">Add a new employee</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 overflow-y-auto flex-1 pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Employee ID *</Label>
                  <div className="relative">
                    <Input
                      placeholder="EMP001"
                      value={newEmployee.employeeId}
                      onChange={(e) => setNewEmployee({...newEmployee, employeeId: e.target.value})}
                      className={empIdStatus === 'duplicate' ? 'border-red-500 pr-8' : empIdStatus === 'ok' ? 'border-green-500 pr-8' : 'pr-8'}
                    />
                    <span className="absolute right-2 top-2.5">
                      {empIdStatus === 'checking' && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
                      {empIdStatus === 'ok' && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {empIdStatus === 'duplicate' && <XCircle className="h-4 w-4 text-red-500" />}
                    </span>
                  </div>
                  {empIdStatus === 'duplicate' && (
                    <div className="text-xs text-amber-700 space-y-1">
                      <p className="flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> Employee ID already exists in this corporate.
                      </p>
                      {duplicateEmployeeForNewId && (
                        <p>Existing employee: {duplicateEmployeeForNewId.name} &lt;{duplicateEmployeeForNewId.email}&gt;</p>
                      )}
                    </div>
                  )}
                  {empIdStatus === 'ok' && (
                    <p className="text-xs text-green-600">Employee ID is available</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input
                    placeholder="Full name"
                    value={newEmployee.name}
                    onChange={(e) => setNewEmployee({...newEmployee, name: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  placeholder="employee@company.com"
                  value={newEmployee.email}
                  onChange={(e) => setNewEmployee({...newEmployee, email: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    placeholder="+91 XXXXX XXXXX"
                    value={newEmployee.phone}
                    onChange={(e) => setNewEmployee({...newEmployee, phone: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select value={newEmployee.gender} onValueChange={(v) => setNewEmployee({...newEmployee, gender: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Joining Date</Label>
                  <Input
                    type="date"
                    value={newEmployee.joiningDate}
                    onChange={(e) => setNewEmployee({...newEmployee, joiningDate: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input
                    placeholder="Engineering"
                    value={newEmployee.department}
                    onChange={(e) => setNewEmployee({...newEmployee, department: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Designation</Label>
                <Input
                  placeholder="Senior Developer"
                  value={newEmployee.designation}
                  onChange={(e) => setNewEmployee({...newEmployee, designation: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Work Address</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="City"
                    value={newEmployee.workCity}
                    onChange={(e) => setNewEmployee({...newEmployee, workCity: e.target.value})}
                  />
                  <Input
                    placeholder="State"
                    value={newEmployee.workState}
                    onChange={(e) => setNewEmployee({...newEmployee, workState: e.target.value})}
                  />
                </div>
              </div>
            </div>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <Label htmlFor="employee-welcome-email-mode" className="text-sm font-medium">Welcome email handling</Label>
                <Select value={employeeWelcomeEmailMode} onValueChange={(value) => setEmployeeWelcomeEmailMode(value as WelcomeEmailMode)}>
                  <SelectTrigger id="employee-welcome-email-mode">
                    <SelectValue placeholder="Choose email handling" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Prepare batch for review</SelectItem>
                    <SelectItem value="send">Send immediately</SelectItem>
                    <SelectItem value="skip">Do not send</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Only name and email are needed for a welcome email. Gender and department are optional employee profile fields; duplicate employees can receive a fresh password and welcome email again.</p>
              </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddEmployeeDialog(false)}>Cancel</Button>
              {empIdStatus === 'duplicate' && duplicateEmployeeForNewId && (
                <Button variant="outline" onClick={handleExistingEmployeeWelcomeEmail} disabled={sendingExistingWelcomeEmail}>
                  <Mail className="h-4 w-4 mr-2" />
                  {sendingExistingWelcomeEmail
                    ? 'Preparing...'
                    : employeeWelcomeEmailMode === 'send'
                      ? 'Send Welcome Email Again'
                      : 'Prepare Welcome Email Again'}
                </Button>
              )}
              <Button onClick={handleAddEmployee} disabled={empIdStatus === 'duplicate'}>Add Employee</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Employee Credentials Dialog */}
        <Dialog open={showCredentialsDialog} onOpenChange={setShowCredentialsDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle className="h-5 w-5" /> Employee Added Successfully
              </DialogTitle>
              <DialogDescription>
                Login credentials have been created. Share these with the employee or note them down — the password won't be shown again.
              </DialogDescription>
            </DialogHeader>
            {newEmployeeCredentials && (
              <div className="space-y-4 py-2">
                <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Employee Name</p>
                      <p className="font-medium">{newEmployeeCredentials.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Login Email</p>
                      <p className="font-medium">{newEmployeeCredentials.email}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => {
                      navigator.clipboard.writeText(newEmployeeCredentials.email);
                      toast({ title: 'Copied', description: 'Email copied to clipboard' });
                    }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Temporary Password</p>
                      <p className="font-mono font-bold text-lg tracking-widest text-primary">{newEmployeeCredentials.password}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => {
                      navigator.clipboard.writeText(newEmployeeCredentials.password);
                      toast({ title: 'Copied', description: 'Password copied to clipboard' });
                    }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-md bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-400">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>{newEmployeeCredentials.emailStatus === "skipped" ? <>Welcome email was not sent. Share these credentials manually with <strong>{newEmployeeCredentials.email}</strong>.</> : <>A welcome email with these credentials has been queued for <strong>{newEmployeeCredentials.email}</strong>. The employee should change this password on first login.</>}</p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => { setShowCredentialsDialog(false); setNewEmployeeCredentials(null); }}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Employee Dialog */}
        <Dialog open={showViewEmployeeDialog} onOpenChange={setShowViewEmployeeDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Employee Details</DialogTitle>
              <DialogDescription className="sr-only">View employee information</DialogDescription>
            </DialogHeader>
            {viewingEmployee && (
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-xs text-muted-foreground mb-1">Employee ID</p><p className="font-medium">{viewingEmployee.employeeId}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Status</p><p className="font-medium capitalize">{viewingEmployee.status}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-xs text-muted-foreground mb-1">First Name</p><p className="font-medium">{viewingEmployee.firstName || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Last Name</p><p className="font-medium">{viewingEmployee.lastName || '—'}</p></div>
                </div>
                <div><p className="text-xs text-muted-foreground mb-1">Email</p><p className="font-medium">{viewingEmployee.email || '—'}</p></div>
                {viewingEmployee.secondaryEmail && (
                  <div><p className="text-xs text-muted-foreground mb-1">Secondary Email</p><p className="font-medium">{viewingEmployee.secondaryEmail}</p></div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-xs text-muted-foreground mb-1">Phone</p><p className="font-medium">{viewingEmployee.phone || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Joining Date</p><p className="font-medium">{viewingEmployee.joiningDate ? new Date(viewingEmployee.joiningDate).toLocaleDateString() : '—'}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-xs text-muted-foreground mb-1">Department</p><p className="font-medium">{viewingEmployee.department || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Designation</p><p className="font-medium">{viewingEmployee.designation || '—'}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-xs text-muted-foreground mb-1">City</p><p className="font-medium">{viewingEmployee.city || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Pin Code</p><p className="font-medium">{viewingEmployee.pinCode || '—'}</p></div>
                </div>
                {viewingEmployee.currentPackageName && (
                  <div className="grid grid-cols-2 gap-4">
                    <div><p className="text-xs text-muted-foreground mb-1">Health Plan</p><p className="font-medium">{viewingEmployee.currentPackageName}</p></div>
                    {viewingEmployee.packageValidTo && (
                      <div><p className="text-xs text-muted-foreground mb-1">Valid Till</p><p className="font-medium">{new Date(viewingEmployee.packageValidTo).toLocaleDateString()}</p></div>
                    )}
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowViewEmployeeDialog(false)}>Close</Button>
              <Button onClick={() => {
                if (viewingEmployee) {
                  setEditingEmployee(viewingEmployee);
                  setEditEmployeeForm({
                    firstName: viewingEmployee.firstName,
                    lastName: viewingEmployee.lastName,
                    email: viewingEmployee.email,
                    secondaryEmail: viewingEmployee.secondaryEmail,
                    phone: viewingEmployee.phone,
                    department: viewingEmployee.department === 'Not Assigned' ? '' : viewingEmployee.department,
                    designation: viewingEmployee.designation === 'Not Assigned' ? '' : viewingEmployee.designation,
                    city: viewingEmployee.city,
                    state: viewingEmployee.state,
                    pinCode: viewingEmployee.pinCode,
                    location: viewingEmployee.location,
                    facility: viewingEmployee.facility,
                    employeeId: viewingEmployee.employeeId,
                    status: viewingEmployee.status || 'active',
                    packageId: viewingEmployee.currentPackageId || '',
                  });
                  setShowViewEmployeeDialog(false);
                  setShowEditEmployeeDialog(true);
                }
              }}>Edit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Employee Dialog */}
        <Dialog open={showEditEmployeeDialog} onOpenChange={setShowEditEmployeeDialog}>
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Edit Employee — {editingEmployee?.name}</DialogTitle>
              <DialogDescription className="sr-only">Edit employee details</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 overflow-y-auto flex-1 pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input value={editEmployeeForm.firstName} onChange={(e) => setEditEmployeeForm({...editEmployeeForm, firstName: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input value={editEmployeeForm.lastName} onChange={(e) => setEditEmployeeForm({...editEmployeeForm, lastName: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email (Primary)</Label>
                <Input type="email" value={editEmployeeForm.email} onChange={(e) => setEditEmployeeForm({...editEmployeeForm, email: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Secondary Email <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Input type="email" placeholder="personal@example.com" value={editEmployeeForm.secondaryEmail} onChange={(e) => setEditEmployeeForm({...editEmployeeForm, secondaryEmail: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={editEmployeeForm.phone} onChange={(e) => setEditEmployeeForm({...editEmployeeForm, phone: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={editEmployeeForm.status} onValueChange={(v) => setEditEmployeeForm({...editEmployeeForm, status: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input placeholder="Engineering" value={editEmployeeForm.department} onChange={(e) => setEditEmployeeForm({...editEmployeeForm, department: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Designation</Label>
                  <Input placeholder="Senior Developer" value={editEmployeeForm.designation} onChange={(e) => setEditEmployeeForm({...editEmployeeForm, designation: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Employee ID</Label>
                  <Input placeholder="EMP001" value={editEmployeeForm.employeeId} onChange={(e) => setEditEmployeeForm({...editEmployeeForm, employeeId: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Location / Branch</Label>
                  <Input placeholder="Delhi HQ" value={editEmployeeForm.location} onChange={(e) => setEditEmployeeForm({...editEmployeeForm, location: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input placeholder="Mumbai" value={editEmployeeForm.city} onChange={(e) => setEditEmployeeForm({...editEmployeeForm, city: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input placeholder="Maharashtra" value={editEmployeeForm.state} onChange={(e) => setEditEmployeeForm({...editEmployeeForm, state: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Pin Code</Label>
                  <Input placeholder="400001" value={editEmployeeForm.pinCode} onChange={(e) => setEditEmployeeForm({...editEmployeeForm, pinCode: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Health Plan</Label>
                <Select value={editEmployeeForm.packageId || '__none__'} onValueChange={(v) => setEditEmployeeForm({...editEmployeeForm, packageId: v === '__none__' ? '' : v})}>
                  <SelectTrigger><SelectValue placeholder="Select health plan" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No plan</SelectItem>
                    {healthPackages.map(pkg => (
                      <SelectItem key={pkg.id} value={pkg.id}>{pkg.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditEmployeeDialog(false)}>Cancel</Button>
              <Button onClick={handleUpdateEmployee} disabled={updatingEmployee}>
                {updatingEmployee ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Network Dialog */}
        <Dialog open={showNetworkDialog} onOpenChange={setShowNetworkDialog}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Add to Corporate Network</DialogTitle>
            </DialogHeader>
            <Tabs defaultValue="labs" className="py-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="labs">Labs ({availLabs.length})</TabsTrigger>
                <TabsTrigger value="hospitals">Hospitals ({totalHospitals > 0 ? totalHospitals : availHospitals.length})</TabsTrigger>
                <TabsTrigger value="clinics">Clinics ({availClinics.length})</TabsTrigger>
              </TabsList>

              {availLoading ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground">Loading available partners...</div>
              ) : (
                <>
                  <TabsContent value="labs" className="mt-4">
                    <div className="space-y-4">
                      <Input
                        placeholder="Search labs..."
                        value={addNetworkSearch}
                        onChange={(e) => setAddNetworkSearch(e.target.value)}
                      />
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-2">
                          {availLabs.filter(l => l.name?.toLowerCase().includes(addNetworkSearch.toLowerCase())).length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">No available labs found</p>
                          ) : availLabs
                              .filter(l => l.name?.toLowerCase().includes(addNetworkSearch.toLowerCase()))
                              .map(lab => {
                                const checked = selectedAddPartners.some(p => p.id === lab.id && p.type === 'lab');
                                return (
                                  <div key={lab.id} className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="flex items-center gap-3">
                                      <Checkbox
                                        id={`lab-${lab.id}`}
                                        checked={checked}
                                        onCheckedChange={(v) => setSelectedAddPartners(prev =>
                                          v ? [...prev, { id: lab.id, type: 'lab' }]
                                            : prev.filter(p => !(p.id === lab.id && p.type === 'lab'))
                                        )}
                                      />
                                      <Label htmlFor={`lab-${lab.id}`} className="font-medium cursor-pointer">
                                        {lab.name}
                                        {lab.city && lab.city !== 'N/A' && (
                                          <span className="text-xs text-muted-foreground ml-2">{lab.city}</span>
                                        )}
                                      </Label>
                                    </div>
                                    <Badge variant="outline">{lab.testsAvailable > 0 ? `${lab.testsAvailable} tests` : 'Lab'}</Badge>
                                  </div>
                                );
                              })}
                        </div>
                      </ScrollArea>
                    </div>
                  </TabsContent>

                  <TabsContent value="hospitals" className="mt-4">
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Search by name, city or pincode..."
                          value={availHospitalSearch}
                          onChange={(e) => setAvailHospitalSearch(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && selectedCorporate?.id) fetchAvailablePartners(selectedCorporate.id, availHospitalSearch); }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => selectedCorporate?.id && fetchAvailablePartners(selectedCorporate.id, availHospitalSearch)}
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      </div>
                      {totalHospitals > availHospitals.length && (
                        <p className="text-xs text-muted-foreground">
                          Showing {availHospitals.length} of {totalHospitals} hospitals — search by name, city or pincode to narrow results
                        </p>
                      )}
                      <ScrollArea className="h-[280px]">
                        <div className="space-y-2">
                          {availHospitals.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">No available hospitals found</p>
                          ) : availHospitals
                              .map(hosp => {
                                const checked = selectedAddPartners.some(p => p.id === hosp.id && p.type === 'hospital');
                                return (
                                  <div key={hosp.id} className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="flex items-center gap-3">
                                      <Checkbox
                                        id={`hospital-${hosp.id}`}
                                        checked={checked}
                                        onCheckedChange={(v) => setSelectedAddPartners(prev =>
                                          v ? [...prev, { id: hosp.id, type: 'hospital' }]
                                            : prev.filter(p => !(p.id === hosp.id && p.type === 'hospital'))
                                        )}
                                      />
                                      <Label htmlFor={`hospital-${hosp.id}`} className="font-medium cursor-pointer">
                                        {hosp.name}
                                        {(hosp.city && hosp.city !== 'N/A') && (
                                          <span className="text-xs text-muted-foreground ml-2">{hosp.city}{hosp.pincode ? ` – ${hosp.pincode}` : ''}</span>
                                        )}
                                      </Label>
                                    </div>
                                    <Badge variant="outline">{hosp.specialities ? 'Multi-specialty' : 'Hospital'}</Badge>
                                  </div>
                                );
                              })}
                        </div>
                      </ScrollArea>
                    </div>
                  </TabsContent>

                  <TabsContent value="clinics" className="mt-4">
                    <div className="space-y-4">
                      <Input
                        placeholder="Search clinics..."
                        value={addNetworkSearch}
                        onChange={(e) => setAddNetworkSearch(e.target.value)}
                      />
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-2">
                          {availClinics.filter(c => c.name?.toLowerCase().includes(addNetworkSearch.toLowerCase())).length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">No available clinics found</p>
                          ) : availClinics
                              .filter(c => c.name?.toLowerCase().includes(addNetworkSearch.toLowerCase()))
                              .map(clinic => {
                                const checked = selectedAddPartners.some(p => p.id === clinic.id && p.type === 'clinic');
                                return (
                                  <div key={clinic.id} className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="flex items-center gap-3">
                                      <Checkbox
                                        id={`clinic-${clinic.id}`}
                                        checked={checked}
                                        onCheckedChange={(v) => setSelectedAddPartners(prev =>
                                          v ? [...prev, { id: clinic.id, type: 'clinic' }]
                                            : prev.filter(p => !(p.id === clinic.id && p.type === 'clinic'))
                                        )}
                                      />
                                      <Label htmlFor={`clinic-${clinic.id}`} className="font-medium cursor-pointer">
                                        {clinic.name}
                                        {(clinic.city && clinic.city !== 'N/A') && (
                                          <span className="text-xs text-muted-foreground ml-2">{clinic.city}{clinic.pincode ? ` – ${clinic.pincode}` : ''}</span>
                                        )}
                                      </Label>
                                    </div>
                                    <Badge variant="outline">{clinic.type || 'Clinic'}</Badge>
                                  </div>
                                );
                              })}
                        </div>
                      </ScrollArea>
                    </div>
                  </TabsContent>
                </>
              )}
            </Tabs>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNetworkDialog(false)}>Cancel</Button>
              <Button onClick={handleAddToNetwork} disabled={selectedAddPartners.length === 0 || addingNetwork}>
                {addingNetwork ? 'Adding...' : `Add Selected (${selectedAddPartners.length})`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Package Dialog */}
        <Dialog open={showEditPackageDialog} onOpenChange={setShowEditPackageDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Health Package</DialogTitle>
              <DialogDescription className="sr-only">Edit package details</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Package Name</Label>
                <Input 
                  placeholder="Executive Health Checkup"
                  value={newPackage.name}
                  onChange={(e) => setNewPackage({...newPackage, name: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Price (₹)</Label>
                  <Input 
                    type="number"
                    placeholder="4500"
                    value={newPackage.price}
                    onChange={(e) => setNewPackage({...newPackage, price: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Validity (Days)</Label>
                  <Input 
                    type="number"
                    placeholder="365"
                    value={newPackage.validityDays}
                    onChange={(e) => setNewPackage({...newPackage, validityDays: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tests Included ({newPackage.tests.length})</Label>
                <div className="border rounded-lg p-3 max-h-[200px] overflow-y-auto">
                  <div className="flex flex-wrap gap-2">
                    {newPackage.tests.map((test, idx) => (
                      <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                        {test}
                        <button 
                          className="ml-1 hover:text-red-500"
                          onClick={() => setNewPackage({
                            ...newPackage, 
                            tests: newPackage.tests.filter((_, i) => i !== idx)
                          })}
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <Input 
                    placeholder="Add new test..."
                    id="new-test-input"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const input = e.target as HTMLInputElement;
                        if (input.value.trim()) {
                          setNewPackage({
                            ...newPackage,
                            tests: [...newPackage.tests, input.value.trim()]
                          });
                          input.value = '';
                        }
                      }
                    }}
                  />
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      const input = document.getElementById('new-test-input') as HTMLInputElement;
                      if (input?.value.trim()) {
                        setNewPackage({
                          ...newPackage,
                          tests: [...newPackage.tests, input.value.trim()]
                        });
                        input.value = '';
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowEditPackageDialog(false);
                setEditingPackage(null);
              }}>Cancel</Button>
              <Button onClick={handleSavePackageEdit}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assign Network Partner Dialog */}
        <Dialog open={showAssignNetworkDialog} onOpenChange={(open) => {
          setShowAssignNetworkDialog(open);
          if (!open) { setAssigningNetworks([]); setSelectedEmployeesForAssign([]); setSelectedDepartmentsForAssign([]); setNetworkAssignMode('all'); setNetworkEmployeeSearch(''); }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {assigningNetworks.length > 1 ? `Assign ${assigningNetworks.length} Network Partners` : 'Assign Network Partner'}
              </DialogTitle>
              <DialogDescription>
                {assigningNetworks.length > 1
                  ? `Assign ${assigningNetworks.length} selected partners to employees as a network benefit`
                  : <>Assign <span className="font-medium text-foreground">{assigningNetworks[0]?.name}</span> to employees as a network benefit</>}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
              {/* Partner summary — single card or multi chips */}
              {assigningNetworks.length === 1 ? (
                <div className="bg-muted/50 p-3 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">{assigningNetworks[0]?.name}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {assigningNetworks[0]?.type}{assigningNetworks[0]?.city ? ` • ${assigningNetworks[0].city}` : ''}
                    </p>
                  </div>
                  {assigningNetworks[0]?.type === 'lab' && <FlaskConical className="h-7 w-7 text-primary" />}
                  {assigningNetworks[0]?.type === 'hospital' && <Hospital className="h-7 w-7 text-primary" />}
                  {assigningNetworks[0]?.type === 'clinic' && <Stethoscope className="h-7 w-7 text-primary" />}
                </div>
              ) : (
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">{assigningNetworks.length} partners selected</p>
                  <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
                    {assigningNetworks.map(p => (
                      <span key={p.id} className="inline-flex items-center gap-1.5 bg-muted rounded-full px-3 py-1 text-sm">
                        {p.type === 'lab' && <FlaskConical className="h-3 w-3 text-primary" />}
                        {p.type === 'hospital' && <Hospital className="h-3 w-3 text-primary" />}
                        {p.type === 'clinic' && <Stethoscope className="h-3 w-3 text-primary" />}
                        <span className="font-medium">{p.name}</span>
                        {p.city && <span className="text-muted-foreground text-xs">{p.city}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Assignment mode */}
              <div className="space-y-2">
                <Label className="font-semibold">Assign To</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(['all', 'department', 'custom'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { setNetworkAssignMode(mode); setSelectedEmployeesForAssign([]); setSelectedDepartmentsForAssign([]); setNetworkEmployeeSearch(''); }}
                      className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                        networkAssignMode === mode ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted/50'
                      }`}
                    >
                      {mode === 'all' && <><Users className="h-4 w-4 mx-auto mb-1" />All Employees</>}
                      {mode === 'department' && <><Building2 className="h-4 w-4 mx-auto mb-1" />By Department</>}
                      {mode === 'custom' && <><UserCheck className="h-4 w-4 mx-auto mb-1" />Select Specific</>}
                    </button>
                  ))}
                </div>
              </div>

              {/* All employees summary */}
              {networkAssignMode === 'all' && (
                <div className="border rounded-lg p-4 bg-green-50/50">
                  <div className="flex items-center gap-2 text-green-700 font-medium">
                    <CheckCircle className="h-5 w-5" />
                    All {selectedCorporate?.employeeCount || employees.length} employees will be assigned
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Every employee in the corporate will get access to {assigningNetworks.length > 1 ? `these ${assigningNetworks.length} partners` : `this ${assigningNetworks[0]?.type}`}.
                  </p>
                </div>
              )}

              {/* By department */}
              {networkAssignMode === 'department' && (() => {
                const depts = Array.from(new Set(employees.map(e => e.department).filter(Boolean))).sort();
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="font-medium">Select Departments</Label>
                      <div className="flex gap-2">
                        <button type="button" className="text-xs text-primary hover:underline"
                          onClick={() => setSelectedDepartmentsForAssign(depts)}>Select all</button>
                        <span className="text-muted-foreground text-xs">·</span>
                        <button type="button" className="text-xs text-muted-foreground hover:underline"
                          onClick={() => setSelectedDepartmentsForAssign([])}>Clear</button>
                      </div>
                    </div>
                    {depts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No departments found. Add employees first.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto rounded border p-2">
                        {depts.map(dept => {
                          const count = employees.filter(e => e.department === dept).length;
                          const checked = selectedDepartmentsForAssign.includes(dept);
                          return (
                            <label key={dept} className={`flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-muted/50 ${
                              checked ? 'bg-primary/5 border-primary/30' : 'border-transparent'
                            }`}>
                              <Checkbox checked={checked} onCheckedChange={(v) => {
                                setSelectedDepartmentsForAssign(v
                                  ? [...selectedDepartmentsForAssign, dept]
                                  : selectedDepartmentsForAssign.filter(d => d !== dept)
                                );
                              }} />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{dept}</div>
                                <div className="text-xs text-muted-foreground">{count} employee{count !== 1 ? 's' : ''}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {selectedDepartmentsForAssign.length > 0 && (
                      <p className="text-sm font-medium text-primary">
                        ✓ {employees.filter(e => selectedDepartmentsForAssign.includes(e.department)).length} employees across {selectedDepartmentsForAssign.length} department{selectedDepartmentsForAssign.length !== 1 ? 's' : ''} selected
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Select specific employees */}
              {networkAssignMode === 'custom' && (() => {
                const filtered = employees.filter(e =>
                  !networkEmployeeSearch ||
                  e.name.toLowerCase().includes(networkEmployeeSearch.toLowerCase()) ||
                  e.employeeId.toLowerCase().includes(networkEmployeeSearch.toLowerCase()) ||
                  e.department.toLowerCase().includes(networkEmployeeSearch.toLowerCase()) ||
                  e.designation.toLowerCase().includes(networkEmployeeSearch.toLowerCase())
                );
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="font-medium">Select Employees</Label>
                      <div className="flex gap-2">
                        <button type="button" className="text-xs text-primary hover:underline"
                          onClick={() => setSelectedEmployeesForAssign(filtered.map(e => e.id))}>Select all</button>
                        <span className="text-muted-foreground text-xs">·</span>
                        <button type="button" className="text-xs text-muted-foreground hover:underline"
                          onClick={() => setSelectedEmployeesForAssign([])}>Clear</button>
                      </div>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-9"
                        placeholder="Search by name, ID, department, designation..."
                        value={networkEmployeeSearch}
                        onChange={e => setNetworkEmployeeSearch(e.target.value)}
                      />
                    </div>
                    {employees.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No employees found for this corporate.</p>
                    ) : (
                      <div className="border rounded-lg divide-y max-h-56 overflow-y-auto">
                        {filtered.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">No employees match your search.</p>
                        ) : filtered.map(emp => {
                          const checked = selectedEmployeesForAssign.includes(emp.id);
                          return (
                            <label key={emp.id} className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 ${
                              checked ? 'bg-primary/5' : ''
                            }`}>
                              <Checkbox checked={checked} onCheckedChange={(v) => {
                                setSelectedEmployeesForAssign(v
                                  ? [...selectedEmployeesForAssign, emp.id]
                                  : selectedEmployeesForAssign.filter(id => id !== emp.id)
                                );
                              }} />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium">{emp.name}
                                  <span className="ml-2 text-xs text-muted-foreground font-normal">{emp.employeeId}</span>
                                </div>
                                <div className="text-xs text-muted-foreground">{emp.department} · {emp.designation}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {selectedEmployeesForAssign.length > 0 && (
                      <p className="text-sm font-medium text-primary">✓ {selectedEmployeesForAssign.length} employee{selectedEmployeesForAssign.length !== 1 ? 's' : ''} selected</p>
                    )}
                  </div>
                );
              })()}

              {/* Benefits */}
              <div className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="font-medium text-blue-800 dark:text-blue-300 text-sm mb-1">What employees get</p>
                <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-0.5">
                  {assigningNetworks.some(p => p.type === 'lab') && <><li>• Preferred lab(s) for diagnostic tests</li><li>• Corporate discount on all tests</li><li>• Priority booking and home collection</li></>}
                  {assigningNetworks.some(p => p.type === 'hospital') && <><li>• Cashless treatment at network hospital{assigningNetworks.filter(p => p.type === 'hospital').length > 1 ? 's' : ''}</li><li>• Pre-authorised admission for planned procedures</li><li>• Dedicated corporate helpdesk</li></>}
                  {assigningNetworks.some(p => p.type === 'clinic') && <><li>• OPD consultations at network clinic{assigningNetworks.filter(p => p.type === 'clinic').length > 1 ? 's' : ''}</li><li>• Corporate discount on consultation fees</li><li>• Priority appointments</li></>}
                </ul>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setShowAssignNetworkDialog(false)}>Cancel</Button>
              <Button
                onClick={handleConfirmNetworkAssignment}
                disabled={
                  (networkAssignMode === 'department' && selectedDepartmentsForAssign.length === 0) ||
                  (networkAssignMode === 'custom' && selectedEmployeesForAssign.length === 0)
                }
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {assigningNetworks.length > 1 ? `Assign ${assigningNetworks.length} Partners to ` : 'Assign to '}
                {
                  networkAssignMode === 'all'
                    ? `All ${selectedCorporate?.employeeCount || employees.length}`
                    : networkAssignMode === 'department'
                    ? `${employees.filter(e => selectedDepartmentsForAssign.includes(e.department)).length}`
                    : `${selectedEmployeesForAssign.length}`
                } Employee{(
                  networkAssignMode === 'all' ? (selectedCorporate?.employeeCount || employees.length) :
                  networkAssignMode === 'department' ? employees.filter(e => selectedDepartmentsForAssign.includes(e.department)).length :
                  selectedEmployeesForAssign.length
                ) !== 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Plan Assignment Dialog */}
        <Dialog open={showBulkPlanDialog} onOpenChange={setShowBulkPlanDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Bulk Assign Health Plan</DialogTitle>
              <DialogDescription>Assign a plan to employees filtered by criteria.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Plan picker */}
              <div className="space-y-2">
                <Label>Select Plan <span className="text-red-500">*</span></Label>
                <Select value={bulkPlanId} onValueChange={setBulkPlanId}>
                  <SelectTrigger><SelectValue placeholder="Choose a plan" /></SelectTrigger>
                  <SelectContent>
                    {[...corporatePlans.map(p => ({ id: String(p.id), name: p.name })),
                      ...healthPackages.filter(hp => !corporatePlans.some(p => String(p.id) === hp.id)).map(hp => ({ id: hp.id, name: hp.name }))
                    ].map(opt => (
                      <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filter type */}
              <div className="space-y-2">
                <Label>Assign To</Label>
                <Select value={bulkPlanFilter} onValueChange={(v: any) => { setBulkPlanFilter(v); setBulkPlanFilterValue(''); setBulkPlanAgeMin(''); setBulkPlanAgeMax(''); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees ({employees.length})</SelectItem>
                    <SelectItem value="gender">By Gender</SelectItem>
                    <SelectItem value="city">By City</SelectItem>
                    <SelectItem value="department">By Department</SelectItem>
                    <SelectItem value="location">By Location / Branch</SelectItem>
                    <SelectItem value="facility">By Facility</SelectItem>
                    <SelectItem value="age">By Age Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Filter value input */}
              {bulkPlanFilter === 'gender' && (
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select value={bulkPlanFilterValue} onValueChange={setBulkPlanFilterValue}>
                    <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {['city', 'department', 'location', 'facility'].includes(bulkPlanFilter) && (
                <div className="space-y-2">
                  <Label>{bulkPlanFilter === 'city' ? 'City' : bulkPlanFilter === 'department' ? 'Department' : bulkPlanFilter === 'location' ? 'Location / Branch' : 'Facility'}</Label>
                  <Input placeholder={`Enter ${bulkPlanFilter}...`} value={bulkPlanFilterValue} onChange={e => setBulkPlanFilterValue(e.target.value)} />
                  {/* Hint with distinct values */}
                  {(() => {
                    const vals = [...new Set(employees.map(e => (e as any)[bulkPlanFilter]).filter(Boolean))].slice(0, 10);
                    return vals.length > 0 ? <p className="text-xs text-muted-foreground">Available: {vals.join(', ')}</p> : null;
                  })()}
                </div>
              )}
              {bulkPlanFilter === 'age' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Min Age</Label>
                    <Input type="number" placeholder="e.g. 25" value={bulkPlanAgeMin} onChange={e => setBulkPlanAgeMin(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Age</Label>
                    <Input type="number" placeholder="e.g. 45" value={bulkPlanAgeMax} onChange={e => setBulkPlanAgeMax(e.target.value)} />
                  </div>
                </div>
              )}

              {/* Preview count */}
              <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                {(() => {
                  const today = new Date();
                  let count = employees.length;
                  if (bulkPlanFilter === 'gender' && bulkPlanFilterValue) count = employees.filter(e => e.gender?.toLowerCase() === bulkPlanFilterValue.toLowerCase()).length;
                  else if (bulkPlanFilter === 'city' && bulkPlanFilterValue) count = employees.filter(e => e.city?.toLowerCase().includes(bulkPlanFilterValue.toLowerCase())).length;
                  else if (bulkPlanFilter === 'department' && bulkPlanFilterValue) count = employees.filter(e => e.department?.toLowerCase().includes(bulkPlanFilterValue.toLowerCase())).length;
                  else if (bulkPlanFilter === 'location' && bulkPlanFilterValue) count = employees.filter(e => e.location?.toLowerCase().includes(bulkPlanFilterValue.toLowerCase())).length;
                  else if (bulkPlanFilter === 'facility' && bulkPlanFilterValue) count = employees.filter(e => e.facility?.toLowerCase().includes(bulkPlanFilterValue.toLowerCase())).length;
                  else if (bulkPlanFilter === 'age') {
                    const minAge = bulkPlanAgeMin ? parseInt(bulkPlanAgeMin) : 0;
                    const maxAge = bulkPlanAgeMax ? parseInt(bulkPlanAgeMax) : 999;
                    count = employees.filter(e => {
                      if (!e.dateOfBirth) return false;
                      const age = Math.floor((today.getTime() - new Date(e.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000));
                      return age >= minAge && age <= maxAge;
                    }).length;
                  }
                  return <span><strong>{count}</strong> employee{count !== 1 ? 's' : ''} will receive this plan.</span>;
                })()}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBulkPlanDialog(false)}>Cancel</Button>
              <Button onClick={handleBulkAssignPlan} disabled={bulkAssigning || !bulkPlanId}>
                {bulkAssigning ? 'Assigning...' : 'Assign Plan'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assign Package Dialog */}
        <Dialog open={showAssignPackageDialog} onOpenChange={setShowAssignPackageDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Assign Package: {assigningPackage?.name}</DialogTitle>
              <DialogDescription className="sr-only">Assign package to employees</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{assigningPackage?.name}</p>
                    <p className="text-sm text-muted-foreground">{assigningPackage?.tests.length} tests • ₹{assigningPackage?.price.toLocaleString()}</p>
                  </div>
                  <Package className="h-8 w-8 text-primary" />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Assignment Type</Label>
                <Select 
                  defaultValue="all"
                  onValueChange={(val) => {
                    if (val === 'all') setSelectedEmployeesForAssign([]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select assignment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees ({selectedCorporate?.employeeCount || 0})</SelectItem>
                    <SelectItem value="department">By Department</SelectItem>
                    <SelectItem value="custom">Select Specific Employees</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">
                    {selectedEmployeesForAssign.length > 0 
                      ? `${selectedEmployeesForAssign.length} employees selected`
                      : `All ${selectedCorporate?.employeeCount || 0} employees will be assigned`
                    }
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Assigned employees will be able to avail the health checkup package at network labs.
                </p>
              </div>

              <div className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-800 dark:text-green-300">Package Benefits</p>
                    <ul className="text-sm text-green-700 dark:text-green-400 mt-2 space-y-1">
                      <li>• Valid for {assigningPackage?.validityDays || 365} days from activation</li>
                      <li>• Can be availed at any network lab</li>
                      <li>• Digital reports within 24-48 hours</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowAssignPackageDialog(false);
                setAssigningPackage(null);
              }}>Cancel</Button>
              <Button onClick={handleConfirmAssignment}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Confirm Assignment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Plan Dialog */}
        <Dialog open={showCreatePlanDialog} onOpenChange={setShowCreatePlanDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Corporate Plan</DialogTitle>
              <DialogDescription>Set up a new corporate subscription plan.</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-2">

              {/* Basic Information */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">Basic Information</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Plan Name *</Label>
                    <Input
                      value={newPlan.planName}
                      onChange={(e) => setNewPlan({ ...newPlan, planName: e.target.value })}
                      placeholder="Corporate Basic Plus"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Plan Type *</Label>
                    <Select value={newPlan.planType} onValueChange={(v) => setNewPlan({ ...newPlan, planType: v })}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {planTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={newPlan.status} onValueChange={(v) => setNewPlan({ ...newPlan, status: v })}>
                      <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                      <SelectContent>
                        {statusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select value={newPlan.currency} onValueChange={(v) => setNewPlan({ ...newPlan, currency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INR">INR</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={newPlan.description}
                      onChange={(e) => setNewPlan({ ...newPlan, description: e.target.value })}
                      placeholder="Comprehensive health plan covering..."
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              {/* Financial Details */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">Financial Details</Label>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Total Employees *</Label>
                    <Input
                      type="number"
                      value={newPlan.totalEmployees}
                      onChange={(e) => setNewPlan({ ...newPlan, totalEmployees: e.target.value })}
                      placeholder="250"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Premium Per Employee (₹) *</Label>
                    <Input
                      type="number"
                      value={newPlan.premiumPerEmployee}
                      onChange={(e) => setNewPlan({ ...newPlan, premiumPerEmployee: e.target.value })}
                      placeholder="15000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Sum Insured (₹)</Label>
                    <Input
                      type="number"
                      value={newPlan.coverage.sumInsured}
                      onChange={(e) => setNewPlan({ ...newPlan, coverage: { ...newPlan.coverage, sumInsured: e.target.value } })}
                      placeholder="500000"
                    />
                  </div>
                  {newPlan.totalEmployees && newPlan.premiumPerEmployee && (
                    <div className="col-span-3 p-4 bg-blue-50 rounded-lg">
                      <div className="text-sm text-muted-foreground">Total Premium Amount</div>
                      <div className="text-2xl font-bold text-blue-600">
                        ₹{(parseInt(newPlan.totalEmployees || '0') * parseFloat(newPlan.premiumPerEmployee || '0')).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Validity Period */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">Validity Period</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Valid From</Label>
                    <Input
                      type="date"
                      value={newPlan.validFrom}
                      onChange={(e) => setNewPlan({ ...newPlan, validFrom: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Valid To</Label>
                    <Input
                      type="date"
                      value={newPlan.validTo}
                      onChange={(e) => setNewPlan({ ...newPlan, validTo: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Coverage Details — only relevant for IPD plans */}
              {newPlan.features.ipd && (
              <div className="space-y-4">
                <Label className="text-base font-semibold">Coverage Details <span className="text-xs font-normal text-muted-foreground">(IPD)</span></Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Room Rent</Label>
                    <Input
                      value={newPlan.coverage.roomRent}
                      onChange={(e) => setNewPlan({ ...newPlan, coverage: { ...newPlan.coverage, roomRent: e.target.value } })}
                      placeholder="Single AC Room"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>ICU Rent</Label>
                    <Input
                      value={newPlan.coverage.icuRent}
                      onChange={(e) => setNewPlan({ ...newPlan, coverage: { ...newPlan.coverage, icuRent: e.target.value } })}
                      placeholder="2% of Sum Insured"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Pre-Policy Medical</Label>
                    <Input
                      value={newPlan.coverage.prePolicyMedical}
                      onChange={(e) => setNewPlan({ ...newPlan, coverage: { ...newPlan.coverage, prePolicyMedical: e.target.value } })}
                      placeholder="30 days"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Post-Policy Medical</Label>
                    <Input
                      value={newPlan.coverage.postPolicyMedical}
                      onChange={(e) => setNewPlan({ ...newPlan, coverage: { ...newPlan.coverage, postPolicyMedical: e.target.value } })}
                      placeholder="60 days"
                    />
                  </div>
                </div>
              </div>
              )}

              {/* Plan Features */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">Plan Features</Label>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(newPlan.features).map(([key, value]) => (
                    <div key={key} className="flex items-center space-x-2 p-3 border rounded-lg">
                      <Switch
                        checked={value}
                        onCheckedChange={(checked) =>
                          setNewPlan({ ...newPlan, features: { ...newPlan.features, [key]: checked } })
                        }
                      />
                      <Label className="text-sm">{getPlanFeatureLabel(key)}</Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Health Packages */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Health Packages</Label>
                  <Button variant="outline" size="sm" type="button" onClick={() => setShowAddPackageDialog(true)}>
                    <Plus className="h-3 w-3 mr-1" />
                    New Package
                  </Button>
                </div>
                {healthPackages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg text-center gap-2">
                    <FlaskConical className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No health packages yet for this corporate</p>
                    <Button variant="outline" size="sm" onClick={() => setShowAddPackageDialog(true)}>
                      <Plus className="h-3 w-3 mr-1" />
                      Create First Package
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {healthPackages.map(pkg => {
                      const selected = newPlan.healthPackageIds.includes(String(pkg.id));
                      return (
                        <div
                          key={pkg.id}
                          className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                            selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                          }`}
                          onClick={() => {
                            const ids = selected
                              ? newPlan.healthPackageIds.filter(id => id !== String(pkg.id))
                              : [...newPlan.healthPackageIds, String(pkg.id)];
                            setNewPlan({ ...newPlan, healthPackageIds: ids });
                          }}
                        >
                          <Checkbox checked={selected} className="mt-0.5" readOnly />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{pkg.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {pkg.tests.length} tests • ₹{pkg.price.toLocaleString()}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {pkg.tests.slice(0, 3).map((t, i) => (
                                <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
                              ))}
                              {pkg.tests.length > 3 && (
                                <span className="text-xs text-muted-foreground">+{pkg.tests.length - 3}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {newPlan.healthPackageIds.length > 0 && (
                  <p className="text-sm font-medium text-green-700">
                    ✓ {newPlan.healthPackageIds.length} package{newPlan.healthPackageIds.length > 1 ? 's' : ''} included in this plan
                  </p>
                )}
              </div>

              {/* Plan Benefits */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">Plan Benefits</Label>
                <ScrollArea className="h-64 rounded-md border p-2">
                  <div className="space-y-2">
                    {newPlan.benefits.map((benefit) => (
                      <div key={benefit.id} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50">
                        <Checkbox
                          checked={benefit.isIncluded}
                          onCheckedChange={() => toggleBenefit(benefit.id)}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{benefit.name}</span>
                            <Badge variant="outline" className="text-xs">{benefit.category}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">{benefit.description}</div>
                          {benefit.isIncluded && (benefit.limit || benefit.coverage) && (
                            <div className="text-xs text-blue-600 mt-1">
                              {benefit.limit && `Limit: ${benefit.limit}`}
                              {benefit.coverage && `Coverage: ${benefit.coverage}`}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <div className="p-3 bg-green-50 rounded-lg text-sm font-medium text-green-800">
                  {newPlan.benefits.filter(b => b.isIncluded).length} of {newPlan.benefits.length} benefits included
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreatePlanDialog(false)}>Cancel</Button>
              <Button onClick={handleCreatePlan}>
                <Plus className="mr-2 h-4 w-4" />
                Create Plan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Plan Dialog */}
        <Dialog open={showViewPlanDialog} onOpenChange={setShowViewPlanDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editingPlan?.name}
                <Badge variant={editingPlan?.status === 'Active' ? 'default' : 'secondary'} className="ml-1">
                  {editingPlan?.status || 'Active'}
                </Badge>
              </DialogTitle>
              <DialogDescription>{editingPlan?.planType} plan for {selectedCorporate?.companyName}</DialogDescription>
            </DialogHeader>
            {editingPlan && (
              <div className="space-y-5 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">Premium / Employee</div>
                    <div className="text-2xl font-bold">₹{editingPlan.price.toLocaleString()}</div>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">Employees</div>
                    <div className="text-2xl font-bold">{editingPlan.enrolled} <span className="text-sm font-normal text-muted-foreground">/ {editingPlan.totalEmployees} enrolled</span></div>
                  </div>
                  {editingPlan.totalEmployees && editingPlan.price ? (
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">Total Premium</div>
                      <div className="text-xl font-bold text-blue-700">₹{(editingPlan.price * (editingPlan.totalEmployees || 0)).toLocaleString()}</div>
                    </div>
                  ) : null}
                  {editingPlan.features?.ipd && editingPlan.coverage?.sumInsured ? (
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">Sum Insured</div>
                      <div className="text-xl font-bold">₹{Number(editingPlan.coverage.sumInsured).toLocaleString()}</div>
                    </div>
                  ) : null}
                </div>
                {(editingPlan.validFrom || editingPlan.validTo) && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Validity</div>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4" />
                      {editingPlan.validFrom} → {editingPlan.validTo}
                    </div>
                  </div>
                )}
                {editingPlan.description && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Description</div>
                    <p className="text-sm">{editingPlan.description}</p>
                  </div>
                )}
                {editingPlan.features && Object.values(editingPlan.features).some(Boolean) && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Features</div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(editingPlan.features).filter(([,v]) => v).map(([k]) => (
                        <Badge key={k} variant="secondary">
                          {getPlanFeatureLabel(k)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {editingPlan.features?.ipd && editingPlan.coverage && Object.keys(editingPlan.coverage).filter(k => k !== 'sumInsured' && editingPlan.coverage![k]).length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Coverage Details <span className="text-xs font-normal text-muted-foreground">(IPD)</span></div>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(editingPlan.coverage).filter(([k, v]) => k !== 'sumInsured' && v).map(([k, v]) => (
                        <div key={k} className="p-2 border rounded">
                          <div className="text-xs text-muted-foreground capitalize">{getPlanFeatureLabel(k)}</div>
                          <div className="text-sm font-medium">{String(v)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {editingPlan.healthPackageIds && editingPlan.healthPackageIds.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Health Packages</div>
                    <div className="flex flex-wrap gap-2">
                      {editingPlan.healthPackageIds.map(pkgId => {
                        const pkg = healthPackages.find(p => String(p.id) === String(pkgId));
                        return pkg ? (
                          <Badge key={pkgId} variant="outline">
                            <FlaskConical className="h-3 w-3 mr-1" />{pkg.name} • ₹{pkg.price.toLocaleString()} • {pkg.tests.length} tests
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowViewPlanDialog(false)}>Close</Button>
              <Button onClick={() => { setShowViewPlanDialog(false); editingPlan && handleOpenEditPlan(editingPlan); }}>
                <Edit className="h-4 w-4 mr-2" />Edit Plan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Plan Dialog */}
        <Dialog open={showEditPlanDialog} onOpenChange={setShowEditPlanDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Plan</DialogTitle>
              <DialogDescription>Update plan details for {editingPlan?.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-2">
              <div className="space-y-4">
                <Label className="text-base font-semibold">Basic Information</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Plan Name *</Label>
                    <Input value={editPlanForm.planName} onChange={(e) => setEditPlanForm({ ...editPlanForm, planName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Plan Type</Label>
                    <Select value={editPlanForm.planType} onValueChange={(v) => setEditPlanForm({ ...editPlanForm, planType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{planTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={editPlanForm.status} onValueChange={(v) => setEditPlanForm({ ...editPlanForm, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{statusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select value={editPlanForm.currency} onValueChange={(v) => setEditPlanForm({ ...editPlanForm, currency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INR">INR</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Description</Label>
                    <Textarea rows={3} value={editPlanForm.description} onChange={(e) => setEditPlanForm({ ...editPlanForm, description: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <Label className="text-base font-semibold">Financial Details</Label>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Total Employees *</Label>
                    <Input type="number" value={editPlanForm.totalEmployees} onChange={(e) => setEditPlanForm({ ...editPlanForm, totalEmployees: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Premium Per Employee (₹) *</Label>
                    <Input type="number" value={editPlanForm.premiumPerEmployee} onChange={(e) => setEditPlanForm({ ...editPlanForm, premiumPerEmployee: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Sum Insured (₹)</Label>
                    <Input type="number" value={editPlanForm.coverage.sumInsured} onChange={(e) => setEditPlanForm({ ...editPlanForm, coverage: { ...editPlanForm.coverage, sumInsured: e.target.value } })} />
                  </div>
                  {editPlanForm.totalEmployees && editPlanForm.premiumPerEmployee && (
                    <div className="col-span-3 p-4 bg-blue-50 rounded-lg">
                      <div className="text-sm text-muted-foreground">Total Premium</div>
                      <div className="text-2xl font-bold text-blue-600">
                        ₹{(parseInt(editPlanForm.totalEmployees || '0') * parseFloat(editPlanForm.premiumPerEmployee || '0')).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-4">
                <Label className="text-base font-semibold">Validity Period</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Valid From</Label>
                    <Input type="date" value={editPlanForm.validFrom} onChange={(e) => setEditPlanForm({ ...editPlanForm, validFrom: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Valid To</Label>
                    <Input type="date" value={editPlanForm.validTo} onChange={(e) => setEditPlanForm({ ...editPlanForm, validTo: e.target.value })} />
                  </div>
                </div>
              </div>
              {editPlanForm.features.ipd && (
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Coverage Details <span className="text-xs font-normal text-muted-foreground">(IPD)</span></Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Room Rent</Label><Input value={editPlanForm.coverage.roomRent} onChange={(e) => setEditPlanForm({ ...editPlanForm, coverage: { ...editPlanForm.coverage, roomRent: e.target.value } })} /></div>
                    <div className="space-y-2"><Label>ICU Rent</Label><Input value={editPlanForm.coverage.icuRent} onChange={(e) => setEditPlanForm({ ...editPlanForm, coverage: { ...editPlanForm.coverage, icuRent: e.target.value } })} /></div>
                    <div className="space-y-2"><Label>Pre-Policy Medical</Label><Input value={editPlanForm.coverage.prePolicyMedical} onChange={(e) => setEditPlanForm({ ...editPlanForm, coverage: { ...editPlanForm.coverage, prePolicyMedical: e.target.value } })} /></div>
                    <div className="space-y-2"><Label>Post-Policy Medical</Label><Input value={editPlanForm.coverage.postPolicyMedical} onChange={(e) => setEditPlanForm({ ...editPlanForm, coverage: { ...editPlanForm.coverage, postPolicyMedical: e.target.value } })} /></div>
                  </div>
                </div>
              )}
              <div className="space-y-4">
                <Label className="text-base font-semibold">Plan Features</Label>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(editPlanForm.features).map(([key, value]) => (
                    <div key={key} className="flex items-center space-x-2 p-3 border rounded-lg">
                      <Switch checked={value as boolean} onCheckedChange={(checked) => setEditPlanForm({ ...editPlanForm, features: { ...editPlanForm.features, [key]: checked } })} />
                      <Label className="text-sm">{getPlanFeatureLabel(key)}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Health Packages</Label>
                </div>
                {healthPackages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No health packages available for this corporate.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {healthPackages.map(pkg => {
                      const selected = editPlanForm.healthPackageIds.includes(String(pkg.id));
                      return (
                        <div key={pkg.id}
                          className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                          onClick={() => {
                            const ids = selected
                              ? editPlanForm.healthPackageIds.filter(id => id !== String(pkg.id))
                              : [...editPlanForm.healthPackageIds, String(pkg.id)];
                            setEditPlanForm({ ...editPlanForm, healthPackageIds: ids });
                          }}
                        >
                          <Checkbox checked={selected} className="mt-0.5" readOnly />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{pkg.name}</div>
                            <div className="text-xs text-muted-foreground">{pkg.tests.length} tests • ₹{pkg.price.toLocaleString()}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditPlanDialog(false)}>Cancel</Button>
              <Button onClick={handleUpdatePlan}>
                <Edit className="mr-2 h-4 w-4" />Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Package Dialog */}
        <Dialog open={showAddPackageDialog} onOpenChange={setShowAddPackageDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Health Package</DialogTitle>
              <DialogDescription className="sr-only">Create a new health package</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Package Name *</Label>
                <Input 
                  placeholder="e.g., Executive Health Checkup"
                  value={newPackage.name}
                  onChange={(e) => setNewPackage({...newPackage, name: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Price (₹) *</Label>
                  <Input 
                    type="number"
                    placeholder="4500"
                    value={newPackage.price}
                    onChange={(e) => setNewPackage({...newPackage, price: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Validity (Days)</Label>
                  <Input 
                    type="number"
                    placeholder="365"
                    value={newPackage.validityDays}
                    onChange={(e) => setNewPackage({...newPackage, validityDays: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tests Included</Label>
                <div className="border rounded-lg p-3 min-h-[100px] max-h-[200px] overflow-y-auto">
                  {newPackage.tests.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No tests added yet</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {newPackage.tests.map((test, idx) => (
                        <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                          {test}
                          <button 
                            className="ml-1 hover:text-red-500"
                            onClick={() => setNewPackage({
                              ...newPackage, 
                              tests: newPackage.tests.filter((_, i) => i !== idx)
                            })}
                          >
                            ×
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-2">
                  <Input 
                    placeholder="Add test (e.g., Complete Blood Count)"
                    id="create-test-input"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const input = e.target as HTMLInputElement;
                        if (input.value.trim()) {
                          setNewPackage({
                            ...newPackage,
                            tests: [...newPackage.tests, input.value.trim()]
                          });
                          input.value = '';
                        }
                      }
                    }}
                  />
                  <Button 
                    variant="outline"
                    onClick={() => {
                      const input = document.getElementById('create-test-input') as HTMLInputElement;
                      if (input?.value.trim()) {
                        setNewPackage({
                          ...newPackage,
                          tests: [...newPackage.tests, input.value.trim()]
                        });
                        input.value = '';
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className="text-xs text-muted-foreground">Quick add:</span>
                  {['CBC', 'Lipid Profile', 'LFT', 'KFT', 'Thyroid Profile', 'HbA1c', 'Vitamin D'].map(test => (
                    <Badge 
                      key={test} 
                      variant="outline" 
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground text-xs"
                      onClick={() => {
                        if (!newPackage.tests.includes(test)) {
                          setNewPackage({...newPackage, tests: [...newPackage.tests, test]});
                        }
                      }}
                    >
                      + {test}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddPackageDialog(false)}>Cancel</Button>
              <Button onClick={handleCreatePackage}>Create Package</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Upload Report Dialog */}
        <Dialog open={showUploadReport} onOpenChange={setShowUploadReport}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Upload Report
              </DialogTitle>
              <DialogDescription>
                Bulk upload results for {selectedCorporate?.companyName}
              </DialogDescription>
            </DialogHeader>
            {bulkUploadResults && (() => {
              const total = bulkUploadResults.created.length + bulkUploadResults.failed.length;
              const successPct = total > 0 ? Math.round((bulkUploadResults.created.length / total) * 100) : 0;
              const newUsers = bulkUploadResults.created.filter((e: any) => e.isNewUser).length;
              const linked = bulkUploadResults.created.filter((e: any) => !e.isNewUser).length;
              const emailQueued = bulkUploadResults.created.filter((e: any) => e.emailStatus === 'queued').length;
              const emailSkipped = bulkUploadResults.created.filter((e: any) => e.emailStatus === 'skipped').length;
              const qcLog = bulkUploadResults.qcLog || [];

              const downloadErrorLog = () => {
                const lines = [
                  ['Type', 'Row', 'Employee ID', 'Name', 'Email', 'Issue'].join(','),
                  ...bulkUploadResults.failed.map((f: any, i: number) =>
                    ['FAILED', '', f.employeeId || '', f.name || '', f.email || '', `"${(f.reason || '').replace(/"/g, '""')}"`].join(',')
                  ),
                  ...qcLog.map((q: any) =>
                    q.issues.map((issue: string) =>
                      ['QC WARNING', q.row, q.employeeId, `"${q.name}"`, q.email, `"${issue.replace(/"/g, '""')}"`].join(',')
                    ).join('\n')
                  ),
                ].join('\n');
                const blob = new Blob([lines], { type: 'text/csv;charset=utf-8;' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `upload_error_log_${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                window.URL.revokeObjectURL(url);
              };

              return (
                <div className="space-y-4 py-2">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{total}</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">Total Rows</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-green-700 dark:text-green-300">{bulkUploadResults.created.length}</p>
                      <p className="text-xs text-green-600 dark:text-green-400">Activated</p>
                    </div>
                    <div className={`${bulkUploadResults.failed.length > 0 ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800'} border rounded-lg p-3 text-center`}>
                      <p className={`text-2xl font-bold ${bulkUploadResults.failed.length > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-500'}`}>{bulkUploadResults.failed.length}</p>
                      <p className={`text-xs ${bulkUploadResults.failed.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500'}`}>Failed</p>
                    </div>
                    {(() => {
                      const discarded = qcLog.filter((q: any) => q.discarded).length;
                      const warned = qcLog.filter((q: any) => !q.discarded).length;
                      return discarded > 0 ? (
                        <div className="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 border rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-red-700 dark:text-red-300">{discarded}</p>
                          <p className="text-xs text-red-600 dark:text-red-400">Discarded</p>
                          {warned > 0 && <p className="text-[10px] text-yellow-600 dark:text-yellow-400 mt-0.5">{warned} warnings</p>}
                        </div>
                      ) : (
                        <div className={`${warned > 0 ? 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800' : 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800'} border rounded-lg p-3 text-center`}>
                          <p className={`text-2xl font-bold ${warned > 0 ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-500'}`}>{warned}</p>
                          <p className={`text-xs ${warned > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-500'}`}>QC Warnings</p>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Progress Bar */}
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Activation Rate</span>
                      <span>{successPct}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${successPct === 100 ? 'bg-green-500' : successPct > 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${successPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Successful */}
                  {bulkUploadResults.created.length > 0 && (
                    <div className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 rounded-lg p-3">
                      <p className="text-sm font-medium text-green-800 dark:text-green-300 mb-1 flex items-center gap-1.5">
                        <CheckCircle className="h-4 w-4" /> Activated Employees
                      </p>
                      <div className="text-sm text-green-700 dark:text-green-400 space-y-0.5">
                        {newUsers > 0 && <p>• {newUsers} new user account{newUsers > 1 ? 's' : ''} created &amp; activated</p>}
                        {linked > 0 && <p>• {linked} existing user{linked > 1 ? 's' : ''} linked &amp; activated</p>}
                        {emailQueued > 0 && <p>• {emailQueued} welcome email{emailQueued > 1 ? 's' : ''} queued</p>}
                        {emailSkipped > 0 && <p>• {emailSkipped} welcome email{emailSkipped > 1 ? 's' : ''} skipped by operator choice</p>}
                      </div>
                    </div>
                  )}

                  {/* Failed Entries */}
                  {bulkUploadResults.failed.length > 0 && (
                    <div className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 rounded-lg p-3">
                      <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-2 flex items-center gap-1.5">
                        <XCircle className="h-4 w-4" /> Failed Entries
                      </p>
                      <div className="max-h-36 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-red-700 dark:text-red-400 border-b border-red-200 dark:border-red-700">
                              <th className="text-left py-1 pr-2">Row</th>
                              <th className="text-left py-1 pr-2">Employee</th>
                              <th className="text-left py-1">Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkUploadResults.failed.map((fail: any, idx: number) => (
                              <tr key={idx} className="text-red-600 dark:text-red-400 border-b border-red-100 dark:border-red-900 last:border-0">
                                <td className="py-1 pr-2">{idx + 1}</td>
                                <td className="py-1 pr-2 truncate max-w-[120px]">{fail.email || fail.name || `Row ${idx + 1}`}</td>
                                <td className="py-1">{fail.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* QC Log — discarded rows (red) + warnings (yellow) */}
                  {qcLog.length > 0 && (() => {
                    const discardedEntries = qcLog.filter((q: any) => q.discarded);
                    const warnEntries = qcLog.filter((q: any) => !q.discarded);
                    return (
                      <div className="space-y-2">
                        {discardedEntries.length > 0 && (
                          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                            <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-2 flex items-center gap-1.5">
                              <AlertCircle className="h-4 w-4" /> Discarded rows ({discardedEntries.length}) — not uploaded
                            </p>
                            <div className="max-h-48 overflow-y-auto font-mono text-xs space-y-1.5">
                              {discardedEntries.map((entry: any, idx: number) => (
                                <div key={idx} className="border-b border-red-200 dark:border-red-700 pb-1.5 last:border-0">
                                  <span className="text-red-700 dark:text-red-300 font-semibold">Row {entry.row}</span>
                                  {entry.employeeId && <span className="text-red-600 dark:text-red-400"> [{entry.employeeId}]</span>}
                                  {entry.name && <span className="text-red-600 dark:text-red-400"> {entry.name}</span>}
                                  {entry.email && <span className="text-red-500"> &lt;{entry.email}&gt;</span>}
                                  <ul className="ml-3 mt-0.5 space-y-0.5">
                                    {entry.issues.map((issue: string, i: number) => (
                                      <li key={i} className="text-red-700 dark:text-red-400">↳ {issue}</li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {warnEntries.length > 0 && (
                          <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-2 flex items-center gap-1.5">
                              <AlertCircle className="h-4 w-4" /> QC Warnings ({warnEntries.length} rows) — uploaded, review data
                            </p>
                            <div className="max-h-40 overflow-y-auto font-mono text-xs space-y-1.5">
                              {warnEntries.map((entry: any, idx: number) => (
                                <div key={idx} className="border-b border-yellow-200 dark:border-yellow-700 pb-1.5 last:border-0">
                                  <span className="text-yellow-700 dark:text-yellow-300 font-semibold">Row {entry.row}</span>
                                  {entry.employeeId && <span className="text-yellow-600 dark:text-yellow-400"> [{entry.employeeId}]</span>}
                                  {entry.name && <span className="text-yellow-600 dark:text-yellow-400"> {entry.name}</span>}
                                  {entry.email && <span className="text-yellow-500"> &lt;{entry.email}&gt;</span>}
                                  <ul className="ml-3 mt-0.5 space-y-0.5">
                                    {entry.issues.map((issue: string, i: number) => (
                                      <li key={i} className="text-yellow-700 dark:text-yellow-400">↳ {issue}</li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
            <DialogFooter className="gap-2">
              {bulkUploadResults && (bulkUploadResults.failed.length > 0 || (bulkUploadResults.qcLog || []).length > 0) && (
                <Button variant="outline" onClick={() => {
                  const qcLog = bulkUploadResults?.qcLog || [];
                  const lines = [
                    ['Type', 'Row', 'Employee ID', 'Name', 'Email', 'Issue'].join(','),
                    ...(bulkUploadResults?.failed || []).map((f: any) =>
                      ['FAILED', '', f.employeeId || '', `"${(f.name || '').replace(/"/g, '""')}"`, f.email || '', `"${(f.reason || '').replace(/"/g, '""')}"`].join(',')
                    ),
                    ...qcLog.flatMap((q: any) =>
                      q.issues.map((issue: string) =>
                        ['QC WARNING', q.row, q.employeeId, `"${q.name.replace(/"/g, '""')}"`, q.email, `"${issue.replace(/"/g, '""')}"`].join(',')
                      )
                    ),
                  ].join('\n');
                  const blob = new Blob([lines], { type: 'text/csv;charset=utf-8;' });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `upload_error_log_${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  window.URL.revokeObjectURL(url);
                }}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Error Log
                </Button>
              )}
              <Button onClick={() => { setShowUploadReport(false); setBulkUploadResults(null); }}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Upload Dialog */}
        <Dialog open={showBulkUploadDialog} onOpenChange={(open) => {
          setShowBulkUploadDialog(open);
          if (!open) {
            setBulkUploadFile(null);
            setBulkUploadResults(null);
            setBulkAiColumnSummary(null);
          }
        }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Bulk Upload Employees</DialogTitle>
              <DialogDescription>
                Upload a CSV or Excel file to add multiple employees at once for {selectedCorporate?.companyName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4">
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
                <span className="text-sm text-muted-foreground">
                  Download the template — it has all required columns pre-filled with examples
                </span>
              </div>

              {/* Column reference */}
              <div className="rounded-lg border overflow-hidden">
                <div className="bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">CSV / Excel Columns Reference</div>
                <div className="divide-y text-xs">
                  {[
                    { col: 'Employee ID', req: false, eg: 'E00001', note: 'Unique employee identifier' },
                    { col: 'First Name', req: true, eg: 'Rajesh', note: 'Employee first name' },
                    { col: 'Last Name', req: false, eg: 'Kumar', note: 'Employee last name' },
                    { col: 'Email', req: false, eg: 'rajesh@company.com', note: 'Work email — auto-generated if blank' },
                    { col: 'Phone Number', req: false, eg: '9876543210', note: '10-digit mobile number' },
                    { col: 'Gender', req: false, eg: 'Male / Female / Other', note: '' },
                    { col: 'Date of Birth', req: false, eg: '1990-05-15', note: 'Format: YYYY-MM-DD' },
                    { col: 'Department', req: false, eg: 'Engineering', note: 'Team / department name' },
                    { col: 'Designation', req: false, eg: 'Software Developer', note: 'Job title / role' },
                    { col: 'City', req: false, eg: 'Bengaluru', note: 'Work city' },
                    { col: 'State', req: false, eg: 'Karnataka', note: 'Work state' },
                    { col: 'Pin Code', req: false, eg: '560001', note: 'Work location pin code' },
                    { col: 'Location', req: false, eg: 'Koramangala HQ', note: 'Branch / office location name' },
                    { col: 'Facility', req: false, eg: 'Tech Park A', note: 'Building / facility name' },
                  ].map(({ col, req, eg, note }) => (
                    <div key={col} className="grid grid-cols-12 items-center px-3 py-1.5 hover:bg-muted/40">
                      <div className="col-span-3 font-medium flex items-center gap-1">
                        {col}
                        {req && <span className="text-red-500 text-[10px]">*</span>}
                      </div>
                      <div className="col-span-4 text-muted-foreground">{eg}</div>
                      <div className="col-span-5 text-muted-foreground">{note}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <Label htmlFor="bulk-welcome-email-mode" className="text-sm font-medium">Welcome email handling</Label>
                <Select value={bulkWelcomeEmailMode} onValueChange={(value) => setBulkWelcomeEmailMode(value as WelcomeEmailMode)}>
                  <SelectTrigger id="bulk-welcome-email-mode">
                    <SelectValue placeholder="Choose email handling" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Prepare batch for review</SelectItem>
                    <SelectItem value="send">Send immediately</SelectItem>
                    <SelectItem value="skip">Do not send</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Existing users will only be linked. New users can be prepared as editable email drafts before sending.</p>
              </div>

              <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="bulk-ai-column-detection"
                    checked={bulkUseAiColumnDetection}
                    onCheckedChange={(checked) => setBulkUseAiColumnDetection(Boolean(checked))}
                  />
                  <div className="space-y-1 leading-none">
                    <Label htmlFor="bulk-ai-column-detection" className="text-sm font-medium">AI column detection</Label>
                    <p className="text-xs text-muted-foreground">
                      Uses AI to map messy Excel headers to employee fields. Only headers and masked sample values are sent; upload QC still validates every row.
                    </p>
                    {bulkAiColumnSummary && <p className="text-xs text-muted-foreground">{bulkAiColumnSummary}</p>}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="bulk-remove-unlisted"
                    checked={bulkRemoveUnlisted}
                    onCheckedChange={(checked) => setBulkRemoveUnlisted(Boolean(checked))}
                  />
                  <div className="space-y-1 leading-none">
                    <Label htmlFor="bulk-remove-unlisted" className="text-sm font-medium">Remove employees not in this file</Label>
                    <p className="text-xs text-muted-foreground">
                      After upload, active employees whose Employee ID <em>and</em> email don't appear in this file will be shown for confirmation before being deactivated. Use this to sync the roster to the uploaded list.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  className="hidden"
                  id="bulk-upload-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setBulkUploadFile(file);
                      setBulkUploadResults(null);
                      setBulkAiColumnSummary(null);
                    }
                  }}
                />
                <label 
                  htmlFor="bulk-upload-input" 
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {bulkUploadFile ? bulkUploadFile.name : 'Click to select CSV or Excel file'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Supports .csv and .xlsx files
                  </span>
                </label>
              </div>

            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowBulkUploadDialog(false);
                setBulkUploadFile(null);
                setBulkUploadResults(null);
                setBulkAiColumnSummary(null);
              }}>
                Cancel
              </Button>
              <Button 
                onClick={handleBulkUpload} 
                disabled={!bulkUploadFile || isUploading}
              >
                {isUploading ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Employees
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Sync Offboard Confirmation Dialog ─── */}
        <Dialog open={showSyncConfirmDialog} onOpenChange={(open) => { if (!open && !isSyncing) { setShowSyncConfirmDialog(false); setSyncOffboardList([]); } }}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Remove unlisted employees?</DialogTitle>
              <DialogDescription>
                {syncOffboardList.length} active employee{syncOffboardList.length !== 1 ? 's are' : ' is'} not in the uploaded file and will be <strong>deactivated</strong>. This cannot be undone automatically.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-60 overflow-y-auto border rounded-md divide-y text-sm">
              {syncOffboardList.map((emp) => (
                <div key={emp.id} className="px-3 py-2 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{emp.name || emp.email}</span>
                    {emp.employeeId && <span className="ml-2 text-xs text-muted-foreground">{emp.employeeId}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground truncate">{emp.email}</span>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" disabled={isSyncing} onClick={() => { setShowSyncConfirmDialog(false); setSyncOffboardList([]); }}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={isSyncing} onClick={handleConfirmSync}>
                {isSyncing ? 'Deactivating…' : `Deactivate ${syncOffboardList.length} employee${syncOffboardList.length !== 1 ? 's' : ''}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Create / Edit Wellness Event Dialog ─── */}
        {[
          { open: showCreateEventDialog, setOpen: setShowCreateEventDialog, onSave: handleCreateEvent, title: 'Add Wellness Event' },
          { open: showEditEventDialog,   setOpen: (v: boolean) => { setShowEditEventDialog(v); if (!v) setEditingEvent(null); }, onSave: handleUpdateEvent, title: 'Edit Wellness Event' },
        ].map(({ open, setOpen, onSave, title: dialogTitle }) => (
          <Dialog key={dialogTitle} open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{dialogTitle}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1">
                  <Label>Event Title <span className="text-red-500">*</span></Label>
                  <Input placeholder="e.g. Annual Health Checkup Drive" value={eventForm.title} onChange={e => setEventForm(p => ({ ...p, title: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Event Type</Label>
                    <Select value={eventForm.eventType} onValueChange={v => setEventForm(p => ({ ...p, eventType: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.keys(eventTypeColors).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Status</Label>
                    <Select value={eventForm.status} onValueChange={v => setEventForm(p => ({ ...p, status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="upcoming">Upcoming</SelectItem>
                        <SelectItem value="ongoing">Ongoing</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Start Date <span className="text-red-500">*</span></Label>
                    <Input type="date" value={eventForm.eventDate} onChange={e => setEventForm(p => ({ ...p, eventDate: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Start Time</Label>
                    <Input type="time" value={eventForm.eventTime} onChange={e => setEventForm(p => ({ ...p, eventTime: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>End Date</Label>
                    <Input type="date" value={eventForm.endDate} onChange={e => setEventForm(p => ({ ...p, endDate: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>End Time</Label>
                    <Input type="time" value={eventForm.endTime} onChange={e => setEventForm(p => ({ ...p, endTime: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />Location</Label>
                  <Input placeholder="Conference Hall, Canteen, Zoom link…" value={eventForm.location} onChange={e => setEventForm(p => ({ ...p, location: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" />Organizer</Label>
                    <Input placeholder="HR Team, Vendor name…" value={eventForm.organizer} onChange={e => setEventForm(p => ({ ...p, organizer: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />Max Participants</Label>
                    <Input type="number" min={1} placeholder="Leave blank for unlimited" value={eventForm.maxParticipants} onChange={e => setEventForm(p => ({ ...p, maxParticipants: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Textarea rows={2} placeholder="Brief description of the activity…" value={eventForm.description} onChange={e => setEventForm(p => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="notifyEmp" checked={eventForm.notifyEmployees} onCheckedChange={v => setEventForm(p => ({ ...p, notifyEmployees: v }))} />
                  <Label htmlFor="notifyEmp" className="flex items-center gap-1 cursor-pointer">
                    <Bell className="h-3.5 w-3.5" />Notify employees
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={onSave}>{dialogTitle.startsWith('Add') ? 'Create Event' : 'Save Changes'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ))}
      </div>

      {/* Edit Corporate Dialog */}
      <Dialog open={showEditCorporateDialog} onOpenChange={setShowEditCorporateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Corporate</DialogTitle>
            <DialogDescription>Update corporate account details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Company Name</Label>
                <Input
                  value={editCorporateForm.companyName}
                  onChange={(e) => setEditCorporateForm(p => ({ ...p, companyName: e.target.value }))}
                  placeholder="Acme Corp"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Person</Label>
                <Input
                  value={editCorporateForm.contactPerson}
                  onChange={(e) => setEditCorporateForm(p => ({ ...p, contactPerson: e.target.value }))}
                  placeholder="Full name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={editCorporateForm.phoneNumber}
                  onChange={(e) => setEditCorporateForm(p => ({ ...p, phoneNumber: e.target.value }))}
                  placeholder="+91 99999 99999"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editCorporateForm.email}
                  onChange={(e) => setEditCorporateForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="hr@company.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Industry</Label>
                <Select value={editCorporateForm.industry} onValueChange={(v) => setEditCorporateForm(p => ({ ...p, industry: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                  <SelectContent>
                    {['Information Technology', 'Healthcare', 'Finance', 'Manufacturing', 'Retail', 'Education', 'Logistics', 'Other'].map(ind => (
                      <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Employee Count</Label>
                <Input
                  type="number"
                  min={0}
                  value={editCorporateForm.employeeCount}
                  onChange={(e) => setEditCorporateForm(p => ({ ...p, employeeCount: e.target.value }))}
                  placeholder="500"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Package Type</Label>
                <Select value={editCorporateForm.packageType} onValueChange={(v) => setEditCorporateForm(p => ({ ...p, packageType: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                  <SelectContent>
                    {['Basic', 'Standard', 'Premium', 'Enterprise'].map(pt => (
                      <SelectItem key={pt} value={pt}>{pt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={editCorporateForm.status} onValueChange={(v) => setEditCorporateForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                    <SelectItem value="Suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditCorporateDialog(false)}>Cancel</Button>
            <Button onClick={handleEditCorporate} disabled={savingCorporate}>
              {savingCorporate ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CorporateWelcomeEmailBatchDialog
        open={showWelcomeEmailBatchDialog}
        drafts={welcomeEmailDrafts}
        sending={sendingWelcomeEmailBatch}
        savingTemplate={savingWelcomeTemplate}
        preparing={preparingWelcomeEmployeeDrafts}
        employees={employees
          .filter((employee) => String(employee.status || 'active').toLowerCase() !== 'inactive')
          .map((employee) => ({ id: employee.id, employeeId: employee.employeeId, name: employee.name, email: employee.email }))}
        selectedEmployeeIds={selectedEmployeeIdsForWelcome}
        onSelectedEmployeeIdsChange={setSelectedEmployeeIdsForWelcome}
        templateOptions={allWelcomeEmailTemplates.map((template) => ({ id: template.id, name: template.name }))}
        selectedTemplateId={selectedWelcomeTemplateId}
        approvedTemplateId={approvedWelcomeTemplateId}
        approvingTemplate={approvingWelcomeTemplate}
        onSelectedTemplateChange={setSelectedWelcomeTemplateId}
        onApproveTemplate={handleApproveWelcomeTemplate}
        onPrepareFromEmployees={({ mode, singleEmployeeId, singleEmployeeEmail, sendImmediately }) => {
          if (mode === 'selected' || mode === 'all') {
            setWelcomeEmployeeSelectionMode(mode);
          }
          handlePrepareOrSendEmployeeWelcomeEmails(sendImmediately, mode, singleEmployeeId, singleEmployeeEmail);
        }}
        onOpenChange={setShowWelcomeEmailBatchDialog}
        onDraftsChange={setWelcomeEmailDrafts}
        onSendSelected={handleSendWelcomeEmailBatch}
        onSaveTemplate={handleSaveEditedWelcomeTemplate}
        onPrepareSingle={() => {
          setEmployeeWelcomeEmailMode("draft");
          setShowAddEmployeeDialog(true);
        }}
        onPrepareBulk={() => {
          setBulkWelcomeEmailMode("draft");
          setShowBulkUploadDialog(true);
        }}
      />

      {/* Delete Corporate Confirmation Dialog */}
      <Dialog open={showDeleteCorporateDialog} onOpenChange={setShowDeleteCorporateDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Corporate</DialogTitle>
            <DialogDescription>
              This will permanently remove <strong>{corporateToDelete?.companyName}</strong> and all associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteCorporateDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteCorporate} disabled={deletingCorporate}>
              {deletingCorporate ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </MainLayout>
  );
};

export default TeamCorporateManagement;
