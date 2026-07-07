import { useEffect, useState, useCallback } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

interface PreAuth {
  id: number;
  preAuthNumber: string;
  policyNumber: string;
  estimatedAmount: number;
  approvedAmount?: number | null;
  status: string;
  diagnosis?: string;
  submittedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string | null;
  patient?: { id: number; firstName: string; lastName: string; email?: string } | null;
}

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

const formatCurrency = (amount?: number | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString('en-IN') : '—');

function PreAuthTable({ rows, loading, emptyLabel, dateField }: {
  rows: PreAuth[]; loading: boolean; emptyLabel: string; dateField: 'submittedAt' | 'approvedAt' | 'rejectedAt';
}) {
  if (loading) {
    return (
      <div className="h-48 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="h-48 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl">
        <ClipboardList className="h-8 w-8 mb-2 opacity-30" />
        <p className="text-sm">{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pre-Auth #</TableHead>
            <TableHead>Patient</TableHead>
            <TableHead>Policy #</TableHead>
            <TableHead>Diagnosis</TableHead>
            <TableHead className="text-right">Estimated</TableHead>
            <TableHead className="text-right">Approved</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-xs">{row.preAuthNumber}</TableCell>
              <TableCell>{row.patient ? `${row.patient.firstName} ${row.patient.lastName}` : '—'}</TableCell>
              <TableCell>{row.policyNumber}</TableCell>
              <TableCell className="max-w-[200px] truncate">{row.diagnosis || '—'}</TableCell>
              <TableCell className="text-right">{formatCurrency(row.estimatedAmount)}</TableCell>
              <TableCell className="text-right">{row.approvedAmount != null ? formatCurrency(row.approvedAmount) : '—'}</TableCell>
              <TableCell>
                <Badge className={STATUS_STYLES[row.status] || ''} variant="outline">{row.status}</Badge>
              </TableCell>
              <TableCell>{formatDate(row[dateField])}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const InsuranceDeskPreAuth = () => {
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [rowsByTab, setRowsByTab] = useState<Record<string, PreAuth[]>>({ pending: [], approved: [], rejected: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (which: 'pending' | 'approved' | 'rejected') => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/hospital/insurance/pre-auth/${which}`, { params: { page: 1, limit: 50 } });
      setRowsByTab((prev) => ({ ...prev, [which]: data.preAuths || [] }));
      if (data.degraded) setError(data.message || 'Some data may be unavailable.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load pre-authorizations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Pre-Authorization" subtitle="Request & track pre-auth approvals" copilotModule="insurance">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Pre-Authorization Requests</CardTitle>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => load(tab)}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-amber-600 mb-3">{error}</p>}
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>
            <TabsContent value="pending">
              <PreAuthTable rows={rowsByTab.pending} loading={loading} emptyLabel="No pending pre-authorizations." dateField="submittedAt" />
            </TabsContent>
            <TabsContent value="approved">
              <PreAuthTable rows={rowsByTab.approved} loading={loading} emptyLabel="No approved pre-authorizations yet." dateField="approvedAt" />
            </TabsContent>
            <TabsContent value="rejected">
              <PreAuthTable rows={rowsByTab.rejected} loading={loading} emptyLabel="No rejected pre-authorizations." dateField="rejectedAt" />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </HospDeptLayout>
  );
};

export default InsuranceDeskPreAuth;
