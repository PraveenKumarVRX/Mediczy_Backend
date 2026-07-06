import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { FlaskConical, Loader2 } from 'lucide-react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { listClinicalTrials } from '@/services/careos.service';

export default function ResearchHub() {
  const [trials, setTrials] = useState<any[]>([]);
  const [condition, setCondition] = useState('');
  const [loading, setLoading] = useState(true);

  const load = (c?: string) => {
    setLoading(true);
    listClinicalTrials(c)
      .then((r) => setTrials(r?.data || []))
      .catch(() => setTrials([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <HospitalLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-indigo-600" />
          <h1 className="text-2xl font-bold">Research Hub</h1>
        </div>
        <p className="text-sm text-muted-foreground">Governed clinical trial matching (Pillar 18)</p>
        <div className="flex gap-2">
          <Input
            placeholder="Filter by condition"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
          />
          <button type="button" onClick={() => load(condition)} className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm">
            Search
          </button>
        </div>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <div className="space-y-3">
            {trials.map((t: any) => (
              <Card key={t.id}>
                <CardHeader className="pb-2 flex flex-row justify-between">
                  <CardTitle className="text-base">{t.title || t.name}</CardTitle>
                  <Badge>{t.phase || 'trial'}</Badge>
                </CardHeader>
                <CardContent className="text-sm text-slate-600">{t.condition || t.description}</CardContent>
              </Card>
            ))}
            {!trials.length && <p className="text-muted-foreground">No trials listed</p>}
          </div>
        )}
      </div>
    </HospitalLayout>
  );
}
