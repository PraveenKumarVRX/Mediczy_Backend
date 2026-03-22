import React from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Lock, Camera, MapPin, KeyRound, ShieldAlert,
  AlertTriangle, Radio, Users, ClipboardList, BarChart3,
  Settings, HelpCircle, PlusCircle, Download, Search, Filter,
  Siren, ScanLine, ShieldCheck, UserRoundCheck, Loader2, BellRing,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSecurityPortalData } from './useSecurityPortalData';

export const securityNavSections: DeptNavSection[] = [
  { title: 'Overview', items: [{ icon: Lock, label: 'Dashboard', href: '/security/dashboard' }] },
  { title: 'Surveillance', items: [
    { icon: Camera, label: 'CCTV Monitor', href: '/security/cctv' },
    { icon: MapPin, label: 'Access Points', href: '/security/access-points' },
    { icon: KeyRound, label: 'Access Logs', href: '/security/access-logs' },
  ]},
  { title: 'Response', items: [
    { icon: ShieldAlert, label: 'Incident Log', href: '/security/incidents' },
    { icon: AlertTriangle, label: 'Active Alerts', href: '/security/alerts' },
    { icon: Radio, label: 'Guard Duty', href: '/security/guard-duty' },
  ]},
  { title: 'People', items: [
    { icon: Users, label: 'Visitor Mgmt', href: '/security/visitors' },
    { icon: ClipboardList, label: 'Staff Entry Log', href: '/security/staff-log' },
  ]},
  { title: 'Governance', items: [
    { icon: BarChart3, label: 'Reports', href: '/security/reports' },
    { icon: Settings, label: 'Settings', href: '/security/settings' },
    { icon: HelpCircle, label: 'Support', href: '/security/support' },
  ]},
];

const fallbackCctv = [
  { zone: 'Main Gate', cameras: 12, online: 12, analytics: 'ANPR + loitering', status: 'Operational' },
  { zone: 'Emergency', cameras: 8, online: 8, analytics: 'Queue + panic', status: 'Operational' },
  { zone: 'ICU Wing', cameras: 10, online: 10, analytics: 'Door tailgating', status: 'Operational' },
  { zone: 'OT Complex', cameras: 6, online: 6, analytics: 'Sterile zone watch', status: 'Operational' },
  { zone: 'Parking', cameras: 20, online: 18, analytics: 'Vehicle watchlist', status: 'Degraded' },
  { zone: 'Ward Floors', cameras: 72, online: 72, analytics: 'Wander-risk patrol', status: 'Operational' },
];

const fallbackAccessPoints = [
  { name: 'Main Gate Turnstile A', area: 'Front Entry', status: 'Open', credential: 'RFID + QR', lastEvent: '11:12', owner: 'Gate Control' },
  { name: 'ICU Bio Door', area: 'ICU', status: 'Restricted', credential: 'Biometric + PIN', lastEvent: '11:08', owner: 'ICU Security' },
  { name: 'OT Sterile Lobby', area: 'OT', status: 'Restricted', credential: 'Biometric', lastEvent: '10:55', owner: 'OT Control' },
  { name: 'Pharmacy Vault', area: 'Pharmacy', status: 'Locked', credential: 'Dual Auth', lastEvent: '10:32', owner: 'Pharmacy Lead' },
];

const fallbackAccessLogs = [
  { time: '11:12', person: 'Dr. Nikhil Rao', point: 'ICU Bio Door', direction: 'Entry', method: 'Biometric', result: 'Granted' },
  { time: '11:04', person: 'Vendor Pass V-228', point: 'Dock Gate', direction: 'Entry', method: 'QR', result: 'Granted' },
  { time: '10:47', person: 'Unknown Badge', point: 'OT Sterile Lobby', direction: 'Entry', method: 'RFID', result: 'Denied' },
  { time: '10:29', person: 'Nurse Anita', point: 'Pharmacy Vault', direction: 'Entry', method: 'PIN', result: 'Denied' },
];

const fallbackAlerts = [
  { id: 'ALT-901', alert: 'Tailgating detected', zone: 'ICU Bio Door', severity: 'High', owner: 'Rapid Response', status: 'Escalated' },
  { id: 'ALT-900', alert: 'Camera offline', zone: 'Parking Bay C', severity: 'Medium', owner: 'Control Room', status: 'Investigating' },
  { id: 'ALT-899', alert: 'Visitor overstay', zone: 'Ward 5', severity: 'Low', owner: 'Visitor Desk', status: 'Open' },
  { id: 'ALT-898', alert: 'Panic switch pressed', zone: 'Emergency Triage', severity: 'High', owner: 'Shift Commander', status: 'Closed' },
];

