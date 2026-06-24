import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import api from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, ArrowRightLeft } from 'lucide-react';

export default function HospitalADTTransfer() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ admissionId: '1', toBedId: '', reason: 'Clinical upgrade' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/v1/adt/transfer', {
        admissionId: parseInt(form.admissionId),
        toBedId: form.toBedId ? parseInt(form.toBedId) : undefined,
        reason: form.reason,
      });
      if (res.data?.success) setSuccess(true);
      else setError(res.data?.message || 'Transfer failed');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Transfer failed');
    } finally { setLoading(false); }
  };

  if (success) {
    return (
      <HospitalLayout>
        <div className="p-6 max-w-md mx-auto text-center space-y-4">
          <h2 className="text-xl font-bold text-emerald-700">Transfer recorded</h2>
          <Button onClick={() => navigate('/hospital/ward')}>Back to Ward</Button>
        </div>
      </HospitalLayout>
    );
  }

  return (
    <HospitalLayout>
      <div className="p-6 max-w-lg mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <h1 className="text-xl font-bold flex items-center gap-2"><ArrowRightLeft className="h-5 w-5 text-amber-600" /> Transfer Patient</h1>
        <Card>
          <CardHeader><CardTitle className="text-base">Bed / ward transfer</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div><Label>Admission ID</Label><Input value={form.admissionId} onChange={e => setForm(f => ({ ...f, admissionId: e.target.value }))} /></div>
              <div><Label>To Bed ID (optional)</Label><Input placeholder="e.g. 3 for GEN-13" value={form.toBedId} onChange={e => setForm(f => ({ ...f, toBedId: e.target.value }))} /></div>
              <div><Label>Reason</Label><Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} /></div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700" disabled={loading}>{loading ? 'Transferring…' : 'Confirm Transfer'}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </HospitalLayout>
  );
}
