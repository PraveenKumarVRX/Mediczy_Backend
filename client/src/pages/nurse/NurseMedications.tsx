import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Pill, Activity, ArrowLeft } from 'lucide-react';
import api from '@/utils/api';

const NurseMedications: React.FC = () => {
  const navigate = useNavigate();
  const [patientId, setPatientId] = useState('');
  const [medication, setMedication] = useState('');
  const [dosage, setDosage] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<any[]>([]);

  const loadHistory = async (pid: string) => {
    if (!pid) return;
    try {
      const token = localStorage.getItem('nurseToken');
      const { data } = await api.get(`/nurse/medications/${pid}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data.success) setHistory(data.records || []);
    } catch (e) {
      console.error('Load medication history error:', e);
    }
  };

  useEffect(() => {
    if (patientId) loadHistory(patientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const token = localStorage.getItem('nurseToken');
      const { data } = await api.post('/nurse/medications', {
        patientId,
        medication: medication,
        dosage,
        route: undefined,
        frequency: undefined,
        notes
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data.success) {
        setMessage('Medication record saved');
        setMedication('');
        setDosage('');
        setNotes('');
        loadHistory(patientId);
      } else {
        setMessage('Failed to save medication');
      }
    } catch (e: any) {
      setMessage(e.response?.data?.message || 'Error saving medication');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2"><Pill className="h-5 w-5" /> Medications</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => navigate('/nurse/dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to dashboard
        </Button>
      </CardHeader>
      <CardContent>
        {message && <p className="text-green-600 text-sm mb-3">{message}</p>}
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="patientId">Patient ID</Label>
            <Input id="patientId" value={patientId} onChange={e => setPatientId(e.target.value)} required />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="medication">Medication</Label>
              <Input id="medication" value={medication} onChange={e => setMedication(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dosage">Dosage</Label>
              <Input id="dosage" value={dosage} onChange={e => setDosage(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Administration Notes</Label>
            <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? <><Activity className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : 'Save Medication'}
          </Button>
        </form>

        {history.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium mb-2">Recent Administrations</h3>
            <div className="space-y-2">
              {history.slice(0, 5).map((h) => (
                <div key={h.id} className="text-xs text-muted-foreground">
                  {new Date(h.administeredAt).toLocaleString()} • {h.medicationName}{h.dosage ? ` ${h.dosage}` : ''}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NurseMedications;
