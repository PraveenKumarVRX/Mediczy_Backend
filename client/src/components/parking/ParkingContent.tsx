/**
 * Parking module content — lots, gate movements, passes, watchlist/incidents/
 * overstay and devices. Lives inside the Security portal (SecurityParkingPage in
 * pages/security/SecurityModulePages.tsx). Administrative/operational, not a
 * clinical or SaMD component. Talks to /api/parking (server/routes/parking.route.js).
 * Ported from the iPark reference app.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Cpu, ParkingSquare, ShieldAlert, Ticket, ArrowDownLeft, ArrowUpRight, AlertTriangle, CarFront } from 'lucide-react';
import ParkingLots from '@/components/parking/ParkingLots';
import ParkingPasses from '@/components/parking/ParkingPasses';
import ParkingValet from '@/components/parking/ParkingValet';
import ParkingSecurity from '@/components/parking/ParkingSecurity';
import ParkingDevices from '@/components/parking/ParkingDevices';
import ParkingAnalytics from '@/components/parking/ParkingAnalytics';
import { useParkingQuery } from '@/components/parking/parkingApi';

interface Overview { active_passes: number; open_incidents: number; unacknowledged_overstays: number; valet_active: number; valet_awaiting_retrieval: number; today_entries: number; today_exits: number }

export default function ParkingContent() {
  const overview = useParkingQuery<Overview>('/overview');
  const o = overview.data;
  const attention = (o?.open_incidents ?? 0) + (o?.unacknowledged_overstays ?? 0);

  const tiles = [
    { label: 'Entries today', value: o?.today_entries, icon: ArrowDownLeft, tone: 'text-emerald-600' },
    { label: 'Exits today', value: o?.today_exits, icon: ArrowUpRight, tone: 'text-slate-600' },
    { label: 'Active passes', value: o?.active_passes, icon: Ticket, tone: 'text-indigo-600' },
    { label: 'Valet vehicles', value: o?.valet_active, icon: CarFront, tone: 'text-sky-600', sub: o ? `${o.valet_awaiting_retrieval} awaiting retrieval` : undefined },
    { label: 'Needs attention', value: o ? attention : undefined, icon: AlertTriangle, tone: attention ? 'text-red-600' : 'text-slate-400', sub: o ? `${o.open_incidents} incidents · ${o.unacknowledged_overstays} overstays` : undefined },
  ];

  return (
    <div className="p-4 md:p-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {tiles.map((t) => (
          <Card key={t.label} className="border-slate-200 shadow-sm">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{t.label}</p><t.icon className={`h-5 w-5 ${t.tone}`} aria-hidden /></div>
              {overview.loading && !o ? <Skeleton className="h-8 w-16 mt-1" />
                : overview.error && !o ? <p className="text-sm text-red-600 mt-1">Unavailable</p>
                : <p className="text-3xl font-bold tabular-nums">{t.value ?? '—'}</p>}
              {t.sub && <p className="text-xs text-muted-foreground mt-1">{t.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="lots" className="space-y-6">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="lots"><ParkingSquare className="h-4 w-4 mr-1.5" />Lots &amp; gate</TabsTrigger>
          <TabsTrigger value="valet"><CarFront className="h-4 w-4 mr-1.5" />Valet</TabsTrigger>
          <TabsTrigger value="passes"><Ticket className="h-4 w-4 mr-1.5" />Passes</TabsTrigger>
          <TabsTrigger value="security"><ShieldAlert className="h-4 w-4 mr-1.5" />Security</TabsTrigger>
          <TabsTrigger value="devices"><Cpu className="h-4 w-4 mr-1.5" />Devices</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-1.5" />Analytics</TabsTrigger>
        </TabsList>
        <TabsContent value="lots"><ParkingLots onChanged={overview.reload} /></TabsContent>
        <TabsContent value="valet"><ParkingValet onChanged={overview.reload} /></TabsContent>
        <TabsContent value="passes"><ParkingPasses onChanged={overview.reload} /></TabsContent>
        <TabsContent value="security"><ParkingSecurity onChanged={overview.reload} /></TabsContent>
        <TabsContent value="devices"><ParkingDevices /></TabsContent>
        <TabsContent value="analytics"><ParkingAnalytics /></TabsContent>
      </Tabs>
    </div>
  );
}
