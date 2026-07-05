import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { listFamilyUpdates } from '@/services/workspace.service';
import { MilestoneNode } from '@/components/clinical/MilestoneNode';

export default function FamilyProgress() {
  const { id } = useParams<{ id: string }>();
  const authed = sessionStorage.getItem('family_patient_id') === id;
  const [updates, setUpdates] = useState<any[]>([]);

  useEffect(() => {
    if (!authed || !id) return;
    listFamilyUpdates(Number(id), true).then((r) => setUpdates(r?.data || [])).catch(() => {});
  }, [authed, id]);

  if (!authed) return <Navigate to="/family/login" replace />;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Care journey</h2>
      <div className="space-y-0">
        {updates.length ? (
          updates.map((u, i) => (
            <MilestoneNode
              key={u.id}
              title={u.title}
              body={u.body}
              date={u.created_at}
              isLast={i === updates.length - 1}
            />
          ))
        ) : (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Progress milestones will appear as your care team publishes updates.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
