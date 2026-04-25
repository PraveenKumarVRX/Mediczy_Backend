import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, MapPin, Search, Filter, CheckCircle, XCircle, AlertCircle, Users, RefreshCw, CalendarCheck, RotateCcw, Stethoscope, Building2, FlaskConical, Microscope, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';

interface Appointment {
  id: string;
  employeeName: string;
  employeeId: string;
  department: string;
  appointmentType: string;
  doctorName: string;
  facility: string;
  date: string;
  time: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no-show';
  notes?: string;
}

interface EmployeeOption {
  id: string;
  name: string;
  department: string;
  businessUnit?: string;
  location?: string;
}

const sampleEmployees: EmployeeOption[] = [
  { id: 'EMP001', name: 'John Smith',    department: 'Engineering', businessUnit: 'Digital Business',   location: 'Mumbai' },
  { id: 'EMP002', name: 'Emily Davis',   department: 'Marketing',   businessUnit: 'North Region',        location: 'Delhi' },
  { id: 'EMP003', name: 'Robert Wilson', department: 'Finance',     businessUnit: 'Corporate Services',  location: 'Bengaluru' },
  { id: 'EMP004', name: 'Maria Garcia',  department: 'HR',          businessUnit: 'Corporate Services',  location: 'Mumbai' },
  { id: 'EMP005', name: 'David Lee',     department: 'Operations',  businessUnit: 'South Region',        location: 'Chennai' },
];

// ── Appointment type catalogue ────────────────────────────────────────────
type ProviderApiType = 'doctor' | 'hospital' | 'lab' | 'clinic';

interface ProviderResult {
  id: string;
  name: string;
  sub: string;      // speciality / sub-type
  city: string;
  providerType: ProviderApiType;
}

const APPOINTMENT_TYPES: { value: string; label: string; apiType: ProviderApiType; clinicHint?: string }[] = [
  { value: 'Doctor Consultation',           label: 'Doctor Consultation',           apiType: 'doctor' },
  { value: 'Doctor Tele Consultation',      label: 'Doctor Tele Consultation',      apiType: 'doctor' },
  { value: 'Pre Employment Health Check Up',label: 'Pre Employment Health Check Up',apiType: 'hospital' },
  { value: 'Annual Health Checkup',         label: 'Annual Health Checkup',         apiType: 'hospital' },
  { value: 'Dental Checkup',               label: 'Dental Checkup',               apiType: 'clinic', clinicHint: 'dental' },
  { value: 'Eye Examination',              label: 'Eye Examination',              apiType: 'clinic', clinicHint: 'polyclinic' },
  { value: 'Mental Health Consultation',   label: 'Mental Health Consultation',   apiType: 'clinic', clinicHint: 'polyclinic' },
  { value: 'Vaccination',                  label: 'Vaccination',                  apiType: 'clinic' },
  { value: 'Physiotherapy',               label: 'Physiotherapy',               apiType: 'clinic', clinicHint: 'polyclinic' },
  { value: 'Specialist Referral',          label: 'Specialist Referral',          apiType: 'doctor' },
  { value: 'Blood Test',                   label: 'Blood Test / Lab Work',        apiType: 'lab' },
];

const PROVIDER_META: Record<ProviderApiType, { label: string; color: string; Icon: React.ElementType }> = {
  doctor:   { label: 'Doctor',   color: 'text-blue-400 bg-blue-500/15',       Icon: Stethoscope },
  hospital: { label: 'Hospital', color: 'text-emerald-400 bg-emerald-500/15', Icon: Building2 },
  lab:      { label: 'Lab',      color: 'text-amber-400 bg-amber-500/15',     Icon: FlaskConical },
  clinic:   { label: 'Clinic',   color: 'text-rose-400 bg-rose-500/15',       Icon: Microscope },
};

