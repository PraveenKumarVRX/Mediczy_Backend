import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Loader2 } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/hooks/useWorkspace';
import { getClinicalTimeline } from '@/services/workspace.service';
import { ClinicalEmptyState } from '@/components/clinical/ClinicalEmptyState';

export default function ClinicalDocuments() {
  const { patientId } = useWorkspace();
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getClinicalTimeline(patientId, { eventType: 'document', limit: 50 })
      .then((r) => {
        const events = r?.data?.events || r?.data || [];
        setDocs(Array.isArray(events) ? events : []);
      })
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [patientId]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5 text-slate-600" />
          Clinical Documents
        </h2>
        <p className="text-sm text-muted-foreground">Notes, letters, and reports linked to this admission</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading documents…
        </div>
      ) : docs.length ? (
        <div className="space-y-2">
          {docs.map((d: any) => (
            <Card key={d.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{d.title || d.event_type}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {d.created_at ? new Date(d.created_at).toLocaleString('en-IN') : ''}
                </p>
              </CardHeader>
              <CardContent className="text-sm text-slate-700">{d.body || d.summary || '—'}</CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <ClinicalEmptyState
          title="No documents yet"
          description="Discharge summaries, consult notes, and uploaded files appear here when documented."
        />
      )}
    </div>
  );
}
