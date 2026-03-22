import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import MainLayout from '@/components/layout/MainLayout';
import {
  Building2, Calendar, CheckCircle, Clock, FlaskConical,
  Mail, MessageSquare, Phone, Search, User, Users, ArrowLeft,
  AlertCircle, Loader2, History, ChevronRight,
  Upload, FileText, Download, Share2, RefreshCw, X, XCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '@/utils/api';
import { getUserType } from '@/hooks/auth';

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  gender?: string;
}

interface Lab {
  id: number;
  name: string;
  address?: string | { street?: string; city?: string; state?: string; country?: string };
  city?: string;
  state?: string;
  pinCode?: string;
  accreditation?: string;
}

/** Extract a displayable street string from lab.address (may be string or JSON object) */
const labStreet = (lab: Lab): string => {
  if (!lab.address) return '';
  if (typeof lab.address === 'string') return lab.address;
  return lab.address.street || '';
};

interface BookingHistoryItem {
  id: number;
  order_number: string;
  test_type: string;
  status: string;
  notes: string;
  created_at: string;
  employee_id: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
}

interface CorporatePackage {
  id: string | number;
  name: string;
  description?: string;
  features?: string[];
  benefits?: string[];
  planType?: string;
  price?: number;
}

interface Corporate {
  id: number;
  companyName: string;
  email?: string;
  employeeCount?: number;
  status?: string;
}

interface EligiblePackage {
  packageId: string;
  packageName: string;
  tests: string[];
  price: number;
  description: string;
  validFrom: string;
  validTo: string;
  status: string;
  usedAt: string | null;
  available: boolean;
}

interface HealthReport {
  id: number;
  report_name: string;
  report_type: string;
  report_date: string;
  report_url: string;
  file_size_bytes: number;
  mime_type: string;
  notes: string;
  notified_email: boolean;
  notified_whatsapp: boolean;
  notified_at: string;
  created_at: string;
  employee_id: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  uploader_first?: string;
  uploader_last?: string;
  order_number?: string;
}

const REPORT_TYPES = [
  { value: 'annual_health_checkup', label: '🔬 Annual Health Checkup' },
  { value: 'lab_result', label: '🧪 Lab Result' },
  { value: 'blood_test', label: '🩸 Blood Test' },
  { value: 'lipid_profile', label: '💉 Lipid Profile' },
  { value: 'diabetic_screening', label: '🍬 Diabetic Screening' },
  { value: 'cardiac_screening', label: '❤️ Cardiac Screening' },
  { value: 'thyroid_panel', label: '🦋 Thyroid Panel' },
  { value: 'xray', label: '🦴 X-Ray' },
  { value: 'ecg', label: '📊 ECG Report' },
  { value: 'usg', label: '🔊 USG Report' },
  { value: 'eye_checkup', label: '👁️ Eye Checkup' },
  { value: 'dental_checkup', label: '🦷 Dental Checkup' },
  { value: 'general_health_report', label: '📋 General Health Report' },
  { value: 'prescription', label: '💊 Prescription' },
  { value: 'other', label: '📁 Other' },
];

// ──────────────────────────────────────────────────────────

const TIME_SLOTS = [
  '07:00 AM', '07:30 AM', '08:00 AM', '08:30 AM', '09:00 AM',
  '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM',
];

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

// ──────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────

