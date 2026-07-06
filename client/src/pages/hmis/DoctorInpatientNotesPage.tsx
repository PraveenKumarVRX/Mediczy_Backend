/**
 * Doctor IPD bedside progress notes — SOAP + history + voice scribe link.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, RefreshCw, FileText, Mic, Activity, User, Plus,
} from 'lucide-react';
import api from '@/utils/api';
import ClinicalSoapNotePanel, { type SoapNote } from '@/components/clinical/ClinicalSoapNotePanel';

type NoteRow = SoapNote & {
  note_type?: string;
  createdAt?: string;
  status?: string;
};

export default function DoctorInpatientNotesPage() {
  const { admissionId: admissionParam, patientId: patientParam } = useParams<{
    admissionId?: string;
    patientId?: string;
  }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const admissionId = admissionParam || searchParams.get('admissionId') || undefined;
  const patientId = patientParam || searchParams.get('patientId') || undefined;

  const [patientName, setPatientName] = useState('');
  const [ward, setWard] = useState('');
  const [bed, setBed] = useState('');
  const [resolvedPatientId, setResolvedPatientId] = useState<number | undefined>(
    patientId ? Number(patientId) : undefined
  );
  const [history, setHistory] = useState<NoteRow[]>([]);
  const [activeNote, setActiveNote] = useState<SoapNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiBase, setApiBase] = useState<'doctor' | 'hospital'>('doctor');

  const notesPrefix = apiBase === 'hospital' ? '/hospital/clinical-notes' : '/doctor/clinical-workflow';

  const load = useCallback(async () => {
    if (!patientId && !admissionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const hasHospital = !!localStorage.getItem('hospitalToken');
      const hasDoctor = !!localStorage.getItem('doctorToken');
      const base: 'doctor' | 'hospital' = hasDoctor ? 'doctor' : hasHospital ? 'hospital' : 'doctor';
      setApiBase(base);
      const prefix = base === 'hospital' ? '/hospital/clinical-notes' : '/doctor/clinical-workflow';

      let pid = patientId ? Number(patientId) : undefined;
      if (!pid && admissionId) {
        try {
          const adm = await api.get(`/v1/adt/admission/${admissionId}`);
          pid = adm.data?.data?.patient_id || adm.data?.data?.patientId;
        } catch { /* optional */ }
      }
      if (pid) setResolvedPatientId(pid);

      if (pid) {
        const ws = await api.get(`/v1/clinical-workspace/patient/${pid}`);
        const summary = ws.data?.data || ws.data?.workspace?.summary;
        if (summary) {
          setPatientName(summary.name || '');
          setWard(summary.ward || '');
          setBed(summary.bed || '');
        }
      }

      const histRes = admissionId
        ? await api.get(`${prefix}/notes/admission/${admissionId}`)
        : pid
          ? await api.get(`${prefix}/notes/patient/${pid}`)
          : { data: { data: [] } };
      setHistory(histRes.data?.data || []);
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [patientId, admissionId]);

  useEffect(() => { load(); }, [load]);

  const resolvedAdmissionId = admissionId ? Number(admissionId) : undefined;

  if (!resolvedPatientId && !resolvedAdmissionId) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 max-w-lg mx-auto text-center">
        <FileText className="h-12 w-12 mx-auto text-teal-600 mb-4" />
        <h1 className="text-xl font-bold mb-2">Doctor Progress Notes</h1>
        <p className="text-muted-foreground text-sm mb-4">
          Open from an inpatient workspace or use{' '}
          <code className="text-xs bg-slate-200 px-1 rounded">/hospital/admission/:id/doctor-notes</code>
        </p>
        <Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-teal-600" /> Doctor Progress Notes
            </h1>
            <p className="text-sm text-muted-foreground truncate">
              {patientName || `Patient ${resolvedPatientId}`}
              {ward && ` · ${ward}`}{bed && ` · Bed ${bed}`}
              {resolvedAdmissionId && ` · Admission #${resolvedAdmissionId}`}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/doctor/voice-scribe?docType=ipd_notes&patientId=${resolvedPatientId || ''}`}>
              <Mic className="h-4 w-4 mr-1" /> Voice Scribe
            </Link>
          </Button>
          {resolvedAdmissionId && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/hospital/admission/${resolvedAdmissionId}/echart`}>
                <Activity className="h-4 w-4 mr-1" /> Nursing e-Chart
              </Link>
            </Button>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Note history</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setActiveNote(null)}>
                <Plus className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[480px] overflow-y-auto">
              {history.length === 0 && <p className="text-xs text-muted-foreground">No notes yet</p>}
              {history.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`w-full text-left border rounded-lg p-2 text-xs hover:bg-teal-50 ${activeNote?.id === n.id ? 'border-teal-400 bg-teal-50' : ''}`}
                  onClick={() => setActiveNote({
                    id: n.id,
                    subjective: n.subjective,
                    objective: n.objective,
                    assessment: n.assessment,
                    plan: n.plan,
                    chiefComplaint: n.chiefComplaint,
                    status: n.status,
                    signedAt: n.signedAt,
                    encounterSummary: n.encounterSummary,
                    icd10Codes: n.icd10Codes,
                    cptCodes: n.cptCodes,
                  })}
                >
                  <div className="font-medium">{n.note_type || 'progress_note'}</div>
                  <div className="text-muted-foreground">
                    {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
                  </div>
                  <Badge className="mt-1 text-[10px]" variant={n.status === 'signed' ? 'default' : 'secondary'}>
                    {n.status || 'draft'}
                  </Badge>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="lg:col-span-2">
            {resolvedPatientId ? (
              <ClinicalSoapNotePanel
                key={activeNote?.id || 'new'}
                patientId={resolvedPatientId}
                admissionId={resolvedAdmissionId}
                noteType="ipd_progress_note"
                apiBase={apiBase}
                initialNote={activeNote}
                onSaved={() => { setActiveNote(null); load(); }}
              />
            ) : (
              <Card><CardContent className="p-6 text-sm text-muted-foreground">Patient ID required to author notes.</CardContent></Card>
            )}
          </div>
        </div>

        {resolvedPatientId && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/hospital/patient/${resolvedPatientId}/healthos`}>
                <User className="h-4 w-4 mr-1" /> Inpatient workspace
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
