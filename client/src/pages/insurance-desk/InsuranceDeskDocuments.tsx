import { useEffect, useState, useCallback, useRef } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ShieldCheck, ClipboardList, FileText, Building2, UserCheck,
  Search, BarChart3, Settings, HelpCircle, RefreshCw, Loader2, AlertTriangle,
  Upload, Sparkles, CheckCircle2, XCircle, Send, MinusCircle, Bot,
} from 'lucide-react';
import api from '@/utils/api';

import { navSections } from './navSections';

interface MissingDoc {
  claimId: number;
  claimNumber: string;
  patientName: string;
  requiredDocuments: string[];
  uploadedDocuments: string[];
}

interface DischargeExtraction {
  patientName?: string | null;
  diagnosis?: string | null;
  admissionDate?: string | null;
  dischargeDate?: string | null;
  roomCategory?: string | null;
  attendingDoctor?: string | null;
  hospitalName?: string | null;
  procedureName?: string | null;
  confidence?: number;
  extractionFailed?: boolean;
  reason?: string;
}

interface BillExtraction {
  hospitalName?: string | null;
  billNumber?: string | null;
  billDate?: string | null;
  lineItems?: { description: string; amount: number }[];
  totalBillAmount?: number;
  confidence?: number;
  extractionFailed?: boolean;
  reason?: string;
}

type Extraction = (DischargeExtraction & BillExtraction) | null;

interface ValidationIssue { field: string; code: string; message: string }
interface ValidationResult { canSubmit: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[] }

interface GapIssue { severity: 'high' | 'medium' | 'low'; description: string }
interface GapCheckResult { coherent: boolean | null; gaps: GapIssue[]; confidence?: number; skipped?: boolean; reason?: string; parseFailed?: boolean }

const GAP_SEVERITY_STYLES: Record<GapIssue['severity'], string> = {
  high: 'border-red-400 text-red-700 dark:text-red-300',
  medium: 'border-amber-400 text-amber-700 dark:text-amber-300',
  low: 'border-slate-400 text-slate-700 dark:text-slate-300',
};

const DOC_TYPES = [
  { value: 'discharge_summary', label: 'Discharge Summary' },
  { value: 'bills', label: 'Bills' },
  { value: 'investigation_reports', label: 'Investigation Reports' },
  { value: 'prescription', label: 'Prescription' },
];

const formatCurrency = (amount?: number | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);

