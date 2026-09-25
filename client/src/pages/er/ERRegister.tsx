import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Siren, UserPlus, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import { EMPTY_GUIDED_TRIAGE, assessGuidedTriage, type GuidedTriage } from '@/utils/erGuidedTriage';

// ESI levels are never inferred from a legacy colour and vice versa (see server/routes/er-workflow.route.js) —
// a nurse picks exactly one triage mode at registration time, or none if triage will happen at the bedside.
type TriageMode = 'none' | 'esi' | 'guided' | 'colour';

const ESI_OPTIONS = [
  { level: 1, label: 'ESI-1 — Resuscitation', hint: 'Immediate, life-threatening' },
  { level: 2, label: 'ESI-2 — Emergent', hint: 'High-risk, severe distress' },
  { level: 3, label: 'ESI-3 — Urgent', hint: 'Needs multiple resources' },
  { level: 4, label: 'ESI-4 — Less Urgent', hint: 'Needs one resource' },
  { level: 5, label: 'ESI-5 — Non-Urgent', hint: 'No resources expected' },
];

const COLOUR_OPTIONS = [
  { value: 'red', label: 'Red — Immediate' },
  { value: 'yellow', label: 'Yellow — Urgent' },
  { value: 'green', label: 'Green — Non-Urgent' },
];

const guidedQuestion = (id: keyof GuidedTriage, label: string, checked: boolean, onChange: (value: boolean) => void) => (
  <div className="flex items-start gap-3 rounded-lg border p-3">
    <Checkbox id={`guided-${id}`} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
    <div>
      <Label htmlFor={`guided-${id}`} className="cursor-pointer text-sm font-medium">{label}</Label>
    </div>
  </div>
);

