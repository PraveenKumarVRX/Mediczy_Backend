/**
 * WP-1.4 admin job status: cross-process cron ownership.
 *
 * Reads the two endpoints that already exist — GET /api/admin/automation/leases (who holds each
 * job's lease right now, and whether that lease is still live) and
 * GET /api/admin/automation/jobs/:key/logs (recent runs).
 *
 * This is read-only on purpose. Replay/force-run controls are deliberately NOT here: re-running a
 * clinical or billing job by hand is a decision with clinical and financial consequences, and the
 * plan lists it as a separate item needing its own sign-off. Showing an operator a button that
 * silently fires a nightly reconciliation would be worse than not showing it.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, AlertTriangle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import api from '@/lib/api';

type Lease = {
  job_key: string;
  owner_id: string;
  acquired_at: string;
  heartbeat_at: string;
  expires_at: string;
  status: 'running' | 'stale';
  metadata?: Record<string, unknown>;
};

const fmt = (iso?: string | null) => (iso ? String(iso).slice(0, 19).replace('T', ' ') : '—');

export default function AdminJobStatus() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [logs, setLogs] = useState<unknown[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/admin/automation/leases');
      const data = (res.data?.data || []) as Lease[];
      setLeases(data);
      setError(null);
      setSelected((cur) => (cur && data.some((l) => l.job_key === cur) ? cur : data[0]?.job_key ?? null));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Job status is unavailable.');
      setLeases([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const loadLogs = useCallback(async (key: string) => {
    setSelected(key);
    setLogsLoading(true); setLogsError(null);
    try {
      const res = await api.get(`/api/admin/automation/jobs/${encodeURIComponent(key)}/logs`);
      setLogs(res.data?.data || []);
    } catch (e: any) {
      setLogsError(e?.response?.data?.message || 'Run history is unavailable.');
      setLogs([]);
    } finally { setLogsLoading(false); }
  }, []);

  useEffect(() => { if (selected) loadLogs(selected); }, [selected, loadLogs]);

  const stale = leases.filter((l) => l.status === 'stale').length;
  const running = leases.length - stale;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Scheduled job status</h1>
          <p className="text-sm text-muted-foreground">
            Which process currently owns each recurring job, and whether its lease is still live.
          </p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={refresh}>Retry</Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Jobs with a lease</p>
          <p className="text-2xl font-semibold">{loading ? '—' : leases.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Held (running elsewhere)</p>
          <p className="text-2xl font-semibold text-emerald-600">{loading ? '—' : running}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Stale (lease expired)</p>
          <p className={`text-2xl font-semibold ${stale > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
            {loading ? '—' : stale}
          </p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Leases</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading…
            </div>
          ) : leases.length === 0 && !error ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No job currently holds a lease. Jobs that have not run, or that run without a lease,
              do not appear here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead><TableHead>Owner</TableHead><TableHead>Acquired</TableHead>
                  <TableHead>Heartbeat</TableHead><TableHead>Expires</TableHead><TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {leases.map((l) => (
                  <TableRow key={l.job_key} className={selected === l.job_key ? 'bg-muted/40' : ''}>
                    <TableCell className="font-mono text-xs">{l.job_key}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l.owner_id}</TableCell>
                    <TableCell className="text-xs">{fmt(l.acquired_at)}</TableCell>
                    <TableCell className="text-xs">{fmt(l.heartbeat_at)}</TableCell>
                    <TableCell className="text-xs">{fmt(l.expires_at)}</TableCell>
                    <TableCell>
                      {l.status === 'stale'
                        ? <Badge variant="secondary"><AlertTriangle className="h-3 w-3" />Stale</Badge>
                        : <Badge><CheckCircle2 className="h-3 w-3" />Running</Badge>}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => loadLogs(l.job_key)}>History</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recent runs{selected ? ` — ${selected}` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logsError && (
            <div className="flex items-center justify-between rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span>{logsError}</span>
              <Button size="sm" variant="outline" onClick={() => selected && loadLogs(selected)}>Retry</Button>
            </div>
          )}
          {!logsError && logsLoading && (
            <p className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading history…</p>
          )}
          {!logsError && !logsLoading && logs.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No recorded runs for this job.</p>
          )}
          {!logsError && !logsLoading && logs.length > 0 && (
            <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(logs, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Force-run and replay controls are intentionally not provided here. Re-running a clinical or
        billing job by hand has clinical and financial consequences and needs its own sign-off.
      </p>
    </div>
  );
}
