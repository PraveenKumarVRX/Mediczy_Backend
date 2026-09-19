/**
 * Care Series Workspace — generic recurring-treatment workflow UI
 * (dialysis, chemotherapy, etc.), added 2026-09-18.
 *
 * Deliberately generic and clinically neutral: this UI renders whatever
 * approved guidance exists in the Clinical Knowledge Fabric for a series'
 * domain, but authors NO clinical content itself. Until a medical director
 * approves rules for a domain, the guidance panel is correctly empty — see
 * the design document's requirement that clinical content stay gated
 * behind human review even after the workflow shell is built.
 */

import { useState, useEffect } from 'react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Activity, AlertTriangle, ClipboardList, Plus, Droplet, Pill, Syringe, Zap } from 'lucide-react';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

const DIALYSIS_DOMAIN = 'nephrology_dialysis';
const CHEMO_DOMAIN = 'oncology_chemotherapy';

type DialysisFormState = {
  vascularAccessType: string;
  vascularAccessSite: string;
  accessSiteCondition: string;
  preSessionWeightKg: string;
  postSessionWeightKg: string;
  targetUfVolumeMl: string;
  actualUfVolumeMl: string;
  ufRateMlPerHr: string;
  bloodFlowRateMlMin: string;
  dialysateFlowRateMlMin: string;
  dialysateSodiumMmol: string;
  dialysatePotassiumMmol: string;
  dialysateCalciumMmol: string;
  dialysateTemperatureC: string;
  preSessionBpSystolic: string;
  preSessionBpDiastolic: string;
  postSessionBpSystolic: string;
  postSessionBpDiastolic: string;
  complications: string;
};

const emptyDialysisForm: DialysisFormState = {
  vascularAccessType: '', vascularAccessSite: '', accessSiteCondition: '',
  preSessionWeightKg: '', postSessionWeightKg: '',
  targetUfVolumeMl: '', actualUfVolumeMl: '', ufRateMlPerHr: '',
  bloodFlowRateMlMin: '', dialysateFlowRateMlMin: '',
  dialysateSodiumMmol: '', dialysatePotassiumMmol: '', dialysateCalciumMmol: '', dialysateTemperatureC: '',
  preSessionBpSystolic: '', preSessionBpDiastolic: '', postSessionBpSystolic: '', postSessionBpDiastolic: '',
  complications: '',
};

type ChemoFormState = {
  regimenReference: string;
  heightCm: string;
  weightKg: string;
  labsCurrent: boolean;
  premedicationGiven: boolean;
  premedicationNotes: string;
  toxicityCategory: string;
  ctcaeToxicityGrade: string;
  complications: string;
};

const emptyChemoForm: ChemoFormState = {
  regimenReference: '', heightCm: '', weightKg: '',
  labsCurrent: false, premedicationGiven: false, premedicationNotes: '',
  toxicityCategory: '', ctcaeToxicityGrade: '', complications: '',
};

const CTCAE_GRADES = [
  { value: '0', label: 'Grade 0 — None' },
  { value: '1', label: 'Grade 1 — Mild' },
  { value: '2', label: 'Grade 2 — Moderate' },
  { value: '3', label: 'Grade 3 — Severe' },
  { value: '4', label: 'Grade 4 — Life-threatening' },
  { value: '5', label: 'Grade 5 — Death' },
];

const DOMAINS = [
  { key: 'nephrology_dialysis', label: 'Nephrology — Dialysis' },
  { key: 'oncology_chemotherapy', label: 'Oncology — Chemotherapy' },
  { key: 'ophthalmology_surgical', label: 'Ophthalmology — Surgical' },
  { key: 'cardiology_cardiac_surgery', label: 'Cardiology / Cardiothoracic Surgery' },
  { key: 'orthopaedics_surgical', label: 'Orthopaedics — Surgical' },
];