const fallbackGuards = [
  { name: 'Ravi Kumar', shift: 'Morning', post: 'Main Gate', status: 'On Duty', patrol: 'Perimeter sweep 11:30', radio: 'CH-1' },
  { name: 'Suresh Nair', shift: 'Morning', post: 'Emergency', status: 'On Duty', patrol: 'Ambulance bay 11:15', radio: 'CH-2' },
  { name: 'Prakash Singh', shift: 'Morning', post: 'ICU Wing', status: 'On Duty', patrol: 'ICU corridor 11:20', radio: 'CH-4' },
  { name: 'Amit Yadav', shift: 'Morning', post: 'Parking', status: 'Break', patrol: 'Vehicle scan 11:45', radio: 'CH-3' },
];

const fallbackVisitors = [
  { id: 'VIS-1182', visitor: 'Manish Shah', patient: 'Ward 5A / Bed 12', passType: 'Attendant', checkIn: '09:15', status: 'Inside' },
  { id: 'VIS-1181', visitor: 'Asha Devi', patient: 'ICU / Bed 4', passType: 'Critical Care', checkIn: '08:40', status: 'Escorted' },
  { id: 'VIS-1180', visitor: 'Vendor - MedSupply', patient: 'Pharmacy Receiving', passType: 'Vendor', checkIn: '08:10', status: 'Inside' },
  { id: 'VIS-1179', visitor: 'Rohit Kumar', patient: 'OPD Block', passType: 'Visitor', checkIn: '07:55', status: 'Exited' },
];

const fallbackStaffLog = [
  { person: 'Dr. Mehta', department: 'ICU', point: 'ICU Bio Door', time: '11:06', result: 'Granted' },
  { person: 'Nurse Leena', department: 'OT', point: 'OT Sterile Lobby', time: '10:58', result: 'Granted' },
  { person: 'Pharm QA', department: 'Pharmacy', point: 'Pharmacy Vault', time: '10:31', result: 'Denied' },
  { person: 'IT Engineer', department: 'IT/EDP', point: 'Server Room', time: '09:42', result: 'Granted' },
];

const fallbackReports = [
  { name: 'Daily Incident Digest', cadence: 'Daily', audience: 'Security Lead', status: 'Ready' },
  { name: 'Visitor Overstay Tracker', cadence: 'Shift-wise', audience: 'Front Office', status: 'Live' },
  { name: 'Access Exception Review', cadence: 'Weekly', audience: 'Compliance', status: 'Ready' },
  { name: 'Camera Uptime Dashboard', cadence: 'Realtime', audience: 'Control Room', status: 'Live' },
];

const fallbackSettings = [
  { title: 'Escalation Matrix', text: 'High-severity alerts route to security lead, admin officer, and unit manager within 2 minutes.' },
  { title: 'Visitor Policy Window', text: 'Department-specific visiting hours, ICU restrictions, vendor escorting, and late-entry approvals.' },
  { title: 'Access Governance', text: 'Role-based badge access, temporary credentials, biometric exception handling, and vault dual-auth rules.' },
];

const fallbackSupport = [
  { title: 'Command Desk', text: '24x7 control room support for surveillance incidents, duress calls, and coordinated response.' },
  { title: 'Patrol Playbooks', text: 'Shift handover guides, lockdown procedures, infant security drills, and fire-panel escalation SOPs.' },
  { title: 'Systems Support', text: 'Badge printer, CCTV recorder, NVR, VMS, and intercom support with defined downtime SLAs.' },
];

const fallbackIncidents = [
  { id: 'SEC-441', type: 'Unauthorized Access', location: 'ICU Entry', time: '09:14', priority: 'High', status: 'Active', owner: 'Rapid Response' },
  { id: 'SEC-440', type: 'Suspicious Person', location: 'Parking', time: '08:32', priority: 'Medium', status: 'Active', owner: 'Parking Lead' },
  { id: 'SEC-439', type: 'Fire Alarm Trigger', location: 'Kitchen', time: '07:55', priority: 'High', status: 'Resolved', owner: 'Shift Commander' },
  { id: 'SEC-438', type: 'Lost Property', location: 'OPD', time: 'Yesterday', priority: 'Low', status: 'Resolved', owner: 'Front Office' },
];

