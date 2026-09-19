/**
 * Specialty OT Panel — data entry of implant / lens details for an operative note
 * and the post-op follow-up plan for the OT booking.
 *
 * Backend: /api/specialty-ot (server/routes/specialty-ot-extensions.route.js)
 * Note lookup: GET /api/v1/ot/:otBookingId/operative-note
 *
 * Data entry only — no clinical advice, dosing or suggested values. All fields
 * start empty unless a value was previously saved on the note.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

export type SpecialtyKey = 'ophthalmology' | 'cardiac' | 'orthopaedic';

type OperativeNote = {
  id: number;
  status?: string;
  patient_id?: number | string | null;
  procedure_name?: string;
  patient_name?: string | null;
  note_data?: Record<string, any> | null;
};

type FollowUp = {
  id: number;
  followup_type: 'day1' | 'week1' | 'month1' | string;
  due_date: string;
  status: 'pending' | 'booked' | 'completed' | 'missed' | string;
  notes?: string | null;
};

const FOLLOWUP_LABEL: Record<string, string> = { day1: 'Day 1', week1: 'Week 1', month1: 'Month 1' };
const STATUS_OPTIONS = ['pending', 'booked', 'completed', 'missed'] as const;

const errMsg = (e: any) => e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Request failed';
const fmtDate = (d: string) => (d ? String(d).slice(0, 10) : '—');

type FieldDef = { key: string; label: string; multiline?: boolean };

const SECTIONS: { key: SpecialtyKey; title: string; endpoint: string; noteKey: string; fields: FieldDef[] }[] = [
  {
    key: 'ophthalmology',
    title: 'Ophthalmology (IOL)',
    endpoint: 'ophthalmology',
    noteKey: 'ophthalmology',
    fields: [
      { key: 'iolPower', label: 'IOL power' },
      { key: 'iolModel', label: 'IOL model' },
      { key: 'iolLotNumber', label: 'IOL lot number' },
    ],
  },
  {
    key: 'cardiac',
    title: 'Cardiac',
    endpoint: 'cardiac',
    noteKey: 'cardiacSurgery',
    fields: [
      { key: 'procedureType', label: 'Procedure type' },
      { key: 'graftVessels', label: 'Graft vessels' },
      { key: 'stentType', label: 'Stent type' },
      { key: 'stentSize', label: 'Stent size' },
      { key: 'anticoagulationPlan', label: 'Anticoagulation plan', multiline: true },
    ],
  },
  {
    key: 'orthopaedic',
    title: 'Orthopaedic',
    endpoint: 'orthopaedic',
    noteKey: 'orthopaedicImplant',
    fields: [
      { key: 'jointReplaced', label: 'Joint replaced' },
      { key: 'implantManufacturer', label: 'Implant manufacturer' },
      { key: 'implantModel', label: 'Implant model' },
      { key: 'implantSize', label: 'Implant size' },
    ],
  },
];

function SpecialtySection({
  def, note, open, onOpenChange, onSaved,
}: {
  def: (typeof SECTIONS)[number];
  note: OperativeNote;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const saved = (note.note_data?.[def.noteKey] ?? {}) as Record<string, any>;
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const isDraft = (note.status || 'draft') === 'draft';

  useEffect(() => {
    const next: Record<string, string> = {};
    def.fields.forEach((f) => { next[f.key] = saved[f.key] != null ? String(saved[f.key]) : ''; });
    setValues(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id, note.note_data]);

  const save = async () => {
    const body: Record<string, string> = {};
    def.fields.forEach((f) => {
      const v = (values[f.key] ?? '').trim();
      if (v) body[f.key] = v;
    });
    if (Object.keys(body).length === 0) {
      toast({ title: 'Nothing to save', description: 'Enter at least one field.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await api.post(`/specialty-ot/notes/${note.id}/${def.endpoint}`, body);
      toast({ title: `${def.title} details saved` });
      onSaved();
    } catch (e: any) {
      toast({ title: `Could not save ${def.title} details`, description: errMsg(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const hasSaved = Object.keys(saved).some((k) => k !== 'recordedAt');

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="border rounded-lg">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {def.title}
          {hasSaved && <Badge variant="outline" className="text-[10px]">Recorded</Badge>}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {def.fields.map((f) => (
            <div key={f.key} className={f.multiline ? 'sm:col-span-2' : ''}>
              <Label htmlFor={`sot-${def.key}-${f.key}`}>{f.label}</Label>
              {f.multiline ? (
                <Textarea
                  id={`sot-${def.key}-${f.key}`}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                  disabled={!isDraft}
                />
              ) : (
                <Input
                  id={`sot-${def.key}-${f.key}`}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                  disabled={!isDraft}
                />
              )}
            </div>
          ))}
        </div>
        {!isDraft && (
          <p className="mt-3 text-xs text-muted-foreground">
            This operative note is signed; specialty fields can only be added to a draft note.
          </p>
        )}
        {saved.recordedAt && (
          <p className="mt-3 text-xs text-muted-foreground">Last recorded {new Date(saved.recordedAt).toLocaleString()}</p>
        )}
        <div className="mt-3">
          <Button size="sm" onClick={save} disabled={saving || !isDraft}>{saving ? 'Saving...' : 'Save details'}</Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function FollowUpSection({ otBookingId, note }: { otBookingId: number; note: OperativeNote | null }) {
  const { toast } = useToast();
  const [plan, setPlan] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patientId, setPatientId] = useState('');
  const [surgeryDate, setSurgeryDate] = useState('');
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/specialty-ot/bookings/${otBookingId}/followup-plan`);
      const data = res.data?.data ?? res.data;
      setPlan(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [otBookingId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (note?.patient_id != null) setPatientId(String(note.patient_id));
  }, [note?.patient_id]);

  const generate = async () => {
    if (!patientId.trim() || !surgeryDate) {
      toast({ title: 'Patient ID and surgery date are required', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      await api.post(`/specialty-ot/bookings/${otBookingId}/followup-plan`, {
        patientId: Number(patientId),
        surgeryDate,
      });
      toast({ title: 'Follow-up plan generated' });
      load();
    } catch (e: any) {
      toast({ title: 'Could not generate follow-up plan', description: errMsg(e), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const setStatus = async (id: number, status: string) => {
    try {
      await api.post(`/specialty-ot/followup-plan/${id}/status`, { status });
      setPlan((p) => p.map((x) => (x.id === id ? { ...x, status } : x)));
    } catch (e: any) {
      toast({ title: 'Could not update status', description: errMsg(e), variant: 'destructive' });
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold">Post-op follow-ups</h3>
      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {!loading && error && <p className="text-sm text-red-500">{error}</p>}
      {!loading && !error && plan.length === 0 && (
        <p className="text-sm text-muted-foreground">No follow-up plan recorded for this booking.</p>
      )}
      {plan.length > 0 && (
        <div className="divide-y">
          {plan.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <span className="font-medium">{FOLLOWUP_LABEL[f.followup_type] || f.followup_type}</span>
                <span className="ml-3 text-muted-foreground">Due {fmtDate(f.due_date)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{f.status}</Badge>
                <select
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                  value={f.status}
                  aria-label="Follow-up status"
                  onChange={(e) => setStatus(f.id, e.target.value)}
                >
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3 items-end pt-2 border-t">
        <div>
          <Label htmlFor="sot-fu-patient">Patient ID</Label>
          <Input id="sot-fu-patient" inputMode="numeric" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="sot-fu-date">Surgery date</Label>
          <Input id="sot-fu-date" type="date" value={surgeryDate} onChange={(e) => setSurgeryDate(e.target.value)} />
        </div>
        <Button size="sm" onClick={generate} disabled={generating}>
          {generating ? 'Generating...' : plan.length ? 'Regenerate plan' : 'Generate plan'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Creates Day 1, Week 1 and Month 1 follow-up entries counted from the surgery date. Regenerating resets their due dates.
      </p>
    </div>
  );
}

export default function SpecialtyOtPanel({
  otBookingId, specialty,
}: {
  otBookingId: number;
  specialty?: SpecialtyKey;
}) {
  const [note, setNote] = useState<OperativeNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<SpecialtyKey | null>(specialty ?? null);

  const loadNote = useCallback(async () => {
    setLoading(true);
    setNoteError(null);
    try {
      const res = await api.get(`/v1/ot/${otBookingId}/operative-note`);
      setNote(res.data?.data ?? null);
    } catch (e: any) {
      setNote(null);
      setNoteError(
        e?.response?.status === 404
          ? 'No operative note exists for this OT booking yet. Create the operative note first to record implant or lens details.'
          : errMsg(e),
      );
    } finally {
      setLoading(false);
    }
  }, [otBookingId]);

  useEffect(() => { loadNote(); }, [loadNote]);
  useEffect(() => { if (specialty) setOpenKey(specialty); }, [specialty]);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          Specialty details — OT booking #{otBookingId}
          {note?.procedure_name ? <span className="ml-2 font-normal text-muted-foreground">{note.procedure_name}</span> : null}
          {note?.patient_name ? <span className="ml-2 font-normal text-muted-foreground">· {note.patient_name}</span> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!loading && noteError && <p className="text-sm text-amber-600">{noteError}</p>}
        {!loading && note && SECTIONS.map((def) => (
          <SpecialtySection
            key={def.key}
            def={def}
            note={note}
            open={openKey === def.key}
            onOpenChange={(o) => setOpenKey(o ? def.key : null)}
            onSaved={loadNote}
          />
        ))}
        {!loading && <FollowUpSection otBookingId={otBookingId} note={note} />}
      </CardContent>
    </Card>
  );
}
