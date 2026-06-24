import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, User, Activity, Pill, AlertTriangle, PlusCircle, FileText, LogOut, Star } from 'lucide-react';
import api from '@/utils/api';

interface PatientSummary {
  name: string; age: number; bed: string; ward: string;
  diagnosis: string; allergies: string[]; admittedAt: string; admissionId: number;
}
interface Vital { label: string; value: string; unit: string; flag?: string; }
interface Medication { orderId: number; drugName: string; dose: string; route: string; frequency: string; status: string; }
interface LabAlert { id: number; test: string; value: string; threshold: string; severity: 'critical' | 'high' | 'moderate'; }

export default function InpatientWorkspace() {
  const { patientId }  = useParams<{ patientId: string }>();
  const navigate       = useNavigate();

  const [patient, setPatient]     = useState<PatientSummary | null>(null);
  const [vitals, setVitals]       = useState<Vital[]>([]);
  const [meds, setMeds]           = useState<Medication[]>([]);
  const [alerts, setAlerts]       = useState<LabAlert[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const summaryRes = await api.get(`/v1/clinical-workspace/patient/${patientId}`);
      const payload = summaryRes.data;
      const p: PatientSummary | null = payload?.data?.admissionId
        ? payload.data
        : payload?.workspace?.summary ?? payload?.data ?? null;
      setPatient(p);

      const ws = payload?.workspace;
      if (ws?.vitalsDisplay?.length) {
        setVitals(ws.vitalsDisplay);
      } else if (p?.admissionId) {
        const vitRes = await api.get(`/v1/vitals/${p.admissionId}/latest`);
        const raw = vitRes.data?.data;
        if (Array.isArray(raw)) setVitals(raw);
        else if (raw) {
          setVitals([
            { label: 'Temp', value: String(raw.temperature ?? '—'), unit: '°C' },
            { label: 'Pulse', value: String(raw.pulse ?? '—'), unit: 'bpm' },
            { label: 'BP', value: `${raw.bp_systolic ?? '—'}/${raw.bp_diastolic ?? '—'}`, unit: 'mmHg' },
            { label: 'SpO₂', value: String(raw.spo2 ?? '—'), unit: '%' },
            { label: 'RR', value: String(raw.respiratory_rate ?? '—'), unit: '/min' },
          ]);
        }
      }

      if (ws?.medicationsDisplay?.length) {
        setMeds(ws.medicationsDisplay);
      } else if (p?.admissionId) {
        const medRes = await api.get(`/v1/emar/orders/${p.admissionId}`);
        const rows = medRes.data?.data ?? [];
        setMeds(rows.map((m: any) => ({
          orderId: m.id,
          drugName: m.drug_name ?? m.drugName,
          dose: m.dose,
          route: m.route,
          frequency: m.frequency,
          status: m.order_status ?? m.status ?? 'active',
        })));
      }

      if (ws?.activeAlerts?.length) {
        setAlerts(ws.activeAlerts.map((a: any) => ({
          id: a.id,
          test: a.alert_type ?? 'Alert',
          value: a.alert_message ?? '',
          threshold: a.news2_score != null ? `NEWS2 ${a.news2_score}` : '—',
          severity: (a.severity === 'critical' ? 'critical' : a.severity === 'high' ? 'high' : 'moderate') as LabAlert['severity'],
        })));
      } else if (p?.admissionId) {
        const alertRes = await api.get(`/v1/lab-rules/alerts/${patientId}`);
        setAlerts(alertRes.data?.data ?? []);
      }

      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to load patient workspace');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  const los = patient ? Math.round((Date.now() - new Date(patient.admittedAt).getTime()) / 3600000) : 0;

  const ALERT_STYLE: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-300',
    high:     'bg-orange-100 text-orange-700 border-orange-300',
    moderate: 'bg-amber-100 text-amber-700 border-amber-300',
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <User className="h-5 w-5 text-teal-600" /> Inpatient Workspace
            </h1>
            <p className="text-sm text-muted-foreground">Patient ID: {patientId}</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>}

        {loading ? (
          <div className="text-center py-20 text-muted-foreground">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-teal-500" />
            Loading patient workspace…
          </div>
        ) : (
          <div className="space-y-4">
            {/* Panel 1: Patient Header */}
            {patient && (
              <Card className="border-teal-200 bg-teal-50">
                <CardContent className="p-4">
                  <div className="flex flex-wrap gap-4 items-start">
                    <div className="flex-1 min-w-[200px]">
                      <h2 className="text-lg font-bold text-slate-900">{patient.name}</h2>
                      <p className="text-sm text-slate-600">{patient.age} yrs • {patient.ward} • Bed {patient.bed}</p>
                      <p className="text-sm text-slate-700 mt-1 font-medium">{patient.diagnosis}</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-slate-500">Allergies</span>
                      <div className="flex flex-wrap gap-1">
                        {patient.allergies.length > 0
                          ? patient.allergies.map(a => <Badge key={a} className="bg-red-100 text-red-700 text-xs">{a}</Badge>)
                          : <span className="text-xs text-slate-400">None known</span>}
                      </div>
                    </div>
                    <div className="text-center bg-white rounded-lg px-4 py-2">
                      <p className="text-xl font-bold text-teal-700">{los}h</p>
                      <p className="text-xs text-slate-500">LOS</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Panel 2: Vitals */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Activity className="h-4 w-4 text-teal-600" /> Latest Vitals</CardTitle>
              </CardHeader>
              <CardContent>
                {vitals.length === 0 ? <p className="text-sm text-muted-foreground">No vitals recorded</p> : (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                    {vitals.map(v => (
                      <div key={v.label} className={`rounded-lg p-3 text-center border ${v.flag ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
                        <p className={`text-lg font-bold ${v.flag ? 'text-red-700' : 'text-slate-800'}`}>{v.value}</p>
                        <p className="text-xs text-slate-500">{v.unit}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{v.label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Panel 3: Medications */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Pill className="h-4 w-4 text-teal-600" /> Active Medications</CardTitle>
              </CardHeader>
              <CardContent>
                {meds.length === 0 ? <p className="text-sm text-muted-foreground">No active orders</p> : (
                  <div className="divide-y">
                    {meds.map(m => (
                      <div key={m.orderId} className="flex items-center gap-3 py-2">
                        <div className="flex-1">
                          <span className="font-medium text-sm text-slate-800">{m.drugName}</span>
                          <span className="text-muted-foreground text-xs ml-2">{m.dose} · {m.route} · {m.frequency}</span>
                        </div>
                        <Badge className="text-xs bg-blue-100 text-blue-700">{m.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Panel 4: Lab Alerts */}
            {alerts.length > 0 && (
              <Card className="border-red-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-red-700 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Pending Lab Alerts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {alerts.map(a => (
                      <div key={a.id} className={`flex items-center gap-3 rounded-lg p-2 border text-xs ${ALERT_STYLE[a.severity]}`}>
                        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="font-medium">{a.test}</span>
                        <span>{a.value}</span>
                        <span className="text-muted-foreground">threshold: {a.threshold}</span>
                        <Badge className={`ml-auto text-[10px] ${ALERT_STYLE[a.severity]}`}>{a.severity}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Panel 5: Actions */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Place Order', icon: PlusCircle, cls: 'bg-teal-600 hover:bg-teal-700 text-white' },
                { label: 'Write Note', icon: FileText, cls: 'bg-slate-700 hover:bg-slate-800 text-white' },
                { label: 'Start Discharge', icon: LogOut, cls: 'bg-amber-600 hover:bg-amber-700 text-white', action: () => patient?.admissionId && navigate(`/hmis/admission/${patient.admissionId}/discharge`) },
                { label: 'Add to Follow-Up', icon: Star, cls: 'bg-blue-600 hover:bg-blue-700 text-white' },
              ].map(({ label, icon: Icon, cls, action }) => (
                <Button key={label} className={`${cls} flex items-center gap-1`} onClick={action}>
                  <Icon className="h-4 w-4" /> {label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
