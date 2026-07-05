import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Landmark } from 'lucide-react';
import { getGovernmentDashboard } from '@/services/careos.service';

export default function GovernmentHealthPortalPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    getGovernmentDashboard().then((r) => setData(r?.data)).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Landmark className="h-5 w-5 text-amber-700" />
        Government Health Dashboard
      </h2>
      <Card>
        <CardHeader><CardTitle className="text-base">Regional reporting</CardTitle></CardHeader>
        <CardContent><pre className="text-xs overflow-auto">{JSON.stringify(data, null, 2)}</pre></CardContent>
      </Card>
    </div>
  );
}
