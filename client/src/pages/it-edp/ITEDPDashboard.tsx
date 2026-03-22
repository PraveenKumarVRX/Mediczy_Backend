import React from 'react';
import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Monitor, LayoutDashboard, TicketCheck, Server, Users as UsersIcon,
  Wifi, Shield, HardDrive, Package, BarChart3, Settings, HelpCircle,
  PlusCircle, AlertCircle, CheckCircle2, Clock, Activity,
  Cpu, Database, Lock, BadgeCheck, KeyRound, Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { itEdpNavSections } from './ITEDPModulePages';
import { useITEDPPortalData } from './useITEDPPortalData';

const priorityColor: Record<string, string> = {
  High:   'bg-red-100 text-red-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low:    'bg-slate-100 text-slate-600',
};
const statusColor2: Record<string, string> = {
  Operational:'bg-emerald-100 text-emerald-700',
  Degraded:   'bg-red-100 text-red-700',
  Offline:    'bg-slate-100 text-slate-600',
};
const ticketStatusColor: Record<string, string> = {
  Open:         'bg-red-100 text-red-700',
  'In Progress':'bg-amber-100 text-amber-700',
  Resolved:     'bg-emerald-100 text-emerald-700',
  Escalated:    'bg-violet-100 text-violet-700',
};

const ITEDPDashboard = () => {
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useITEDPPortalData();
  const kpis = data?.kpis ?? [];
  const openTickets = data?.tickets ?? [];
  const systemStatus = data?.systems ?? [];
  const workQueues = data?.workQueues ?? [];
  const heatmap = data?.serviceHeatmap ?? [];
  const accessQueues = data?.access ?? [];
  const backupQueue = data?.backups ?? [];
  const securityQueue = data?.security ?? [];

  return (
    <HospDeptLayout
      deptKey="it-edp"
      deptName="IT / EDP"
      badgeLabel="IT / EDP"
      loginPath="/it-edp/login"
      DeptIcon={Monitor}
      navSections={itEdpNavSections}
      title="IT / EDP Dashboard"
      subtitle="Hospital digital operations, clinical systems, service desk, and resilience command"
    >
      {(loading || error) && (
        <Card className="mb-6 border-dashed">
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}
              <span>{loading ? 'Loading live IT/EDP operations data...' : error}</span>
            </div>
            {!loading && <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>}
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
        {kpis.map((k) => (
          <Card key={k.label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{k.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
                  {React.createElement(
                    [Activity, TicketCheck, CheckCircle2, Package][kpis.indexOf(k)] ?? Activity,
                    { className: `h-5 w-5 ${['text-emerald-600', 'text-amber-600', 'text-teal-600', 'text-blue-600'][kpis.indexOf(k)] ?? 'text-teal-600'}` }
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Tickets */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Open Help Desk Tickets</CardTitle>
              <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => navigate('/it-edp/tickets')}>
                <PlusCircle className="h-4 w-4" />New Ticket
              </Button>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 text-left font-medium">ID</th>
                    <th className="pb-2 text-left font-medium">Issue</th>
                    <th className="pb-2 text-left font-medium hidden md:table-cell">Dept</th>
                    <th className="pb-2 text-center font-medium">Priority</th>
                    <th className="pb-2 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {openTickets.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                        onClick={() => navigate('/it-edp/tickets')}>
                      <td className="py-2.5 font-medium text-teal-700">{t.id}</td>
                      <td className="py-2.5">{t.title}<br/><span className="text-xs text-muted-foreground">{t.owner} · {t.aging}</span></td>
                      <td className="py-2.5 text-muted-foreground hidden md:table-cell">{t.department}</td>
                      <td className="py-2.5 text-center">
                        <Badge className={`${priorityColor[t.priority]} border-0 text-xs`}>{t.priority}</Badge>
                      </td>
                      <td className="py-2.5 text-center">
                        <Badge className={`${ticketStatusColor[t.status]} border-0 text-xs`}>{t.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button variant="ghost" size="sm" className="mt-3 w-full text-teal-600" onClick={() => navigate('/it-edp/tickets')}>
                View all tickets →
              </Button>
            </CardContent>
          </Card>

          {/* System Status */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">System Status</CardTitle>
              <Button variant="outline" size="sm" onClick={() => navigate('/it-edp/systems')}>Full Monitor</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {systemStatus.map((s) => (
                <div key={s.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${s.status === 'Operational' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className="text-sm font-medium">{s.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`${statusColor2[s.status]} border-0 text-xs`}>{s.status}</Badge>
                      <span className="text-xs text-muted-foreground">{s.uptime}</span>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />CPU: {s.cpu}</span>
                    <span className="flex items-center gap-1"><Database className="h-3 w-3" />RAM: {s.memory}</span>
                    <div className="flex-1 flex items-center gap-1">
                      <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${Number.parseInt(s.memory, 10) > 85 ? 'bg-red-500' : Number.parseInt(s.memory, 10) > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                             style={{ width: s.memory }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {[
                { label: 'New Ticket',    icon: PlusCircle, path: '/it-edp/tickets',  color: 'bg-teal-50 text-teal-700 hover:bg-teal-100' },
                { label: 'User Accts',    icon: UsersIcon,  path: '/it-edp/users',    color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
                { label: 'Sys Monitor',   icon: Server,     path: '/it-edp/systems',  color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
                { label: 'Network',       icon: Wifi,       path: '/it-edp/network',  color: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
                { label: 'Security',      icon: Shield,     path: '/it-edp/security', color: 'bg-red-50 text-red-700 hover:bg-red-100' },
                { label: 'Backup',        icon: HardDrive,  path: '/it-edp/backup',   color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
              ].map((a) => (
                <button key={a.label} onClick={() => navigate(a.path)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs font-medium transition-colors ${a.color}`}>
                  <a.icon className="h-5 w-5" />
                  {a.label}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-teal-500" /> Command Queues
            </CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {workQueues.map((s) => (
                <div key={s.label} className="flex justify-between">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className={`font-bold ${s.tone}`}>{s.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" /> Service Watchlist
            </CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[...backupQueue.slice(0, 2).map((row) => ({ text: `${row.workload}: ${row.result}`, urgent: row.result !== 'Successful' })), ...securityQueue.slice(0, 2).map((row) => ({ text: `${row.control}: ${row.note}`, urgent: row.state !== 'Healthy' }))].map((a, i) => (
                <div key={i} className={`text-xs font-medium p-2 rounded-lg ${a.urgent ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                  {a.text}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4 text-blue-500" /> Service Heatmap</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {heatmap.map(([zone, state]) => (
                <div key={zone} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
                  <span>{zone}</span>
                  <Badge className={`${statusColor2[state] ?? 'bg-slate-100 text-slate-700'} border-0 text-xs`}>{state}</Badge>
                </div>
              ))}
              <div className="pt-1 text-xs text-muted-foreground">Access queue: {accessQueues.length} workflows pending governance review.</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </HospDeptLayout>
  );
};

export default ITEDPDashboard;
