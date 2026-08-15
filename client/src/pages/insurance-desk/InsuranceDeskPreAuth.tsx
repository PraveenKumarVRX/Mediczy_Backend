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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ShieldCheck, ClipboardList, FileText, Building2, UserCheck,
  Search, BarChart3, Settings, HelpCircle, RefreshCw, Loader2, ArrowRightCircle,
  ClipboardCheck, CheckCircle2, XCircle, AlertTriangle, MinusCircle, Plus, Download,
  CalendarClock, Stethoscope, Receipt, BedDouble,
} from 'lucide-react';
import api from '@/utils/api';

import { navSections } from './navSections';

// Mirrors the insurerCode keys server/services/pdf-generator.service.js knows how
// to brand the printed form for (direct-settlement insurers and TPA-routed ones
// via its INSURER_DEFAULT_TPA map) — picking one here is what makes the printed
// pre-auth form auto-select the right TPA letterhead and IRDAI license number.
const INSURERS: { code: string; label: string }[] = [
  { code: 'star_health', label: 'Star Health & Allied Insurance' },
  { code: 'icici_lombard', label: 'ICICI Lombard General Insurance' },
  { code: 'care_health', label: 'Care Health Insurance' },
  { code: 'bajaj_allianz', label: 'Bajaj Allianz General Insurance' },
  { code: 'niva_bupa', label: 'Niva Bupa Health Insurance' },
  { code: 'manipal_cigna', label: 'ManipalCigna Health Insurance' },
  { code: 'galaxy', label: 'Galaxy Health Insurance' },
  { code: 'new_india', label: 'New India Assurance' },
  { code: 'united_india', label: 'United India Insurance' },
  { code: 'oriental', label: 'Oriental Insurance' },
  { code: 'hdfc_ergo', label: 'HDFC ERGO General Insurance' },
  { code: 'tata_aig', label: 'Tata AIG General Insurance' },
  { code: 'sbi_general', label: 'SBI General Insurance' },
  { code: 'national', label: 'National Insurance' },
  { code: 'aditya_birla', label: 'Aditya Birla Health Insurance' },
  { code: 'future_generali', label: 'Future Generali India Insurance' },
  { code: 'reliance', label: 'Reliance General Insurance' },
  { code: 'go_digit', label: 'Go Digit General Insurance' },
  { code: 'cghs', label: 'CGHS (Government)' },
  { code: 'esic', label: 'ESIC (Government)' },
  { code: 'iffco_tokio', label: 'IFFCO Tokio General Insurance' },
  { code: 'royal_sundaram', label: 'Royal Sundaram General Insurance' },
  { code: 'liberty', label: 'Liberty General Insurance' },
  { code: 'cholamandalam', label: 'Cholamandalam MS General Insurance' },
];

const emptyNewPreAuth = {
  patientId: '', policyNumber: '', insurerCode: '', sumInsured: '',
  admissionType: 'planned', admissionDate: '', doctorName: '', ward: '',
  roomRatePerDay: '', estimatedDuration: '', icuDays: '', icuRate: '',
  diagnosis: '', icdCode: '', procedure: '', procedureCode: '',
  proposedTreatment: '', clinicalJustification: '', pastHospitalization: '', surgicalManagement: '',
  surgeonFees: '', anaesthetistFees: '', otCharges: '', medicinesCost: '', investigationsCost: '', physioCost: '', miscCharges: '',
  remarks: '',
};

const num = (v: string) => (v.trim() ? Number(v) : 0);

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

