import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import HospitalLayout from '@/components/hospital/HospitalLayout';

/**
 * Hospital-wide MDT invitation inbox (scaffold — wires to MDT sessions API in Phase 2).
 */
export default function MDTInboxPage() {
  const pendingSessions = [
    {
      id: 1,
      patientId: 0,
      title: 'MDT sessions appear here when you are invited',
      status: 'info',
    },
  ];

  return (
    <HospitalLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-teal-600" />
          <h1 className="text-2xl font-bold">MDT Inbox</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Multidisciplinary board invitations across all patients. Open a patient workspace to start or join a session.
        </p>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending invitations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingSessions.map((s) => (
              <div key={s.id} className="border rounded-lg p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  <p className="font-medium text-sm">{s.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Start a Clinical Board from any patient HealthOS workspace.
                  </p>
                </div>
                <Badge variant="secondary">{s.status}</Badge>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/hospital/patients">Browse patients</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </HospitalLayout>
  );
}
