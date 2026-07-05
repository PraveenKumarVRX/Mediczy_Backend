import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listFamilyUpdates } from '@/services/workspace.service';
import { Loader2 } from 'lucide-react';

function useFamilyAuth(patientId: string | undefined) {
  const stored = sessionStorage.getItem('family_patient_id');
  const access = sessionStorage.getItem('family_access');
  if (!patientId || !stored || !access || stored !== patientId) return false;
  return true;
}

export default function FamilyPatientHome() {
  const { id } = useParams<{ id: string }>();
  const authed = useFamilyAuth(id);
  const [updates, setUpdates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authed || !id) return;
    listFamilyUpdates(Number(id), true)
      .then((r) => setUpdates(r?.data || []))
      .catch(() => setUpdates([]))
      .finally(() => setLoading(false));
  }, [authed, id]);

  if (!authed) return <Navigate to="/family/login" replace />;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Today&apos;s update</h2>
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : updates.length ? (
        updates.slice(0, 3).map((u) => (
          <Card key={u.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{u.title}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {u.created_at ? new Date(u.created_at).toLocaleString('en-IN') : ''}
              </p>
            </CardHeader>
            <CardContent className="text-sm text-slate-700 leading-relaxed">{u.body}</CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground text-center">
            Your care team has not published an update yet. Check back later today.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
