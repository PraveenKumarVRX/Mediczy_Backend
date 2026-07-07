import { useEffect, useState, useCallback } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ShieldCheck, ClipboardList, FileText, Building2, UserCheck,
  Search, BarChart3, Settings, HelpCircle, RefreshCw, Loader2, Plus, Wallet,
  Download, Upload,
} from 'lucide-react';
import api from '@/utils/api';

import { navSections } from './navSections';

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

const emptyNewClaim = {
  patientId: '', policyNumber: '', insuranceProvider: '', claimAmount: '', diagnosis: '', ward: '',
};

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'paid', label: 'Paid' },
];

const InsuranceDeskClaims = () => {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('all');
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const [showNewClaim, setShowNewClaim] = useState(false);
  const [newClaim, setNewClaim] = useState(emptyNewClaim);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [importingBilling, setImportingBilling] = useState(false);
  const [billingImported, setBillingImported] = useState<{ total: number; chargeCount: number } | null>(null);

  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ success: number; failed: number } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const load = useCallback(async (searchTerm?: string, status?: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/hospital/insurance/claims', {
        params: { page: 1, limit: 50, ...(searchTerm ? { search: searchTerm } : {}), ...(status && status !== 'all' ? { status } : {}) },
      });
      setClaims(data.claims || []);
      if (data.degraded) setError('Some claim data may be unavailable right now.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load claims.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(search, statusTab); }, [statusTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const downloadPdf = async (claim: Claim) => {
    setDownloadingId(claim.id);
    try {
      const response = await api.get(`/hospital/insurance/claims/${claim.id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${claim.claimNumber}.pdf`;
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

  const submitBulk = async () => {
    setBulkUploading(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      const rows = JSON.parse(bulkText);
      if (!Array.isArray(rows)) throw new Error('Expected a JSON array of claim objects.');
      const { data } = await api.post('/hospital/insurance/claims/bulk-upload', { claims: rows });
      setBulkResult({ success: data.results?.success?.length || 0, failed: data.results?.failed?.length || 0 });
      load(search, statusTab);
    } catch (err: any) {
      setBulkError(err?.response?.data?.message || err.message || 'Bulk upload failed — check the JSON format.');
    } finally {
      setBulkUploading(false);
    }
  };

  const importFromBilling = async () => {
    const patientId = newClaim.patientId.trim();
    if (!patientId || !/^\d+$/.test(patientId)) {
      setCreateError('Enter a numeric Patient ID first, then import their billing charges.');
      return;
    }
    setImportingBilling(true);
    setCreateError(null);
    setBillingImported(null);
    try {
      const { data } = await api.get(`/hospital/insurance/patient/${patientId}/billing-summary`);
      const summary = data.billingSummary;
      setNewClaim((c) => ({ ...c, claimAmount: String(summary.total) }));
      setBillingImported({ total: summary.total, chargeCount: summary.chargeCount });
      if (summary.chargeCount === 0) {
        setCreateError('No posted billing charges found for this patient yet — enter the amount manually.');
      }
    } catch (err: any) {
      setCreateError(err?.response?.data?.message || 'Could not import billing charges.');
    } finally {
      setImportingBilling(false);
    }
  };

  const createClaim = async () => {
    const patientId = parseInt(newClaim.patientId, 10);
    const claimAmount = parseFloat(newClaim.claimAmount);
    if (!patientId || !newClaim.policyNumber.trim() || !(claimAmount >= 0)) {
      setCreateError('Patient ID, policy number, and a valid claim amount are required.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await api.post('/hospital/insurance/claims/new', {
        patientId,
        policyNumber: newClaim.policyNumber.trim(),
        insuranceProvider: newClaim.insuranceProvider.trim() || undefined,
        claimAmount,
        diagnosis: newClaim.diagnosis.trim() || undefined,
        hospitalizationDetails: { ward: newClaim.ward.trim() || 'General', diagnosis: newClaim.diagnosis.trim() || undefined },
      });
      setShowNewClaim(false);
      setNewClaim(emptyNewClaim);
      setBillingImported(null);
      load(search, statusTab);
    } catch (err: any) {
      setCreateError(err?.response?.data?.message || 'Could not create claim.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Active Claims" subtitle="Monitor claim lifecycle" copilotModule="insurance">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3 gap-3 flex-wrap">
          <CardTitle className="text-base whitespace-nowrap">Insurance Claims</CardTitle>
          <div className="flex items-center gap-2 flex-1 max-w-sm min-w-[200px]">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by claim # or policy #"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load(search, statusTab); }}
            />
          </div>
          <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => setShowNewClaim(true)}>
            <Plus className="h-4 w-4" /> New Claim
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => { setShowBulk(true); setBulkResult(null); setBulkError(null); }}>
            <Upload className="h-4 w-4" /> Bulk Upload
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => load(search, statusTab)}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs value={statusTab} onValueChange={setStatusTab} className="mb-3">
            <TabsList>
              {STATUS_TABS.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}
            </TabsList>
          </Tabs>
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
                    <TableHead />
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
                      <TableCell>
                        <Button size="sm" variant="ghost" className="gap-1 h-7 px-2" onClick={() => downloadPdf(claim)} disabled={downloadingId === claim.id}>
                          {downloadingId === claim.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showNewClaim} onOpenChange={(open) => { setShowNewClaim(open); if (!open) { setCreateError(null); setBillingImported(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Claim</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {createError && <p className="text-sm text-red-600">{createError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Patient ID</Label>
                <Input value={newClaim.patientId} onChange={(e) => setNewClaim((c) => ({ ...c, patientId: e.target.value }))} placeholder="e.g. 9" />
              </div>
              <div>
                <Label>Policy Number</Label>
                <Input value={newClaim.policyNumber} onChange={(e) => setNewClaim((c) => ({ ...c, policyNumber: e.target.value }))} />
              </div>
              <div>
                <Label>Insurer / TPA</Label>
                <Input value={newClaim.insuranceProvider} onChange={(e) => setNewClaim((c) => ({ ...c, insuranceProvider: e.target.value }))} placeholder="e.g. Star Health" />
              </div>
              <div>
                <Label>Ward</Label>
                <Input value={newClaim.ward} onChange={(e) => setNewClaim((c) => ({ ...c, ward: e.target.value }))} placeholder="General" />
              </div>
              <div className="col-span-2">
                <Label>Diagnosis</Label>
                <Input value={newClaim.diagnosis} onChange={(e) => setNewClaim((c) => ({ ...c, diagnosis: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>Claim Amount</Label>
                <div className="flex gap-2">
                  <Input type="number" value={newClaim.claimAmount} onChange={(e) => setNewClaim((c) => ({ ...c, claimAmount: e.target.value }))} />
                  <Button type="button" variant="outline" size="sm" className="gap-1 whitespace-nowrap" onClick={importFromBilling} disabled={importingBilling}>
                    {importingBilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                    Import from Billing
                  </Button>
                </div>
                {billingImported && billingImported.chargeCount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Imported {formatCurrency(billingImported.total)} across {billingImported.chargeCount} posted billing {billingImported.chargeCount === 1 ? 'charge' : 'charges'}.
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewClaim(false)}>Cancel</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={createClaim} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Claim'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Bulk Upload Claims</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paste a JSON array of claim objects — each needs at least <code className="text-xs bg-muted px-1 rounded">patientId</code>, <code className="text-xs bg-muted px-1 rounded">policyNumber</code>, and <code className="text-xs bg-muted px-1 rounded">claimAmount</code>.
            </p>
            <Textarea
              rows={10}
              className="font-mono text-xs"
              placeholder={'[\n  { "patientId": 9, "policyNumber": "POL123", "claimAmount": 15000, "insuranceProvider": "Star Health" }\n]'}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            {bulkError && <p className="text-sm text-red-600">{bulkError}</p>}
            {bulkResult && (
              <p className="text-sm text-emerald-600">
                {bulkResult.success} claim(s) created{bulkResult.failed > 0 ? `, ${bulkResult.failed} failed — check values and retry those rows.` : '.'}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulk(false)}>Close</Button>
            <Button className="bg-teal-600 hover:bg-teal-700 gap-1" onClick={submitBulk} disabled={bulkUploading || !bulkText.trim()}>
              {bulkUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HospDeptLayout>
  );
};

export default InsuranceDeskClaims;
