import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Loader2, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import api from '@/lib/api';

interface MDTSessionRow {
  id: number;
  patient_id: number;
  title: string;
  status?: string;
  livekit_room?: string;
  created_at?: string;
}

export default function MDTInboxPage() {
  const [sessions, setSessions] = useState<MDTSessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/v3/healthos/mdt/inbox')
      .then((r) => setSessions(r.data?.data || []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <HospitalLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-teal-600" />
          <h1 className="text-2xl font-bold">MDT Inbox</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Multidisciplinary board invitations across all patients.
        </p>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sessions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : sessions.length ? (
              sessions.map((s) => (
                <div key={s.id} className="border rounded-lg p-4 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-medium text-sm">{s.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Patient #{s.patient_id}
                      {s.created_at ? ` · ${new Date(s.created_at).toLocaleString('en-IN')}` : ''}
                    </p>
                  </div>
                  <Badge variant="secondary">{s.status || 'active'}</Badge>
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/hospital/patient/${s.patient_id}/healthos/mdt`}>Workspace</Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link to={`/hospital/mdt/${s.id}/room`}>
                      <Video className="h-4 w-4 mr-1" />
                      Join
                    </Link>
                  </Button>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground space-y-2">
                <p>No open MDT sessions in your inbox.</p>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/hospital/patients">Start from a patient workspace</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </HospitalLayout>
  );
}
