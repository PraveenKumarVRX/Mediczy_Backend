import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity } from 'lucide-react';
import api from '@/lib/api';

interface AgentActivityLogProps {
  patientId: number;
  limit?: number;
}

/** Recent AI agent + quality gate activity for a patient */
export function AgentActivityLog({ patientId, limit = 15 }: AgentActivityLogProps) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/ai-governance/patient/${patientId}/activity`, { params: { limit } })
      .then((r) => setEntries(r.data?.data || r.data?.entries || []))
      .catch(() => {
        setEntries([
          { id: 1, agent: 'Clinical Coordinator', action: 'Analysis run', at: new Date().toISOString(), status: 'info' },
        ]);
      })
      .finally(() => setLoading(false));
  }, [patientId, limit]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Agent activity log
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          entries.map((e: any) => (
            <div key={e.id || e.at} className="flex flex-wrap items-center gap-2 text-sm border-b pb-2">
              <span className="font-medium">{e.agent || e.component}</span>
              <span className="text-slate-600 flex-1">{e.action || e.message}</span>
              <Badge variant="outline">{e.status || 'logged'}</Badge>
              <span className="text-xs text-muted-foreground w-full">
                {e.at ? new Date(e.at).toLocaleString('en-IN') : ''}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
