import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Clock, CheckCircle2, Plus, FileText, AlertCircle, LogOut, CalendarDays, Receipt, Tent, Building2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  getAttendanceToday, clockIn, clockOut, getVisits,
  getDailyReportToday, submitDailyReport, getGps,
} from './fieldClient';

type AttendanceRecord = {
  id: number; date: string;
  clock_in_at?: string; clock_out_at?: string;
  clock_in_accuracy_m?: number;
  status: string; exception_reason?: string;
  hours_so_far?: number;
  visits_completed?: number; visits_planned?: number;
};

type Visit = {
  id: number; entity_name: string; entity_type?: string;
  purpose: string; planned_at?: string; status: string;
  met_person?: string; outcome?: string; follow_up_date?: string;
};

type DailyReport = {
  id?: number; planned_visits: number; completed_visits: number;
  missed_visits: number; leads_generated: number; submitted_at?: string;
};

function fmt(ts?: string) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function purposeLabel(p: string) {
  return { initial_visit: 'Initial Visit', follow_up: 'Follow-up', proposal: 'Proposal',
    camp_planning: 'Camp Planning', relationship: 'Relationship', meeting: 'Meeting',
    survey: 'Survey', other: 'Other' }[p] ?? p;
}

function statusColor(s: string) {
  return {
    planned: 'bg-blue-50 text-blue-700 border-blue-200',
    checked_in: 'bg-amber-50 text-amber-700 border-amber-200',
    completed: 'bg-green-50 text-green-700 border-green-200',
    cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
  }[s] ?? 'bg-gray-100 text-gray-500 border-gray-200';
}

