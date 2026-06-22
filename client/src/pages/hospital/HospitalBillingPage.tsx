import { useEffect, useState } from 'react';
import HospitalLayout from '@/components/layout/HospitalLayout';
import api from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ChargeRow {
  id: number;
  code: string;
  name: string;
  category: string;
  unit_price: string;
}

export default function HospitalBillingPage() {
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [clearance, setClearance] = useState<unknown>(null);
  const [admissionId, setAdmissionId] = useState('');
  const [loading, setLoading] = useState(false);

  const loadCharges = async () => {
    setLoading(true);
    try {
      const res = await api.get('/v1/charge-master/charges');
      setCharges(res.data?.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCharges(); }, []);

  const runBedDayCharge = async () => {
    const res = await api.post('/v1/charge-master/bed-day-charge/run');
    alert(JSON.stringify(res.data?.data));
  };

  const checkClearance = async () => {
    if (!admissionId) return;
    const res = await api.get(`/v1/charge-master/clearance/${admissionId}`);
    setClearance(res.data?.data);
  };

  return (
    <HospitalLayout title="IP Billing">
      <div className="space-y-6 p-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Charge Master (GAP-BIL-001)</CardTitle>
            <Button onClick={runBedDayCharge} variant="outline">Run bed-day charge</Button>
          </CardHeader>
          <CardContent>
            {loading ? <p>Loading…</p> : (
              <table className="w-full text-sm">
                <thead><tr><th className="text-left p-2">Code</th><th>Name</th><th>Category</th><th>Price</th></tr></thead>
                <tbody>
                  {charges.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="p-2">{c.code}</td>
                      <td>{c.name}</td>
                      <td>{c.category}</td>
                      <td>{c.unit_price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Discharge billing clearance (GAP-BIL-003)</CardTitle></CardHeader>
          <CardContent className="flex gap-2 items-end">
            <input className="border rounded px-3 py-2" placeholder="Admission ID" value={admissionId} onChange={(e) => setAdmissionId(e.target.value)} />
            <Button onClick={checkClearance}>Check</Button>
            {clearance && <pre className="text-xs mt-4 bg-slate-100 p-3 rounded w-full overflow-auto">{JSON.stringify(clearance, null, 2)}</pre>}
          </CardContent>
        </Card>
      </div>
    </HospitalLayout>
  );
}
