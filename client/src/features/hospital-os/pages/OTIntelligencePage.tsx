import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Stethoscope } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function OTIntelligencePage() {
  const [ot, setOt] = useState<any>(null);

  useEffect(() => {
    fetch('/api/display/ot-status').then((r) => r.json()).then(setOt).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Stethoscope className="h-5 w-5 text-purple-600" />
        Intelligent Operating Theatre (Pillar 10)
      </h2>
      <p className="text-sm text-muted-foreground">
        <Link to="/hospital/command-center/ot" className="text-teal-600 underline">OT Live Board →</Link>
        {' · '}
        <Link to="/display/ot-proctor" className="text-teal-600 underline">Remote proctor display →</Link>
      </p>
      <Card>
        <CardHeader><CardTitle className="text-base">Theatre status</CardTitle></CardHeader>
        <CardContent><pre className="text-xs overflow-auto">{JSON.stringify(ot, null, 2)}</pre></CardContent>
      </Card>
    </div>
  );
}