const InsuranceDeskDocuments = () => {
  const [rows, setRows] = useState<MissingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [claimIdInput, setClaimIdInput] = useState('');
  const [docType, setDocType] = useState('discharge_summary');
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Extraction>(null);
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const [gapCheck, setGapCheck] = useState<GapCheckResult | null>(null);
  const [checkingGaps, setCheckingGaps] = useState(false);
  const [gapCheckError, setGapCheckError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/hospital/insurance/documents/missing');
      setRows(data.missingDocuments || []);
      if (data.degraded) setError(data.message || 'Document data may be unavailable.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load document status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const claimId = claimIdInput.trim();
  const isValidClaimId = /^\d+$/.test(claimId);

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!isValidClaimId) { setUploadError('Enter a numeric Claim ID first.'); return; }
    if (!file) { setUploadError('Choose a file to upload.'); return; }

    setUploading(true);
    setUploadError(null);
    setExtraction(null);
    setApplyMessage(null);
    try {
      const formData = new FormData();
      formData.append('claimId', claimId);
      formData.append('documentType', docType);
      formData.append('document', file);
      const { data } = await api.post('/hospital/insurance/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const ext: Extraction = data.document?.extraction || null;
      setExtraction(ext);
      if (ext && !ext.extractionFailed) {
        const initial: Record<string, boolean> = {};
        if (ext.diagnosis) initial.diagnosis = true;
        if (ext.admissionDate || ext.dischargeDate || ext.roomCategory) initial.hospitalizationDetails = true;
        if (ext.totalBillAmount) initial.claimAmount = true;
        setSelectedFields(initial);
      }
      if (fileRef.current) fileRef.current.value = '';
      load();
      runValidation(claimId);
    } catch (err: any) {
      setUploadError(err?.response?.data?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const applyExtraction = async () => {
    if (!extraction || !isValidClaimId) return;
    setApplying(true);
    setApplyMessage(null);
    try {
      const fields: Record<string, unknown> = {};
      if (selectedFields.diagnosis && extraction.diagnosis) fields.diagnosis = extraction.diagnosis;
      if (selectedFields.claimAmount && extraction.totalBillAmount) fields.claimAmount = extraction.totalBillAmount;
      if (selectedFields.hospitalizationDetails) {
        fields.hospitalizationDetails = {
          ...(extraction.admissionDate ? { admissionDate: extraction.admissionDate } : {}),
          ...(extraction.dischargeDate ? { dischargeDate: extraction.dischargeDate } : {}),
          ...(extraction.roomCategory ? { roomCategory: extraction.roomCategory } : {}),
        };
      }
      if (Object.keys(fields).length === 0) {
        setApplyMessage('Select at least one field to apply.');
        return;
      }
      await api.post(`/hospital/insurance/claims/${claimId}/apply-extracted-fields`, { fields });
      setApplyMessage('Applied to claim.');
      runValidation(claimId);
    } catch (err: any) {
      setApplyMessage(err?.response?.data?.message || 'Could not apply fields.');
    } finally {
      setApplying(false);
    }
  };

  const runValidation = async (id: string) => {
    if (!/^\d+$/.test(id)) return;
    setValidating(true);
    setValidation(null);
    setSubmitMessage(null);
    try {
      const { data } = await api.get(`/hospital/insurance/claims/${id}/validate`);
      setValidation({ canSubmit: data.canSubmit, errors: data.errors || [], warnings: data.warnings || [] });
    } catch (err: any) {
      setSubmitMessage(err?.response?.data?.message || 'Could not validate claim.');
    } finally {
      setValidating(false);
    }
  };

  const checkGaps = async () => {
    if (!isValidClaimId) return;
    setCheckingGaps(true);
    setGapCheckError(null);
    setGapCheck(null);
    try {
      const { data } = await api.post(`/hospital/insurance/claims/${claimId}/copilot/check-gaps`);
      setGapCheck({ coherent: data.coherent, gaps: data.gaps || [], confidence: data.confidence, skipped: data.skipped, reason: data.reason, parseFailed: data.parseFailed });
    } catch (err: any) {
      setGapCheckError(err?.response?.data?.message || 'Could not run AI documentation check.');
    } finally {
      setCheckingGaps(false);
    }
  };

  const submitClaim = async () => {
    if (!isValidClaimId) return;
    setSubmitting(true);
    setSubmitMessage(null);
    try {
      const { data } = await api.post(`/hospital/insurance/claims/${claimId}/submit`);
      setSubmitMessage(`Claim ${data.claim?.claimNumber || ''} submitted to insurer.`);
      setValidation(null);
      load();
    } catch (err: any) {
      setSubmitMessage(err?.response?.data?.message || 'Could not submit claim.');
      if (err?.response?.data?.errors) {
        setValidation({ canSubmit: false, errors: err.response.data.errors, warnings: err.response.data.warnings || [] });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Documents" subtitle="Upload, AI-extract, validate, and submit claim documentation" copilotModule="insurance">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4 text-teal-600" /> Upload Document</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Claim ID</Label>
                <Input placeholder="e.g. 55" value={claimIdInput} onChange={(e) => setClaimIdInput(e.target.value)} />
              </div>
              <div>
                <Label>Document Type</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>File</Label>
                <Input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.txt" />
              </div>
            </div>
            {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
            <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={upload} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload{(docType === 'discharge_summary' || docType === 'bills') ? ' & Extract' : ''}
            </Button>
            {(docType === 'discharge_summary' || docType === 'bills') && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> AI will read this document and suggest claim fields — nothing is applied until you review and confirm below.
              </p>
            )}

            {extraction && (
              <div className="mt-3 border rounded-lg p-3 bg-muted/30">
                {extraction.extractionFailed ? (
                  <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                    <XCircle className="h-4 w-4" /> {extraction.reason || 'Extraction failed — enter fields manually.'}
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-teal-600" /> Extracted Fields</p>
                      <Badge variant="outline" className={
                        (extraction.confidence ?? 0) >= 0.7
                          ? 'border-emerald-400 text-emerald-700 dark:text-emerald-300'
                          : 'border-amber-400 text-amber-700 dark:text-amber-300'
                      }>
                        {Math.round((extraction.confidence ?? 0) * 100)}% fields found
                      </Badge>
                    </div>
                    <div className="space-y-2 text-sm">
                      {extraction.diagnosis && (
                        <label className="flex items-start gap-2">
                          <Checkbox checked={!!selectedFields.diagnosis} onCheckedChange={(v) => setSelectedFields((s) => ({ ...s, diagnosis: !!v }))} />
                          <span><span className="text-muted-foreground">Diagnosis:</span> {extraction.diagnosis}</span>
                        </label>
                      )}
                      {(extraction.admissionDate || extraction.dischargeDate || extraction.roomCategory) && (
                        <label className="flex items-start gap-2">
                          <Checkbox checked={!!selectedFields.hospitalizationDetails} onCheckedChange={(v) => setSelectedFields((s) => ({ ...s, hospitalizationDetails: !!v }))} />
                          <span className="text-muted-foreground">
                            Admission: {extraction.admissionDate || '—'} · Discharge: {extraction.dischargeDate || '—'} · Room: {extraction.roomCategory || '—'}
                          </span>
                        </label>
                      )}
                      {extraction.totalBillAmount != null && (
                        <label className="flex items-start gap-2">
                          <Checkbox checked={!!selectedFields.claimAmount} onCheckedChange={(v) => setSelectedFields((s) => ({ ...s, claimAmount: !!v }))} />
                          <span><span className="text-muted-foreground">Claim Amount (from bill total):</span> {formatCurrency(extraction.totalBillAmount)}</span>
                        </label>
                      )}
                      {extraction.lineItems && extraction.lineItems.length > 0 && (
                        <div className="pl-6 text-xs text-muted-foreground space-y-0.5">
                          {extraction.lineItems.map((li, i) => (
                            <div key={i} className="flex justify-between max-w-xs">
                              <span>{li.description}</span><span>{formatCurrency(li.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button size="sm" variant="outline" className="mt-3 gap-1" onClick={applyExtraction} disabled={applying}>
                      {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Apply Selected to Claim
                    </Button>
                    {applyMessage && <p className="text-xs text-muted-foreground mt-1">{applyMessage}</p>}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Validate & Submit</CardTitle>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => runValidation(claimId)} disabled={!isValidClaimId || validating}>
              {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check Claim {claimId || '—'}
            </Button>
          </CardHeader>
          <CardContent>
            {!validation ? (
              <p className="text-sm text-muted-foreground">Enter a Claim ID above and click "Check Claim" to run the pre-submission rules engine.</p>
            ) : (
              <div className="space-y-3">
                <div className={`flex items-center gap-2 text-sm font-medium ${validation.canSubmit ? 'text-emerald-600' : 'text-red-600'}`}>
                  {validation.canSubmit ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {validation.canSubmit ? 'Ready to submit' : `${validation.errors.length} issue(s) must be fixed before submission`}
                </div>
                {validation.errors.map((e, i) => (
                  <p key={i} className="text-sm text-red-600 flex items-start gap-2"><XCircle className="h-4 w-4 shrink-0 mt-0.5" />{e.message}</p>
                ))}
                {validation.warnings.length > 0 && (
                  <>
                    <Separator />
                    {validation.warnings.map((w, i) => (
                      <p key={i} className="text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{w.message}</p>
                    ))}
                  </>
                )}
                <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={submitClaim} disabled={!validation.canSubmit || submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Submit to Insurer
                </Button>
                {submitMessage && <p className="text-sm text-muted-foreground">{submitMessage}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4 text-teal-600" /> AI Co-Pilot — Documentation Coherence</CardTitle>
            <Button variant="outline" size="sm" className="gap-1" onClick={checkGaps} disabled={!isValidClaimId || checkingGaps}>
              {checkingGaps ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Check Claim {claimId || '—'}
            </Button>
          </CardHeader>
          <CardContent>
            {!gapCheck ? (
              <p className="text-sm text-muted-foreground">
                Runs a semantic check across the claim's diagnosis/treatment details and whatever discharge summary or bill was AI-extracted above — catches inconsistencies a field-presence check can't, like a surgery diagnosis with no matching bill items.
              </p>
            ) : gapCheckError ? (
              <p className="text-sm text-red-600">{gapCheckError}</p>
            ) : gapCheck.skipped ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2"><MinusCircle className="h-4 w-4" /> {gapCheck.reason}</p>
            ) : gapCheck.parseFailed ? (
              <p className="text-sm text-amber-600">AI response could not be parsed — try again.</p>
            ) : (
              <div className="space-y-2">
                <div className={`flex items-center gap-2 text-sm font-medium ${gapCheck.coherent ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {gapCheck.coherent ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {gapCheck.coherent
                    ? 'No coherence issues found between claim data and extracted documents.'
                    : `${gapCheck.gaps.length} item(s) to verify before submission.`}
                </div>
                {gapCheck.gaps.map((g, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <Badge variant="outline" className={`shrink-0 ${GAP_SEVERITY_STYLES[g.severity]}`}>{g.severity}</Badge>
                    <span>{g.description}</span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-1">AI-generated — verify before acting. Not a coverage or clinical determination.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Incomplete Claim Documents</CardTitle>
            <Button variant="outline" size="sm" className="gap-1" onClick={load}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {error && <p className="text-sm text-amber-600 mb-3">{error}</p>}
            {loading ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
              </div>
            ) : rows.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl">
                <FileText className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No claims are missing documents right now.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Claim #</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>Still Missing</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const missing = row.requiredDocuments.filter((d) => !row.uploadedDocuments.includes(d));
                      return (
                        <TableRow key={row.claimId}>
                          <TableCell className="font-mono text-xs">{row.claimNumber}</TableCell>
                          <TableCell>{row.patientName}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {row.uploadedDocuments.length
                                ? row.uploadedDocuments.map((d) => <Badge key={d} variant="secondary">{d}</Badge>)
                                : <span className="text-muted-foreground text-sm">None</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {missing.map((d) => (
                                <Badge key={d} variant="outline" className="gap-1 border-amber-400 text-amber-700 dark:text-amber-300">
                                  <AlertTriangle className="h-3 w-3" />{d}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => { setClaimIdInput(String(row.claimId)); runValidation(String(row.claimId)); }}>
                              Select
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </HospDeptLayout>
  );
};

export default InsuranceDeskDocuments;
