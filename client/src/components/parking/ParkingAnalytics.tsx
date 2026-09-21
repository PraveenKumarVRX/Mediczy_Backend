import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineError } from '@/components/ui/inline-error';
import { BarChart3 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Lot, useParkingQuery, formatDuration } from './parkingApi';

interface Day { date: string; entries: number; exits: number; avg_duration_minutes: number }
interface Hour { hour: number; entries: number; exits: number }

export default function ParkingAnalytics() {
  const [days, setDays] = useState('14');
  const [lotId, setLotId] = useState('all');
  const lots = useParkingQuery<Lot[]>('/lots');
  const params = { days, lotId: lotId === 'all' ? undefined : lotId };
  const daily = useParkingQuery<Day[]>('/analytics/daily', params);
  const hourly = useParkingQuery<Hour[]>('/analytics/hourly', params);

  const totalEntries = daily.data?.reduce((s, d) => s + d.entries, 0) ?? 0;
  const totalExits = daily.data?.reduce((s, d) => s + d.exits, 0) ?? 0;
  const withDur = daily.data?.filter((d) => d.avg_duration_minutes > 0) ?? [];
  const avgDur = withDur.length ? Math.round(withDur.reduce((s, d) => s + d.avg_duration_minutes, 0) / withDur.length) : null;
  const peak = hourly.data?.reduce((best, h) => (h.entries > (best?.entries ?? 0) ? h : best), null as Hour | null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        <div className="w-40"><Label htmlFor="an-days">Period</Label>
          <Select value={days} onValueChange={setDays}><SelectTrigger id="an-days"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="7">Last 7 days</SelectItem><SelectItem value="14">Last 14 days</SelectItem><SelectItem value="30">Last 30 days</SelectItem><SelectItem value="90">Last 90 days</SelectItem></SelectContent></Select></div>
        <div className="w-52"><Label htmlFor="an-lot">Lot</Label>
          <Select value={lotId} onValueChange={setLotId}><SelectTrigger id="an-lot"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All lots</SelectItem>{(lots.data ?? []).map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}</SelectContent></Select></div>
      </div>

      {daily.loading && !daily.data ? <Skeleton className="h-72 w-full" />
        : daily.error && !daily.data ? <InlineError message="Could not load analytics" description={daily.error} onRetry={() => { daily.reload(); hourly.reload(); }} />
        : totalEntries + totalExits === 0 ? <EmptyState icon={BarChart3} title="No activity in this period" description="Entries and exits logged at the gate appear here." />
        : (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              {[
                ['Entries', totalEntries], ['Exits', totalExits],
                ['Avg. stay', formatDuration(avgDur)], ['Busiest entry hour', peak && peak.entries > 0 ? `${String(peak.hour).padStart(2, '0')}:00` : '—'],
              ].map(([label, value]) => (
                <Card key={String(label)} className="border-slate-200"><CardContent className="pt-4"><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-semibold tabular-nums">{value}</p></CardContent></Card>
              ))}
            </div>
            <Card className="border-slate-200">
              <CardHeader className="pb-2"><CardTitle className="text-base">Entries and exits per day</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily.data!}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={12} /><YAxis allowDecimals={false} fontSize={12} /><Tooltip /><Legend />
                    <Bar dataKey="entries" name="Entries" fill="#10b981" radius={[3, 3, 0, 0]} /><Bar dataKey="exits" name="Exits" fill="#64748b" radius={[3, 3, 0, 0]} /></BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-slate-200">
                <CardHeader className="pb-2"><CardTitle className="text-base">By hour of day (IST)</CardTitle></CardHeader>
                <CardContent className="h-60">
                  {hourly.error && !hourly.data ? <InlineError message="Could not load hourly data" description={hourly.error} onRetry={hourly.reload} compact />
                    : <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={hourly.data ?? []}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="hour" fontSize={12} /><YAxis allowDecimals={false} fontSize={12} /><Tooltip labelFormatter={(h) => `${String(h).padStart(2, '0')}:00`} /><Legend />
                        <Bar dataKey="entries" name="Entries" fill="#10b981" /><Bar dataKey="exits" name="Exits" fill="#64748b" /></BarChart>
                    </ResponsiveContainer>}
                </CardContent>
              </Card>
              <Card className="border-slate-200">
                <CardHeader className="pb-2"><CardTitle className="text-base">Average stay per day (minutes)</CardTitle></CardHeader>
                <CardContent className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={daily.data!}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={12} /><YAxis allowDecimals={false} fontSize={12} /><Tooltip />
                      <Line type="monotone" dataKey="avg_duration_minutes" name="Avg. stay (min)" stroke="#0ea5e9" strokeWidth={2} dot={false} /></LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
            <p className="text-xs text-slate-500">Average stay counts only vehicles logged with a number. Days with no such exits show 0.</p>
          </>
        )}
    </div>
  );
}
