import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Stethoscope } from 'lucide-react';
import { useCommandCenterData } from '@/features/command/hooks/useCommandCenterData';

interface OTCase {
  room: string;
  procedure: string;
  surgeon?: string;
  status: string;
  startTime?: string;
}

export default function OTLiveBoard() {
  const { displayData, snapshot } = useCommandCenterData();
  const [otCases, setOtCases] = useState<OTCase[]>([]);

  useEffect(() => {
    fetch('/api/display/ot-status')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.rooms)) {
          setOtCases(
            json.rooms.map((r: any) => ({
              room: r.room || r.name,
              procedure: r.procedure || r.currentCase || '—',
              surgeon: r.surgeon,
              status: r.status || 'scheduled',
              startTime: r.startTime,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  const inProgress = displayData?.census?.otInProgress ?? 0;
  const totalRooms = displayData?.census?.otRooms ?? 5;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-violet-600" />
          OT Live Board
        </h2>
        <p className="text-sm text-muted-foreground">
          {inProgress}/{totalRooms} rooms active · {snapshot?.todayOTCases ?? 0} cases today
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {otCases.length ? (
          otCases.map((c) => (
            <Card key={c.room}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base">{c.room}</CardTitle>
                <Badge variant={c.status === 'in_progress' ? 'default' : 'secondary'}>{c.status}</Badge>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p className="font-medium">{c.procedure}</p>
                {c.surgeon && <p className="text-muted-foreground">Surgeon: {c.surgeon}</p>}
                {c.startTime && <p className="text-xs text-muted-foreground">Started {c.startTime}</p>}
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="md:col-span-2">
            <CardContent className="pt-6 text-sm text-muted-foreground text-center">
              No OT schedule data — connect theatre management module.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
