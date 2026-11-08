import { useCallback, useEffect, useState } from 'react';
import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShieldCheck, RefreshCw, Loader2, Search, PlusCircle, Landmark } from 'lucide-react';
import api from '@/utils/api';
import { navSections } from './navSections';

const formatCurrency = (amount?: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);

// Mirror of the server PREAUTH_TRANSITIONS, to render only valid next-state actions.
const TRANSITIONS: Record<string, string[]> = {
  initiated: ['submitted', 'cancelled'],
  submitted: ['query', 'approved', 'rejected'],
  query: ['submitted', 'rejected'],
  approved: ['bed_blocked', 'cancelled'],
  bed_blocked: ['claimed', 'cancelled'],
  rejected: ['submitted'],
  claimed: ['closed'],
  closed: [],
  cancelled: [],
};
const STATUS_TONE: Record<string, string> = {
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  bed_blocked: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  claimed: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  query: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
};
const SCHEMES = ['PMJAY', 'CGHS', 'ECHS', 'ESIC'];

interface Pkg { id: number; scheme: string; package_code: string; package_name: string; specialty?: string; package_rate: number | string; pre_auth_required: boolean; }
interface Preauth { id: number; scheme: string; beneficiary_id?: string; package_code?: string; package_name?: string; package_rate: number | string; status: string; approved_amount?: number | string; created_at: string; }

const InsuranceDeskSchemes = () => {
  const [tab, setTab] = useState<'packages' | 'preauths'>('packages');
  const [scheme, setScheme] = useState('PMJAY');
  const [q, setQ] = useState('');
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [preauths, setPreauths] = useState<Preauth[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [form, setForm] = useState({ scheme: 'PMJAY', beneficiaryId: '', packageCode: '', admissionDate: '', losDays: '' });

  const loadPackages = useCallback(async () => {
    setLoading(true); setError(null);
    try { const r = await api.get('/hospital/insurance/rcm/schemes/packages', { params: { scheme, q: q || undefined, limit: 200 } }); setPackages(r.data.packages || []); }
    catch (e: any) { setError(e?.response?.data?.message || 'Could not load packages.'); }
    finally { setLoading(false); }
  }, [scheme, q]);

  const loadPreauths = useCallback(async () => {
    setLoading(true); setError(null);
    try { const r = await api.get('/hospital/insurance/rcm/scheme-preauths', { params: { limit: 200 } }); setPreauths(r.data.preauths || []); }
    catch (e: any) { setError(e?.response?.data?.message || 'Could not load pre-auths.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { tab === 'packages' ? loadPackages() : loadPreauths(); }, [tab, loadPackages, loadPreauths]);

  const createPreauth = async () => {
    setError(null);
    try {
      await api.post('/hospital/insurance/rcm/scheme-preauths', {
        scheme: form.scheme, beneficiaryId: form.beneficiaryId || undefined, packageCode: form.packageCode || undefined,
        admissionDate: form.admissionDate || undefined, losDays: form.losDays ? Number(form.losDays) : undefined,
      });
      setForm({ scheme: 'PMJAY', beneficiaryId: '', packageCode: '', admissionDate: '', losDays: '' });
      await loadPreauths();
    } catch (e: any) { setError(e?.response?.data?.message || 'Could not create pre-auth.'); }
  };

  const transition = async (id: number, status: string) => {
    setBusyId(id);
    try { await api.post(`/hospital/insurance/rcm/scheme-preauths/${id}/transition`, { status }); await loadPreauths(); }
    catch (e: any) { setError(e?.response?.data?.message || 'Transition failed.'); }
    finally { setBusyId(null); }
  };

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Scheme Packages" subtitle="PM-JAY / CGHS / ECHS package master and scheme pre-authorisation" copilotModule="insurance">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <div className="flex gap-1">
          <Button size="sm" variant={tab === 'packages' ? 'default' : 'outline'} onClick={() => setTab('packages')}>Package master</Button>
          <Button size="sm" variant={tab === 'preauths' ? 'default' : 'outline'} onClick={() => setTab('preauths')}>Pre-auths (TMS)</Button>
        </div>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => (tab === 'packages' ? loadPackages() : loadPreauths())}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {error && <p className="text-sm text-amber-600 mb-3">{error}</p>}

      {tab === 'packages' ? (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="flex gap-1">
              {SCHEMES.map((s) => <Button key={s} size="sm" variant={scheme === s ? 'default' : 'outline'} onClick={() => setScheme(s)}>{s}</Button>)}
            </div>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search code / name / procedure…" value={q}
                onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loadPackages()} />
            </div>
            <Button size="sm" onClick={loadPackages}>Search</Button>
          </div>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…</div>
          ) : packages.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              No packages for {scheme}. Load the official master via <code>POST /rcm/schemes/packages/import</code> (admin).
            </CardContent></Card>
          ) : (
            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Code</TableHead><TableHead>Package</TableHead><TableHead>Specialty</TableHead>
                  <TableHead className="text-right">Rate</TableHead><TableHead>Pre-auth</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {packages.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.package_code}</TableCell>
                      <TableCell className="max-w-[320px]">{p.package_name}</TableCell>
                      <TableCell>{p.specialty || '—'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(p.package_rate))}</TableCell>
                      <TableCell>{p.pre_auth_required ? <Badge variant="secondary">Required</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}
        </>
      ) : (
        <>
          <Card className="mb-4"><CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
              <div><label className="text-xs text-muted-foreground">Scheme</label>
                <select className="w-full h-9 rounded-md border bg-background px-2 text-sm" value={form.scheme} onChange={(e) => setForm({ ...form, scheme: e.target.value })}>
                  {SCHEMES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">Beneficiary ID</label><Input value={form.beneficiaryId} onChange={(e) => setForm({ ...form, beneficiaryId: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">Package code</label><Input value={form.packageCode} onChange={(e) => setForm({ ...form, packageCode: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">Admission date</label><Input type="date" value={form.admissionDate} onChange={(e) => setForm({ ...form, admissionDate: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">LOS (days)</label><Input type="number" value={form.losDays} onChange={(e) => setForm({ ...form, losDays: e.target.value })} /></div>
              <Button className="gap-1" onClick={createPreauth}><PlusCircle className="h-4 w-4" /> Raise pre-auth</Button>
            </div>
          </CardContent></Card>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…</div>
          ) : preauths.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground"><Landmark className="h-6 w-6 mx-auto mb-2 opacity-50" />No scheme pre-auths yet.</CardContent></Card>
          ) : (
            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Scheme</TableHead><TableHead>Beneficiary</TableHead><TableHead>Package</TableHead>
                  <TableHead className="text-right">Rate</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {preauths.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.scheme}</TableCell>
                      <TableCell>{p.beneficiary_id || '—'}</TableCell>
                      <TableCell className="max-w-[240px] truncate" title={p.package_name || ''}>{p.package_code || '—'}{p.package_name ? ` · ${p.package_name}` : ''}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(p.approved_amount ?? p.package_rate))}</TableCell>
                      <TableCell><Badge className={`capitalize ${STATUS_TONE[p.status] || ''}`} variant="secondary">{p.status.replace('_', ' ')}</Badge></TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="inline-flex gap-1">
                          {(TRANSITIONS[p.status] || []).map((next) => (
                            <Button key={next} size="sm" variant="ghost" className="capitalize text-xs" disabled={busyId === p.id} onClick={() => transition(p.id, next)}>
                              {next.replace('_', ' ')}
                            </Button>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}
        </>
      )}
    </HospDeptLayout>
  );
};

export default InsuranceDeskSchemes;
