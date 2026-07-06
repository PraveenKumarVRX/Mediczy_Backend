import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { listReferrals, acceptReferral } from '@/services/careos.service';

export default function ReferralNetwork() {
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    listReferrals()
      .then((r) => setReferrals(r?.data || []))
      .catch(() => setReferrals([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const accept = async (id: number) => {
    await acceptReferral(id);
    load();
  };

  return (
    <HospitalLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold">Referral Network</h1>
        </div>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <div className="space-y-3">
            {referrals.map((ref: any) => (
              <Card key={ref.id}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Patient #{ref.patient_id}</CardTitle>
                  <Badge>{ref.status || 'pending'}</Badge>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p>{ref.reason || ref.clinical_summary}</p>
                  <p className="text-muted-foreground">Urgency: {ref.urgency || 'routine'}</p>
                  {ref.status === 'pending' && (
                    <Button size="sm" onClick={() => accept(ref.id)}>Accept referral</Button>
                  )}
                </CardContent>
              </Card>
            ))}
            {!referrals.length && <p className="text-muted-foreground">No active referrals</p>}
          </div>
        )}
      </div>
    </HospitalLayout>
  );
}
