import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { listApprovals, reviewApproval } from '@/services/hospitalOs.service';

export default function ApprovalInboxPage() {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    listApprovals('pending')
      .then((r) => setApprovals(r?.data || []))
      .catch(() => setApprovals([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const review = async (id: number, action: 'approve' | 'reject') => {
    await reviewApproval(id, action);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-teal-600" />
          Approval Inbox (Pillar 4)
        </h2>
        <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
      </div>
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : approvals.length ? (
        approvals.map((a) => (
          <Card key={a.id}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">{a.title || a.action_type}</CardTitle>
              <Badge>{a.status}</Badge>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>{a.summary || a.payload?.description}</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => review(a.id, 'approve')}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => review(a.id, 'reject')}>Reject</Button>
              </div>
            </CardContent>
          </Card>
        ))
      ) : (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">No pending approvals.</CardContent></Card>
      )}
    </div>
  );
}