const statusTone: Record<string, string> = {
  Operational: 'bg-emerald-100 text-emerald-700',
  Degraded: 'bg-amber-100 text-amber-700',
  Open: 'bg-blue-100 text-blue-700',
  Restricted: 'bg-red-100 text-red-700',
  Locked: 'bg-slate-200 text-slate-700',
  Granted: 'bg-emerald-100 text-emerald-700',
  Denied: 'bg-red-100 text-red-700',
  Active: 'bg-red-100 text-red-700',
  Resolved: 'bg-emerald-100 text-emerald-700',
  Escalated: 'bg-red-100 text-red-700',
  Investigating: 'bg-amber-100 text-amber-700',
  'On Duty': 'bg-emerald-100 text-emerald-700',
  Break: 'bg-amber-100 text-amber-700',
  Scheduled: 'bg-blue-100 text-blue-700',
  Inside: 'bg-blue-100 text-blue-700',
  Escorted: 'bg-amber-100 text-amber-700',
  Exited: 'bg-emerald-100 text-emerald-700',
  Ready: 'bg-emerald-100 text-emerald-700',
  Live: 'bg-blue-100 text-blue-700',
};

const ToneBadge = ({ value }: { value: string }) => (
  <Badge className={`${statusTone[value] ?? 'bg-slate-100 text-slate-700'} border-0 text-xs`}>{value}</Badge>
);

const PageShell = ({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: React.ReactNode; children: React.ReactNode; }) => (
  <HospDeptLayout deptKey="security" deptName="Security" badgeLabel="Security" loginPath="/security/login" DeptIcon={Lock} navSections={securityNavSections} title={title} subtitle={subtitle}>
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search security records" className="pl-9" />
          </div>
          <Button variant="outline" size="sm" className="gap-1"><Filter className="h-4 w-4" />Filter</Button>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
      {children}
    </div>
  </HospDeptLayout>
);

const StatCard = ({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub: string; icon: LucideIcon; color: string; }) => (
  <Card className="hover:shadow-md transition-shadow">
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800"><Icon className={`h-5 w-5 ${color}`} /></div>
      </div>
    </CardContent>
  </Card>
);

const SectionTable = ({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) => (
  <table className="w-full text-sm">
    <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">{headers.map((header) => <th key={header} className="py-2 pr-3 font-medium">{header}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index} className="border-b last:border-0 hover:bg-muted/30">{row.map((cell, cellIndex) => <td key={cellIndex} className="py-3 pr-3 align-top">{cell}</td>)}</tr>)}</tbody>
  </table>
);

const SecurityDataState = ({ loading, error, refresh }: { loading: boolean; error: string | null; refresh: () => void }) => {
  if (!loading && !error) return null;
  return (
    <Card className="border-dashed">
      <CardContent className="flex items-center justify-between gap-3 p-4 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
          <span>{loading ? 'Loading live security operations data...' : error}</span>
        </div>
        {!loading && <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>}
      </CardContent>
    </Card>
  );
};

export const SecurityCCTVPage = () => {
  const { data, loading, error, refresh } = useSecurityPortalData();
  const cctv = data?.cctv ?? fallbackCctv;
  return <PageShell title="CCTV Monitor" subtitle="Campus camera health, zone coverage, and analytics watchlists" actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export Uptime</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Camera className="h-4 w-4" />Open Video Wall</Button></>}><SecurityDataState loading={loading} error={error} refresh={refresh} /><div className="grid grid-cols-2 xl:grid-cols-4 gap-4"><StatCard label="Total Cameras" value={String(cctv.reduce((sum, row) => sum + row.cameras, 0))} sub="Across all hospital zones" icon={Camera} color="text-blue-600" /><StatCard label="Online Streams" value={String(cctv.reduce((sum, row) => sum + row.online, 0))} sub="Current active feeds" icon={ShieldCheck} color="text-emerald-600" /><StatCard label="Analytics Zones" value={String(cctv.length)} sub="AI-assisted security coverage" icon={ScanLine} color="text-violet-600" /><StatCard label="Degraded Areas" value={String(cctv.filter((row) => row.status !== 'Operational').length)} sub="Needs maintenance follow-up" icon={AlertTriangle} color="text-amber-600" /></div><Card><CardHeader><CardTitle className="text-base">Zone Camera Matrix</CardTitle></CardHeader><CardContent><SectionTable headers={['Zone', 'Cameras', 'Online', 'Analytics', 'Status']} rows={cctv.map((row) => [row.zone, String(row.cameras), String(row.online), row.analytics, <ToneBadge value={row.status} />])} /></CardContent></Card></PageShell>;
};

