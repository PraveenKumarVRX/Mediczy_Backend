import { useEffect, useState, useCallback } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ShieldCheck, ClipboardList, FileText, Building2, UserCheck,
  Search, BarChart3, Settings, HelpCircle, RefreshCw, Loader2,
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

interface Claim {
  id: number;
  claimNumber: string;
  claimAmount: number;
  approvedAmount?: number | null;
  settledAmount?: number | null;
  status: string;
  policyNumber: string;
  claimType?: string;
  insurerName?: string | null;
  patientName?: string | null;
  createdAt?: string;
}

const STATUS_STYLES: Record<string, string> = {
  draft:     'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  pending:   'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  approved:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  settled:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  rejected:  'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  query:     'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
};

const formatCurrency = (amount?: number | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString('en-IN') : '—');

const InsuranceDeskClaims = () => {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async (searchTerm?: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/hospital/insurance/claims', {
        params: { page: 1, limit: 50, ...(searchTerm ? { search: searchTerm } : {}) },
      });
      setClaims(data.claims || []);
      if (data.degraded) setError('Some claim data may be unavailable right now.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load claims.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Active Claims" subtitle="Monitor claim lifecycle" copilotModule="insurance">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3 gap-3">
          <CardTitle className="text-base whitespace-nowrap">Insurance Claims</CardTitle>
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by claim # or policy #"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load(search); }}
            />
          </div>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => load(search)}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-amber-600 mb-3">{error}</p>}
          {loading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
            </div>
          ) : claims.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl">
              <FileText className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No claims found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim #</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Insurer</TableHead>
                    <TableHead>Policy #</TableHead>
                    <TableHead className="text-right">Claimed</TableHead>
                    <TableHead className="text-right">Approved</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claims.map((claim) => (
                    <TableRow key={claim.id}>
                      <TableCell className="font-mono text-xs">{claim.claimNumber}</TableCell>
                      <TableCell>{claim.patientName || '—'}</TableCell>
                      <TableCell>{claim.insurerName || '—'}</TableCell>
                      <TableCell>{claim.policyNumber}</TableCell>
                      <TableCell className="text-right">{formatCurrency(claim.claimAmount)}</TableCell>
                      <TableCell className="text-right">{claim.approvedAmount != null ? formatCurrency(claim.approvedAmount) : '—'}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLES[claim.status] || ''} variant="outline">{claim.status}</Badge>
                      </TableCell>
                      <TableCell>{formatDate(claim.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </HospDeptLayout>
  );
};

export default InsuranceDeskClaims;
