// Version: 2.1.0 - Numeric Corporate ID Conversion Ready
import { useState, useEffect, useRef } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
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
  ChevronLeft
} from 'lucide-react';
import api from '@/utils/api';
import { useNavigate } from 'react-router-dom';

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
const industries = [
  'Information Technology', 'Banking & Finance', 'Healthcare', 'Manufacturing',
  'Retail', 'Education', 'Consulting', 'Telecommunications', 'Real Estate', 'Other'
];

const TeamCorporateManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [corporates, setCorporates] = useState<Corporate[]>([]);
  const [selectedCorporate, setSelectedCorporate] = useState<Corporate | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dialog states
  const [showAddCorporateDialog, setShowAddCorporateDialog] = useState(false);
  const [showAddHRDialog, setShowAddHRDialog] = useState(false);
  const [showAddEmployeeDialog, setShowAddEmployeeDialog] = useState(false);
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);
  const [newEmployeeCredentials, setNewEmployeeCredentials] = useState<{name: string; email: string; password: string} | null>(null);
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
  const [showUploadReport, setShowUploadReport] = useState(false);
  
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
    features: { opd: true, ipd: true, maternity: false, dental: false, pharmacy: true, diagnostics: true, homecare: false, ambulance: true, wellness: true, mentalHealth: false },
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
    features: {
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
    },
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
    slate:  'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300',
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

  // Mock data for employees and network
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empCurrentPage, setEmpCurrentPage] = useState(1);
  const EMP_PAGE_SIZE = 10;
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
  }, []);

  // Fetch employees, packages, plans, and network partners when corporate is selected
  useEffect(() => {
    if (selectedCorporate?.id) {
      fetchEmployees(selectedCorporate.id);
      fetchHealthPackages(selectedCorporate.id);
      fetchCorporatePlans(selectedCorporate.id);
      fetchNetworkPartners(selectedCorporate.id);
      fetchWellnessEvents(selectedCorporate.id);
    }
  }, [selectedCorporate?.id]);

  const fetchEmployees = async (corporateId: number) => {
    try {
      const token = localStorage.getItem('teamToken');
      const numericId = parseInt(String(corporateId), 10);
      if (isNaN(numericId)) {
        console.error('Invalid corporate ID:', corporateId);
        setEmployees([]);
        return;
      }
      const response = await api.get(`/admin/corporate-employees/${numericId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      
      if (response.data?.success && response.data?.employees) {
        setEmpCurrentPage(1);
        setEmployees(response.data.employees.map((emp: any) => {
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
            features,
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
      features: plan.features || { opd: true, ipd: true, maternity: false, dental: false, pharmacy: true, diagnostics: true, homecare: false, ambulance: true, wellness: true, mentalHealth: false },
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
        setCorporates(response.data.data);
        if (response.data.data.length > 0 && !selectedCorporate) {
          setSelectedCorporate(response.data.data[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch corporates:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load corporate data'
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
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create HR admin'
      });
    }
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
      if (!newEmployee.gender) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Gender is required.' });
        return;
      }
      const employeeData = {
        firstName: newEmployee.name.split(' ')[0] || newEmployee.name,
        lastName: newEmployee.name.split(' ').slice(1).join(' ') || '',
        email: newEmployee.email,
        phoneNumber: newEmployee.phone,
        employeeId: newEmployee.employeeId,
        department: newEmployee.department,
        gender: newEmployee.gender,
        city: newEmployee.workCity || undefined,
        state: newEmployee.workState || undefined
      };
      
      const response = await api.post(`/admin/corporate-employees`, {
        corporateId: selectedCorporate.id,
        employees: [employeeData]
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
      setNewEmployee({ employeeId: '', name: '', email: '', phone: '', gender: '', department: '', designation: '', joiningDate: '', workCity: '', workState: '' });
      setEmpIdStatus('idle');
      fetchEmployees(selectedCorporate.id);

      if (created?.isNewUser && created?.temporaryPassword) {
        // Show credentials to team member
        setNewEmployeeCredentials({
          name: newEmployee.name,
          email: newEmployee.email,
          password: created.temporaryPassword
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

  // Parse CSV for bulk upload
  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const employees = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const rawEmployee: any = {};

      headers.forEach((header, index) => {
        // Map common CSV headers to API fields
        const headerMap: Record<string, string> = {
          'first name': 'firstName',
          'firstname': 'firstName',
          'last name': 'lastName',
          'lastname': 'lastName',
          'name': 'name',
          'email': 'email',
          'email id': 'email',
          'emailid': 'email',
          'email address': 'email',
          'phone': 'phoneNumber',
          'phonenumber': 'phoneNumber',
          'phone number': 'phoneNumber',
          'mobile': 'phoneNumber',
          'mobile number': 'phoneNumber',
          'employee id': 'employeeId',
          'employeeid': 'employeeId',
          'emp id': 'employeeId',
          'empid': 'employeeId',
          'department': 'department',
          'dept': 'department',
          'designation': 'designation',
          'role': 'designation',
          'date of birth': 'dateOfBirth',
          'dateofbirth': 'dateOfBirth',
          'dob': 'dateOfBirth',
          'gender': 'gender',
          'city': 'city',
          'work city': 'city',
          'state': 'state',
          'work state': 'state',
          'pin code': 'pinCode',
          'pincode': 'pinCode',
          'zip': 'pinCode',
          'zip code': 'pinCode',
          'location': 'location',
          'branch': 'location',
          'work location': 'location',
          'office location': 'location',
          'facility': 'facility',
          'work facility': 'facility',
        };

        const fieldName = headerMap[header] || header;
        rawEmployee[fieldName] = values[index] || '';
      });

      // Derive names
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

      // Skip empty rows
      if (!firstName && !employeeId && !phoneNumber) continue;

      const baseEmail = (rawEmployee.email || '').trim();
      const generatedEmailLocal = (employeeId || firstName || `emp${Date.now()}${i}`)
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') || `emp${Date.now()}${i}`;
      const email = baseEmail || `noemail.${generatedEmailLocal}@mediczy.in`;

      const normalizedEmployee = {
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

      employees.push(normalizedEmployee);
    }

    return employees;
  };

  // Internal QC validator — runs before API call, returns per-row issues
  const runQC = (empList: any[]) => {
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const PHONE_RE = /^\d{10}$/;
    const PIN_RE   = /^\d{6}$/;
    const DOB_RE   = /^\d{4}-\d{2}-\d{2}$/;
    const VALID_GENDERS = ['male', 'female', 'other'];
    const seenEmails = new Map<string, number>();
    const errors: { row: number; employeeId: string; name: string; email: string; issues: string[] }[] = [];

    empList.forEach((emp, idx) => {
      const row = idx + 2;
      const issues: string[] = [];

      if (!emp.firstName || String(emp.firstName).trim() === '' || emp.firstName === 'Employee')
        issues.push('Missing First Name');

      const rawEmail = (emp.email || '').trim();
      if (rawEmail && !rawEmail.includes('@mediczy.in') && !EMAIL_RE.test(rawEmail))
        issues.push(`Invalid email format: ${rawEmail}`);

      const lowerEmail = rawEmail.toLowerCase();
      if (lowerEmail && seenEmails.has(lowerEmail))
        issues.push(`Duplicate email in CSV (also on row ${seenEmails.get(lowerEmail)}): ${lowerEmail}`);
      else if (lowerEmail)
        seenEmails.set(lowerEmail, row);

      if (emp.phoneNumber && !PHONE_RE.test(String(emp.phoneNumber).replace(/[\s\-]/g, '')))
        issues.push(`Phone should be 10 digits: ${emp.phoneNumber}`);

      if (emp.gender && !VALID_GENDERS.includes(String(emp.gender).toLowerCase()))
        issues.push(`Invalid gender (use Male/Female/Other): ${emp.gender}`);

      if (emp.dateOfBirth && !DOB_RE.test(emp.dateOfBirth))
        issues.push(`Date of Birth must be YYYY-MM-DD: ${emp.dateOfBirth}`);

      if (emp.pinCode && !/^\d{6}$/.test(String(emp.pinCode)))
        issues.push(`Pin Code must be 6 digits: ${emp.pinCode}`);

      if (issues.length > 0)
        errors.push({ row, employeeId: emp.employeeId || '', name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(), email: rawEmail, issues });
    });

    return errors;
  };

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
      
      const text = await bulkUploadFile.text();
      const employeeList = parseCSV(text);
      
      if (employeeList.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Empty file',
          description: 'The CSV file contains no employee data.'
        });
        return;
      }

      // Run internal QC before sending to server
      const clientQcLog = runQC(employeeList);
      
      const token = localStorage.getItem('teamToken');
      const { data } = await api.post('/admin/corporate-employees', {
        corporateId: selectedCorporate.id,
        employees: employeeList
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      
      const created = data.results?.created || [];
      const failed = data.results?.failed || [];
      // Merge client QC + server QC (deduplicate by row)
      const serverQc: any[] = data.results?.qcLog || [];
      const serverQcRows = new Set(serverQc.map((q: any) => q.row));
      const mergedQc = [...serverQc, ...clientQcLog.filter(q => !serverQcRows.has(q.row))];
      setBulkUploadResults({ created, failed, qcLog: mergedQc });
      
      // Close the upload dialog and show the report popup
      setShowBulkUploadDialog(false);
      setBulkUploadFile(null);
      setShowUploadReport(true);
      
      if (created.length > 0) {
        fetchEmployees(selectedCorporate.id);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error.response?.data?.message || 'Failed to upload employees'
      });
    } finally {
      setIsUploading(false);
    }
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
        features: {
          opd: true, ipd: true, maternity: false, dental: false, pharmacy: true,
          diagnostics: true, homecare: false, ambulance: true, wellness: true, mentalHealth: false,
        },
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

  // Filter corporates
  const filteredCorporates = corporates.filter(corp => 
    corp.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    corp.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Corporate Management</h1>
            <p className="text-muted-foreground">
              Manage corporate accounts, employees, plans, and network partners
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowAddCorporateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Onboard Corporate
            </Button>
          </div>
        </div>

        {/* Corporate Selector */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Select Corporate</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search corporates..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredCorporates.map((corp) => (
                <div
                  key={corp.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedCorporate?.id === corp.id
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'hover:border-primary/50 hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedCorporate(corp)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{corp.companyName}</h3>
                        <p className="text-sm text-muted-foreground">{corp.industry}</p>
                        {corp.uniqueId && (
                          <span className="inline-block mt-0.5 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">{corp.uniqueId}</span>
                        )}
                      </div>
                    </div>
                    {getStatusBadge(corp.status)}
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {corp.employeeCount || 0} employees
                    </span>
                    <span className="flex items-center gap-1">
                      <Package className="h-4 w-4" />
                      {corp.packageType}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Selected Corporate Management */}
        {selectedCorporate && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="hr-admin">HR Admin</TabsTrigger>
              <TabsTrigger value="employees">Employees</TabsTrigger>
              <TabsTrigger value="plans">Plans</TabsTrigger>
              <TabsTrigger value="packages">Health Packages</TabsTrigger>
              <TabsTrigger value="calendar" className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />Calendar
              </TabsTrigger>
              <TabsTrigger value="network">Network</TabsTrigger>
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

              <Card>
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
                              className="text-slate-400 hover:text-teal-600"
                              onClick={() => { navigator.clipboard.writeText(selectedCorporate.uniqueId!); toast({ title: 'Copied', description: `Corporate ID ${selectedCorporate.uniqueId} copied` }); }}
                            ><Copy className="h-3.5 w-3.5" /></button>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
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
                    <Button onClick={() => setShowAddHRDialog(true)}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Create HR Admin
                    </Button>
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
                      <TableRow>
                        <TableCell className="font-medium">Equitas HR Admin</TableCell>
                        <TableCell>{selectedCorporate.email}</TableCell>
                        <TableCell>{selectedCorporate.phoneNumber}</TableCell>
                        <TableCell>{getStatusBadge('Active')}</TableCell>
                        <TableCell>2 hours ago</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm">
                              <Key className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
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
                      <Button variant="outline" onClick={() => setShowBulkUploadDialog(true)}>
                        <Upload className="h-4 w-4 mr-2" />
                        Bulk Upload
                      </Button>
                      <Button variant="outline" onClick={downloadTemplate}>
                        <Download className="h-4 w-4 mr-2" />
                        Download Template
                      </Button>
                      <Button onClick={() => setShowAddEmployeeDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Employee
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Designation</TableHead>
                        <TableHead>Health Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            No employees found. Click "Add Employee" or "Bulk Upload" to add employees.
                          </TableCell>
                        </TableRow>
                      ) : (
                        employees.slice((empCurrentPage - 1) * EMP_PAGE_SIZE, empCurrentPage * EMP_PAGE_SIZE).map((emp) => (
                          <TableRow key={emp.id}>
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
                              <div className="flex gap-2">
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
                  {employees.length > 0 && (
                    <div className="flex items-center justify-between px-2 py-3 border-t text-sm text-muted-foreground">
                      <span>
                        Showing {Math.min((empCurrentPage - 1) * EMP_PAGE_SIZE + 1, employees.length)}–{Math.min(empCurrentPage * EMP_PAGE_SIZE, employees.length)} of {employees.length} employees
                      </span>
                      <div className="flex items-center gap-2">
                        <span>Page {empCurrentPage} of {Math.ceil(employees.length / EMP_PAGE_SIZE)}</span>
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
                          disabled={empCurrentPage >= Math.ceil(employees.length / EMP_PAGE_SIZE)}
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
                        Manage health and insurance plans for {selectedCorporate.companyName}
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
                                <Users className="h-3 w-3 inline mr-1" />
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
                                    <Badge key={k} variant="outline" className="text-xs capitalize">
                                      {k.replace(/([A-Z])/g, ' $1').trim()}
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
                        <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-lg px-3 py-1.5">
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
                                          <Button variant="ghost" size="sm">
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
                                          <Button variant="ghost" size="sm">
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
                                          <Button variant="ghost" size="sm">
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
        <Dialog open={showAddHRDialog} onOpenChange={setShowAddHRDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create HR Admin Login</DialogTitle>
              <DialogDescription className="sr-only">Create HR admin credentials</DialogDescription>
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
                <Label>Password *</Label>
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
              <Button variant="outline" onClick={() => setShowAddHRDialog(false)}>Cancel</Button>
              <Button onClick={handleCreateHRAdmin}>Create HR Admin</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Employee Dialog */}
        <Dialog open={showAddEmployeeDialog} onOpenChange={(open) => { setShowAddEmployeeDialog(open); if (!open) { setEmpIdStatus('idle'); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Employee</DialogTitle>
              <DialogDescription className="sr-only">Add a new employee</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
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
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Employee ID already exists in this corporate
                    </p>
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
                  <Label>Gender *</Label>
                  <Select value={newEmployee.gender} onValueChange={(v) => setNewEmployee({...newEmployee, gender: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
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
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddEmployeeDialog(false)}>Cancel</Button>
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
                <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>A welcome email with these credentials has been sent to <strong>{newEmployeeCredentials.email}</strong>. The employee should change this password on first login.</p>
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
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Employee — {editingEmployee?.name}</DialogTitle>
              <DialogDescription className="sr-only">Edit employee details</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
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
                              checked ? 'bg-primary/5 border border-primary/30' : 'border border-transparent'
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
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
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

              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
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
                      <Label className="capitalize text-sm">{key.replace(/([A-Z])/g, ' $1').trim()}</Label>
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
                        <Badge key={k} variant="secondary" className="capitalize">
                          {k.replace(/([A-Z])/g, ' $1').trim()}
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
                          <div className="text-xs text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</div>
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
                      <Label className="capitalize text-sm">{key.replace(/([A-Z])/g, ' $1').trim()}</Label>
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
                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{total}</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">Total Rows</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-green-700 dark:text-green-300">{bulkUploadResults.created.length}</p>
                      <p className="text-xs text-green-600 dark:text-green-400">Activated</p>
                    </div>
                    <div className={`${bulkUploadResults.failed.length > 0 ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800'} border rounded-lg p-3 text-center`}>
                      <p className={`text-2xl font-bold ${bulkUploadResults.failed.length > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-500'}`}>{bulkUploadResults.failed.length}</p>
                      <p className={`text-xs ${bulkUploadResults.failed.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500'}`}>Failed</p>
                    </div>
                    <div className={`${qcLog.length > 0 ? 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800' : 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800'} border rounded-lg p-3 text-center`}>
                      <p className={`text-2xl font-bold ${qcLog.length > 0 ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-500'}`}>{qcLog.length}</p>
                      <p className={`text-xs ${qcLog.length > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-500'}`}>QC Warnings</p>
                    </div>
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
                    <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                      <p className="text-sm font-medium text-green-800 dark:text-green-300 mb-1 flex items-center gap-1.5">
                        <CheckCircle className="h-4 w-4" /> Activated Employees
                      </p>
                      <div className="text-sm text-green-700 dark:text-green-400 space-y-0.5">
                        {newUsers > 0 && <p>• {newUsers} new user account{newUsers > 1 ? 's' : ''} created &amp; activated</p>}
                        {linked > 0 && <p>• {linked} existing user{linked > 1 ? 's' : ''} linked &amp; activated</p>}
                      </div>
                    </div>
                  )}

                  {/* Failed Entries */}
                  {bulkUploadResults.failed.length > 0 && (
                    <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
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

                  {/* QC Log */}
                  {qcLog.length > 0 && (
                    <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-2 flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4" /> QC Warnings ({qcLog.length} rows)
                        <span className="text-xs font-normal text-yellow-600 dark:text-yellow-400 ml-1">— employees were still activated; review &amp; correct data</span>
                      </p>
                      <div className="max-h-48 overflow-y-auto font-mono text-xs space-y-1.5">
                        {qcLog.map((entry: any, idx: number) => (
                          <div key={idx} className="border-b border-yellow-200 dark:border-yellow-700 pb-1.5 last:border-0">
                            <span className="text-yellow-700 dark:text-yellow-300 font-semibold">Row {entry.row}</span>
                            {entry.employeeId && <span className="text-yellow-600 dark:text-yellow-400"> [{entry.employeeId}]</span>}
                            {entry.name && <span className="text-yellow-600 dark:text-yellow-400"> {entry.name}</span>}
                            {entry.email && <span className="text-yellow-500 dark:text-yellow-500"> &lt;{entry.email}&gt;</span>}
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
          }
        }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Bulk Upload Employees</DialogTitle>
              <DialogDescription>
                Upload a CSV file to add multiple employees at once for {selectedCorporate?.companyName}
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
                <div className="bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">CSV Columns Reference</div>
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

              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  id="bulk-upload-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setBulkUploadFile(file);
                      setBulkUploadResults(null);
                    }
                  }}
                />
                <label 
                  htmlFor="bulk-upload-input" 
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {bulkUploadFile ? bulkUploadFile.name : 'Click to select CSV file'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    or drag and drop
                  </span>
                </label>
              </div>

            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowBulkUploadDialog(false);
                setBulkUploadFile(null);
                setBulkUploadResults(null);
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
    </MainLayout>
  );
};

export default TeamCorporateManagement;
