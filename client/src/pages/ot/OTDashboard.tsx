import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Scissors, CalendarCheck, Users, Wrench,
  Stethoscope, ClipboardList,
  PlusCircle, Clock, CheckCircle2, AlertCircle,
  XCircle, Activity, FileText, ShieldCheck, ClipboardCheck, LayoutGrid, RefreshCw, Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { otNavSections } from './OTModulePages';
import { useOTPortalData } from './useOTPortalData';

// WP-0.3b: this dashboard's "equipmentStatus" and "OT Utilization" percentages were hardcoded with no
// backend. Its own schedule fetch was also silently broken — it called `api.get('/api/v1/ot/schedule')`
// through a client whose base URL already ends in `/api`, so every request 404'd against
// `/api/api/v1/ot/schedule` and was swallowed by an empty catch block, always falling through to "No
// procedures scheduled today" regardless of the real schedule. Now shares useOTPortalData() (the
// correct `/v1/ot/schedule` path) with the rest of the module.

const statusColor: Record<string, string> = {
  scheduled: 'bg-slate-100 text-slate-600',
  patient_in: 'bg-blue-100 text-blue-700',
  prep: 'bg-blue-100 text-blue-700',
  incision: 'bg-blue-100 text-blue-700',
  closure: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
  postponed: 'bg-amber-100 text-amber-700',
};

const OTDashboard = () => {
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useOTPortalData(30000);

  const bookings = data?.bookings ?? [];
  const inProgress = bookings.filter((b) => ['patient_in', 'prep', 'incision', 'closure'].includes(b.otStatus)).length;
  const completed = bookings.filter((b) => b.otStatus === 'completed').length;
  const postponed = bookings.filter((b) => ['postponed', 'cancelled'].includes(b.otStatus)).length;

  const kpis = [
    { label: 'Scheduled Today', value: String(bookings.length), sub: `${inProgress} in progress now`, icon: CalendarCheck, color: 'text-teal-600' },
    { label: 'Completed', value: String(completed), sub: 'Today', icon: CheckCircle2, color: 'text-emerald-600' },
    { label: 'In Progress', value: String(inProgress), sub: 'Active theatres', icon: Activity, color: 'text-blue-600' },
    { label: 'Postponed', value: String(postponed), sub: 'Rescheduled/cancelled', icon: XCircle, color: 'text-amber-600' },
  ];

  return (
    <HospDeptLayout
      deptKey="ot"
      deptName="Operation Theatre"
      badgeLabel="OT"
      loginPath="/ot/login"
      DeptIcon={Scissors}
      navSections={otNavSections}
      title="OT Dashboard"
      subtitle="Surgical scheduling & theatre management"
      copilotModule="ot"
    >
      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 mb-6">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      ) : (
        <>
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
            <div className="lg:col-span-2 space-y-5">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base">Today's OT Schedule</CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={refresh}><RefreshCw className="h-4 w-4" /></Button>
                    <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => navigate('/ot/schedule')}>
                      <PlusCircle className="h-4 w-4" />Schedule OT
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {bookings.length === 0 ? (
                    <EmptyState icon={CalendarCheck} title="No procedures scheduled today" description="Booked cases appear here." size="sm" />
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="pb-2 text-left font-medium">Room</th>
                          <th className="pb-2 text-left font-medium">Patient</th>
                          <th className="pb-2 text-left font-medium hidden md:table-cell">Procedure</th>
                          <th className="pb-2 text-left font-medium">Time</th>
                          <th className="pb-2 text-center font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {bookings.map((b) => (
                          <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                              onClick={() => navigate('/ot/schedule')}>
                            <td className="py-2.5 font-bold text-teal-700">{b.roomName || 'Unassigned'}</td>
                            <td className="py-2.5">
                              {b.operativeNote?.patientName || `Patient #${b.patientId}`}
                            </td>
                            <td className="py-2.5 text-muted-foreground hidden md:table-cell">{b.procedureName}</td>
                            <td className="py-2.5">{new Date(b.scheduledStart).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="py-2.5 text-center">
                              <Badge className={`${statusColor[b.otStatus] || 'bg-slate-100 text-slate-600'} border-0 text-xs capitalize`}>{b.otStatus.replace(/_/g, ' ')}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <Button variant="ghost" size="sm" className="mt-3 w-full text-teal-600" onClick={() => navigate('/ot/schedule')}>
                    View full schedule →
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base">Equipment Status</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => navigate('/ot/equipment')}>Manage</Button>
                </CardHeader>
                <CardContent>
                  <EmptyState icon={Wrench} title="Equipment tracking isn't connected yet" description="Theatre device readiness isn't wired to a backend yet." size="sm" />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-5">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Theatre View', icon: LayoutGrid, path: '/ot/theatre-view', color: 'bg-rose-50 text-rose-700 hover:bg-rose-100' },
                    { label: 'Schedule OT', icon: CalendarCheck, path: '/ot/schedule', color: 'bg-teal-50 text-teal-700 hover:bg-teal-100' },
                    { label: 'Pre-Op', icon: ClipboardCheck, path: '/ot/pre-op', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
                    { label: 'Consents', icon: FileText, path: '/ot/consent', color: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' },
                    { label: 'Teams', icon: Users, path: '/ot/teams', color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
                    { label: 'Equipment', icon: Wrench, path: '/ot/equipment', color: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
                    { label: 'Anesthesia', icon: Stethoscope, path: '/ot/anesthesia', color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
                    { label: 'Safety', icon: ShieldCheck, path: '/ot/safety', color: 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100' },
                    { label: 'OT Records', icon: ClipboardList, path: '/ot/records', color: 'bg-pink-50 text-pink-700 hover:bg-pink-100' },
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
                  <Clock className="h-4 w-4 text-teal-500" /> OT Utilization
                </CardTitle></CardHeader>
                <CardContent>
                  <EmptyState icon={Clock} title="Utilization tracking isn't connected yet" description="Per-theatre utilization percentages need historical aggregation that doesn't exist yet." size="sm" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" /> Today's Summary
                </CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {[
                    { label: 'Total Scheduled', value: String(bookings.length) },
                    { label: 'Completed', value: String(completed) },
                    { label: 'In Progress', value: String(inProgress) },
                    { label: 'Upcoming', value: String(bookings.filter((b) => b.otStatus === 'scheduled').length) },
                    { label: 'Postponed/Cancelled', value: String(postponed) },
                  ].map((s) => (
                    <div key={s.label} className="flex justify-between">
                      <span className="text-muted-foreground">{s.label}</span>
                      <span className="font-semibold">{s.value}</span>
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

export default OTDashboard;
