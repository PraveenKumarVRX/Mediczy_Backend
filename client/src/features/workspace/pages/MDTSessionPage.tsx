import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkspace } from '@/features/workspace/hooks/useWorkspace';
import { startClinicalBoard, recordMDTOpinion, getMDTConsensus, joinMDT } from '@/services/workspace.service';

export default function MDTSessionPage() {
  const { patientId, actionLoading, setActionLoading } = useWorkspace();
  const [mdtSession, setMdtSession] = useState<any>(null);
  const [mdtConsensus, setMdtConsensus] = useState<any>(null);
  const [mdtOpinion, setMdtOpinion] = useState({ role: '', text: '', rec: '' });

  const startBoard = async () => {
    setActionLoading('board');
    try {
      const res = await startClinicalBoard(patientId, `Clinical Board — Patient ${patientId}`);
      setMdtSession(res?.data);
    } finally {
      setActionLoading(null);
    }
  };

  const submitOpinion = async () => {
    if (!mdtSession?.id || !mdtOpinion.text) return;
    await recordMDTOpinion(mdtSession.id, {
      specialistRole: mdtOpinion.role || 'specialist',
      opinion: mdtOpinion.text,
      recommendation: mdtOpinion.rec,
    });
    const c = await getMDTConsensus(mdtSession.id);
    setMdtConsensus(c?.data);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button onClick={startBoard} disabled={actionLoading === 'board'}>Start Clinical Board</Button>
        {mdtSession && (
          <Button variant="outline" onClick={() => joinMDT(mdtSession.id)}>Join session</Button>
        )}
      </div>
      {mdtSession && (
        <Card>
          <CardContent className="pt-4 text-sm space-y-3">
            <p>Session #{mdtSession.id} — Room: {mdtSession.livekit_room}</p>
            <Input placeholder="Your role" value={mdtOpinion.role} onChange={(e) => setMdtOpinion({ ...mdtOpinion, role: e.target.value })} />
            <Input placeholder="Opinion" value={mdtOpinion.text} onChange={(e) => setMdtOpinion({ ...mdtOpinion, text: e.target.value })} />
            <Input placeholder="Recommendation" value={mdtOpinion.rec} onChange={(e) => setMdtOpinion({ ...mdtOpinion, rec: e.target.value })} />
            <Button onClick={submitOpinion}>Submit opinion</Button>
            {mdtConsensus?.consensus && (
              <div className="bg-slate-100 p-3 rounded text-xs">
                <p><strong>AI Consensus:</strong> {mdtConsensus.consensus.consensusPercent}%</p>
                <p>{mdtConsensus.consensus.summary}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
