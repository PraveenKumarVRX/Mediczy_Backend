import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Lock, Camera, ShieldAlert, Users, KeyRound,
  MapPin, AlertTriangle, ClipboardList, BarChart3,
  ChevronRight, PlusCircle, Radio,
} from 'lucide-react';

const navSections: DeptNavSection[] = [
  { title: 'Overview', items: [{ icon: Lock, label: 'Dashboard', href: '/security/dashboard' }] },
  { title: 'Surveillance', items: [
    { icon: Camera,      label: 'CCTV Monitor',      href: '/security/cctv' },
    { icon: MapPin,      label: 'Access Points',     href: '/security/access-points' },
    { icon: KeyRound,    label: 'Access Logs',       href: '/security/access-logs' },
  ]},
  { title: 'Incidents', items: [
    { icon: ShieldAlert,   label: 'Incident Log',    href: '/security/incidents' },
    { icon: AlertTriangle, label: 'Active Alerts',   href: '/security/alerts' },
    { icon: Radio,         label: 'Guard Duty',      href: '/security/guard-duty' },
  ]},
  { title: 'People', items: [
    { icon: Users,        label: 'Visitor Mgmt',    href: '/security/visitors' },
    { icon: ClipboardList,label: 'Staff Entry Log', href: '/security/staff-log' },
  ]},
  { title: 'System', items: [
    { icon: BarChart3,  label: 'Reports',  href: '/security/reports' },
    { icon: Lock,       label: 'Settings', href: '/security/settings' },
    { icon: ClipboardList,label: 'Support',href: '/security/support' },
  ]},
];

const kpis = [
  { label: 'Guards On Duty', value: '24',  sub: '8 per shift',       icon: Users,       color: 'bg-teal-50 dark:bg-teal-950',    iconColor: 'text-teal-600' },
  { label: 'Active Cameras', value: '148', sub: '4 offline',         icon: Camera,      color: 'bg-blue-50 dark:bg-blue-950',    iconColor: 'text-blue-600' },
  { label: 'Today Visitors', value: '312', sub: '28 still inside',   icon: MapPin,      color: 'bg-violet-50 dark:bg-violet-950',iconColor: 'text-violet-600' },
  { label: 'Open Incidents', value: '3',   sub: '1 high priority',   icon: ShieldAlert, color: 'bg-red-50 dark:bg-red-950',      iconColor: 'text-red-600' },
];

const incidents = [
  { id: 'SEC-441', type: 'Unauthorized Access', location: 'ICU Entry',    time: '09:14',  priority: 'High',   status: 'Active' },
  { id: 'SEC-440', type: 'Suspicious Person',   location: 'Parking',      time: '08:32',  priority: 'Medium', status: 'Active' },
  { id: 'SEC-439', type: 'Fire Alarm Trigger',  location: 'Kitchen',      time: '07:55',  priority: 'High',   status: 'Resolved' },
  { id: 'SEC-438', type: 'Lost Property',       location: 'OPD',          time: 'Yesterday',priority: 'Low', status: 'Resolved' },
  { id: 'SEC-437', type: 'Medical Wanderer',    location: 'Ward 3',       time: 'Yesterday',priority: 'Medium',status: 'Resolved' },
];

const guards = [
  { name: 'Ravi Kumar',   shift: 'Morning', post: 'Main Gate',   status: 'On Duty' },
  { name: 'Suresh Nair',  shift: 'Morning', post: 'Emergency',   status: 'On Duty' },
  { name: 'Prakash Singh',shift: 'Morning', post: 'ICU Wing',    status: 'On Duty' },
  { name: 'Amit Yadav',   shift: 'Morning', post: 'Parking',     status: 'Break' },
  { name: 'Deepak Rao',   shift: 'Evening', post: 'Main Gate',   status: 'Scheduled' },
];

