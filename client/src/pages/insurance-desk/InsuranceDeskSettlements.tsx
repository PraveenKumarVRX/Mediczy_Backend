import { useEffect, useState, useCallback } from 'react';
import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShieldCheck, RefreshCw, Loader2, Landmark } from 'lucide-react';
import api from '@/utils/api';
import { navSections } from './navSections';

interface Settlement {
  claimNumber: string;
  patientName: string;
  insurer: string;
  billedAmount: number;
  approvedAmount?: number | null;
  settledAmount?: number | null;
  status: string;
  settlementDate?: string | null;
  diagnosis: string;
  pendingAmount: number;
}

const formatCurrency = (amount?: number | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);

const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

const STATUS_STYLES: Record<string, string> = {
  settled: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  pending: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

const InsuranceDeskSettlements = () => {
  const [rows, setRows] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/hospital/insurance/revenue/settlement-status');
      setRows(data.settlements || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load settlement status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totals = rows.reduce((acc, r) => ({
    billed: acc.billed + (r.billedAmount || 0),
    approved: acc.approved + (r.approvedAmount || 0),
    settled: acc.settled + (r.settledAmount || 0),
    pending: acc.pending + (r.pendingAmount || 0),
  }), { billed: 0, approved: 0, settled: 0, pending: 0 });

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Settlement Status" subtitle="Approved claims — settlement tracking and pending recovery" copilotModule="insurance">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total Billed</p><p className="text-xl font-bold">{formatCurrency(totals.billed)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total Approved</p><p className="text-xl font-bold text-blue-600">{formatCurrency(totals.approved)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total Settled</p><p className="text-xl font-bold text-emerald-600">{formatCurrency(totals.settled)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Pending Recovery</p><p className="text-xl font-bold text-amber-600">{formatCurrency(totals.pending)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Landmark className="h-4 w-4 text-teal-600" /> Approved Claims — Settlement Tracking</CardTitle>
          <Button variant="outline" size="sm" className="gap-1" onClick={load}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-amber-600 mb-3">{error}</p>}
          {loading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…</div>
          ) : rows.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl">
              <Landmark className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No approved claims awaiting settlement tracking.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim #</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Insurer</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                    <TableHead className="text-right">Approved</TableHead>
                    <TableHead className="text-right">Settled</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Settled On</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{r.claimNumber}</TableCell>
                      <TableCell>{r.patientName}</TableCell>
                      <TableCell>{r.insurer}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.billedAmount)}</TableCell>
                      <TableCell className="text-right">{r.approvedAmount != null ? formatCurrency(r.approvedAmount) : '—'}</TableCell>
                      <TableCell className="text-right">{r.settledAmount != null ? formatCurrency(r.settledAmount) : '—'}</TableCell>
                      <TableCell className="text-right">{r.pendingAmount > 0 ? <span className="text-amber-600 font-medium">{formatCurrency(r.pendingAmount)}</span> : '—'}</TableCell>
                      <TableCell><Badge className={STATUS_STYLES[r.status] || ''} variant="outline">{r.status || 'pending'}</Badge></TableCell>
                      <TableCell>{formatDate(r.settlementDate)}</TableCell>
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

export default InsuranceDeskSettlements;
