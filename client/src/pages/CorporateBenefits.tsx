import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import CorporateLayout from "@/components/corporate/CorporateLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import CorporatePageHeader from "@/components/corporate/CorporatePageHeader";
import { 
  Building2,
  Shield,
  CheckCircle,
  Calendar,
  CalendarCheck,
  Stethoscope,
  Heart,
  Activity,
  TestTube,
  Baby,
  Pill,
  Ambulance,
  Home,
  Brain,
  Sparkles,
  Clock,
  MapPin,
  Phone,
  Mail,
  FileText,
  Download,
  Eye,
  Plus,
  Search,
  User,
  IndianRupee,
  AlertCircle,
  Gift,
  Video,
  Percent,
  Dumbbell,
  Users,
  XCircle,
  Trash2,
  ArrowUpCircle
} from "lucide-react";
import api from "@/utils/api";
import { useAuth } from "@/auth/AuthProvider";

interface CorporatePlan {
  id: string;
  planName: string;
  corporateName: string;
  validFrom: string;
  validTo: string;
  planType: 'Standard' | 'Premium' | 'Elite';
  benefits: {
    category: string;
    description: string;
    coverage: string;
    limit?: string;
    benefitCategory: 'insurance' | 'wellness';
  }[];
  features: {
    opdCoverage: boolean;
    ipdCoverage: boolean;
    maternityCoverage: boolean;
    dentalCoverage: boolean;
    pharmacyCoverage: boolean;
    diagnosticsCoverage: boolean;
    homecareCoverage: boolean;
    ambulanceCoverage: boolean;
    wellnessCoverage: boolean;
    mentalHealthCoverage: boolean;
  };
  // Platform/perk access (Health Calendar, webinars, discounts) -- distinct
  // from medical coverage above. Team-configured per corporate; previously
  // saved but never read back anywhere in the product.
  platformFeatures?: {
    healthCalendar: boolean;
    webinars: boolean;
    labDiscount: boolean;
    pharmacyDiscount: boolean;
    discountCoupons: boolean;
    gymMembership: boolean;
    wellnessMembership: boolean;
    wellnessPackageDiscounts: boolean;
  };
  coverage: {
    sumInsured: number;
    roomRent: string | null;
    icuRent: string | null;
    preHospitalization: string | null;
    postHospitalization: string | null;
  };
}

interface PlanUsage {
  opdUsed: number;
  opdLimit: number;
  diagnosticsUsed: number;
  diagnosticsLimit: number;
  amountUsed: number;
  amountLimit: number;
}

// Real checkup data (from GET /corporate/health-checkups) reflects an actual
// plan benefit; those fields stay optional rather than fabricated when
// absent. Real per-package test lists/pricing do exist (Team-configured,
// see HealthPackage below via GET /corporate/health-packages) -- they just
// aren't part of this single-benefit lookup.
interface HealthCheckup {
  id: string;
  name: string;
  description: string;
  limit?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  tests?: string[];
  duration?: string;
  fasting?: boolean;
  price?: number;
  discountedPrice?: number;
  category?: 'Basic' | 'Comprehensive' | 'Advanced' | 'Specialized';
  ageGroup?: string;
  gender?: 'Male' | 'Female' | 'All';
}

// Team-configured checkup packages (GET /corporate/health-packages, HR
// read-only view of user_health_packages). Distinct from HealthCheckup
// above, which reflects a single generic plan benefit line, not a
// real per-package test list.
interface HealthPackage {
  id: string;
  name: string;
  type: 'pre_employment' | 'annual' | 'other';
  tests: string[];
  price: number | null;
  description: string | null;
  employeeCount: number;
  validFrom: string | null;
  validTo: string | null;
}

interface BookingDetails {
  checkupId: string;
  preferredDate: string;
  preferredTime: string;
  location: string;
  hospital: string;
  specialInstructions?: string;
}

interface MyAppointment {
  id: string;
  appointmentId: string;
  checkupName: string;
  appointmentType: string;
  date: string;
  time: string;
  hospital: string;
  location: string;
  doctor?: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  bookedOn: string;
  claimAmount: number;
}

interface WalletTierOption {
  key: string;
  label: string;
  allocatedLimit: number;
  isDefault?: boolean;
}

interface BenefitWallet {
  id: number;
  programId: number;
  programName: string;
  description?: string | null;
  category: string;
  allocatedLimit: number;
  utilizedAmount: number;
  reservedAmount: number;
  remainingAmount: number;
  coveragePeriodStart?: string | null;
  coveragePeriodEnd?: string | null;
  status: string;
  tierKey?: string | null;
  tierOptions?: WalletTierOption[];
}

interface EmployeeBenefitWalletPayload {
  isCorporateEmployee: boolean;
  corporate?: {
    id: number;
    name?: string;
    employeeId?: string;
  } | null;
  wallets: BenefitWallet[];
}

interface HrBenefitWalletSummary {
  programCount: number;
  activePrograms: number;
  totalBudget: number;
  activeWallets: number;
  allocatedAmount: number;
  utilizedAmount: number;
  reservedAmount: number;
  remainingAmount: number;
  openAuthorizations: number;
  categoryBreakdown: Array<{
    category: string;
    allocated: number;
    utilized: number;
    reserved: number;
    remaining: number;
    walletCount: number;
  }>;
}

interface BenefitProgram {
  id: number;
  name: string;
  description?: string | null;
  category: string;
  fundingType: string;
  annualBudget: number;
  perEmployeeLimit: number;
  familyCoverage: boolean;
  maxDependents: number;
  startDate?: string | null;
  endDate?: string | null;
  status: string;
  walletCount: number;
  allocated: number;
  utilized: number;
  reserved: number;
  remaining: number;
  tierOptions?: WalletTierOption[];
}

interface BenefitAuthorization {
  id: number;
  authorizationCode: string;
  category: string;
  requestedAmount: number;
  approvedAmount?: number | null;
  settlementAmount?: number | null;
  providerType?: string | null;
  providerName?: string | null;
  serviceType?: string | null;
  status: 'submitted' | 'approved' | 'declined' | 'cancelled' | 'settled' | 'expired';
  validFrom?: string | null;
  validTo?: string | null;
  settledAt?: string | null;
  cancelledAt?: string | null;
  createdAt?: string | null;
  employeeId?: string | null;
  employeeName?: string | null;
  walletAllocated: number;
  walletUtilized: number;
  walletReserved: number;
  walletRemaining: number;
}

const BENEFIT_CATEGORY_OPTIONS = [
  { value: 'opd', label: 'OPD' },
  { value: 'diagnostics', label: 'Diagnostics' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'dental', label: 'Dental' },
  { value: 'vision', label: 'Vision' },
  { value: 'health_checkup', label: 'Health Checkup' },
  { value: 'mental_wellness', label: 'Mental Wellness' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'vaccination', label: 'Vaccination' },
  { value: 'other', label: 'Other' },
];

const AUTH_STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'settled', label: 'Settled' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'declined', label: 'Declined' },
  { value: 'expired', label: 'Expired' },
];

const AUTH_STATUS_BADGE_CLASSES: Record<string, string> = {
  submitted: 'bg-amber-500/15 text-amber-300 border border-amber-500/25',
  approved: 'bg-blue-500/15 text-blue-300 border border-blue-500/25',
  settled: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
  cancelled: 'bg-slate-500/15 text-slate-400 border border-slate-600',
  declined: 'bg-red-500/15 text-red-300 border border-red-500/25',
  expired: 'bg-orange-500/15 text-orange-300 border border-orange-500/25',
};

