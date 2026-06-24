import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, RefreshCw, Calendar, AlertTriangle,
  HeartPulse, CheckCircle2, Bell, Plus
} from 'lucide-react';
import api from '@/utils/api';

interface FollowUpPlan {
  id: number;
  follow_up_date: string;
  follow_up_type: string;
  department: string;
  attending_doctor?: string;
  instructions?: string;
  status: 'scheduled' | 'completed' | 'missed' | 'rescheduled';
}

interface Alert {
  id: number;
  alert_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  created_at: string;
  acknowledged: boolean;
}

interface CheckInForm {
  pain_score: string;
  fever: boolean;
  wound_status: string;
  medication_adherence: boolean;
  notes: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  low:      'bg-slate-100 text-slate-600',
  medium:   'bg-amber-100 text-amber-700',
  high:     'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export default function FollowUpManagement() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();

  const [plans, setPlans]         = useState<FollowUpPlan[]>([]);
  const [alerts, setAlerts]       = useState<Alert[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'plans' | 'alerts' | 'checkin'>('plans');
  const [submitting, setSubmitting] = useState(false);

  const [checkIn, setCheckIn] = useState<CheckInForm>({
    pain_score: '0', fever: false, wound_status: 'healing', medication_adherence: true, notes: ''
  });

  const [newPlan, setNewPlan] = useState({ follow_up_date: '', follow_up_type: 'outpatient', department: '', instructions: '' });
  const [addingPlan, setAddingPlan] = useState(false);
  const [showAddPlan, setShowAddPlan] = useState(false);

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const [planRes, alertRes] = await Promise.allSettled([
        api.get(`/v1/follow-up/plans?patientId=${patientId}`),
        api.get(`/v1/recovery/alerts?patientId=${patientId}`)
      ]);
      if (planRes.status === 'fulfilled') setPlans(planRes.value.data?.data ?? []);
      if (alertRes.status === 'fulfilled') setAlerts(alertRes.value.data?.data ?? []);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  const acknowledgeAlert = async (alertId: number) => {
    try {
      await api.post(`/v1/recovery/alerts/${alertId}/acknowledge`);
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
    } catch {
      // silent
    }
  };

  const submitCheckIn = async () => {
    if (!patientId) return;
    setSubmitting(true);
    try {
      await api.post('/v1/recovery/check-in', {
        patientId: parseInt(patientId),
        pain_score: parseInt(checkIn.pain_score),
        fever: checkIn.fever,
        wound_status: checkIn.wound_status,
        medication_adherence: checkIn.medication_adherence,
        notes: checkIn.notes,
      });
      setCheckIn({ pain_score: '0', fever: false, wound_status: 'healing', medication_adherence: true, notes: '' });
      await load();
      setActiveTab('alerts');
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to submit check-in');
    } finally {
      setSubmitting(false);
    }
  };

  const schedulePlan = async () => {
    if (!patientId || !newPlan.follow_up_date) return;
    setAddingPlan(true);
    try {
      await api.post('/v1/follow-up/schedule', {
        patientId: parseInt(patientId),
        ...newPlan
      });
      setNewPlan({ follow_up_date: '', follow_up_type: 'outpatient', department: '', instructions: '' });
      setShowAddPlan(false);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to schedule');
    } finally {
      setAddingPlan(false);
    }
  };

  const activeAlerts = alerts.filter(a => !a.acknowledged);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <HeartPulse className="h-5 w-5 text-teal-600" /> Follow-up & Recovery
            </h1>
            <p className="text-sm text-muted-foreground">Patient ID: {patientId}</p>
          </div>
          {activeAlerts.length > 0 && (
            <div className="flex items-center gap-1 bg-red-100 text-red-700 rounded-full px-3 py-1 text-sm font-medium">
              <Bell className="h-3.5 w-3.5" /> {activeAlerts.length} Alert{activeAlerts.length > 1 ? 's' : ''}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>}

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-white border rounded-lg p-1 w-fit">
          {(['plans', 'alerts', 'checkin'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5 ${activeTab === tab ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {tab === 'plans' && <Calendar className="h-3.5 w-3.5" />}
              {tab === 'alerts' && <AlertTriangle className="h-3.5 w-3.5" />}
              {tab === 'checkin' && <HeartPulse className="h-3.5 w-3.5" />}
              {tab === 'plans' ? 'Follow-up Plans' : tab === 'alerts' ? `Alerts${activeAlerts.length > 0 ? ` (${activeAlerts.length})` : ''}` : 'Recovery Check-in'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading…</div>
        ) : (
          <>
            {/* Plans tab */}
            {activeTab === 'plans' && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setShowAddPlan(v => !v)} className="bg-teal-600 hover:bg-teal-700 text-white">
                    <Plus className="h-4 w-4 mr-1" /> Schedule Follow-up
                  </Button>
                </div>

                {showAddPlan && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">New Follow-up Appointment</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Date</label>
                        <Input type="date" value={newPlan.follow_up_date} onChange={e => setNewPlan(p => ({ ...p, follow_up_date: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Type</label>
                        <select className="w-full border rounded-md px-3 py-2 text-sm bg-white" value={newPlan.follow_up_type} onChange={e => setNewPlan(p => ({ ...p, follow_up_type: e.target.value }))}>
                          <option value="outpatient">Outpatient</option>
                          <option value="teleconsult">Teleconsult</option>
                          <option value="home_visit">Home Visit</option>
                          <option value="lab_review">Lab Review</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Department</label>
                        <Input value={newPlan.department} onChange={e => setNewPlan(p => ({ ...p, department: e.target.value }))} placeholder="e.g. Cardiology" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Instructions</label>
                        <Input value={newPlan.instructions} onChange={e => setNewPlan(p => ({ ...p, instructions: e.target.value }))} placeholder="Patient instructions" />
                      </div>
                      <div className="col-span-2 flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setShowAddPlan(false)}>Cancel</Button>
                        <Button size="sm" onClick={schedulePlan} disabled={addingPlan || !newPlan.follow_up_date} className="bg-teal-600 hover:bg-teal-700 text-white">
                          {addingPlan ? 'Scheduling…' : 'Confirm'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {plans.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">No follow-up plans scheduled</div>
                ) : plans.map(plan => (
                  <Card key={plan.id}>
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-medium text-slate-800 text-sm">{plan.follow_up_type.replace(/_/g, ' ')}</p>
                          <Badge className={`text-xs px-1.5 ${plan.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : plan.status === 'missed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                            {plan.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{plan.department}</p>
                        <p className="text-xs text-slate-400 mt-1">{new Date(plan.follow_up_date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        {plan.instructions && <p className="text-xs text-slate-500 mt-1">{plan.instructions}</p>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Alerts tab */}
            {activeTab === 'alerts' && (
              <div className="space-y-3">
                {alerts.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">No monitoring alerts</div>
                ) : alerts.map(alert => (
                  <Card key={alert.id} className={alert.acknowledged ? 'opacity-60' : ''}>
                    <CardContent className="p-4 flex items-start gap-3">
                      <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${alert.severity === 'critical' ? 'text-red-600' : alert.severity === 'high' ? 'text-orange-500' : 'text-amber-500'}`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={`text-xs px-1.5 ${SEVERITY_COLOR[alert.severity]}`}>{alert.severity}</Badge>
                          <span className="text-xs text-slate-400">{new Date(alert.created_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</span>
                        </div>
                        <p className="text-sm text-slate-700">{alert.message}</p>
                      </div>
                      {!alert.acknowledged && (
                        <Button size="sm" variant="outline" onClick={() => acknowledgeAlert(alert.id)}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Ack
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Check-in tab */}
            {activeTab === 'checkin' && (
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-slate-700">Recovery Check-in</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1 block">Pain Score (0–10)</label>
                    <div className="flex items-center gap-3">
                      <input type="range" min="0" max="10" value={checkIn.pain_score} onChange={e => setCheckIn(c => ({ ...c, pain_score: e.target.value }))} className="flex-1 accent-teal-600" />
                      <span className={`text-lg font-bold w-8 text-center ${parseInt(checkIn.pain_score) >= 7 ? 'text-red-600' : parseInt(checkIn.pain_score) >= 4 ? 'text-amber-600' : 'text-emerald-600'}`}>{checkIn.pain_score}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Wound Status</label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm bg-white" value={checkIn.wound_status} onChange={e => setCheckIn(c => ({ ...c, wound_status: e.target.value }))}>
                        <option value="healing">Healing well</option>
                        <option value="redness">Redness/swelling</option>
                        <option value="discharge">Discharge</option>
                        <option value="infection">Signs of infection</option>
                        <option value="dehiscence">Dehiscence</option>
                      </select>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" id="fever" checked={checkIn.fever} onChange={e => setCheckIn(c => ({ ...c, fever: e.target.checked }))} className="w-4 h-4 accent-teal-600" />
                        <label htmlFor="fever" className="text-sm text-slate-700">Fever present</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" id="meds" checked={checkIn.medication_adherence} onChange={e => setCheckIn(c => ({ ...c, medication_adherence: e.target.checked }))} className="w-4 h-4 accent-teal-600" />
                        <label htmlFor="meds" className="text-sm text-slate-700">Medications taken as prescribed</label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1 block">Notes</label>
                    <textarea
                      className="w-full border rounded-md px-3 py-2 text-sm min-h-[80px] resize-none"
                      value={checkIn.notes}
                      onChange={e => setCheckIn(c => ({ ...c, notes: e.target.value }))}
                      placeholder="Any additional observations…"
                    />
                  </div>

                  <Button onClick={submitCheckIn} disabled={submitting} className="w-full bg-teal-600 hover:bg-teal-700 text-white">
                    {submitting ? 'Submitting…' : 'Submit Check-in'}
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