const priorityBadge = (p: string) => {
  const m: Record<string,string> = { High:'bg-red-100 text-red-700', Medium:'bg-amber-100 text-amber-700', Low:'bg-gray-100 text-gray-600' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m[p]}`}>{p}</span>;
};
const statusBadge = (s: string) => {
  const m: Record<string,string> = { Active:'bg-red-100 text-red-700', Resolved:'bg-teal-100 text-teal-700', 'On Duty':'bg-teal-100 text-teal-700', Break:'bg-amber-100 text-amber-700', Scheduled:'bg-blue-100 text-blue-700' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m[s] ?? 'bg-gray-100 text-gray-600'}`}>{s}</span>;
};

export default function SecurityDashboard() {
  return (
    <HospDeptLayout deptKey="security" deptName="Security" badgeLabel="Security"
      loginPath="/security/login" DeptIcon={Lock} navSections={navSections}
      title="Security Dashboard" subtitle="Surveillance, access control & incident management">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4 flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-2xl font-bold mt-1">{k.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
              </div>
              <div className={`p-2 rounded-xl ${k.color}`}>
                <k.icon className={`h-5 w-5 ${k.iconColor}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Incidents + Guard Duty */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Incident Log */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-500" />Incident Log
            </CardTitle>
            <Button size="sm" className="gap-1 text-xs bg-teal-600 hover:bg-teal-700">
              <PlusCircle className="h-3 w-3" />Log Incident
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {incidents.map(i => (
                <div key={i.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors">
                  <div>
                    <p className="text-xs font-medium">{i.id} — {i.type}</p>
                    <p className="text-xs text-muted-foreground">{i.location} · {i.time}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {priorityBadge(i.priority)}
                    {statusBadge(i.status)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Guard Duty */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Radio className="h-4 w-4 text-teal-500" />Guard Duty — Today
            </CardTitle>
            <Button variant="ghost" size="sm" className="gap-1 text-xs">Full Roster<ChevronRight className="h-3 w-3" /></Button>
          </CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead><tr className="text-muted-foreground border-b">{['Guard','Shift','Post','Status'].map(h => <th key={h} className="text-left py-1.5 pr-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {guards.map((g, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 pr-3 font-medium">{g.name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{g.shift}</td>
                    <td className="py-2 pr-3">{g.post}</td>
                    <td className="py-2">{statusBadge(g.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions + CCTV status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Quick Actions</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {[
              { label: 'Log Incident',    icon: ShieldAlert },
              { label: 'Add Visitor',     icon: Users },
              { label: 'Access Log',      icon: KeyRound },
              { label: 'Guard Patrol',    icon: Radio },
            ].map(a => (
              <Button key={a.label} variant="outline" className="flex-col h-16 gap-1 text-xs">
                <a.icon className="h-4 w-4 text-teal-600" />
                {a.label}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">CCTV Zone Status</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {[
                { zone: 'Main Gate',   cams: 12, online: 12 },
                { zone: 'Emergency',   cams: 8,  online: 8 },
                { zone: 'ICU Wing',    cams: 10, online: 10 },
                { zone: 'OT Complex',  cams: 6,  online: 6 },
                { zone: 'OPD Block',   cams: 16, online: 14 },
                { zone: 'Parking',     cams: 20, online: 18 },
                { zone: 'Pharmacy',    cams: 4,  online: 4 },
                { zone: 'Ward Floors', cams: 72, online: 72 },
              ].map(z => (
                <div key={z.zone} className="flex items-center justify-between p-2 rounded-lg bg-muted/40 text-xs">
                  <span className="font-medium">{z.zone}</span>
                  <div className="flex items-center gap-1">
                    <span className={z.online === z.cams ? 'text-teal-600 font-semibold' : 'text-amber-600 font-semibold'}>{z.online}/{z.cams}</span>
                    <Camera className={`h-3.5 w-3.5 ${z.online === z.cams ? 'text-teal-500' : 'text-amber-500'}`} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </HospDeptLayout>
  );
}
