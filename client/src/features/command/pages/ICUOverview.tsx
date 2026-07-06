import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';
import { useCommandCenterData } from '@/features/command/hooks/useCommandCenterData';
import { BedStatusChip } from '@/components/clinical/BedStatusChip';
import { VitalsStrip } from '@/components/clinical/VitalsStrip';

export default function ICUOverview() {
  const { displayData, snapshot } = useCommandCenterData();
  const census = displayData?.census;
  const occupied = census?.icuOccupied ?? 0;
  const total = census?.icuBeds ?? 6;
  const critical = census?.icuCritical ?? snapshot?.criticalAlerts ?? 0;
  const occupancyPct = total ? Math.round((occupied / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5 text-purple-600" />
          ICU Overview
        </h2>
        <p className="text-sm text-muted-foreground">Unit census and acuity at a glance</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-purple-700">
              {occupied}/{total}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Beds occupied</p>
            <BedStatusChip status={occupancyPct >= 90 ? 'alert' : occupancyPct >= 75 ? 'monitoring' : 'stable'} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-red-600">{critical}</p>
            <p className="text-xs text-muted-foreground mt-1">Critical patients</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-amber-600">{displayData?.incidents?.nurseCallsOpen ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Open nurse calls</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sample vitals strip (demo bed)</CardTitle>
        </CardHeader>
        <CardContent>
          <VitalsStrip vitals={{ hr: 92, spo2: 96, bp: '118/76', rr: 18, temp: 37.1 }} />
          <p className="text-xs text-muted-foreground mt-3">
            Connect ward monitors via IoT MQTT for live ICU wall feeds.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
