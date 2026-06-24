import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import api from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pill, RefreshCw } from 'lucide-react';

export default function HospitalPharmacyDispense() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/v1/pharmacy-dispense/pending');
        setQueue(res.data?.data ?? []);
      } catch { setQueue([]); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <HospitalLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Pill className="h-6 w-6 text-green-600" /> IP Pharmacy Dispense</h1>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {queue.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-slate-500">
            <p>No pending dispense orders.</p>
            <Button className="mt-4" variant="outline" onClick={() => navigate('/pharmacy/dashboard')}>Pharmacy Portal</Button>
          </CardContent></Card>
        ) : queue.map((q: any) => (
          <Card key={q.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex justify-between">
                {q.drug_name || q.medicationName}
                <Badge>{q.status || 'pending'}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              Patient {q.patient_id} · {q.dose} · {q.route}
            </CardContent>
          </Card>
        ))}
      </div>
    </HospitalLayout>
  );
}
