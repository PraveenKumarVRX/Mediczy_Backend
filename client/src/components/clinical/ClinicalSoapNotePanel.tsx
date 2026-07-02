/**
 * Reusable SOAP clinical note editor — doctor portal + HMIS inpatient.
 */
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Save, FileSignature, Search } from 'lucide-react';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

export type SoapNote = {
  id?: number;
  patientId?: number;
  admissionId?: number;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  chiefComplaint?: string;
  icd10Codes?: Array<{ code: string; description: string }>;
  cptCodes?: Array<{ code: string; description: string }>;
  encounterSummary?: string;
  status?: string;
  signedAt?: string;
};

type Props = {
  patientId: number;
  admissionId?: number;
  noteType?: string;
  apiBase?: 'doctor' | 'hospital';
  initialNote?: SoapNote | null;
  onSaved?: (note: SoapNote) => void;
};

const apiPrefix = (base: 'doctor' | 'hospital') =>
  base === 'hospital' ? '/hospital/clinical-notes' : '/doctor/clinical-workflow';

export default function ClinicalSoapNotePanel({
  patientId,
  admissionId,
  noteType = 'progress_note',
  apiBase = 'doctor',
  initialNote = null,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const prefix = apiPrefix(apiBase);
  const [note, setNote] = useState<SoapNote>({
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
    icd10Codes: [],
    cptCodes: [],
    ...initialNote,
  });
  const [icd10Search, setIcd10Search] = useState('');
  const [cptSearch, setCptSearch] = useState('');
  const [icd10Results, setIcd10Results] = useState<any[]>([]);
  const [cptResults, setCptResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);

  const isSigned = note.status === 'signed';

  useEffect(() => {
    if (initialNote) setNote({ icd10Codes: [], cptCodes: [], ...initialNote });
  }, [initialNote?.id]);

  const searchICD10 = async (query: string) => {
    if (query.length < 2 || apiBase === 'hospital') return;
    try {
      const { data } = await api.get(`${prefix}/icd10/search?q=${encodeURIComponent(query)}`);
      setIcd10Results(data.data || []);
    } catch {
      setIcd10Results([]);
    }
  };

  const searchCPT = async (query: string) => {
    if (query.length < 2 || apiBase === 'hospital') return;
    try {
      const { data } = await api.get(`${prefix}/cpt/search?q=${encodeURIComponent(query)}`);
      setCptResults(data.data || []);
    } catch {
      setCptResults([]);
    }
  };

  const saveNote = async () => {
    setLoading(true);
    try {
      const payload = {
        ...note,
        patientId,
        admissionId,
        noteType,
      };
      if (note.id) {
        const { data } = await api.put(`${prefix}/notes/${note.id}`, payload);
        setNote(data.data);
        toast({ title: 'Note updated' });
        onSaved?.(data.data);
      } else {
        const { data } = await api.post(`${prefix}/notes`, payload);
        setNote(data.data);
        toast({ title: 'Note saved' });
        onSaved?.(data.data);
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e?.response?.data?.message || e.message });
    } finally {
      setLoading(false);
    }
  };

  const signNote = async () => {
    if (!note.id) return;
    setLoading(true);
    try {
      const { data } = await api.post(`${prefix}/notes/${note.id}/sign`);
      setNote(data.data);
      toast({ title: 'Note signed' });
      onSaved?.(data.data);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Sign failed', description: e?.response?.data?.message });
    } finally {
      setLoading(false);
    }
  };

  const generateAISummary = async () => {
    if (!note.id) return;
    setAiSummaryLoading(true);
    try {
      const { data } = await api.post(`${prefix}/notes/${note.id}/generate-summary`);
      setNote((n) => ({ ...n, encounterSummary: data.data?.encounterSummary }));
    } catch {
      toast({ variant: 'destructive', title: 'AI summary unavailable' });
    } finally {
      setAiSummaryLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>SOAP Progress Note</span>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={generateAISummary} disabled={!note.id || aiSummaryLoading || isSigned}>
              <Sparkles className="h-4 w-4 mr-1" />
              {aiSummaryLoading ? 'Generating…' : 'AI Summary'}
            </Button>
            <Button size="sm" onClick={saveNote} disabled={loading || isSigned}>
              <Save className="h-4 w-4 mr-1" /> Save
            </Button>
            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={signNote} disabled={!note.id || isSigned || loading}>
              <FileSignature className="h-4 w-4 mr-1" /> Sign
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Chief complaint / subject</Label>
          <Input
            className="mt-1"
            value={note.chiefComplaint || ''}
            onChange={(e) => setNote({ ...note, chiefComplaint: e.target.value })}
            disabled={isSigned}
          />
        </div>
        {(['subjective', 'objective', 'assessment', 'plan'] as const).map((field) => (
          <div key={field}>
            <Label className="capitalize">{field === 'subjective' ? 'S — Subjective' : field === 'objective' ? 'O — Objective' : field === 'assessment' ? 'A — Assessment' : 'P — Plan'}</Label>
            <Textarea
              className="mt-1 min-h-[90px]"
              value={note[field] || ''}
              onChange={(e) => setNote({ ...note, [field]: e.target.value })}
              disabled={isSigned}
            />
          </div>
        ))}

        {apiBase === 'doctor' && (
          <>
            <div>
              <Label>ICD-10</Label>
              <div className="relative mt-1">
                <Input
                  placeholder="Search ICD-10…"
                  value={icd10Search}
                  onChange={(e) => { setIcd10Search(e.target.value); searchICD10(e.target.value); }}
                  disabled={isSigned}
                />
                {icd10Results.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {icd10Results.map((r) => (
                      <button key={r.code} type="button" className="w-full text-left p-2 hover:bg-slate-50 text-sm border-b"
                        onClick={() => {
                          if (!note.icd10Codes?.some((c) => c.code === r.code)) {
                            setNote({ ...note, icd10Codes: [...(note.icd10Codes || []), r] });
                          }
                          setIcd10Search('');
                          setIcd10Results([]);
                        }}>
                        <span className="font-medium">{r.code}</span> — {r.description}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {note.icd10Codes?.map((c) => (
                  <Badge key={c.code} variant="secondary">{c.code}</Badge>
                ))}
              </div>
            </div>
            <div>
              <Label>CPT</Label>
              <div className="relative mt-1">
                <Input
                  placeholder="Search CPT…"
                  value={cptSearch}
                  onChange={(e) => { setCptSearch(e.target.value); searchCPT(e.target.value); }}
                  disabled={isSigned}
                />
                {cptResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {cptResults.map((r) => (
                      <button key={r.code} type="button" className="w-full text-left p-2 hover:bg-slate-50 text-sm border-b"
                        onClick={() => {
                          if (!note.cptCodes?.some((c) => c.code === r.code)) {
                            setNote({ ...note, cptCodes: [...(note.cptCodes || []), r] });
                          }
                          setCptSearch('');
                          setCptResults([]);
                        }}>
                        <span className="font-medium">{r.code}</span> — {r.description}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {note.encounterSummary && (
          <div className="p-3 bg-violet-50 border border-violet-200 rounded-lg text-sm whitespace-pre-wrap">
            {note.encounterSummary}
          </div>
        )}
        {isSigned && (
          <p className="text-sm text-green-700 flex items-center gap-2">
            <FileSignature className="h-4 w-4" />
            Signed {note.signedAt ? new Date(note.signedAt).toLocaleString() : ''}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