export default function FieldDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportDraft, setReportDraft] = useState({
    planned_visits: 0, completed_visits: 0, missed_visits: 0,
    leads_generated: 0, follow_ups_done: 0,
    key_achievements: '', challenges: '', next_day_plan: '',
  });

  const userName = localStorage.getItem('teamUserName') || 'Field Executive';
  const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  const load = useCallback(async () => {
    try {
      const [att, vis, rep] = await Promise.all([
        getAttendanceToday().catch(() => null),
        getVisits({ date: new Date().toISOString().slice(0, 10) }).catch(() => ({ visits: [] })),
        getDailyReportToday().catch(() => null),
      ]);
      setAttendance(att);
      setVisits((vis as any).visits ?? []);
      setReport(rep);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleClockIn = async () => {
    setGpsLoading(true);
    try {
      const gps = await getGps();
      const payload = gps
        ? { lat: gps.lat, lng: gps.lng, accuracy_m: gps.accuracy_m }
        : { exception_type: 'gps_failure', exception_reason: 'GPS unavailable on device' };
      const rec = await clockIn(payload);
      setAttendance(rec);
      toast({ title: gps ? 'Clocked in ✓' : 'Clocked in (GPS unavailable)', description: fmt(rec.clock_in_at) });
    } catch (e: any) {
      toast({ title: 'Clock-in failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setGpsLoading(false);
    }
  };

  const handleClockOut = async () => {
    setGpsLoading(true);
    try {
      const gps = await getGps();
      const rec = await clockOut(gps ? { lat: gps.lat, lng: gps.lng, accuracy_m: gps.accuracy_m } : {});
      setAttendance(prev => ({ ...prev!, ...rec }));
      toast({ title: 'Clocked out ✓', description: fmt(rec.clock_out_at) });
    } catch (e: any) {
      toast({ title: 'Clock-out failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setGpsLoading(false);
    }
  };

  const handleSubmitReport = async () => {
    try {
      const rec = await submitDailyReport({
        ...reportDraft,
        planned_visits: +reportDraft.planned_visits,
        completed_visits: +reportDraft.completed_visits,
        missed_visits: +reportDraft.missed_visits,
        leads_generated: +reportDraft.leads_generated,
        follow_ups_done: +reportDraft.follow_ups_done,
      });
      setReport(rec);
      setShowReportForm(false);
      toast({ title: 'Daily report submitted ✓' });
    } catch (e: any) {
      toast({ title: 'Submit failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  const isClocked = !!attendance?.clock_in_at;
  const isClockedOut = !!attendance?.clock_out_at;
  const hoursWorked = attendance?.hours_so_far ? Math.round(attendance.hours_so_far * 10) / 10 : null;
  const completedVisits = visits.filter(v => v.status === 'completed').length;
  const pendingVisits = visits.filter(v => v.status === 'planned').length;
  const inProgressVisit = visits.find(v => v.status === 'checked_in');

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <div className="bg-[#17365D] text-white px-4 pt-10 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-blue-200 text-xs font-semibold tracking-widest uppercase mb-1">Smart Force</p>
            <h1 className="text-xl font-bold">Good {new Date().getHours() < 12 ? 'Morning' : 'Afternoon'}, {userName.split(' ')[0]}</h1>
            <p className="text-blue-200 text-sm mt-0.5">{todayStr}</p>
          </div>
          <button onClick={() => { localStorage.removeItem('teamToken'); navigate('/team/login'); }}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors" title="Sign out">
            <LogOut size={18} className="text-blue-200" />
          </button>
        </div>

        {/* KPI chips */}
        <div className="flex gap-3 mt-4">
          <div className="bg-white/10 rounded-xl px-3 py-2 flex-1 text-center">
            <div className="text-lg font-bold font-mono">{completedVisits}</div>
            <div className="text-blue-200 text-xs">Visits done</div>
          </div>
          <div className="bg-white/10 rounded-xl px-3 py-2 flex-1 text-center">
            <div className="text-lg font-bold font-mono">{pendingVisits}</div>
            <div className="text-blue-200 text-xs">Pending</div>
          </div>
          <div className="bg-white/10 rounded-xl px-3 py-2 flex-1 text-center">
            <div className="text-lg font-bold font-mono">{hoursWorked ?? '—'}</div>
            <div className="text-blue-200 text-xs">Hours</div>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-3 space-y-4">
        {/* Attendance card */}
        <Card className="shadow-md border-0">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock size={15} className="text-[#0D9488]" /> Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-10 bg-slate-100 animate-pulse rounded" />
            ) : !isClocked ? (
              <Button onClick={handleClockIn} disabled={gpsLoading}
                className="w-full bg-[#0D9488] hover:bg-[#0B7A70] text-white">
                <MapPin size={15} className="mr-2" />
                {gpsLoading ? 'Getting location…' : 'Clock In'}
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Clock-in</span>
                  <span className="font-medium">{fmt(attendance!.clock_in_at)}</span>
                </div>
                {attendance?.clock_in_accuracy_m && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">GPS accuracy</span>
                    <span className={`font-medium ${attendance.clock_in_accuracy_m > 100 ? 'text-amber-600' : 'text-green-600'}`}>
                      ±{attendance.clock_in_accuracy_m}m
                    </span>
                  </div>
                )}
                {attendance?.status === 'exception' && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
                    <AlertCircle size={13} /> {attendance.exception_reason}
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Clock-out</span>
                  <span className="font-medium">{fmt(attendance!.clock_out_at)}</span>
                </div>
                {!isClockedOut && (
                  <Button onClick={handleClockOut} disabled={gpsLoading} variant="outline"
                    className="w-full border-[#17365D] text-[#17365D]">
                    {gpsLoading ? 'Getting location…' : 'Clock Out'}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* In-progress visit alert */}
        {inProgressVisit && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide">Visit in progress</p>
              <p className="text-sm font-medium text-amber-900 mt-0.5">{inProgressVisit.entity_name}</p>
            </div>
            <Button size="sm" onClick={() => navigate('/team/field/visits')}
              className="bg-amber-600 hover:bg-amber-700 text-white">
              Check Out
            </Button>
          </div>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => navigate('/team/field/visits')}
            className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-start gap-1 shadow-sm hover:shadow-md transition-shadow">
            <MapPin size={18} className="text-[#17365D]" />
            <span className="text-sm font-semibold text-slate-800">Field Visits</span>
            <span className="text-xs text-slate-400">{visits.length} today</span>
          </button>
          <button onClick={() => navigate('/team/field/attendance')}
            className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-start gap-1 shadow-sm hover:shadow-md transition-shadow">
            <CalendarDays size={18} className="text-[#17365D]" />
            <span className="text-sm font-semibold text-slate-800">Attendance</span>
            <span className="text-xs text-slate-400">History & calendar</span>
          </button>
          <button onClick={() => navigate('/team/field/expenses')}
            className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-start gap-1 shadow-sm hover:shadow-md transition-shadow">
            <Receipt size={18} className="text-[#17365D]" />
            <span className="text-sm font-semibold text-slate-800">Expenses</span>
            <span className="text-xs text-slate-400">Claims & travel</span>
          </button>
          <button onClick={() => navigate('/team/field/camps')}
            className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-start gap-1 shadow-sm hover:shadow-md transition-shadow">
            <Tent size={18} className="text-[#17365D]" />
            <span className="text-sm font-semibold text-slate-800">Health Camps</span>
            <span className="text-xs text-slate-400">Plan & track</span>
          </button>
          <button onClick={() => navigate('/team/field/empanelment')}
            className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-start gap-1 shadow-sm hover:shadow-md transition-shadow">
            <Building2 size={18} className="text-[#17365D]" />
            <span className="text-sm font-semibold text-slate-800">Empanelment</span>
            <span className="text-xs text-slate-400">Insurer pipeline</span>
          </button>
          <button onClick={() => navigate('/team/field/outreach')}
            className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-start gap-1 shadow-sm hover:shadow-md transition-shadow">
            <Users size={18} className="text-[#17365D]" />
            <span className="text-sm font-semibold text-slate-800">Outreach</span>
            <span className="text-xs text-slate-400">NGO · RWA · Govt</span>
          </button>
        </div>

        {/* Today's visits */}
        <Card className="shadow-sm border-0">
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 size={15} className="text-[#0D9488]" /> Today's Visits
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={() => navigate('/team/field/visits')}
                className="text-xs text-[#17365D] h-7">
                <Plus size={13} className="mr-1" /> Add
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {visits.length === 0 ? (
              <div className="text-center py-6 text-slate-400">
                <MapPin size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No visits planned today</p>
                <Button size="sm" onClick={() => navigate('/team/field/visits')}
                  className="mt-3 bg-[#17365D] text-white">Plan a Visit</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {visits.map(v => (
                  <div key={v.id}
                    onClick={() => navigate('/team/field/visits')}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{v.entity_name}</p>
                      <p className="text-xs text-slate-400">{purposeLabel(v.purpose)}{v.planned_at ? ' · ' + fmt(v.planned_at) : ''}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${statusColor(v.status)}`}>
                      {v.status === 'checked_in' ? 'In Progress' : v.status.charAt(0).toUpperCase() + v.status.slice(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Daily report */}
        <Card className="shadow-sm border-0">
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText size={15} className="text-[#0D9488]" /> Daily Report
              </CardTitle>
              {report?.submitted_at && (
                <span className="text-xs text-green-600 font-medium">Submitted {fmt(report.submitted_at)}</span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {report?.submitted_at ? (
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: 'Planned', val: report.planned_visits },
                  { label: 'Completed', val: report.completed_visits },
                  { label: 'Leads', val: report.leads_generated },
                ].map(({ label, val }) => (
                  <div key={label} className="bg-slate-50 rounded-lg py-2">
                    <div className="text-lg font-bold text-[#17365D] font-mono">{val}</div>
                    <div className="text-xs text-slate-400">{label}</div>
                  </div>
                ))}
              </div>
            ) : !showReportForm ? (
              <Button onClick={() => {
                setReportDraft(d => ({ ...d, completed_visits: completedVisits, planned_visits: visits.length }));
                setShowReportForm(true);
              }} className="w-full bg-[#17365D] text-white">Submit Today's Report</Button>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'planned_visits', label: 'Planned visits' },
                    { key: 'completed_visits', label: 'Completed' },
                    { key: 'missed_visits', label: 'Missed' },
                    { key: 'leads_generated', label: 'Leads generated' },
                    { key: 'follow_ups_done', label: 'Follow-ups done' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-xs text-slate-500 block mb-1">{label}</label>
                      <input type="number" min={0}
                        value={(reportDraft as any)[key]}
                        onChange={e => setReportDraft(d => ({ ...d, [key]: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
                    </div>
                  ))}
                </div>
                {[
                  { key: 'key_achievements', label: 'Key achievements' },
                  { key: 'challenges', label: 'Challenges' },
                  { key: 'next_day_plan', label: "Tomorrow's plan" },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-xs text-slate-500 block mb-1">{label}</label>
                    <textarea rows={2}
                      value={(reportDraft as any)[key]}
                      onChange={e => setReportDraft(d => ({ ...d, [key]: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button onClick={() => setShowReportForm(false)} variant="outline" className="flex-1">Cancel</Button>
                  <Button onClick={handleSubmitReport} className="flex-1 bg-[#17365D] text-white">Submit</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
