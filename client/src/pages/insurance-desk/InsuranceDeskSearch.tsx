import { useState } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ShieldCheck, ClipboardList, FileText, Building2, UserCheck,
  Search, BarChart3, Settings, HelpCircle, Loader2, X,
} from 'lucide-react';
import api from '@/utils/api';

const navSections: DeptNavSection[] = [
  { title: 'Overview', items: [{ icon: ShieldCheck, label: 'Dashboard', href: '/insurance-desk/dashboard' }] },
  { title: 'Claims & Auth', items: [
    { icon: ClipboardList, label: 'Pre-Authorization',   href: '/insurance-desk/pre-auth' },
    { icon: FileText,      label: 'Active Claims',       href: '/insurance-desk/claims' },
    { icon: FileText,      label: 'Documents',           href: '/insurance-desk/documents' },
  ]},
  { title: 'Management', items: [
    { icon: Building2,  label: 'TPA Management',      href: '/insurance-desk/tpa' },
    { icon: UserCheck,  label: 'Patient Insurance',   href: '/insurance-desk/patient-insurance' },
    { icon: Search,     label: 'Claim Search',        href: '/insurance-desk/search' },
  ]},
  { title: 'Reports', items: [
    { icon: BarChart3,  label: 'Analytics', href: '/insurance-desk/analytics' },
    { icon: Settings,   label: 'Settings',  href: '/insurance-desk/settings' },
    { icon: HelpCircle, label: 'Support',   href: '/insurance-desk/support' },
  ]},
];

interface ClaimResult {
  id: number;
  claimNumber: string;
  policyNumber: string;
  claimAmount: number;
  status: string;
  insuranceProvider?: string | null;
  patient?: { id: number; firstName: string; lastName: string; email?: string } | null;
}

interface HistoryEvent {
  event: string;
  timestamp?: string;
  status?: string;
  details?: string;
  approvedAmount?: number;
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  query: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
};

const formatCurrency = (amount?: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);

const InsuranceDeskSearch = () => {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<ClaimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [selected, setSelected] = useState<ClaimResult | null>(null);
  const [history, setHistory] = useState<HistoryEvent[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const search = async () => {
    if (!term.trim()) return;
    setSearching(true);
    setError(null);
    setHasSearched(true);
    setSelected(null);
    setHistory(null);
    try {
      const { data } = await api.post('/hospital/insurance/dashboard/search', { searchTerm: term.trim() });
      setResults(data.results || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Search failed.');
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const openHistory = async (claim: ClaimResult) => {
    setSelected(claim);
    setLoadingHistory(true);
    setHistory(null);
    try {
      const { data } = await api.get(`/hospital/insurance/claims/${claim.id}/history`);
      setHistory(data.timeline || data.history || []);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Claim Search" subtitle="Search claims by ID, patient, or policy number" copilotModule="insurance">
      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Claim number, policy number, or patient ID…"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
              />
            </div>
            <Button onClick={search} disabled={searching} className="gap-1 bg-teal-600 hover:bg-teal-700">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </CardContent>
      </Card>

      {hasSearched && !searching && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Results ({results.length})</CardTitle></CardHeader>
          <CardContent>
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No claims matched "{term}".</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Claim #</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Policy #</TableHead>
                      <TableHead>Insurer</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((claim) => (
                      <TableRow key={claim.id}>
                        <TableCell className="font-mono text-xs">{claim.claimNumber}</TableCell>
                        <TableCell>{claim.patient ? `${claim.patient.firstName} ${claim.patient.lastName}` : '—'}</TableCell>
                        <TableCell>{claim.policyNumber}</TableCell>
                        <TableCell>{claim.insuranceProvider || '—'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(claim.claimAmount)}</TableCell>
                        <TableCell><Badge className={STATUS_STYLES[claim.status] || ''} variant="outline">{claim.status}</Badge></TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => openHistory(claim)}>Timeline</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selected && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Timeline — {selected.claimNumber}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}><X className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading timeline…</div>
            ) : !history || history.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No timeline events recorded yet.</p>
            ) : (
              <div className="relative pl-4 border-l-2 border-teal-200 dark:border-teal-900 space-y-4">
                {history.map((h, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-teal-500" />
                    <p className="text-sm font-medium">{h.event}</p>
                    {h.timestamp && <p className="text-xs text-muted-foreground">{new Date(h.timestamp).toLocaleString('en-IN')}</p>}
                    {h.details && <p className="text-sm mt-0.5">{h.details}</p>}
                    {h.approvedAmount != null && <p className="text-sm mt-0.5">Approved: {formatCurrency(h.approvedAmount)}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </HospDeptLayout>
  );
};

export default InsuranceDeskSearch;