export default function ERRegister() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [patientId, setPatientId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [phone, setPhone] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [mlcCase, setMlcCase] = useState(false);
  const [injuryType, setInjuryType] = useState('');
  const [broughtBy, setBroughtBy] = useState('');
  const [familyPhone, setFamilyPhone] = useState('');

  const [triageMode, setTriageMode] = useState<TriageMode>('none');
  const [esiLevel, setEsiLevel] = useState('');
  const [triageLevel, setTriageLevel] = useState('');
  const [guidedTriage, setGuidedTriage] = useState<GuidedTriage>(EMPTY_GUIDED_TRIAGE);
  const [vitals, setVitals] = useState({ heartRate: '', respiratoryRate: '', spo2: '' });
  const [upTriage, setUpTriage] = useState<{ decision: '' | 'accepted' | 'declined'; reason: string }>({ decision: '', reason: '' });
  const [triageConfirmed, setTriageConfirmed] = useState(false);
  const toNum = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const parsedVitals = { heartRate: toNum(vitals.heartRate), respiratoryRate: toNum(vitals.respiratoryRate), spo2: toNum(vitals.spo2) };
  const ageYears = age ? Number(age) : null;
  // Audit CLN-04: the guided result now includes ESI's danger-zone-vitals step. The server re-derives all of this and
  // is authoritative; this only drives the form. An accepted up-triage becomes ESI-2, otherwise the tree's level stands.
  const assessment = assessGuidedTriage(guidedTriage, parsedVitals, ageYears);
  const guidedEsiLevel = assessment.upTriageSuggested && upTriage.decision === 'accepted' ? 2 : assessment.base;

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (triageMode === 'esi' && !esiLevel) {
      toast({ title: 'Select an ESI level', variant: 'destructive' });
      return;
    }
    if (triageMode === 'guided') {
      const answered = Object.values(guidedTriage).some(Boolean);
      if (!answered) {
        toast({ title: 'Answer the guided triage questions', variant: 'destructive' });
        return;
      }
      if (assessment.upTriageSuggested && !upTriage.decision) {
        toast({ title: 'Danger-zone vitals', description: 'Accept ESI-2 or keep ESI-3 with a reason before registering.', variant: 'destructive' });
        return;
      }
      if (assessment.upTriageSuggested && upTriage.decision === 'declined' && upTriage.reason.trim().length < 3) {
        toast({ title: 'Reason required', description: 'Record why ESI-2 was not assigned.', variant: 'destructive' });
        return;
      }
      if (!triageConfirmed) {
        toast({ title: 'Confirm the triage', description: 'A nurse must confirm the guided ESI level before registration.', variant: 'destructive' });
        return;
      }
    }
    if (triageMode === 'colour' && !triageLevel) {
      toast({ title: 'Select a triage colour', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/v1/er/register', {
        patientId: patientId ? Number(patientId) : undefined,
        patientName: patientName || 'Unknown',
        age: age ? Number(age) : undefined,
        gender: gender || undefined,
        phone: phone || undefined,
        chiefComplaint: chiefComplaint || undefined,
        mlcCase,
        injuryType: injuryType || undefined,
        broughtBy: broughtBy || undefined,
        familyPhone: familyPhone || undefined,
        esiLevel: triageMode === 'esi' ? Number(esiLevel) : triageMode === 'guided' ? guidedEsiLevel : undefined,
        triageLevel: triageMode === 'colour' ? triageLevel : undefined,
        triageInputs: triageMode === 'guided'
          ? { answers: guidedTriage, vitals: parsedVitals, ageYears, ...(assessment.upTriageSuggested ? { upTriage } : {}) }
          : undefined,
        // Picking an ESI level directly IS the clinician's decision; the guided path needs the explicit confirmation above.
        triageConfirmed: triageMode === 'esi' ? true : triageMode === 'guided' ? triageConfirmed : undefined,
      });
      const json = res.data;
      if (!json.success) {
        toast({ title: 'Registration failed', description: json.message, variant: 'destructive' });
        return;
      }
      toast({
        title: 'Patient registered',
        description: json.tempId ? `Temp ID: ${json.tempId}` : `Record #${json.data?.id}`,
      });
      navigate('/hospital/er/queue');
    } catch (e: any) {
      toast({
        title: 'Registration failed',
        description: e?.response?.data?.message || 'Network error — patient was NOT registered. Please retry.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <HospitalLayout title="ER Rapid Registration" subtitle="Works with unknown or unconscious patients">
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Siren className="h-6 w-6 text-red-500" /> ER Rapid Registration
        </h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Patient Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="patientId">Existing Patient ID (leave blank if unknown)</Label>
                <Input id="patientId" value={patientId} onChange={e => setPatientId(e.target.value)} placeholder="e.g. 1042" />
              </div>
              <div>
                <Label htmlFor="patientName">Patient Name</Label>
                <Input id="patientName" value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Unknown" />
              </div>
              <div>
                <Label htmlFor="age">Age</Label>
                <Input id="age" type="number" value={age} onChange={e => setAge(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="gender">Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger id="gender"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="broughtBy">Brought By</Label>
                <Input id="broughtBy" value={broughtBy} onChange={e => setBroughtBy(e.target.value)} placeholder="Ambulance / Family / Police / Bystander" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Incident</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="chiefComplaint">Chief Complaint</Label>
              <Textarea id="chiefComplaint" value={chiefComplaint} onChange={e => setChiefComplaint(e.target.value)} rows={2} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="injuryType">Injury Type (if applicable)</Label>
                <Input id="injuryType" value={injuryType} onChange={e => setInjuryType(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="familyPhone">Family Contact Phone</Label>
                <Input id="familyPhone" value={familyPhone} onChange={e => setFamilyPhone(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="mlcCase" checked={mlcCase} onCheckedChange={(v) => setMlcCase(v === true)} />
              <Label htmlFor="mlcCase" className="cursor-pointer">Medico-Legal Case (MLC)</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Triage Decision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-500">
              A first-look colour tag is a queue-ordering hint only, not a reviewed assessment — a nurse still
              needs to confirm a real ESI level before the patient counts as triaged. If unsure, register now
              and triage at the bedside from the ER Queue screen.
            </p>
            <div className="flex flex-wrap gap-2">
              {(['none', 'esi', 'guided', 'colour'] as TriageMode[]).map(mode => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={triageMode === mode ? 'default' : 'outline'}
                  onClick={() => setTriageMode(mode)}
                >
                  {mode === 'none' ? 'Triage at bedside' : mode === 'esi' ? 'Assign ESI now' : mode === 'guided' ? 'Guided ESI' : 'Colour hint only'}
                </Button>
              ))}
            </div>

            {triageMode === 'esi' && (
              <Select value={esiLevel} onValueChange={setEsiLevel}>
                <SelectTrigger><SelectValue placeholder="Select ESI level" /></SelectTrigger>
                <SelectContent>
                  {ESI_OPTIONS.map(o => (
                    <SelectItem key={o.level} value={String(o.level)}>{o.label} — {o.hint}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {triageMode === 'guided' && (
              <div className="space-y-2">
                {guidedQuestion('immediateLifeThreat', 'Does the patient need immediate life-saving intervention?', guidedTriage.immediateLifeThreat, (value) => setGuidedTriage((prev) => ({ ...prev, immediateLifeThreat: value })))}
                {guidedQuestion('highRiskDistress', 'Is there high-risk severe distress or altered mental status?', guidedTriage.highRiskDistress, (value) => setGuidedTriage((prev) => ({ ...prev, highRiskDistress: value })))}
                {guidedQuestion('multipleResources', 'Will the patient need two or more ED resources?', guidedTriage.multipleResources, (value) => setGuidedTriage((prev) => ({ ...prev, multipleResources: value })))}
                {guidedQuestion('oneResource', 'Will the patient need one ED resource?', guidedTriage.oneResource, (value) => setGuidedTriage((prev) => ({ ...prev, oneResource: value })))}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div>
                    <Label htmlFor="g-hr" className="text-xs">Heart rate (/min)</Label>
                    <Input id="g-hr" type="number" inputMode="numeric" value={vitals.heartRate} onChange={(e) => setVitals((v) => ({ ...v, heartRate: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="g-rr" className="text-xs">Resp. rate (/min)</Label>
                    <Input id="g-rr" type="number" inputMode="numeric" value={vitals.respiratoryRate} onChange={(e) => setVitals((v) => ({ ...v, respiratoryRate: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="g-spo2" className="text-xs">SpO₂ (%)</Label>
                    <Input id="g-spo2" type="number" inputMode="numeric" value={vitals.spo2} onChange={(e) => setVitals((v) => ({ ...v, spo2: e.target.value }))} />
                  </div>
                </div>
                {assessment.ageAssumedAdult && (
                  <p className="text-xs text-amber-700">Age not entered — adult (strictest) vital-sign limits are being used. Enter the patient's age above.</p>
                )}
                {assessment.vitalsMissingForEsi3 && (
                  <p className="text-xs text-amber-700">ESI-3: record vital signs so danger-zone values are not missed.</p>
                )}
                {assessment.upTriageSuggested && (
                  <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-2" role="alert">
                    <p className="text-sm font-semibold text-red-800">Danger-zone vitals — consider ESI-2</p>
                    <ul className="text-xs text-red-700 list-disc pl-4">{assessment.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant={upTriage.decision === 'accepted' ? 'default' : 'outline'} onClick={() => setUpTriage({ decision: 'accepted', reason: '' })}>Assign ESI-2</Button>
                      <Button type="button" size="sm" variant={upTriage.decision === 'declined' ? 'default' : 'outline'} onClick={() => setUpTriage((u) => ({ ...u, decision: 'declined' }))}>Keep ESI-3</Button>
                    </div>
                    {upTriage.decision === 'declined' && (
                      <Input placeholder="Reason for keeping ESI-3 (required)" value={upTriage.reason} onChange={(e) => setUpTriage((u) => ({ ...u, reason: e.target.value }))} />
                    )}
                  </div>
                )}
                <p className="text-sm font-medium text-slate-700">Guided result: ESI-{guidedEsiLevel}</p>
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <Checkbox id="guided-confirm" checked={triageConfirmed} onCheckedChange={(v) => setTriageConfirmed(v === true)} />
                  <Label htmlFor="guided-confirm" className="cursor-pointer text-sm">I have reviewed this triage and confirm ESI-{guidedEsiLevel}.</Label>
                </div>
                <p className="text-xs text-slate-500">Decision support only — pending medical-director approval. The clinician's judgement always prevails.</p>
              </div>
            )}

            {triageMode === 'colour' && (
              <Select value={triageLevel} onValueChange={setTriageLevel}>
                <SelectTrigger><SelectValue placeholder="Select colour" /></SelectTrigger>
                <SelectContent>
                  {COLOUR_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate('/hospital/er/queue')} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-red-600 hover:bg-red-700 text-white gap-1.5">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Register Patient
          </Button>
        </div>
      </div>
    </HospitalLayout>
  );
}
