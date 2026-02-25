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
  AlertCircle, Loader2, History, ChevronRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '@/utils/api';

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
  address?: string;
  city?: string;
  state?: string;
  pinCode?: string;
}

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

// ──────────────────────────────────────────────────────────
// Health packages for Equitas employees
// ──────────────────────────────────────────────────────────

const HEALTH_PACKAGES = [
  { value: 'Annual Health Checkup (Basic)', label: '🔬 Annual Health Checkup — Basic', desc: 'CBC, Blood Sugar, Lipid, LFT, KFT' },
  { value: 'Annual Health Checkup (Comprehensive)', label: '🏥 Annual Health Checkup — Comprehensive', desc: 'Basic + ECG, Thyroid, Vitamin D, B12, Urine' },
  { value: 'CBC + LFT + KFT (Basic Blood Panel)', label: '🩸 Basic Blood Panel', desc: 'CBC, Liver Function, Kidney Function' },
  { value: 'Diabetic Screening', label: '🍬 Diabetic Screening', desc: 'HbA1c, Fasting Glucose, Post-Prandial Glucose' },
  { value: 'Cardiac Risk Assessment', label: '❤️ Cardiac Risk Assessment', desc: 'Lipid Profile, ECG, Troponin, CRP' },
  { value: 'Thyroid & Hormone Panel', label: '🦋 Thyroid & Hormone Panel', desc: 'TSH, T3, T4, Cortisol' },
  { value: 'Womens Health Checkup', label: '👩 Women\'s Health Checkup', desc: 'CBC, Thyroid, Vitamin D, Iron, Hormonal panel' },
  { value: 'Executive Health Checkup', label: '💼 Executive Health Checkup', desc: 'Full body checkup with specialist consultation' },
  { value: 'Pre-Employment Medical', label: '📋 Pre-Employment Medical', desc: 'Standard pre-employment fitness assessment' },
  { value: 'Custom / Other', label: '✏️ Custom / Other', desc: 'Specify tests in notes below' },
];

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
  const [activeTab, setActiveTab] = useState<'book' | 'history'>('book');

  // ── employee search ──
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeSuggestions, setEmployeeSuggestions] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [empLoading, setEmpLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── labs ──
  const [labs, setLabs] = useState<Lab[]>([]);
  const [selectedLabId, setSelectedLabId] = useState('');
  const [labsLoading, setLabsLoading] = useState(false);

  // ── form fields ──
  const [checkupDate, setCheckupDate] = useState('');
  const [checkupTime, setCheckupTime] = useState('');
  const [testPackage, setTestPackage] = useState('');
  const [notes, setNotes] = useState('');

  // ── submission ──
  const [submitting, setSubmitting] = useState(false);
  const [successBooking, setSuccessBooking] = useState<Record<string, unknown> | null>(null);

  // ── history ──
  const [history, setHistory] = useState<BookingHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);

  // ──────────────────────────────────
  // Load labs on mount
  // ──────────────────────────────────
  useEffect(() => {
    setLabsLoading(true);
    api.get('/corporate-bookings/labs?corporateId=5')
      .then(r => setLabs(r.data.labs || []))
      .catch(e => console.error('Labs fetch failed:', e))
      .finally(() => setLabsLoading(false));
  }, []);

  // ──────────────────────────────────
  // Load history when tab switches
  // ──────────────────────────────────
  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const r = await api.get('/corporate-bookings/history?corporateId=5&limit=50');
      setHistory(r.data.bookings || []);
      setHistoryTotal(r.data.total || 0);
    } catch (e) {
      console.error('History fetch failed:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  // ──────────────────────────────────
  // Employee auto-search
  // ──────────────────────────────────
  const handleEmployeeSearch = (val: string) => {
    setEmployeeSearch(val);
    setSelectedEmployee(null);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (val.trim().length < 2) {
      setEmployeeSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setEmpLoading(true);
      try {
        const r = await api.get(`/corporate-bookings/employees?corporateId=5&search=${encodeURIComponent(val)}`);
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
  };

  // ──────────────────────────────────
  // Submit booking
  // ──────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedEmployee) {
      toast({ variant: 'destructive', title: 'Employee required', description: 'Please search and select an Equitas employee.' });
      return;
    }
    if (!selectedLabId) {
      toast({ variant: 'destructive', title: 'Lab required', description: 'Please select a lab.' });
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

    const lab = labs.find(l => String(l.id) === String(selectedLabId));
    const labAddress = [lab?.address, lab?.city, lab?.state, lab?.pinCode].filter(Boolean).join(', ');

    setSubmitting(true);
    try {
      const r = await api.post('/corporate-bookings/health-checkup', {
        employeeId: selectedEmployee.id,
        labId: parseInt(selectedLabId),
        labName: lab?.name || '',
        labAddress,
        checkupDate,
        checkupTime,
        testPackage,
        notes,
        corporateId: 5,
        corporateName: 'Equitas Bank Ltd'
      });

      setSuccessBooking(r.data.booking as Record<string, unknown>);
      const notifications = r.data.notifications as { email?: string; whatsapp?: string };
      const sentChannels = [
        notifications?.email === 'sent' && '📧 Email',
        notifications?.whatsapp === 'sent' && '📱 WhatsApp',
      ].filter(Boolean).join(' & ');

      toast({
        title: '✅ Booking Confirmed!',
        description: `Health checkup booked for ${selectedEmployee.firstName}. Notified via: ${sentChannels || 'Email attempted'}.`,
      });

      // reset form
      setSelectedEmployee(null);
      setEmployeeSearch('');
      setSelectedLabId('');
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
        {/* ── Header ── */}
        <div className="flex items-center gap-4 mb-6">
          <Link to="/team/corporate-management" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <FlaskConical className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Corporate Health Checkup Booking</h1>
                <p className="text-muted-foreground text-sm">Book health checkups for Equitas Bank employees &amp; notify them instantly</p>
              </div>
            </div>
          </div>
          <Badge className="bg-blue-100 text-blue-800 border-blue-200 hidden sm:flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" />
            Equitas Bank Ltd
          </Badge>
        </div>

        {/* ── Tabs ── */}
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
                    Select Equitas Employee
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
                          <AlertCircle className="h-4 w-4" /> No Equitas employees found for "{employeeSearch}"
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
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                    Select Lab
                    {labsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />}
                    {!labsLoading && <Badge variant="secondary" className="ml-auto text-xs">{labs.length} in Equitas network</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={selectedLabId} onValueChange={setSelectedLabId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a lab from Equitas network..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {labs.map(lab => (
                        <SelectItem key={lab.id} value={String(lab.id)}>
                          <div className="flex flex-col">
                            <span className="font-medium">{lab.name}</span>
                            {(lab.city || lab.state) && (
                              <span className="text-xs text-muted-foreground">
                                {[lab.address, lab.city, lab.state].filter(Boolean).join(', ')}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {HEALTH_PACKAGES.map(pkg => (
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
                        <p className="text-sm font-medium">{pkg.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{pkg.desc}</p>
                      </button>
                    ))}
                  </div>
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

              {/* ──── Notification info banner ──── */}
              <div className="flex gap-3 items-start p-4 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 rounded-lg">
                <div className="flex gap-2 shrink-0 mt-0.5">
                  <Mail className="h-4 w-4 text-indigo-600" />
                  <MessageSquare className="h-4 w-4 text-indigo-600" />
                </div>
                <p className="text-sm text-indigo-700 dark:text-indigo-300">
                  On submission, the employee will <strong>automatically receive</strong> a booking confirmation via <strong>Email</strong> and <strong>WhatsApp</strong> with lab details, date, time, and instructions.
                </p>
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
                    <Loader2 className="h-5 w-5 animate-spin" /> Booking &amp; Notifying Employee...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5" /> Book Health Checkup &amp; Notify Employee
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
      </div>
    </MainLayout>
  );
}
