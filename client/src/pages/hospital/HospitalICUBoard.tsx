import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import api from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HeartPulse, RefreshCw } from 'lucide-react';

export default function HospitalICUBoard() {
  const navigate = useNavigate();
  const [census, setCensus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/v1/icu/census').catch(() => api.get('/hospital/practice/icu/portal-data'));
        const data = res.data?.data;
        setCensus(Array.isArray(data) ? data : data?.patients ?? []);
      } catch { setCensus([]); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <HospitalLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2"><HeartPulse className="h-6 w-6 text-purple-600" /> ICU Command Board</h1>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {census.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-slate-500">
              <p>No ICU census data — open full ICU portal for advanced monitoring.</p>
              <Button className="mt-4" variant="outline" onClick={() => navigate('/icu/dashboard')}>ICU Portal</Button>
              <Button className="mt-4 ml-2" variant="outline" onClick={() => navigate('/display/icu-board')}>ICU Display</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {census.map((p: any, i: number) => (
              <Card key={p.id || i}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex justify-between">
                    {p.patient_name || p.name || `Patient ${i + 1}`}
                    <Badge className="bg-purple-100 text-purple-700">{p.acuity || 'Critical'}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-slate-600">
                  Bed {p.bed_number || '—'} · Vent {p.ventilator ? 'Yes' : 'No'}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </HospitalLayout>
  );
}
