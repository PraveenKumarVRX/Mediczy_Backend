import React, { useEffect, useState } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Users, UserCog, Calendar, CalendarOff, Wallet, Briefcase,
  GraduationCap, Star, BarChart3, Settings, HelpCircle,
  PlusCircle, Download, Search, Filter, Clock, UserPlus,
  ShieldCheck, Gift, FileText, TrendingUp, ClipboardCheck,
  Building2, Phone, Mail, MapPin, CheckCircle2, AlertCircle,
  XCircle, MoreHorizontal, Edit, Eye, CalendarCheck, Activity,
  Fingerprint, RefreshCw, Trash2, Wifi, WifiOff, Database,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { exportToExcel } from '@/utils/exportToExcel';
import api from '@/utils/api';

// ─── Shared Nav (exported for Dashboard) ───────────────────────────────────
export const hrNavSections: DeptNavSection[] = [
  {
    title: 'Overview',
    items: [{ icon: Users, label: 'Dashboard', href: '/hr/dashboard' }],
  },
  {
    title: 'Workforce',
    items: [
      { icon: UserCog,     label: 'Staff Directory',    href: '/hr/staff' },
      { icon: Calendar,    label: 'Attendance',         href: '/hr/attendance' },
      { icon: CalendarOff, label: 'Leave Management',   href: '/hr/leaves' },
      { icon: Clock,       label: 'Shifts & Roster',    href: '/hr/shifts' },
      { icon: FileText,    label: 'Timesheets',         href: '/hr/timesheets' },
      { icon: ClipboardCheck, label: 'Onboarding',      href: '/hr/onboarding' },
      { icon: FileText, label: 'Documents',             href: '/hr/documents' },
    ],
  },
  {
    title: 'Payroll & Benefits',
    items: [
      { icon: Wallet,     label: 'Payroll',      href: '/hr/payroll' },
      { icon: ShieldCheck,label: 'PF & ESI',     href: '/hr/pf-esi' },
      { icon: Gift,       label: 'Benefits',     href: '/hr/benefits' },
    ],
  },
  {
    title: 'Talent',
    items: [
      { icon: Briefcase,    label: 'Recruitment', href: '/hr/recruitment' },
      { icon: GraduationCap,label: 'Training',    href: '/hr/training' },
      { icon: Star,         label: 'Performance', href: '/hr/performance' },
      { icon: TrendingUp,   label: 'Goals & OKRs', href: '/hr/goals' },
      { icon: Activity,     label: 'Engagement',   href: '/hr/surveys' },
      { icon: TrendingUp,   label: 'Appraisals',  href: '/hr/appraisals' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { icon: BarChart3,  label: 'HR Reports',   href: '/hr/reports' },
      { icon: FileText,   label: 'HR Analytics', href: '/hr/analytics' },
      { icon: ShieldCheck,label: 'Compliance',   href: '/hr/compliance' },
    ],
  },
  {
    title: 'System',
    items: [
      { icon: Settings,   label: 'Settings', href: '/hr/settings' },
      { icon: HelpCircle, label: 'Support',  href: '/hr/support' },
    ],
  },
];

// ─── Shared helpers ──────────────────────────────────────────────────────────
const Wrap = ({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) => (
  <HospDeptLayout deptKey="hr" deptName="Human Resources" badgeLabel="HR"
    loginPath="/hr/login" DeptIcon={Users} navSections={hrNavSections}
    title={title} subtitle={subtitle}>
    {children}
  </HospDeptLayout>
);

const KPI = ({ label, value, sub, color = 'text-teal-600', icon: Icon }:
  { label: string; value: string; sub: string; color?: string; icon: LucideIcon }) => (
  <Card className="hover:shadow-md transition-shadow">
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{sub}</p>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </CardContent>
  </Card>
);

const sc: Record<string, string> = {
  Active:    'bg-emerald-100 text-emerald-700',
  Inactive:  'bg-slate-100 text-slate-600',
  Pending:   'bg-amber-100 text-amber-700',
  Approved:  'bg-emerald-100 text-emerald-700',
  Rejected:  'bg-red-100 text-red-700',
  Present:   'bg-emerald-100 text-emerald-700',
  Absent:    'bg-red-100 text-red-700',
  Late:      'bg-amber-100 text-amber-700',
  Open:      'bg-blue-100 text-blue-700',
  Draft:     'bg-slate-100 text-slate-600',
  Paused:    'bg-amber-100 text-amber-700',
  Sourced:   'bg-slate-100 text-slate-600',
  Screening: 'bg-blue-100 text-blue-700',
  Shortlisted: 'bg-teal-100 text-teal-700',
  Interview: 'bg-violet-100 text-violet-700',
  Offer:     'bg-amber-100 text-amber-700',
  Hired:     'bg-emerald-100 text-emerald-700',
  Closed:    'bg-slate-100 text-slate-600',
  Scheduled: 'bg-violet-100 text-violet-700',
  Completed: 'bg-emerald-100 text-emerald-700',
  Hold:      'bg-orange-100 text-orange-700',
  Due:       'bg-amber-100 text-amber-700',
  Filed:     'bg-emerald-100 text-emerald-700',
  Overdue:   'bg-red-100 text-red-700',
};
const Bdg = ({ s }: { s: string }) => <Badge className={`${sc[s] ?? 'bg-slate-100 text-slate-600'} border-0 text-xs`}>{s}</Badge>;
const TH = ({ children }: { children: React.ReactNode }) => <th className="pb-2 text-left font-medium text-muted-foreground text-xs tracking-wide">{children}</th>;
const TD = ({ children, center }: { children: React.ReactNode; center?: boolean }) => (
  <td className={`py-2.5 text-sm ${center ? 'text-center' : ''}`}>{children}</td>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 1. STAFF DIRECTORY
// ═══════════════════════════════════════════════════════════════════════════════
type StaffMember = {
  id: number | string;
  employeeCode: string;
  biometricUserId?: string | null;
  firstName?: string;
  lastName?: string;
  name: string;
  email: string;
  phone?: string;
  department: string;
  locationId?: number | string | null;
  locationName?: string | null;
  branchCode?: string | null;
  designation: string;
  employmentType?: string;
  role: string;
  joinedAt?: string;
  status: string;
  gender?: string;
  deviceUid?: string | null;
};

type BiometricDevice = {
  id: number | string;
  deviceUid: string;
  name: string;
  location?: string | null;
  locationId?: number | string | null;
  locationName?: string | null;
  vendor?: string | null;
  connectionType?: string;
  status: string;
  lastSyncAt?: string | null;
};

type HrLocation = {
  id: number | string;
  code: string;
  name: string;
  locationType?: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  email?: string | null;
  status: string;
};

type HrUser = {
  id: number | string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  status: string;
  permissions?: string[];
  locationIds?: string[];
  locations?: HrLocation[];
};

type HrFeature = { key: string; label: string };

type HrSummary = {
  totalStaff: number;
  activeStaff: number;
  presentToday: number;
  absentToday: number;
  attendanceRate: number;
  biometricEventsToday: number;
  devices: { total: number; online: number };
  byDepartment: Record<string, number>;
  byLocation?: Record<string, number>;
};

type AttendanceRow = {
  staffId: number | string;
  employeeCode: string;
  name: string;
  department: string;
  checkIn?: string | null;
  checkOut?: string | null;
  hours?: number | null;
  status: string;
  source: string;
  deviceName?: string | null;
  events: number;
};

type AttendancePayload = {
  date: string;
  summary: { present: number; absent: number; late: number; total: number; biometricEvents: number };
  rows: AttendanceRow[];
};

type AuditEvent = {
  id: number | string;
  eventAt: string;
  eventType: string;
  source: string;
  employeeCode?: string | null;
  biometricUserId?: string | null;
  deviceName?: string | null;
  deviceUid?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

const unwrapData = <T,>(response: any, fallback: T): T => response?.data?.data ?? response?.data ?? fallback;
const hrHeaders = () => {
  const token = localStorage.getItem('hrToken') || localStorage.getItem('hospitalToken') || localStorage.getItem('token') || '';
  return token ? { Authorization: 'Bearer ' + token } : {};
};
const errText = (error: any) => error?.response?.data?.message || error?.message || 'Request failed';
const displayDate = (value?: string | null) => value ? new Date(value).toLocaleDateString() : '-';
const statusLabel = (value?: string) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'active') return 'Active';
  if (normalized === 'inactive') return 'Inactive';
  if (normalized === 'online') return 'Active';
  if (normalized === 'offline') return 'Inactive';
  if (normalized === 'late') return 'Late';
  if (normalized === 'present') return 'Present';
  if (normalized === 'absent') return 'Absent';
  return value || '-';
};
const todayDate = () => new Date().toISOString().slice(0, 10);
const currentTime = () => new Date().toISOString().slice(11, 16);
const makeStaffForm = () => ({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  department: 'General',
  designation: '',
  role: 'staff',
  gender: 'Other',
  dateOfBirth: '1990-01-01',
  joinedAt: todayDate(),
  employmentType: 'Full-time',
  employeeCode: '',
  biometricUserId: '',
  deviceUid: '',
  locationId: '',
  locationName: '',
  branchCode: '',
});
const roleOptions = ['staff', 'doctor', 'nurse', 'receptionist', 'billing', 'accounts_staff', 'mrd_staff', 'insurance_desk_staff', 'hr_staff', 'it_edp_staff', 'ot_staff', 'icu_staff', 'quality_staff', 'security_staff', 'pharmacy_staff', 'lab_staff'];
const departmentOptions = ['General', 'Nursing', 'OPD', 'IPD', 'ICU', 'OT', 'Pharmacy', 'Laboratory', 'Radiology', 'Accounts', 'Billing', 'Front Office', 'Housekeeping', 'Security', 'HR'];

export const HRStaffPage = () => {
  const [q, setQ] = useState('');
  const [deptF, setDeptF] = useState('all');
  const [locationF, setLocationF] = useState('all');
  const [staffRows, setStaffRows] = useState<StaffMember[]>([]);
  const [devices, setDevices] = useState<BiometricDevice[]>([]);
  const [locations, setLocations] = useState<HrLocation[]>([]);
  const [summary, setSummary] = useState<HrSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [staffForm, setStaffForm] = useState(makeStaffForm);
  const [deviceForm, setDeviceForm] = useState({ deviceUid: '', name: '', location: '', locationId: '', vendor: 'ZKTeco', connectionType: 'api', status: 'online' });

  const load = async () => {
    setLoading(true);
    setMessage('');
    try {
      const [staffRes, devicesRes, summaryRes, locationsRes] = await Promise.all([
        api.get('/hr/staff', { headers: hrHeaders() }),
        api.get('/hr/biometric-devices', { headers: hrHeaders() }),
        api.get('/hr/summary', { headers: hrHeaders() }),
        api.get('/hr/locations', { headers: hrHeaders() }),
      ]);
      setStaffRows(unwrapData<StaffMember[]>(staffRes, []));
      setDevices(unwrapData<BiometricDevice[]>(devicesRes, []));
      setSummary(unwrapData<HrSummary | null>(summaryRes, null));
      setLocations(unwrapData<HrLocation[]>(locationsRes, []));
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const depts = ['all', ...Array.from(new Set([...departmentOptions, ...staffRows.map(s => s.department).filter(Boolean)]))];
  const rows = staffRows.filter(s =>
    (deptF === 'all' || s.department === deptF) &&
    (locationF === 'all' || String(s.locationId || '') === locationF) &&
    (s.name.toLowerCase().includes(q.toLowerCase()) || s.email.toLowerCase().includes(q.toLowerCase()) || String(s.employeeCode || '').toLowerCase().includes(q.toLowerCase()))
  );

  const addStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const selectedLocation = locations.find(location => String(location.id) === String(staffForm.locationId));
      await api.post('/hr/staff', { ...staffForm, locationName: selectedLocation?.name || '', branchCode: selectedLocation?.code || '' }, { headers: hrHeaders() });
      setStaffForm(makeStaffForm());
      setMessage('Staff member added. Account is flagged for first-login password reset.');
      await load();
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setSaving(false);
    }
  };

  const saveDevice = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/hr/biometric-devices', deviceForm, { headers: hrHeaders() });
      setDeviceForm({ deviceUid: '', name: '', location: '', locationId: '', vendor: 'ZKTeco', connectionType: 'api', status: 'online' });
      setMessage('Biometric device registered. Device events can now be synced into attendance.');
      await load();
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setSaving(false);
    }
  };

  const deactivateStaff = async (id: number | string) => {
    setMessage('');
    try {
      await api.delete('/hr/staff/' + id, { headers: hrHeaders() });
      await load();
    } catch (error) {
      setMessage(errText(error));
    }
  };

  return (
    <Wrap title="Staff Directory" subtitle="Staff records, onboarding, and biometric identity mapping">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KPI label="Total Staff" value={String(summary?.totalStaff ?? staffRows.length)} sub="Tenant-scoped records" icon={Users} color="text-teal-600" />
        <KPI label="Locations" value={String(locations.filter(l => l.status === 'active').length)} sub="Branches / units" icon={Building2} color="text-emerald-600" />
        <KPI label="Present Today" value={String(summary?.presentToday ?? 0)} sub={(summary?.attendanceRate ?? 0) + '% attendance'} icon={CalendarCheck} color="text-blue-600" />
        <KPI label="Biometric Devices" value={(summary?.devices.online ?? devices.filter(d => d.status === 'online').length) + '/' + (summary?.devices.total ?? devices.length)} sub="Online / registered" icon={Fingerprint} color="text-violet-600" />
      </div>

      {message && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>}

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_380px] gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Staff Register</CardTitle>
              <div className="flex flex-wrap gap-2 justify-end">
                <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8 h-8 w-52 text-sm" placeholder="Search name, email, ID" value={q} onChange={e => setQ(e.target.value)} /></div>
                <select className="h-8 text-sm border rounded-md px-2 bg-background" value={deptF} onChange={e => setDeptF(e.target.value)}>{depts.map(d => <option key={d} value={d}>{d === 'all' ? 'All departments' : d}</option>)}</select>
                <select className="h-8 text-sm border rounded-md px-2 bg-background" value={locationF} onChange={e => setLocationF(e.target.value)}><option value="all">All locations</option>{locations.map(l => <option key={l.id} value={l.id}>{l.code} - {l.name}</option>)}</select>
                <Button variant="outline" size="sm" className="gap-1" onClick={load} disabled={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><TH>Emp ID</TH><TH>Name</TH><TH>Location</TH><TH>Department</TH><TH>Role</TH><TH>Phone</TH><TH>Biometric</TH><TH>Joined</TH><TH>Status</TH><TH>Actions</TH></tr></thead>
                  <tbody className="divide-y">
                    {rows.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <TD><span className="font-mono text-xs">{r.employeeCode}</span></TD>
                        <TD><div><span className="font-medium">{r.name}</span><p className="text-xs text-muted-foreground">{r.email}</p></div></TD>
                        <TD><div><span>{r.locationName || '-'}</span><p className="text-xs text-muted-foreground">{r.branchCode || ''}</p></div></TD>
                        <TD>{r.department}</TD>
                        <TD>{r.designation || r.role}</TD>
                        <TD>{r.phone || '-'}</TD>
                        <TD><div className="text-xs"><span className="font-mono">{r.biometricUserId || '-'}</span><p className="text-muted-foreground">{r.deviceUid || 'No device'}</p></div></TD>
                        <TD>{displayDate(r.joinedAt)}</TD>
                        <TD><Bdg s={statusLabel(r.status)} /></TD>
                        <TD><Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => deactivateStaff(r.id)} title="Deactivate"><Trash2 className="h-4 w-4 text-red-500" /></Button></TD>
                      </tr>
                    ))}
                    {!loading && rows.length === 0 && <tr><TD center><span className="text-muted-foreground">No staff records found</span></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Biometric Device Registry</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><TH>Status</TH><TH>Device UID</TH><TH>Name</TH><TH>Location</TH><TH>Vendor</TH><TH>Last Sync</TH></tr></thead>
                  <tbody className="divide-y">
                    {devices.map(device => (
                      <tr key={device.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <TD>{device.status === 'online' ? <Wifi className="h-4 w-4 text-emerald-600" /> : <WifiOff className="h-4 w-4 text-slate-500" />}</TD>
                        <TD><span className="font-mono text-xs">{device.deviceUid}</span></TD>
                        <TD>{device.name}</TD>
                        <TD>{device.locationName || device.location || '-'}</TD>
                        <TD>{device.vendor || '-'}</TD>
                        <TD>{device.lastSyncAt ? new Date(device.lastSyncAt).toLocaleString() : '-'}</TD>
                      </tr>
                    ))}
                    {devices.length === 0 && <tr><TD><span className="text-muted-foreground">No devices registered</span></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4" />Add Staff</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={addStaff}>
                <div className="grid grid-cols-2 gap-2"><Input required placeholder="First name" value={staffForm.firstName} onChange={e => setStaffForm({ ...staffForm, firstName: e.target.value })} /><Input required placeholder="Last name" value={staffForm.lastName} onChange={e => setStaffForm({ ...staffForm, lastName: e.target.value })} /></div>
                <Input required type="email" placeholder="Email" value={staffForm.email} onChange={e => setStaffForm({ ...staffForm, email: e.target.value })} />
                <Input required placeholder="Phone" value={staffForm.phone} onChange={e => setStaffForm({ ...staffForm, phone: e.target.value })} />
                <select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={staffForm.locationId} onChange={e => setStaffForm({ ...staffForm, locationId: e.target.value })}><option value="">No location assigned</option>{locations.map(l => <option key={l.id} value={l.id}>{l.code} - {l.name}</option>)}</select>
                <div className="grid grid-cols-2 gap-2">
                  <select className="h-10 text-sm border rounded-md px-2 bg-background" value={staffForm.department} onChange={e => setStaffForm({ ...staffForm, department: e.target.value })}>{departmentOptions.map(d => <option key={d}>{d}</option>)}</select>
                  <Input placeholder="Designation" value={staffForm.designation} onChange={e => setStaffForm({ ...staffForm, designation: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select className="h-10 text-sm border rounded-md px-2 bg-background" value={staffForm.role} onChange={e => setStaffForm({ ...staffForm, role: e.target.value })}>{roleOptions.map(r => <option key={r} value={r}>{r.replaceAll('_', ' ')}</option>)}</select>
                  <select className="h-10 text-sm border rounded-md px-2 bg-background" value={staffForm.gender} onChange={e => setStaffForm({ ...staffForm, gender: e.target.value })}><option>Other</option><option>Female</option><option>Male</option></select>
                </div>
                <div className="grid grid-cols-2 gap-2"><Input type="date" value={staffForm.joinedAt} onChange={e => setStaffForm({ ...staffForm, joinedAt: e.target.value })} /><Input type="date" value={staffForm.dateOfBirth} onChange={e => setStaffForm({ ...staffForm, dateOfBirth: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2"><Input placeholder="Employee code" value={staffForm.employeeCode} onChange={e => setStaffForm({ ...staffForm, employeeCode: e.target.value })} /><Input placeholder="Biometric user ID" value={staffForm.biometricUserId} onChange={e => setStaffForm({ ...staffForm, biometricUserId: e.target.value })} /></div>
                <select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={staffForm.deviceUid} onChange={e => setStaffForm({ ...staffForm, deviceUid: e.target.value })}><option value="">No default device</option>{devices.map(d => <option key={d.deviceUid} value={d.deviceUid}>{d.name} ({d.deviceUid})</option>)}</select>
                <Button type="submit" className="w-full gap-1 bg-teal-600 hover:bg-teal-700" disabled={saving}><PlusCircle className="h-4 w-4" />Add Staff</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Fingerprint className="h-4 w-4" />Add Biometric Device</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={saveDevice}>
                <Input required placeholder="Device UID" value={deviceForm.deviceUid} onChange={e => setDeviceForm({ ...deviceForm, deviceUid: e.target.value })} />
                <Input required placeholder="Device name" value={deviceForm.name} onChange={e => setDeviceForm({ ...deviceForm, name: e.target.value })} />
                <select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={deviceForm.locationId} onChange={e => setDeviceForm({ ...deviceForm, locationId: e.target.value })}><option value="">No branch mapped</option>{locations.map(l => <option key={l.id} value={l.id}>{l.code} - {l.name}</option>)}</select>
                <Input placeholder="Location label / floor" value={deviceForm.location} onChange={e => setDeviceForm({ ...deviceForm, location: e.target.value })} />
                <div className="grid grid-cols-2 gap-2"><Input placeholder="Vendor" value={deviceForm.vendor} onChange={e => setDeviceForm({ ...deviceForm, vendor: e.target.value })} /><select className="h-10 text-sm border rounded-md px-2 bg-background" value={deviceForm.status} onChange={e => setDeviceForm({ ...deviceForm, status: e.target.value })}><option value="online">Online</option><option value="offline">Offline</option><option value="maintenance">Maintenance</option></select></div>
                <Button type="submit" variant="outline" className="w-full gap-1" disabled={saving}><Database className="h-4 w-4" />Register Device</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </Wrap>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════════════
export const HRAttendancePage = () => {
  const [dateF, setDateF] = useState(todayDate());
  const [attendance, setAttendance] = useState<AttendancePayload | null>(null);
  const [staffRows, setStaffRows] = useState<StaffMember[]>([]);
  const [devices, setDevices] = useState<BiometricDevice[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState({ staffId: '', eventType: 'check_in', date: todayDate(), time: currentTime(), note: '' });
  const [syncEvent, setSyncEvent] = useState({ deviceUid: '', employeeCode: '', biometricUserId: '', eventType: 'check_in', date: todayDate(), time: currentTime() });

  const load = async () => {
    setLoading(true);
    setMessage('');
    try {
      const [attendanceRes, staffRes, devicesRes, auditRes] = await Promise.all([
        api.get('/hr/attendance?date=' + dateF, { headers: hrHeaders() }),
        api.get('/hr/staff', { headers: hrHeaders() }),
        api.get('/hr/biometric-devices', { headers: hrHeaders() }),
        api.get('/hr/audit', { headers: hrHeaders() }),
      ]);
      setAttendance(unwrapData<AttendancePayload | null>(attendanceRes, null));
      setStaffRows(unwrapData<StaffMember[]>(staffRes, []));
      setDevices(unwrapData<BiometricDevice[]>(devicesRes, []));
      setAudit(unwrapData<AuditEvent[]>(auditRes, []));
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [dateF]);

  const recordManual = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/hr/attendance/manual', manual, { headers: hrHeaders() });
      setManual({ ...manual, note: '', time: currentTime() });
      setMessage('Manual attendance event recorded.');
      await load();
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setSaving(false);
    }
  };

  const ingestDeviceEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/hr/biometric-events', {
        ...syncEvent,
        eventAt: syncEvent.date + 'T' + syncEvent.time + ':00.000Z',
        source: 'biometric',
      }, { headers: hrHeaders() });
      setSyncEvent({ ...syncEvent, employeeCode: '', biometricUserId: '', time: currentTime() });
      setMessage('Biometric punch ingested and attendance recalculated.');
      await load();
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setSaving(false);
    }
  };

  const summary = attendance?.summary;
  const rows = attendance?.rows || [];

  return (
    <Wrap title="Attendance" subtitle="Daily attendance, biometric logs, manual corrections, and device health">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KPI label="Present Today" value={String(summary?.present ?? 0)} sub={(summary?.total ?? 0) + ' total staff'} icon={CheckCircle2} color="text-emerald-600" />
        <KPI label="Absent Today" value={String(summary?.absent ?? 0)} sub="No check-in captured" icon={XCircle} color="text-red-600" />
        <KPI label="Late Arrivals" value={String(summary?.late ?? 0)} sub="After 10:00 check-in" icon={Clock} color="text-amber-600" />
        <KPI label="Biometric Events" value={String(summary?.biometricEvents ?? 0)} sub={devices.filter(d => d.status === 'online').length + ' devices online'} icon={Fingerprint} color="text-violet-600" />
      </div>

      {message && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>}

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_380px] gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Attendance Register</CardTitle>
              <div className="flex gap-2">
                <Input type="date" className="h-8 text-sm w-44" value={dateF} onChange={e => setDateF(e.target.value)} />
                <Button variant="outline" size="sm" className="gap-1" onClick={() => exportToExcel(rows, 'hr-attendance-' + dateF)}><Download className="h-4 w-4" />Export</Button>
                <Button variant="outline" size="sm" className="gap-1" onClick={load} disabled={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><TH>Emp ID</TH><TH>Name</TH><TH>Department</TH><TH>Check-In</TH><TH>Check-Out</TH><TH>Hours</TH><TH>Source</TH><TH>Status</TH></tr></thead>
                  <tbody className="divide-y">
                    {rows.map(r => (
                      <tr key={r.staffId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <TD><span className="font-mono text-xs">{r.employeeCode}</span></TD>
                        <TD><span className="font-medium">{r.name}</span></TD>
                        <TD>{r.department}</TD>
                        <TD><span className="font-mono">{r.checkIn || '-'}</span></TD>
                        <TD><span className="font-mono">{r.checkOut || '-'}</span></TD>
                        <TD><span className="font-mono">{r.hours === null || r.hours === undefined ? '-' : r.hours + 'h'}</span></TD>
                        <TD><div className="text-xs"><span>{r.source}</span><p className="text-muted-foreground">{r.deviceName || r.events + ' events'}</p></div></TD>
                        <TD><Bdg s={statusLabel(r.status)} /></TD>
                      </tr>
                    ))}
                    {!loading && rows.length === 0 && <tr><TD><span className="text-muted-foreground">No attendance rows for this date</span></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Latest Biometric Audit</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><TH>Time</TH><TH>Staff</TH><TH>Event</TH><TH>Device</TH><TH>Source</TH></tr></thead>
                  <tbody className="divide-y">
                    {audit.slice(0, 12).map(event => (
                      <tr key={event.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <TD>{new Date(event.eventAt).toLocaleString()}</TD>
                        <TD>{(event.firstName || event.lastName) ? ((event.firstName || '') + ' ' + (event.lastName || '')).trim() : event.employeeCode || event.biometricUserId || '-'}</TD>
                        <TD>{event.eventType.replace('_', ' ')}</TD>
                        <TD>{event.deviceName || event.deviceUid || '-'}</TD>
                        <TD>{event.source}</TD>
                      </tr>
                    ))}
                    {audit.length === 0 && <tr><TD><span className="text-muted-foreground">No biometric events captured yet</span></TD><TD></TD><TD></TD><TD></TD><TD></TD></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Edit className="h-4 w-4" />Manual Punch</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={recordManual}>
                <select required className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={manual.staffId} onChange={e => setManual({ ...manual, staffId: e.target.value })}><option value="">Select staff</option>{staffRows.map(s => <option key={s.id} value={s.id}>{s.employeeCode} - {s.name}</option>)}</select>
                <div className="grid grid-cols-2 gap-2"><select className="h-10 text-sm border rounded-md px-2 bg-background" value={manual.eventType} onChange={e => setManual({ ...manual, eventType: e.target.value })}><option value="check_in">Check in</option><option value="check_out">Check out</option></select><Input type="date" value={manual.date} onChange={e => setManual({ ...manual, date: e.target.value })} /></div>
                <Input type="time" value={manual.time} onChange={e => setManual({ ...manual, time: e.target.value })} />
                <Input placeholder="Correction note" value={manual.note} onChange={e => setManual({ ...manual, note: e.target.value })} />
                <Button type="submit" className="w-full gap-1 bg-teal-600 hover:bg-teal-700" disabled={saving}><CalendarCheck className="h-4 w-4" />Record Punch</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Fingerprint className="h-4 w-4" />Device Event Sync</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={ingestDeviceEvent}>
                <select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={syncEvent.deviceUid} onChange={e => setSyncEvent({ ...syncEvent, deviceUid: e.target.value })}><option value="">Unmapped device</option>{devices.map(d => <option key={d.deviceUid} value={d.deviceUid}>{d.name} ({d.deviceUid})</option>)}</select>
                <Input placeholder="Employee code" value={syncEvent.employeeCode} onChange={e => setSyncEvent({ ...syncEvent, employeeCode: e.target.value })} />
                <Input placeholder="Biometric user ID" value={syncEvent.biometricUserId} onChange={e => setSyncEvent({ ...syncEvent, biometricUserId: e.target.value })} />
                <div className="grid grid-cols-2 gap-2"><select className="h-10 text-sm border rounded-md px-2 bg-background" value={syncEvent.eventType} onChange={e => setSyncEvent({ ...syncEvent, eventType: e.target.value })}><option value="check_in">Check in</option><option value="check_out">Check out</option></select><Input type="date" value={syncEvent.date} onChange={e => setSyncEvent({ ...syncEvent, date: e.target.value })} /></div>
                <Input type="time" value={syncEvent.time} onChange={e => setSyncEvent({ ...syncEvent, time: e.target.value })} />
                <Button type="submit" variant="outline" className="w-full gap-1" disabled={saving}><Database className="h-4 w-4" />Ingest Event</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Device Health</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {devices.map(device => <div key={device.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"><div><p className="font-medium">{device.name}</p><p className="text-xs text-muted-foreground">{device.location || device.deviceUid}</p></div>{device.status === 'online' ? <Wifi className="h-4 w-4 text-emerald-600" /> : <WifiOff className="h-4 w-4 text-slate-500" />}</div>)}
              {devices.length === 0 && <p className="text-sm text-muted-foreground">Register a biometric device from Staff Directory.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </Wrap>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. LEAVE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════
export const HRLeavesPage = () => {
  const [tab, setTab] = useState<'requests' | 'balance'>('requests');
  const [rows, setRows] = useState<any[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [form, setForm] = useState({ staffId: '', leaveType: 'Casual', startDate: todayDate(), endDate: todayDate(), reason: '' });
  const [message, setMessage] = useState('');
  const load = async () => {
    try {
      const [leavesRes, staffRes, summaryRes] = await Promise.all([api.get('/hr/leaves', { headers: hrHeaders() }), api.get('/hr/staff', { headers: hrHeaders() }), api.get('/hr/leaves/summary', { headers: hrHeaders() })]);
      setRows(unwrapData<any[]>(leavesRes, [])); setStaff(unwrapData<StaffMember[]>(staffRes, [])); setSummary(unwrapData<any>(summaryRes, null));
    } catch (error) { setMessage(errText(error)); }
  };
  useEffect(() => { load(); }, []);
  const applyLeave = async (event: React.FormEvent) => { event.preventDefault(); try { await api.post('/hr/leaves', form, { headers: hrHeaders() }); setForm({ staffId: '', leaveType: 'Casual', startDate: todayDate(), endDate: todayDate(), reason: '' }); setMessage('Leave request created.'); await load(); } catch (error) { setMessage(errText(error)); } };
  const setStatus = async (id: number | string, status: string) => { try { await api.patch('/hr/leaves/' + id + '/status', { status }, { headers: hrHeaders() }); await load(); } catch (error) { setMessage(errText(error)); } };
  const balances = ['Casual Leave', 'Medical Leave', 'Annual Leave', 'Maternity', 'LOP'].map(type => ({ type, allotted: type === 'Maternity' ? 90 : type === 'LOP' ? 0 : type === 'Annual Leave' ? 21 : 12, used: rows.filter(r => String(r.leaveType || '').toLowerCase().startsWith(type.split(' ')[0].toLowerCase()) && r.status === 'approved').reduce((sum, r) => sum + Number(r.days || 0), 0) }));
  return <Wrap title="Leave Management" subtitle="Apply, approve, and track employee leaves through HR APIs">
    {message && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>}
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6"><KPI label="On Leave Today" value={String(summary?.onLeaveToday ?? 0)} sub="Approved active leave" icon={CalendarOff} color="text-amber-600" /><KPI label="Pending Approval" value={String(summary?.pending ?? 0)} sub="Requires HR action" icon={AlertCircle} color="text-red-600" /><KPI label="Approved (Month)" value={String(summary?.approvedMonth ?? 0)} sub="Current month" icon={CheckCircle2} color="text-emerald-600" /><KPI label="LOP (Month)" value={String(summary?.lopDays ?? 0)} sub="Loss of pay days" icon={XCircle} color="text-red-600" /></div>
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6"><div><div className="flex gap-2 mb-4">{(['requests','balance'] as const).map(t => <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === t ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{t === 'requests' ? 'Leave Requests' : 'Leave Balance'}</button>)}</div>{tab === 'requests' ? <Card><CardContent className="pt-4"><table className="w-full text-sm"><thead><tr className="border-b"><TH>ID</TH><TH>Employee</TH><TH>Type</TH><TH>From</TH><TH>To</TH><TH>Days</TH><TH>Reason</TH><TH>Status</TH><TH>Actions</TH></tr></thead><tbody className="divide-y">{rows.map(l => <tr key={l.id}><TD><span className="font-mono text-xs">LV{l.id}</span></TD><TD><span className="font-medium">{[l.firstName,l.lastName].filter(Boolean).join(' ') || '-'}</span><br /><span className="text-xs text-muted-foreground">{l.staffMetadata?.department || '-'}</span></TD><TD>{l.leaveType}</TD><TD>{displayDate(l.startDate)}</TD><TD>{displayDate(l.endDate)}</TD><TD center>{Number(l.days || 0)}</TD><TD><span className="text-xs text-muted-foreground">{l.reason || '-'}</span></TD><TD><Bdg s={statusLabel(l.status)} /></TD><TD><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setStatus(l.id, 'approved')}>Approve</Button><Button size="sm" variant="ghost" onClick={() => setStatus(l.id, 'rejected')}>Reject</Button></div></TD></tr>)}</tbody></table></CardContent></Card> : <Card><CardContent className="pt-4"><table className="w-full text-sm"><thead><tr className="border-b"><TH>Leave Type</TH><TH>Allotted</TH><TH>Used</TH><TH>Balance</TH></tr></thead><tbody>{balances.map(b => <tr key={b.type}><TD>{b.type}</TD><TD center>{b.allotted}</TD><TD center>{b.used}</TD><TD center><span className={b.allotted - b.used < 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>{b.allotted - b.used}</span></TD></tr>)}</tbody></table></CardContent></Card>}</div><Card><CardHeader><CardTitle className="text-base">Apply Leave</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={applyLeave}><select required className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={form.staffId} onChange={e => setForm({ ...form, staffId: e.target.value })}><option value="">Select staff</option>{staff.map(s => <option key={s.id} value={s.id}>{s.employeeCode} - {s.name}</option>)}</select><select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={form.leaveType} onChange={e => setForm({ ...form, leaveType: e.target.value })}><option>Casual</option><option>Medical</option><option>Annual</option><option>Maternity</option><option>LOP</option></select><div className="grid grid-cols-2 gap-2"><Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /><Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></div><Input placeholder="Reason" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /><Button className="w-full bg-teal-600 hover:bg-teal-700">Submit</Button></form></CardContent></Card></div>
  </Wrap>;
};

// ═══════════════════════════════════════════════════════════════════════════════
// 4. SHIFTS & ROSTER
// ═══════════════════════════════════════════════════════════════════════════════
export const HRShiftsPage = () => {
  const [rows, setRows] = useState<any[]>([]); const [staff, setStaff] = useState<StaffMember[]>([]); const [locations, setLocations] = useState<HrLocation[]>([]); const [date, setDate] = useState(todayDate()); const [message, setMessage] = useState('');
  const [form, setForm] = useState({ staffId: '', locationId: '', shiftName: 'Morning', shiftStart: '06:00', shiftEnd: '14:00', rosterDate: todayDate(), notes: '' });
  const load = async () => { try { const [r,s,l] = await Promise.all([api.get('/hr/shifts?date=' + date, { headers: hrHeaders() }), api.get('/hr/staff', { headers: hrHeaders() }), api.get('/hr/locations', { headers: hrHeaders() })]); setRows(unwrapData<any[]>(r, [])); setStaff(unwrapData<StaffMember[]>(s, [])); setLocations(unwrapData<HrLocation[]>(l, [])); } catch (error) { setMessage(errText(error)); } };
  useEffect(() => { load(); }, [date]);
  const save = async (event: React.FormEvent) => { event.preventDefault(); try { await api.post('/hr/shifts', form, { headers: hrHeaders() }); setMessage('Shift assigned.'); await load(); } catch (error) { setMessage(errText(error)); } };
  return <Wrap title="Shifts & Roster" subtitle="Weekly shift scheduling and branch-aware roster management"><div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6"><KPI label="Roster Entries" value={String(rows.length)} sub="Visible window" icon={CalendarCheck} color="text-teal-600" /><KPI label="Morning" value={String(rows.filter(r => /morning/i.test(r.shiftName)).length)} sub="Early shift" icon={Clock} color="text-amber-600" /><KPI label="Night" value={String(rows.filter(r => /night/i.test(r.shiftName)).length)} sub="Night coverage" icon={Star} color="text-blue-600" /><KPI label="Locations" value={String(locations.length)} sub="Branch coverage" icon={Building2} color="text-slate-600" /></div>{message && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>}<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6"><Card><CardHeader className="flex flex-row items-center justify-between pb-3"><CardTitle className="text-base">Roster</CardTitle><Input className="h-8 w-40" type="date" value={date} onChange={e => setDate(e.target.value)} /></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><TH>Employee</TH><TH>Location</TH><TH>Shift</TH><TH>Date</TH><TH>Time</TH><TH>Status</TH></tr></thead><tbody className="divide-y">{rows.map(r => <tr key={r.id}><TD><span className="font-medium">{[r.firstName,r.lastName].filter(Boolean).join(' ') || '-'}</span><p className="text-xs text-muted-foreground">{r.staffMetadata?.department || '-'}</p></TD><TD>{r.locationName || '-'}</TD><TD>{r.shiftName}</TD><TD>{displayDate(r.rosterDate)}</TD><TD>{(r.shiftStart || '').slice(0,5)}-{(r.shiftEnd || '').slice(0,5)}</TD><TD><Bdg s={statusLabel(r.status)} /></TD></tr>)}</tbody></table></div></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Assign Shift</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={save}><select required className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={form.staffId} onChange={e => setForm({ ...form, staffId: e.target.value })}><option value="">Select staff</option>{staff.map(s => <option key={s.id} value={s.id}>{s.employeeCode} - {s.name}</option>)}</select><select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={form.locationId} onChange={e => setForm({ ...form, locationId: e.target.value })}><option value="">No location</option>{locations.map(l => <option key={l.id} value={l.id}>{l.code} - {l.name}</option>)}</select><Input placeholder="Shift name" value={form.shiftName} onChange={e => setForm({ ...form, shiftName: e.target.value })} /><div className="grid grid-cols-2 gap-2"><Input type="time" value={form.shiftStart} onChange={e => setForm({ ...form, shiftStart: e.target.value })} /><Input type="time" value={form.shiftEnd} onChange={e => setForm({ ...form, shiftEnd: e.target.value })} /></div><Input type="date" value={form.rosterDate} onChange={e => setForm({ ...form, rosterDate: e.target.value })} /><Button className="w-full bg-teal-600 hover:bg-teal-700">Assign</Button></form></CardContent></Card></div></Wrap>;
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5. ONBOARDING
// ═══════════════════════════════════════════════════════════════════════════════
export const HROnboardingPage = () => {
  const [rows, setRows] = useState<any[]>([]); const [form, setForm] = useState({ staffId: '', taskKey: 'documents', taskLabel: 'Documents', dueDate: todayDate() }); const [message, setMessage] = useState('');
  const load = async () => { try { const r = await api.get('/hr/onboarding', { headers: hrHeaders() }); setRows(unwrapData<any[]>(r, [])); } catch (error) { setMessage(errText(error)); } };
  useEffect(() => { load(); }, []);
  const saveTask = async (event: React.FormEvent) => { event.preventDefault(); try { await api.post('/hr/onboarding/tasks', form, { headers: hrHeaders() }); setMessage('Onboarding task saved.'); await load(); } catch (error) { setMessage(errText(error)); } };
  const done = async (id: number | string) => { try { await api.patch('/hr/onboarding/tasks/' + id + '/status', { status: 'completed' }, { headers: hrHeaders() }); await load(); } catch (error) { setMessage(errText(error)); } };
  const active = rows.filter(r => (r.tasks || []).some((t: any) => t.status !== 'completed')).length;
  return <Wrap title="Employee Onboarding" subtitle="Track onboarding progress, documents, IDs, access, training, and payroll setup"><div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6"><KPI label="Active Onboarding" value={String(active)} sub="Pending task owners" icon={UserPlus} color="text-teal-600" /><KPI label="Staff Tracked" value={String(rows.length)} sub="Active employees" icon={Users} color="text-blue-600" /><KPI label="Pending Tasks" value={String(rows.reduce((n,r)=>n+(r.tasks||[]).filter((t:any)=>t.status!=='completed').length,0))} sub="Need action" icon={AlertCircle} color="text-amber-600" /><KPI label="Completed Tasks" value={String(rows.reduce((n,r)=>n+(r.tasks||[]).filter((t:any)=>t.status==='completed').length,0))} sub="Across staff" icon={CheckCircle2} color="text-emerald-600" /></div>{message && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>}<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6"><div className="space-y-4">{rows.map(emp => { const tasks = emp.tasks || []; const pct = tasks.length ? Math.round(tasks.filter((t:any)=>t.status==='completed').length / tasks.length * 100) : 0; return <Card key={emp.id}><CardContent className="pt-4"><div className="flex items-start justify-between mb-3"><div><p className="font-semibold">{emp.name}</p><p className="text-xs text-muted-foreground">{emp.designation} · {emp.department}</p></div><span className="text-sm font-bold text-teal-600">{pct}%</span></div><div className="grid grid-cols-2 md:grid-cols-3 gap-2">{tasks.map((t:any)=><button key={t.id} onClick={()=>done(t.id)} className={`flex items-center gap-2 text-xs rounded-md border px-2 py-1.5 ${t.status==='completed'?'bg-emerald-50 border-emerald-200 text-emerald-700':'bg-slate-50 text-slate-600'}`}>{t.status==='completed'?<CheckCircle2 className="h-3.5 w-3.5" />:<Clock className="h-3.5 w-3.5" />}{t.taskLabel}</button>)}</div></CardContent></Card> })}</div><Card><CardHeader><CardTitle className="text-base">Add Task</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={saveTask}><select required className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={form.staffId} onChange={e=>setForm({...form,staffId:e.target.value})}><option value="">Select staff</option>{rows.map(r=><option key={r.id} value={r.id}>{r.employeeCode} - {r.name}</option>)}</select><select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={form.taskKey} onChange={e=>setForm({...form,taskKey:e.target.value,taskLabel:e.target.selectedOptions[0].text})}><option value="documents">Documents</option><option value="id_card">ID Card</option><option value="email_setup">Email Setup</option><option value="training">Training</option><option value="mentor">Mentor Assigned</option><option value="payroll">Payroll Setup</option></select><Input type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/><Button className="w-full bg-teal-600 hover:bg-teal-700">Save Task</Button></form></CardContent></Card></div></Wrap>;
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5A. TIMESHEETS
// ═══════════════════════════════════════════════════════════════════════════════
export const HRTimesheetsPage = () => {
  const [rows,setRows]=useState<any[]>([]); const [staff,setStaff]=useState<StaffMember[]>([]); const [date,setDate]=useState(todayDate()); const [message,setMessage]=useState(''); const [form,setForm]=useState({staffId:'',workDate:todayDate(),task:'General duty',hours:8,notes:''});
  const load=async()=>{try{const [r,s]=await Promise.all([api.get('/hr/timesheets?date='+date,{headers:hrHeaders()}),api.get('/hr/staff',{headers:hrHeaders()})]);setRows(unwrapData<any[]>(r,[]));setStaff(unwrapData<StaffMember[]>(s,[]));}catch(e){setMessage(errText(e));}}; useEffect(()=>{load();},[date]);
  const save=async(e:React.FormEvent)=>{e.preventDefault();try{await api.post('/hr/timesheets',form,{headers:hrHeaders()});setMessage('Timesheet submitted.');await load();}catch(err){setMessage(errText(err));}}; const status=async(id:any,st:string)=>{try{await api.patch('/hr/timesheets/'+id+'/status',{status:st},{headers:hrHeaders()});await load();}catch(e){setMessage(errText(e));}};
  return <Wrap title="Timesheets" subtitle="Submitted hours, approvals, and duty logs"><div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6"><KPI label="Entries" value={String(rows.length)} sub="Selected week" icon={FileText} color="text-teal-600"/><KPI label="Hours" value={String(rows.reduce((n,r)=>n+Number(r.hours||0),0))} sub="Submitted" icon={Clock} color="text-blue-600"/><KPI label="Pending" value={String(rows.filter(r=>r.status==='submitted').length)} sub="Approval queue" icon={AlertCircle} color="text-amber-600"/><KPI label="Approved" value={String(rows.filter(r=>r.status==='approved').length)} sub="Ready for payroll" icon={CheckCircle2} color="text-emerald-600"/></div>{message&&<div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>}<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6"><Card><CardHeader className="flex flex-row items-center justify-between pb-3"><CardTitle className="text-base">Weekly Timesheets</CardTitle><Input className="h-8 w-40" type="date" value={date} onChange={e=>setDate(e.target.value)}/></CardHeader><CardContent><table className="w-full text-sm"><thead><tr className="border-b"><TH>Employee</TH><TH>Date</TH><TH>Task</TH><TH>Hours</TH><TH>Status</TH><TH>Actions</TH></tr></thead><tbody>{rows.map(r=><tr key={r.id}><TD>{[r.firstName,r.lastName].filter(Boolean).join(' ')}</TD><TD>{displayDate(r.workDate)}</TD><TD>{r.task}</TD><TD center>{Number(r.hours||0)}</TD><TD><Bdg s={statusLabel(r.status)}/></TD><TD><Button size="sm" variant="ghost" onClick={()=>status(r.id,'approved')}>Approve</Button></TD></tr>)}</tbody></table></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Add Timesheet</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={save}><select required className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={form.staffId} onChange={e=>setForm({...form,staffId:e.target.value})}><option value="">Select staff</option>{staff.map(s=><option key={s.id} value={s.id}>{s.employeeCode} - {s.name}</option>)}</select><Input type="date" value={form.workDate} onChange={e=>setForm({...form,workDate:e.target.value})}/><Input value={form.task} onChange={e=>setForm({...form,task:e.target.value})}/><Input type="number" min="0" step="0.25" value={form.hours} onChange={e=>setForm({...form,hours:Number(e.target.value)})}/><Input placeholder="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/><Button className="w-full bg-teal-600 hover:bg-teal-700">Submit</Button></form></CardContent></Card></div></Wrap>;
};


// ═══════════════════════════════════════════════════════════════════════════════
// 5B. DOCUMENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════
export const HRDocumentsPage = () => {
  const [docs,setDocs]=useState<any[]>([]); const [staff,setStaff]=useState<StaffMember[]>([]); const [file,setFile]=useState<File|null>(null); const [form,setForm]=useState({staffId:'',documentType:'id_proof'}); const [message,setMessage]=useState('');
  const load=async()=>{try{const [d,s]=await Promise.all([api.get('/hr/documents',{headers:hrHeaders()}),api.get('/hr/staff',{headers:hrHeaders()})]);setDocs(unwrapData<any[]>(d,[]));setStaff(unwrapData<StaffMember[]>(s,[]));}catch(e){setMessage(errText(e));}}; useEffect(()=>{load();},[]);
  const upload=async(e:React.FormEvent)=>{e.preventDefault(); if(!file) return setMessage('Select a document file.'); try{const fd=new FormData(); fd.append('document',file); if(form.staffId) fd.append('staffId',form.staffId); fd.append('documentType',form.documentType); await api.post('/hr/documents',fd,{headers:hrHeaders()}); setFile(null); setMessage('Document stored.'); await load();}catch(err){setMessage(errText(err));}};
  const verify=async(id:any,status:string)=>{try{await api.patch('/hr/documents/'+id+'/verify',{status},{headers:hrHeaders()});await load();}catch(e){setMessage(errText(e));}};
  return <Wrap title="Document Management" subtitle="Employee documents, verification, and secure HR storage"><div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6"><KPI label="Documents" value={String(docs.length)} sub="Stored" icon={FileText} color="text-teal-600"/><KPI label="Verified" value={String(docs.filter(d=>d.verificationStatus==='verified').length)} sub="Approved" icon={CheckCircle2} color="text-emerald-600"/><KPI label="Pending" value={String(docs.filter(d=>d.verificationStatus==='pending').length)} sub="Needs review" icon={AlertCircle} color="text-amber-600"/><KPI label="Staff" value={String(new Set(docs.map(d=>d.staffId).filter(Boolean)).size)} sub="With documents" icon={Users} color="text-blue-600"/></div>{message&&<div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>}<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6"><Card><CardHeader><CardTitle className="text-base">Employee Documents</CardTitle></CardHeader><CardContent><table className="w-full text-sm"><thead><tr className="border-b"><TH>Employee</TH><TH>Type</TH><TH>File</TH><TH>Size</TH><TH>Status</TH><TH>Actions</TH></tr></thead><tbody>{docs.map(d=><tr key={d.id}><TD>{[d.firstName,d.lastName].filter(Boolean).join(' ')||'Unassigned'}</TD><TD>{benefitLabel(d.documentType)}</TD><TD><span className="font-medium">{d.originalName}</span><p className="text-xs text-muted-foreground">{d.storageProvider}</p></TD><TD>{bytesLabel(d.fileSize)}</TD><TD><Bdg s={statusLabel(d.verificationStatus)}/></TD><TD><Button size="sm" variant="ghost" onClick={()=>verify(d.id,'verified')}>Verify</Button></TD></tr>)}</tbody></table></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Upload Document</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={upload}><select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={form.staffId} onChange={e=>setForm({...form,staffId:e.target.value})}><option value="">Unassigned</option>{staff.map(s=><option key={s.id} value={s.id}>{s.employeeCode} - {s.name}</option>)}</select><select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={form.documentType} onChange={e=>setForm({...form,documentType:e.target.value})}><option value="id_proof">ID proof</option><option value="address_proof">Address proof</option><option value="qualification">Qualification</option><option value="license">License</option><option value="contract">Contract</option><option value="other">Other</option></select><Input type="file" onChange={e=>setFile(e.target.files?.[0]||null)}/><Button className="w-full bg-teal-600 hover:bg-teal-700">Store Document</Button></form></CardContent></Card></div></Wrap>;
};

// ═══════════════════════════════════════════════════════════════════════════════
// 6. PAYROLL
// ═══════════════════════════════════════════════════════════════════════════════
type PayrollLine = {
  employeeCode: string;
  employeeName: string;
  department?: string;
  gross: number;
  pf: number;
  esi: number;
  tds: number;
  otherDeductions: number;
  net: number;
};
const fmt = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');

export const HRPayrollPage = () => {
  const [structures, setStructures] = useState<any[]>([]);
  const [latestRun, setLatestRun] = useState<any>(null);
  const [lines, setLines] = useState<PayrollLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('hrToken') || localStorage.getItem('hospitalToken') || ''}` });
  const refresh = async () => {
    setLoading(true);
    setMessage('');
    try {
      const [structureRes, runRes] = await Promise.all([
        api.get('/payroll/structures', { headers: headers() }),
        api.get('/payroll/runs', { headers: headers() }),
      ]);
      setStructures(structureRes.data.data || []);
      const run = (runRes.data.data || [])[0] || null;
      setLatestRun(run);
      if (run) {
        const detail = await api.get(`/payroll/runs/${run.id}`, { headers: headers() });
        setLines(detail.data.data.lines || []);
      } else {
        setLines([]);
      }
    } catch (error) {
      setMessage(errText(error));
      setStructures([]);
      setLatestRun(null);
      setLines([]);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);
  const runPayroll = async () => {
    setMessage('');
    try {
      await api.post('/payroll/runs', { month: new Date().toISOString().slice(0,7) }, { headers: headers() });
      await refresh();
    } catch (error) {
      setMessage(errText(error));
    }
  };
  const seedStructure = async () => {
    setMessage('');
    try {
      await api.post('/payroll/structures', { employeeCode: `EMP-${Date.now()}`, employeeName: 'New Employee', department: 'General', designation: 'Staff', basic: 30000, hra: 12000, allowances: 3000 }, { headers: headers() });
      await refresh();
    } catch (error) {
      setMessage(errText(error));
    }
  };
  return (
    <Wrap title="Payroll Processing" subtitle="Monthly salary computation and disbursement">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KPI label="Active Structures" value={String(structures.length)} sub="Employees configured" icon={Wallet} color="text-teal-600" />
        <KPI label="Gross Payable" value={fmt(latestRun?.gross_total || 0)} sub={latestRun?.month || 'No run yet'} icon={CheckCircle2} color="text-emerald-600" />
        <KPI label="PF Contribution" value={fmt(latestRun?.pf_total || 0)} sub="Employee contribution" icon={ShieldCheck} color="text-blue-600" />
        <KPI label="Net Disbursable" value={fmt(latestRun?.net_total || 0)} sub={latestRun?.status || 'draft'} icon={FileText} color="text-amber-600" />
      </div>
      {message && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Payroll Register</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={seedStructure}>Add Sample Structure</Button>
            <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={runPayroll}><CheckCircle2 className="h-4 w-4" />Run Payroll</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Loading payroll...</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b"><TH>Emp ID</TH><TH>Name</TH><TH>Department</TH><TH>Gross</TH><TH>PF</TH><TH>ESI</TH><TH>TDS</TH><TH>Other Ded.</TH><TH>Net Pay</TH></tr></thead>
                <tbody className="divide-y">{lines.map((r) => <tr key={r.employeeCode}><TD>{r.employeeCode}</TD><TD>{r.employeeName}</TD><TD>{r.department}</TD><TD>{fmt(r.gross)}</TD><TD>{fmt(r.pf)}</TD><TD>{fmt(r.esi)}</TD><TD>{fmt(r.tds)}</TD><TD>{fmt(r.otherDeductions)}</TD><TD className="font-bold text-emerald-700">{fmt(r.net)}</TD></tr>)}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </Wrap>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 7. PF & ESI (NEW)
// ═══════════════════════════════════════════════════════════════════════════════
const pfesi = [
  { month: 'Mar-2026', employees: 466, pfEmployee: 980000, pfEmployer: 1100000, esi: 420000, totalPF: 2080000, status: 'Pending' },
  { month: 'Feb-2026', employees: 461, pfEmployee: 970000, pfEmployer: 1090000, esi: 415000, totalPF: 2060000, status: 'Filed' },
  { month: 'Jan-2026', employees: 458, pfEmployee: 965000, pfEmployer: 1085000, esi: 412000, totalPF: 2050000, status: 'Filed' },
  { month: 'Dec-2025', employees: 455, pfEmployee: 960000, pfEmployer: 1080000, esi: 410000, totalPF: 2040000, status: 'Filed' },
];

export const HRPfEsiPage = () => (
  <Wrap title="PF & ESI" subtitle="Provident Fund and ESI contribution register & challan">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <KPI label="PF Account No."  value="KN/25894" sub="Registered with EPFO"    icon={ShieldCheck} color="text-teal-600" />
      <KPI label="ESI Account No." value="32-00001" sub="Registered with ESIC"    icon={ShieldCheck} color="text-blue-600" />
      <KPI label="PF Rate"         value="12%"      sub="Employee & Employer each" icon={Wallet}      color="text-emerald-600" />
      <KPI label="ESI Rate"        value="3.25%"    sub="Employer / 0.75% Employee" icon={FileText}   color="text-amber-600" />
    </div>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">PF & ESI Challan Register</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Download Challan</Button>
          <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Generate Challan</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b"><TH>Month</TH><TH>Employees</TH><TH>PF (Employee)</TH><TH>PF (Employer)</TH><TH>ESI</TH><TH>Total PF</TH><TH>Status</TH></tr></thead>
            <tbody className="divide-y">
              {pfesi.map(r => (
                <tr key={r.month} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD><span className="font-medium">{r.month}</span></TD>
                  <TD center>{r.employees}</TD>
                  <TD>{fmt(r.pfEmployee)}</TD>
                  <TD>{fmt(r.pfEmployer)}</TD>
                  <TD>{fmt(r.esi)}</TD>
                  <TD><span className="font-bold">{fmt(r.totalPF)}</span></TD>
                  <TD><Bdg s={r.status} /></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 8. BENEFITS
// ═══════════════════════════════════════════════════════════════════════════════
type BenefitProgram = {
  id: number | string;
  name: string;
  provider: string;
  benefitType: string;
  coverage?: string | null;
  enrolledCount: number;
  annualCost: number;
  renewalDate?: string | null;
  status: string;
  complianceNotes?: string | null;
};

type BenefitSummary = {
  total: number;
  active: number;
  annualCost: number;
  enrolled: number;
  renewalsDue: number;
  attentionRequired: number;
};

const benefitLabel = (value: string) => String(value || '').split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
const makeBenefitForm = () => ({
  name: '',
  provider: 'Internal',
  benefitType: 'wellness',
  coverage: '',
  enrolledCount: 0,
  annualCost: 0,
  renewalDate: '',
  status: 'active',
  complianceNotes: '',
});
const benefitStatusLabel = (status: string) => {
  if (status === 'active') return 'Active';
  if (status === 'inactive') return 'Inactive';
  if (status === 'renewal_due') return 'Due';
  if (status === 'expired') return 'Overdue';
  return benefitLabel(status);
};

export const HRBenefitsPage = () => {
  const [benefits, setBenefits] = useState<BenefitProgram[]>([]);
  const [summary, setSummary] = useState<BenefitSummary | null>(null);
  const [form, setForm] = useState(makeBenefitForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setMessage('');
    try {
      const [benefitRes, summaryRes] = await Promise.all([
        api.get('/hr/benefits', { headers: hrHeaders() }),
        api.get('/hr/benefits/summary', { headers: hrHeaders() }),
      ]);
      setBenefits(unwrapData<BenefitProgram[]>(benefitRes, []));
      setSummary(unwrapData<BenefitSummary | null>(summaryRes, null));
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const addBenefit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/hr/benefits', form, { headers: hrHeaders() });
      setForm(makeBenefitForm());
      setMessage('Benefit program saved. Renewal and enrollment KPIs have been refreshed.');
      await load();
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Wrap title="Employee Benefits" subtitle="Insurance, allowances, wellness benefits, renewals, and compliance tracking">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KPI label="Active Benefits" value={String(summary?.active ?? benefits.filter(b => b.status === 'active').length)} sub={(summary?.total ?? benefits.length) + ' total programs'} icon={Gift} color="text-teal-600" />
        <KPI label="Annual Cost" value={fmt(summary?.annualCost ?? benefits.reduce((sum, b) => sum + Number(b.annualCost || 0), 0))} sub="Benefit budget exposure" icon={Wallet} color="text-emerald-600" />
        <KPI label="Enrolled Lives" value={String(summary?.enrolled ?? benefits.reduce((sum, b) => sum + Number(b.enrolledCount || 0), 0))} sub="Across all benefit programs" icon={ShieldCheck} color="text-blue-600" />
        <KPI label="Renewals Due" value={String(summary?.renewalsDue ?? 0)} sub={(summary?.attentionRequired ?? 0) + ' need attention'} icon={AlertCircle} color="text-amber-600" />
      </div>

      {message && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>}

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_380px] gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Benefits Register</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1" onClick={() => exportToExcel(benefits, 'hr-benefits')}><Download className="h-4 w-4" />Export</Button>
              <Button variant="outline" size="sm" className="gap-1" onClick={load} disabled={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b"><TH>Benefit</TH><TH>Provider</TH><TH>Type</TH><TH>Coverage</TH><TH>Enrolled</TH><TH>Annual Cost</TH><TH>Renewal</TH><TH>Status</TH></tr></thead>
                <tbody className="divide-y">
                  {benefits.map(b => (
                    <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TD><span className="font-medium">{b.name}</span>{b.complianceNotes && <p className="text-xs text-muted-foreground">{b.complianceNotes}</p>}</TD>
                      <TD>{b.provider}</TD>
                      <TD>{benefitLabel(b.benefitType)}</TD>
                      <TD>{b.coverage || '-'}</TD>
                      <TD center><span className="font-semibold">{Number(b.enrolledCount || 0).toLocaleString('en-IN')}</span></TD>
                      <TD><span className="font-semibold text-emerald-700">{fmt(b.annualCost || 0)}</span></TD>
                      <TD>{b.renewalDate ? displayDate(b.renewalDate) : '-'}</TD>
                      <TD><Bdg s={benefitStatusLabel(b.status)} /></TD>
                    </tr>
                  ))}
                  {!loading && benefits.length === 0 && <tr><TD><span className="text-muted-foreground">No benefit programs configured yet</span></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><PlusCircle className="h-4 w-4" />Add Benefit</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={addBenefit}>
              <Input required placeholder="Benefit name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <div className="grid grid-cols-2 gap-2"><Input placeholder="Provider" value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} /><select className="h-10 text-sm border rounded-md px-2 bg-background" value={form.benefitType} onChange={e => setForm({ ...form, benefitType: e.target.value })}><option value="insurance">Insurance</option><option value="wellness">Wellness</option><option value="allowance">Allowance</option><option value="subsidy">Subsidy</option><option value="retirement">Retirement</option></select></div>
              <Input placeholder="Coverage or entitlement" value={form.coverage} onChange={e => setForm({ ...form, coverage: e.target.value })} />
              <div className="grid grid-cols-2 gap-2"><Input type="number" min={0} placeholder="Enrolled" value={form.enrolledCount} onChange={e => setForm({ ...form, enrolledCount: Number(e.target.value) })} /><Input type="number" min={0} placeholder="Annual cost" value={form.annualCost} onChange={e => setForm({ ...form, annualCost: Number(e.target.value) })} /></div>
              <div className="grid grid-cols-2 gap-2"><Input type="date" value={form.renewalDate} onChange={e => setForm({ ...form, renewalDate: e.target.value })} /><select className="h-10 text-sm border rounded-md px-2 bg-background" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="renewal_due">Renewal due</option><option value="inactive">Inactive</option><option value="expired">Expired</option></select></div>
              <textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Compliance notes, eligibility rules, renewal owner" value={form.complianceNotes} onChange={e => setForm({ ...form, complianceNotes: e.target.value })} />
              <Button type="submit" className="w-full gap-1 bg-teal-600 hover:bg-teal-700" disabled={saving}><Gift className="h-4 w-4" />Save Benefit</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Wrap>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 9. RECRUITMENT
// ═══════════════════════════════════════════════════════════════════════════════
type RecruitmentRequisition = {
  id: number | string;
  requisitionCode: string;
  title: string;
  department: string;
  role: string;
  openings: number;
  priority: string;
  status: string;
  location?: string | null;
  employmentType?: string;
  experienceMin: number;
  experienceMax: number;
  skills: string[];
  description?: string | null;
  aiJobBrief?: { headline?: string; mustHave?: string[]; screeningCriteria?: string[]; interviewFocus?: string[] };
  applicants: number;
  shortlisted: number;
  interviews: number;
  offers: number;
  hired: number;
  createdAt?: string;
};

type RecruitmentCandidate = {
  id: number | string;
  requisitionId?: number | string | null;
  requisitionCode?: string | null;
  requisitionTitle?: string | null;
  candidateCode: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  currentRole?: string | null;
  experienceYears: number;
  source: string;
  stage: string;
  resumeText?: string | null;
  skills: string[];
  aiScore?: number | null;
  aiSummary?: string | null;
  aiRecommendation?: string | null;
  aiRisks?: string[];
  expectedCtc?: number | null;
  noticePeriodDays?: number | null;
  metadata?: any;
  createdAt?: string;
};

type RecruitmentSummary = {
  open_positions: number;
  openings: number;
  candidates: number;
  shortlisted: number;
  upcoming_interviews: number;
  offers: number;
  hired_month: number;
};

type CvDocument = {
  id: number | string;
  candidateId?: number | string | null;
  originalName: string;
  fileSize: number;
  storageProvider: string;
  publicUrl?: string | null;
  aiSummary?: string | null;
  aiSkills?: string[];
  createdAt?: string;
};

type HrMailSetting = { id: number | string; email: string; displayName?: string | null; imapHost?: string | null; lastSyncedAt?: string | null; isDefault?: boolean; };
type HrInboxEmail = {
  id: number | string;
  fromAddr: string;
  fromName?: string;
  subject: string;
  bodyPreview?: string;
  attachments?: Array<{ filename: string; cvDocumentId?: number | string; rejected?: boolean }>;
  aiIntent: string;
  aiStatus: string;
  receivedAt?: string;
};

const stageOptions = ['sourced', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected'];
const stageText = (stage: string) => String(stage || '').split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
const makeReqForm = () => ({
  title: '',
  department: 'Nursing',
  role: 'staff',
  openings: 1,
  priority: 'normal',
  status: 'open',
  location: '',
  employmentType: 'Full-time',
  experienceMin: 1,
  experienceMax: 8,
  skills: '',
  description: '',
});
const makeCandidateForm = () => ({
  requisitionId: '',
  name: '',
  email: '',
  phone: '',
  currentRole: '',
  experienceYears: 1,
  source: 'direct',
  skills: '',
  resumeText: '',
  expectedCtc: '',
  noticePeriodDays: '',
});
const makeInterviewForm = () => ({ candidateId: '', roundName: 'HR Screen', interviewer: '', scheduledAt: '', mode: 'video' });
const makeOfferForm = () => ({ candidateId: '', offeredCtc: '', joiningDate: todayDate(), note: '' });
const makeInboxForm = () => ({ email: '', displayName: 'HR Inbox', imapHost: 'imap.gmail.com', imapPort: 993, imapSecure: true, imapUsername: '', imapPassword: '' });
const bytesLabel = (value: number) => {
  const n = Number(value || 0);
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
  if (n >= 1024) return Math.round(n / 1024) + ' KB';
  return n + ' B';
};

export const HRRecruitmentPage = () => {
  const [summary, setSummary] = useState<RecruitmentSummary | null>(null);
  const [requisitions, setRequisitions] = useState<RecruitmentRequisition[]>([]);
  const [candidates, setCandidates] = useState<RecruitmentCandidate[]>([]);
  const [selectedReq, setSelectedReq] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [reqForm, setReqForm] = useState(makeReqForm);
  const [candidateForm, setCandidateForm] = useState(makeCandidateForm);
  const [interviewForm, setInterviewForm] = useState(makeInterviewForm);
  const [offerForm, setOfferForm] = useState(makeOfferForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | string | null>(null);
  const [cvDocs, setCvDocs] = useState<CvDocument[]>([]);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvCandidateId, setCvCandidateId] = useState('');
  const [mailSettings, setMailSettings] = useState<HrMailSetting[]>([]);
  const [inboxEmails, setInboxEmails] = useState<HrInboxEmail[]>([]);
  const [inboxForm, setInboxForm] = useState(makeInboxForm);

  const load = async () => {
    setLoading(true);
    setMessage('');
    try {
      const query = new URLSearchParams();
      if (selectedReq !== 'all') query.set('requisitionId', selectedReq);
      if (stageFilter !== 'all') query.set('stage', stageFilter);
      const [summaryRes, reqRes, candRes, cvRes, mailRes, inboxRes] = await Promise.all([
        api.get('/hr/recruitment/summary', { headers: hrHeaders() }),
        api.get('/hr/recruitment/requisitions', { headers: hrHeaders() }),
        api.get('/hr/recruitment/candidates' + (query.toString() ? '?' + query.toString() : ''), { headers: hrHeaders() }),
        api.get('/hr/recruitment/cv-documents', { headers: hrHeaders() }),
        api.get('/hr/mail/settings', { headers: hrHeaders() }),
        api.get('/hr/mail/inbox?limit=10', { headers: hrHeaders() }),
      ]);
      const reqs = unwrapData<RecruitmentRequisition[]>(reqRes, []);
      setSummary(unwrapData<RecruitmentSummary | null>(summaryRes, null));
      setRequisitions(reqs);
      setCandidates(unwrapData<RecruitmentCandidate[]>(candRes, []));
      setCvDocs(unwrapData<CvDocument[]>(cvRes, []));
      setMailSettings(unwrapData<HrMailSetting[]>(mailRes, []));
      setInboxEmails(unwrapData<{ emails: HrInboxEmail[] }>(inboxRes, { emails: [] }).emails || []);
      if (!candidateForm.requisitionId && reqs[0]) setCandidateForm(prev => ({ ...prev, requisitionId: String(reqs[0].id) }));
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [selectedReq, stageFilter]);

  const selectedReqObj = requisitions.find(r => String(r.id) === selectedReq) || requisitions[0] || null;
  const selectedCandidate = candidates.find(c => c.id === selectedCandidateId) || candidates[0] || null;
  const topCandidates = [...candidates].sort((a, b) => Number(b.aiScore || 0) - Number(a.aiScore || 0)).slice(0, 5);

  const createReq = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/hr/recruitment/requisitions', { ...reqForm, skills: reqForm.skills.split(',').map(s => s.trim()).filter(Boolean) }, { headers: hrHeaders() });
      setReqForm(makeReqForm());
      setMessage('Requisition created with AI screening criteria and interview focus.');
      await load();
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setSaving(false);
    }
  };

  const addCandidate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/hr/recruitment/candidates', {
        ...candidateForm,
        requisitionId: candidateForm.requisitionId || null,
        skills: candidateForm.skills.split(',').map(s => s.trim()).filter(Boolean),
        expectedCtc: candidateForm.expectedCtc ? Number(candidateForm.expectedCtc) : null,
        noticePeriodDays: candidateForm.noticePeriodDays ? Number(candidateForm.noticePeriodDays) : null,
      }, { headers: hrHeaders() });
      setCandidateForm(makeCandidateForm());
      setMessage('Candidate added and AI-screened against the selected requisition.');
      await load();
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setSaving(false);
    }
  };

  const screenCandidate = async (id: number | string) => {
    setMessage('');
    try {
      const res = await api.post('/hr/recruitment/candidates/' + id + '/ai-screen', {}, { headers: hrHeaders() });
      setMessage('AI screening completed: ' + (res.data?.data?.recommendation || 'Score refreshed'));
      await load();
    } catch (error) {
      setMessage(errText(error));
    }
  };

  const moveStage = async (id: number | string, stage: string) => {
    setMessage('');
    try {
      await api.patch('/hr/recruitment/candidates/' + id + '/stage', { stage }, { headers: hrHeaders() });
      await load();
    } catch (error) {
      setMessage(errText(error));
    }
  };

  const scheduleInterview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!interviewForm.candidateId) return setMessage('Select a candidate before scheduling an interview.');
    setSaving(true);
    setMessage('');
    try {
      await api.post('/hr/recruitment/candidates/' + interviewForm.candidateId + '/interviews', interviewForm, { headers: hrHeaders() });
      setInterviewForm(makeInterviewForm());
      setMessage('Interview scheduled with AI-generated question pack.');
      await load();
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setSaving(false);
    }
  };

  const markOffer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!offerForm.candidateId) return setMessage('Select a candidate before marking an offer.');
    setSaving(true);
    setMessage('');
    try {
      await api.post('/hr/recruitment/candidates/' + offerForm.candidateId + '/offer', offerForm, { headers: hrHeaders() });
      setOfferForm(makeOfferForm());
      setMessage('Offer details saved and candidate moved to offer stage.');
      await load();
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setSaving(false);
    }
  };

  const hireCandidate = async (candidate: RecruitmentCandidate) => {
    setMessage('');
    try {
      await api.post('/hr/recruitment/candidates/' + candidate.id + '/hire', {
        department: selectedReqObj?.department,
        designation: selectedReqObj?.title || candidate.currentRole,
        role: selectedReqObj?.role || 'staff',
        phone: candidate.phone,
      }, { headers: hrHeaders() });
      setMessage('Candidate hired and staff record created with first-login password reset required.');
      await load();
    } catch (error) {
      setMessage(errText(error));
    }
  };

  const uploadCv = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cvFile) return setMessage('Select a CV file before uploading.');
    setSaving(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('cv', cvFile);
      if (cvCandidateId) formData.append('candidateId', cvCandidateId);
      await api.post('/hr/recruitment/cv-documents', formData, { headers: hrHeaders() });
      setCvFile(null);
      setCvCandidateId('');
      setMessage('CV stored in the HR tenant intake folder.');
      await load();
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setSaving(false);
    }
  };

  const saveInboxSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/hr/mail/settings', inboxForm, { headers: hrHeaders() });
      setInboxForm(makeInboxForm());
      setMessage('HR inbox connected. Sync it to let AI classify recruitment and benefits emails.');
      await load();
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setSaving(false);
    }
  };

  const syncInbox = async (id: number | string) => {
    setMessage('');
    try {
      const res = await api.post('/hr/mail/settings/' + id + '/sync', {}, { headers: hrHeaders() });
      setMessage('HR inbox synced: ' + JSON.stringify(res.data?.data || {}));
      await load();
    } catch (error) {
      setMessage(errText(error));
    }
  };

  const runInboxAction = async (email: HrInboxEmail, action?: string) => {
    setMessage('');
    try {
      await api.post('/hr/mail/inbox/' + email.id + '/ai-action', { action: action || email.aiIntent, requisitionId: selectedReq !== 'all' ? selectedReq : undefined }, { headers: hrHeaders() });
      setMessage(action === 'benefits' || email.aiIntent === 'benefits' ? 'Benefit intake item created from HR inbox.' : 'Candidate created from HR inbox.');
      await load();
    } catch (error) {
      setMessage(errText(error));
    }
  };

  return (
    <Wrap title="Recruitment" subtitle="AI-assisted requisitions, screening, interviews, offers, and hiring">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KPI label="Open Positions" value={String(summary?.openings ?? 0)} sub={(summary?.open_positions ?? 0) + ' active requisitions'} icon={Briefcase} color="text-teal-600" />
        <KPI label="Candidates" value={String(summary?.candidates ?? candidates.length)} sub="All active pipelines" icon={Users} color="text-blue-600" />
        <KPI label="Shortlisted" value={String(summary?.shortlisted ?? 0)} sub="Screening and interview" icon={UserPlus} color="text-amber-600" />
        <KPI label="Hired (Month)" value={String(summary?.hired_month ?? 0)} sub={(summary?.offers ?? 0) + ' offers active'} icon={CheckCircle2} color="text-emerald-600" />
      </div>

      {message && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>}

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_400px] gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Requisition Pipeline</CardTitle>
              <div className="flex gap-2">
                <select className="h-8 text-sm border rounded-md px-2 bg-background" value={selectedReq} onChange={e => setSelectedReq(e.target.value)}><option value="all">All requisitions</option>{requisitions.map(r => <option key={r.id} value={r.id}>{r.requisitionCode} - {r.title}</option>)}</select>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => exportToExcel(requisitions, 'hr-requisitions')}><Download className="h-4 w-4" />Export</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><TH>Req</TH><TH>Position</TH><TH>Dept</TH><TH>Openings</TH><TH>Applicants</TH><TH>AI Brief</TH><TH>Status</TH></tr></thead>
                  <tbody className="divide-y">
                    {requisitions.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <TD><span className="font-mono text-xs">{r.requisitionCode}</span></TD>
                        <TD><span className="font-medium">{r.title}</span><p className="text-xs text-muted-foreground">{r.experienceMin}-{r.experienceMax} yrs · {r.priority}</p></TD>
                        <TD>{r.department}</TD>
                        <TD center>{r.openings}</TD>
                        <TD center><span className="font-semibold">{r.applicants}</span><p className="text-xs text-muted-foreground">{r.shortlisted} shortlisted</p></TD>
                        <TD><span className="text-xs text-muted-foreground">{r.aiJobBrief?.mustHave?.slice(0, 3).join(', ') || r.skills.slice(0, 3).join(', ') || '-'}</span></TD>
                        <TD><Bdg s={stageText(r.status)} /></TD>
                      </tr>
                    ))}
                    {!loading && requisitions.length === 0 && <tr><TD><span className="text-muted-foreground">No requisitions yet</span></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Candidate Command Center</CardTitle>
              <div className="flex gap-2">
                <select className="h-8 text-sm border rounded-md px-2 bg-background" value={stageFilter} onChange={e => setStageFilter(e.target.value)}><option value="all">All stages</option>{stageOptions.map(s => <option key={s} value={s}>{stageText(s)}</option>)}</select>
                <Button variant="outline" size="sm" className="gap-1" onClick={load} disabled={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><TH>Candidate</TH><TH>Role</TH><TH>AI Score</TH><TH>Recommendation</TH><TH>Stage</TH><TH>Actions</TH></tr></thead>
                  <tbody className="divide-y">
                    {candidates.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => setSelectedCandidateId(c.id)}>
                        <TD><span className="font-medium">{c.name}</span><p className="text-xs text-muted-foreground">{c.candidateCode} · {c.email || c.phone || '-'}</p></TD>
                        <TD>{c.requisitionTitle || c.currentRole || '-'}<p className="text-xs text-muted-foreground">{c.experienceYears} yrs · {c.source}</p></TD>
                        <TD><span className={`font-bold ${Number(c.aiScore || 0) >= 80 ? 'text-emerald-600' : Number(c.aiScore || 0) >= 60 ? 'text-amber-600' : 'text-slate-500'}`}>{c.aiScore ?? '-'}</span></TD>
                        <TD><span className="text-xs text-muted-foreground">{c.aiRecommendation || c.aiSummary || 'Not screened'}</span></TD>
                        <TD><Bdg s={stageText(c.stage)} /></TD>
                        <TD>
                          <div className="flex flex-wrap gap-1">
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); screenCandidate(c.id); }}>AI</Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); moveStage(c.id, 'shortlisted'); }}>Shortlist</Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); setInterviewForm({ ...interviewForm, candidateId: String(c.id) }); }}>Interview</Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); hireCandidate(c); }}>Hire</Button>
                          </div>
                        </TD>
                      </tr>
                    ))}
                    {!loading && candidates.length === 0 && <tr><TD><span className="text-muted-foreground">No candidates yet</span></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />AI Match Insights</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {topCandidates.map(c => <div key={c.id} className="rounded-md border p-3"><div className="flex items-center justify-between"><p className="font-medium text-sm">{c.name}</p><span className="font-bold text-teal-600">{c.aiScore ?? '-'}</span></div><p className="text-xs text-muted-foreground mt-1">{c.aiSummary || 'Run AI screening to generate a summary.'}</p>{Boolean(c.aiRisks?.length) && <p className="text-xs text-red-600 mt-1">Risk: {c.aiRisks?.[0]}</p>}</div>)}
                {topCandidates.length === 0 && <p className="text-sm text-muted-foreground">Add candidates to generate AI ranking.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Selected Candidate</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {selectedCandidate ? <>
                  <div className="flex items-center justify-between"><span className="font-medium">{selectedCandidate.name}</span><Bdg s={stageText(selectedCandidate.stage)} /></div>
                  <p className="text-muted-foreground">{selectedCandidate.aiSummary || 'No AI summary yet.'}</p>
                  <p><span className="font-medium">Skills:</span> {selectedCandidate.skills?.join(', ') || '-'}</p>
                  <p><span className="font-medium">Recommendation:</span> {selectedCandidate.aiRecommendation || '-'}</p>
                  {Boolean(selectedCandidate.aiRisks?.length) && <p className="text-red-600"><span className="font-medium">Risks:</span> {selectedCandidate.aiRisks?.join('; ')}</p>}
                  <div className="flex flex-wrap gap-2 pt-2">{stageOptions.map(stage => <Button key={stage} variant="outline" size="sm" onClick={() => moveStage(selectedCandidate.id, stage)}>{stageText(stage)}</Button>)}</div>
                </> : <p className="text-muted-foreground">Select a candidate from the table.</p>}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><PlusCircle className="h-4 w-4" />New Requisition</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={createReq}>
                <Input required placeholder="Position title" value={reqForm.title} onChange={e => setReqForm({ ...reqForm, title: e.target.value })} />
                <div className="grid grid-cols-2 gap-2"><select className="h-10 text-sm border rounded-md px-2 bg-background" value={reqForm.department} onChange={e => setReqForm({ ...reqForm, department: e.target.value })}>{departmentOptions.map(d => <option key={d}>{d}</option>)}</select><Input type="number" min={1} value={reqForm.openings} onChange={e => setReqForm({ ...reqForm, openings: Number(e.target.value) })} /></div>
                <div className="grid grid-cols-2 gap-2"><Input type="number" min={0} placeholder="Min exp" value={reqForm.experienceMin} onChange={e => setReqForm({ ...reqForm, experienceMin: Number(e.target.value) })} /><Input type="number" min={0} placeholder="Max exp" value={reqForm.experienceMax} onChange={e => setReqForm({ ...reqForm, experienceMax: Number(e.target.value) })} /></div>
                <Input placeholder="Must-have skills, comma separated" value={reqForm.skills} onChange={e => setReqForm({ ...reqForm, skills: e.target.value })} />
                <Input placeholder="Location" value={reqForm.location} onChange={e => setReqForm({ ...reqForm, location: e.target.value })} />
                <textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Role description and hiring context" value={reqForm.description} onChange={e => setReqForm({ ...reqForm, description: e.target.value })} />
                <Button type="submit" className="w-full gap-1 bg-teal-600 hover:bg-teal-700" disabled={saving}><Briefcase className="h-4 w-4" />Create With AI Brief</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4" />Add Candidate</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={addCandidate}>
                <select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={candidateForm.requisitionId} onChange={e => setCandidateForm({ ...candidateForm, requisitionId: e.target.value })}><option value="">Talent pool only</option>{requisitions.map(r => <option key={r.id} value={r.id}>{r.requisitionCode} - {r.title}</option>)}</select>
                <Input required placeholder="Candidate name" value={candidateForm.name} onChange={e => setCandidateForm({ ...candidateForm, name: e.target.value })} />
                <div className="grid grid-cols-2 gap-2"><Input type="email" placeholder="Email" value={candidateForm.email} onChange={e => setCandidateForm({ ...candidateForm, email: e.target.value })} /><Input placeholder="Phone" value={candidateForm.phone} onChange={e => setCandidateForm({ ...candidateForm, phone: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2"><Input placeholder="Current role" value={candidateForm.currentRole} onChange={e => setCandidateForm({ ...candidateForm, currentRole: e.target.value })} /><Input type="number" min={0} step="0.5" value={candidateForm.experienceYears} onChange={e => setCandidateForm({ ...candidateForm, experienceYears: Number(e.target.value) })} /></div>
                <Input placeholder="Candidate skills, comma separated" value={candidateForm.skills} onChange={e => setCandidateForm({ ...candidateForm, skills: e.target.value })} />
                <textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Paste resume summary, profile notes, certifications, clinical/operational exposure" value={candidateForm.resumeText} onChange={e => setCandidateForm({ ...candidateForm, resumeText: e.target.value })} />
                <div className="grid grid-cols-2 gap-2"><Input placeholder="Expected CTC" value={candidateForm.expectedCtc} onChange={e => setCandidateForm({ ...candidateForm, expectedCtc: e.target.value })} /><Input placeholder="Notice days" value={candidateForm.noticePeriodDays} onChange={e => setCandidateForm({ ...candidateForm, noticePeriodDays: e.target.value })} /></div>
                <Button type="submit" className="w-full gap-1 bg-teal-600 hover:bg-teal-700" disabled={saving}><Activity className="h-4 w-4" />Add & AI Screen</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />CV Intake Folder</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <form className="space-y-3" onSubmit={uploadCv}>
                <select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={cvCandidateId} onChange={e => setCvCandidateId(e.target.value)}><option value="">Unassigned HR intake</option>{candidates.map(c => <option key={c.id} value={c.id}>{c.candidateCode} - {c.name}</option>)}</select>
                <Input type="file" accept=".pdf,.doc,.docx,.txt" onChange={e => setCvFile(e.target.files?.[0] || null)} />
                <Button type="submit" variant="outline" className="w-full gap-1" disabled={saving}><Database className="h-4 w-4" />Store CV</Button>
              </form>
              <div className="space-y-2 max-h-56 overflow-auto">
                {cvDocs.slice(0, 8).map(doc => <div key={doc.id} className="rounded-md border px-3 py-2 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-medium truncate">{doc.originalName}</span><span className="text-xs text-muted-foreground">{bytesLabel(doc.fileSize)}</span></div><p className="text-xs text-muted-foreground">{doc.storageProvider} · {doc.createdAt ? new Date(doc.createdAt).toLocaleString() : '-'}</p></div>)}
                {cvDocs.length === 0 && <p className="text-sm text-muted-foreground">No CVs stored yet.</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" />HR Mail Inbox</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {mailSettings.length === 0 ? <form className="space-y-3" onSubmit={saveInboxSettings}>
                <Input required type="email" placeholder="hr@hospital.com" value={inboxForm.email} onChange={e => setInboxForm({ ...inboxForm, email: e.target.value, imapUsername: e.target.value })} />
                <div className="grid grid-cols-2 gap-2"><Input placeholder="IMAP host" value={inboxForm.imapHost} onChange={e => setInboxForm({ ...inboxForm, imapHost: e.target.value })} /><Input type="number" placeholder="Port" value={inboxForm.imapPort} onChange={e => setInboxForm({ ...inboxForm, imapPort: Number(e.target.value) })} /></div>
                <Input required placeholder="IMAP username" value={inboxForm.imapUsername} onChange={e => setInboxForm({ ...inboxForm, imapUsername: e.target.value })} />
                <Input required type="password" placeholder="App password" value={inboxForm.imapPassword} onChange={e => setInboxForm({ ...inboxForm, imapPassword: e.target.value })} />
                <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={saving}>Connect Inbox</Button>
              </form> : <div className="space-y-2">{mailSettings.map(setting => <div key={setting.id} className="rounded-md border px-3 py-2 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-medium truncate">{setting.email}</span><Button variant="outline" size="sm" onClick={() => syncInbox(setting.id)}>Sync</Button></div><p className="text-xs text-muted-foreground">Last sync: {setting.lastSyncedAt ? new Date(setting.lastSyncedAt).toLocaleString() : 'Never'}</p></div>)}</div>}
              <div className="space-y-2 max-h-72 overflow-auto">
                {inboxEmails.map(email => <div key={email.id} className="rounded-md border px-3 py-2 text-sm"><div className="flex items-start justify-between gap-2"><div><p className="font-medium line-clamp-1">{email.subject || '(no subject)'}</p><p className="text-xs text-muted-foreground">{email.fromName || email.fromAddr} · {benefitLabel(email.aiIntent)}</p></div><Bdg s={email.aiIntent === 'benefits' ? 'Due' : email.aiStatus === 'candidate_created' ? 'Hired' : 'Pending'} /></div><p className="text-xs text-muted-foreground mt-1 line-clamp-2">{email.bodyPreview}</p><div className="flex flex-wrap gap-2 mt-2"><Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => runInboxAction(email, 'recruitment')}>Candidate</Button><Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => runInboxAction(email, 'benefits')}>Benefit</Button></div></div>)}
                {inboxEmails.length === 0 && <p className="text-sm text-muted-foreground">No HR inbox emails synced yet.</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" />Interview & Offer</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <form className="space-y-3" onSubmit={scheduleInterview}>
                <select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={interviewForm.candidateId} onChange={e => setInterviewForm({ ...interviewForm, candidateId: e.target.value })}><option value="">Select candidate</option>{candidates.map(c => <option key={c.id} value={c.id}>{c.candidateCode} - {c.name}</option>)}</select>
                <div className="grid grid-cols-2 gap-2"><Input placeholder="Round" value={interviewForm.roundName} onChange={e => setInterviewForm({ ...interviewForm, roundName: e.target.value })} /><Input placeholder="Interviewer" value={interviewForm.interviewer} onChange={e => setInterviewForm({ ...interviewForm, interviewer: e.target.value })} /></div>
                <Input type="datetime-local" value={interviewForm.scheduledAt} onChange={e => setInterviewForm({ ...interviewForm, scheduledAt: e.target.value })} />
                <Button type="submit" variant="outline" className="w-full" disabled={saving}>Schedule Interview</Button>
              </form>
              <form className="space-y-3 border-t pt-4" onSubmit={markOffer}>
                <select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={offerForm.candidateId} onChange={e => setOfferForm({ ...offerForm, candidateId: e.target.value })}><option value="">Select candidate for offer</option>{candidates.map(c => <option key={c.id} value={c.id}>{c.candidateCode} - {c.name}</option>)}</select>
                <div className="grid grid-cols-2 gap-2"><Input placeholder="Offered CTC" value={offerForm.offeredCtc} onChange={e => setOfferForm({ ...offerForm, offeredCtc: e.target.value })} /><Input type="date" value={offerForm.joiningDate} onChange={e => setOfferForm({ ...offerForm, joiningDate: e.target.value })} /></div>
                <Input placeholder="Offer note" value={offerForm.note} onChange={e => setOfferForm({ ...offerForm, note: e.target.value })} />
                <Button type="submit" variant="outline" className="w-full" disabled={saving}>Mark Offer</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </Wrap>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 10. LMS / TRAINING
// ═══════════════════════════════════════════════════════════════════════════════
export const HRTrainingPage = () => {
  const [programs,setPrograms]=useState<any[]>([]); const [staff,setStaff]=useState<StaffMember[]>([]); const [message,setMessage]=useState(''); const [form,setForm]=useState({title:'',department:'All',trainer:'',scheduledAt:'',durationHours:1,capacity:30}); const [enroll,setEnroll]=useState({programId:'',staffId:''});
  const load=async()=>{try{const [p,s]=await Promise.all([api.get('/hr/lms/programs',{headers:hrHeaders()}),api.get('/hr/staff',{headers:hrHeaders()})]);setPrograms(unwrapData<any[]>(p,[]));setStaff(unwrapData<StaffMember[]>(s,[]));}catch(e){setMessage(errText(e));}}; useEffect(()=>{load();},[]);
  const save=async(e:React.FormEvent)=>{e.preventDefault();try{await api.post('/hr/lms/programs',form,{headers:hrHeaders()});setForm({title:'',department:'All',trainer:'',scheduledAt:'',durationHours:1,capacity:30});setMessage('LMS program created.');await load();}catch(err){setMessage(errText(err));}};
  const doEnroll=async(e:React.FormEvent)=>{e.preventDefault();try{await api.post('/hr/lms/programs/'+enroll.programId+'/enroll',{staffId:enroll.staffId},{headers:hrHeaders()});setMessage('Staff enrolled.');await load();}catch(err){setMessage(errText(err));}};
  return <Wrap title="Learning Management System" subtitle="Training programs, enrollments, completions, and certifications"><div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6"><KPI label="Programs" value={String(programs.length)} sub="LMS catalog" icon={GraduationCap} color="text-teal-600"/><KPI label="Completed" value={String(programs.reduce((n,p)=>n+Number(p.completed||0),0))} sub="Enrollments" icon={CheckCircle2} color="text-emerald-600"/><KPI label="Upcoming" value={String(programs.filter(p=>p.status==='scheduled').length)} sub="Scheduled" icon={Calendar} color="text-amber-600"/><KPI label="Enrolled" value={String(programs.reduce((n,p)=>n+Number(p.enrolled||0),0))} sub="Total seats" icon={Users} color="text-blue-600"/></div>{message&&<div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>}<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6"><Card><CardHeader><CardTitle className="text-base">Training Calendar</CardTitle></CardHeader><CardContent><table className="w-full text-sm"><thead><tr className="border-b"><TH>ID</TH><TH>Program</TH><TH>Department</TH><TH>Trainer</TH><TH>Date</TH><TH>Enrolled</TH><TH>Completed</TH><TH>Status</TH></tr></thead><tbody>{programs.map(t=><tr key={t.id}><TD><span className="font-mono text-xs">{t.programCode}</span></TD><TD><span className="font-medium">{t.title}</span></TD><TD>{t.department}</TD><TD>{t.trainer||'-'}</TD><TD>{t.scheduledAt?new Date(t.scheduledAt).toLocaleString():'-'}</TD><TD center>{t.enrolled}</TD><TD center>{t.completed}</TD><TD><Bdg s={statusLabel(t.status)}/></TD></tr>)}</tbody></table></CardContent></Card><div className="space-y-6"><Card><CardHeader><CardTitle className="text-base">Create Program</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={save}><Input required placeholder="Program title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><Input placeholder="Department" value={form.department} onChange={e=>setForm({...form,department:e.target.value})}/><Input placeholder="Trainer" value={form.trainer} onChange={e=>setForm({...form,trainer:e.target.value})}/><Input type="datetime-local" value={form.scheduledAt} onChange={e=>setForm({...form,scheduledAt:e.target.value})}/><div className="grid grid-cols-2 gap-2"><Input type="number" min="0.5" step="0.5" value={form.durationHours} onChange={e=>setForm({...form,durationHours:Number(e.target.value)})}/><Input type="number" min="0" value={form.capacity} onChange={e=>setForm({...form,capacity:Number(e.target.value)})}/></div><Button className="w-full bg-teal-600 hover:bg-teal-700">Create</Button></form></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Enroll Staff</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={doEnroll}><select required className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={enroll.programId} onChange={e=>setEnroll({...enroll,programId:e.target.value})}><option value="">Select program</option>{programs.map(p=><option key={p.id} value={p.id}>{p.programCode} - {p.title}</option>)}</select><select required className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={enroll.staffId} onChange={e=>setEnroll({...enroll,staffId:e.target.value})}><option value="">Select staff</option>{staff.map(s=><option key={s.id} value={s.id}>{s.employeeCode} - {s.name}</option>)}</select><Button className="w-full" variant="outline">Enroll</Button></form></CardContent></Card></div></div></Wrap>;
};

// ═══════════════════════════════════════════════════════════════════════════════
// 10A. GOALS & OKRS
// ═══════════════════════════════════════════════════════════════════════════════
export const HRGoalsPage = () => {
  const [rows,setRows]=useState<any[]>([]); const [staff,setStaff]=useState<StaffMember[]>([]); const [message,setMessage]=useState(''); const [form,setForm]=useState({staffId:'',title:'',metric:'Completion',targetValue:100,currentValue:0,dueDate:todayDate()});
  const load=async()=>{try{const [g,s]=await Promise.all([api.get('/hr/goals',{headers:hrHeaders()}),api.get('/hr/staff',{headers:hrHeaders()})]);setRows(unwrapData<any[]>(g,[]));setStaff(unwrapData<StaffMember[]>(s,[]));}catch(e){setMessage(errText(e));}}; useEffect(()=>{load();},[]);
  const save=async(e:React.FormEvent)=>{e.preventDefault();try{await api.post('/hr/goals',form,{headers:hrHeaders()});setForm({staffId:'',title:'',metric:'Completion',targetValue:100,currentValue:0,dueDate:todayDate()});setMessage('Goal saved.');await load();}catch(err){setMessage(errText(err));}};
  const progress=async(id:any,currentValue:any)=>{try{await api.patch('/hr/goals/'+id+'/progress',{currentValue:Number(currentValue)},{headers:hrHeaders()});await load();}catch(e){setMessage(errText(e));}};
  return <Wrap title="Goals & OKRs" subtitle="Employee goals, measurable outcomes, and progress tracking"><div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6"><KPI label="Active Goals" value={String(rows.filter(r=>r.status==='active').length)} sub="In progress" icon={TrendingUp} color="text-teal-600"/><KPI label="Completed" value={String(rows.filter(r=>r.status==='completed').length)} sub="Closed goals" icon={CheckCircle2} color="text-emerald-600"/><KPI label="Avg Progress" value={(rows.length?Math.round(rows.reduce((n,r)=>n+Number(r.progress||0),0)/rows.length):0)+'%'} sub="All goals" icon={BarChart3} color="text-blue-600"/><KPI label="Due Soon" value={String(rows.filter(r=>r.dueDate && new Date(r.dueDate)<new Date(Date.now()+14*86400000)).length)} sub="Next 14 days" icon={AlertCircle} color="text-amber-600"/></div>{message&&<div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>}<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6"><Card><CardHeader><CardTitle className="text-base">Goal Register</CardTitle></CardHeader><CardContent><div className="space-y-3">{rows.map(g=><div key={g.id} className="rounded-md border px-3 py-2 text-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{g.title}</p><p className="text-xs text-muted-foreground">{[g.firstName,g.lastName].filter(Boolean).join(' ') || 'Hospital'} · {g.metric} · due {displayDate(g.dueDate)}</p></div><Bdg s={statusLabel(g.status)}/></div><div className="mt-2 h-2 bg-slate-100 rounded-full"><div className="h-full bg-teal-500 rounded-full" style={{width:Math.min(100,Number(g.progress||0))+'%'}} /></div><div className="mt-2 flex gap-2"><Input className="h-8 w-28" type="number" defaultValue={g.currentValue} onBlur={e=>progress(g.id,e.target.value)}/><span className="text-xs text-muted-foreground self-center">/ {g.targetValue}</span></div></div>)}</div></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Create Goal</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={save}><select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={form.staffId} onChange={e=>setForm({...form,staffId:e.target.value})}><option value="">Hospital / department goal</option>{staff.map(s=><option key={s.id} value={s.id}>{s.employeeCode} - {s.name}</option>)}</select><Input required placeholder="Goal title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><Input placeholder="Metric" value={form.metric} onChange={e=>setForm({...form,metric:e.target.value})}/><div className="grid grid-cols-2 gap-2"><Input type="number" value={form.targetValue} onChange={e=>setForm({...form,targetValue:Number(e.target.value)})}/><Input type="number" value={form.currentValue} onChange={e=>setForm({...form,currentValue:Number(e.target.value)})}/></div><Input type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/><Button className="w-full bg-teal-600 hover:bg-teal-700">Save Goal</Button></form></CardContent></Card></div></Wrap>;
};

// ═══════════════════════════════════════════════════════════════════════════════
// 10B. ENGAGEMENT SURVEYS
// ═══════════════════════════════════════════════════════════════════════════════
export const HRSurveysPage = () => {
  const [rows,setRows]=useState<any[]>([]); const [message,setMessage]=useState(''); const [form,setForm]=useState({title:'',audience:'All staff',status:'active',startsAt:'',endsAt:'',questions:'How satisfied are you with your work environment?\nDo you have the tools needed to do your job?'});
  const load=async()=>{try{const r=await api.get('/hr/surveys',{headers:hrHeaders()});setRows(unwrapData<any[]>(r,[]));}catch(e){setMessage(errText(e));}}; useEffect(()=>{load();},[]);
  const save=async(e:React.FormEvent)=>{e.preventDefault();try{await api.post('/hr/surveys',{...form,questions:form.questions.split('\n').map(q=>q.trim()).filter(Boolean)},{headers:hrHeaders()});setForm({title:'',audience:'All staff',status:'active',startsAt:'',endsAt:'',questions:form.questions});setMessage('Survey created.');await load();}catch(err){setMessage(errText(err));}};
  return <Wrap title="Employee Engagement Surveys" subtitle="Pulse surveys, participation, and engagement scores"><div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6"><KPI label="Surveys" value={String(rows.length)} sub="Total" icon={Activity} color="text-teal-600"/><KPI label="Active" value={String(rows.filter(r=>r.status==='active').length)} sub="Open now" icon={CheckCircle2} color="text-emerald-600"/><KPI label="Responses" value={String(rows.reduce((n,r)=>n+Number(r.responses||0),0))} sub="Captured" icon={Users} color="text-blue-600"/><KPI label="Avg Score" value={(rows.length?Math.round(rows.reduce((n,r)=>n+Number(r.avgScore||0),0)/rows.length):0).toString()} sub="Engagement" icon={Star} color="text-amber-600"/></div>{message&&<div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>}<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6"><Card><CardHeader><CardTitle className="text-base">Survey Register</CardTitle></CardHeader><CardContent><table className="w-full text-sm"><thead><tr className="border-b"><TH>Title</TH><TH>Audience</TH><TH>Responses</TH><TH>Avg Score</TH><TH>Status</TH></tr></thead><tbody>{rows.map(r=><tr key={r.id}><TD><span className="font-medium">{r.title}</span></TD><TD>{r.audience}</TD><TD center>{r.responses}</TD><TD center>{r.avgScore}</TD><TD><Bdg s={statusLabel(r.status)}/></TD></tr>)}</tbody></table></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Create Survey</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={save}><Input required placeholder="Survey title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><Input placeholder="Audience" value={form.audience} onChange={e=>setForm({...form,audience:e.target.value})}/><select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="draft">Draft</option><option value="active">Active</option><option value="closed">Closed</option></select><Input type="datetime-local" value={form.startsAt} onChange={e=>setForm({...form,startsAt:e.target.value})}/><Input type="datetime-local" value={form.endsAt} onChange={e=>setForm({...form,endsAt:e.target.value})}/><textarea className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.questions} onChange={e=>setForm({...form,questions:e.target.value})}/><Button className="w-full bg-teal-600 hover:bg-teal-700">Create Survey</Button></form></CardContent></Card></div></Wrap>;
};

// ═══════════════════════════════════════════════════════════════════════════════
// 11. PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════════
type PerformanceRow = {
  id?: number | string | null;
  staffId: number | string;
  employeeCode: string;
  name: string;
  department: string;
  designation?: string;
  cycle: string;
  kraScore: number;
  attendanceScore: number;
  patientScore: number;
  qualityScore: number;
  teamworkScore: number;
  overallScore: number;
  rating: number;
  overallLabel: string;
  status: string;
  managerNotes?: string;
  aiSummary?: string;
  aiRisks?: string[];
  presentDays: number;
  biometricEvents: number;
  lateEvents: number;
};

type PerformancePayload = {
  cycle: string;
  summary: { totalStaff: number; reviewed: number; reviewsDue: number; exceptional: number; needsImprovement: number; avgScore: number };
  rows: PerformanceRow[];
};

const ratingColor: Record<string, string> = {
  Exceptional: 'text-emerald-600', Good: 'text-blue-600', Average: 'text-amber-600', 'Needs Improvement': 'text-red-600', Pending: 'text-slate-500',
};
const defaultPerfCycle = () => {
  const now = new Date();
  return now.getFullYear() + '-Q' + (Math.floor(now.getMonth() / 3) + 1);
};
const makePerformanceForm = () => ({
  staffId: '',
  cycle: defaultPerfCycle(),
  kraScore: 80,
  attendanceScore: 80,
  patientScore: 80,
  qualityScore: 80,
  teamworkScore: 80,
  managerNotes: '',
  status: 'manager_review',
});
const perfStatusLabel = (value: string) => benefitLabel(value || 'draft');

export const HRPerformancePage = () => {
  const [cycle, setCycle] = useState(defaultPerfCycle());
  const [payload, setPayload] = useState<PerformancePayload | null>(null);
  const [form, setForm] = useState(makePerformanceForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await api.get('/hr/performance?cycle=' + encodeURIComponent(cycle), { headers: hrHeaders() });
      const data = unwrapData<PerformancePayload | null>(res, null);
      setPayload(data);
      if (!form.staffId && data?.rows?.[0]) {
        setForm(prev => ({ ...prev, staffId: String(data.rows[0].staffId), cycle: data.cycle, attendanceScore: Math.round(Number(data.rows[0].attendanceScore || 0)) }));
      }
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [cycle]);

  const rows = payload?.rows || [];
  const summary = payload?.summary;
  const selectedStaff = rows.find(row => String(row.staffId) === String(form.staffId));

  const startReview = (row: PerformanceRow) => {
    setForm({
      staffId: String(row.staffId),
      cycle,
      kraScore: Math.round(Number(row.kraScore || 0)) || 80,
      attendanceScore: Math.round(Number(row.attendanceScore || 0)) || 80,
      patientScore: Math.round(Number(row.patientScore || 0)) || 80,
      qualityScore: Math.round(Number(row.qualityScore || 0)) || 80,
      teamworkScore: Math.round(Number(row.teamworkScore || 0)) || 80,
      managerNotes: row.managerNotes || '',
      status: row.status || 'manager_review',
    });
  };

  const saveReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.staffId) return setMessage('Select staff before saving a performance review.');
    setSaving(true);
    setMessage('');
    try {
      await api.post('/hr/performance/reviews', {
        ...form,
        cycle,
        kraScore: Number(form.kraScore),
        attendanceScore: Number(form.attendanceScore),
        patientScore: Number(form.patientScore),
        qualityScore: Number(form.qualityScore),
        teamworkScore: Number(form.teamworkScore),
      }, { headers: hrHeaders() });
      setMessage('Performance review saved and AI summary refreshed.');
      await load();
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Wrap title="Performance Management" subtitle="KRA reviews, biometric attendance contribution, ratings, and performance tracking">
      {message && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KPI label="Reviews Due" value={String(summary?.reviewsDue ?? 0)} sub={cycle} icon={Star} color="text-amber-600" />
        <KPI label="Exceptional" value={String(summary?.exceptional ?? 0)} sub="Score 90%+" icon={Star} color="text-emerald-600" />
        <KPI label="Needs Improvement" value={String(summary?.needsImprovement ?? 0)} sub="Score below 60%" icon={AlertCircle} color="text-red-600" />
        <KPI label="Avg Dept Score" value={(summary?.avgScore ?? 0) + '%'} sub={(summary?.reviewed ?? 0) + ' reviewed / ' + (summary?.totalStaff ?? 0)} icon={BarChart3} color="text-teal-600" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Performance Reviews - {cycle}</CardTitle>
            <div className="flex gap-2">
              <Input className="h-8 w-28" value={cycle} onChange={e => setCycle(e.target.value)} />
              <Button variant="outline" size="sm" className="gap-1" onClick={() => exportToExcel(rows, 'hr-performance-' + cycle)}><Download className="h-4 w-4" />Export</Button>
              <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => rows[0] && startReview(rows[0])}><PlusCircle className="h-4 w-4" />Start Review</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b"><TH>Employee</TH><TH>Department</TH><TH>KRA</TH><TH>Attendance</TH><TH>Patient</TH><TH>Rating</TH><TH>Overall</TH><TH>Status</TH></tr></thead>
                <tbody className="divide-y">
                  {rows.map(p => (
                    <tr key={p.staffId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => startReview(p)}>
                      <TD><div><span className="font-medium">{p.name}</span><p className="text-xs text-muted-foreground">{p.employeeCode} · {p.designation || 'Staff'}</p></div></TD>
                      <TD>{p.department}</TD>
                      <TD center><span className="font-semibold">{Math.round(Number(p.kraScore || 0))}%</span></TD>
                      <TD center><div><span className="font-semibold">{Math.round(Number(p.attendanceScore || 0))}%</span><p className="text-xs text-muted-foreground">{p.presentDays} days · {p.biometricEvents} punches</p></div></TD>
                      <TD center><span className="font-semibold">{Math.round(Number(p.patientScore || 0))}%</span></TD>
                      <TD center>{'★'.repeat(Math.round(Number(p.rating || 0)))}<span className="text-slate-300">{'★'.repeat(Math.max(0, 5 - Math.round(Number(p.rating || 0))))}</span></TD>
                      <TD><span className={`font-semibold ${ratingColor[p.overallLabel] || 'text-slate-600'}`}>{p.overallLabel}</span><p className="text-xs text-muted-foreground">{Math.round(Number(p.overallScore || 0))}%</p></TD>
                      <TD><Bdg s={perfStatusLabel(p.status)} /></TD>
                    </tr>
                  ))}
                  {!loading && rows.length === 0 && <tr><TD><span className="text-muted-foreground">No staff available for performance monitoring</span></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Manager Review</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={saveReview}>
              <select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={form.staffId} onChange={e => {
                const row = rows.find(item => String(item.staffId) === e.target.value);
                if (row) startReview(row); else setForm({ ...form, staffId: e.target.value });
              }}>
                <option value="">Select staff</option>{rows.map(row => <option key={row.staffId} value={row.staffId}>{row.employeeCode} - {row.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2"><Input type="number" min="0" max="100" placeholder="KRA" value={form.kraScore} onChange={e => setForm({ ...form, kraScore: Number(e.target.value) })} /><Input type="number" min="0" max="100" placeholder="Attendance" value={form.attendanceScore} onChange={e => setForm({ ...form, attendanceScore: Number(e.target.value) })} /></div>
              <div className="grid grid-cols-2 gap-2"><Input type="number" min="0" max="100" placeholder="Patient score" value={form.patientScore} onChange={e => setForm({ ...form, patientScore: Number(e.target.value) })} /><Input type="number" min="0" max="100" placeholder="Quality" value={form.qualityScore} onChange={e => setForm({ ...form, qualityScore: Number(e.target.value) })} /></div>
              <Input type="number" min="0" max="100" placeholder="Teamwork" value={form.teamworkScore} onChange={e => setForm({ ...form, teamworkScore: Number(e.target.value) })} />
              <Input placeholder="Manager note" value={form.managerNotes} onChange={e => setForm({ ...form, managerNotes: e.target.value })} />
              <select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="manager_review">Manager review</option><option value="hr_review">HR review</option><option value="completed">Completed</option><option value="draft">Draft</option></select>
              <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={saving || !form.staffId}>Save Review</Button>
            </form>
            {selectedStaff && <div className="mt-4 rounded-md border px-3 py-2 text-sm"><p className="font-medium">AI monitoring note</p><p className="text-xs text-muted-foreground mt-1">{selectedStaff.aiSummary}</p>{selectedStaff.aiRisks?.length ? <p className="text-xs text-red-600 mt-2">{selectedStaff.aiRisks.join(', ')}</p> : null}</div>}
          </CardContent>
        </Card>
      </div>
    </Wrap>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 12. APPRAISALS (NEW)
// ═══════════════════════════════════════════════════════════════════════════════
const appraisals = [
  { name: 'Dr. Kavita Joshi',  dept: 'Cardiology',  current: 180000, increment: 18000, revised: 198000, effectiveFrom: 'Apr-2026', status: 'Approved' },
  { name: 'Sanjay Kumar',      dept: 'Nursing',     current: 45000,  increment: 3600,  revised: 48600,  effectiveFrom: 'Apr-2026', status: 'Approved' },
  { name: 'Pooja Verma',       dept: 'Accounts',    current: 38000,  increment: 2660,  revised: 40660,  effectiveFrom: 'Apr-2026', status: 'Pending' },
  { name: 'Mohammed Iqbal',    dept: 'Housekeeping',current: 22000,  increment: 1100,  revised: 23100,  effectiveFrom: 'Apr-2026', status: 'Pending' },
  { name: 'Dr. Ramesh Pillai', dept: 'Orthopaedics',current: 220000, increment: 33000, revised: 253000, effectiveFrom: 'Apr-2026', status: 'Approved' },
];

export const HRAppraisalsPage = () => (
  <Wrap title="Appraisals & Increments" subtitle="Annual salary revision and increment tracking">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <KPI label="Appraisal Cycle"   value="Apr-2026" sub="Effective date"          icon={Calendar}    color="text-teal-600" />
      <KPI label="Total Employees"   value="466"      sub="Eligible for appraisal"  icon={Users}       color="text-blue-600" />
      <KPI label="Approved"          value="312"      sub="Letters issued"           icon={CheckCircle2} color="text-emerald-600" />
      <KPI label="Pending"           value="154"      sub="Awaiting manager sign-off" icon={AlertCircle} color="text-amber-600" />
    </div>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Increment Register — FY 2026-27</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
          <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Issue Letter</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b"><TH>Employee</TH><TH>Department</TH><TH>Current CTC</TH><TH>Increment</TH><TH>Revised CTC</TH><TH>Effective From</TH><TH>Status</TH></tr></thead>
            <tbody className="divide-y">
              {appraisals.map(a => (
                <tr key={a.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD><span className="font-medium">{a.name}</span></TD>
                  <TD>{a.dept}</TD>
                  <TD>{fmt(a.current)}</TD>
                  <TD><span className="text-emerald-600 font-semibold">+{fmt(a.increment)}</span></TD>
                  <TD><span className="font-bold">{fmt(a.revised)}</span></TD>
                  <TD>{a.effectiveFrom}</TD>
                  <TD><Bdg s={a.status} /></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 13. HR REPORTS
// ═══════════════════════════════════════════════════════════════════════════════

// Sample employee health data (replace with API call when endpoint is available)
const employeeHealthData = [
  { 'Employee ID': 'EMP001', 'Name': 'Dr. Kavita Joshi',   'Department': 'Cardiology',   'Role': 'Consultant',    'Overall Health Score': 82, 'Blood Pressure (mmHg)': '118/76', 'Heart Rate (bpm)': 72, 'SpO2 (%)': 98, 'Temperature (°F)': 98.4, 'Sleep Hours': 7.5, 'Sleep Quality': 'Good',    'Steps': 8200,  'Calories Burned': 480, 'Active Minutes': 45, 'Mood Score (1-10)': 8, 'Water Intake (ml)': 2200, 'Calories (diet)': 1950, 'Screen Time (hrs)': 5.0, 'BMI': 22.4, 'Allergies': 'None', 'Chronic Conditions': 'None',    'Last Updated': '2026-05-05' },
  { 'Employee ID': 'EMP002', 'Name': 'Sanjay Kumar',        'Department': 'Nursing',      'Role': 'Staff Nurse',   'Overall Health Score': 74, 'Blood Pressure (mmHg)': '124/82', 'Heart Rate (bpm)': 78, 'SpO2 (%)': 97, 'Temperature (°F)': 98.6, 'Sleep Hours': 6.0, 'Sleep Quality': 'Fair',    'Steps': 10500, 'Calories Burned': 560, 'Active Minutes': 60, 'Mood Score (1-10)': 7, 'Water Intake (ml)': 1800, 'Calories (diet)': 2100, 'Screen Time (hrs)': 3.5, 'BMI': 24.1, 'Allergies': 'Dust', 'Chronic Conditions': 'None',    'Last Updated': '2026-05-05' },
  { 'Employee ID': 'EMP003', 'Name': 'Pooja Verma',         'Department': 'Accounts',     'Role': 'Billing Exec',  'Overall Health Score': 68, 'Blood Pressure (mmHg)': '130/85', 'Heart Rate (bpm)': 82, 'SpO2 (%)': 96, 'Temperature (°F)': 98.8, 'Sleep Hours': 5.5, 'Sleep Quality': 'Poor',    'Steps': 4200,  'Calories Burned': 280, 'Active Minutes': 20, 'Mood Score (1-10)': 6, 'Water Intake (ml)': 1400, 'Calories (diet)': 2300, 'Screen Time (hrs)': 8.0, 'BMI': 26.8, 'Allergies': 'None', 'Chronic Conditions': 'Hypertension', 'Last Updated': '2026-05-05' },
  { 'Employee ID': 'EMP004', 'Name': 'Mohammed Iqbal',      'Department': 'Housekeeping', 'Role': 'Ward Attender', 'Overall Health Score': 79, 'Blood Pressure (mmHg)': '120/78', 'Heart Rate (bpm)': 74, 'SpO2 (%)': 98, 'Temperature (°F)': 98.2, 'Sleep Hours': 7.0, 'Sleep Quality': 'Good',    'Steps': 12000, 'Calories Burned': 620, 'Active Minutes': 90, 'Mood Score (1-10)': 7, 'Water Intake (ml)': 2500, 'Calories (diet)': 2200, 'Screen Time (hrs)': 2.0, 'BMI': 23.5, 'Allergies': 'None', 'Chronic Conditions': 'None',    'Last Updated': '2026-05-05' },
  { 'Employee ID': 'EMP005', 'Name': 'Dr. Ramesh Pillai',   'Department': 'Orthopaedics', 'Role': 'Consultant',    'Overall Health Score': 71, 'Blood Pressure (mmHg)': '128/84', 'Heart Rate (bpm)': 80, 'SpO2 (%)': 97, 'Temperature (°F)': 98.5, 'Sleep Hours': 6.5, 'Sleep Quality': 'Fair',    'Steps': 6500,  'Calories Burned': 390, 'Active Minutes': 30, 'Mood Score (1-10)': 7, 'Water Intake (ml)': 1900, 'Calories (diet)': 2050, 'Screen Time (hrs)': 6.5, 'BMI': 27.2, 'Allergies': 'Pollen', 'Chronic Conditions': 'Diabetes (Type 2)', 'Last Updated': '2026-05-05' },
  { 'Employee ID': 'EMP006', 'Name': 'Sunita Rao',          'Department': 'OT',           'Role': 'OT Technician', 'Overall Health Score': 85, 'Blood Pressure (mmHg)': '116/74', 'Heart Rate (bpm)': 68, 'SpO2 (%)': 99, 'Temperature (°F)': 97.9, 'Sleep Hours': 8.0, 'Sleep Quality': 'Excellent', 'Steps': 9000,  'Calories Burned': 510, 'Active Minutes': 55, 'Mood Score (1-10)': 9, 'Water Intake (ml)': 2400, 'Calories (diet)': 1800, 'Screen Time (hrs)': 2.5, 'BMI': 21.8, 'Allergies': 'None', 'Chronic Conditions': 'None',    'Last Updated': '2026-05-05' },
  { 'Employee ID': 'EMP007', 'Name': 'Arun Sharma',         'Department': 'Radiology',    'Role': 'Radiographer',  'Overall Health Score': 63, 'Blood Pressure (mmHg)': '136/90', 'Heart Rate (bpm)': 88, 'SpO2 (%)': 96, 'Temperature (°F)': 99.1, 'Sleep Hours': 5.0, 'Sleep Quality': 'Poor',    'Steps': 3800,  'Calories Burned': 240, 'Active Minutes': 15, 'Mood Score (1-10)': 5, 'Water Intake (ml)': 1200, 'Calories (diet)': 2600, 'Screen Time (hrs)': 9.5, 'BMI': 29.3, 'Allergies': 'Shellfish', 'Chronic Conditions': 'Obesity, Hypertension', 'Last Updated': '2026-05-04' },
  { 'Employee ID': 'EMP008', 'Name': 'Meena Nair',          'Department': 'Pharmacy',     'Role': 'Pharmacist',    'Overall Health Score': 88, 'Blood Pressure (mmHg)': '112/72', 'Heart Rate (bpm)': 65, 'SpO2 (%)': 99, 'Temperature (°F)': 98.1, 'Sleep Hours': 8.5, 'Sleep Quality': 'Excellent', 'Steps': 7800,  'Calories Burned': 440, 'Active Minutes': 40, 'Mood Score (1-10)': 9, 'Water Intake (ml)': 2600, 'Calories (diet)': 1750, 'Screen Time (hrs)': 3.0, 'BMI': 20.9, 'Allergies': 'None', 'Chronic Conditions': 'None',    'Last Updated': '2026-05-05' },
];

const reportTypes: { name: string; icon: LucideIcon; desc: string; onGenerate?: () => void }[] = [
  { name: 'Headcount Report',       icon: Users,        desc: 'Total staff by dept, type, and grade' },
  { name: 'Attendance Summary',     icon: CalendarCheck,desc: 'Monthly presence/absence/late analysis' },
  { name: 'Leave Utilization',      icon: CalendarOff,  desc: 'Leave availed vs entitlement by type' },
  { name: 'Payroll Summary',        icon: Wallet,        desc: 'Gross, deductions, net disbursable' },
  { name: 'Turnover Report',        icon: TrendingUp,    desc: 'Attrition rate, exits, new hires' },
  { name: 'Training Completion',    icon: GraduationCap, desc: 'Program-wise completion rates' },
  { name: 'PF & ESI Remittance',    icon: ShieldCheck,   desc: 'Monthly challan & compliance status' },
  { name: 'Performance Summary',    icon: Star,          desc: 'Ratings distribution and top performers' },
  {
    name: 'Employee Health Report',
    icon: Activity,
    desc: 'All health parameters: vitals, sleep, activity, mood, diet & more',
    onGenerate: () => exportToExcel(employeeHealthData, {
      filename: 'Employee_Health_Report',
      sheetName: 'Health Parameters',
    }),
  },
];

export const HRReportsPage = () => (
  <Wrap title="HR Reports" subtitle="Workforce analytics, compliance & statutory reports">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <KPI label="Reports Generated" value="24"  sub="This month"             icon={FileText}  color="text-teal-600" />
      <KPI label="Compliance Reports" value="6"  sub="PF, ESI, TDS, etc."    icon={ShieldCheck} color="text-emerald-600" />
      <KPI label="Scheduled Reports" value="8"   sub="Auto-generated monthly" icon={Calendar}  color="text-blue-600" />
      <KPI label="Pending Reviews"   value="3"   sub="Awaiting HOD sign-off"  icon={AlertCircle} color="text-amber-600" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {reportTypes.map(r => (
        <Card key={r.name} className="hover:shadow-md transition-shadow cursor-pointer group">
          <CardContent className="p-5">
            <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950 w-fit mb-3 group-hover:bg-teal-100 transition-colors">
              <r.icon className="h-6 w-6 text-teal-600" />
            </div>
            <p className="font-semibold text-sm">{r.name}</p>
            <p className="text-xs text-muted-foreground mt-1">{r.desc}</p>
            <Button
              variant="ghost" size="sm"
              className="mt-3 text-teal-600 p-0 h-auto text-xs gap-1"
              onClick={r.onGenerate}
            >
              <Download className="h-3 w-3" />{r.onGenerate ? 'Download Excel →' : 'Generate →'}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 14. HR ANALYTICS (NEW)
// ═══════════════════════════════════════════════════════════════════════════════
const deptHeadcount = [
  { dept: 'Nursing',           count: 132, male: 30, female: 102, attrition: 2.1 },
  { dept: 'Clinical Staff',    count: 86,  male: 48, female: 38,  attrition: 1.2 },
  { dept: 'Administration',    count: 62,  male: 28, female: 34,  attrition: 3.2 },
  { dept: 'Housekeeping',      count: 78,  male: 62, female: 16,  attrition: 8.5 },
  { dept: 'Lab & Radiology',   count: 44,  male: 22, female: 22,  attrition: 1.8 },
  { dept: 'Pharmacy',          count: 28,  male: 12, female: 16,  attrition: 0.0 },
  { dept: 'OT & Anaesthesia',  count: 32,  male: 14, female: 18,  attrition: 1.5 },
  { dept: 'ICU',               count: 20,  male: 8,  female: 12,  attrition: 3.0 },
];

export const HRAnalyticsPage = () => (
  <Wrap title="HR Analytics" subtitle="Workforce trends, attrition analysis & cost insights">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <KPI label="Total Headcount"  value="482"  sub="Mar 2026"              icon={Users}     color="text-teal-600" />
      <KPI label="Attrition Rate"   value="3.2%" sub="Rolling 12 months"    icon={TrendingUp} color="text-red-600" />
      <KPI label="Male / Female"    value="266/216" sub="55% / 45%"         icon={UserCog}   color="text-blue-600" />
      <KPI label="Avg Tenure"       value="4.2 yrs" sub="Hospital-wide"    icon={Star}       color="text-emerald-600" />
    </div>
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Department-wise Headcount & Attrition</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-4">
          {deptHeadcount.map(d => {
            const maxCount = Math.max(...deptHeadcount.map(x => x.count));
            const pct = Math.round((d.count / maxCount) * 100);
            return (
              <div key={d.dept}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{d.dept}</span>
                  <span className="text-muted-foreground">
                    {d.count} staff · M:{d.male} F:{d.female} ·{' '}
                    <span className={d.attrition > 5 ? 'text-red-600 font-semibold' : d.attrition > 2 ? 'text-amber-600' : 'text-emerald-600'}>
                      {d.attrition}% attrition
                    </span>
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 15. COMPLIANCE (NEW)
// ═══════════════════════════════════════════════════════════════════════════════
const compliance = [
  { act: 'EPF & MP Act 1952',     filing: 'Monthly Challan',        due: '15-Apr-26', status: 'Due',     ref: 'EPFO' },
  { act: 'ESI Act 1948',          filing: 'Monthly Contribution',   due: '21-Apr-26', status: 'Due',     ref: 'ESIC' },
  { act: 'Income Tax Act',        filing: 'Form 24Q (TDS Q4)',      due: '31-May-26', status: 'Pending', ref: 'TRACES' },
  { act: 'Payment of Gratuity',   filing: 'Annual Return Form F',   due: '30-Apr-26', status: 'Pending', ref: 'Labour Dept' },
  { act: 'Maternity Benefit Act', filing: 'Annual Return',          due: '31-Jan-26', status: 'Filed',   ref: 'Labour Dept' },
  { act: 'Minimum Wages Act',     filing: 'Half-Yearly Return',     due: '31-Mar-26', status: 'Filed',   ref: 'Labour Dept' },
  { act: 'Contract Labour Act',   filing: 'Annual Return XII',      due: '15-Feb-26', status: 'Filed',   ref: 'Labour Dept' },
  { act: 'POSH Act 2013',         filing: 'Annual Report to Dist.', due: '31-Jan-26', status: 'Filed',   ref: 'District Off.' },
];

export const HRCompliancePage = () => (
  <Wrap title="HR Compliance" subtitle="Labour law compliance, statutory filings & due dates">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <KPI label="Total Filings"   value="12"  sub="FY 2025-26"              icon={FileText}    color="text-teal-600" />
      <KPI label="Filed"           value="5"   sub="On time"                 icon={CheckCircle2} color="text-emerald-600" />
      <KPI label="Due (Apr)"       value="4"   sub="Upcoming deadlines"      icon={AlertCircle} color="text-amber-600" />
      <KPI label="Overdue"         value="0"   sub="No pending violations"   icon={ShieldCheck} color="text-emerald-600" />
    </div>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Statutory Compliance Register</CardTitle>
        <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Add Filing</Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b"><TH>Act / Law</TH><TH>Filing Type</TH><TH>Due Date</TH><TH>Authority</TH><TH>Status</TH></tr></thead>
            <tbody className="divide-y">
              {compliance.map(c => (
                <tr key={c.act} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TD><span className="font-medium">{c.act}</span></TD>
                  <TD>{c.filing}</TD>
                  <TD>{c.due}</TD>
                  <TD><span className="text-xs text-muted-foreground">{c.ref}</span></TD>
                  <TD><Bdg s={c.status} /></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </Wrap>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 16. SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════
const makeLocationForm = () => ({ code: '', name: '', locationType: 'branch', address: '', city: '', state: '', phone: '', email: '' });
const makeHrUserForm = () => ({ firstName: '', lastName: '', email: '', phone: '', role: 'hr_staff', locationIds: [] as string[] });

export const HRSettingsPage = () => {
  const [locations, setLocations] = useState<HrLocation[]>([]);
  const [hrUsers, setHrUsers] = useState<HrUser[]>([]);
  const [features, setFeatures] = useState<HrFeature[]>([]);
  const [locationForm, setLocationForm] = useState(makeLocationForm);
  const [hrUserForm, setHrUserForm] = useState(makeHrUserForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setMessage('');
    try {
      const [locationsRes, usersRes, featuresRes] = await Promise.all([
        api.get('/hr/locations', { headers: hrHeaders() }),
        api.get('/hr/users', { headers: hrHeaders() }),
        api.get('/hr/features', { headers: hrHeaders() }),
      ]);
      setLocations(unwrapData<HrLocation[]>(locationsRes, []));
      setHrUsers(unwrapData<HrUser[]>(usersRes, []));
      setFeatures(unwrapData<{ features: HrFeature[] }>(featuresRes, { features: [] }).features || []);
    } catch (error) {
      setMessage(errText(error));
    }
  };

  useEffect(() => { load(); }, []);

  const saveLocation = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/hr/locations', locationForm, { headers: hrHeaders() });
      setLocationForm(makeLocationForm());
      setMessage('Location saved. Staff, HR users, and biometric devices can now be mapped to it.');
      await load();
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setSaving(false);
    }
  };

  const saveHrUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/hr/users', hrUserForm, { headers: hrHeaders() });
      setHrUserForm(makeHrUserForm());
      setMessage('HR user created with all HRMS feature permissions and selected branch scope.');
      await load();
    } catch (error) {
      setMessage(errText(error));
    } finally {
      setSaving(false);
    }
  };

  const toggleHrUserLocation = (id: string) => {
    setHrUserForm(current => ({
      ...current,
      locationIds: current.locationIds.includes(id) ? current.locationIds.filter(item => item !== id) : [...current.locationIds, id],
    }));
  };

  return (
    <Wrap title="HR Settings" subtitle="All HRMS capabilities, branches, locations, and HR user access">
      {message && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Enabled HRMS Features</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {features.map(feature => <div key={feature.key} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span>{feature.label}</span></div>)}
                {features.length === 0 && <p className="text-sm text-muted-foreground">Feature catalog will load after HR API is available.</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" />Locations & Branches</CardTitle>
              <Button variant="outline" size="sm" className="gap-1" onClick={load}><RefreshCw className="h-4 w-4" />Refresh</Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><TH>Code</TH><TH>Name</TH><TH>Type</TH><TH>City</TH><TH>Contact</TH><TH>Status</TH></tr></thead>
                  <tbody className="divide-y">
                    {locations.map(location => <tr key={location.id}><TD><span className="font-mono text-xs">{location.code}</span></TD><TD><span className="font-medium">{location.name}</span><p className="text-xs text-muted-foreground">{location.address || '-'}</p></TD><TD>{benefitLabel(location.locationType || 'branch')}</TD><TD>{location.city || '-'}</TD><TD>{location.phone || location.email || '-'}</TD><TD><Bdg s={statusLabel(location.status)} /></TD></tr>)}
                    {locations.length === 0 && <tr><TD><span className="text-muted-foreground">No branches configured</span></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />HR Users</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><TH>Name</TH><TH>Role</TH><TH>Locations</TH><TH>Status</TH></tr></thead>
                  <tbody className="divide-y">
                    {hrUsers.map(user => <tr key={user.id}><TD><span className="font-medium">{user.name}</span><p className="text-xs text-muted-foreground">{user.email}</p></TD><TD>{user.role.replaceAll('_', ' ')}</TD><TD>{user.locations?.length ? user.locations.map(l => l.code).join(', ') : 'All / unassigned'}</TD><TD><Bdg s={statusLabel(user.status)} /></TD></tr>)}
                    {hrUsers.length === 0 && <tr><TD><span className="text-muted-foreground">No HR users created yet</span></TD><TD></TD><TD></TD><TD></TD></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><PlusCircle className="h-4 w-4" />Add Location</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={saveLocation}>
                <div className="grid grid-cols-2 gap-2"><Input required placeholder="Code" value={locationForm.code} onChange={e => setLocationForm({ ...locationForm, code: e.target.value })} /><select className="h-10 text-sm border rounded-md px-2 bg-background" value={locationForm.locationType} onChange={e => setLocationForm({ ...locationForm, locationType: e.target.value })}><option value="branch">Branch</option><option value="campus">Campus</option><option value="clinic">Clinic</option><option value="unit">Unit</option></select></div>
                <Input required placeholder="Location / branch name" value={locationForm.name} onChange={e => setLocationForm({ ...locationForm, name: e.target.value })} />
                <Input placeholder="Address" value={locationForm.address} onChange={e => setLocationForm({ ...locationForm, address: e.target.value })} />
                <div className="grid grid-cols-2 gap-2"><Input placeholder="City" value={locationForm.city} onChange={e => setLocationForm({ ...locationForm, city: e.target.value })} /><Input placeholder="State" value={locationForm.state} onChange={e => setLocationForm({ ...locationForm, state: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2"><Input placeholder="Phone" value={locationForm.phone} onChange={e => setLocationForm({ ...locationForm, phone: e.target.value })} /><Input type="email" placeholder="Email" value={locationForm.email} onChange={e => setLocationForm({ ...locationForm, email: e.target.value })} /></div>
                <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={saving}>Save Location</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4" />Add HR User</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={saveHrUser}>
                <div className="grid grid-cols-2 gap-2"><Input required placeholder="First name" value={hrUserForm.firstName} onChange={e => setHrUserForm({ ...hrUserForm, firstName: e.target.value })} /><Input required placeholder="Last name" value={hrUserForm.lastName} onChange={e => setHrUserForm({ ...hrUserForm, lastName: e.target.value })} /></div>
                <Input required type="email" placeholder="Email" value={hrUserForm.email} onChange={e => setHrUserForm({ ...hrUserForm, email: e.target.value })} />
                <Input required placeholder="Phone" value={hrUserForm.phone} onChange={e => setHrUserForm({ ...hrUserForm, phone: e.target.value })} />
                <select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={hrUserForm.role} onChange={e => setHrUserForm({ ...hrUserForm, role: e.target.value })}><option value="hr_staff">HR staff</option><option value="hospital_admin">Hospital admin</option></select>
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Branch scope</p>
                  {locations.map(location => <label key={location.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hrUserForm.locationIds.includes(String(location.id))} onChange={() => toggleHrUserLocation(String(location.id))} /><span>{location.code} - {location.name}</span></label>)}
                  {locations.length === 0 && <p className="text-xs text-muted-foreground">Create locations first, or leave scope unrestricted.</p>}
                </div>
                <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={saving}>Create HR User</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </Wrap>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 17. SUPPORT / HR HELP DESK
// ═══════════════════════════════════════════════════════════════════════════════
const faqs = [
  { q: 'How do I apply for leave?', a: 'Use Leave Management. HR can create and approve requests from the workflow.' },
  { q: 'How to submit timesheets?', a: 'Use Timesheets. Approved entries become payroll-ready duty logs.' },
  { q: 'How to upload documents?', a: 'Use Document Management and select the employee and document type.' },
  { q: 'How are branches managed?', a: 'Use HR Settings to add locations and assign HR users to branch scope.' },
];

export const HRSupportPage = () => {
  const [tickets,setTickets]=useState<any[]>([]); const [staff,setStaff]=useState<StaffMember[]>([]); const [message,setMessage]=useState(''); const [form,setForm]=useState({staffId:'',category:'general',subject:'',description:'',priority:'medium'});
  const load=async()=>{try{const [t,s]=await Promise.all([api.get('/hr/helpdesk/tickets',{headers:hrHeaders()}),api.get('/hr/staff',{headers:hrHeaders()})]);setTickets(unwrapData<any[]>(t,[]));setStaff(unwrapData<StaffMember[]>(s,[]));}catch(e){setMessage(errText(e));}}; useEffect(()=>{load();},[]);
  const save=async(e:React.FormEvent)=>{e.preventDefault();try{await api.post('/hr/helpdesk/tickets',form,{headers:hrHeaders()});setForm({staffId:'',category:'general',subject:'',description:'',priority:'medium'});setMessage('Help desk ticket created.');await load();}catch(err){setMessage(errText(err));}};
  const setStatus=async(id:any,status:string)=>{try{await api.patch('/hr/helpdesk/tickets/'+id+'/status',{status},{headers:hrHeaders()});await load();}catch(e){setMessage(errText(e));}};
  return <Wrap title="HR Help Desk" subtitle="Employee HR tickets, FAQs, and support workflows">{message&&<div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>}<div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6"><KPI label="Open Tickets" value={String(tickets.filter(t=>t.status==='open').length)} sub="Help desk queue" icon={HelpCircle} color="text-teal-600"/><KPI label="High Priority" value={String(tickets.filter(t=>t.priority==='high').length)} sub="Needs action" icon={AlertCircle} color="text-red-600"/><KPI label="Resolved" value={String(tickets.filter(t=>['resolved','closed'].includes(t.status)).length)} sub="Closed tickets" icon={CheckCircle2} color="text-emerald-600"/><KPI label="Categories" value={String(new Set(tickets.map(t=>t.category)).size)} sub="Request types" icon={Filter} color="text-blue-600"/></div><div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className="lg:col-span-2 space-y-4"><Card><CardHeader><CardTitle className="text-base">Help Desk Tickets</CardTitle></CardHeader><CardContent><table className="w-full text-sm"><thead><tr className="border-b"><TH>Ticket</TH><TH>Employee</TH><TH>Category</TH><TH>Priority</TH><TH>Status</TH><TH>Actions</TH></tr></thead><tbody>{tickets.map(t=><tr key={t.id}><TD><span className="font-mono text-xs">{t.ticketCode}</span><p className="font-medium">{t.subject}</p></TD><TD>{[t.firstName,t.lastName].filter(Boolean).join(' ')||'-'}</TD><TD>{benefitLabel(t.category)}</TD><TD><Bdg s={t.priority==='high'?'Overdue':t.priority==='medium'?'Pending':'Active'}/></TD><TD><Bdg s={statusLabel(t.status)}/></TD><TD><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={()=>setStatus(t.id,'in_progress')}>Start</Button><Button size="sm" variant="ghost" onClick={()=>setStatus(t.id,'resolved')}>Resolve</Button></div></TD></tr>)}</tbody></table></CardContent></Card><Card><CardHeader className="pb-3"><CardTitle className="text-base">Frequently Asked Questions</CardTitle></CardHeader><CardContent className="space-y-4">{faqs.map(f=><div key={f.q} className="border-b pb-4 last:border-0"><p className="font-semibold text-sm mb-1">{f.q}</p><p className="text-sm text-muted-foreground">{f.a}</p></div>)}</CardContent></Card></div><div className="space-y-4"><Card><CardHeader><CardTitle className="text-base">Create Ticket</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={save}><select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={form.staffId} onChange={e=>setForm({...form,staffId:e.target.value})}><option value="">No employee selected</option>{staff.map(s=><option key={s.id} value={s.id}>{s.employeeCode} - {s.name}</option>)}</select><select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}><option value="payroll">Payroll</option><option value="benefits">Benefits</option><option value="documents">Documents</option><option value="leave">Leave</option><option value="general">General</option></select><Input required placeholder="Subject" value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})}/><Input placeholder="Description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><select className="h-10 w-full text-sm border rounded-md px-2 bg-background" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select><Button className="w-full bg-teal-600 hover:bg-teal-700">Create Ticket</Button></form></CardContent></Card><Card><CardHeader className="pb-3"><CardTitle className="text-base">HR Contact</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">{[{icon:Phone,label:'HR Helpdesk',value:'080-4567-8901'},{icon:Mail,label:'Email',value:'hr@mediczy.com'},{icon:MapPin,label:'Office',value:'Admin Block, 2nd Floor'},{icon:Clock,label:'Hours',value:'Mon-Sat 9AM-6PM'}].map(c=><div key={c.label} className="flex items-center gap-3"><div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950"><c.icon className="h-4 w-4 text-teal-600" /></div><div><p className="text-xs text-muted-foreground">{c.label}</p><p className="font-medium">{c.value}</p></div></div>)}</CardContent></Card></div></div></Wrap>;
};
