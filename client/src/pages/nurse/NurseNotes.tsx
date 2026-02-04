import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Activity, ArrowLeft } from 'lucide-react';
import api from '@/utils/api';

interface PatientOption {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
}

const NurseNotes: React.FC = () => {
  const navigate = useNavigate();
  const [patientId, setPatientId] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientsError, setPatientsError] = useState('');

  const loadPatients = async () => {
    setPatientsLoading(true);
    setPatientsError('');
    try {
      const token = localStorage.getItem('nurseToken');
      const { data } = await api.get('/nurse/patients', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data.success) {
        setPatients(data.patients || []);
      } else {
        setPatientsError('Unable to load patients list');
      }
    } catch (e: any) {
      setPatientsError(e.response?.data?.message || 'Unable to load patients list');
    } finally {
      setPatientsLoading(false);
    }
  };

  const loadHistory = async (pid: string) => {
    if (!pid) return;
    try {
      const token = localStorage.getItem('nurseToken');
      const { data } = await api.get(`/nurse/notes/${pid}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data.success) setHistory(data.records || []);
    } catch (e) {
      console.error('Load notes history error:', e);
    }
  };

  useEffect(() => {
    if (patientId) loadHistory(patientId);
  }, [patientId]);

  useEffect(() => {
    loadPatients();
  }, []);

  const getPatientLabel = (patient: PatientOption) => {
    const name =
      patient.name ||
      `${patient.firstName || ''} ${patient.lastName || ''}`.trim() ||
      `Patient ${patient.id}`;
    return `${name} (ID: ${patient.id})`;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const token = localStorage.getItem('nurseToken');
      const { data } = await api.post('/nurse/notes', {
        patientId,
        note
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data.success) {
        setMessage('Note saved');
        setNote('');
        loadHistory(patientId);
      } else {
        setMessage('Failed to save note');
      }
    } catch (e: any) {
      setMessage(e.response?.data?.message || 'Error saving note');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Notes</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => navigate('/nurse/dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to dashboard
        </Button>
      </CardHeader>
      <CardContent>
        {message && <p className="text-green-600 text-sm mb-3">{message}</p>}
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Patient</Label>
            <Select value={patientId} onValueChange={setPatientId} disabled={patientsLoading || patients.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={patientsLoading ? 'Loading patients...' : 'Select a patient'} />
              </SelectTrigger>
              <SelectContent>
                {patients.map((patient) => (
                  <SelectItem key={patient.id} value={String(patient.id)}>
                    {getPatientLabel(patient)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {patientsError && <p className="text-xs text-red-600">{patientsError}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="patientId">Patient ID (manual)</Label>
            <Input id="patientId" value={patientId} onChange={e => setPatientId(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Care Note</Label>
            <Textarea id="note" value={note} onChange={e => setNote(e.target.value)} rows={4} placeholder="Enter observation or care update..." />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? <><Activity className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : 'Save Note'}
          </Button>
        </form>

        {history.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium mb-2">Recent Notes</h3>
            <div className="space-y-2">
              {history.slice(0, 5).map((h) => (
                <div key={h.id} className="text-xs text-muted-foreground">
                  {new Date(h.createdAt).toLocaleString()} • {(h.content || h.note || '').slice(0, 80)}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NurseNotes;