function PreAuthTable({ rows, loading, emptyLabel, dateField, onConvert, convertingId, onAudit, onDownload, downloadingId }: {
  rows: PreAuth[]; loading: boolean; emptyLabel: string; dateField: 'submittedAt' | 'approvedAt' | 'rejectedAt';
  onConvert?: (row: PreAuth) => void; convertingId?: number | null; onAudit?: (row: PreAuth) => void;
  onDownload: (row: PreAuth) => void; downloadingId: number | null;
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
            <TableHead />
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
              <TableCell>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" className="h-7 px-2" disabled={downloadingId === row.id} onClick={() => onDownload(row)} title="Print / download pre-auth form">
                    {downloadingId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  </Button>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const InsuranceDeskPreAuth = () => {
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [kpiStats, setKpiStats] = useState<{ pending: number; approved: number; rejected: number; expiringSoon: number } | null>(null);
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
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [newPreAuth, setNewPreAuth] = useState(emptyNewPreAuth);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const roomCost = num(newPreAuth.roomRatePerDay) * num(newPreAuth.estimatedDuration);
  const icuCost = num(newPreAuth.icuRate) * num(newPreAuth.icuDays);
  const otherCosts = num(newPreAuth.surgeonFees) + num(newPreAuth.anaesthetistFees) + num(newPreAuth.otCharges)
    + num(newPreAuth.medicinesCost) + num(newPreAuth.investigationsCost) + num(newPreAuth.physioCost) + num(newPreAuth.miscCharges);
  const totalEstimate = roomCost + icuCost + otherCosts;

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

  const loadKpiStats = useCallback(async () => {
    try {
      const [pendingRes, approvedRes, rejectedRes, dashRes] = await Promise.all([
        api.get('/hospital/insurance/pre-auth/pending', { params: { limit: 1 } }),
        api.get('/hospital/insurance/pre-auth/approved', { params: { limit: 1 } }),
        api.get('/hospital/insurance/pre-auth/rejected', { params: { limit: 1 } }),
        api.get('/hospital/insurance/dashboard'),
      ]);
      setKpiStats({
        pending: pendingRes.data.pagination?.total ?? 0,
        approved: approvedRes.data.pagination?.total ?? 0,
        rejected: rejectedRes.data.pagination?.total ?? 0,
        expiringSoon: dashRes.data.dashboard?.alerts?.expiringSoon ?? 0,
      });
    } catch {
      setKpiStats(null);
    }
  }, []);

  useEffect(() => { loadKpiStats(); }, [loadKpiStats]);

  const createPreAuth = async () => {
    const patientId = parseInt(newPreAuth.patientId, 10);
    if (!patientId || !newPreAuth.policyNumber.trim() || !newPreAuth.insurerCode || !newPreAuth.diagnosis.trim()) {
      setCreateError('Patient ID, policy number, insurer, and diagnosis are required.');
      return;
    }
    if (!(totalEstimate > 0)) {
      setCreateError('Enter at least one cost estimate line item (room rate, procedure charges, etc.).');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const insurer = INSURERS.find((i) => i.code === newPreAuth.insurerCode);
      await api.post('/hospital/insurance/pre-auth/new', {
        patientId,
        policyNumber: newPreAuth.policyNumber.trim(),
        estimatedAmount: totalEstimate,
        diagnosis: newPreAuth.diagnosis.trim(),
        estimatedDuration: newPreAuth.estimatedDuration ? parseInt(newPreAuth.estimatedDuration, 10) : undefined,
        plannedProcedures: newPreAuth.procedure.trim() ? [{
          description: newPreAuth.procedure.trim(),
          code: newPreAuth.procedureCode.trim() || undefined,
          icdCode: newPreAuth.icdCode.trim() || undefined,
          proposedTreatment: newPreAuth.proposedTreatment.trim() || undefined,
        }] : [],
        remarks: newPreAuth.remarks.trim() || undefined,
        admissionDetails: {
          insurerCode: newPreAuth.insurerCode,
          insurerName: insurer?.label,
          sumInsured: newPreAuth.sumInsured ? Number(newPreAuth.sumInsured) : undefined,
          admissionType: newPreAuth.admissionType,
          admissionDate: newPreAuth.admissionDate || undefined,
          doctorName: newPreAuth.doctorName.trim() || undefined,
          ward: newPreAuth.ward.trim() || 'General',
          roomRatePerDay: newPreAuth.roomRatePerDay ? Number(newPreAuth.roomRatePerDay) : undefined,
          icuDays: newPreAuth.icuDays ? Number(newPreAuth.icuDays) : undefined,
          icuRate: newPreAuth.icuRate ? Number(newPreAuth.icuRate) : undefined,
          diagnosis: newPreAuth.diagnosis.trim(),
          icdCode: newPreAuth.icdCode.trim() || undefined,
          procedure: newPreAuth.procedure.trim() || undefined,
          procedureCode: newPreAuth.procedureCode.trim() || undefined,
          proposedTreatment: newPreAuth.proposedTreatment.trim() || undefined,
          clinicalJustification: newPreAuth.clinicalJustification.trim() || undefined,
          pastHospitalization: newPreAuth.pastHospitalization.trim() || undefined,
          surgicalManagement: newPreAuth.surgicalManagement.trim() || undefined,
          surgeonFees: num(newPreAuth.surgeonFees) || undefined,
          anaesthetistFees: num(newPreAuth.anaesthetistFees) || undefined,
          otCharges: num(newPreAuth.otCharges) || undefined,
          medicinesCost: num(newPreAuth.medicinesCost) || undefined,
          investigationsCost: num(newPreAuth.investigationsCost) || undefined,
          physioCost: num(newPreAuth.physioCost) || undefined,
          miscCharges: num(newPreAuth.miscCharges) || undefined,
        },
      });
      setShowNew(false);
      setNewPreAuth(emptyNewPreAuth);
      setTab('pending');
      load('pending');
      loadKpiStats();
    } catch (err: any) {
      setCreateError(err?.response?.data?.message || 'Could not submit pre-authorization request.');
    } finally {
      setCreating(false);
    }
  };

  const downloadPdf = async (row: PreAuth) => {
    setDownloadingId(row.id);
    try {
      const response = await api.get(`/hospital/insurance/pre-auth/${row.id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${row.preAuthNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not download PDF.');
    } finally {
      setDownloadingId(null);
    }
  };

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
      loadKpiStats();
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
          <div className="flex gap-2">
            <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4" /> Request Pre-Auth
            </Button>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => load(tab)}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-amber-600 mb-3">{error}</p>}
          {convertMessage && <p className="text-sm text-emerald-600 mb-3">{convertMessage}</p>}

          {/* KPI tiles double as quick filters — click to jump to that tab */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <button onClick={() => setTab('pending')} className={`text-left rounded-xl border p-3 transition-colors ${tab === 'pending' ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30' : 'hover:bg-muted/50'}`}>
              <div className="flex items-center gap-1.5 text-amber-600 mb-1"><CalendarClock className="h-3.5 w-3.5" /><span className="text-xs font-medium">Pending</span></div>
              <p className="text-xl font-bold">{kpiStats?.pending ?? '—'}</p>
            </button>
            <button onClick={() => setTab('approved')} className={`text-left rounded-xl border p-3 transition-colors ${tab === 'approved' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'hover:bg-muted/50'}`}>
              <div className="flex items-center gap-1.5 text-emerald-600 mb-1"><CheckCircle2 className="h-3.5 w-3.5" /><span className="text-xs font-medium">Approved</span></div>
              <p className="text-xl font-bold">{kpiStats?.approved ?? '—'}</p>
            </button>
            <button onClick={() => setTab('rejected')} className={`text-left rounded-xl border p-3 transition-colors ${tab === 'rejected' ? 'border-red-400 bg-red-50 dark:bg-red-950/30' : 'hover:bg-muted/50'}`}>
              <div className="flex items-center gap-1.5 text-red-500 mb-1"><XCircle className="h-3.5 w-3.5" /><span className="text-xs font-medium">Rejected</span></div>
              <p className="text-xl font-bold">{kpiStats?.rejected ?? '—'}</p>
            </button>
            <div className="text-left rounded-xl border p-3">
              <div className="flex items-center gap-1.5 text-violet-600 mb-1"><AlertTriangle className="h-3.5 w-3.5" /><span className="text-xs font-medium">Expiring Soon</span></div>
              <p className="text-xl font-bold">{kpiStats?.expiringSoon ?? '—'}</p>
            </div>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>
            <TabsContent value="pending">
              <PreAuthTable rows={rowsByTab.pending} loading={loading} emptyLabel="No pending pre-authorizations." dateField="submittedAt" onDownload={downloadPdf} downloadingId={downloadingId} />
            </TabsContent>
            <TabsContent value="approved">
              <PreAuthTable
                rows={rowsByTab.approved} loading={loading} emptyLabel="No approved pre-authorizations yet." dateField="approvedAt"
                onConvert={convertToClaim} convertingId={convertingId} onAudit={openAudit}
                onDownload={downloadPdf} downloadingId={downloadingId}
              />
            </TabsContent>
            <TabsContent value="rejected">
              <PreAuthTable rows={rowsByTab.rejected} loading={loading} emptyLabel="No rejected pre-authorizations." dateField="rejectedAt" onDownload={downloadPdf} downloadingId={downloadingId} />
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

      <Dialog open={showNew} onOpenChange={(open) => { setShowNew(open); if (!open) setCreateError(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Pre-Authorization</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {createError && <p className="text-sm text-red-600">{createError}</p>}
            <p className="text-xs text-muted-foreground -mt-2">
              These fields populate the printed IRDAI-format pre-authorization form (Parts C–F) — the insurer you
              pick here selects that TPA's letterhead and reference-number field automatically.
            </p>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5" /> Patient &amp; Policy</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Patient ID *</Label>
                  <Input value={newPreAuth.patientId} onChange={(e) => setNewPreAuth((p) => ({ ...p, patientId: e.target.value }))} placeholder="e.g. 9" />
                </div>
                <div>
                  <Label>Policy Number *</Label>
                  <Input value={newPreAuth.policyNumber} onChange={(e) => setNewPreAuth((p) => ({ ...p, policyNumber: e.target.value }))} />
                </div>
                <div>
                  <Label>Insurer *</Label>
                  <Select value={newPreAuth.insurerCode} onValueChange={(v) => setNewPreAuth((p) => ({ ...p, insurerCode: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select insurer" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {INSURERS.map((i) => <SelectItem key={i.code} value={i.code}>{i.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Sum Insured (₹)</Label>
                  <Input type="number" value={newPreAuth.sumInsured} onChange={(e) => setNewPreAuth((p) => ({ ...p, sumInsured: e.target.value }))} placeholder="e.g. 500000" />
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><BedDouble className="h-3.5 w-3.5" /> Admission</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type of Admission</Label>
                  <Select value={newPreAuth.admissionType} onValueChange={(v) => setNewPreAuth((p) => ({ ...p, admissionType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planned">Planned</SelectItem>
                      <SelectItem value="emergency">Emergency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Planned Admission Date</Label>
                  <Input type="date" value={newPreAuth.admissionDate} onChange={(e) => setNewPreAuth((p) => ({ ...p, admissionDate: e.target.value }))} />
                </div>
                <div>
                  <Label>Treating Doctor</Label>
                  <Input value={newPreAuth.doctorName} onChange={(e) => setNewPreAuth((p) => ({ ...p, doctorName: e.target.value }))} placeholder="Dr. Name" />
                </div>
                <div>
                  <Label>Expected Duration (days)</Label>
                  <Input type="number" value={newPreAuth.estimatedDuration} onChange={(e) => setNewPreAuth((p) => ({ ...p, estimatedDuration: e.target.value }))} />
                </div>
                <div>
                  <Label>Ward / Room Type</Label>
                  <Input value={newPreAuth.ward} onChange={(e) => setNewPreAuth((p) => ({ ...p, ward: e.target.value }))} placeholder="General" />
                </div>
                <div>
                  <Label>Room Tariff / Day (₹)</Label>
                  <Input type="number" value={newPreAuth.roomRatePerDay} onChange={(e) => setNewPreAuth((p) => ({ ...p, roomRatePerDay: e.target.value }))} />
                </div>
                <div>
                  <Label>Expected ICU Days</Label>
                  <Input type="number" value={newPreAuth.icuDays} onChange={(e) => setNewPreAuth((p) => ({ ...p, icuDays: e.target.value }))} />
                </div>
                <div>
                  <Label>ICU Tariff / Day (₹)</Label>
                  <Input type="number" value={newPreAuth.icuRate} onChange={(e) => setNewPreAuth((p) => ({ ...p, icuRate: e.target.value }))} />
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Diagnosis &amp; Clinical Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Primary Diagnosis *</Label>
                  <Input value={newPreAuth.diagnosis} onChange={(e) => setNewPreAuth((p) => ({ ...p, diagnosis: e.target.value }))} />
                </div>
                <div>
                  <Label>ICD-10 Code</Label>
                  <Input value={newPreAuth.icdCode} onChange={(e) => setNewPreAuth((p) => ({ ...p, icdCode: e.target.value }))} placeholder="e.g. K35.8" />
                </div>
                <div>
                  <Label>Proposed Procedure</Label>
                  <Input value={newPreAuth.procedure} onChange={(e) => setNewPreAuth((p) => ({ ...p, procedure: e.target.value }))} placeholder="e.g. Laparoscopic Cholecystectomy" />
                </div>
                <div>
                  <Label>Procedure Code</Label>
                  <Input value={newPreAuth.procedureCode} onChange={(e) => setNewPreAuth((p) => ({ ...p, procedureCode: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label>Proposed Treatment Plan</Label>
                  <Textarea rows={2} value={newPreAuth.proposedTreatment} onChange={(e) => setNewPreAuth((p) => ({ ...p, proposedTreatment: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label>Clinical Justification</Label>
                  <Textarea rows={2} value={newPreAuth.clinicalJustification} onChange={(e) => setNewPreAuth((p) => ({ ...p, clinicalJustification: e.target.value }))} />
                </div>
                <div>
                  <Label>Past Hospitalization (last 4 yrs)</Label>
                  <Input value={newPreAuth.pastHospitalization} onChange={(e) => setNewPreAuth((p) => ({ ...p, pastHospitalization: e.target.value }))} placeholder="None" />
                </div>
                <div>
                  <Label>Surgical Management</Label>
                  <Input value={newPreAuth.surgicalManagement} onChange={(e) => setNewPreAuth((p) => ({ ...p, surgicalManagement: e.target.value }))} />
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Receipt className="h-3.5 w-3.5" /> Estimated Cost Breakup</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Room / Bed Charges</span>
                  <span className="font-medium tabular-nums">₹{roomCost.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">ICU Charges</span>
                  <span className="font-medium tabular-nums">₹{icuCost.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <Label>Surgeon / Specialist Fees (₹)</Label>
                  <Input type="number" value={newPreAuth.surgeonFees} onChange={(e) => setNewPreAuth((p) => ({ ...p, surgeonFees: e.target.value }))} />
                </div>
                <div>
                  <Label>Anaesthetist Fees (₹)</Label>
                  <Input type="number" value={newPreAuth.anaesthetistFees} onChange={(e) => setNewPreAuth((p) => ({ ...p, anaesthetistFees: e.target.value }))} />
                </div>
                <div>
                  <Label>OT / Procedure Charges (₹)</Label>
                  <Input type="number" value={newPreAuth.otCharges} onChange={(e) => setNewPreAuth((p) => ({ ...p, otCharges: e.target.value }))} />
                </div>
                <div>
                  <Label>Medicines, Consumables &amp; Implants (₹)</Label>
                  <Input type="number" value={newPreAuth.medicinesCost} onChange={(e) => setNewPreAuth((p) => ({ ...p, medicinesCost: e.target.value }))} />
                </div>
                <div>
                  <Label>Investigations / Lab / Radiology (₹)</Label>
                  <Input type="number" value={newPreAuth.investigationsCost} onChange={(e) => setNewPreAuth((p) => ({ ...p, investigationsCost: e.target.value }))} />
                </div>
                <div>
                  <Label>Physiotherapy / Rehabilitation (₹)</Label>
                  <Input type="number" value={newPreAuth.physioCost} onChange={(e) => setNewPreAuth((p) => ({ ...p, physioCost: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label>Other Miscellaneous Charges (₹)</Label>
                  <Input type="number" value={newPreAuth.miscCharges} onChange={(e) => setNewPreAuth((p) => ({ ...p, miscCharges: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md bg-teal-600 text-white px-3 py-2.5 mt-3 text-sm">
                <span className="font-medium">Total Estimated Amount</span>
                <span className="font-bold tabular-nums text-base">₹{totalEstimate.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div>
              <Label>Remarks</Label>
              <Textarea rows={2} value={newPreAuth.remarks} onChange={(e) => setNewPreAuth((p) => ({ ...p, remarks: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={createPreAuth} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HospDeptLayout>
  );
};

export default InsuranceDeskPreAuth;
