import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Save, FileSignature, Search } from 'lucide-react';
import axios from 'axios';

interface ClinicalNote {
  id: number;
  appointmentId: number;
  patientName: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  icd10Codes: Array<{ code: string; description: string }>;
  cptCodes: Array<{ code: string; description: string }>;
  encounterSummary?: string;
  isSigned: boolean;
  signedAt?: string;
}

export default function ClinicalWorkflowPanel() {
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [note, setNote] = useState<Partial<ClinicalNote>>({
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
    icd10Codes: [],
    cptCodes: []
  });
  const [icd10Search, setIcd10Search] = useState('');
  const [cptSearch, setCptSearch] = useState('');
  const [icd10Results, setIcd10Results] = useState<any[]>([]);
  const [cptResults, setCptResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);

  const searchICD10 = async (query: string) => {
    if (query.length < 2) return;
    try {
      const token = localStorage.getItem('doctorToken');
      const { data } = await axios.get(`/api/doctor/clinical-workflow/icd10/search?q=${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setIcd10Results(data.data);
    } catch (error) {
      console.error('ICD-10 search failed:', error);
    }
  };

  const searchCPT = async (query: string) => {
    if (query.length < 2) return;
    try {
      const token = localStorage.getItem('doctorToken');
      const { data } = await axios.get(`/api/doctor/clinical-workflow/cpt/search?q=${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCptResults(data.data);
    } catch (error) {
      console.error('CPT search failed:', error);
    }
  };

  const addICD10Code = (code: any) => {
    if (!note.icd10Codes?.some(c => c.code === code.code)) {
      setNote({
        ...note,
        icd10Codes: [...(note.icd10Codes || []), code]
      });
    }
    setIcd10Search('');
    setIcd10Results([]);
  };

  const addCPTCode = (code: any) => {
    if (!note.cptCodes?.some(c => c.code === code.code)) {
      setNote({
        ...note,
        cptCodes: [...(note.cptCodes || []), code]
      });
    }
    setCptSearch('');
    setCptResults([]);
  };

  const generateAISummary = async () => {
    if (!note.id) return;
    setAiSummaryLoading(true);
    try {
      const token = localStorage.getItem('doctorToken');
      const { data } = await axios.post(
        `/api/doctor/clinical-workflow/notes/${note.id}/generate-summary`,
        {},
        { headers: { Authorization: `Bearer ${token}` }}
      );
      setNote({ ...note, encounterSummary: data.data.encounterSummary });
    } catch (error) {
      console.error('AI summary generation failed:', error);
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const saveNote = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('doctorToken');
      if (note.id) {
        // Update existing note
        await axios.put(`/api/doctor/clinical-workflow/notes/${note.id}`, note, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        // Create new note
        const { data } = await axios.post('/api/doctor/clinical-workflow/notes', {
          ...note,
          appointmentId: selectedPatientId // You'd get this from the queue/appointment
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setNote(data.data);
      }
      alert('Clinical note saved successfully');
    } catch (error) {
      console.error('Failed to save note:', error);
      alert('Failed to save note');
    } finally {
      setLoading(false);
    }
  };

  const signNote = async () => {
    if (!note.id) return;
    try {
      const token = localStorage.getItem('doctorToken');
      await axios.post(`/api/doctor/clinical-workflow/notes/${note.id}/sign`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNote({ ...note, isSigned: true, signedAt: new Date().toISOString() });
      alert('Note signed successfully');
    } catch (error) {
      console.error('Failed to sign note:', error);
      alert('Failed to sign note');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>SOAP Clinical Note</span>
            <div className="flex gap-2">
              <Button
                onClick={generateAISummary}
                disabled={!note.id || aiSummaryLoading}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                {aiSummaryLoading ? 'Generating...' : 'AI Summary'}
              </Button>
              <Button
                onClick={saveNote}
                disabled={loading}
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Save Note
              </Button>
              <Button
                onClick={signNote}
                disabled={!note.id || note.isSigned || loading}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
              >
                <FileSignature className="h-4 w-4" />
                Sign Note
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Subjective */}
          <div>
            <Label className="text-lg font-semibold">S - Subjective</Label>
            <Textarea
              placeholder="Patient's chief complaint, history of present illness, symptoms..."
              value={note.subjective}
              onChange={(e) => setNote({ ...note, subjective: e.target.value })}
              className="mt-2 min-h-[100px]"
              disabled={note.isSigned}
            />
          </div>

          {/* Objective */}
          <div>
            <Label className="text-lg font-semibold">O - Objective</Label>
            <Textarea
              placeholder="Physical examination findings, vital signs, lab results..."
              value={note.objective}
              onChange={(e) => setNote({ ...note, objective: e.target.value })}
              className="mt-2 min-h-[100px]"
              disabled={note.isSigned}
            />
          </div>

          {/* Assessment */}
          <div>
            <Label className="text-lg font-semibold">A - Assessment</Label>
            <Textarea
              placeholder="Diagnosis, differential diagnoses, clinical impression..."
              value={note.assessment}
              onChange={(e) => setNote({ ...note, assessment: e.target.value })}
              className="mt-2 min-h-[100px]"
              disabled={note.isSigned}
            />
          </div>

          {/* Plan */}
          <div>
            <Label className="text-lg font-semibold">P - Plan</Label>
            <Textarea
              placeholder="Treatment plan, medications, follow-up instructions..."
              value={note.plan}
              onChange={(e) => setNote({ ...note, plan: e.target.value })}
              className="mt-2 min-h-[100px]"
              disabled={note.isSigned}
            />
          </div>

          {/* ICD-10 Codes */}
          <div>
            <Label className="text-lg font-semibold">ICD-10 Diagnosis Codes</Label>
            <div className="relative mt-2">
              <Input
                placeholder="Search ICD-10 codes..."
                value={icd10Search}
                onChange={(e) => {
                  setIcd10Search(e.target.value);
                  searchICD10(e.target.value);
                }}
                disabled={note.isSigned}
              />
              {icd10Results.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {icd10Results.map((result) => (
                    <div
                      key={result.code}
                      onClick={() => addICD10Code(result)}
                      className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                    >
                      <div className="font-semibold">{result.code}</div>
                      <div className="text-sm text-gray-600">{result.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {note.icd10Codes?.map((code) => (
                <Badge key={code.code} variant="secondary" className="text-sm">
                  {code.code} - {code.description}
                  {!note.isSigned && (
                    <button
                      onClick={() => setNote({
                        ...note,
                        icd10Codes: note.icd10Codes?.filter(c => c.code !== code.code)
                      })}
                      className="ml-2 text-red-600 hover:text-red-800"
                    >
                      ×
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          </div>

          {/* CPT Codes */}
          <div>
            <Label className="text-lg font-semibold">CPT Procedure Codes</Label>
            <div className="relative mt-2">
              <Input
                placeholder="Search CPT codes..."
                value={cptSearch}
                onChange={(e) => {
                  setCptSearch(e.target.value);
                  searchCPT(e.target.value);
                }}
                disabled={note.isSigned}
              />
              {cptResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {cptResults.map((result) => (
                    <div
                      key={result.code}
                      onClick={() => addCPTCode(result)}
                      className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                    >
                      <div className="font-semibold">{result.code}</div>
                      <div className="text-sm text-gray-600">{result.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {note.cptCodes?.map((code) => (
                <Badge key={code.code} variant="secondary" className="text-sm">
                  {code.code} - {code.description}
                  {!note.isSigned && (
                    <button
                      onClick={() => setNote({
                        ...note,
                        cptCodes: note.cptCodes?.filter(c => c.code !== code.code)
                      })}
                      className="ml-2 text-red-600 hover:text-red-800"
                    >
                      ×
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          </div>

          {/* AI-Generated Encounter Summary */}
          {note.encounterSummary && (
            <div className="border-t pt-4">
              <Label className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                AI-Generated Encounter Summary
              </Label>
              <div className="mt-2 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-sm whitespace-pre-wrap">{note.encounterSummary}</p>
              </div>
            </div>
          )}

          {/* Signature Status */}
          {note.isSigned && (
            <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
              <FileSignature className="h-5 w-5 text-green-600" />
              <span className="text-sm text-green-800">
                Note signed on {note.signedAt ? new Date(note.signedAt).toLocaleString() : 'N/A'}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
