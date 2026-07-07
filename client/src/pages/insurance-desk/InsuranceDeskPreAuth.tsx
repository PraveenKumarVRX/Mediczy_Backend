import { useEffect, useState, useCallback } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  ShieldCheck, ClipboardList, FileText, Building2, UserCheck,
  Search, BarChart3, Settings, HelpCircle, RefreshCw, Loader2, ArrowRightCircle,
  ClipboardCheck, CheckCircle2, XCircle, AlertTriangle, MinusCircle,
} from 'lucide-react';
import api from '@/utils/api';

import { navSections } from './navSections';

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

interface AuditCheck { key: string; label: string; status: 'pass' | 'fail' | 'warning' | 'not_applicable'; detail: string }
interface AuditResult { canClearDischarge: boolean; checks: AuditCheck[]; generatedAt: string }

const CHECK_ICON: Record<AuditCheck['status'], JSX.Element> = {
  pass: <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />,
  fail: <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />,
  not_applicable: <MinusCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />,
};

function PreAuthTable({ rows, loading, emptyLabel, dateField, onConvert, convertingId, onAudit }: {
  rows: PreAuth[]; loading: boolean; emptyLabel: string; dateField: 'submittedAt' | 'approvedAt' | 'rejectedAt';
  onConvert?: (row: PreAuth) => void; convertingId?: number | null; onAudit?: (row: PreAuth) => void;
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
            {(onConvert || onAudit) && <TableHead />}
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
              {(onConvert || onAudit) && (
                <TableCell>
                  <div className="flex gap-1.5">
                    {onAudit && (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => onAudit(row)}>
                        <ClipboardCheck className="h-3.5 w-3.5" /> Discharge Audit
                      </Button>
                    )}
                    {onConvert && (
                      <Button size="sm" variant="outline" className="gap-1" disabled={convertingId === row.id} onClick={() => onConvert(row)}>
                        {convertingId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightCircle className="h-3.5 w-3.5" />}
                        Convert to Claim
                      </Button>
                    )}
                  </div>
                </TableCell>
              )}
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
  const [convertingId, setConvertingId] = useState<number | null>(null);
  const [convertMessage, setConvertMessage] = useState<string | null>(null);

  const [auditOpen, setAuditOpen] = useState(false);
  const [auditingRow, setAuditingRow] = useState<PreAuth | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [clearing, setClearing] = useState(false);
  const [clearedMessage, setClearedMessage] = useState<string | null>(null);

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

  const convertToClaim = async (row: PreAuth) => {
    if (!window.confirm(`Convert pre-auth ${row.preAuthNumber} into a claim for ${formatCurrency(row.approvedAmount ?? row.estimatedAmount)}?`)) {
      return;
    }
    setConvertingId(row.id);
    setConvertMessage(null);
    setError(null);
    try {
      const { data } = await api.post(`/hospital/insurance/discharge/${row.id}`, {
        totalAmount: row.approvedAmount ?? row.estimatedAmount,
      });
      setConvertMessage(`Claim ${data.claim?.claimNumber || ''} created from ${row.preAuthNumber}.`);
      load('approved');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not convert pre-authorization to a claim.');
    } finally {
      setConvertingId(null);
    }
  };

  const openAudit = async (row: PreAuth) => {
    setAuditingRow(row);
    setAuditOpen(true);
    setAuditResult(null);
    setAuditError(null);
    setShowOverride(false);
    setOverrideReason('');
    setClearedMessage(null);
    setAuditLoading(true);
    try {
      const { data } = await api.get(`/hospital/insurance/pre-auth/${row.id}/discharge-audit`);
      setAuditResult(data.audit);
    } catch (err: any) {
      setAuditError(err?.response?.data?.message || 'Could not run discharge audit.');
    } finally {
      setAuditLoading(false);
    }
  };

  const clearDischarge = async (withOverride: boolean) => {
    if (!auditingRow) return;
    if (withOverride && !overrideReason.trim()) {
      setAuditError('An override reason is required.');
      return;
    }
    setClearing(true);
    setAuditError(null);
    try {
      const { data } = await api.post(`/hospital/insurance/pre-auth/${auditingRow.id}/discharge-clearance`, {
        override: withOverride,
        overrideReason: withOverride ? overrideReason.trim() : undefined,
      });
      setClearedMessage(`Discharge clearance recorded for ${auditingRow.preAuthNumber}${data.clearance.overridden ? ' (overridden)' : ''} — the ward can proceed.`);
      setShowOverride(false);
    } catch (err: any) {
      setAuditError(err?.response?.data?.message || 'Could not record discharge clearance.');
    } finally {
      setClearing(false);
    }
  };

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
          {convertMessage && <p className="text-sm text-emerald-600 mb-3">{convertMessage}</p>}
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
              <PreAuthTable
                rows={rowsByTab.approved} loading={loading} emptyLabel="No approved pre-authorizations yet." dateField="approvedAt"
                onConvert={convertToClaim} convertingId={convertingId} onAudit={openAudit}
              />
            </TabsContent>
            <TabsContent value="rejected">
              <PreAuthTable rows={rowsByTab.rejected} loading={loading} emptyLabel="No rejected pre-authorizations." dateField="rejectedAt" />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pre-Discharge Audit — {auditingRow?.preAuthNumber}</DialogTitle>
          </DialogHeader>
          {auditLoading ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Running audit…
            </div>
          ) : auditError && !auditResult ? (
            <p className="text-sm text-red-600">{auditError}</p>
          ) : auditResult ? (
            <div className="space-y-3">
              <div className={`flex items-center gap-2 text-sm font-medium ${auditResult.canClearDischarge ? 'text-emerald-600' : 'text-red-600'}`}>
                {auditResult.canClearDischarge ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {auditResult.canClearDischarge ? 'Clear to discharge — all checks pass' : 'Not clear to discharge — see failing checks below'}
              </div>
              <div className="space-y-2">
                {auditResult.checks.map((c) => (
                  <div key={c.key} className="flex items-start gap-2 text-sm">
                    {CHECK_ICON[c.status]}
                    <div>
                      <p className="font-medium">{c.label}</p>
                      <p className="text-muted-foreground text-xs">{c.detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              {clearedMessage ? (
                <p className="text-sm text-emerald-600">{clearedMessage}</p>
              ) : (
                <>
                  {auditError && <p className="text-sm text-red-600">{auditError}</p>}
                  {showOverride && (
                    <div className="space-y-2 border rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20">
                      <Label className="text-xs">Override reason (required)</Label>
                      <Textarea rows={2} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="e.g. Family committed to settle balance within 24h, verbally confirmed by billing manager." />
                    </div>
                  )}
                </>
              )}
            </div>
          ) : null}
          {!clearedMessage && auditResult && (
            <DialogFooter className="gap-2 sm:gap-2">
              {auditResult.canClearDischarge ? (
                <Button className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => clearDischarge(false)} disabled={clearing}>
                  {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                  Clear for Discharge
                </Button>
              ) : showOverride ? (
                <Button variant="destructive" className="gap-1" onClick={() => clearDischarge(true)} disabled={clearing}>
                  {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                  Confirm Override & Clear
                </Button>
              ) : (
                <Button variant="outline" className="gap-1 border-amber-400 text-amber-700" onClick={() => setShowOverride(true)}>
                  <AlertTriangle className="h-4 w-4" /> Override & Clear Anyway
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </HospDeptLayout>
  );
};

export default InsuranceDeskPreAuth;