export default function CorporateHealthBooking() {
  const { toast } = useToast();

  // ── tabs ──
  const [activeTab, setActiveTab] = useState<'book' | 'history' | 'reports'>('book');

  // ── employee search ──
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeSuggestions, setEmployeeSuggestions] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [empLoading, setEmpLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── lab search (server-side, like employee search) ──
  const [labSuggestions, setLabSuggestions] = useState<Lab[]>([]);
  const [selectedLab, setSelectedLab] = useState<Lab | null>(null);
  const [labsLoading, setLabsLoading] = useState(false);
  const [labSearch, setLabSearch] = useState('');
  const [showLabSuggestions, setShowLabSuggestions] = useState(false);
  const labSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── user type ──
  const userType = getUserType();

  // ── view state: corporate picker OR booking form ──
  const [view, setView] = useState<'pick-corporate' | 'booking'>('pick-corporate');

  // ── corporate selector ──
  const [corporate, setCorporate] = useState<Corporate | null>(null);
  const [corporateLoading, setCorporateLoading] = useState(false);
  const [corporateList, setCorporateList] = useState<Corporate[]>([]);
  const [corporateListLoading, setCorporateListLoading] = useState(false);
  const [corpInput, setCorpInput] = useState('');
  const [corpSuggestions, setCorpSuggestions] = useState<Corporate[]>([]);
  const [showCorpSuggestions, setShowCorpSuggestions] = useState(false);

  // ── corporate plan packages ──
  const [packages, setPackages] = useState<CorporatePackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);

  // ── per-employee plan eligibility ──
  const [employeeEligibility, setEmployeeEligibility] = useState<EligiblePackage[]>([]);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);

  // ── form fields ──
  const [checkupDate, setCheckupDate] = useState('');
  const [checkupTime, setCheckupTime] = useState('');
  const [testPackage, setTestPackage] = useState('');
  const [notes, setNotes] = useState('');

  // ── submission ──
  const [submitting, setSubmitting] = useState(false);
  const [successBooking, setSuccessBooking] = useState<Record<string, unknown> | null>(null);
  const [sendEmail, setSendEmail] = useState(true);
  const [sendWhatsapp, setSendWhatsapp] = useState(true);

  // ── history ──
  const [history, setHistory] = useState<BookingHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);

  // ── reports tab ──
  const [reports, setReports] = useState<HealthReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsTotal, setReportsTotal] = useState(0);
  const [reportFilterEmployee, setReportFilterEmployee] = useState('');
  // report upload form
  const [rptEmployee, setRptEmployee] = useState<Employee | null>(null);
  const [rptEmployeeSearch, setRptEmployeeSearch] = useState('');
  const [rptEmpSuggestions, setRptEmpSuggestions] = useState<Employee[]>([]);
  const [rptEmpLoading, setRptEmpLoading] = useState(false);
  const [showRptSuggestions, setShowRptSuggestions] = useState(false);
  const rptSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rptName, setRptName] = useState('');
  const [rptType, setRptType] = useState('annual_health_checkup');
  const [rptDate, setRptDate] = useState('');
  const [rptNotes, setRptNotes] = useState('');
  const [rptFiles, setRptFiles] = useState<File[]>([]);
  const [rptSendEmail, setRptSendEmail] = useState(true);
  const [rptSendWA, setRptSendWA] = useState(true);
  const [rptUploading, setRptUploading] = useState(false);
  const [rptSuccess, setRptSuccess] = useState<{ reportName: string; employeeName: string; reportUrl: string } | null>(null);
  const [sharingId, setSharingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ──────────────────────────────────────────────────────────
  // Helper: load packages once a corporate is chosen
  // ──────────────────────────────────────────────────────────
  const loadForCorporate = (cid: number) => {
    setPackagesLoading(true);
    api.get(`/corporate-bookings/packages?corporateId=${cid}`)
      .then(r => setPackages(r.data.packages || []))
      .catch(e => console.error('Packages fetch failed:', e))
      .finally(() => setPackagesLoading(false));
  };

  // ──────────────────────────────────────────────────────────
  // On mount: fetch all assigned corporates (admin gets all,
  // team gets their assigned list).  Auto-select if only one.
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    setCorporateListLoading(true);
    api.get('/admin/corporates')
      .then(r => {
        const raw = r.data.corporates || r.data.data || r.data || [];
        const list: Corporate[] = (Array.isArray(raw) ? raw : []).map((c: Record<string, unknown>) => ({
          id: c.id as number,
          companyName: (c.companyName || c.company_name || '') as string,
          employeeCount: (c.employeeCount ?? c.employee_count) as number | undefined,
          status: c.status as string | undefined,
        }));
        setCorporateList(list);
        // Auto-select if there's exactly one corporate assigned
        if (list.length === 1) {
          setCorporate(list[0]);
          loadForCorporate(list[0].id);
          setView('booking');
        }
      })
      .catch(e => console.error('Corporate list fetch failed:', e))
      .finally(() => setCorporateListLoading(false));
  }, []);  

  // ──────────────────────────────────
  // Load history / reports when tab switches
  // ──────────────────────────────────
  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
    if (activeTab === 'reports') fetchReports();
  }, [activeTab]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const cid = corporate?.id;
      if (!cid) return;
      const r = await api.get(`/corporate-bookings/history?corporateId=${cid}&limit=50`);
      setHistory(r.data.bookings || []);
      setHistoryTotal(r.data.total || 0);
    } catch (e) {
      console.error('History fetch failed:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchReports = async (empId?: string) => {
    setReportsLoading(true);
    try {
      const cid = corporate?.id;
      if (!cid) return;
      const empParam = empId ? `&employeeId=${empId}` : '';
      const r = await api.get(`/corporate-bookings/reports?corporateId=${cid}&limit=100${empParam}`);
      setReports(r.data.reports || []);
      setReportsTotal(r.data.total || 0);
    } catch (e) {
      console.error('Reports fetch failed:', e);
    } finally {
      setReportsLoading(false);
    }
  };

  // Report employee search
  const handleRptEmpSearch = (val: string) => {
    setRptEmployeeSearch(val);
    setRptEmployee(null);
    if (rptSearchTimer.current) clearTimeout(rptSearchTimer.current);
    if (val.trim().length < 2) { setRptEmpSuggestions([]); setShowRptSuggestions(false); return; }
    rptSearchTimer.current = setTimeout(async () => {
      setRptEmpLoading(true);
      try {
        const r = await api.get(`/corporate-bookings/employees?corporateId=${corporate?.id}&search=${encodeURIComponent(val)}`);
        setRptEmpSuggestions(r.data.employees || []);
        setShowRptSuggestions(true);
      } catch { setRptEmpSuggestions([]); } finally { setRptEmpLoading(false); }
    }, 350);
  };

  const selectRptEmployee = (emp: Employee) => {
    setRptEmployee(emp);
    setRptEmployeeSearch(`${emp.firstName} ${emp.lastName} — ${emp.email}`);
    setShowRptSuggestions(false);
  };

  // Upload report(s)
  const handleReportUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rptEmployee) { toast({ variant: 'destructive', title: 'Employee required' }); return; }
    if (rptFiles.length === 0) { toast({ variant: 'destructive', title: 'File required', description: 'Please select at least one PDF or image file.' }); return; }
    if (!rptName || !rptDate) { toast({ variant: 'destructive', title: 'Report name & date required' }); return; }

    const formData = new FormData();
    rptFiles.forEach(f => formData.append('reports', f));
    formData.append('employeeId', String(rptEmployee.id));
    formData.append('reportName', rptName);
    formData.append('reportType', rptType);
    formData.append('reportDate', rptDate);
    formData.append('notes', rptNotes);
    formData.append('sendEmail', String(rptSendEmail));
    formData.append('sendWhatsapp', String(rptSendWA));
    formData.append('corporateId', String(corporate?.id || ''));
    formData.append('corporateName', corporate?.companyName || '');

    setRptUploading(true);
    try {
      const r = await api.post('/corporate-bookings/reports/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const empName = `${rptEmployee.firstName} ${rptEmployee.lastName}`;
      const uploadedCount = (r.data.reports as { reportUrl: string }[])?.length ?? 1;
      setRptSuccess({ reportName: rptName, employeeName: empName, reportUrl: r.data.report.reportUrl });
      const notif = r.data.notifications as { email: string; whatsapp: string };
      const sent = [notif.email === 'sent' && '📧 Email', notif.whatsapp === 'sent' && '📱 WhatsApp'].filter(Boolean).join(' & ');
      toast({ title: `✅ ${uploadedCount} Report${uploadedCount > 1 ? 's' : ''} Uploaded!`, description: `Sent to ${empName} via ${sent || 'system'}.` });
      // Reset form
      setRptEmployee(null); setRptEmployeeSearch('');
      setRptName(''); setRptDate(''); setRptNotes(''); setRptFiles([]);
      setRptType('annual_health_checkup');
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchReports();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Upload failed';
      toast({ variant: 'destructive', title: 'Upload Failed', description: msg });
    } finally {
      setRptUploading(false);
    }
  };

  const handleShareReport = async (reportId: number) => {
    setSharingId(reportId);
    try {
      await api.post(`/corporate-bookings/reports/${reportId}/share`, {
        sendEmail: true, sendWhatsapp: true, corporateName: corporate?.companyName || 'Corporate'
      });
      toast({ title: '📤 Notification Sent', description: 'Email & WhatsApp resent to employee.' });
      fetchReports();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Share failed';
      toast({ variant: 'destructive', title: 'Share Failed', description: msg });
    } finally {
      setSharingId(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  // ──────────────────────────────────
  // Employee auto-search
  // ──────────────────────────────────
  const handleEmployeeSearch = (val: string) => {
    setEmployeeSearch(val);
    setSelectedEmployee(null);
    setEmployeeEligibility([]);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (val.trim().length < 2) {
      setEmployeeSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setEmpLoading(true);
      try {
        const r = await api.get(`/corporate-bookings/employees?corporateId=${corporate?.id}&search=${encodeURIComponent(val)}`);
        setEmployeeSuggestions(r.data.employees || []);
        setShowSuggestions(true);
      } catch {
        setEmployeeSuggestions([]);
      } finally {
        setEmpLoading(false);
      }
    }, 350);
  };

  const selectEmployee = (emp: Employee) => {
    setSelectedEmployee(emp);
    setEmployeeSearch(`${emp.firstName} ${emp.lastName} — ${emp.email}`);
    setShowSuggestions(false);
    setTestPackage(''); // reset package selection when employee changes

    // Load this employee's plan eligibility for the assigned corporate
    if (!corporate) return;
    setEligibilityLoading(true);
    api.get(`/corporate-bookings/employee-eligibility?employeeId=${emp.id}&corporateId=${corporate.id}`)
      .then(r => setEmployeeEligibility(r.data.eligibility || []))
      .catch(e => console.error('Eligibility fetch failed:', e))
      .finally(() => setEligibilityLoading(false));
  };

  // ──────────────────────────────────
  // Lab auto-search (server-side, like employee search)
  // ──────────────────────────────────
  const handleLabSearch = (val: string) => {
    setLabSearch(val);
    setSelectedLab(null);
    if (labSearchTimerRef.current) clearTimeout(labSearchTimerRef.current);
    if (val.trim().length < 2) {
      setLabSuggestions([]);
      setShowLabSuggestions(false);
      return;
    }
    labSearchTimerRef.current = setTimeout(async () => {
      setLabsLoading(true);
      try {
        const r = await api.get(`/corporate-bookings/labs?corporateId=${corporate?.id}&search=${encodeURIComponent(val)}`);
        setLabSuggestions(r.data.labs || []);
        setShowLabSuggestions(true);
      } catch {
        setLabSuggestions([]);
      } finally {
        setLabsLoading(false);
      }
    }, 350);
  };

  const selectLab = (lab: Lab) => {
    setSelectedLab(lab);
    setLabSearch(lab.name);
    setShowLabSuggestions(false);
  };

  // ── Corporate search handler (admin only) ──
  const handleCorpSearch = (val: string) => {
    setCorpInput(val);
    const q = val.trim().toLowerCase();
    const filtered = q
      ? corporateList.filter(c => c.companyName.toLowerCase().includes(q))
      : corporateList.slice(0, 10);
    setCorpSuggestions(filtered.slice(0, 10));
    setShowCorpSuggestions(filtered.length > 0 || !q);
  };

  const handleSelectCorporate = (corp: Corporate) => {
    setCorporate(corp);
    setCorpInput('');
    setShowCorpSuggestions(false);
    // Reset downstream fields
    setSelectedEmployee(null);
    setEmployeeSearch('');
    setEmployeeEligibility([]);
    setTestPackage('');
    setSelectedLab(null);
    setLabSearch('');
    setShowLabSuggestions(false);
    setLabSuggestions([]);
    setPackages([]);
    loadForCorporate(corp.id);
    setView('booking');
  };

  const handleChangeCorporate = () => {
    setCorporate(null);
    setCorpInput('');
    setCorpSuggestions(corporateList.slice(0, 10));
    setShowCorpSuggestions(false);
    setLabSuggestions([]);
    setPackages([]);
    setSelectedLab(null);
    setLabSearch('');
    setShowLabSuggestions(false);
    setTestPackage('');
    setSelectedEmployee(null);
    setEmployeeSearch('');
    setEmployeeEligibility([]);
    setView('pick-corporate');
  };

  // ──────────────────────────────────
  // Submit booking
  // ──────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!corporate) {
      toast({ variant: 'destructive', title: 'Corporate required', description: 'Please select a corporate first.' });
      return;
    }
    if (!selectedEmployee) {
      toast({ variant: 'destructive', title: 'Employee required', description: `Please search and select a ${corporate.companyName} employee.` });
      return;
    }
    if (!selectedLab) {
      toast({ variant: 'destructive', title: 'Lab required', description: 'Please search and select a lab.' });
      return;
    }
    if (!checkupDate) {
      toast({ variant: 'destructive', title: 'Date required', description: 'Please pick a checkup date.' });
      return;
    }
    if (!testPackage) {
      toast({ variant: 'destructive', title: 'Package required', description: 'Please select a health checkup package.' });
      return;
    }

    const labAddress = [labStreet(selectedLab), selectedLab.city, selectedLab.state, selectedLab.pinCode].filter(Boolean).join(', ');

    setSubmitting(true);
    try {
      const r = await api.post('/corporate-bookings/health-checkup', {
        employeeId: selectedEmployee.id,
        labId: selectedLab.id,
        labName: selectedLab.name,
        labAddress,
        checkupDate,
        checkupTime,
        testPackage,
        notes,
        corporateId: corporate?.id,
        corporateName: corporate?.companyName || 'Corporate',
        sendEmail,
        sendWhatsapp
      });

      setSuccessBooking(r.data.booking as Record<string, unknown>);
      const notifications = r.data.notifications as { email?: string; whatsapp?: string };
      const sentChannels = [
        notifications?.email === 'sent' && '📧 Email',
        notifications?.whatsapp === 'sent' && '📱 WhatsApp',
      ].filter(Boolean).join(' & ');

      toast({
        title: '✅ Booking Confirmed!',
        description: sentChannels
          ? `Health checkup booked for ${selectedEmployee.firstName}. Notified via: ${sentChannels}.`
          : `Health checkup booked for ${selectedEmployee.firstName}. No notifications sent.`,
      });

      // reset form
      setSelectedEmployee(null);
      setEmployeeSearch('');
      setEmployeeEligibility([]);
      setSelectedLab(null);
      setLabSearch('');
      setShowLabSuggestions(false);
      setCheckupDate('');
      setCheckupTime('');
      setTestPackage('');
      setNotes('');
    } catch (err: unknown) {
      const errMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to create booking';
      toast({ variant: 'destructive', title: 'Booking Failed', description: errMsg });
    } finally {
      setSubmitting(false);
    }
  };

  // ──────────────────────────────────
  // Helpers
  // ──────────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* ══════════════════════════════════════════════════
            VIEW 1 — CORPORATE PICKER
            Shown until the user picks a corporate
            ══════════════════════════════════════════════════ */}
        {view === 'pick-corporate' && (
          <div>
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
              <Link to="/team/corporate-management" className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-lg">
                  <FlaskConical className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Corporate Health Checkup Booking</h1>
                  <p className="text-muted-foreground text-sm">Select a corporate to start booking</p>
                </div>
              </div>
            </div>

            {corporateListLoading ? (
              <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p className="text-sm">Loading your corporates…</p>
              </div>
            ) : corporateList.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
                <Building2 className="h-12 w-12 text-muted-foreground/30" />
                <p className="font-medium">No corporates assigned</p>
                <p className="text-sm text-center max-w-xs">No corporates are linked to your account. Contact an administrator to get access.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {corporateList.map(corp => (
                  <button
                    key={corp.id}
                    type="button"
                    onClick={() => handleSelectCorporate(corp)}
                    className="group text-left p-6 rounded-xl border-2 border-border hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-all shadow-sm hover:shadow-md"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0 group-hover:bg-blue-200 dark:group-hover:bg-blue-800 transition-colors">
                        <Building2 className="h-6 w-6 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-base leading-tight">{corp.companyName}</p>
                        {corp.employeeCount != null && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Users className="h-3 w-3" /> {corp.employeeCount} employees
                          </p>
                        )}
                        {corp.status && (
                          <span className={`inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${corp.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {corp.status}
                          </span>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-blue-600 shrink-0 mt-1 transition-colors" />
                    </div>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-4 font-medium group-hover:underline">
                      Book health checkups →
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            VIEW 2 — BOOKING FORM
            Shown after a corporate is selected
            ══════════════════════════════════════════════════ */}
        {view === 'booking' && corporate && (
          <div>
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
              {corporateList.length > 1 ? (
                <button
                  type="button"
                  onClick={handleChangeCorporate}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              ) : (
                <Link to="/team/corporate-management" className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-600 rounded-lg">
                    <FlaskConical className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold">Corporate Health Checkup Booking</h1>
                    <p className="text-muted-foreground text-sm flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      {corporate.companyName}
                      {corporateList.length > 1 && (
                        <button
                          type="button"
                          onClick={handleChangeCorporate}
                          className="ml-2 text-blue-600 hover:underline text-xs"
                        >
                          (change)
                        </button>
                      )}
                    </p>
                  </div>
                </div>
              </div>
              <Badge className="bg-blue-100 text-blue-800 border-blue-200 hidden sm:flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {corporate.companyName}
              </Badge>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b">
              <button
                className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'book' ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                onClick={() => setActiveTab('book')}
              >
                <span className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Book Checkup</span>
              </button>
              <button
                className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'history' ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                onClick={() => setActiveTab('history')}
              >
                <span className="flex items-center gap-2"><History className="h-4 w-4" /> Booking History</span>
              </button>
              <button
                className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'reports' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                onClick={() => setActiveTab('reports')}
              >
                <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> Health Reports</span>
              </button>
            </div>

        {/* ╔════════════════════════════════╗
            ║      BOOKING FORM TAB          ║
            ╚════════════════════════════════╝ */}
        {activeTab === 'book' && (
          <div className="space-y-6">
            {/* Success card */}
            {successBooking && (
              <Card className="border-green-300 bg-green-50 dark:bg-green-950/20">
                <CardContent className="pt-5">
                  <div className="flex gap-3">
                    <CheckCircle className="h-6 w-6 text-green-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-green-800 dark:text-green-300">Booking Confirmed!</p>
                      <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                        Health checkup for <strong>{(successBooking.employee as { name: string })?.name}</strong> has been booked at&nbsp;
                        <strong>{(successBooking.lab as { name: string })?.name}</strong> on&nbsp;
                        <strong>{successBooking.checkupDate as string}</strong>.
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-500 mt-1 font-mono">
                        Ref: {successBooking.orderNumber as string}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                        Employee notified via Email &amp; WhatsApp ✉️📱
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 text-green-700 border-green-300"
                        onClick={() => setSuccessBooking(null)}
                      >
                        Book Another
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">

              {/* ──── Step 1: Select Employee ──── */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                    Select {corporate?.companyName || 'Corporate'} Employee
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name, email or phone..."
                        value={employeeSearch}
                        onChange={e => handleEmployeeSearch(e.target.value)}
                        onFocus={() => employeeSuggestions.length > 0 && setShowSuggestions(true)}
                        className="pl-9"
                        autoComplete="off"
                      />
                      {empLoading && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground animate-spin" />}
                    </div>

                    {/* Suggestions dropdown */}
                    {showSuggestions && employeeSuggestions.length > 0 && (
                      <div className="absolute z-50 w-full bg-background border rounded-lg shadow-lg mt-1 max-h-56 overflow-y-auto">
                        {employeeSuggestions.map(emp => (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => selectEmployee(emp)}
                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-accent text-left transition-colors"
                          >
                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
                              <User className="h-4 w-4 text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm">{emp.firstName} {emp.lastName}</p>
                              <p className="text-xs text-muted-foreground truncate">{emp.email}</p>
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0">{emp.phoneNumber}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {showSuggestions && employeeSuggestions.length === 0 && !empLoading && employeeSearch.length >= 2 && (
                      <div className="absolute z-50 w-full bg-background border rounded-lg shadow mt-1 px-4 py-3">
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" /> No employees found for "{employeeSearch}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Selected employee card */}
                  {selectedEmployee && (
                    <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                          {selectedEmployee.firstName[0]}{selectedEmployee.lastName[0] || ''}
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-sm">{selectedEmployee.firstName} {selectedEmployee.lastName}</p>
                          <p className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                            <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{selectedEmployee.email}</span>
                            <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{selectedEmployee.phoneNumber}</span>
                          </p>
                        </div>
                        <Badge className="shrink-0 bg-blue-100 text-blue-700 border-blue-200 text-xs">Selected ✓</Badge>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ──── Step 2: Select Lab ──── */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full text-white text-xs flex items-center justify-center font-bold ${selectedLab ? 'bg-green-500' : 'bg-blue-600'}`}>2</span>
                    Select Lab
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search lab by name, city or state..."
                        value={labSearch}
                        onChange={e => handleLabSearch(e.target.value)}
                        onFocus={() => labSuggestions.length > 0 && setShowLabSuggestions(true)}
                        className="pl-9"
                        autoComplete="off"
                      />
                      {labsLoading && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground animate-spin" />}
                    </div>

                    {/* Suggestions dropdown */}
                    {showLabSuggestions && labSuggestions.length > 0 && (
                      <div className="absolute z-50 w-full bg-background border rounded-lg shadow-lg mt-1 max-h-56 overflow-y-auto">
                        {labSuggestions.map(lab => (
                          <button
                            key={lab.id}
                            type="button"
                            onClick={() => selectLab(lab)}
                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-accent text-left transition-colors"
                          >
                            <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0">
                              <FlaskConical className="h-4 w-4 text-purple-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm">{lab.name}</p>
                              {(lab.city || labStreet(lab)) && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {[labStreet(lab), lab.city, lab.state].filter(Boolean).join(', ')}
                                </p>
                              )}
                            </div>
                            {lab.accreditation && (
                              <span className="text-xs text-muted-foreground shrink-0">{lab.accreditation}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {showLabSuggestions && labSuggestions.length === 0 && !labsLoading && labSearch.length >= 2 && (
                      <div className="absolute z-50 w-full bg-background border rounded-lg shadow mt-1 px-4 py-3">
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" /> No labs found for "{labSearch}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Selected lab confirmation card */}
                  {selectedLab && (
                    <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-purple-600 flex items-center justify-center text-white shrink-0">
                        <FlaskConical className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{selectedLab.name}</p>
                        {(selectedLab.city || labStreet(selectedLab)) && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {[labStreet(selectedLab), selectedLab.city, selectedLab.state, selectedLab.pinCode].filter(Boolean).join(', ')}
                          </p>
                        )}
                      </div>
                      <Badge className="shrink-0 bg-purple-100 text-purple-700 border-purple-200 text-xs">Selected ✓</Badge>
                      <button
                        type="button"
                        onClick={() => { setSelectedLab(null); setLabSearch(''); }}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ──── Step 3: Date & Time ──── */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">3</span>
                    Appointment Date &amp; Time
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> Date
                      </label>
                      <Input
                        type="date"
                        min={todayStr}
                        value={checkupDate}
                        onChange={e => setCheckupDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Time Slot
                      </label>
                      <Select value={checkupTime} onValueChange={setCheckupTime}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a time slot..." />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_SLOTS.map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ──── Step 4: Health Package ──── */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">4</span>
                    Health Checkup Package
                    {selectedEmployee && (
                      <span className="ml-auto text-xs font-normal text-muted-foreground">
                        {eligibilityLoading ? 'Checking eligibility…' :
                          employeeEligibility.length > 0
                            ? `${employeeEligibility.filter(e => e.available).length} of ${employeeEligibility.length} benefit(s) available`
                            : 'No plans assigned — showing all packages'}
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {packagesLoading || eligibilityLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {eligibilityLoading ? 'Checking plan eligibility for this employee…' : 'Loading packages from corporate plan…'}
                    </div>
                  ) : (() => {
                    // Compute display list: employee eligibility > corporate packages > empty
                    const displayList = selectedEmployee && employeeEligibility.length > 0
                      ? [
                          ...employeeEligibility.map(ep => ({
                            value:           ep.packageName,
                            label:           `🏥 ${ep.packageName}`,
                            desc:            ep.tests.length > 0
                              ? ep.tests.slice(0, 5).join(' · ') + (ep.tests.length > 5 ? ` +${ep.tests.length - 5} more tests` : '')
                              : ep.description || '',
                            isCorporatePlan: true,
                            available:       ep.available,
                            usedAt:          ep.usedAt,
                            validTo:         ep.validTo,
                          })),
                          { value: 'Custom / Other', label: '✏️ Custom / Other', desc: 'Specify tests in notes below', isCorporatePlan: false, available: true, usedAt: null as string | null, validTo: null as string | null },
                        ]
                      : packages.length > 0
                        ? [
                            ...packages.map(p => ({
                              value:           p.name,
                              label:           `🏥 ${p.name}`,
                              desc:            Array.isArray(p.features) && p.features.length > 0
                                ? p.features.slice(0, 5).join(' · ') + (p.features.length > 5 ? ` +${p.features.length - 5} more` : '')
                                : p.description || '',
                              isCorporatePlan: true,
                              available:       true,
                              usedAt:          null as string | null,
                              validTo:         null as string | null,
                            })),
                            { value: 'Custom / Other', label: '✏️ Custom / Other', desc: 'Specify tests in notes below', isCorporatePlan: false, available: true, usedAt: null as string | null, validTo: null as string | null },
                          ]
                        : [];

                    if (displayList.length === 0) {
                      return (
                        <p className="text-sm text-muted-foreground py-3 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-orange-400" />
                          No packages configured for {corporate?.companyName || 'this corporate'}.
                          {selectedEmployee && ' Try selecting a different employee or contact an administrator.'}
                        </p>
                      );
                    }

                    return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {displayList.map(pkg => (
                        <button
                          key={pkg.value}
                          type="button"
                          onClick={() => setTestPackage(pkg.value)}
                          className={`text-left p-3 rounded-lg border-2 transition-colors ${
                            testPackage === pkg.value
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
                              : 'border-border hover:border-blue-300 hover:bg-accent/50'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            {pkg.isCorporatePlan && (
                              <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded">Corporate Plan</span>
                            )}
                            {pkg.usedAt ? (
                              <span className="text-[10px] font-semibold text-orange-600 bg-orange-100 dark:bg-orange-900/40 px-1.5 py-0.5 rounded">⚠️ Benefit Used</span>
                            ) : pkg.isCorporatePlan ? (
                              <span className="text-[10px] font-semibold text-green-600 bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded">✅ Available</span>
                            ) : null}
                          </div>
                          <p className="text-sm font-medium">{pkg.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{pkg.desc}</p>
                          {pkg.validTo && (
                            <p className="text-[10px] text-muted-foreground mt-1">Valid until {new Date(pkg.validTo).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                          )}
                        </button>
                      ))}
                    </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* ──── Step 5: Notes ──── */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-gray-400 text-white text-xs flex items-center justify-center font-bold">5</span>
                    Additional Notes <span className="text-muted-foreground font-normal text-sm">(optional)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Special instructions, employee health conditions, preferred doctor, custom test list..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                </CardContent>
              </Card>

              {/* ──── Notification toggles ──── */}
              <div className="p-4 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 rounded-lg space-y-3">
                <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Employee Notifications
                </p>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                    <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
                    <Mail className="h-4 w-4 text-muted-foreground" /> Send Email
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                    <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={sendWhatsapp} onChange={e => setSendWhatsapp(e.target.checked)} />
                    <MessageSquare className="h-4 w-4 text-muted-foreground" /> Send WhatsApp
                  </label>
                </div>
                {!sendEmail && !sendWhatsapp && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Employee will not be notified about this booking.
                  </p>
                )}
              </div>

              {/* ──── Submit ──── */}
              <Button
                type="submit"
                size="lg"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-6 text-base"
                disabled={submitting}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" /> {sendEmail || sendWhatsapp ? 'Booking & Notifying Employee...' : 'Booking Health Checkup...'}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5" /> {sendEmail || sendWhatsapp ? 'Book Health Checkup & Notify Employee' : 'Book Health Checkup'}
                  </span>
                )}
              </Button>
            </form>
          </div>
        )}

        {/* ╔════════════════════════════════╗
            ║      HISTORY TAB               ║
            ╚════════════════════════════════╝ */}
        {activeTab === 'history' && (
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" /> Past Corporate Health Checkup Bookings
                <Badge variant="secondary">{historyTotal} total</Badge>
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={fetchHistory}
                disabled={historyLoading}
              >
                {historyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
              </Button>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No bookings yet. Book your first health checkup above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map(booking => (
                    <div
                      key={booking.id}
                      className="flex items-start gap-3 p-4 bg-accent/30 rounded-lg border"
                    >
                      <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
                        <User className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">
                            {booking.firstName} {booking.lastName}
                          </p>
                          <Badge className={`text-xs ${STATUS_COLORS[booking.status] || 'bg-gray-100 text-gray-700'}`}>
                            {booking.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{booking.email}</p>
                        <p className="text-sm mt-1">{booking.test_type}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{booking.order_number}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">
                          {new Date(booking.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(booking.created_at).toLocaleTimeString('en-IN', {
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                  {historyTotal > history.length && (
                    <p className="text-center text-sm text-muted-foreground pt-2">
                      Showing {history.length} of {historyTotal} bookings
                      <ChevronRight className="inline h-4 w-4 ml-1" />
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ╔════════════════════════════════╗
            ║      HEALTH REPORTS TAB        ║
            ╚════════════════════════════════╝ */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            {/* Upload success */}
            {rptSuccess && (
              <Card className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20">
                <CardContent className="pt-5">
                  <div className="flex gap-3">
                    <CheckCircle className="h-6 w-6 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-emerald-800 dark:text-emerald-300">Report Uploaded &amp; Shared!</p>
                      <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-1">
                        <strong>{rptSuccess.reportName}</strong> uploaded for <strong>{rptSuccess.employeeName}</strong>. Employee notified via Email &amp; WhatsApp.
                      </p>
                      <div className="flex gap-2 mt-3 flex-wrap">
                        <a href={rptSuccess.reportUrl} target="_blank" rel="noreferrer"
                          className="text-emerald-700 border border-emerald-300 bg-white rounded-md px-3 py-1.5 text-xs font-medium hover:bg-emerald-50 flex items-center gap-1">
                          <Download className="h-3 w-3" /> View Report
                        </a>
                        <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-300 text-xs" onClick={() => setRptSuccess(null)}>
                          Upload Another
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ──── Upload Form ──── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="h-4 w-4 text-emerald-600" />
                  Upload Health Report for Employee
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleReportUpload} className="space-y-4">
                  {/* Employee search */}
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Employee</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search employee by name, email or phone..."
                        value={rptEmployeeSearch}
                        onChange={e => handleRptEmpSearch(e.target.value)}
                        onFocus={() => rptEmpSuggestions.length > 0 && setShowRptSuggestions(true)}
                        className="pl-9"
                        autoComplete="off"
                      />
                      {rptEmpLoading && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                    {showRptSuggestions && rptEmpSuggestions.length > 0 && (
                      <div className="relative z-50">
                        <div className="absolute w-full bg-background border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                          {rptEmpSuggestions.map(emp => (
                            <button key={emp.id} type="button" onClick={() => selectRptEmployee(emp)}
                              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-accent text-left transition-colors">
                              <User className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm">{emp.firstName} {emp.lastName}</p>
                                <p className="text-xs text-muted-foreground truncate">{emp.email} · {emp.phoneNumber}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {rptEmployee && (
                      <div className="mt-2 flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 rounded-lg px-3 py-2">
                        <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {rptEmployee.firstName[0]}
                        </div>
                        <div className="flex-1 text-sm">
                          <span className="font-medium">{rptEmployee.firstName} {rptEmployee.lastName}</span>
                          <span className="text-muted-foreground ml-2 text-xs">{rptEmployee.email}</span>
                        </div>
                        <button type="button" onClick={() => { setRptEmployee(null); setRptEmployeeSearch(''); }}>
                          <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Report name */}
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Report Name</label>
                      <Input placeholder="e.g. Annual Checkup — Feb 2026" value={rptName} onChange={e => setRptName(e.target.value)} />
                    </div>
                    {/* Report type */}
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Report Type</label>
                      <Select value={rptType} onValueChange={setRptType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-60">
                          {REPORT_TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Report date */}
                    <div>
                      <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> Report Date
                      </label>
                      <Input type="date" value={rptDate} onChange={e => setRptDate(e.target.value)} max={todayStr} />
                    </div>
                    {/* File picker — multiple */}
                    <div className="sm:col-span-2">
                      <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Files (PDF / Image)
                      </label>
                      {/* Drop zone */}
                      <div
                        className="border-2 border-dashed border-border rounded-lg p-3 cursor-pointer hover:border-emerald-400 transition-colors text-center"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                        <p className="text-xs text-muted-foreground">
                          Click to select files — PDF, JPG, PNG (max 25 MB each, up to 10 files)
                        </p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                          className="hidden"
                          multiple
                          onChange={e => {
                            const picked = Array.from(e.target.files || []);
                            setRptFiles(prev => {
                              const existing = new Set(prev.map(f => f.name + f.size));
                              const fresh = picked.filter(f => !existing.has(f.name + f.size));
                              return [...prev, ...fresh].slice(0, 10);
                            });
                            // reset input so the same file can be re-added after removal
                            e.target.value = '';
                          }}
                        />
                      </div>
                      {/* Selected files list */}
                      {rptFiles.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {rptFiles.map((f, i) => (
                            <div key={i} className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 rounded-lg px-3 py-1.5">
                              <FileText className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              <span className="text-sm font-medium text-emerald-700 flex-1 truncate">{f.name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">({formatFileSize(f.size)})</span>
                              <button
                                type="button"
                                onClick={() => setRptFiles(prev => prev.filter((_, idx) => idx !== i))}
                                className="shrink-0"
                              >
                                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                              </button>
                            </div>
                          ))}
                          <p className="text-xs text-muted-foreground pl-1">{rptFiles.length} file{rptFiles.length > 1 ? 's' : ''} selected — click the drop zone to add more</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <Textarea placeholder="Any remarks about this report..." value={rptNotes} onChange={e => setRptNotes(e.target.value)} rows={2} className="resize-none" />
                  </div>

                  {/* Notification toggles */}
                  <div className="flex gap-6 py-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                      <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={rptSendEmail} onChange={e => setRptSendEmail(e.target.checked)} />
                      <Mail className="h-4 w-4 text-muted-foreground" /> Notify via Email
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                      <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={rptSendWA} onChange={e => setRptSendWA(e.target.checked)} />
                      <MessageSquare className="h-4 w-4 text-muted-foreground" /> Notify via WhatsApp
                    </label>
                  </div>

                  <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold" disabled={rptUploading}>
                    {rptUploading ? (
                      <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Uploading &amp; Notifying...</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        Upload {rptFiles.length > 1 ? `${rptFiles.length} Reports` : 'Report'} &amp; Notify Employee
                      </span>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* ──── Reports list ──── */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-emerald-600" />
                  Uploaded Reports
                  <Badge variant="secondary">{reportsTotal} total</Badge>
                </CardTitle>
                <div className="flex gap-2 items-center">
                  <Input
                    placeholder="Filter by employee ID..."
                    value={reportFilterEmployee}
                    onChange={e => {
                      setReportFilterEmployee(e.target.value);
                      fetchReports(e.target.value || undefined);
                    }}
                    className="h-8 w-44 text-xs"
                  />
                  <Button size="sm" variant="outline" onClick={() => fetchReports()} disabled={reportsLoading}>
                    {reportsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {reportsLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : reports.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No reports uploaded yet. Use the form above to upload the first one.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reports.map(rpt => (
                      <div key={rpt.id} className="flex items-start gap-3 p-4 bg-accent/30 rounded-lg border">
                        <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center shrink-0 mt-0.5">
                          <FileText className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm">{rpt.report_name}</p>
                            <Badge variant="outline" className="text-xs">{REPORT_TYPES.find(t => t.value === rpt.report_type)?.label || rpt.report_type}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            <User className="inline h-3 w-3 mr-1" />{rpt.firstName} {rpt.lastName}
                            <span className="mx-2">·</span>
                            <Mail className="inline h-3 w-3 mr-1" />{rpt.email}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            📅 {new Date(rpt.report_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {rpt.file_size_bytes && <span className="ml-2">· {formatFileSize(rpt.file_size_bytes)}</span>}
                          </p>
                          {/* Notification badges */}
                          <div className="flex gap-1.5 mt-1.5 flex-wrap">
                            <Badge className={`text-xs ${rpt.notified_email ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                              {rpt.notified_email ? '✉️ Email Sent' : '✉️ Email Pending'}
                            </Badge>
                            <Badge className={`text-xs ${rpt.notified_whatsapp ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {rpt.notified_whatsapp ? '📱 WA Sent' : '📱 WA Pending'}
                            </Badge>
                          </div>
                        </div>
                        {/* Actions */}
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <a href={rpt.report_url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1.5 text-xs bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 rounded-md px-2.5 py-1.5 hover:bg-emerald-100 transition-colors">
                            <Download className="h-3.5 w-3.5" /> View
                          </a>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs flex items-center gap-1.5"
                            disabled={sharingId === rpt.id}
                            onClick={() => handleShareReport(rpt.id)}
                          >
                            {sharingId === rpt.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Share2 className="h-3 w-3" />}
                            Resend
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
