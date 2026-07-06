import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { analyzeWorkforce } from '@/services/hospitalOs.service';

export default function WorkforceAIPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    analyzeWorkforce('nursing').then((r) => setData(r?.data)).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Users className="h-5 w-5 text-orange-600" />
        Workforce AI (Pillar 16)
      </h2>
      <Card>
        <CardHeader><CardTitle className="text-base">Shift gap analysis</CardTitle></CardHeader>
        <CardContent className="text-sm">
          <pre className="text-xs bg-slate-100 p-3 rounded overflow-auto">{JSON.stringify(data, null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
