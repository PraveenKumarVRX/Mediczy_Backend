import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineError } from '@/components/ui/inline-error';
import { useToast } from '@/hooks/use-toast';
import { Cctv, ShieldCheck } from 'lucide-react';
import { CatalogItem, SurvEvent, NATIVE_LABEL, SEV_CLS, useSurvQuery, survPost, errorMessage, formatDateTime, timeAgo, pretty } from './surveillanceApi';

const STATUS_CLS = { new: 'bg-red-100 text-red-700', acknowledged: 'bg-blue-100 text-blue-700', escalated: 'bg-purple-100 text-purple-700', dismissed: 'bg-slate-100 text-slate-500' };

export default function SurveillanceEvents({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState('new');
  const events = useSurvQuery<SurvEvent[]>('/events', { status: status === 'all' ? undefined : status });
  const catalog = useSurvQuery<{ analytics: CatalogItem[] }>('/catalog');
  const [busy, setBusy] = useState<string | null>(null);
  const label = (e: SurvEvent) => catalog.data?.analytics.find((a) => a.key === e.analytic)?.label ?? NATIVE_LABEL[e.analytic] ?? pretty(e.analytic);

  // New alerts are time-critical: keep the list fresh while the tab is open.
  const { reload } = events;
  useEffect(() => { const t = window.setInterval(() => { if (!document.hidden) reload(); }, 15000); return () => window.clearInterval(t); }, [reload]);

  const act = async (e: SurvEvent, next: 'acknowledged' | 'dismissed' | 'escalated') => {
    let note: string | undefined;
    if (next !== 'acknowledged') {
      const n = window.prompt(next === 'escalated' ? 'Escalation note (who was informed / what was done):' : 'Why is this a false alarm or no action needed?');
      if (!n?.trim()) return;
      note = n.trim();
    }
    setBusy(e.id);
    try { await survPost(`/events/${e.id}/handle`, { status: next, note }); toast({ title: `Alert ${next}` }); events.reload(); onChanged(); }
    catch (err) { toast({ title: 'Could not update the alert', description: errorMessage(err), variant: 'destructive' }); events.reload(); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div className="w-48">
        <Label htmlFor="ev-status">Show</Label>
        <Select value={status} onValueChange={setStatus}><SelectTrigger id="ev-status"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="new">New</SelectItem><SelectItem value="acknowledged">Acknowledged</SelectItem><SelectItem value="escalated">Escalated</SelectItem><SelectItem value="dismissed">Dismissed</SelectItem><SelectItem value="all">Everything</SelectItem></SelectContent></Select>
      </div>
      {events.loading && !events.data ? <Skeleton className="h-40 w-full" />
        : events.error && !events.data ? <InlineError message="Could not load alerts" description={events.error} onRetry={events.reload} />
        : !events.data?.length ? <EmptyState icon={status === 'new' ? ShieldCheck : Cctv} title={status === 'new' ? 'No new alerts' : 'Nothing here'} description={status === 'new' ? 'Detections from your cameras appear here as they happen.' : 'No alerts with this status.'} />
        : (
          <ul className="space-y-3">
            {events.data.map((e) => (
              <li key={e.id}>
                <Card className={`border-slate-200 ${e.status === 'new' && e.severity === 'high' ? 'ring-2 ring-red-300' : ''}`}>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold flex flex-wrap items-center gap-2">{label(e)}<Badge className={SEV_CLS[e.severity]}>{e.severity}</Badge><Badge className={STATUS_CLS[e.status]}>{e.status}</Badge>
                          {e.source === 'camera_native' && <Badge variant="outline">DVR alarm</Badge>}{e.confidence === 'low' && <Badge variant="outline">low confidence — verify</Badge>}</p>
                        <p className="text-sm text-slate-600">{e.camera_name}{e.camera_zone ? ` · ${e.camera_zone}` : ''}</p>
                      </div>
                      <p className="text-xs text-slate-500 text-right" title={formatDateTime(e.detected_at)}>{timeAgo(e.detected_at)}<br />{formatDateTime(e.detected_at)}</p>
                    </div>
                    {e.description && <p className="text-sm text-slate-700">{e.description}</p>}
                    {e.handler_note && <p className="text-xs text-slate-500">Note: {e.handler_note}</p>}
                    <p className="text-xs text-slate-400">Check the DVR recording for this camera at the time shown — no image is kept here.</p>
                    {(e.status === 'new' || e.status === 'acknowledged') && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {e.status === 'new' && <Button size="sm" disabled={busy === e.id} onClick={() => act(e, 'acknowledged')}>Acknowledge</Button>}
                        <Button size="sm" variant="outline" disabled={busy === e.id} onClick={() => act(e, 'escalated')}>Escalate</Button>
                        <Button size="sm" variant="outline" disabled={busy === e.id} onClick={() => act(e, 'dismissed')}>Dismiss</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