const sampleAppointments: Appointment[] = [
  {
    id: 'APT001',
    employeeName: 'John Smith',
    employeeId: 'EMP001',
    department: 'Engineering',
    appointmentType: 'Annual Health Checkup',
    doctorName: 'Dr. Sarah Johnson',
    facility: 'City Medical Center',
    date: '2024-01-15',
    time: '10:00 AM',
    status: 'scheduled',
    notes: 'Regular annual checkup as per company policy'
  },
  {
    id: 'APT002',
    employeeName: 'Emily Davis',
    employeeId: 'EMP002',
    department: 'Marketing',
    appointmentType: 'Dental Checkup',
    doctorName: 'Dr. Michael Brown',
    facility: 'Dental Care Plus',
    date: '2024-01-14',
    time: '02:30 PM',
    status: 'completed',
    notes: 'Completed without issues'
  },
  {
    id: 'APT003',
    employeeName: 'Robert Wilson',
    employeeId: 'EMP003',
    department: 'Finance',
    appointmentType: 'Eye Examination',
    doctorName: 'Dr. Lisa Anderson',
    facility: 'Vision Care Clinic',
    date: '2024-01-13',
    time: '11:00 AM',
    status: 'cancelled',
    notes: 'Employee requested cancellation'
  },
  {
    id: 'APT004',
    employeeName: 'Maria Garcia',
    employeeId: 'EMP004',
    department: 'HR',
    appointmentType: 'Mental Health Consultation',
    doctorName: 'Dr. James Taylor',
    facility: 'Wellness Counseling Center',
    date: '2024-01-16',
    time: '03:00 PM',
    status: 'scheduled',
    notes: 'Confidential session'
  },
  {
    id: 'APT005',
    employeeName: 'David Lee',
    employeeId: 'EMP005',
    department: 'Operations',
    appointmentType: 'Vaccination',
    doctorName: 'Dr. Patricia White',
    facility: 'City Medical Center',
    date: '2024-01-12',
    time: '09:00 AM',
    status: 'no-show',
    notes: 'Did not attend scheduled appointment'
  }
];