export default function CareSeriesWorkspace() {
  const { toast } = useToast();
  const [patientId, setPatientId] = useState('');
  const [series, setSeries] = useState<any[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [guidance, setGuidance] = useState<any[]>([]);
  const [domain, setDomain] = useState(DOMAINS[0].key);
  const [seriesType, setSeriesType] = useState('');
  const [loading, setLoading] = useState(false);

  // Dialysis-specific state — only relevant/rendered when the selected
  // series' domain is nephrology_dialysis.
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [dialysisForm, setDialysisForm] = useState<DialysisFormState>(emptyDialysisForm);
  const [dialysisSaving, setDialysisSaving] = useState(false);
  const [medications, setMedications] = useState<any[]>([]);
  const [newMed, setNewMed] = useState({ medication: '', dose: '', doseUnit: '', route: '' });

  const [chemoForm, setChemoForm] = useState<ChemoFormState>(emptyChemoForm);
  const [chemoSaving, setChemoSaving] = useState(false);
  const [chemoDetail, setChemoDetail] = useState<any>(null);

  const loadSeries = async () => {
    if (!patientId.trim()) return;
    setLoading(true);
    try {
      const res = await api.get(`/care-series/patients/${patientId}/series`);
      setSeries(res.data?.data ?? []);
    } catch (e: any) {
      toast({ title: 'Failed to load series', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const startSeries = async () => {
    if (!patientId.trim() || !seriesType.trim()) {
      toast({ title: 'Patient ID and series type are required', variant: 'destructive' });
      return;
    }
    try {
      await api.post('/care-series/series', { patientId: Number(patientId), domainKey: domain, seriesType });
      toast({ title: 'Care series started' });
      setSeriesType('');
      loadSeries();
    } catch (e: any) {
      toast({ title: 'Failed to start series', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  const openSeries = async (s: any) => {
    setSelectedSeries(s);
    try {
      const [histRes, guideRes] = await Promise.allSettled([
        api.get(`/care-series/series/${s.id}/history`),
        api.get(`/care-series/series/${s.id}/guidance`),
      ]);
      setHistory(histRes.status === 'fulfilled' ? (histRes.value.data?.data ?? []) : []);
      setGuidance(guideRes.status === 'fulfilled' ? (guideRes.value.data?.data ?? []) : []);
    } catch {
      setHistory([]);
      setGuidance([]);
    }
  };

  const isDialysisSeries = selectedSeries?.domain_key === DIALYSIS_DOMAIN;
  const isChemoSeries = selectedSeries?.domain_key === CHEMO_DOMAIN;

  const selectSession = async (sessionId: number) => {
    setSelectedSessionId(sessionId);
    setDialysisForm(emptyDialysisForm);
    setMedications([]);
    setChemoForm(emptyChemoForm);
    setChemoDetail(null);

    if (isChemoSeries) {
      try {
        const res = await api.get(`/chemotherapy/sessions/${sessionId}/detail`);
        const d = res.data?.data;
        setChemoDetail(d || null);
        if (d) {
          setChemoForm({
            regimenReference: d.regimen_reference || '',
            heightCm: d.height_cm ?? '',
            weightKg: d.weight_kg ?? '',
            labsCurrent: !!d.labs_current,
            premedicationGiven: !!d.premedication_given,
            premedicationNotes: d.premedication_notes || '',
            toxicityCategory: d.toxicity_category || '',
            ctcaeToxicityGrade: d.ctcae_toxicity_grade ?? '',
            complications: d.complications || '',
          });
        }
      } catch {
        // no chemo detail recorded yet for this session
      }
      return;
    }

    if (!isDialysisSeries) return;
    try {
      const [detailRes, medsRes] = await Promise.allSettled([
        api.get(`/dialysis/sessions/${sessionId}/detail`),
        api.get(`/dialysis/sessions/${sessionId}/medications`),
      ]);
      const detail = detailRes.status === 'fulfilled' ? detailRes.value.data?.data : null;
      if (detail) {
        setDialysisForm({
          vascularAccessType: detail.vascular_access_type || '',
          vascularAccessSite: detail.vascular_access_site || '',
          accessSiteCondition: detail.access_site_condition || '',
          preSessionWeightKg: detail.pre_session_weight_kg ?? '',
          postSessionWeightKg: detail.post_session_weight_kg ?? '',
          targetUfVolumeMl: detail.target_uf_volume_ml ?? '',
          actualUfVolumeMl: detail.actual_uf_volume_ml ?? '',
          ufRateMlPerHr: detail.uf_rate_ml_per_hr ?? '',
          bloodFlowRateMlMin: detail.blood_flow_rate_ml_min ?? '',
          dialysateFlowRateMlMin: detail.dialysate_flow_rate_ml_min ?? '',
          dialysateSodiumMmol: detail.dialysate_sodium_mmol ?? '',
          dialysatePotassiumMmol: detail.dialysate_potassium_mmol ?? '',
          dialysateCalciumMmol: detail.dialysate_calcium_mmol ?? '',
          dialysateTemperatureC: detail.dialysate_temperature_c ?? '',
          preSessionBpSystolic: detail.pre_session_bp_systolic ?? '',
          preSessionBpDiastolic: detail.pre_session_bp_diastolic ?? '',
          postSessionBpSystolic: detail.post_session_bp_systolic ?? '',
          postSessionBpDiastolic: detail.post_session_bp_diastolic ?? '',
          complications: detail.complications || '',
        });
      }
      setMedications(medsRes.status === 'fulfilled' ? (medsRes.value.data?.data ?? []) : []);
    } catch {
      // leave form empty — this session has no dialysis detail recorded yet
    }
  };

  const numOrUndefined = (v: string) => (v.trim() === '' ? undefined : Number(v));

  const saveDialysisDetail = async () => {
    if (!selectedSessionId) return;
    setDialysisSaving(true);
    try {
      await api.post(`/dialysis/sessions/${selectedSessionId}/detail`, {
        vascularAccessType: dialysisForm.vascularAccessType || undefined,
        vascularAccessSite: dialysisForm.vascularAccessSite || undefined,
        accessSiteCondition: dialysisForm.accessSiteCondition || undefined,
        preSessionWeightKg: numOrUndefined(dialysisForm.preSessionWeightKg),
        postSessionWeightKg: numOrUndefined(dialysisForm.postSessionWeightKg),
        targetUfVolumeMl: numOrUndefined(dialysisForm.targetUfVolumeMl),
        actualUfVolumeMl: numOrUndefined(dialysisForm.actualUfVolumeMl),
        ufRateMlPerHr: numOrUndefined(dialysisForm.ufRateMlPerHr),
        bloodFlowRateMlMin: numOrUndefined(dialysisForm.bloodFlowRateMlMin),
        dialysateFlowRateMlMin: numOrUndefined(dialysisForm.dialysateFlowRateMlMin),
        dialysateSodiumMmol: numOrUndefined(dialysisForm.dialysateSodiumMmol),
        dialysatePotassiumMmol: numOrUndefined(dialysisForm.dialysatePotassiumMmol),
        dialysateCalciumMmol: numOrUndefined(dialysisForm.dialysateCalciumMmol),
        dialysateTemperatureC: numOrUndefined(dialysisForm.dialysateTemperatureC),
        preSessionBpSystolic: numOrUndefined(dialysisForm.preSessionBpSystolic),
        preSessionBpDiastolic: numOrUndefined(dialysisForm.preSessionBpDiastolic),
        postSessionBpSystolic: numOrUndefined(dialysisForm.postSessionBpSystolic),
        postSessionBpDiastolic: numOrUndefined(dialysisForm.postSessionBpDiastolic),
        complications: dialysisForm.complications || undefined,
      });
      toast({ title: 'Session details saved' });
    } catch (e: any) {
      toast({ title: 'Failed to save session details', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setDialysisSaving(false);
    }
  };

  const logMedication = async () => {
    if (!selectedSessionId || !newMed.medication.trim()) {
      toast({ title: 'Medication name is required', variant: 'destructive' });
      return;
    }
    try {
      await api.post(`/dialysis/sessions/${selectedSessionId}/medications`, {
        medication: newMed.medication.trim(),
        dose: newMed.dose ? Number(newMed.dose) : undefined,
        doseUnit: newMed.doseUnit || undefined,
        route: newMed.route || undefined,
      });
      toast({ title: 'Medication logged' });
      setNewMed({ medication: '', dose: '', doseUnit: '', route: '' });
      const res = await api.get(`/dialysis/sessions/${selectedSessionId}/medications`);
      setMedications(res.data?.data ?? []);
    } catch (e: any) {
      toast({ title: 'Failed to log medication', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  const saveChemoDetail = async () => {
    if (!selectedSessionId) return;
    setChemoSaving(true);
    try {
      const res = await api.post(`/chemotherapy/sessions/${selectedSessionId}/detail`, {
        regimenReference: chemoForm.regimenReference || undefined,
        heightCm: numOrUndefined(chemoForm.heightCm),
        weightKg: numOrUndefined(chemoForm.weightKg),
        labsCurrent: chemoForm.labsCurrent,
        premedicationGiven: chemoForm.premedicationGiven,
        premedicationNotes: chemoForm.premedicationNotes || undefined,
        toxicityCategory: chemoForm.toxicityCategory || undefined,
        ctcaeToxicityGrade: numOrUndefined(chemoForm.ctcaeToxicityGrade),
        complications: chemoForm.complications || undefined,
      });
      setChemoDetail(res.data?.data);
      toast({ title: 'Cycle details saved', description: res.data?.data?.bsa_m2 ? `BSA: ${res.data.data.bsa_m2} m²` : undefined });
    } catch (e: any) {
      toast({ title: 'Failed to save cycle details', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setChemoSaving(false);
    }
  };

  const flagExtravasation = async () => {
    if (!selectedSessionId) return;
    try {
      const res = await api.post(`/chemotherapy/sessions/${selectedSessionId}/extravasation`, {});
      setChemoDetail(res.data?.data);
      toast({ title: 'Extravasation flagged', description: 'Infusion-stop protocol recorded. Follow your institutional extravasation protocol now.', variant: 'destructive' });
    } catch (e: any) {
      toast({ title: 'Failed to flag extravasation', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  const scheduleNextSession = async () => {
    if (!selectedSeries) return;
    const nextNumber = (history[history.length - 1]?.session_number || 0) + 1;
    try {
      await api.post(`/care-series/series/${selectedSeries.id}/sessions`, { sessionNumber: nextNumber });
      toast({ title: `Session ${nextNumber} scheduled` });
      openSeries(selectedSeries);
    } catch (e: any) {
      toast({ title: 'Failed to schedule session', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  return (
    <HospitalLayout title="Care Series Workspace" subtitle="Recurring-treatment tracking (dialysis, chemotherapy, and similar programs) — workflow shell only">
      <Card className="border-0 shadow-sm mb-6">
        <CardContent className="p-4 flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[160px]">
            <Label htmlFor="patient-id">Patient ID</Label>
            <Input id="patient-id" value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="e.g. 1024" />
          </div>
          <Button onClick={loadSeries} disabled={loading}>{loading ? 'Loading...' : 'Load Series'}</Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="border-0 shadow-sm lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Active Series</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {series.length === 0 && <p className="text-sm text-muted-foreground">No active series for this patient. Start one below.</p>}
            {series.map((s) => (
              <button
                key={s.id}
                onClick={() => openSeries(s)}
                className={`w-full text-left p-3 rounded-lg border text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${selectedSeries?.id === s.id ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950' : ''}`}
              >
                <div className="font-medium">{s.series_type}</div>
                <div className="text-xs text-muted-foreground">{s.domain_key} · started {new Date(s.started_at).toLocaleDateString()}</div>
              </button>
            ))}

            <div className="pt-3 border-t space-y-2">
              <Label htmlFor="domain">New series — domain</Label>
              <Select value={domain} onValueChange={setDomain}>
                <SelectTrigger id="domain"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOMAINS.map((d) => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input value={seriesType} onChange={(e) => setSeriesType(e.target.value)} placeholder="Series type, e.g. dialysis" />
              <Button size="sm" className="w-full" onClick={startSeries}><Plus className="h-3.5 w-3.5 mr-1" /> Start Series</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Session History</CardTitle>
            {selectedSeries && <Button size="sm" variant="outline" onClick={scheduleNextSession}>Schedule Next Session</Button>}
          </CardHeader>
          <CardContent>
            {!selectedSeries && <p className="text-sm text-muted-foreground py-6 text-center">Select a series to view its session history.</p>}
            {selectedSeries && history.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No sessions recorded yet.</p>}
            {selectedSeries && history.map((h) => (
              <button
                key={h.id}
                onClick={() => selectSession(h.id)}
                className={`w-full flex items-center justify-between text-sm border-b py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 px-1 rounded ${selectedSessionId === h.id ? 'bg-indigo-50 dark:bg-indigo-950' : ''}`}
              >
                <span>Session {h.session_number}</span>
                <Badge className={h.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}>{h.status}</Badge>
              </button>
            ))}

            {isDialysisSeries && selectedSessionId && (
              <div className="mt-4 pt-4 border-t space-y-4">
                <h4 className="text-sm font-semibold flex items-center gap-2"><Droplet className="h-4 w-4 text-blue-500" /> Dialysis Session Details</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Vascular Access</Label>
                    <Select value={dialysisForm.vascularAccessType} onValueChange={(v) => setDialysisForm((f) => ({ ...f, vascularAccessType: v }))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fistula">Fistula</SelectItem>
                        <SelectItem value="graft">Graft</SelectItem>
                        <SelectItem value="catheter">Catheter</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Access Site</Label>
                    <Input className="h-9" value={dialysisForm.vascularAccessSite} onChange={(e) => setDialysisForm((f) => ({ ...f, vascularAccessSite: e.target.value }))} placeholder="e.g. left forearm" />
                  </div>
                  <div>
                    <Label className="text-xs">Access Site Condition</Label>
                    <Input className="h-9" value={dialysisForm.accessSiteCondition} onChange={(e) => setDialysisForm((f) => ({ ...f, accessSiteCondition: e.target.value }))} placeholder="e.g. thrill present, no signs of infection" />
                  </div>
                  <div>
                    <Label className="text-xs">Pre-session Weight (kg)</Label>
                    <Input className="h-9" type="number" value={dialysisForm.preSessionWeightKg} onChange={(e) => setDialysisForm((f) => ({ ...f, preSessionWeightKg: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Post-session Weight (kg)</Label>
                    <Input className="h-9" type="number" value={dialysisForm.postSessionWeightKg} onChange={(e) => setDialysisForm((f) => ({ ...f, postSessionWeightKg: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Target UF Volume (mL)</Label>
                    <Input className="h-9" type="number" value={dialysisForm.targetUfVolumeMl} onChange={(e) => setDialysisForm((f) => ({ ...f, targetUfVolumeMl: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Actual UF Volume (mL)</Label>
                    <Input className="h-9" type="number" value={dialysisForm.actualUfVolumeMl} onChange={(e) => setDialysisForm((f) => ({ ...f, actualUfVolumeMl: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">UF Rate (mL/hr)</Label>
                    <Input className="h-9" type="number" value={dialysisForm.ufRateMlPerHr} onChange={(e) => setDialysisForm((f) => ({ ...f, ufRateMlPerHr: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Blood Flow Rate (mL/min)</Label>
                    <Input className="h-9" type="number" value={dialysisForm.bloodFlowRateMlMin} onChange={(e) => setDialysisForm((f) => ({ ...f, bloodFlowRateMlMin: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Dialysate Flow Rate (mL/min)</Label>
                    <Input className="h-9" type="number" value={dialysisForm.dialysateFlowRateMlMin} onChange={(e) => setDialysisForm((f) => ({ ...f, dialysateFlowRateMlMin: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Dialysate Na (mmol/L)</Label>
                    <Input className="h-9" type="number" value={dialysisForm.dialysateSodiumMmol} onChange={(e) => setDialysisForm((f) => ({ ...f, dialysateSodiumMmol: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Dialysate K (mmol/L)</Label>
                    <Input className="h-9" type="number" value={dialysisForm.dialysatePotassiumMmol} onChange={(e) => setDialysisForm((f) => ({ ...f, dialysatePotassiumMmol: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Dialysate Ca (mmol/L)</Label>
                    <Input className="h-9" type="number" value={dialysisForm.dialysateCalciumMmol} onChange={(e) => setDialysisForm((f) => ({ ...f, dialysateCalciumMmol: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Dialysate Temp (°C)</Label>
                    <Input className="h-9" type="number" value={dialysisForm.dialysateTemperatureC} onChange={(e) => setDialysisForm((f) => ({ ...f, dialysateTemperatureC: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Pre BP (systolic/diastolic)</Label>
                    <div className="flex gap-1">
                      <Input className="h-9" type="number" value={dialysisForm.preSessionBpSystolic} onChange={(e) => setDialysisForm((f) => ({ ...f, preSessionBpSystolic: e.target.value }))} placeholder="Sys" />
                      <Input className="h-9" type="number" value={dialysisForm.preSessionBpDiastolic} onChange={(e) => setDialysisForm((f) => ({ ...f, preSessionBpDiastolic: e.target.value }))} placeholder="Dia" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Post BP (systolic/diastolic)</Label>
                    <div className="flex gap-1">
                      <Input className="h-9" type="number" value={dialysisForm.postSessionBpSystolic} onChange={(e) => setDialysisForm((f) => ({ ...f, postSessionBpSystolic: e.target.value }))} placeholder="Sys" />
                      <Input className="h-9" type="number" value={dialysisForm.postSessionBpDiastolic} onChange={(e) => setDialysisForm((f) => ({ ...f, postSessionBpDiastolic: e.target.value }))} placeholder="Dia" />
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Complications</Label>
                  <Input value={dialysisForm.complications} onChange={(e) => setDialysisForm((f) => ({ ...f, complications: e.target.value }))} placeholder="e.g. mild cramping at hour 3, resolved" />
                </div>
                <Button size="sm" onClick={saveDialysisDetail} disabled={dialysisSaving}>{dialysisSaving ? 'Saving...' : 'Save Session Details'}</Button>

                <div className="pt-3 border-t">
                  <h5 className="text-xs font-semibold flex items-center gap-1.5 mb-2"><Pill className="h-3.5 w-3.5 text-purple-500" /> Medication Administration (e.g. heparin, EPO, iron)</h5>
                  {medications.map((m) => (
                    <div key={m.id} className="text-xs flex items-center justify-between border-b py-1.5">
                      <span>{m.medication} {m.dose ? `— ${m.dose}${m.dose_unit || ''}` : ''} {m.route ? `(${m.route})` : ''}</span>
                      <span className="text-muted-foreground">{new Date(m.administered_at).toLocaleTimeString()}</span>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Input className="h-8 w-32 text-xs" value={newMed.medication} onChange={(e) => setNewMed((m) => ({ ...m, medication: e.target.value }))} placeholder="Medication" />
                    <Input className="h-8 w-20 text-xs" type="number" value={newMed.dose} onChange={(e) => setNewMed((m) => ({ ...m, dose: e.target.value }))} placeholder="Dose" />
                    <Input className="h-8 w-20 text-xs" value={newMed.doseUnit} onChange={(e) => setNewMed((m) => ({ ...m, doseUnit: e.target.value }))} placeholder="Unit" />
                    <Input className="h-8 w-24 text-xs" value={newMed.route} onChange={(e) => setNewMed((m) => ({ ...m, route: e.target.value }))} placeholder="Route" />
                    <Button size="sm" variant="outline" onClick={logMedication}>Log</Button>
                  </div>
                </div>
              </div>
            )}

            {isChemoSeries && selectedSessionId && (
              <div className="mt-4 pt-4 border-t space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold flex items-center gap-2"><Syringe className="h-4 w-4 text-purple-500" /> Chemotherapy Cycle Details</h4>
                  <Button size="sm" variant="destructive" onClick={flagExtravasation}>
                    <Zap className="h-3.5 w-3.5 mr-1" /> Flag Extravasation
                  </Button>
                </div>
                {chemoDetail?.extravasation_occurred && (
                  <div className="flex items-start gap-2 text-xs bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg p-3">
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <span>Extravasation flagged for this session. Action recorded: {chemoDetail.extravasation_action_taken}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Regimen Reference</Label>
                    <Input className="h-9" value={chemoForm.regimenReference} onChange={(e) => setChemoForm((f) => ({ ...f, regimenReference: e.target.value }))} placeholder="e.g. R-CHOP" />
                  </div>
                  <div>
                    <Label className="text-xs">Height (cm)</Label>
                    <Input className="h-9" type="number" value={chemoForm.heightCm} onChange={(e) => setChemoForm((f) => ({ ...f, heightCm: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Weight (kg)</Label>
                    <Input className="h-9" type="number" value={chemoForm.weightKg} onChange={(e) => setChemoForm((f) => ({ ...f, weightKg: e.target.value }))} />
                  </div>
                  {chemoDetail?.bsa_m2 && (
                    <div className="flex items-end pb-1.5">
                      <Badge variant="outline">BSA: {chemoDetail.bsa_m2} m² (Mosteller)</Badge>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Checkbox id="labs-current" checked={chemoForm.labsCurrent} onCheckedChange={(v) => setChemoForm((f) => ({ ...f, labsCurrent: !!v }))} />
                    <Label htmlFor="labs-current" className="text-xs">Labs current</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="premed-given" checked={chemoForm.premedicationGiven} onCheckedChange={(v) => setChemoForm((f) => ({ ...f, premedicationGiven: !!v }))} />
                    <Label htmlFor="premed-given" className="text-xs">Premedication given</Label>
                  </div>
                </div>
                <Input value={chemoForm.premedicationNotes} onChange={(e) => setChemoForm((f) => ({ ...f, premedicationNotes: e.target.value }))} placeholder="Premedication notes (e.g. ondansetron, dexamethasone given)" />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Toxicity Category (if any)</Label>
                    <Input className="h-9" value={chemoForm.toxicityCategory} onChange={(e) => setChemoForm((f) => ({ ...f, toxicityCategory: e.target.value }))} placeholder="e.g. nausea, neutropenia" />
                  </div>
                  <div>
                    <Label className="text-xs">CTCAE Toxicity Grade</Label>
                    <Select value={chemoForm.ctcaeToxicityGrade} onValueChange={(v) => setChemoForm((f) => ({ ...f, ctcaeToxicityGrade: v }))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select grade" /></SelectTrigger>
                      <SelectContent>
                        {CTCAE_GRADES.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Complications</Label>
                  <Input value={chemoForm.complications} onChange={(e) => setChemoForm((f) => ({ ...f, complications: e.target.value }))} />
                </div>
                <Button size="sm" onClick={saveChemoDetail} disabled={chemoSaving}>{chemoSaving ? 'Saving...' : 'Save Cycle Details'}</Button>
              </div>
            )}

            {selectedSeries && (
              <div className="mt-5 pt-4 border-t">
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <Activity className="h-4 w-4 text-indigo-500" /> Clinical Guidance for this Domain
                </h4>
                {guidance.length === 0 ? (
                  <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>
                      No approved clinical guidance exists yet for this domain. Draft content exists in the
                      Clinical Knowledge Fabric but requires medical-director review and approval before it
                      appears here — this is by design, not a bug.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {guidance.map((g, i) => (
                      <div key={i} className="text-xs border rounded-lg p-2">
                        <span className="font-semibold">{g.title}</span> — {g.recommendation_text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </HospitalLayout>
  );
}
