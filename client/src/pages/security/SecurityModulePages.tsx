import React, { useState } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Lock, Camera, MapPin, KeyRound, ShieldAlert,
  AlertTriangle, Radio, Users, ClipboardList, BarChart3,
  Settings, HelpCircle, PlusCircle, Download, Search, Filter,
  Siren, ScanLine, ShieldCheck, UserRoundCheck, Loader2, BellRing,
  Package, Barcode, Truck, ShieldX, FileText, Archive, MoveRight,
  Wifi, Bluetooth, Navigation, Signal, Cpu, Zap,
  Activity, CheckCircle2, Clock, AlertOctagon, TrendingUp, BookOpen,
  FlaskConical, ShieldEllipsis, Eye, HardDrive, LocateFixed, RefreshCw,
  Fingerprint, Badge as BadgeIcon, BookMarked, ListChecks, X, ParkingSquare, ScanEye,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSecurityPortalData } from './useSecurityPortalData';
import api from '@/utils/api';
import ParkingContent from '@/components/parking/ParkingContent';
import SurveillanceContent from '@/components/surveillance/SurveillanceContent';

export const securityNavSections: DeptNavSection[] = [
  { title: 'Overview', items: [{ icon: Lock, label: 'Dashboard', href: '/security/dashboard' }] },
  { title: 'Surveillance', items: [
    { icon: Camera, label: 'CCTV Monitor', href: '/security/cctv' },
    { icon: MapPin, label: 'Access Points', href: '/security/access-points' },
    { icon: ScanEye, label: 'Camera Analytics', href: '/security/camera-analytics' },
    { icon: KeyRound, label: 'Access Logs', href: '/security/access-logs' },
    { icon: ParkingSquare, label: 'Parking', href: '/security/parking' },
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
  { title: 'Assets', items: [
    { icon: Package, label: 'Asset Tracking', href: '/security/assets' },
  ]},
  { title: 'Governance', items: [
    { icon: BarChart3, label: 'Reports', href: '/security/reports' },
    { icon: BookOpen, label: 'Implementation', href: '/security/implementation' },
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
  <HospDeptLayout deptKey="security" deptName="Security" badgeLabel="Security" loginPath="/security/login" DeptIcon={Lock} navSections={securityNavSections} title={title} subtitle={subtitle} copilotModule="security">
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

// ─── Video Wall ──────────────────────────────────────────────────────────────
type WallLayout = '2x2' | '3x3' | '4x4' | '1+5';
type CameraTile = { id: string; zone: string; online: boolean };

const WALL_LAYOUTS: { key: WallLayout; label: string; cols: number; count: number }[] = [
  { key: '2x2', label: '2×2', cols: 2, count: 4 },
  { key: '3x3', label: '3×3', cols: 3, count: 9 },
  { key: '4x4', label: '4×4', cols: 4, count: 16 },
  { key: '1+5', label: '1+5', cols: 0, count: 6 },
];

function buildWallTiles(
  zones: Array<{ zone: string; cameras: number; online: number }>,
  count: number,
): CameraTile[] {
  const pool: CameraTile[] = [];
  for (const z of zones) {
    for (let i = 1; i <= z.cameras && pool.length < 64; i++) {
      pool.push({
        id: `${z.zone.replace(/\s+/g, '-')}-${String(i).padStart(2, '0')}`,
        zone: z.zone,
        online: i <= z.online,
      });
    }
  }
  if (pool.length === 0) return [];
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
}

const MockFeedTile = ({ tile, small = false }: { tile: CameraTile; small?: boolean }) => {
  const [secs, setSecs] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setSecs(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const ts = `${String(secs.getHours()).padStart(2, '0')}:${String(secs.getMinutes()).padStart(2, '0')}:${String(secs.getSeconds()).padStart(2, '0')}`;
  return (
    <div className="relative w-full h-full bg-slate-950 border border-slate-800 overflow-hidden select-none group">
      {/* scanlines overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,.15) 2px,rgba(255,255,255,.15) 3px)' }}
      />
      {/* center camera icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        <Camera className={`${small ? 'h-5 w-5' : 'h-10 w-10'} text-slate-800`} />
      </div>
      {/* top-left: record / offline indicator */}
      <div className="absolute top-1.5 left-2 flex items-center gap-1.5">
        {tile.online ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="text-red-400 font-bold text-[9px] uppercase tracking-wide">LIVE</span>
          </>
        ) : (
          <span className="text-slate-600 text-[9px] font-medium uppercase tracking-wide">OFFLINE</span>
        )}
      </div>
      {/* top-right: timestamp */}
      <div className="absolute top-1.5 right-2">
        <span className="text-slate-500 text-[9px] font-mono">{ts}</span>
      </div>
      {/* bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
        <div className="flex items-end justify-between gap-1">
          <span className={`text-white font-medium truncate ${small ? 'text-[8px]' : 'text-[10px]'}`}>{tile.zone}</span>
          <span className={`text-slate-500 font-mono shrink-0 ${small ? 'text-[8px]' : 'text-[9px]'}`}>
            {tile.id.split('-').slice(-2).join('-')}
          </span>
        </div>
      </div>
      {/* hover highlight */}
      <div className="absolute inset-0 border-2 border-transparent group-hover:border-teal-500/50 pointer-events-none transition-colors" />
    </div>
  );
};

const VideoWallModal = ({
  open,
  onClose,
  zones,
}: {
  open: boolean;
  onClose: () => void;
  zones: Array<{ zone: string; cameras: number; online: number }>;
}) => {
  const [layout, setLayout] = React.useState<WallLayout>('2x2');
  if (!open) return null;
  const lConfig = WALL_LAYOUTS.find(l => l.key === layout)!;
  const tiles = buildWallTiles(zones, lConfig.count);
  const totalOnline = zones.reduce((s, z) => s + z.online, 0);
  const totalCams   = zones.reduce((s, z) => s + z.cameras, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <Camera className="h-4 w-4 text-teal-400" />
          <span className="text-white font-semibold text-sm">Video Wall — Live Surveillance</span>
          <span className="text-[11px] text-slate-400 hidden sm:block">
            {totalOnline}/{totalCams} cameras online · {zones.length} zones
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 mr-1 hidden sm:block">Layout:</span>
          {WALL_LAYOUTS.map(l => (
            <button
              key={l.key}
              onClick={() => setLayout(l.key)}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                layout === l.key
                  ? 'bg-teal-600 border-teal-500 text-white'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white bg-transparent'
              }`}
            >
              {l.label}
            </button>
          ))}
          <button
            onClick={onClose}
            className="ml-2 text-slate-400 hover:text-white transition-colors p-1.5 rounded hover:bg-slate-700"
            aria-label="Close video wall"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Camera grid */}
      <div className="flex-1 p-1.5 overflow-hidden min-h-0">
        {layout === '1+5' ? (
          <div className="flex h-full gap-1.5">
            <div className="flex-[2] min-w-0">
              <MockFeedTile tile={tiles[0]} />
            </div>
            <div className="flex-[1] flex flex-col gap-1.5 min-w-0">
              {tiles.slice(1).map((t, i) => (
                <div key={i} className="flex-1 min-h-0">
                  <MockFeedTile tile={t} small />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            className="h-full gap-1.5"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${lConfig.cols}, 1fr)`,
              gridTemplateRows: `repeat(${Math.ceil(lConfig.count / lConfig.cols)}, 1fr)`,
            }}
          >
            {tiles.map((t, i) => (
              <MockFeedTile key={i} tile={t} small={lConfig.cols >= 4} />
            ))}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-1.5 bg-slate-900 border-t border-slate-800 shrink-0 flex items-center justify-between">
        <span className="text-[10px] text-slate-600">
          Mock feeds — connect RTSP/HLS streams per camera to activate live view
        </span>
        <span className="text-[10px] text-slate-600">{lConfig.count} tiles · {lConfig.label}</span>
      </div>
    </div>
  );
};

export const SecurityCCTVPage = () => {
  const { data, loading, error, refresh } = useSecurityPortalData();
  const cctv = data?.cctv ?? fallbackCctv;
  const [wallOpen, setWallOpen] = React.useState(false);
  return (
    <>
      <VideoWallModal open={wallOpen} onClose={() => setWallOpen(false)} zones={cctv} />
      <PageShell
        title="CCTV Monitor"
        subtitle="Campus camera health, zone coverage, and analytics watchlists"
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1">
              <Download className="h-4 w-4" />Export Uptime
            </Button>
            <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => setWallOpen(true)}>
              <Camera className="h-4 w-4" />Open Video Wall
            </Button>
          </>
        }
      >
        <SecurityDataState loading={loading} error={error} refresh={refresh} />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Total Cameras"  value={String(cctv.reduce((sum, row) => sum + row.cameras, 0))} sub="Across all hospital zones"       icon={Camera}      color="text-blue-600"   />
          <StatCard label="Online Streams" value={String(cctv.reduce((sum, row) => sum + row.online,  0))} sub="Current active feeds"             icon={ShieldCheck} color="text-emerald-600" />
          <StatCard label="Analytics Zones" value={String(cctv.length)}                                    sub="AI-assisted security coverage"   icon={ScanLine}    color="text-violet-600" />
          <StatCard label="Degraded Areas" value={String(cctv.filter(row => row.status !== 'Operational').length)} sub="Needs maintenance follow-up" icon={AlertTriangle} color="text-amber-600" />
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">Zone Camera Matrix</CardTitle></CardHeader>
          <CardContent>
            <SectionTable
              headers={['Zone', 'Cameras', 'Online', 'Analytics', 'Status']}
              rows={cctv.map(row => [row.zone, String(row.cameras), String(row.online), row.analytics, <ToneBadge value={row.status} />])}
            />
          </CardContent>
        </Card>
      </PageShell>
    </>
  );
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
  const [showIssue, setShowIssue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ visitor: '', destination: '', passType: 'Visitor', escort: '' });
  const visitors = data?.visitors ?? [];
  const headers = () => {
    const token = window.localStorage.getItem('securityToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  const issuePass = async () => {
    if (!form.visitor.trim() || !form.destination.trim()) return;
    setSaving(true);
    try {
      await api.post('/hospital/staff/security/visitors', { visitor: form.visitor.trim(), destination: form.destination.trim(), passType: form.passType, escort: form.escort.trim() || undefined }, { headers: headers() });
      setForm({ visitor: '', destination: '', passType: 'Visitor', escort: '' });
      setShowIssue(false);
      await refresh();
    } finally { setSaving(false); }
  };
  const checkOut = async (row: { id: string; version?: number }) => {
    await api.patch(`/hospital/staff/security/visitors/${encodeURIComponent(row.id)}`, { status: 'Exited', expectedVersion: row.version }, { headers: headers() });
    await refresh();
  };
  return <PageShell title="Visitor Management" subtitle="Pass issuance, escort tracking, and inside / exited visitor control" actions={<><Button variant="outline" size="sm" className="gap-1" onClick={() => window.print()}><Download className="h-4 w-4" />Print Register</Button><Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => setShowIssue((open) => !open)}><UserRoundCheck className="h-4 w-4" />Issue Pass</Button></>}><SecurityDataState loading={loading} error={error} refresh={refresh} />{showIssue && <Card><CardHeader><CardTitle className="text-base">Issue visitor pass</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-4"><Input aria-label="Visitor name" placeholder="Visitor name" value={form.visitor} onChange={(event) => setForm({ ...form, visitor: event.target.value })} /><Input aria-label="Destination" placeholder="Destination / patient location" value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value })} /><Input aria-label="Pass type" placeholder="Pass type" value={form.passType} onChange={(event) => setForm({ ...form, passType: event.target.value })} /><div className="flex gap-2"><Input aria-label="Escort" placeholder="Escort (optional)" value={form.escort} onChange={(event) => setForm({ ...form, escort: event.target.value })} /><Button onClick={issuePass} disabled={saving || !form.visitor.trim() || !form.destination.trim()}>{saving ? 'Issuing…' : 'Create'}</Button></div></CardContent></Card>}<Card><CardHeader><CardTitle className="text-base">Visitor Pass Console</CardTitle></CardHeader><CardContent>{!loading && !error && visitors.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No visitor passes have been issued for this hospital.</p> : <SectionTable headers={['Pass ID', 'Visitor', 'Destination', 'Pass Type', 'Check-in', 'Status', '']} rows={visitors.map((row) => [row.id, row.visitor, row.patient, row.passType, row.checkIn, <ToneBadge value={row.status} />, row.status !== 'Exited' ? <Button size="sm" variant="outline" onClick={() => checkOut(row)}>Check out</Button> : null])} />}</CardContent></Card></PageShell>;
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

// Asset data is not part of the security portal response yet; the screen shows an honest empty state.

const criticalAssetWatchlist: any[] = [];

export function AssetTrackingContent() {
  const { loading, error, refresh } = useSecurityPortalData();
  const inventory: any[] = [];
  const movements: any[] = [];
  const theftAlarms: any[] = [];
  const reports: any[] = [];
  const sop = fallbackAssetSOP;
  const iotDevices: any[] = [];

  const totalAssets = inventory.length;
  const inUse = inventory.filter((a) => a.status === 'In Use').length;
  const available = inventory.filter((a) => a.status === 'Available').length;
  const inMaintenance = inventory.filter((a) => a.status === 'Maintenance').length;
  const openAlarms = theftAlarms.filter((a) => a.status === 'Investigating').length;

  return (
    <div className="space-y-5 p-4 md:p-6">
        <SecurityDataState loading={loading} error={error} refresh={refresh} />

        {/* ── Top KPI Bar ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
          <StatCard label="Total Assets" value={String(totalAssets)} sub="Registered in registry" icon={Archive} color="text-blue-600" />
          <StatCard label="In Use" value={String(inUse)} sub="Deployed in departments" icon={Package} color="text-emerald-600" />
          <StatCard label="Available" value={String(available)} sub="Ready for dispatch" icon={CheckCircle2} color="text-teal-600" />
          <StatCard label="Open Theft Alerts" value={String(openAlarms)} sub="Needs immediate action" icon={ShieldX} color="text-red-600" />
          <StatCard label="Under Maintenance" value={String(inMaintenance)} sub="Scheduled or in repair" icon={Barcode} color="text-amber-600" />
        </div>

        {/* ── IoT Telemetry KPIs ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
          <StatCard label="IoT Tags Online" value={String(iotDevices.filter((d) => d.status !== 'Offline').length)} sub="Live on tracking network" icon={Cpu} color="text-violet-600" />
          <StatCard label="RFID Tags" value={String(iotDevices.filter((d) => d.type.startsWith('RFID')).length)} sub="Passive · Semi-passive · Active" icon={Wifi} color="text-blue-600" />
          <StatCard label="BLE Beacons" value={String(iotDevices.filter((d) => d.type === 'BLE Beacon').length)} sub="Indoor room-level accuracy" icon={Bluetooth} color="text-sky-600" />
          <StatCard label="GPS Trackers" value={String(iotDevices.filter((d) => d.type === 'GPS Tracker').length)} sub="Outdoor & vehicle assets" icon={Navigation} color="text-emerald-600" />
          <StatCard label="Battery Alerts" value={String(iotDevices.filter((d) => d.status === 'Battery Low').length)} sub="Replace / recharge now" icon={Signal} color="text-amber-600" />
        </div>

        {/* ── Main Tabbed Dashboard ───────────────────────────────────── */}
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="mb-4 flex flex-wrap gap-1 h-auto">
            <TabsTrigger value="dashboard" className="gap-1.5"><Activity className="h-3.5 w-3.5" />Dashboard</TabsTrigger>
            <TabsTrigger value="inventory" className="gap-1.5"><Archive className="h-3.5 w-3.5" />Inventory</TabsTrigger>
            <TabsTrigger value="iot" className="gap-1.5"><Cpu className="h-3.5 w-3.5" />IoT Devices</TabsTrigger>
            <TabsTrigger value="movement" className="gap-1.5"><MoveRight className="h-3.5 w-3.5" />Movements</TabsTrigger>
            <TabsTrigger value="theft" className="gap-1.5"><ShieldX className="h-3.5 w-3.5" />Theft Alarms</TabsTrigger>
            <TabsTrigger value="reports" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Reports</TabsTrigger>
            <TabsTrigger value="sop" className="gap-1.5"><BookMarked className="h-3.5 w-3.5" />SOP</TabsTrigger>
          </TabsList>

          {/* ═══════════════════════ DASHBOARD TAB ════════════════════════════ */}
          <TabsContent value="dashboard" className="space-y-5">

            {/* Zone Location Map */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LocateFixed className="h-5 w-5 text-teal-600" />
                    <CardTitle className="text-base">Live Zone Asset Map</CardTitle>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1"><RefreshCw className="h-3.5 w-3.5" />Refresh</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 xl:grid-cols-5 gap-3">
                  {zoneMap.map((z) => (
                    <div key={z.zone} className={`rounded-xl border-2 p-3 ${z.color}`}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${z.dot} animate-pulse`} />
                        <span className="text-xs font-semibold text-slate-700">{z.zone}</span>
                      </div>
                      <p className="text-2xl font-bold text-slate-900">{z.assets}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{z.online}/{z.assets} online</p>
                      {z.critical > 0 && (
                        <Badge className="mt-1.5 text-xs bg-red-100 text-red-700 border-0">{z.critical} critical</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {/* Asset Utilisation Breakdown */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-blue-600" />
                    <CardTitle className="text-base">Asset Utilisation Breakdown</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: 'In Use', value: inUse, total: totalAssets, color: 'bg-emerald-500' },
                    { label: 'Available', value: available, total: totalAssets, color: 'bg-teal-500' },
                    { label: 'Under Maintenance', value: inMaintenance, total: totalAssets, color: 'bg-amber-500' },
                    { label: 'Standby', value: inventory.filter((a) => a.status === 'Standby').length, total: totalAssets, color: 'bg-blue-400' },
                  ].map((row) => (
                    <div key={row.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium">{row.label}</span>
                        <span className="text-muted-foreground">{row.value} / {row.total} ({Math.round((row.value / row.total) * 100)}%)</span>
                      </div>
                      <Progress value={Math.round((row.value / row.total) * 100)} className="h-2" />
                    </div>
                  ))}
                  <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-xs text-muted-foreground">
                    Asset utilisation is reviewed every shift. Target: In-use rate &gt;70% for critical equipment.
                  </div>
                </CardContent>
              </Card>

              {/* Critical Asset Watchlist */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-red-600" />
                    <CardTitle className="text-base">Critical Asset Watchlist</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {criticalAssetWatchlist.map((a) => (
                    <div key={a.assetId} className="flex items-start justify-between rounded-lg bg-muted/40 p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{a.zone}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <AssetBadge value={a.tag} />
                          <span className="text-xs text-muted-foreground">Ping {a.lastPing}</span>
                        </div>
                      </div>
                      <div className="text-right ml-3 shrink-0 space-y-1">
                        <AssetBadge value={a.status} />
                        <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground mt-1">
                          <span>🔋 {a.battery}%</span>
                          <span>📶 {a.signal}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {/* Movement Timeline */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-violet-600" />
                    <CardTitle className="text-base">Today's Movement Timeline</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {movementTimeline.map((ev, idx) => (
                      <div key={idx} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className={`h-2.5 w-2.5 rounded-full mt-1 shrink-0 ${
                            ev.type === 'Alert' ? 'bg-red-500' :
                            ev.type === 'Resolved' ? 'bg-emerald-500' :
                            ev.type === 'In Transit' ? 'bg-blue-500' : 'bg-teal-500'
                          }`} />
                          {idx < movementTimeline.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                        </div>
                        <div className="pb-3">
                          <p className="text-xs font-medium leading-snug">{ev.event}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{ev.time} · {ev.user}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* IoT Tag Health Matrix */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5 text-slate-600" />
                    <CardTitle className="text-base">IoT Tag Health Matrix</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2.5">
                    {[
                      { type: 'RFID Passive', total: iotDevices.filter((d) => d.type === 'RFID Passive').length, online: iotDevices.filter((d) => d.type === 'RFID Passive' && d.status === 'Active').length, color: 'bg-slate-500', low: 0 },
                      { type: 'RFID Semi-Passive', total: iotDevices.filter((d) => d.type === 'RFID Semi-Passive').length, online: iotDevices.filter((d) => d.type === 'RFID Semi-Passive' && d.status === 'Active').length, color: 'bg-blue-500', low: 0 },
                      { type: 'RFID Active', total: iotDevices.filter((d) => d.type === 'RFID Active').length, online: iotDevices.filter((d) => d.type === 'RFID Active' && d.status === 'Active').length, color: 'bg-violet-500', low: iotDevices.filter((d) => d.type === 'RFID Active' && d.status === 'Battery Low').length },
                      { type: 'BLE Beacon', total: iotDevices.filter((d) => d.type === 'BLE Beacon').length, online: iotDevices.filter((d) => d.type === 'BLE Beacon' && d.status === 'Active').length, color: 'bg-sky-500', low: 0 },
                      { type: 'GPS Tracker', total: iotDevices.filter((d) => d.type === 'GPS Tracker').length, online: iotDevices.filter((d) => d.type === 'GPS Tracker' && d.status === 'Active').length, color: 'bg-emerald-500', low: 0 },
                    ].map((row) => (
                      <div key={row.type} className="rounded-lg bg-muted/40 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold">{row.type}</span>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-emerald-600 font-medium">{row.online} online</span>
                            {row.low > 0 && <Badge className="text-xs bg-amber-100 text-amber-700 border-0">{row.low} low batt</Badge>}
                            <span className="text-muted-foreground">/{row.total}</span>
                          </div>
                        </div>
                        <Progress value={row.total > 0 ? Math.round((row.online / row.total) * 100) : 0} className="h-1.5" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                    <span className="font-semibold">Action required:</span> Defibrillator (AST-1007) RFID Active tag battery at 18%. Schedule replacement within 4 hours.
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ═══════════════════════ INVENTORY TAB ════════════════════════════ */}
          <TabsContent value="inventory">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Archive className="h-5 w-5 text-blue-600" />
                    <CardTitle className="text-base">Asset Inventory Register</CardTitle>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input placeholder="Search assets..." className="pl-8 h-8 text-sm w-48" />
                    </div>
                    <Button variant="outline" size="sm" className="gap-1"><Filter className="h-3.5 w-3.5" />Filter</Button>
                    <Button variant="outline" size="sm" className="gap-1"><Download className="h-3.5 w-3.5" />Export</Button>
                    <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-3.5 w-3.5" />Register Asset</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <SectionTable
                  headers={['Asset ID', 'Name', 'Category', 'Location', 'Custodian Dept', 'IoT Tag', 'Status', 'Last Audit']}
                  rows={inventory.map((row) => [
                    <span className="font-mono text-xs text-muted-foreground">{row.assetId}</span>,
                    <span className="font-medium">{row.name}</span>,
                    row.category,
                    row.location,
                    row.assigned,
                    <AssetBadge value={row.tag} />,
                    <AssetBadge value={row.status} />,
                    row.lastAudit,
                  ])}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════════════════ IOT DEVICES TAB ══════════════════════════ */}
          <TabsContent value="iot" className="space-y-5">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-violet-600" />
                    <CardTitle className="text-base">IoT Tag &amp; Device Registry</CardTitle>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-1"><Download className="h-3.5 w-3.5" />Export Tags</Button>
                    <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><PlusCircle className="h-3.5 w-3.5" />Provision Tag</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <SectionTable
                  headers={['Tag ID', 'Type', 'Asset', 'Zone', 'Frequency', 'Range', 'Battery', 'Last Seen', 'Status']}
                  rows={iotDevices.map((row) => [
                    <span className="font-mono text-xs text-muted-foreground">{row.tagId}</span>,
                    <AssetBadge value={row.type} />,
                    <span className="text-xs">{row.assetId} · {row.assetName}</span>,
                    row.zone,
                    row.frequency,
                    row.range,
                    <span className={row.battery !== '–' && parseInt(row.battery) < 25 ? 'text-red-600 font-semibold' : ''}>{row.battery}</span>,
                    row.lastSeen,
                    <AssetBadge value={row.status} />,
                  ])}
                />
              </CardContent>
            </Card>
            <div>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">IoT Technology Reference</h3>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                {iotTechCards.map(({ title, icon: ItemIcon, color, bg, text }) => (
                  <Card key={title}>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <div className={`rounded-lg ${bg} p-2`}><ItemIcon className={`h-4 w-4 ${color}`} /></div>
                        <CardTitle className="text-sm">{title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground leading-relaxed">{text}</CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ═══════════════════════ MOVEMENT TAB ════════════════════════════ */}
          <TabsContent value="movement">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MoveRight className="h-5 w-5 text-teal-600" />
                    <CardTitle className="text-base">Authorised Movement Log</CardTitle>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-1"><Download className="h-3.5 w-3.5" />Export Log</Button>
                    <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><MoveRight className="h-3.5 w-3.5" />Raise Movement</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <SectionTable
                  headers={['Mov. ID', 'Asset', 'From', 'To', 'Requested By', 'Approved By', 'Time', 'Status']}
                  rows={movements.map((row) => [
                    <span className="font-mono text-xs text-muted-foreground">{row.movId}</span>,
                    row.asset,
                    row.from,
                    row.to,
                    row.requestedBy,
                    row.approved,
                    row.time,
                    <AssetBadge value={row.status} />,
                  ])}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════════════════ THEFT ALARMS TAB ════════════════════════ */}
          <TabsContent value="theft">
            <Card className="border-red-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldX className="h-5 w-5 text-red-600" />
                    <CardTitle className="text-base">Theft &amp; Loss Alarms</CardTitle>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-1 border-red-200 text-red-700 hover:bg-red-50"><Download className="h-3.5 w-3.5" />Export Alerts</Button>
                    <Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"><Siren className="h-3.5 w-3.5" />Raise Theft Alert</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <SectionTable
                  headers={['Alert ID', 'Asset', 'Zone', 'Trigger', 'Severity', 'Status', 'Owner']}
                  rows={theftAlarms.map((row) => [
                    <span className="font-mono text-xs text-muted-foreground">{row.alertId}</span>,
                    row.asset,
                    row.zone,
                    row.trigger,
                    <AssetBadge value={row.severity} />,
                    <AssetBadge value={row.status} />,
                    row.owner,
                  ])}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════════════════ REPORTS TAB ═════════════════════════════ */}
          <TabsContent value="reports">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-teal-600" />
                    <CardTitle className="text-base">Asset Reports Catalogue</CardTitle>
                  </div>
                  <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><FileText className="h-3.5 w-3.5" />Generate Report</Button>
                </div>
              </CardHeader>
              <CardContent>
                <SectionTable
                  headers={['Report', 'Cadence', 'Audience', 'Status']}
                  rows={reports.map((row) => [row.name, row.cadence, row.audience, <AssetBadge value={row.status} />])}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════════════════ SOP TAB ══════════════════════════════════ */}
          <TabsContent value="sop">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {sop.map((item) => (
                <Card key={item.title}>
                  <CardHeader><CardTitle className="text-base">{item.title}</CardTitle></CardHeader>
                  <CardContent className="text-sm text-muted-foreground leading-relaxed">{item.text}</CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
    </div>
  );
}

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

// ─── Security Implementation Procedures data ─────────────────────────────────

type ImplBlock = { title: string; icon: LucideIcon; color: string; bg: string; sla?: string; items: { label: string; detail: string }[] };

const implFramework: ImplBlock[] = [
  {
    title: 'Security Governance Framework',
    icon: ShieldCheck,
    color: 'text-teal-600',
    bg: 'bg-teal-50',
    items: [
      { label: 'Role: Chief Security Officer (CSO)', detail: 'Accountable for all security policies, staff, technology, and compliance. Reports to Hospital Director.' },
      { label: 'Role: Shift Security Supervisor', detail: 'Command authority during shift. Controls access, coordinates guards, handles escalations.' },
      { label: 'Role: Control Room Operator', detail: 'Monitors CCTV, RFID alarms, BLE/GPS events, and all IoT sensors 24×7.' },
      { label: 'Security Committee', detail: 'Monthly meeting — CSO, IT Head, Biomedical Lead, Facilities, Admin. Reviews incidents, audits, policy changes.' },
      { label: 'Policy Review Cycle', detail: 'All security policies reviewed quarterly. Emergency protocols reviewed after every significant incident.' },
    ],
  },
  {
    title: 'Access Control Protocol',
    icon: KeyRound,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    items: [
      { label: 'Badge Issuance Procedure', detail: 'HR issues RFID badge post biometric enrolment. Access levels assigned by department head. Badge activated within 30 minutes of onboarding.' },
      { label: 'Biometric Enrolment', detail: 'Fingerprint + face scan mandatory for ICU, OT, Pharmacy, and Server Room access. Enrolment managed by IT Security team.' },
      { label: 'Temporary Credentials', detail: 'Visitor/vendor temp badges issued at Security Desk with 8-hour expiry, logged with photo ID. Extensions require supervisor approval.' },
      { label: 'Zone Classification', detail: 'Zone 1 (Public) · Zone 2 (Staff only) · Zone 3 (Clinical restricted) · Zone 4 (Critical — biometric required) · Zone 5 (Vault — dual auth).' },
      { label: 'Badge Deactivation', detail: 'HR triggers deactivation on same day of resignation/termination. All temp badges auto-expire at end of shift.' },
    ],
  },
  {
    title: 'CCTV & Surveillance Protocol',
    icon: Camera,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    items: [
      { label: 'Camera Placement Standard', detail: 'All entry/exit points, corridors, ICU, OT, Pharmacy, Server Room, Parking, Ambulance Bay. No cameras in patient private rooms, changing rooms, or rest areas.' },
      { label: 'Retention Policy', detail: 'Standard footage: 30 days. ICU/OT: 90 days. Incident-flagged footage: 1 year. All stored on encrypted NVR with off-site backup.' },
      { label: 'Analytics SOP', detail: 'ANPR, tailgating detection, crowd density, loitering, and face recognition (controlled zones only). Alerts routed to Control Room within 3 seconds.' },
      { label: 'Video Wall Operations', detail: 'Control Room operates 24×7. Minimum 2 operators per shift. Critical zone feeds displayed on dedicated screens at all times.' },
      { label: 'Maintenance SLA', detail: 'Camera downtime reported immediately. Repair SLA: 4 hours for critical zones, 24 hours for standard zones. Monthly uptime audit submitted to CSO.' },
    ],
  },
  {
    title: 'Asset Security & IoT Protocol',
    icon: Package,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    items: [
      { label: 'Asset Tagging Standard', detail: 'All assets >₹5,000 tagged on procurement. RFID Passive for low-value/static, Semi-Passive for environmental monitoring, Active for critical/mobile. BLE for indoor multi-zone. GPS for vehicles.' },
      { label: 'RFID Gate Control', detail: 'RFID readers installed at all Zone 2–5 entry points and hospital perimeter exits. Unregistered asset exits trigger immediate Theft Alert and visual gate alarm.' },
      { label: 'BLE Infrastructure', detail: 'BLE gateways installed every 15 m on all ward floors and clinical areas. Room-level accuracy achieved for all tagged assets continuously.' },
      { label: 'GPS Geofencing', detail: 'All vehicles/off-campus assets have a defined geofence. Breach triggers SMS + app alert to Control Room and CSO within 60 seconds.' },
      { label: 'IoT Network Security', detail: 'All IoT devices on isolated VLAN. RFID readers authenticated with TLS 1.3. Tag data encrypted at rest and in transit. Quarterly penetration testing of IoT network.' },
    ],
  },
  {
    title: 'Incident Response Procedure',
    icon: ShieldAlert,
    color: 'text-red-600',
    bg: 'bg-red-50',
    sla: 'Severity 1: 2 min acknowledge · 10 min respond | Severity 2: 5 min acknowledge · 20 min respond | Severity 3: 15 min acknowledge',
    items: [
      { label: 'Classification', detail: 'Severity 1 (Critical): Active threat, assault, fire, Code Red, armed intruder. Severity 2 (High): Unauthorized access, RFID theft alarm, suspicious package. Severity 3 (Low): Lost property, minor access violation.' },
      { label: 'First Response Steps', detail: '1. Control Room creates SEC-ID. 2. Nearest guard dispatched. 3. CCTV review initiated. 4. Supervisor notified. 5. Isolation/lockdown if required.' },
      { label: 'Escalation Matrix', detail: 'Supervisor → CSO (2 min) → Hospital Director (5 min) → Police if required. Simultaneous notification to involved department head.' },
      { label: 'Investigation Protocol', detail: 'Incident report filed within 2 hours. CCTV evidence preserved. Witness statements within 24 hours. Formal report to management within 48 hours.' },
      { label: 'Post-Incident Review', detail: 'Root cause analysis within 72 hours. Control improvements identified. Updated procedures circulated within 7 days. Reported to Security Committee.' },
    ],
  },
  {
    title: 'Guard Duty & Patrol Procedures',
    icon: Radio,
    color: 'text-slate-600',
    bg: 'bg-slate-100',
    items: [
      { label: 'Shift Structure', detail: 'Three 8-hour shifts: Morning 06:00–14:00, Afternoon 14:00–22:00, Night 22:00–06:00. Minimum 12 guards per shift. Shift commander always designated.' },
      { label: 'Post Assignments', detail: 'Fixed posts: Main Gate, Emergency Entry, ICU Wing, OT Complex, Pharmacy, Parking, Ambulance Bay. Roving patrols for wards and perimeter.' },
      { label: 'Patrol Check-In', detail: 'Guards scan NFC checkpoint at each patrol stop. Missed check-in triggers supervisor alert after 15 minutes. Patrol data logged and reviewed daily.' },
      { label: 'Communication Protocol', detail: 'All guards equipped with encrypted two-way radio. Primary: radio. Secondary: mobile app. Duress code activates Control Room emergency response.' },
      { label: 'Handover Procedure', detail: 'Written handover log at every shift change. Outgoing supervisor briefs incoming on open incidents, access changes, and special instructions. Takes 15 minutes minimum.' },
    ],
  },
  {
    title: 'Emergency Response Protocols',
    icon: Siren,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    sla: 'Lockdown: < 90 seconds campus-wide | Code Red: immediate ward isolation | Infant Security: 3-minute full sweep',
    items: [
      { label: 'Lockdown Procedure', detail: 'Triggered by CSO or Hospital Director. All perimeter gates locked. Visitor exit halted. Staff shelter-in-place. Police notified simultaneously. PA announcement in 30 seconds.' },
      { label: 'Fire Emergency (Code Red)', detail: 'Fire alarm auto-locks all non-fire-exit doors. Security guides evacuation routes. Controls crowd at assembly points. Assists fire brigade with campus access.' },
      { label: 'Infant Security Protocol', detail: 'Any missing infant triggers full campus sweep in 3 minutes. All exits manned. CCTV reviewed instantly. Maternity ward sealed. Police notified at T+5 minutes.' },
      { label: 'Active Threat Response', detail: 'Control Room activates Code Black. Armed police contacted immediately. Security denies entry, isolates area, does not engage threat. PA lockdown announcement.' },
      { label: 'VIP / Dignitary Security', detail: '48-hour advance security survey. Dedicated escort detail. Control Room briefed. Access routes pre-cleared. Command desk maintains open line throughout visit.' },
    ],
  },
  {
    title: 'Visitor & Vendor Management',
    icon: Users,
    color: 'text-sky-600',
    bg: 'bg-sky-50',
    items: [
      { label: 'Check-In Process', detail: 'Visitor presents ID. Photo captured. Pass issued with department, patient, and expiry printed. RFID-enabled pass activates Zone 1-2 access only.' },
      { label: 'Visiting Hours Policy', detail: 'General visitors: 10:00–12:00, 17:00–19:00. ICU/Critical Care: 1 attendant 24×7, additional visitors escorted only. OT: No visitors. Pharmacy/Labs: Staff only.' },
      { label: 'Vendor Access', detail: 'All vendors pre-registered in vendor portal. Access limited to designated area and time window. Escorted by designated staff member at all times in Zones 3–5.' },
      { label: 'Blacklist / Watchlist', detail: 'Debarred individuals loaded into access control system and face recognition. Alert triggered on attempted entry. Control Room notified instantly.' },
      { label: 'Overstay Management', detail: 'Pass expiry triggers auto-alert. Security notifies ward staff. Guard escorts visitor to exit. Repeated overstays result in blacklisting.' },
    ],
  },
  {
    title: 'Compliance & Audit Schedule',
    icon: ListChecks,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    items: [
      { label: 'Daily', detail: 'Shift handover log. CCTV uptime report. Access denial exceptions reviewed. Visitor pass overstays reconciled. Asset alarm review.' },
      { label: 'Weekly', detail: 'Guard duty attendance audit. Patrol compliance report. Access log anomaly review. IoT tag battery status. Failed access attempts analysis.' },
      { label: 'Monthly', detail: 'Full asset inventory audit (Security + Biomedical). CCTV storage capacity check. Badge access rights review. Incident trend analysis presentation to management.' },
      { label: 'Quarterly', detail: 'Security policy review. Emergency drill (fire, lockdown, infant). IoT network penetration test. Vendor access audit. Insurance asset reconciliation.' },
      { label: 'Annual', detail: 'Independent security audit by external agency. Full biometric re-enrolment verification. Asset lifecycle review. NABH/JCI security compliance self-assessment.' },
    ],
  },
];

export const SecurityImplementationPage = () => {
  const { loading, error, refresh } = useSecurityPortalData();
  const [activeSection, setActiveSection] = React.useState<string>('all');

  const displayBlocks = activeSection === 'all' ? implFramework : implFramework.filter((b) => b.title === activeSection);

  return (
    <HospDeptLayout
      deptKey="security" deptName="Security" badgeLabel="Security"
      loginPath="/security/login" DeptIcon={Lock}
      navSections={securityNavSections}
      title="Security Implementation"
      subtitle="Procedures, protocols, and operational processes for world-class hospital security"
    >
      <div className="space-y-5">
        <SecurityDataState loading={loading} error={error} refresh={refresh} />

        {/* Header banner */}
        <Card className="border-teal-200 bg-gradient-to-r from-teal-50 to-slate-50 dark:from-teal-950 dark:to-slate-900">
          <CardContent className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-5">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-teal-100 p-3 dark:bg-teal-900">
                <ShieldEllipsis className="h-8 w-8 text-teal-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Hospital Security Implementation Framework</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  9 major domains · 44 procedures · Aligned with NABH, JCI, ISO 27001, and NDMA hospital security guidelines.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {['NABH 2026', 'JCI Standards', 'ISO 27001', 'NDMA Guidelines'].map((s) => (
                    <Badge key={s} className="text-xs bg-teal-100 text-teal-700 border-0">{s}</Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export SOP</Button>
              <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"><BookOpen className="h-4 w-4" />Policy Portal</Button>
            </div>
          </CardContent>
        </Card>

        {/* Domain filter bar */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeSection === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveSection('all')}
            className={activeSection === 'all' ? 'bg-teal-600 hover:bg-teal-700' : ''}
          >All Domains</Button>
          {implFramework.map(({ title, icon: ItemIcon }) => (
            <Button
              key={title}
              variant={activeSection === title ? 'default' : 'outline'}
              size="sm"
              className={`gap-1 ${activeSection === title ? 'bg-teal-600 hover:bg-teal-700' : ''}`}
              onClick={() => setActiveSection(activeSection === title ? 'all' : title)}
            >
              <ItemIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{title.split(' ')[0]}</span>
            </Button>
          ))}
        </div>

        {/* Implementation blocks */}
        <div className="space-y-6">
          {displayBlocks.map(({ title, icon: ItemIcon, color, bg, sla, items }) => (
            <Card key={title}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-xl ${bg} p-2.5`}>
                      <ItemIcon className={`h-5 w-5 ${color}`} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{title}</CardTitle>
                      {sla && (
                        <p className="mt-1 text-xs text-muted-foreground font-medium">{sla}</p>
                      )}
                    </div>
                  </div>
                  <Badge className="text-xs bg-emerald-100 text-emerald-700 border-0 shrink-0">{items.length} procedures</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {items.map((item, idx) => (
                    <div key={idx} className="flex gap-3 rounded-lg bg-muted/40 p-3 hover:bg-muted/70 transition-colors">
                      <div className={`mt-0.5 rounded-full ${bg} p-1 shrink-0`}>
                        <CheckCircle2 className={`h-3.5 w-3.5 ${color}`} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{item.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </HospDeptLayout>
  );
};

export const SecurityCameraAnalyticsPage = () => (
  <HospDeptLayout
    deptKey="security"
    deptName="Security"
    badgeLabel="Security"
    loginPath="/security/login"
    DeptIcon={Lock}
    navSections={securityNavSections}
    title="Camera Analytics"
    subtitle="Vision analytics per camera, connected to your CCTV DVR/NVR through an on-premises gateway"
  >
    <SurveillanceContent />
  </HospDeptLayout>
);

export const SecurityParkingPage = () => (
  <HospDeptLayout
    deptKey="security"
    deptName="Security"
    badgeLabel="Security"
    loginPath="/security/login"
    DeptIcon={Lock}
    navSections={securityNavSections}
    title="Parking"
    subtitle="Lots, gate entry and exit, passes, watchlist, incidents, overstay alerts and devices"
  >
    <ParkingContent />
  </HospDeptLayout>
);

export const SecurityAssetTrackingPage = () => (
  <HospDeptLayout
    deptKey="security"
    deptName="Security"
    badgeLabel="Security"
    loginPath="/security/login"
    DeptIcon={Lock}
    navSections={securityNavSections}
    title="Asset Tracking"
    subtitle="Hospital asset inventory, registry, authorised movement, theft alarms, and compliance reports"
  >
    <AssetTrackingContent />
  </HospDeptLayout>
);
