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
import { EMPTY_GUIDED_TRIAGE, deriveGuidedEsi, type GuidedTriage } from '@/utils/erGuidedTriage';

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
  const guidedEsiLevel = deriveGuidedEsi(guidedTriage);

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
        triageInputs: triageMode === 'guided' ? guidedTriage : undefined,
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
                <p className="text-xs text-slate-500">Guided result: ESI-{guidedEsiLevel}. A nurse must review the result before registration.</p>
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
