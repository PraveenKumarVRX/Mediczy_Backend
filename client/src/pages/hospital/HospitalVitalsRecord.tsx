import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import api from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Activity } from 'lucide-react';

export default function HospitalVitalsRecord() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    admissionId: '1', patientId: '1',
    temperature: '37.2', pulse: '82', bpSystolic: '120', bpDiastolic: '78', spo2: '98', respiratoryRate: '16',
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await api.post('/v1/vitals', {
        admissionId: parseInt(form.admissionId),
        patientId: parseInt(form.patientId),
        temperature: parseFloat(form.temperature),
        pulse: parseInt(form.pulse),
        bpSystolic: parseInt(form.bpSystolic),
        bpDiastolic: parseInt(form.bpDiastolic),
        spo2: parseFloat(form.spo2),
        respiratoryRate: parseInt(form.respiratoryRate),
        source: 'manual',
      });
      setMsg(res.data?.success ? 'Vitals recorded successfully' : res.data?.message || 'Failed');
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to record vitals');
    } finally { setLoading(false); }
  };

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <HospitalLayout>
      <div className="p-6 max-w-lg mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <h1 className="text-xl font-bold flex items-center gap-2"><Activity className="h-5 w-5 text-teal-600" /> Record Vitals</h1>
        <Card>
          <CardHeader><CardTitle className="text-base">NEWS2 vitals entry</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Admission ID</Label><Input value={form.admissionId} onChange={e => set('admissionId', e.target.value)} /></div>
                <div><Label className="text-xs">Patient ID</Label><Input value={form.patientId} onChange={e => set('patientId', e.target.value)} /></div>
                <div><Label className="text-xs">Temp °C</Label><Input value={form.temperature} onChange={e => set('temperature', e.target.value)} /></div>
                <div><Label className="text-xs">Pulse</Label><Input value={form.pulse} onChange={e => set('pulse', e.target.value)} /></div>
                <div><Label className="text-xs">BP Sys</Label><Input value={form.bpSystolic} onChange={e => set('bpSystolic', e.target.value)} /></div>
                <div><Label className="text-xs">BP Dia</Label><Input value={form.bpDiastolic} onChange={e => set('bpDiastolic', e.target.value)} /></div>
                <div><Label className="text-xs">SpO₂ %</Label><Input value={form.spo2} onChange={e => set('spo2', e.target.value)} /></div>
                <div><Label className="text-xs">RR</Label><Input value={form.respiratoryRate} onChange={e => set('respiratoryRate', e.target.value)} /></div>
              </div>
              {msg && <p className={`text-sm ${msg.includes('success') ? 'text-emerald-600' : 'text-red-600'}`}>{msg}</p>}
              <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={loading}>{loading ? 'Saving…' : 'Save Vitals'}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </HospitalLayout>
  );
}
