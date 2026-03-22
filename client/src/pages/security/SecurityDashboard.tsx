import React from 'react';
import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Lock, Camera, ShieldAlert, Users,
  MapPin, AlertTriangle, ClipboardList,
  PlusCircle, Radio, ScanLine, Siren, Download, Loader2, ShieldCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { securityNavSections } from './SecurityModulePages';
import { useSecurityPortalData } from './useSecurityPortalData';

const kpiDecorators: Record<string, { icon: typeof Users; color: string; iconColor: string }> = {
  'Guards On Duty': { icon: Users, color: 'bg-teal-50 dark:bg-teal-950', iconColor: 'text-teal-600' },
  'Active Cameras': { icon: Camera, color: 'bg-blue-50 dark:bg-blue-950', iconColor: 'text-blue-600' },
  'Visitors Today': { icon: MapPin, color: 'bg-violet-50 dark:bg-violet-950', iconColor: 'text-violet-600' },
  'Open Incidents': { icon: ShieldAlert, color: 'bg-red-50 dark:bg-red-950', iconColor: 'text-red-600' },
};

const priorityBadge = (p: string) => {
  const m: Record<string,string> = { High:'bg-red-100 text-red-700', Medium:'bg-amber-100 text-amber-700', Low:'bg-gray-100 text-gray-600' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m[p]}`}>{p}</span>;
};
const statusBadge = (s: string) => {
  const m: Record<string,string> = { Active:'bg-red-100 text-red-700', Resolved:'bg-teal-100 text-teal-700', 'On Duty':'bg-teal-100 text-teal-700', Break:'bg-amber-100 text-amber-700', Scheduled:'bg-blue-100 text-blue-700', Escalated:'bg-red-100 text-red-700', Investigating:'bg-amber-100 text-amber-700', Inside:'bg-blue-100 text-blue-700', Exited:'bg-teal-100 text-teal-700', Escorted:'bg-amber-100 text-amber-700' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m[s] ?? 'bg-gray-100 text-gray-600'}`}>{s}</span>;
};

export default function SecurityDashboard() {
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useSecurityPortalData();
  const kpis = data?.kpis ?? [];
  const incidents = data?.incidents ?? [];
  const guards = data?.guards ?? [];
  const workQueues = data?.workQueues ?? [];
  const cctv = data?.cctv ?? [];
  const heatmap = data?.heatmap ?? [];

  return (
    <HospDeptLayout deptKey="security" deptName="Security" badgeLabel="Security"
      loginPath="/security/login" DeptIcon={Lock} navSections={securityNavSections}
      title="Security Dashboard" subtitle="Surveillance, access control & incident management">

      {(loading || error) && (
        <Card className="mb-4 border-dashed">
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
              <span>{loading ? 'Loading live security command center data...' : error}</span>
            </div>
            {!loading && <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>}
          </CardContent>
        </Card>
      )}

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
              <div className={`p-2 rounded-xl ${kpiDecorators[k.label]?.color ?? 'bg-slate-100 dark:bg-slate-900'}`}>
                {React.createElement(kpiDecorators[k.label]?.icon ?? ShieldCheck, {
                  className: `h-5 w-5 ${kpiDecorators[k.label]?.iconColor ?? 'text-slate-600'}`,
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-4">
        {workQueues.map((queue) => (
          <Card key={queue.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{queue.label}</p>
              <p className={`mt-1 text-2xl font-bold ${queue.tone}`}>{queue.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{queue.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Camera className="h-4 w-4 text-blue-500" />CCTV Zone Health</CardTitle>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate('/security/cctv')}>Open Video Wall</Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {cctv.map((zone) => (
              <div key={zone.zone} className="flex items-center justify-between rounded-lg bg-muted/40 p-2 text-xs">
                <div><p className="font-medium">{zone.zone}</p><p className="text-muted-foreground">{zone.analytics}</p></div>
                <div className="text-right"><p className="font-semibold">{zone.online}/{zone.cameras}</p><p className={zone.status === 'Operational' ? 'text-teal-600' : 'text-amber-600'}>{zone.status}</p></div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><ScanLine className="h-4 w-4 text-violet-500" />Risk Heatmap</CardTitle>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate('/security/access-points')}>View Access Map</Button>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-xs">
            {heatmap.map(([zone, state]) => (
              <div key={zone} className="rounded-lg bg-muted/40 p-3"><p className="font-medium">{zone}</p><p className="mt-1 text-muted-foreground">{state}</p></div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Incidents + Guard Duty */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {/* Incident Log */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-500" />Incident Log
            </CardTitle>
            <Button size="sm" className="gap-1 text-xs bg-teal-600 hover:bg-teal-700" onClick={() => navigate('/security/incidents')}>
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
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate('/security/guard-duty')}>Full Roster</Button>
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
                { label: 'Log Incident', icon: ShieldAlert, path: '/security/incidents' },
                { label: 'Add Visitor', icon: Users, path: '/security/visitors' },
                { label: 'Access Log', icon: ScanLine, path: '/security/access-logs' },
                { label: 'Guard Patrol', icon: Radio, path: '/security/guard-duty' },
                { label: 'Active Alerts', icon: Siren, path: '/security/alerts' },
                { label: 'CCTV Wall', icon: Camera, path: '/security/cctv' },
              ].map(a => (
              <Button key={a.label} variant="outline" className="flex-col h-16 gap-1 text-xs" onClick={() => navigate(a.path)}>
                <a.icon className="h-4 w-4 text-teal-600" />
                {a.label}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-semibold">Command Snapshot</CardTitle><Button variant="outline" size="sm" className="gap-1" onClick={() => navigate('/security/reports')}><Download className="h-4 w-4" />Export Brief</Button></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {cctv.map(z => (
                <div key={z.zone} className="flex items-center justify-between p-2 rounded-lg bg-muted/40 text-xs">
                  <span className="font-medium">{z.zone}</span>
                  <div className="flex items-center gap-1">
                    <span className={z.online === z.cameras ? 'text-teal-600 font-semibold' : 'text-amber-600 font-semibold'}>{z.online}/{z.cameras}</span>
                    <Camera className={`h-3.5 w-3.5 ${z.online === z.cameras ? 'text-teal-500' : 'text-amber-500'}`} />
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
