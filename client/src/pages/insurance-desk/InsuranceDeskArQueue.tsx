import { useCallback, useEffect, useState } from 'react';
import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ShieldCheck, RefreshCw, Loader2, IndianRupee, ListChecks, AlertTriangle, Clock, PlayCircle, CheckCircle2, PhoneCall,
} from 'lucide-react';
import api from '@/utils/api';
import { navSections } from './navSections';

const formatCurrency = (amount?: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);

const formatDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—');

interface ArItem {
  id: number; claim_id: number | null; claim_number: string | null; payer_name: string | null;
  category: string; aging_bucket: string | null; outstanding_amount: number | string;
  priority: string; status: string; sla_due_at: string | null; owner_name: string | null;
}

const PRIORITY_TONE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  high: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  normal: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  low: 'bg-muted text-muted-foreground',
};
const CATEGORY_LABEL: Record<string, string> = { short_pay: 'Short pay', aging: 'Aging', ar_followup: 'Follow-up' };
const STATUS_TABS = ['open', 'in_progress', 'snoozed', 'resolved', 'closed'] as const;

function StatTile({ icon: Icon, label, value, tone }: { icon: React.ComponentType<any>; label: string; value: string; tone: string }) {
  return (
    <Card>
      <CardContent className="pt-6 flex items-center gap-4">
        <div className={`p-3 rounded-xl ${tone}`}><Icon className="h-5 w-5" /></div>
        <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div>
      </CardContent>
    </Card>
  );
}

const InsuranceDeskArQueue = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('open');
  const [items, setItems] = useState<ArItem[]>([]);
  const [summary, setSummary] = useState({ openCount: 0, totalOutstanding: 0, count: 0 });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [escalating, setEscalating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get('/hospital/insurance/rcm/ar-work-queue', { params: { status, limit: 300 } });
      setItems(res.data.items || []);
      setSummary({ openCount: res.data.openCount || 0, totalOutstanding: res.data.totalOutstanding || 0, count: res.data.count || 0 });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load the AR work-queue.');
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const patch = async (id: number, body: Record<string, any>) => {
    setBusyId(id);
    try { await api.patch(`/hospital/insurance/rcm/ar-work-queue/${id}`, body); await load(); }
    catch (err: any) { setError(err?.response?.data?.message || 'Update failed.'); }
    finally { setBusyId(null); }
  };

  const runEscalation = async () => {
    setEscalating(true); setNotice(null); setError(null);
    try {
      const res = await api.post('/hospital/insurance/rcm/ar-escalation/run', {});
      setNotice(`Escalation run: ${res.data.created || 0} aging items created, ${res.data.escalated || 0} escalated.`);
      await load();
    } catch (err: any) { setError(err?.response?.data?.message || 'Escalation run failed (admin only).'); }
    finally { setEscalating(false); }
  };

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="AR Work-queue" subtitle="Payer follow-ups, short-payments and aging escalations" copilotModule="insurance">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
        <div className="flex flex-wrap gap-1">
          {STATUS_TABS.map((s) => (
            <Button key={s} size="sm" variant={status === s ? 'default' : 'outline'} className="capitalize" onClick={() => setStatus(s)}>
              {s.replace('_', ' ')}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={runEscalation} disabled={escalating}>
            {escalating ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />} Run escalation
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Button>
        </div>
      </div>

      {notice && <p className="text-sm text-emerald-600 mb-3">{notice}</p>}
      {error && <p className="text-sm text-amber-600 mb-3">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <StatTile icon={ListChecks} label="Open items" value={String(summary.openCount)} tone="bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300" />
        <StatTile icon={IndianRupee} label="Outstanding (shown)" value={formatCurrency(summary.totalOutstanding)} tone="bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300" />
        <StatTile icon={Clock} label="Items in view" value={String(summary.count)} tone="bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300" />
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading work-queue…
        </div>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No <span className="capitalize">{status.replace('_', ' ')}</span> items.</CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payer</TableHead><TableHead>Claim</TableHead><TableHead>Type</TableHead>
                <TableHead>Bucket</TableHead><TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Priority</TableHead><TableHead>SLA due</TableHead><TableHead>Owner</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => {
                const overdue = it.sla_due_at && new Date(it.sla_due_at) < new Date() && ['open', 'in_progress'].includes(it.status);
                return (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.payer_name || '—'}</TableCell>
                    <TableCell>{it.claim_number || '—'}</TableCell>
                    <TableCell>{CATEGORY_LABEL[it.category] || it.category}</TableCell>
                    <TableCell>{it.aging_bucket || '—'}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(Number(it.outstanding_amount))}</TableCell>
                    <TableCell><Badge className={`capitalize ${PRIORITY_TONE[it.priority] || ''}`} variant="secondary">{it.priority}</Badge></TableCell>
                    <TableCell className={overdue ? 'text-red-600 font-medium' : ''}>{formatDate(it.sla_due_at)}</TableCell>
                    <TableCell>{it.owner_name?.trim() || '—'}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="inline-flex gap-1">
                        <Button size="icon" variant="ghost" title="Log contact" disabled={busyId === it.id}
                          onClick={() => patch(it.id, { contacted: true, note: 'Contacted payer' })}><PhoneCall className="h-4 w-4" /></Button>
                        {it.status !== 'in_progress' && it.status !== 'resolved' && it.status !== 'closed' && (
                          <Button size="icon" variant="ghost" title="Start" disabled={busyId === it.id}
                            onClick={() => patch(it.id, { status: 'in_progress' })}><PlayCircle className="h-4 w-4" /></Button>
                        )}
                        {it.status !== 'resolved' && it.status !== 'closed' && (
                          <Button size="icon" variant="ghost" title="Resolve" disabled={busyId === it.id}
                            onClick={() => patch(it.id, { status: 'resolved', note: 'Resolved' })}><CheckCircle2 className="h-4 w-4 text-emerald-600" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </HospDeptLayout>
  );
};

export default InsuranceDeskArQueue;
