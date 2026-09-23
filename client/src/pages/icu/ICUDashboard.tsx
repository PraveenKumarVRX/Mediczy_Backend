import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  HeartPulse, Bed, Pill,
  AlertTriangle,
  PlusCircle, Clock, AlertCircle, Thermometer,
  Droplets, Wind, LayoutGrid, ClipboardCheck, ShieldCheck, TrendingUp, Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { icuNavSections } from './ICUModulePages';
import { useICUPortalData } from './useICUPortalData';

// WP-0.3b: every number and every bed/alert row on this dashboard used to be hardcoded, shown
// unconditionally even once real data had loaded (`data?.summary.X ?? <fake number>` — `??` only
// falls through on null/undefined, but that's exactly what's true before the first load resolves).
// Wired to the real useICUPortalData() hook throughout; there is no fake fallback left — a loading or
// empty state is shown honestly instead.

const severityBadge: Record<string, string> = {
  mild: 'bg-slate-100 text-slate-600',
  moderate: 'bg-amber-100 text-amber-700',
  severe: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};
const severityAlertColor: Record<string, string> = {
  mild: 'bg-slate-50 border-l-2 border-slate-400',
  moderate: 'bg-amber-50 border-l-2 border-amber-500',
  severe: 'bg-orange-50 border-l-2 border-orange-500',
  critical: 'bg-red-50 border-l-2 border-red-500',
};

const ICUDashboard = () => {
  const navigate = useNavigate();
  const { data, loading, error } = useICUPortalData(30000);

  const kpis = data
    ? [
        { label: 'Occupied Beds', value: `${data.summary.occupiedBeds}`, sub: 'currently admitted', icon: Bed, color: 'text-teal-600' },
        { label: 'On Ventilator', value: `${data.summary.onVentilator}`, sub: 'active vent charts', icon: Wind, color: 'text-blue-600' },
        { label: 'Active Drips', value: `${data.summary.withActiveDrips}`, sub: 'patients on infusions', icon: Pill, color: 'text-emerald-600' },
        { label: 'Events (24h)', value: `${data.summary.eventsLast24h}`, sub: 'across all patients', icon: AlertCircle, color: 'text-red-600' },
      ]
    : [];

  const recentEvents = (data?.patients ?? [])
    .flatMap((p) => p.recentEvents.map((e) => ({ ...e, bed: p.bed })))
    .sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime())
    .slice(0, 5);

  return (
    <HospDeptLayout
      deptKey="icu"
      deptName="ICU"
      badgeLabel="ICU"
      loginPath="/icu/login"
      DeptIcon={HeartPulse}
      navSections={icuNavSections}
      title="ICU Dashboard"
      subtitle="Intensive care unit — live patient monitoring"
    >
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-red-600" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 mb-6">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      ) : (
        <>
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
                      <k.icon className={`h-5 w-5 ${k.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Bed Status Grid */}
            <div className="lg:col-span-2 space-y-5">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base">ICU Bed Status</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => navigate('/icu/live-monitor')}>Live Monitor</Button>
                </CardHeader>
                <CardContent>
                  {(data?.patients.length ?? 0) === 0 ? (
                    <EmptyState icon={Bed} title="No patients currently admitted" description="Occupied ICU beds will appear here." size="sm" />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {data!.patients.map((p) => (
                        <div key={p.admissionId}
                          onClick={() => navigate('/icu/patients')}
                          className="p-3 rounded-xl border cursor-pointer hover:shadow-sm transition-shadow border-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-teal-700 dark:text-teal-400">{p.bed}</span>
                            <div className="flex items-center gap-1">
                              {p.ventilator && <Wind className="h-3 w-3 text-blue-500" />}
                              {p.latestScore?.interpretation && (
                                <Badge className="bg-slate-100 text-slate-600 border-0 text-[10px] h-4 px-1">{p.latestScore.interpretation}</Badge>
                              )}
                            </div>
                          </div>
                          <p className="text-sm font-medium truncate">{p.patient}</p>
                          <p className="text-xs text-muted-foreground truncate">{p.diagnosis}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {p.age != null ? `Age ${p.age} · ` : ''}{p.hrs}h in ICU
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button variant="ghost" size="sm" className="mt-3 w-full text-red-600" onClick={() => navigate('/icu/live-monitor')}>
                    Open ICU command view →
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Right Column */}
            <div className="space-y-5">
              {/* Quick Actions */}
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Admit', icon: PlusCircle, path: '/icu/patients', color: 'bg-red-50 text-red-700 hover:bg-red-100' },
                    { label: 'Live', icon: LayoutGrid, path: '/icu/live-monitor', color: 'bg-rose-50 text-rose-700 hover:bg-rose-100' },
                    { label: 'Vitals', icon: Thermometer, path: '/icu/vitals', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
                    { label: 'Fluids', icon: Droplets, path: '/icu/fluid-balance', color: 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100' },
                    { label: 'Drips', icon: Pill, path: '/icu/medications', color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
                    { label: 'Vent', icon: Wind, path: '/icu/ventilators', color: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' },
                    { label: 'Infection', icon: ShieldCheck, path: '/icu/infections', color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
                    { label: 'Protocols', icon: ClipboardCheck, path: '/icu/protocols', color: 'bg-slate-100 text-slate-700 hover:bg-slate-200' },
                    { label: 'Analytics', icon: TrendingUp, path: '/icu/analytics', color: 'bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100' },
                  ].map((a) => (
                    <button key={a.label} onClick={() => navigate(a.path)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs font-medium transition-colors ${a.color}`}>
                      <a.icon className="h-5 w-5" />
                      {a.label}
                    </button>
                  ))}
                </CardContent>
              </Card>

              {/* Events */}
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" /> Recent Events
                </CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {recentEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">No events recorded recently</p>
                  ) : (
                    recentEvents.map((e, i) => (
                      <div key={i} className={`p-2 rounded-lg text-sm ${severityAlertColor[e.severity] ?? severityAlertColor.moderate}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{e.bed}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(e.eventAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-xs mt-0.5">{e.description}</p>
                      </div>
                    ))
                  )}
                  <Button variant="ghost" size="sm" className="w-full text-red-600 mt-1" onClick={() => navigate('/icu/alerts')}>
                    View all events →
                  </Button>
                </CardContent>
              </Card>

              {/* Summary */}
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-teal-500" /> Shift Summary
                </CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {[
                    { label: 'Occupied Beds', value: `${data?.summary.occupiedBeds ?? 0}`, color: '' },
                    { label: 'On Ventilator', value: `${data?.summary.onVentilator ?? 0}`, color: 'text-blue-600 font-bold' },
                    { label: 'Active Drips', value: `${data?.summary.withActiveDrips ?? 0}`, color: 'text-emerald-700 font-semibold' },
                    { label: 'Events (24h)', value: `${data?.summary.eventsLast24h ?? 0}`, color: 'text-amber-600' },
                  ].map((s) => (
                    <div key={s.label} className="flex justify-between">
                      <span className="text-muted-foreground">{s.label}</span>
                      <span className={`font-semibold ${s.color}`}>{s.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </HospDeptLayout>
  );
};

export default ICUDashboard;