const CorporateBenefits = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('benefits');
  const [loading, setLoading] = useState(true);
  const [corporatePlan, setCorporatePlan] = useState<CorporatePlan | null>(null);
  const [viewMode, setViewMode] = useState<'company' | 'personal'>('personal');
  const [healthCheckups, setHealthCheckups] = useState<HealthCheckup[]>([]);
  const [healthPackages, setHealthPackages] = useState<HealthPackage[]>([]);
  const [myAppointments, setMyAppointments] = useState<MyAppointment[]>([]);
  const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null);
  const [employeeWallet, setEmployeeWallet] = useState<EmployeeBenefitWalletPayload | null>(null);
  const [hrWalletSummary, setHrWalletSummary] = useState<HrBenefitWalletSummary | null>(null);
  const [benefitPrograms, setBenefitPrograms] = useState<BenefitProgram[]>([]);
  const [createProgramDialog, setCreateProgramDialog] = useState(false);
  const [enrollDialog, setEnrollDialog] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<BenefitProgram | null>(null);
  const [walletActionLoading, setWalletActionLoading] = useState(false);
  const [tierSwitchingWalletId, setTierSwitchingWalletId] = useState<number | null>(null);
  const [programForm, setProgramForm] = useState({
    name: '',
    category: 'opd',
    fundingType: 'employer_funded',
    annualBudget: '',
    perEmployeeLimit: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    familyCoverage: 'false',
    maxDependents: '0',
    description: '',
  });
  const [enrollForm, setEnrollForm] = useState({
    employeeIdsText: '',
    allocatedLimit: '',
  });
  const [offerTiers, setOfferTiers] = useState(false);
  const [extraTiers, setExtraTiers] = useState<Array<{ key: string; label: string; allocatedLimit: string }>>([
    { key: 'tier1', label: 'Tier 1', allocatedLimit: '' },
  ]);
  const [authorizations, setAuthorizations] = useState<BenefitAuthorization[]>([]);
  const [authStatusFilter, setAuthStatusFilter] = useState('all');
  const [authLoading, setAuthLoading] = useState(false);
  const [authActionLoading, setAuthActionLoading] = useState(false);
  const [settleDialog, setSettleDialog] = useState(false);
  const [selectedAuthorization, setSelectedAuthorization] = useState<BenefitAuthorization | null>(null);
  const [settleForm, setSettleForm] = useState({
    settlementAmount: '',
    invoiceNumber: '',
    notes: '',
  });
  const [selectedCheckup, setSelectedCheckup] = useState<HealthCheckup | null>(null);
  const [bookingDialog, setBookingDialog] = useState(false);
  const [bookingDetails, setBookingDetails] = useState<BookingDetails>({
    checkupId: '',
    preferredDate: '',
    preferredTime: '',
    location: '',
    hospital: '',
    specialInstructions: ''
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    fetchData();
  }, []);

  const formatINR = (amount?: number | null) => {
    const value = Number(amount || 0);
    return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  const labelForCategory = (category: string) =>
    String(category || 'other')
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

  const formatDateTime = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const fetchAuthorizations = async (statusFilter = authStatusFilter) => {
    try {
      setAuthLoading(true);
      const query = statusFilter && statusFilter !== 'all'
        ? `?status=${encodeURIComponent(statusFilter)}&limit=50`
        : '?limit=50';
      // HR-only endpoint; 403s harmlessly for employee-only sessions.
      const res = await api.get(`/corporate/benefit-wallet/authorizations${query}`).catch(() => ({ data: null }));
      const payload = res?.data?.data?.authorizations;
      return Array.isArray(payload) ? (payload as BenefitAuthorization[]) : [];
    } catch (err) {
      console.error('Failed to load benefit authorizations', err);
      return [] as BenefitAuthorization[];
    } finally {
      setAuthLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [planRes, checkupsRes, appointmentsRes, packagesRes, employeeWalletRes, hrWalletRes, programsRes, authorizationsPayload] = await Promise.all([
        api.get('/corporate/my-benefits').catch(() => ({ data: null })),
        api.get('/corporate/health-checkups').catch(() => ({ data: null })),
        api.get('/corporate/my-appointments').catch(() => ({ data: null })),
        // HR-only (authCorporate) -- 403s harmlessly for an employee session.
        api.get('/corporate/health-packages').catch(() => ({ data: null })),
        // Employee-only wallet; safe to ignore for pure HR/corporate sessions.
        api.get('/corporate/my-benefit-wallet').catch(() => ({ data: null })),
        // HR-only wallet summary; safe to ignore for employee sessions.
        api.get('/corporate/benefit-wallet/summary').catch(() => ({ data: null })),
        // HR-only program controls; safe to ignore for employee sessions.
        api.get('/corporate/benefit-wallet/programs').catch(() => ({ data: null })),
        // HR-only cashless authorizations; respects the active status filter.
        fetchAuthorizations()
      ]);

      const planPayload = planRes?.data?.plan || planRes?.data?.data?.plan || null;
      const usagePayload = planRes?.data?.usage || planRes?.data?.data?.usage || null;
      setCorporatePlan(planPayload);
      setPlanUsage(usagePayload);
      setViewMode(planRes?.data?.data?.viewMode === 'company' ? 'company' : 'personal');

      const checkupsPayload = checkupsRes?.data?.checkups || checkupsRes?.data?.data?.checkups;
      setHealthCheckups(Array.isArray(checkupsPayload) ? checkupsPayload : []);

      const appointmentsPayload = appointmentsRes?.data?.appointments || appointmentsRes?.data?.data?.appointments;
      setMyAppointments(appointmentsPayload || []);

      const packagesPayload = packagesRes?.data?.data?.packages;
      setHealthPackages(Array.isArray(packagesPayload) ? packagesPayload : []);

      const employeeWalletPayload = employeeWalletRes?.data?.data || null;
      setEmployeeWallet(employeeWalletPayload?.isCorporateEmployee ? employeeWalletPayload : null);

      const hrSummaryPayload = hrWalletRes?.data?.data || null;
      setHrWalletSummary(hrSummaryPayload?.programCount !== undefined ? hrSummaryPayload : null);

      const programsPayload = programsRes?.data?.data?.programs;
      setBenefitPrograms(Array.isArray(programsPayload) ? programsPayload : []);

      setAuthorizations(Array.isArray(authorizationsPayload) ? authorizationsPayload : []);
    } catch (err) {
      console.error('Failed to load data', err);
      setCorporatePlan(null);
      setHealthCheckups([]);
      setMyAppointments([]);
      setHealthPackages([]);
      setEmployeeWallet(null);
      setHrWalletSummary(null);
      setBenefitPrograms([]);
      setAuthorizations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Re-run only on filter changes; initial load is covered by fetchData().
    if (loading) return;
    fetchAuthorizations(authStatusFilter).then(setAuthorizations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatusFilter]);

  const resetProgramForm = () => {
    setProgramForm({
      name: '',
      category: 'opd',
      fundingType: 'employer_funded',
      annualBudget: '',
      perEmployeeLimit: '',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: '',
      familyCoverage: 'false',
      maxDependents: '0',
      description: '',
    });
    setOfferTiers(false);
    setExtraTiers([{ key: 'tier1', label: 'Tier 1', allocatedLimit: '' }]);
  };

  const addExtraTier = () => setExtraTiers((prev) => [...prev, { key: `tier${prev.length + 1}`, label: `Tier ${prev.length + 1}`, allocatedLimit: '' }]);
  const removeExtraTier = (key: string) => setExtraTiers((prev) => prev.filter((t) => t.key !== key));
  const updateExtraTier = (key: string, patch: Partial<{ label: string; allocatedLimit: string }>) =>
    setExtraTiers((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  const handleCreateBenefitProgram = async () => {
    if (offerTiers && extraTiers.some((t) => !t.allocatedLimit)) {
      alert('Every optional tier needs an amount.');
      return;
    }
    try {
      setWalletActionLoading(true);
      const tierOptions = offerTiers
        ? [
            { key: 'base', label: 'Base', allocatedLimit: Number(programForm.perEmployeeLimit || 0), isDefault: true },
            ...extraTiers.map((t) => ({ key: t.key, label: t.label, allocatedLimit: Number(t.allocatedLimit) })),
          ]
        : undefined;
      await api.post('/corporate/benefit-wallet/programs', {
        name: programForm.name,
        category: programForm.category,
        fundingType: programForm.fundingType,
        annualBudget: Number(programForm.annualBudget || 0),
        perEmployeeLimit: Number(programForm.perEmployeeLimit || 0),
        startDate: programForm.startDate || undefined,
        endDate: programForm.endDate || undefined,
        familyCoverage: programForm.familyCoverage === 'true',
        maxDependents: Number(programForm.maxDependents || 0),
        description: programForm.description,
        tierOptions,
      });
      alert('Benefit program created successfully.');
      setCreateProgramDialog(false);
      resetProgramForm();
      await fetchData();
    } catch (err: any) {
      console.error('Create benefit program failed', err);
      alert(err?.response?.data?.message || 'Failed to create benefit program.');
    } finally {
      setWalletActionLoading(false);
    }
  };

  const openEnrollDialog = (program: BenefitProgram) => {
    setSelectedProgram(program);
    setEnrollForm({
      employeeIdsText: '',
      allocatedLimit: String(program.perEmployeeLimit || ''),
    });
    setEnrollDialog(true);
  };

  const handleEnrollEmployees = async () => {
    if (!selectedProgram) return;
    try {
      setWalletActionLoading(true);
      const employeeIds = enrollForm.employeeIdsText
        .split(/[,\n]/)
        .map((id) => id.trim())
        .filter(Boolean);

      await api.post(`/corporate/benefit-wallet/programs/${selectedProgram.id}/enroll`, {
        ...(employeeIds.length ? { employeeIds } : {}),
        allocatedLimit: Number(enrollForm.allocatedLimit || selectedProgram.perEmployeeLimit || 0),
      });
      alert(employeeIds.length ? 'Selected employees enrolled successfully.' : 'All active employees enrolled successfully.');
      setEnrollDialog(false);
      setSelectedProgram(null);
      await fetchData();
    } catch (err: any) {
      console.error('Enroll employees failed', err);
      alert(err?.response?.data?.message || 'Failed to enroll employees.');
    } finally {
      setWalletActionLoading(false);
    }
  };

  const handleSelectTier = async (walletId: number, tierKey: string) => {
    try {
      setTierSwitchingWalletId(walletId);
      const { data } = await api.post(`/corporate/my-benefit-wallet/${walletId}/select-tier`, { tierKey });
      const updated = (data as any)?.data?.wallet;
      setEmployeeWallet((prev) => prev ? {
        ...prev,
        wallets: prev.wallets.map((w) => w.id === walletId
          ? { ...w, tierKey: updated?.tierKey ?? tierKey, allocatedLimit: updated?.allocatedLimit ?? w.allocatedLimit }
          : w),
      } : prev);
    } catch (err: any) {
      console.error('Select tier failed', err);
      alert(err?.response?.data?.message || 'Failed to switch tier.');
    } finally {
      setTierSwitchingWalletId(null);
    }
  };

  const openSettleDialog = (authorization: BenefitAuthorization) => {
    setSelectedAuthorization(authorization);
    setSettleForm({
      settlementAmount: String(authorization.approvedAmount ?? authorization.requestedAmount ?? ''),
      invoiceNumber: '',
      notes: '',
    });
    setSettleDialog(true);
  };

  const handleSettleAuthorization = async () => {
    if (!selectedAuthorization) return;
    try {
      setAuthActionLoading(true);
      await api.post(`/corporate/benefit-wallet/authorizations/${selectedAuthorization.id}/settle`, {
        settlementAmount: Number(settleForm.settlementAmount || 0),
        invoiceNumber: settleForm.invoiceNumber || undefined,
        notes: settleForm.notes || undefined,
      });
      alert('Authorization settled. Reserved balance has been converted into utilized spend.');
      setSettleDialog(false);
      setSelectedAuthorization(null);
      await fetchData();
    } catch (err: any) {
      console.error('Settle authorization failed', err);
      alert(err?.response?.data?.message || 'Failed to settle authorization.');
    } finally {
      setAuthActionLoading(false);
    }
  };

  const handleCancelAuthorization = async (authorization: BenefitAuthorization) => {
    const confirmed = window.confirm(
      `Cancel authorization ${authorization.authorizationCode}? The reserved amount will be released back to the employee wallet.`
    );
    if (!confirmed) return;
    try {
      setAuthActionLoading(true);
      await api.post(`/corporate/benefit-wallet/authorizations/${authorization.id}/cancel`, {});
      alert('Authorization cancelled and reserved amount released.');
      await fetchData();
    } catch (err: any) {
      console.error('Cancel authorization failed', err);
      alert(err?.response?.data?.message || 'Failed to cancel authorization.');
    } finally {
      setAuthActionLoading(false);
    }
  };

  const handleBookCheckup = (checkup: HealthCheckup) => {
    setSelectedCheckup(checkup);
    setBookingDetails({
      ...bookingDetails,
      checkupId: checkup.id
    });
    setBookingDialog(true);
  };

  const handleSubmitBooking = async () => {
    try {
      if (!selectedCheckup) return;

      const bookingLocation = bookingDetails.location || bookingDetails.hospital;
      const bookingData = {
        ...bookingDetails,
        location: bookingLocation,
        checkupName: selectedCheckup.name,
        checkupPrice: selectedCheckup.discountedPrice || selectedCheckup.price,
        userId: currentUser?.id
      };

      await api.post('/corporate/book-checkup', bookingData);

      alert('Health checkup booked successfully! You will receive confirmation via email.');
      setBookingDialog(false);
      fetchData();
    } catch (err) {
      console.error('Booking failed', err);
      alert('Failed to book appointment. Please try again.');
    }
  };

  const filteredCheckups = healthCheckups.filter(checkup => {
    const matchesSearch = searchQuery === '' ||
      checkup.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      checkup.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (checkup.tests || []).some(test => test.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = categoryFilter === 'all' || !checkup.category || checkup.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const getFeatureIcon = (feature: string) => {
    const icons: Record<string, any> = {
      opdCoverage: Stethoscope,
      ipdCoverage: Heart,
      maternityCoverage: Baby,
      dentalCoverage: Sparkles,
      pharmacyCoverage: Pill,
      diagnosticsCoverage: TestTube,
      homecareCoverage: Home,
      ambulanceCoverage: Ambulance,
      wellnessCoverage: Activity,
      mentalHealthCoverage: Brain
    };
    return icons[feature] || CheckCircle;
  };

  const getFeatureLabel = (feature: string) => {
    const labels: Record<string, string> = {
      opdCoverage: 'OPD Coverage',
      ipdCoverage: 'IPD Coverage',
      maternityCoverage: 'Maternity Coverage',
      dentalCoverage: 'Dental Coverage',
      pharmacyCoverage: 'Pharmacy Coverage',
      diagnosticsCoverage: 'Diagnostics Coverage',
      homecareCoverage: 'Homecare Coverage',
      ambulanceCoverage: 'Ambulance Coverage',
      wellnessCoverage: 'Wellness Coverage',
      mentalHealthCoverage: 'Mental Health Coverage'
    };
    return labels[feature] || feature;
  };

  const getPlatformFeatureIcon = (feature: string) => {
    const icons: Record<string, any> = {
      healthCalendar: CalendarCheck,
      webinars: Video,
      labDiscount: Percent,
      pharmacyDiscount: Percent,
      discountCoupons: Gift,
      gymMembership: Dumbbell,
      wellnessMembership: Users,
      wellnessPackageDiscounts: Percent,
    };
    return icons[feature] || CheckCircle;
  };

  const getPlatformFeatureLabel = (feature: string) => {
    const labels: Record<string, string> = {
      healthCalendar: 'Health Calendar',
      webinars: 'Webinars',
      labDiscount: 'Lab Discount',
      pharmacyDiscount: 'Pharmacy Discount',
      discountCoupons: 'Discount Coupons',
      gymMembership: 'Gym Membership',
      wellnessMembership: 'Wellness Membership',
      wellnessPackageDiscounts: 'Wellness Package Discounts',
    };
    return labels[feature] || feature;
  };

  if (loading) {
    return (
      <CorporateLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-t-blue-600 border-gray-300 rounded-full animate-spin mx-auto"></div>
            <p className="mt-4 text-slate-400">Loading your benefits...</p>
          </div>
        </div>
      </CorporateLayout>
    );
  }

  return (
    <CorporateLayout>
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
          <CorporatePageHeader
            icon={Gift}
            title="Corporate Benefits"
            description="View your benefits, book health checkups, and manage appointments"
            gradient="from-emerald-600 to-emerald-800"
            badge={corporatePlan ? { text: corporatePlan.corporateName, variant: "emerald" } : undefined}
            stats={corporatePlan ? [
              { label: 'Plan Type', value: corporatePlan.planType },
              { label: 'Sum Insured', value: corporatePlan.coverage.sumInsured ? `₹${corporatePlan.coverage.sumInsured.toLocaleString()}` : '—' },
              ...(planUsage ? [{ label: 'OPD Used', value: `${planUsage.opdUsed}/${planUsage.opdLimit}` }] : []),
              { label: 'Valid Till', value: corporatePlan.validTo ? new Date(corporatePlan.validTo).toLocaleDateString() : '—' },
            ] : []}
          />

          {(employeeWallet?.wallets?.length || hrWalletSummary) && (
            <div className="max-w-7xl mx-auto">
              {employeeWallet?.wallets?.length ? (
                <Card className="bg-gradient-to-br from-emerald-950/50 via-slate-900 to-slate-950 border-emerald-500/25 shadow-xl shadow-slate-950/30">
                  <CardHeader>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <CardTitle className="text-slate-100 flex items-center gap-2">
                          <IndianRupee className="w-5 h-5 text-emerald-400" />
                          Employer-Funded Health Wallet
                        </CardTitle>
                        <p className="text-sm text-slate-400 mt-1">
                          Cashless-ready corporate benefits sponsored by {employeeWallet.corporate?.name || corporatePlan?.corporateName || 'your employer'}.
                        </p>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {employeeWallet.wallets.length} active wallet{employeeWallet.wallets.length === 1 ? '' : 's'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {employeeWallet.wallets.slice(0, 6).map((wallet) => {
                        const usedPercent = wallet.allocatedLimit > 0
                          ? Math.min(100, Math.round(((wallet.utilizedAmount + wallet.reservedAmount) / wallet.allocatedLimit) * 100))
                          : 0;
                        return (
                          <div key={wallet.id} className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs uppercase tracking-wide text-emerald-300">{labelForCategory(wallet.category)}</p>
                                <h3 className="font-semibold text-slate-100 mt-1">{wallet.programName}</h3>
                              </div>
                              <Badge variant="outline" className="border-slate-600 text-slate-300">{wallet.status}</Badge>
                            </div>
                            <div className="mt-4">
                              <div className="flex items-baseline justify-between">
                                <span className="text-sm text-slate-400">Available</span>
                                <span className="text-xl font-bold text-emerald-400">{formatINR(wallet.remainingAmount)}</span>
                              </div>
                              <div className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden">
                                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400" style={{ width: `${usedPercent}%` }} />
                              </div>
                              <div className="mt-2 flex justify-between text-xs text-slate-500">
                                <span>Used {formatINR(wallet.utilizedAmount)}</span>
                                <span>Reserved {formatINR(wallet.reservedAmount)}</span>
                                <span>Total {formatINR(wallet.allocatedLimit)}</span>
                              </div>
                            </div>
                            {(wallet.tierOptions?.length || 0) > 1 && (
                              <div className="mt-3 pt-3 border-t border-slate-800">
                                <div className="flex items-center gap-1.5 text-xs text-cyan-300 mb-1.5">
                                  <ArrowUpCircle className="w-3.5 h-3.5" /> Wallet tier
                                </div>
                                <Select
                                  value={wallet.tierKey || wallet.tierOptions?.find((t) => t.isDefault)?.key || ''}
                                  onValueChange={(key) => handleSelectTier(wallet.id, key)}
                                  disabled={tierSwitchingWalletId === wallet.id}
                                >
                                  <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100 h-9 text-sm">
                                    <SelectValue placeholder="Select tier" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {wallet.tierOptions?.map((tier) => (
                                      <SelectItem key={tier.key} value={tier.key}>
                                        {tier.label} — {formatINR(tier.allocatedLimit)}{tier.isDefault ? ' (Base)' : ''}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ) : hrWalletSummary ? (
                <Card className="bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-950 border-cyan-500/25 shadow-xl shadow-slate-950/30">
                  <CardHeader>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <CardTitle className="text-slate-100 flex items-center gap-2">
                          <IndianRupee className="w-5 h-5 text-cyan-400" />
                          Corporate Benefits Wallet Command View
                        </CardTitle>
                        <p className="text-sm text-slate-400 mt-1">
                          HR-safe view of employer-funded budgets, allocation, utilization, and open authorizations.
                        </p>
                      </div>
                      <Badge className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        {hrWalletSummary.activePrograms} active program{hrWalletSummary.activePrograms === 1 ? '' : 's'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      {[
                        ['Total Budget', hrWalletSummary.totalBudget],
                        ['Allocated', hrWalletSummary.allocatedAmount],
                        ['Utilized', hrWalletSummary.utilizedAmount],
                        ['Reserved', hrWalletSummary.reservedAmount],
                        ['Remaining', hrWalletSummary.remainingAmount],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-4">
                          <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
                          <p className="text-xl font-bold text-slate-100 mt-1">{formatINR(Number(value))}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-400">
                      <Badge variant="outline" className="border-slate-600 text-slate-300">{hrWalletSummary.activeWallets} employee wallets</Badge>
                      <Badge variant="outline" className="border-slate-600 text-slate-300">{hrWalletSummary.openAuthorizations} open authorizations</Badge>
                      {hrWalletSummary.categoryBreakdown?.slice(0, 4).map((item) => (
                        <Badge key={item.category} variant="outline" className="border-slate-600 text-slate-300">
                          {labelForCategory(item.category)}: {formatINR(item.remaining)} left
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 max-w-7xl mx-auto">
            <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid bg-slate-800/60 border border-slate-700/60">
              <TabsTrigger value="benefits">
                <Shield className="w-4 h-4 mr-2" />
                My Benefits
              </TabsTrigger>
              <TabsTrigger value="checkups">
                <CalendarCheck className="w-4 h-4 mr-2" />
                Health Checkups
              </TabsTrigger>
              <TabsTrigger value="appointments">
                <Calendar className="w-4 h-4 mr-2" />
                My Appointments
              </TabsTrigger>
            </TabsList>

            {/* Benefits Tab */}
            <TabsContent value="benefits" className="space-y-6">
              {hrWalletSummary && (
                <Card className="bg-slate-900/50 border-cyan-500/25">
                  <CardHeader>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <CardTitle className="text-slate-100 flex items-center gap-2">
                          <IndianRupee className="w-5 h-5 text-cyan-400" />
                          HR Benefit Wallet Programs
                        </CardTitle>
                        <p className="text-sm text-slate-500 mt-1">
                          Create employer-funded wallets and enroll employees. Clinical data remains separate from benefit utilization.
                        </p>
                      </div>

                      <Dialog open={createProgramDialog} onOpenChange={setCreateProgramDialog}>
                        <DialogTrigger asChild>
                          <Button className="bg-cyan-600 hover:bg-cyan-700">
                            <Plus className="w-4 h-4 mr-2" />
                            Create Program
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl bg-slate-950 border-slate-700 text-slate-100">
                          <DialogHeader>
                            <DialogTitle>Create Benefit Program</DialogTitle>
                            <DialogDescription className="text-slate-400">
                              Configure a corporate-funded wallet category such as OPD, diagnostics, pharmacy, or mental wellness.
                            </DialogDescription>
                          </DialogHeader>

                          <div className="grid gap-4 py-2">
                            <div className="grid gap-2">
                              <Label htmlFor="programName" className="text-slate-300">Program name</Label>
                              <Input
                                id="programName"
                                value={programForm.name}
                                onChange={(e) => setProgramForm({ ...programForm, name: e.target.value })}
                                placeholder="Annual OPD Wallet"
                                className="bg-slate-900 border-slate-700 text-slate-100"
                              />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="grid gap-2">
                                <Label className="text-slate-300">Category</Label>
                                <Select value={programForm.category} onValueChange={(value) => setProgramForm({ ...programForm, category: value })}>
                                  <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {BENEFIT_CATEGORY_OPTIONS.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid gap-2">
                                <Label className="text-slate-300">Funding type</Label>
                                <Select value={programForm.fundingType} onValueChange={(value) => setProgramForm({ ...programForm, fundingType: value })}>
                                  <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="employer_funded">Employer funded</SelectItem>
                                    <SelectItem value="cashless">Cashless</SelectItem>
                                    <SelectItem value="reimbursement">Reimbursement</SelectItem>
                                    <SelectItem value="co_pay">Co-pay</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="grid gap-2">
                                <Label htmlFor="annualBudget" className="text-slate-300">Annual budget</Label>
                                <Input
                                  id="annualBudget"
                                  type="number"
                                  min="0"
                                  value={programForm.annualBudget}
                                  onChange={(e) => setProgramForm({ ...programForm, annualBudget: e.target.value })}
                                  placeholder="2500000"
                                  className="bg-slate-900 border-slate-700 text-slate-100"
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor="perEmployeeLimit" className="text-slate-300">Per-employee limit</Label>
                                <Input
                                  id="perEmployeeLimit"
                                  type="number"
                                  min="0"
                                  value={programForm.perEmployeeLimit}
                                  onChange={(e) => setProgramForm({ ...programForm, perEmployeeLimit: e.target.value })}
                                  placeholder="5000"
                                  className="bg-slate-900 border-slate-700 text-slate-100"
                                />
                              </div>
                            </div>

                            <div className="grid gap-3 rounded-lg border border-slate-700 p-3">
                              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                                <Checkbox checked={offerTiers} onCheckedChange={(v) => setOfferTiers(Boolean(v))} />
                                Offer optional higher tiers employees can self-upgrade to
                              </label>
                              {offerTiers && (
                                <div className="space-y-2">
                                  <p className="text-xs text-slate-500">
                                    Per-employee limit above ({programForm.perEmployeeLimit || '0'}) is the Base tier, funded for everyone. Add any number of optional tiers below.
                                  </p>
                                  {extraTiers.map((tier) => (
                                    <div key={tier.key} className="flex items-center gap-2">
                                      <Input
                                        value={tier.label}
                                        onChange={(e) => updateExtraTier(tier.key, { label: e.target.value })}
                                        placeholder="Label"
                                        className="w-32 bg-slate-900 border-slate-700 text-slate-100"
                                      />
                                      <div className="relative flex-1">
                                        <IndianRupee className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                                        <Input
                                          type="number"
                                          min="0"
                                          value={tier.allocatedLimit}
                                          onChange={(e) => updateExtraTier(tier.key, { allocatedLimit: e.target.value })}
                                          placeholder="Amount / employee / year"
                                          className="pl-7 bg-slate-900 border-slate-700 text-slate-100"
                                        />
                                      </div>
                                      {extraTiers.length > 1 && (
                                        <Button type="button" size="icon" variant="ghost" onClick={() => removeExtraTier(tier.key)}>
                                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                        </Button>
                                      )}
                                    </div>
                                  ))}
                                  <Button type="button" size="sm" variant="outline" onClick={addExtraTier} className="gap-1">
                                    <Plus className="w-3.5 h-3.5" /> Add tier
                                  </Button>
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="grid gap-2">
                                <Label htmlFor="startDate" className="text-slate-300">Start date</Label>
                                <Input
                                  id="startDate"
                                  type="date"
                                  value={programForm.startDate}
                                  onChange={(e) => setProgramForm({ ...programForm, startDate: e.target.value })}
                                  className="bg-slate-900 border-slate-700 text-slate-100"
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor="endDate" className="text-slate-300">End date</Label>
                                <Input
                                  id="endDate"
                                  type="date"
                                  value={programForm.endDate}
                                  onChange={(e) => setProgramForm({ ...programForm, endDate: e.target.value })}
                                  className="bg-slate-900 border-slate-700 text-slate-100"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="grid gap-2">
                                <Label className="text-slate-300">Family coverage</Label>
                                <Select value={programForm.familyCoverage} onValueChange={(value) => setProgramForm({ ...programForm, familyCoverage: value })}>
                                  <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="false">Employee only</SelectItem>
                                    <SelectItem value="true">Employee + family</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor="maxDependents" className="text-slate-300">Max dependents</Label>
                                <Input
                                  id="maxDependents"
                                  type="number"
                                  min="0"
                                  value={programForm.maxDependents}
                                  onChange={(e) => setProgramForm({ ...programForm, maxDependents: e.target.value })}
                                  className="bg-slate-900 border-slate-700 text-slate-100"
                                />
                              </div>
                            </div>

                            <div className="grid gap-2">
                              <Label htmlFor="programDescription" className="text-slate-300">Description</Label>
                              <Textarea
                                id="programDescription"
                                value={programForm.description}
                                onChange={(e) => setProgramForm({ ...programForm, description: e.target.value })}
                                placeholder="Short HR-facing description of what this wallet covers."
                                className="bg-slate-900 border-slate-700 text-slate-100"
                              />
                            </div>
                          </div>

                          <DialogFooter>
                            <Button variant="outline" onClick={() => setCreateProgramDialog(false)} disabled={walletActionLoading}>
                              Cancel
                            </Button>
                            <Button onClick={handleCreateBenefitProgram} disabled={walletActionLoading || !programForm.name || !programForm.perEmployeeLimit}>
                              {walletActionLoading ? 'Creating...' : 'Create Program'}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>

                  <CardContent>
                    {benefitPrograms.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center">
                        <IndianRupee className="w-10 h-10 text-cyan-400 mx-auto mb-3" />
                        <h3 className="text-slate-100 font-semibold">No wallet programs yet</h3>
                        <p className="text-sm text-slate-500 mt-1">
                          Create OPD, diagnostics, pharmacy, health-checkup, or mental wellness wallets to start enrolling employees.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {benefitPrograms.map((program) => {
                          const consumed = program.utilized + program.reserved;
                          const usedPercent = program.allocated > 0 ? Math.min(100, Math.round((consumed / program.allocated) * 100)) : 0;
                          return (
                            <div key={program.id} className="rounded-xl border border-slate-700/60 bg-slate-950/50 p-4">
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="font-semibold text-slate-100">{program.name}</h3>
                                    <Badge className="bg-cyan-500/15 text-cyan-300 border border-cyan-500/25">
                                      {labelForCategory(program.category)}
                                    </Badge>
                                    <Badge variant="outline" className="border-slate-600 text-slate-300">
                                      {program.status}
                                    </Badge>
                                  </div>
                                  {program.description && (
                                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{program.description}</p>
                                  )}
                                  <p className="text-xs text-slate-500 mt-2">
                                    {program.startDate || '—'} — {program.endDate || 'Open ended'} · {program.familyCoverage ? `Family covered up to ${program.maxDependents} dependents` : 'Employee only'}
                                  </p>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <Button variant="outline" size="sm" className="border-slate-700 text-slate-200" onClick={() => openEnrollDialog(program)}>
                                    <Users className="w-4 h-4 mr-2" />
                                    Enroll Employees
                                  </Button>
                                </div>
                              </div>

                              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                                {[
                                  ['Per Employee', program.perEmployeeLimit],
                                  ['Allocated', program.allocated],
                                  ['Utilized', program.utilized],
                                  ['Reserved', program.reserved],
                                  ['Remaining', program.remaining],
                                ].map(([label, value]) => (
                                  <div key={String(label)} className="rounded-lg bg-slate-900/80 border border-slate-800 p-3">
                                    <p className="text-xs text-slate-500">{label}</p>
                                    <p className="text-sm font-semibold text-slate-100 mt-1">{formatINR(Number(value))}</p>
                                  </div>
                                ))}
                              </div>

                              <div className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden">
                                <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400" style={{ width: `${usedPercent}%` }} />
                              </div>
                              <p className="text-xs text-slate-500 mt-2">{program.walletCount} employee wallet{program.walletCount === 1 ? '' : 's'} enrolled</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {hrWalletSummary && (
                <Card className="bg-slate-900/50 border-blue-500/25">
                  <CardHeader>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <CardTitle className="text-slate-100 flex items-center gap-2">
                          <FileText className="w-5 h-5 text-blue-400" />
                          Cashless Authorizations & Settlements
                        </CardTitle>
                        <p className="text-sm text-slate-500 mt-1">
                          Settle approved authorizations to convert reserved balance into utilized spend, or cancel to release the reserve.
                        </p>
                      </div>
                      <div className="w-full lg:w-56">
                        <Select value={authStatusFilter} onValueChange={setAuthStatusFilter}>
                          <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                            <SelectValue placeholder="Filter by status" />
                          </SelectTrigger>
                          <SelectContent>
                            {AUTH_STATUS_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent>
                    {authLoading && authorizations.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-6">Loading authorizations…</p>
                    ) : authorizations.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center">
                        <FileText className="w-10 h-10 text-blue-400 mx-auto mb-3" />
                        <h3 className="text-slate-100 font-semibold">No authorizations found</h3>
                        <p className="text-sm text-slate-500 mt-1">
                          Employee cashless requests will appear here once submitted against an enrolled benefit wallet.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {authorizations.map((authorization) => {
                          const approvedValue = authorization.approvedAmount ?? authorization.requestedAmount;
                          const canSettle = authorization.status === 'approved';
                          const canCancel = ['submitted', 'approved'].includes(authorization.status);
                          return (
                            <div key={authorization.id} className="rounded-xl border border-slate-700/60 bg-slate-950/50 p-4">
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="font-semibold text-slate-100">
                                      {authorization.employeeName || authorization.employeeId || 'Employee'}
                                    </h3>
                                    <Badge className="bg-blue-500/15 text-blue-300 border border-blue-500/25">
                                      {labelForCategory(authorization.category)}
                                    </Badge>
                                    <Badge className={AUTH_STATUS_BADGE_CLASSES[authorization.status] || AUTH_STATUS_BADGE_CLASSES.submitted}>
                                      {authorization.status}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-slate-500 mt-2">
                                    Code: <span className="text-slate-300 font-mono">{authorization.authorizationCode}</span>
                                    {authorization.employeeId ? ` · Emp ID: ${authorization.employeeId}` : ''}
                                    {authorization.providerName ? ` · ${authorization.providerName}` : ''}
                                    {authorization.serviceType ? ` · ${authorization.serviceType}` : ''}
                                  </p>
                                  <p className="text-xs text-slate-500 mt-1">
                                    Requested {formatDateTime(authorization.createdAt)} · Valid till {formatDateTime(authorization.validTo)}
                                    {authorization.status === 'settled' && ` · Settled ${formatDateTime(authorization.settledAt)}`}
                                    {authorization.status === 'cancelled' && ` · Cancelled ${formatDateTime(authorization.cancelledAt)}`}
                                  </p>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {canSettle && (
                                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => openSettleDialog(authorization)} disabled={authActionLoading}>
                                      <CheckCircle className="w-4 h-4 mr-2" />
                                      Settle
                                    </Button>
                                  )}
                                  {canCancel && (
                                    <Button variant="outline" size="sm" className="border-slate-700 text-slate-300 hover:text-red-300" onClick={() => handleCancelAuthorization(authorization)} disabled={authActionLoading}>
                                      <XCircle className="w-4 h-4 mr-2" />
                                      Cancel
                                    </Button>
                                  )}
                                </div>
                              </div>
                              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                                {[
                                  ['Requested', authorization.requestedAmount],
                                  ['Approved', approvedValue],
                                  ['Settled', authorization.settlementAmount ?? 0],
                                  ['Wallet Reserved', authorization.walletReserved],
                                  ['Wallet Remaining', authorization.walletRemaining],
                                ].map(([label, value]) => (
                                  <div key={String(label)} className="rounded-lg bg-slate-900/80 border border-slate-800 p-3">
                                    <p className="text-xs text-slate-500">{String(label)}</p>
                                    <p className="text-sm font-semibold text-slate-100 mt-1">{formatINR(Number(value))}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Dialog open={enrollDialog} onOpenChange={setEnrollDialog}>
                <DialogContent className="max-w-xl bg-slate-950 border-slate-700 text-slate-100">
                  <DialogHeader>
                    <DialogTitle>Enroll Employees</DialogTitle>
                    <DialogDescription className="text-slate-400">
                      {selectedProgram ? `Allocate ${selectedProgram.name} wallets. Leave employee IDs blank to enroll all active employees.` : 'Allocate wallets to employees.'}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="grid gap-4 py-2">
                    <div className="grid gap-2">
                      <Label htmlFor="allocatedLimit" className="text-slate-300">Allocated limit per employee</Label>
                      <Input
                        id="allocatedLimit"
                        type="number"
                        min="0"
                        value={enrollForm.allocatedLimit}
                        onChange={(e) => setEnrollForm({ ...enrollForm, allocatedLimit: e.target.value })}
                        className="bg-slate-900 border-slate-700 text-slate-100"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="employeeIds" className="text-slate-300">Employee IDs</Label>
                      <Textarea
                        id="employeeIds"
                        value={enrollForm.employeeIdsText}
                        onChange={(e) => setEnrollForm({ ...enrollForm, employeeIdsText: e.target.value })}
                        placeholder="Optional: EMP001, EMP002, EMP003. Leave blank to enroll all active employees."
                        className="bg-slate-900 border-slate-700 text-slate-100 min-h-[120px]"
                      />
                      <p className="text-xs text-slate-500">Comma-separated or one employee ID per line.</p>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEnrollDialog(false)} disabled={walletActionLoading}>
                      Cancel
                    </Button>
                    <Button onClick={handleEnrollEmployees} disabled={walletActionLoading || !enrollForm.allocatedLimit}>
                      {walletActionLoading ? 'Enrolling...' : 'Enroll'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={settleDialog} onOpenChange={setSettleDialog}>
                <DialogContent className="max-w-xl bg-slate-950 border-slate-700 text-slate-100">
                  <DialogHeader>
                    <DialogTitle>Settle Cashless Authorization</DialogTitle>
                    <DialogDescription className="text-slate-400">
                      {selectedAuthorization
                        ? `Convert the reserved amount for ${selectedAuthorization.authorizationCode} into utilized spend.`
                        : 'Convert the reserved amount into utilized spend.'}
                    </DialogDescription>
                  </DialogHeader>

                  {selectedAuthorization && (
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-300">
                      <p>
                        {selectedAuthorization.employeeName || selectedAuthorization.employeeId || 'Employee'}
                        {' · '}
                        {labelForCategory(selectedAuthorization.category)}
                        {selectedAuthorization.providerName ? ` · ${selectedAuthorization.providerName}` : ''}
                      </p>
                      <p className="text-slate-500 mt-1">
                        Approved {formatINR(selectedAuthorization.approvedAmount ?? selectedAuthorization.requestedAmount)}
                        {' · '}Wallet remaining {formatINR(selectedAuthorization.walletRemaining)}. Any unused reserve is released on settlement.
                      </p>
                    </div>
                  )}

                  <div className="grid gap-4 py-2">
                    <div className="grid gap-2">
                      <Label htmlFor="settlementAmount" className="text-slate-300">Settlement amount</Label>
                      <Input
                        id="settlementAmount"
                        type="number"
                        min="0"
                        value={settleForm.settlementAmount}
                        onChange={(e) => setSettleForm({ ...settleForm, settlementAmount: e.target.value })}
                        className="bg-slate-900 border-slate-700 text-slate-100"
                      />
                      <p className="text-xs text-slate-500">Cannot exceed the approved amount.</p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="invoiceNumber" className="text-slate-300">Invoice number (optional)</Label>
                      <Input
                        id="invoiceNumber"
                        value={settleForm.invoiceNumber}
                        onChange={(e) => setSettleForm({ ...settleForm, invoiceNumber: e.target.value })}
                        placeholder="INV-2026-0001"
                        className="bg-slate-900 border-slate-700 text-slate-100"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="settlementNotes" className="text-slate-300">Notes (optional)</Label>
                      <Textarea
                        id="settlementNotes"
                        value={settleForm.notes}
                        onChange={(e) => setSettleForm({ ...settleForm, notes: e.target.value })}
                        placeholder="Service details, claim reference, etc."
                        className="bg-slate-900 border-slate-700 text-slate-100 min-h-[90px]"
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSettleDialog(false)} disabled={authActionLoading}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSettleAuthorization}
                      disabled={
                        authActionLoading ||
                        !settleForm.settlementAmount ||
                        Number(settleForm.settlementAmount) <= 0 ||
                        Number(settleForm.settlementAmount) > (selectedAuthorization?.approvedAmount ?? selectedAuthorization?.requestedAmount ?? 0)
                      }
                    >
                      {authActionLoading ? 'Settling...' : 'Settle'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {corporatePlan && (
                <>
                  {/* Plan identity strip — no insurance-style claims here, just what plan this is */}
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600/20 via-slate-900 to-slate-950 border border-emerald-500/25 shadow-xl shadow-slate-950/40">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="relative p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30">
                            <Shield className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h2 className="text-xl font-bold text-white">{corporatePlan.planName}</h2>
                            <p className="text-sm text-slate-400 mt-0.5">
                              Valid: {new Date(corporatePlan.validFrom).toLocaleDateString()} — {new Date(corporatePlan.validTo).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 font-semibold">
                          {corporatePlan.planType}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Insurance Coverage — only shown when hospitalization/IPD is genuinely active on this plan */}
                  {corporatePlan.features?.ipdCoverage && (
                    <Card className="bg-blue-950/20 border-blue-500/25">
                      <CardHeader>
                        <CardTitle className="text-slate-100 flex items-center gap-2">
                          <Shield className="w-5 h-5 text-blue-400" />
                          Insurance Coverage (Hospitalization)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="text-center p-4 bg-slate-800/60 rounded-xl border border-slate-700/40">
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Sum Insured</p>
                            <p className="text-2xl font-bold text-blue-400">
                              {corporatePlan.coverage?.sumInsured ? `₹${corporatePlan.coverage.sumInsured.toLocaleString()}` : '—'}
                            </p>
                          </div>
                          <div className="text-center p-4 bg-slate-800/60 rounded-xl border border-slate-700/40">
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Room Rent</p>
                            <p className="text-2xl font-bold text-blue-400">{corporatePlan.coverage?.roomRent || '—'}</p>
                          </div>
                          <div className="text-center p-4 bg-slate-800/60 rounded-xl border border-slate-700/40">
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Pre-Hospitalization</p>
                            <p className="text-2xl font-bold text-blue-400">{corporatePlan.coverage?.preHospitalization || '—'}</p>
                          </div>
                          <div className="text-center p-4 bg-slate-800/60 rounded-xl border border-slate-700/40">
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Post-Hospitalization</p>
                            <p className="text-2xl font-bold text-blue-400">{corporatePlan.coverage?.postHospitalization || '—'}</p>
                          </div>
                        </div>
                        <div className="mt-4 space-y-3">
                          {(corporatePlan.benefits || []).filter((b) => b.benefitCategory === 'insurance').map((benefit, idx) => (
                            <div key={idx} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <h3 className="font-semibold text-slate-100">{benefit.category}</h3>
                                  <p className="text-sm text-slate-400 mt-1">{benefit.description}</p>
                                </div>
                                <div className="text-right ml-4">
                                  <p className="font-bold text-blue-400">{benefit.coverage}</p>
                                  {benefit.limit && <p className="text-xs text-slate-500 mt-1">{benefit.limit}</p>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {!corporatePlan.features?.ipdCoverage && (
                    <Card className="bg-slate-900/40 border-slate-700/40">
                      <CardContent className="py-6 flex items-center gap-3 text-sm text-slate-400">
                        <Shield className="w-5 h-5 text-slate-600 flex-shrink-0" />
                        <span>This plan does not include hospitalization/IPD insurance coverage. Benefits below are employer-funded wellness and OPD reimbursements, not insurance.</span>
                      </CardContent>
                    </Card>
                  )}

                  {planUsage && (
                    <Card className="bg-slate-900/50 border-slate-700/50">
                      <CardHeader>
                        <CardTitle className="text-slate-100">Benefit Utilization</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700/40">
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">OPD Visits</p>
                            <p className="text-2xl font-bold text-white">
                              {planUsage.opdUsed}<span className="text-slate-400 font-normal">/{planUsage.opdLimit}</span>
                            </p>
                            <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${planUsage.opdLimit ? Math.min(100, (planUsage.opdUsed / planUsage.opdLimit) * 100) : 0}%` }} />
                            </div>
                          </div>
                          <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700/40">
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Diagnostics</p>
                            <p className="text-2xl font-bold text-white">
                              {planUsage.diagnosticsUsed}<span className="text-slate-400 font-normal">/{planUsage.diagnosticsLimit}</span>
                            </p>
                            <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${planUsage.diagnosticsLimit ? Math.min(100, (planUsage.diagnosticsUsed / planUsage.diagnosticsLimit) * 100) : 0}%` }} />
                            </div>
                          </div>
                          <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700/40">
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Claims (₹)</p>
                            <p className="text-2xl font-bold text-white">
                              ₹{planUsage.amountUsed.toLocaleString()}<span className="text-slate-400 font-normal text-sm"> / ₹{planUsage.amountLimit.toLocaleString()}</span>
                            </p>
                            <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${planUsage.amountLimit ? Math.min(100, (planUsage.amountUsed / planUsage.amountLimit) * 100) : 0}%` }} />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Features */}
                  <Card className="bg-slate-900/50 border-slate-700/50">
                    <CardHeader>
                      <CardTitle className="text-slate-100">Coverage Features</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {Object.entries(corporatePlan.features || {}).map(([key, enabled]) => {
                          const Icon = getFeatureIcon(key);
                          return enabled ? (
                            <div key={key} className="flex items-center gap-2 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                              <Icon className="w-5 h-5 text-emerald-400" />
                              <span className="text-sm font-medium text-emerald-300">{getFeatureLabel(key)}</span>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Included Perks — platform/access features, distinct from medical
                      coverage above. Team-configured per corporate; this is the direct
                      fix for "customization isn't visible" (was previously write-only). */}
                  {corporatePlan.platformFeatures && Object.values(corporatePlan.platformFeatures).some(Boolean) && (
                    <Card className="bg-slate-900/50 border-slate-700/50">
                      <CardHeader>
                        <CardTitle className="text-slate-100 flex items-center gap-2">
                          <Gift className="w-5 h-5 text-amber-400" />
                          Included Perks
                        </CardTitle>
                        <p className="text-sm text-slate-500">Platform features and discount programs included in your plan.</p>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {Object.entries(corporatePlan.platformFeatures).map(([key, enabled]) => {
                            const Icon = getPlatformFeatureIcon(key);
                            return enabled ? (
                              <div key={key} className="flex items-center gap-2 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                                <Icon className="w-5 h-5 text-amber-400" />
                                <span className="text-sm font-medium text-amber-300">{getPlatformFeatureLabel(key)}</span>
                              </div>
                            ) : null;
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Wellness & OPD Benefits — employer-funded, no insurer or policy behind these */}
                  <Card className="bg-emerald-950/10 border-emerald-500/20">
                    <CardHeader>
                      <CardTitle className="text-slate-100 flex items-center gap-2">
                        <Heart className="w-5 h-5 text-emerald-400" />
                        Wellness &amp; OPD Benefits
                      </CardTitle>
                      <p className="text-sm text-slate-500">Employer-funded reimbursements — not insurance coverage.</p>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {(corporatePlan.benefits || []).filter((b) => b.benefitCategory !== 'insurance').map((benefit, idx) => (
                          <div key={idx} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <h3 className="font-semibold text-slate-100">{benefit.category}</h3>
                                <p className="text-sm text-slate-400 mt-1">{benefit.description}</p>
                              </div>
                              <div className="text-right ml-4">
                                <p className="font-bold text-emerald-400">{benefit.coverage}</p>
                                {benefit.limit && (
                                  <p className="text-xs text-slate-500 mt-1">{benefit.limit}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        {(corporatePlan.benefits || []).filter((b) => b.benefitCategory !== 'insurance').length === 0 && (
                          <p className="text-sm text-slate-500 text-center py-6">No wellness/OPD benefits configured on this plan.</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
              {!corporatePlan && (
                <Card className="bg-slate-900/50 border-slate-700/50">
                  <CardContent className="py-12 text-center">
                    <Shield className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-300 font-medium">No active plan on record</p>
                    <p className="text-sm text-slate-500 mt-1">
                      {viewMode === 'company'
                        ? 'This company has no active corporate plan configured yet.'
                        : 'Contact your HR team to get enrolled in a corporate health plan.'}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Health Checkups Tab */}
            <TabsContent value="checkups" className="space-y-4">
              {/* Health Checkup Packages -- HR-only, read-only view of what
                  Team has configured (Pre-Employment / Annual / Other),
                  each with a real test list and real employee assignment
                  count. Team customizes these; HR views them here. */}
              {viewMode === 'company' && (
                <Card className="bg-slate-900/50 border-slate-700/50">
                  <CardHeader>
                    <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
                      <TestTube className="w-5 h-5 text-emerald-400" />
                      Health Checkup Packages
                    </CardTitle>
                    <p className="text-sm text-slate-400">
                      Configured by your Mediqzy account team. Contact them to add or change a package.
                    </p>
                  </CardHeader>
                  <CardContent>
                    {healthPackages.length === 0 ? (
                      <div className="text-center py-8 text-slate-500">
                        <TestTube className="w-10 h-10 mx-auto mb-2 opacity-40" />
                        <p>No customized health checkup packages configured yet.</p>
                        <p className="text-sm mt-1">Ask your Mediqzy account team to set up Pre-Employment or Annual Health Checkup packages for your employees.</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {([
                          { key: 'pre_employment' as const, label: 'Pre-Employment Health Checkup' },
                          { key: 'annual' as const, label: 'Annual Health Checkup' },
                          { key: 'other' as const, label: 'Other Packages' },
                        ]).map(({ key, label }) => {
                          const group = healthPackages.filter(p => p.type === key);
                          if (group.length === 0) return null;
                          return (
                            <div key={key}>
                              <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3">{label}</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {group.map(pkg => (
                                  <Card key={pkg.id} className="bg-slate-800/50 border-slate-700/50">
                                    <CardContent className="pt-4 space-y-2">
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="font-medium text-slate-100">{pkg.name}</p>
                                        {pkg.price != null && (
                                          <span className="text-emerald-400 font-semibold flex items-center gap-0.5 shrink-0">
                                            <IndianRupee className="w-3.5 h-3.5" />{pkg.price.toLocaleString()}
                                          </span>
                                        )}
                                      </div>
                                      {pkg.description && <p className="text-sm text-slate-400">{pkg.description}</p>}
                                      <div className="flex items-center gap-4 text-sm text-slate-400 pt-1">
                                        <span className="flex items-center gap-1"><TestTube className="w-3.5 h-3.5" />{pkg.tests.length} tests</span>
                                        <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{pkg.employeeCount} employees</span>
                                      </div>
                                      {pkg.tests.length > 0 && (
                                        <div className="flex flex-wrap gap-1 pt-1">
                                          {pkg.tests.slice(0, 4).map((t, i) => (
                                            <Badge key={i} variant="outline" className="text-xs font-normal border-slate-600 text-slate-400">{t}</Badge>
                                          ))}
                                          {pkg.tests.length > 4 && (
                                            <Badge variant="outline" className="text-xs font-normal border-slate-600 text-slate-500">+{pkg.tests.length - 4} more</Badge>
                                          )}
                                        </div>
                                      )}
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Filters */}
              <Card className="p-4 bg-slate-900/50 border-slate-700/50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search health checkups..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-800/60 border border-slate-700/60 rounded-lg text-slate-200 placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>

                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-4 py-2 bg-slate-800/60 border border-slate-700/60 rounded-lg text-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    <option value="all">All Categories</option>
                    <option value="Basic">Basic</option>
                    <option value="Comprehensive">Comprehensive</option>
                    <option value="Advanced">Advanced</option>
                    <option value="Specialized">Specialized</option>
                  </select>
                </div>
              </Card>

              {/* Checkups Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredCheckups.map(checkup => (
                  <Card key={checkup.id} className="bg-slate-900/50 border-slate-700/50 hover:border-slate-600/60 hover:shadow-lg hover:shadow-slate-950/50 transition-all">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-xl text-slate-100">{checkup.name}</CardTitle>
                          <p className="text-sm text-slate-400 mt-1">{checkup.description}</p>
                        </div>
                        {checkup.category && (
                          <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 border">
                            {checkup.category}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {checkup.duration && (
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-slate-500" />
                            <span className="text-slate-300">{checkup.duration}</span>
                          </div>
                        )}
                        {checkup.tests && checkup.tests.length > 0 && (
                          <div className="flex items-center gap-2">
                            <TestTube className="w-4 h-4 text-slate-500" />
                            <span className="text-slate-300">{checkup.tests.length} tests</span>
                          </div>
                        )}
                        {checkup.ageGroup && (
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-slate-500" />
                            <span className="text-slate-300">{checkup.ageGroup}</span>
                          </div>
                        )}
                        {checkup.fasting && (
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-orange-400" />
                            <span className="text-orange-400">Fasting required</span>
                          </div>
                        )}
                        {checkup.limit && (
                          <div className="flex items-center gap-2 col-span-2">
                            <CalendarCheck className="w-4 h-4 text-emerald-400" />
                            <span className="text-emerald-400">{checkup.limit}</span>
                          </div>
                        )}
                        {(checkup.validFrom || checkup.validTo) && (
                          <div className="flex items-center gap-2 col-span-2 text-slate-500">
                            <Calendar className="w-4 h-4" />
                            <span>
                              {checkup.validFrom ? new Date(checkup.validFrom).toLocaleDateString() : '—'}
                              {' – '}
                              {checkup.validTo ? new Date(checkup.validTo).toLocaleDateString() : '—'}
                            </span>
                          </div>
                        )}
                      </div>

                      {checkup.tests && checkup.tests.length > 0 && (
                        <div className="bg-slate-800/50 p-3 rounded-lg">
                          <p className="text-xs text-slate-400 mb-2">Tests Included:</p>
                          <div className="flex flex-wrap gap-1">
                            {checkup.tests.slice(0, 6).map((test, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {test}
                              </Badge>
                            ))}
                            {checkup.tests.length > 6 && (
                              <Badge variant="outline" className="text-xs">
                                +{checkup.tests.length - 6} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between items-center pt-3 border-t">
                        <div>
                          {checkup.price ? (
                            checkup.discountedPrice ? (
                              <div>
                                <p className="text-sm text-slate-500 line-through">₹{checkup.price}</p>
                                <p className="text-2xl font-bold text-emerald-400 flex items-center">
                                  <IndianRupee className="w-5 h-5" />
                                  {checkup.discountedPrice}
                                </p>
                                <p className="text-xs text-emerald-500">Corporate benefit applied</p>
                              </div>
                            ) : (
                              <p className="text-2xl font-bold text-slate-100 flex items-center">
                                <IndianRupee className="w-5 h-5" />
                                {checkup.price}
                              </p>
                            )
                          ) : (
                            <p className="text-sm text-emerald-400 font-medium">Included in your corporate plan</p>
                          )}
                        </div>
                        <Button onClick={() => handleBookCheckup(checkup)}>
                          <Plus className="w-4 h-4 mr-2" />
                          Book Now
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {filteredCheckups.length === 0 && (
                  <Card className="bg-slate-900/40 border-slate-700/40 md:col-span-2">
                    <CardContent className="py-12 text-center">
                      <TestTube className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                      <p className="text-slate-300 font-medium">No health checkup benefit configured</p>
                      <p className="text-sm text-slate-500 mt-1">This corporate's plan doesn't currently include a health checkup benefit.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* My Appointments Tab */}
            <TabsContent value="appointments" className="space-y-4">
              {myAppointments.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {myAppointments.map(appointment => (
                    <Card key={appointment.id} className="bg-slate-900/50 border-slate-700/50 hover:border-slate-600/60 hover:shadow-lg transition-all">
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <Badge className={
                                appointment.status === 'scheduled' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30 border' :
                                appointment.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 border' :
                                'bg-slate-700/60 text-slate-300 border-slate-600/50 border'
                              }>
                                {(appointment.status || 'scheduled').toUpperCase()}
                              </Badge>
                              <span className="text-sm text-slate-400">#{appointment.appointmentId}</span>
                            </div>

                            <h3 className="text-xl font-semibold text-slate-100 mb-2">{appointment.checkupName}</h3>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-slate-400">Date & Time</p>
                                <p className="font-medium flex items-center gap-1">
                                  <Calendar className="w-4 h-4" />
                                  {new Date(appointment.date).toLocaleDateString()}
                                </p>
                                <p className="font-medium flex items-center gap-1 ml-5">
                                  <Clock className="w-4 h-4" />
                                  {appointment.time}
                                </p>
                              </div>

                              <div>
                                <p className="text-slate-400">Hospital</p>
                                <p className="font-medium text-slate-200">{appointment.hospital}</p>
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {appointment.location}
                                </p>
                              </div>

                              {appointment.doctor && (
                                <div>
                                  <p className="text-slate-400">Doctor</p>
                                  <p className="font-medium flex items-center gap-1">
                                    <Stethoscope className="w-4 h-4" />
                                    {appointment.doctor}
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-between mt-4 pt-4 border-t">
                              <div>
                                <p className="text-sm text-slate-400">Claim Amount</p>
                                <p className="text-lg font-bold text-emerald-400">₹{appointment.claimAmount.toLocaleString()}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-slate-400">Booked on</p>
                                <p className="text-sm font-medium">{new Date(appointment.bookedOn).toLocaleDateString()}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="p-8 text-center bg-slate-900/50 border-slate-700/50">
                  <CalendarCheck className="w-12 h-12 text-slate-500 mx-auto mb-2" />
                  <p className="text-slate-400">No appointments booked yet</p>
                  <Button className="mt-4" onClick={() => setActiveTab('checkups')}>
                    <Plus className="w-4 h-4 mr-2" />
                    Book Health Checkup
                  </Button>
                </Card>
              )}
            </TabsContent>
          </Tabs>
      </div>

      {/* Booking Dialog */}
      <Dialog open={bookingDialog} onOpenChange={setBookingDialog}>
        <DialogContent className="max-w-2xl bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle>Book Health Checkup</DialogTitle>
          </DialogHeader>
          {selectedCheckup && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-800/60 rounded-lg border border-slate-700/50">
                <h3 className="font-semibold text-lg text-slate-100">{selectedCheckup.name}</h3>
                <p className="text-sm text-slate-400 mt-1">{selectedCheckup.description}</p>
                <div className="flex items-center gap-4 mt-3">
                  <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 border">
                    {selectedCheckup.category}
                  </Badge>
                  <span className="text-sm text-slate-300">Duration: {selectedCheckup.duration}</span>
                  <span className="text-sm font-bold text-emerald-400">
                    ₹{selectedCheckup.discountedPrice || selectedCheckup.price}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-200">Preferred Date</label>
                  <input
                    type="date"
                    value={bookingDetails.preferredDate}
                    onChange={(e) => setBookingDetails({...bookingDetails, preferredDate: e.target.value})}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/60 rounded-lg text-slate-200 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-200">Preferred Time</label>
                  <select
                    value={bookingDetails.preferredTime}
                    onChange={(e) => setBookingDetails({...bookingDetails, preferredTime: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/60 rounded-lg text-slate-200 focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select time</option>
                    <option value="8:00 AM">8:00 AM</option>
                    <option value="9:00 AM">9:00 AM</option>
                    <option value="10:00 AM">10:00 AM</option>
                    <option value="11:00 AM">11:00 AM</option>
                    <option value="2:00 PM">2:00 PM</option>
                    <option value="3:00 PM">3:00 PM</option>
                    <option value="4:00 PM">4:00 PM</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-200">Hospital</label>
                  <select
                    value={bookingDetails.hospital}
                    onChange={(e) => setBookingDetails({...bookingDetails, hospital: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/60 rounded-lg text-slate-200 focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select hospital</option>
                    <option value="Apollo Hospital">Apollo Hospital</option>
                    <option value="Fortis Hospital">Fortis Hospital</option>
                    <option value="Max Healthcare">Max Healthcare</option>
                    <option value="Medanta Hospital">Medanta Hospital</option>
                    <option value="KIMS Hospital">KIMS Hospital</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-200">Location</label>
                  <input
                    type="text"
                    value={bookingDetails.location}
                    onChange={(e) => setBookingDetails({...bookingDetails, location: e.target.value})}
                    placeholder="Enter location/area"
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/60 rounded-lg text-slate-200 placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-slate-200">Special Instructions (Optional)</label>
                <textarea
                  value={bookingDetails.specialInstructions}
                  onChange={(e) => setBookingDetails({...bookingDetails, specialInstructions: e.target.value})}
                  placeholder="Any specific requirements or medical conditions to note..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/60 rounded-lg text-slate-200 placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {selectedCheckup.fasting && (
                <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-orange-300">Fasting Required</p>
                    <p className="text-orange-400">Please ensure 8-12 hours of fasting before the checkup</p>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setBookingDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmitBooking}
                  disabled={
                    !bookingDetails.preferredDate ||
                    !bookingDetails.preferredTime ||
                    (!bookingDetails.hospital && !bookingDetails.location)
                  }
                >
                  Confirm Booking
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </CorporateLayout>
  );
};

export default CorporateBenefits;
