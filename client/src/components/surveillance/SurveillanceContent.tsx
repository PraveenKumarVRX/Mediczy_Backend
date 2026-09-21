/**
 * Camera vision analytics — Security portal content. Security/safety monitoring, not a clinical or
 * SaMD component. Talks to /api/surveillance (server/routes/surveillance.route.js). Cameras are read by
 * an on-premises edge gateway (edge/surveillance-agent) that sends frames out; frames are analysed
 * and discarded, never stored.
 */
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, BellRing, Cctv, Cpu, Info, Network, Video } from 'lucide-react';
import SurveillanceEvents from './SurveillanceEvents';
import SurveillanceCameras from './SurveillanceCameras';
import SurveillanceSetup from './SurveillanceSetup';
import { useSurvQuery } from './surveillanceApi';

interface Overview {
  cameras: number; cameras_online: number; cameras_offline: number; analytics_active: number; blocked_by_privacy: number; gateways: number; gateways_online: number;
  events_new: number; events_new_high: number; events_today: number; frames_today: number; vision_status: 'ok' | 'degraded' | 'unavailable' | 'idle'; external_vision_allowed: boolean;
}
const VISION_LABEL = { ok: ['Analysing', 'bg-emerald-100 text-emerald-700'], degraded: ['Partly failing', 'bg-amber-100 text-amber-700'], unavailable: ['Unavailable', 'bg-red-100 text-red-700'], idle: ['Idle', 'bg-slate-100 text-slate-600'] } as const;

export default function SurveillanceContent() {
  const overview = useSurvQuery<Overview>('/overview');
  const o = overview.data;
  const tiles = [
    { label: 'Cameras online', value: o ? `${o.cameras_online} / ${o.cameras}` : undefined, icon: Video, sub: o?.cameras_offline ? `${o.cameras_offline} offline` : undefined, tone: o?.cameras_offline ? 'text-red-600' : 'text-emerald-600' },
    { label: 'New alerts', value: o?.events_new, icon: BellRing, sub: o ? `${o.events_new_high} high severity · ${o.events_today} today` : undefined, tone: o?.events_new_high ? 'text-red-600' : 'text-slate-600' },
    { label: 'Cameras with analytics', value: o?.analytics_active, icon: Cpu, sub: o ? `${o.frames_today} frames analysed today` : undefined, tone: 'text-indigo-600' },
    { label: 'Edge gateways online', value: o ? `${o.gateways_online} / ${o.gateways}` : undefined, icon: Network, sub: o && o.gateways === 0 ? 'None set up yet' : undefined, tone: o && o.gateways > 0 && o.gateways_online === 0 ? 'text-red-600' : 'text-sky-600' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5">
      {o && o.vision_status !== 'idle' && (
        <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${o.vision_status === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`} role="status">
          <Cctv className="h-4 w-4 shrink-0" aria-hidden />Vision engine: <Badge className={VISION_LABEL[o.vision_status][1]}>{VISION_LABEL[o.vision_status][0]}</Badge>
          {o.vision_status === 'unavailable' && <span>Cameras are not being analysed right now. Contact IT; DVR recording is unaffected.</span>}
        </div>
      )}
      {o?.external_vision_allowed && <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />External AI providers are allowed for camera frames on this server. Frames show people; confirm this is covered by your privacy policy.</div>}
      {o && o.blocked_by_privacy > 0 && <div className="flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900"><Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />{o.blocked_by_privacy} clinical-area camera{o.blocked_by_privacy === 1 ? ' is' : 's are'} not analysed until an administrator records a privacy review (Cameras tab → Analytics).</div>}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <Card key={t.label} className="border-slate-200 shadow-sm"><CardContent className="pt-4">
            <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{t.label}</p><t.icon className={`h-5 w-5 ${t.tone}`} aria-hidden /></div>
            {overview.loading && !o ? <Skeleton className="h-8 w-16 mt-1" /> : overview.error && !o ? <p className="text-sm text-red-600 mt-1">Unavailable</p> : <p className="text-3xl font-bold tabular-nums">{t.value ?? '—'}</p>}
            {t.sub && <p className="text-xs text-muted-foreground mt-1">{t.sub}</p>}
          </CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="alerts" className="space-y-5">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="alerts"><BellRing className="h-4 w-4 mr-1.5" />Alerts</TabsTrigger>
          <TabsTrigger value="cameras"><Video className="h-4 w-4 mr-1.5" />Cameras &amp; analytics</TabsTrigger>
          <TabsTrigger value="setup"><Network className="h-4 w-4 mr-1.5" />DVR &amp; gateway setup</TabsTrigger>
        </TabsList>
        <TabsContent value="alerts"><SurveillanceEvents onChanged={overview.reload} /></TabsContent>
        <TabsContent value="cameras"><SurveillanceCameras onChanged={overview.reload} /></TabsContent>
        <TabsContent value="setup"><SurveillanceSetup onChanged={overview.reload} /></TabsContent>
      </Tabs>
      <p className="text-xs text-slate-400">Analytics assist security staff and are not a substitute for the fire alarm system, patient monitoring or a guard's judgement. No faces or identities are analysed or stored, and camera images are not kept.</p>
    </div>
  );
}
