import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Clock, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getAttendanceHistory, submitException, getGps, clockIn, clockOut } from './fieldClient';

type Rec = {
  id: number; date: string;
  clock_in_at?: string; clock_out_at?: string;
  clock_in_accuracy_m?: number; clock_out_accuracy_m?: number;
  status: string; exception_type?: string; exception_reason?: string;
  hours_worked?: number;
};

const STATUS_ICON: Record<string, JSX.Element> = {
  present:   <CheckCircle2 size={14} className="text-green-600" />,
  exception: <AlertTriangle size={14} className="text-amber-500" />,
  absent:    <XCircle size={14} className="text-red-400" />,
  half_day:  <Clock size={14} className="text-blue-400" />,
};

function fmt(ts?: string) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function FieldAttendance() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [records, setRecords] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [showException, setShowException] = useState(false);
  const [exForm, setExForm] = useState({ date: new Date().toISOString().slice(0, 10), exception_type: 'gps_failure', exception_reason: '' });
  const [gpsLoading, setGpsLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getAttendanceHistory(month);
      setRecords(data.records || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [month]);

  const today = new Date().toISOString().slice(0, 10);
  const todayRec = records.find(r => r.date === today);

  const handleClockIn = async () => {
    setGpsLoading(true);
    try {
      const gps = await getGps();
      const payload = gps
        ? { lat: gps.lat, lng: gps.lng, accuracy_m: gps.accuracy_m }
        : { exception_type: 'gps_failure', exception_reason: 'GPS unavailable on device' };
      await clockIn(payload);
      toast({ title: 'Clocked in ✓' });
      load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setGpsLoading(false);
    }
  };

  const handleClockOut = async () => {
    setGpsLoading(true);
    try {
      const gps = await getGps();
      await clockOut(gps ? { lat: gps.lat, lng: gps.lng, accuracy_m: gps.accuracy_m } : {});
      toast({ title: 'Clocked out ✓' });
      load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setGpsLoading(false);
    }
  };

  const handleException = async () => {
    if (!exForm.exception_reason.trim()) {
      toast({ title: 'Reason is required', variant: 'destructive' }); return;
    }
    try {
      await submitException(exForm);
      toast({ title: 'Exception recorded' });
      setShowException(false);
      load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  // Build a calendar grid for the selected month
  const daysInMonth = new Date(+month.split('-')[0], +month.split('-')[1], 0).getDate();
  const recMap = Object.fromEntries(records.map(r => [r.date, r]));

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {/* Header */}
      <div className="bg-[#17365D] text-white px-4 pt-10 pb-6">
        <button onClick={() => navigate('/team/field')} className="flex items-center gap-2 text-blue-200 text-sm mb-3 hover:text-white">
          <ArrowLeft size={15} /> Dashboard
        </button>
        <h1 className="text-xl font-bold">Attendance</h1>
        <p className="text-blue-200 text-sm mt-0.5">GPS check-in history &amp; regularisation</p>
      </div>

      <div className="px-4 -mt-3 space-y-4">
        {/* Today's action card */}
        <Card className="shadow-md border-0">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold">Today</CardTitle>
          </CardHeader>
          <CardContent>
            {!todayRec?.clock_in_at ? (
              <Button onClick={handleClockIn} disabled={gpsLoading} className="w-full bg-[#0D9488] hover:bg-[#0B7A70] text-white">
                <MapPin size={15} className="mr-2" />{gpsLoading ? 'Getting location…' : 'Clock In'}
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-0.5">Clock-in</p>
                    <p className="font-semibold text-sm">{fmt(todayRec.clock_in_at)}</p>
                    {todayRec.clock_in_accuracy_m != null && (
                      <p className={`text-xs mt-0.5 ${todayRec.clock_in_accuracy_m > 100 ? 'text-amber-600' : 'text-green-600'}`}>
                        ±{todayRec.clock_in_accuracy_m}m GPS
                      </p>
                    )}
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-0.5">Clock-out</p>
                    <p className="font-semibold text-sm">{fmt(todayRec.clock_out_at)}</p>
                  </div>
                </div>
                {todayRec.status === 'exception' && (
                  <div className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2 flex items-start gap-2">
                    <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                    <span>{todayRec.exception_reason}</span>
                  </div>
                )}
                {!todayRec.clock_out_at && (
                  <Button onClick={handleClockOut} disabled={gpsLoading} variant="outline"
                    className="w-full border-[#17365D] text-[#17365D]">
                    {gpsLoading ? 'Getting location…' : 'Clock Out'}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Exception request */}
        <Card className="shadow-sm border-0">
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Regularisation Request</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setShowException(v => !v)} className="text-xs text-[#17365D] h-7">
                {showException ? 'Cancel' : 'New Request'}
              </Button>
            </div>
          </CardHeader>
          {showException && (
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Date</label>
                <input type="date" value={exForm.date} max={today}
                  onChange={e => setExForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Reason type</label>
                <select value={exForm.exception_type} onChange={e => setExForm(f => ({ ...f, exception_type: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]">
                  <option value="gps_failure">GPS Failure</option>
                  <option value="device_failure">Device Failure</option>
                  <option value="approved_offsite">Approved Off-site Work</option>
                  <option value="manual">Manual Entry / Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Details</label>
                <textarea rows={3} value={exForm.exception_reason}
                  onChange={e => setExForm(f => ({ ...f, exception_reason: e.target.value }))}
                  placeholder="Explain the reason for regularisation…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </div>
              <Button onClick={handleException} className="w-full bg-[#17365D] text-white">Submit Request</Button>
            </CardContent>
          )}
        </Card>

        {/* Monthly calendar */}
        <Card className="shadow-sm border-0">
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Monthly View</CardTitle>
              <input type="month" value={month} max={new Date().toISOString().slice(0, 7)}
                onChange={e => setMonth(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-slate-100 animate-pulse rounded-lg" />
              ))}</div>
            ) : (
              <div className="space-y-1">
                {records.map(r => (
                  <div key={r.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="w-5 flex-shrink-0">{STATUS_ICON[r.status] ?? STATUS_ICON.absent}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{fmtDate(r.date)}</p>
                      {r.exception_reason && <p className="text-xs text-amber-600 truncate">{r.exception_reason}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-slate-500">{fmt(r.clock_in_at)} – {fmt(r.clock_out_at)}</p>
                      {r.hours_worked != null && r.hours_worked > 0 && (
                        <p className="text-xs font-medium text-[#17365D]">{Math.round(r.hours_worked * 10) / 10}h</p>
                      )}
                    </div>
                  </div>
                ))}
                {records.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6">No attendance records for {month}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