const CorporateAppointments: React.FC = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>(sampleEmployees);
  const [isLoading, setIsLoading] = useState(false);
  // Reschedule modal state
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [reschedulingAppt, setReschedulingAppt] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  // Cancel confirmation state
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancellingAppt, setCancellingAppt] = useState<Appointment | null>(null);
  // Complete confirmation state
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const [completingAppt, setCompletingAppt] = useState<Appointment | null>(null);

  const stats = {
    totalScheduled: appointments.filter(a => a.status === 'scheduled').length,
    completedThisMonth: appointments.filter(a => a.status === 'completed').length,
    cancelled: appointments.filter(a => a.status === 'cancelled').length,
    noShows: appointments.filter(a => a.status === 'no-show').length
  };

  const filteredAppointments = useMemo(() => appointments.filter(appointment => {
    const matchesSearch = 
      appointment.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      appointment.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      appointment.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
      appointment.appointmentType.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || appointment.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  }), [appointments, searchQuery, statusFilter]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-500/15 text-blue-400';
      case 'completed':
        return 'bg-emerald-500/15 text-emerald-400';
      case 'cancelled':
        return 'bg-slate-700/50 text-slate-400';
      case 'no-show':
        return 'bg-red-500/15 text-red-400';
      default:
        return 'bg-slate-700/50 text-slate-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Clock className="h-4 w-4" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4" />;
      case 'no-show':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  // Employee picker filters
  const [empSearch, setEmpSearch]         = useState('');
  const [empBUFilter, setEmpBUFilter]     = useState('all');
  const [empDeptFilter, setEmpDeptFilter] = useState('all');
  const [empCityFilter, setEmpCityFilter] = useState('all');

  // Facility / provider picker filters
  const [facSearch, setFacSearch]         = useState('');

  // Live provider results fetched from the DB
  const [providerResults, setProviderResults] = useState<ProviderResult[]>([]);
  const [providerLoading, setProviderLoading] = useState(false);

  const [appointmentForm, setAppointmentForm] = useState({
    employeeId: '',
    employeeName: '',
    department: '',
    businessUnit: '',
    location: '',
    appointmentType: '',
    doctorName: '',
    facility: '',
    date: '',
    time: '',
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch providers from masterdata API whenever appointment type or search changes
  const loadProviders = useCallback(async (apptType: string, search: string) => {
    const meta = APPOINTMENT_TYPES.find(t => t.value === apptType);
    if (!meta) { setProviderResults([]); return; }
    setProviderLoading(true);
    try {
      const params: Record<string, string> = { limit: '25', search };
      if (meta.apiType === 'clinic' && meta.clinicHint) params.type = meta.clinicHint;
      const { data } = await api.get(`/masterdata/${meta.apiType}s`, { params });
      const rows: any[] = data?.data || [];
      setProviderResults(rows.map(r => ({
        id: String(r.id),
        name: r.name || '',
        sub: r.specialty || r.specialties?.[0] || r.sub_type || r.classification || '',
        city: r.city || '',
        providerType: meta.apiType,
      })));
    } catch {
      setProviderResults([]);
    } finally {
      setProviderLoading(false);
    }
  }, []);

  // Debounced provider search trigger
  useEffect(() => {
    if (!appointmentForm.appointmentType) { setProviderResults([]); return; }
    const timer = setTimeout(() => {
      loadProviders(appointmentForm.appointmentType, facSearch);
    }, 350);
    return () => clearTimeout(timer);
  }, [appointmentForm.appointmentType, facSearch, loadProviders]);

  const loadAppointments = async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/corporate/appointments');
      const list = ((data as any)?.data?.appointments || []) as Appointment[];
      setAppointments(list);
    } catch (error: any) {
      setAppointments(sampleAppointments);
      toast({
        title: 'Failed to load appointments',
        description: error?.response?.data?.message || 'Showing sample appointments.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      const { data } = await api.get('/corporate/employees');
      const list = ((data as any)?.data?.employees || []) as any[];
      const mapped = list
        .map((emp) => ({
          id: emp.employeeId || emp.id,
          name: emp.name,
          department: emp.department || 'General',
          businessUnit: emp.businessUnit || emp.business_unit || '',
          location: emp.location || emp.city || '',
        }))
        .filter((emp) => emp.id && emp.name);
      setEmployeeOptions(mapped.length ? mapped : sampleEmployees);
    } catch (error) {
      setEmployeeOptions(sampleEmployees);
    }
  };

  useEffect(() => {
    loadAppointments();
    loadEmployees();
  }, []);

  const handleEmployeeSelect = (employeeId: string) => {
    const selected = employeeOptions.find((emp) => emp.id === employeeId);
    setAppointmentForm((prev) => ({
      ...prev,
      employeeId,
      employeeName: selected?.name || '',
      department: selected?.department || '',
      businessUnit: selected?.businessUnit || '',
      location: selected?.location || '',
    }));
  };

  const handleScheduleAppointment = async () => {
    if (!appointmentForm.employeeId || !appointmentForm.appointmentType || !appointmentForm.date || !appointmentForm.time) {
      toast({
        title: "Missing fields",
        description: "Please fill in employee, appointment type, date, and time.",
        variant: "destructive"
      });
      return;
    }
    try {
      setIsSubmitting(true);
      const { data } = await api.post('/corporate/appointments', appointmentForm);
      const newAppointment = (data as any)?.data?.appointment;
      if (newAppointment) {
        setAppointments(prev => [newAppointment, ...prev]);
      } else {
        await loadAppointments();
      }
      toast({
        title: "Appointment Scheduled",
        description: "The appointment has been scheduled successfully."
      });
      setIsScheduleDialogOpen(false);
      setAppointmentForm({
        employeeId: '', employeeName: '', department: '', businessUnit: '', location: '',
        appointmentType: '', doctorName: '', facility: '', date: '', time: '', notes: ''
      });
      setEmpSearch(''); setEmpBUFilter('all'); setEmpDeptFilter('all'); setEmpCityFilter('all');
      setFacSearch('');
    } catch (error: any) {
      toast({
        title: "Scheduling failed",
        description: error?.response?.data?.message || "Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewDetails = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setIsDetailsOpen(true);
  };

  const handleCancel = (appointment: Appointment) => {
    setCancellingAppt(appointment);
    setIsCancelOpen(true);
  };

  const confirmCancel = () => {
    if (!cancellingAppt) return;
    setAppointments((prev) => prev.map((a) => a.id === cancellingAppt.id ? { ...a, status: 'cancelled', notes: 'Cancelled by admin' } : a));
    toast({ title: 'Appointment cancelled', description: `${cancellingAppt.employeeName}'s appointment was cancelled.` });
    setIsCancelOpen(false);
    setCancellingAppt(null);
  };

  const handleReschedule = (appointment: Appointment) => {
    setReschedulingAppt(appointment);
    setRescheduleDate(appointment.date);
    setRescheduleTime(appointment.time);
    setIsRescheduleOpen(true);
  };

  const confirmReschedule = () => {
    if (!reschedulingAppt || !rescheduleDate || !rescheduleTime) {
      toast({ title: 'Missing fields', description: 'Please provide both date and time.', variant: 'destructive' });
      return;
    }
    setAppointments((prev) => prev.map((a) => a.id === reschedulingAppt.id ? { ...a, date: rescheduleDate, time: rescheduleTime, status: 'scheduled' } : a));
    toast({ title: 'Appointment rescheduled', description: `${reschedulingAppt.employeeName} moved to ${rescheduleDate} at ${rescheduleTime}.` });
    setIsRescheduleOpen(false);
    setReschedulingAppt(null);
  };

  const handleMarkCompleted = (appointment: Appointment) => {
    setCompletingAppt(appointment);
    setIsCompleteOpen(true);
  };

  const confirmComplete = () => {
    if (!completingAppt) return;
    setAppointments((prev) => prev.map((a) => a.id === completingAppt.id ? { ...a, status: 'completed' } : a));
    toast({ title: 'Marked as completed', description: `${completingAppt.employeeName}'s appointment marked completed.` });
    setIsCompleteOpen(false);
    setCompletingAppt(null);
  };

  const handleRefresh = () => {
    loadAppointments();
    toast({ title: 'Appointments refreshed', description: 'Showing the latest appointment list.' });
  };

  return (
    <CorporateLayout title="Corporate Appointments">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={CalendarCheck}
          title="Corporate Appointments"
          description="Manage employee health appointments, checkups, and consultations"
          gradient="from-purple-500 to-purple-700"
          badge={`${appointments.length} Total`}
          showSearch={true}
          searchPlaceholder="Search by employee name, ID, or department..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          showRefresh={true}
          onRefresh={handleRefresh}
          isRefreshing={isLoading}
          stats={[
            { label: 'Scheduled', value: stats.totalScheduled },
            { label: 'Completed', value: stats.completedThisMonth },
            { label: 'Cancelled', value: stats.cancelled },
            { label: 'No Shows', value: stats.noShows },
          ]}
          showAdd={true}
          addLabel="Schedule Appointment"
          onAdd={() => setIsScheduleDialogOpen(true)}
        />

        {/* Schedule Dialog */}
        <Dialog open={isScheduleDialogOpen} onOpenChange={(open) => {
          setIsScheduleDialogOpen(open);
          if (!open) {
            setAppointmentForm({ employeeId: '', employeeName: '', department: '', businessUnit: '', location: '', appointmentType: '', doctorName: '', facility: '', date: '', time: '', notes: '' });
            setEmpSearch(''); setEmpBUFilter('all'); setEmpDeptFilter('all'); setEmpCityFilter('all');
            setFacSearch('');
          }
        }}>
          <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Schedule New Appointment</DialogTitle>
              <DialogDescription>Schedule a health appointment for an employee</DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-2">
              {/* ── Employee Picker ── */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-white">Employee</Label>

                {/* Filter row */}
                <div className="grid grid-cols-3 gap-2">
                  <Select value={empBUFilter} onValueChange={setEmpBUFilter}>
                    <SelectTrigger className="h-8 text-xs bg-slate-800/60 border-white/10">
                      <SelectValue placeholder="Business Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Business Units</SelectItem>
                      {[...new Set(employeeOptions.map(e => e.businessUnit).filter(Boolean))].sort().map(bu => (
                        <SelectItem key={bu} value={bu!}>{bu}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={empDeptFilter} onValueChange={setEmpDeptFilter}>
                    <SelectTrigger className="h-8 text-xs bg-slate-800/60 border-white/10">
                      <SelectValue placeholder="Department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {[...new Set(employeeOptions
                        .filter(e => empBUFilter === 'all' || e.businessUnit === empBUFilter)
                        .map(e => e.department).filter(Boolean))].sort().map(d => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={empCityFilter} onValueChange={setEmpCityFilter}>
                    <SelectTrigger className="h-8 text-xs bg-slate-800/60 border-white/10">
                      <SelectValue placeholder="City / Location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Cities</SelectItem>
                      {[...new Set(employeeOptions
                        .filter(e => empBUFilter === 'all' || e.businessUnit === empBUFilter)
                        .filter(e => empDeptFilter === 'all' || e.department === empDeptFilter)
                        .map(e => e.location).filter(Boolean))].sort().map(c => (
                        <SelectItem key={c} value={c!}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Search box */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <Input
                    placeholder="Search by name or employee ID…"
                    value={empSearch}
                    onChange={e => setEmpSearch(e.target.value)}
                    className="pl-9 h-9 bg-slate-800/60 border-white/10 text-white placeholder:text-slate-500"
                  />
                </div>

                {/* Employee list */}
                {(() => {
                  const filtered = employeeOptions.filter(e => {
                    const matchBU   = empBUFilter   === 'all' || e.businessUnit === empBUFilter;
                    const matchDept = empDeptFilter === 'all' || e.department   === empDeptFilter;
                    const matchCity = empCityFilter === 'all' || e.location     === empCityFilter;
                    const matchText = !empSearch ||
                      e.name.toLowerCase().includes(empSearch.toLowerCase()) ||
                      e.id.toLowerCase().includes(empSearch.toLowerCase());
                    return matchBU && matchDept && matchCity && matchText;
                  });
                  return (
                    <div className="border border-white/10 rounded-xl overflow-hidden">
                      {filtered.length === 0 ? (
                        <div className="py-8 text-center text-sm text-slate-500">No employees match your filters</div>
                      ) : (
                        <div className="max-h-44 overflow-y-auto divide-y divide-white/[0.05]">
                          {filtered.map(emp => (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => handleEmployeeSelect(emp.id)}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all hover:bg-white/5 ${
                                appointmentForm.employeeId === emp.id ? 'bg-purple-600/20 border-l-2 border-l-purple-500' : ''
                              }`}
                            >
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/30 to-violet-600/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-purple-300">
                                {emp.name.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-white truncate">{emp.name}</div>
                                <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span>{emp.id}</span>
                                  {emp.department && <><span className="text-slate-700">·</span><span>{emp.department}</span></>}
                                  {emp.businessUnit && <><span className="text-slate-700">·</span><span className="text-violet-400">{emp.businessUnit}</span></>}
                                  {emp.location && <><span className="text-slate-700">·</span><MapPin className="h-3 w-3 inline" /><span>{emp.location}</span></>}
                                </div>
                              </div>
                              {appointmentForm.employeeId === emp.id && (
                                <CheckCircle className="h-4 w-4 text-purple-400 flex-shrink-0" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="px-4 py-1.5 bg-slate-800/40 text-xs text-slate-600 border-t border-white/[0.04]">
                        {filtered.length} employee{filtered.length !== 1 ? 's' : ''} shown
                      </div>
                    </div>
                  );
                })()}

                {/* Selected employee chip */}
                {appointmentForm.employeeId && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 border border-purple-500/30 rounded-lg text-sm">
                    <CheckCircle className="h-4 w-4 text-purple-400 flex-shrink-0" />
                    <span className="text-white font-medium">{appointmentForm.employeeName}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-400">{appointmentForm.employeeId}</span>
                    {appointmentForm.department && <><span className="text-slate-600">·</span><span className="text-slate-400">{appointmentForm.department}</span></>}
                    <button type="button" onClick={() => setAppointmentForm(p => ({ ...p, employeeId: '', employeeName: '', department: '', businessUnit: '', location: '' }))}
                      className="ml-auto text-slate-500 hover:text-slate-300 text-xs">✕</button>
                  </div>
                )}
              </div>

              {/* Appointment Type */}
              <div className="grid gap-2">
                <Label htmlFor="type">Appointment Type</Label>
                <Select
                  value={appointmentForm.appointmentType}
                  onValueChange={v => {
                    setAppointmentForm(p => ({ ...p, appointmentType: v, facility: '' }));
                    setFacSearch('');
                  }}
                >
                  <SelectTrigger id="type"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {APPOINTMENT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Facility / Provider Picker */}
              {(() => {
                const apptMeta = APPOINTMENT_TYPES.find(t => t.value === appointmentForm.appointmentType);
                const selectedProvider = providerResults.find(p => p.name === appointmentForm.facility)
                  ?? (appointmentForm.facility ? { id: 'sel', name: appointmentForm.facility, sub: '', city: '', providerType: (apptMeta?.apiType ?? 'hospital') as ProviderApiType } : null);

                return (
                  <div className="grid gap-2">
                    <Label>
                      {apptMeta
                        ? ({ doctor: 'Doctor / Specialist', hospital: 'Hospital / Diagnostic Center', lab: 'Lab / Diagnostic Center', clinic: 'Clinic' } as Record<string, string>)[apptMeta.apiType]
                        : 'Facility / Provider'}
                    </Label>

                    {/* Selected chip */}
                    {selectedProvider && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/30 text-sm">
                        {(() => { const meta = PROVIDER_META[selectedProvider.providerType]; return <meta.Icon className={`h-3.5 w-3.5 ${meta.color.split(' ')[0]}`} />; })()}
                        <span className="flex-1 text-blue-100">{selectedProvider.name}</span>
                        {selectedProvider.city && <span className="text-xs text-slate-400">{selectedProvider.city}</span>}
                        <button type="button" className="ml-1 text-slate-400 hover:text-slate-200"
                          onClick={() => setAppointmentForm(p => ({ ...p, facility: '' }))}>✕</button>
                      </div>
                    )}

                    {!appointmentForm.appointmentType ? (
                      <p className="text-xs text-slate-500 italic px-1">Select an appointment type first</p>
                    ) : (
                      <>
                        {/* Search box */}
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                          <Input
                            placeholder="Search by name or speciality…"
                            value={facSearch}
                            onChange={e => setFacSearch(e.target.value)}
                            className="pl-8 h-8 text-xs"
                          />
                        </div>

                        {/* Provider list */}
                        <div className="max-h-40 overflow-y-auto rounded-md border border-slate-700 divide-y divide-slate-800">
                          {providerLoading ? (
                            <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-400">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading providers…
                            </div>
                          ) : providerResults.length === 0 ? (
                            <p className="text-xs text-slate-500 text-center py-3">No providers found</p>
                          ) : providerResults.map(prov => {
                            const meta = PROVIDER_META[prov.providerType];
                            const isSelected = appointmentForm.facility === prov.name;
                            return (
                              <button
                                key={prov.id}
                                type="button"
                                className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-800 transition-colors ${isSelected ? 'bg-blue-900/30' : ''}`}
                                onClick={() => setAppointmentForm(p => ({ ...p, facility: prov.name }))}
                              >
                                <span className={`flex-shrink-0 flex items-center justify-center h-7 w-7 rounded-full ${meta.color}`}>
                                  <meta.Icon className="h-3.5 w-3.5" />
                                </span>
                                <span className="flex-1 min-w-0">
                                  <span className="block text-xs font-medium text-slate-100 truncate">{prov.name}</span>
                                  {prov.sub && <span className="block text-[11px] text-slate-400 truncate">{prov.sub}{prov.city ? ` · ${prov.city}` : ''}</span>}
                                  {!prov.sub && prov.city && <span className="block text-[11px] text-slate-400">{prov.city}</span>}
                                </span>
                                <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="date">Date</Label>
                  <Input id="date" type="date" value={appointmentForm.date} onChange={e => setAppointmentForm(p => ({ ...p, date: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="time">Time</Label>
                  <Input id="time" type="time" value={appointmentForm.time} onChange={e => setAppointmentForm(p => ({ ...p, time: e.target.value }))} />
                </div>
              </div>

              {/* Notes */}
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea id="notes" placeholder="Add any relevant notes…" value={appointmentForm.notes} onChange={e => setAppointmentForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsScheduleDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleScheduleAppointment} disabled={isSubmitting}>
                {isSubmitting ? 'Scheduling…' : 'Schedule Appointment'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalScheduled}</div>
            <p className="text-xs text-muted-foreground">Upcoming appointments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedThisMonth}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cancelled</CardTitle>
            <XCircle className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.cancelled}</div>
            <p className="text-xs text-muted-foreground">Cancellations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">No Shows</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.noShows}</div>
            <p className="text-xs text-muted-foreground">Missed appointments</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Appointment Management</CardTitle>
          <CardDescription>View and manage all employee appointments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by employee, ID, department, or type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="no-show">No Show</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {/* Appointments List */}
          <div className="space-y-4">
            {filteredAppointments.map((appointment) => (
              <Card key={appointment.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg">{appointment.employeeName}</h3>
                        <Badge variant="outline">{appointment.employeeId}</Badge>
                        <Badge variant="secondary">{appointment.department}</Badge>
                        <Badge className={getStatusColor(appointment.status)}>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(appointment.status)}
                            <span className="capitalize">{appointment.status.replace('-', ' ')}</span>
                          </div>
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-slate-400">
                          <Users className="h-4 w-4" />
                          <span><strong>Type:</strong> {appointment.appointmentType}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <Calendar className="h-4 w-4" />
                          <span><strong>Date:</strong> {new Date(appointment.date).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <Clock className="h-4 w-4" />
                          <span><strong>Time:</strong> {appointment.time}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <MapPin className="h-4 w-4" />
                          <span><strong>Facility:</strong> {appointment.facility}</span>
                        </div>
                      </div>

                      <div className="text-sm text-slate-400">
                        <strong>Doctor:</strong> {appointment.doctorName}
                      </div>

                      {appointment.notes && (
                        <div className="text-sm text-slate-400 italic">
                          <strong>Notes:</strong> {appointment.notes}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {appointment.status === 'scheduled' && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => handleReschedule(appointment)}>
                            <RotateCcw className="h-3 w-3 mr-1" />Reschedule
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleCancel(appointment)}>
                            <XCircle className="h-3 w-3 mr-1" />Cancel
                          </Button>
                        </>
                      )}
                      <Button variant="outline" size="sm" onClick={() => handleViewDetails(appointment)}>View Details</Button>
                      {appointment.status === 'scheduled' && (
                        <Button size="sm" onClick={() => handleMarkCompleted(appointment)}>
                          <CheckCircle className="h-3 w-3 mr-1" />Complete
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredAppointments.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No appointments found matching your criteria</p>
            </div>
          )}
        </CardContent>
      </Card>

        <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Appointment Details</DialogTitle>
              <DialogDescription>
                Review the appointment information for the selected employee.
              </DialogDescription>
            </DialogHeader>
            {selectedAppointment && (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Employee</span><span className="font-semibold">{selectedAppointment.employeeName} ({selectedAppointment.employeeId})</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Department</span><span className="font-semibold">{selectedAppointment.department}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Type</span><span className="font-semibold">{selectedAppointment.appointmentType}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Doctor</span><span className="font-semibold">{selectedAppointment.doctorName}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Facility</span><span className="font-semibold">{selectedAppointment.facility}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Date & Time</span><span className="font-semibold">{new Date(selectedAppointment.date).toLocaleDateString()} at {selectedAppointment.time}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Status</span><span className="font-semibold capitalize">{selectedAppointment.status.replace('-', ' ')}</span></div>
                {selectedAppointment.notes && <p className="text-slate-400">Notes: <span className="font-semibold">{selectedAppointment.notes}</span></p>}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reschedule Modal */}
        <Dialog open={isRescheduleOpen} onOpenChange={setIsRescheduleOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Reschedule Appointment</DialogTitle>
              <DialogDescription>
                {reschedulingAppt ? `Rescheduling appointment for ${reschedulingAppt.employeeName}` : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>New Date</Label>
                <Input type="date" value={rescheduleDate} min={new Date().toISOString().split('T')[0]} onChange={(e) => setRescheduleDate(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>New Time</Label>
                <Input type="time" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRescheduleOpen(false)}>Cancel</Button>
              <Button onClick={confirmReschedule} disabled={!rescheduleDate || !rescheduleTime}>Confirm Reschedule</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel Confirmation Modal */}
        <Dialog open={isCancelOpen} onOpenChange={setIsCancelOpen}>
          <DialogContent className="sm:max-w-[380px]">
            <DialogHeader>
              <DialogTitle>Cancel Appointment</DialogTitle>
              <DialogDescription>
                Are you sure you want to cancel the appointment for <strong>{cancellingAppt?.employeeName}</strong> on {cancellingAppt ? new Date(cancellingAppt.date).toLocaleDateString() : ''}? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCancelOpen(false)}>Keep Appointment</Button>
              <Button variant="destructive" onClick={confirmCancel}>Yes, Cancel It</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Complete Confirmation Modal */}
        <Dialog open={isCompleteOpen} onOpenChange={setIsCompleteOpen}>
          <DialogContent className="sm:max-w-[380px]">
            <DialogHeader>
              <DialogTitle>Mark as Completed</DialogTitle>
              <DialogDescription>
                Confirm that <strong>{completingAppt?.employeeName}</strong>'s appointment has been completed successfully.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCompleteOpen(false)}>Cancel</Button>
              <Button onClick={confirmComplete}>Confirm Completed</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </CorporateLayout>
  );
};

export default CorporateAppointments;
