import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';
import { getPopulationDashboard } from '@/services/careos.service';

export default function PopulationAnalyticsPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    getPopulationDashboard().then((r) => setData(r?.data)).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-teal-600" />
        Population Analytics
      </h2>
      <Card>
        <CardHeader><CardTitle className="text-base">Population health metrics</CardTitle></CardHeader>
        <CardContent><pre className="text-xs overflow-auto max-h-96">{JSON.stringify(data, null, 2)}</pre></CardContent>
      </Card>
    </div>
  );
}
