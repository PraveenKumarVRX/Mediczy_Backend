import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Loader2 } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/hooks/useWorkspace';
import { autoInviteMDT, startClinicalBoard } from '@/services/workspace.service';
import { ClinicalEmptyState } from '@/components/clinical/ClinicalEmptyState';
import { Link } from 'react-router-dom';
import { useClinicalPaths } from '@/hooks/useClinicalPaths';
import { useParams } from 'react-router-dom';

export default function HumanCareTeamPage() {
  const { workspace, refresh, patientId, actionLoading, setActionLoading } = useWorkspace();
  const paths = useClinicalPaths();
  const { patientId: pidParam } = useParams();
  const team = workspace?.careTeam?.members || [];

  const inviteMDT = async () => {
    setActionLoading('mdt');
    try {
      await autoInviteMDT(patientId, workspace?.diagnosis || (workspace?.admission as { diagnosis?: string })?.diagnosis || 'complex case');
      await refresh();
    } finally {
      setActionLoading(null);
    }
  };

  const startBoard = async () => {
    setActionLoading('board');
    try {
      await startClinicalBoard(patientId, `Clinical Board — Patient ${patientId}`);
      await refresh();
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" onClick={inviteMDT} disabled={actionLoading === 'mdt'}>
          {actionLoading === 'mdt' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Users className="h-4 w-4 mr-1" />}
          AI Auto-invite MDT
        </Button>
        <Button size="sm" variant="secondary" onClick={startBoard} disabled={actionLoading === 'board'}>
          Start Clinical Board
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link to={`${paths.patientHealthos(pidParam!)}/mdt`}>Open MDT session →</Link>
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Dynamic Care Team</CardTitle></CardHeader>
        <CardContent>
          {team.length === 0 ? (
            <ClinicalEmptyState title="No team members yet" description="Use AI auto-invite to assemble a multidisciplinary team based on diagnosis." />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {team.map((m) => (
                <div key={m.id} className="border rounded-lg p-3 text-sm">
                  <p className="font-medium">{m.display_name || m.role}</p>
                  <p className="text-xs text-muted-foreground capitalize">{m.role?.replace(/_/g, ' ')}</p>
                  {m.invited_by === 'ai_mdt' && <Badge variant="secondary" className="mt-1 text-[10px]">AI invited</Badge>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
