import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brain, Loader2 } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/hooks/useWorkspace';
import { getSimilarCases } from '@/services/workspace.service';
import { ClinicalEmptyState } from '@/components/clinical/ClinicalEmptyState';
import { ConfidenceMeter } from '@/components/ai/ConfidenceMeter';

export default function SimilarCases() {
  const { patientId, workspace } = useWorkspace();
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const presentation = workspace?.patient?.primary_diagnosis || workspace?.sections?.overview?.diagnosis;
    getSimilarCases(patientId, typeof presentation === 'string' ? presentation : undefined)
      .then((r) => setCases(r?.data?.cases || r?.data || []))
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, [patientId, workspace]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Brain className="h-5 w-5 text-violet-600" />
          Similar Cases
        </h2>
        <p className="text-sm text-muted-foreground">
          Knowledge graph matches — for clinical learning, not autonomous decisions (Pillar 19)
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching case library…
        </div>
      ) : cases.length ? (
        <div className="grid md:grid-cols-2 gap-3">
          {cases.map((c: any, i: number) => (
            <Card key={c.id || i}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{c.presentation || c.diagnosis || `Case ${i + 1}`}</CardTitle>
                  {c.similarity != null && (
                    <Badge variant="secondary">{Math.round(c.similarity * 100)}% match</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p className="text-slate-600">{c.outcome || c.summary || c.notes}</p>
                {c.confidence != null && <ConfidenceMeter value={c.confidence} label="Evidence strength" />}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <ClinicalEmptyState
          title="No similar cases found"
          description="The knowledge graph will suggest anonymized matches as more cases are indexed."
        />
      )}
    </div>
  );
}