export const SecurityAccessPointsPage = () => {
  const { data, loading, error, refresh } = useSecurityPortalData();
  const accessPoints = data?.accessPoints ?? fallbackAccessPoints;
  return <PageShell title="Access Points" subtitle="Door controls, secure areas, and badge governance across the hospital" actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export Doors</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><KeyRound className="h-4 w-4" />Issue Temp Access</Button></>}><SecurityDataState loading={loading} error={error} refresh={refresh} /><Card><CardHeader><CardTitle className="text-base">Access Control Map</CardTitle></CardHeader><CardContent><SectionTable headers={['Point', 'Area', 'State', 'Credential', 'Last Event', 'Owner']} rows={accessPoints.map((row) => [row.name, row.area, <ToneBadge value={row.status} />, row.credential, row.lastEvent, row.owner])} /></CardContent></Card></PageShell>;
};

export const SecurityAccessLogsPage = () => {
  const { data, loading, error, refresh } = useSecurityPortalData();
  const accessLogs = data?.accessLogs ?? fallbackAccessLogs;
  return <PageShell title="Access Logs" subtitle="Entry and exit audit trails for staff, visitors, and restricted zones" actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Download Log</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><ScanLine className="h-4 w-4" />Investigate Event</Button></>}><SecurityDataState loading={loading} error={error} refresh={refresh} /><Card><CardHeader><CardTitle className="text-base">Entry / Exit Audit Trail</CardTitle></CardHeader><CardContent><SectionTable headers={['Time', 'Person', 'Point', 'Direction', 'Method', 'Result']} rows={accessLogs.map((row) => [row.time, row.person, row.point, row.direction, row.method, <ToneBadge value={row.result} />])} /></CardContent></Card></PageShell>;
};

export const SecurityIncidentsPage = () => {
  const { data, loading, error, refresh } = useSecurityPortalData();
  const incidents = data?.incidents ?? fallbackIncidents;
  return <PageShell title="Incident Log" subtitle="Security incidents, unauthorized access events, and response closure tracking" actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export Register</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-4 w-4" />Log Incident</Button></>}><SecurityDataState loading={loading} error={error} refresh={refresh} /><Card><CardHeader><CardTitle className="text-base">Security Incident Register</CardTitle></CardHeader><CardContent><SectionTable headers={['ID', 'Event', 'Location', 'Time', 'Priority', 'Status', 'Owner']} rows={incidents.map((row) => [row.id, row.type, row.location, row.time, <ToneBadge value={row.priority} />, <ToneBadge value={row.status} />, row.owner ?? 'Security Control'])} /></CardContent></Card></PageShell>;
};

export const SecurityAlertsPage = () => {
  const { data, loading, error, refresh } = useSecurityPortalData();
  const alerts = data?.alerts ?? fallbackAlerts;
  return <PageShell title="Active Alerts" subtitle="Real-time alert queue from panic, surveillance, door, and visitor rules" actions={<><Button variant="outline" size="sm" className="gap-1"><BellRing className="h-4 w-4" />Escalation Rules</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Siren className="h-4 w-4" />Open War Room</Button></>}><SecurityDataState loading={loading} error={error} refresh={refresh} /><Card><CardHeader><CardTitle className="text-base">Alert Queue</CardTitle></CardHeader><CardContent><SectionTable headers={['Alert ID', 'Alert', 'Zone', 'Severity', 'Owner', 'Status']} rows={alerts.map((row) => [row.id, row.alert, row.zone, <ToneBadge value={row.severity} />, row.owner, <ToneBadge value={row.status} />])} /></CardContent></Card></PageShell>;
};

export const SecurityGuardDutyPage = () => {
  const { data, loading, error, refresh } = useSecurityPortalData();
  const guards = data?.guards ?? fallbackGuards;
  return <PageShell title="Guard Duty" subtitle="Shift roster, patrol checkpoints, radio assignment, and command coverage" actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Roster Export</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Radio className="h-4 w-4" />Assign Patrol</Button></>}><SecurityDataState loading={loading} error={error} refresh={refresh} /><Card><CardHeader><CardTitle className="text-base">Shift Command Roster</CardTitle></CardHeader><CardContent><SectionTable headers={['Guard', 'Shift', 'Post', 'Status', 'Patrol', 'Radio']} rows={guards.map((row) => [row.name, row.shift, row.post, <ToneBadge value={row.status} />, row.patrol, row.radio])} /></CardContent></Card></PageShell>;
};

