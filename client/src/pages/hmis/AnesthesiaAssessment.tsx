import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save, Stethoscope, Activity } from 'lucide-react';
import api from '@/utils/api';

type ASAClass = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';
type AirwayClass = '1' | '2' | '3' | '4';

interface AssessmentForm {
  asa_class: ASAClass;
  airway_class: AirwayClass;
  mallampati_score: string;
  mouth_opening_cm: string;
  neck_extension: string;
  dentition_notes: string;
  fasting_status: string;
  allergies: string;
  current_medications: string;
  previous_anesthesia: string;
  previous_complications: string;
  planned_technique: string;
  planned_agents: string;
  monitoring_plan: string;
  regional_technique: string;
  consent_obtained: boolean;
  consent_notes: string;
  assessment_notes: string;
}

const DEFAULT_FORM: AssessmentForm = {
  asa_class: 'II', airway_class: '1', mallampati_score: 'I',
  mouth_opening_cm: '', neck_extension: 'adequate', dentition_notes: '',
  fasting_status: 'NBM 6h', allergies: 'NKDA', current_medications: '',
  previous_anesthesia: 'none', previous_complications: 'none',
  planned_technique: 'GA', planned_agents: '', monitoring_plan: 'standard',
  regional_technique: '', consent_obtained: false, consent_notes: '',
  assessment_notes: ''
};

export default function AnesthesiaAssessment() {
  const { otBookingId } = useParams<{ otBookingId: string }>();
  const navigate = useNavigate();

  const [form, setForm] = useState<AssessmentForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof AssessmentForm, v: string | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const submit = async () => {
    if (!otBookingId) return;
    setSaving(true);
    setError(null);
    try {
      await api.post('/api/v1/anesthesia/assessment', {
        ...form,
        otBookingId: parseInt(otBookingId),
        mouth_opening_cm: form.mouth_opening_cm ? parseFloat(form.mouth_opening_cm) : null,
      });
      setSaved(true);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to save assessment');
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );

  const Select = ({ k, options }: { k: keyof AssessmentForm; options: string[] }) => (
    <select
      className="w-full border rounded-md px-3 py-2 text-sm bg-white"
      value={form[k] as string}
      onChange={e => set(k, e.target.value)}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-teal-600" /> Anesthesia Pre-Assessment
            </h1>
            <p className="text-sm text-muted-foreground">OT Booking ID: {otBookingId}</p>
          </div>
          {saved && <Badge className="bg-emerald-100 text-emerald-700">Saved</Badge>}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>}

        <div className="space-y-4">
          {/* Risk Classification */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-slate-700">Risk Classification</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field label="ASA Physical Status">
                <Select k="asa_class" options={['I', 'II', 'III', 'IV', 'V', 'VI']} />
              </Field>
              <Field label="Airway Class">
                <Select k="airway_class" options={['1', '2', '3', '4']} />
              </Field>
              <Field label="Mallampati Score">
                <Select k="mallampati_score" options={['I', 'II', 'III', 'IV']} />
              </Field>
              <Field label="Mouth Opening (cm)">
                <Input type="number" step="0.1" value={form.mouth_opening_cm} onChange={e => set('mouth_opening_cm', e.target.value)} placeholder="e.g. 4.5" />
              </Field>
              <Field label="Neck Extension">
                <Select k="neck_extension" options={['adequate', 'limited', 'poor']} />
              </Field>
              <Field label="Dentition Notes">
                <Input value={form.dentition_notes} onChange={e => set('dentition_notes', e.target.value)} placeholder="Caps, loose teeth, prosthesis…" />
              </Field>
            </CardContent>
          </Card>

          {/* Pre-operative Status */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-slate-700">Pre-operative Status</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field label="Fasting Status">
                <Select k="fasting_status" options={['NBM 6h', 'NBM 4h', 'NBM 2h', 'Not fasted', 'Unknown']} />
              </Field>
              <Field label="Allergies">
                <Input value={form.allergies} onChange={e => set('allergies', e.target.value)} placeholder="NKDA or list allergies" />
              </Field>
              <Field label="Current Medications">
                <Input value={form.current_medications} onChange={e => set('current_medications', e.target.value)} placeholder="List medications…" />
              </Field>
              <Field label="Previous Anesthesia">
                <Select k="previous_anesthesia" options={['none', 'GA', 'spinal', 'epidural', 'regional', 'multiple']} />
              </Field>
              <div className="col-span-2">
                <Field label="Previous Complications">
                  <Input value={form.previous_complications} onChange={e => set('previous_complications', e.target.value)} placeholder="Difficult airway, awareness, PONV, MH susceptibility…" />
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* Anesthesia Plan */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Activity className="h-4 w-4" /> Anesthesia Plan</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field label="Planned Technique">
                <Select k="planned_technique" options={['GA', 'Spinal', 'Epidural', 'CSE', 'Regional', 'MAC', 'Local']} />
              </Field>
              <Field label="Monitoring Plan">
                <Select k="monitoring_plan" options={['standard', 'arterial line', 'CVP', 'PA catheter', 'BIS', 'TOF']} />
              </Field>
              <div className="col-span-2">
                <Field label="Planned Agents">
                  <Input value={form.planned_agents} onChange={e => set('planned_agents', e.target.value)} placeholder="Induction/maintenance agents…" />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Regional Technique Details">
                  <Input value={form.regional_technique} onChange={e => set('regional_technique', e.target.value)} placeholder="Block type, level, additives…" />
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* Consent & Notes */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-slate-700">Consent & Notes</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="consent"
                  checked={form.consent_obtained}
                  onChange={e => set('consent_obtained', e.target.checked)}
                  className="w-4 h-4 accent-teal-600"
                />
                <label htmlFor="consent" className="text-sm text-slate-700">Anesthesia consent obtained and documented</label>
              </div>
              <Field label="Assessment Notes">
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm bg-white min-h-[80px] resize-none"
                  value={form.assessment_notes}
                  onChange={e => set('assessment_notes', e.target.value)}
                  placeholder="Additional notes, special considerations…"
                />
              </Field>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 pb-6">
            <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
            <Button onClick={submit} disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white">
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving…' : 'Save Assessment'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