export const SecurityVisitorsPage = () => {
  const { data, loading, error, refresh } = useSecurityPortalData();
  const visitors = data?.visitors ?? fallbackVisitors;
  return <PageShell title="Visitor Management" subtitle="Pass issuance, escort tracking, and inside / exited visitor control" actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Pass Register</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><UserRoundCheck className="h-4 w-4" />Issue Pass</Button></>}><SecurityDataState loading={loading} error={error} refresh={refresh} /><Card><CardHeader><CardTitle className="text-base">Visitor Pass Console</CardTitle></CardHeader><CardContent><SectionTable headers={['Pass ID', 'Visitor', 'Destination', 'Pass Type', 'Check-in', 'Status']} rows={visitors.map((row) => [row.id, row.visitor, row.patient, row.passType, row.checkIn, <ToneBadge value={row.status} />])} /></CardContent></Card></PageShell>;
};

export const SecurityStaffLogPage = () => {
  const { data, loading, error, refresh } = useSecurityPortalData();
  const staffLog = data?.staffLog ?? fallbackStaffLog;
  return <PageShell title="Staff Entry Log" subtitle="Biometric and controlled area access visibility for hospital staff" actions={<><Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export Staff Log</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><ClipboardList className="h-4 w-4" />Exception Review</Button></>}><SecurityDataState loading={loading} error={error} refresh={refresh} /><Card><CardHeader><CardTitle className="text-base">Controlled Area Staff Access</CardTitle></CardHeader><CardContent><SectionTable headers={['Person', 'Department', 'Point', 'Time', 'Result']} rows={staffLog.map((row) => [row.person, row.department, row.point, row.time, <ToneBadge value={row.result} />])} /></CardContent></Card></PageShell>;
};

export const SecurityReportsPage = () => {
  const { data, loading, error, refresh } = useSecurityPortalData();
  const reports = data?.reports ?? fallbackReports;
  return <PageShell title="Reports" subtitle="Operational security reporting, daily digests, and leadership packs" actions={<><Button variant="outline" size="sm" className="gap-1"><BarChart3 className="h-4 w-4" />Schedule Mailout</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Download className="h-4 w-4" />Generate Report</Button></>}><SecurityDataState loading={loading} error={error} refresh={refresh} /><Card><CardHeader><CardTitle className="text-base">Security Reporting Catalogue</CardTitle></CardHeader><CardContent><SectionTable headers={['Report', 'Cadence', 'Audience', 'Status']} rows={reports.map((row) => [row.name, row.cadence, row.audience, <ToneBadge value={row.status} />])} /></CardContent></Card></PageShell>;
};

export const SecuritySettingsPage = () => {
  const { data, loading, error, refresh } = useSecurityPortalData();
  const settings = data?.settings ?? fallbackSettings;
  return <PageShell title="Settings" subtitle="Security operations policy controls, visitor windows, and access governance" actions={<Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><Settings className="h-4 w-4" />Save Changes</Button>}><SecurityDataState loading={loading} error={error} refresh={refresh} /><div className="grid grid-cols-1 xl:grid-cols-3 gap-5">{settings.map((row) => <Card key={row.title}><CardHeader><CardTitle className="text-base">{row.title}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{row.text}</CardContent></Card>)}</div></PageShell>;
};

export const SecuritySupportPage = () => {
  const { data, loading, error, refresh } = useSecurityPortalData();
  const support = data?.support ?? fallbackSupport;
  return <PageShell title="Support" subtitle="Command desk support, patrol playbooks, and surveillance system assistance" actions={<Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><HelpCircle className="h-4 w-4" />Open Ticket</Button>}><SecurityDataState loading={loading} error={error} refresh={refresh} /><div className="grid grid-cols-1 xl:grid-cols-3 gap-5">{support.map((row) => <Card key={row.title}><CardHeader><CardTitle className="text-base">{row.title}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>{row.text}</p><div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/70"><p className="font-medium text-slate-900 dark:text-white">Response SLA</p><p className="mt-1">Control room issues: 15 minutes. Badge and access issues: same shift. CCTV outage: immediate escalation.</p></div></CardContent></Card>)}</div></PageShell>;
};
