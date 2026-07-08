import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Search, Loader2, Wallet, FileUp, CheckCircle2, ArrowRight, ArrowLeft,
  UserCheck, ClipboardList, Upload, ClipboardCheck, AlertTriangle, XCircle,
} from 'lucide-react';
import api from '@/utils/api';

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  email?: string;
}

interface UploadedDoc {
  fileName: string;
  documentType: string;
}

interface ValidationResult {
  canSubmit: boolean;
  errors: Array<{ message: string }>;
  warnings: Array<{ message: string }>;
}

const STEPS = [
  { n: 1, label: 'Search Member', icon: Search },
  { n: 2, label: 'Review Claim Form', icon: ClipboardList },
  { n: 3, label: 'Document Attachment', icon: FileUp },
  { n: 4, label: 'Final Review & Submission', icon: ClipboardCheck },
];

const formatCurrency = (amount?: number | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);

const emptyClaimForm = { policyNumber: '', insuranceProvider: '', claimAmount: '', diagnosis: '', ward: '' };
const DOC_TYPES = ['discharge_summary', 'bills', 'investigation_reports', 'prescription'];

const NewClaimWizard = ({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) => {
  const [step, setStep] = useState(1);

  // Step 1 — search member
  const [searchType, setSearchType] = useState<'uhid' | 'mobile'>('uhid');
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);

  // Step 2 — claim form
  const [claimForm, setClaimForm] = useState(emptyClaimForm);
  const [importingBilling, setImportingBilling] = useState(false);
  const [billingImported, setBillingImported] = useState<{ total: number; chargeCount: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [claimId, setClaimId] = useState<number | null>(null);
  const [claimNumber, setClaimNumber] = useState<string | null>(null);

  // Step 3 — documents
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);

  // Step 4 — final review
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setStep(1);
    setSearchType('uhid'); setSearchTerm(''); setSearchError(null); setPatient(null);
    setClaimForm(emptyClaimForm); setBillingImported(null); setCreateError(null); setClaimId(null); setClaimNumber(null);
    setUploadError(null); setUploadedDocs([]);
    setValidation(null); setSubmitError(null); setSubmitted(false);
  };

  const close = () => { onOpenChange(false); reset(); };

  const searchPatient = async () => {
    if (!searchTerm.trim()) { setSearchError('Enter a value to search.'); return; }
    setSearching(true);
    setSearchError(null);
    setPatient(null);
    try {
      const { data } = await api.post('/hospital/insurance/patient/search', { searchTerm: searchTerm.trim(), searchType });
      const found = (data.patients || [])[0];
      if (!found) {
        setSearchError('No patient found — check the ID/mobile number, or create the claim without pre-filled member details from the Active Claims page.');
        return;
      }
      setPatient(found);
    } catch (err: any) {
      setSearchError(err?.response?.data?.message || 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  const importFromBilling = async () => {
    if (!patient) return;
    setImportingBilling(true);
    setCreateError(null);
    setBillingImported(null);
    try {
      const { data } = await api.get(`/hospital/insurance/patient/${patient.id}/billing-summary`);
      const summary = data.billingSummary;
      setClaimForm((c) => ({ ...c, claimAmount: String(summary.total) }));
      setBillingImported({ total: summary.total, chargeCount: summary.chargeCount });
    } catch (err: any) {
      setCreateError(err?.response?.data?.message || 'Could not import billing charges.');
    } finally {
      setImportingBilling(false);
    }
  };

  const createDraft = async () => {
    if (!patient) return;
    const claimAmount = parseFloat(claimForm.claimAmount);
    if (!claimForm.policyNumber.trim() || !(claimAmount >= 0)) {
      setCreateError('Policy number and a valid claim amount are required.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const { data } = await api.post('/hospital/insurance/claims/new', {
        patientId: patient.id,
        policyNumber: claimForm.policyNumber.trim(),
        insuranceProvider: claimForm.insuranceProvider.trim() || undefined,
        claimAmount,
        diagnosis: claimForm.diagnosis.trim() || undefined,
        hospitalizationDetails: { ward: claimForm.ward.trim() || 'General', diagnosis: claimForm.diagnosis.trim() || undefined },
      });
      setClaimId(data.claim?.id);
      setClaimNumber(data.claim?.claimNumber);
      setStep(3);
    } catch (err: any) {
      setCreateError(err?.response?.data?.message || 'Could not create claim.');
    } finally {
      setCreating(false);
    }
  };

  const uploadDoc = async (file: File) => {
    if (!claimId) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('claimId', String(claimId));
      formData.append('documentType', docType);
      formData.append('document', file);
      await api.post('/hospital/insurance/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadedDocs((prev) => [...prev, { fileName: file.name, documentType: docType }]);
    } catch (err: any) {
      setUploadError(err?.response?.data?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const goToFinalReview = async () => {
    if (!claimId) return;
    setStep(4);
    setValidating(true);
    try {
      const { data } = await api.get(`/hospital/insurance/claims/${claimId}/validate`);
      setValidation(data);
    } catch {
      setValidation(null);
    } finally {
      setValidating(false);
    }
  };

  const submitClaim = async () => {
    if (!claimId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.post(`/hospital/insurance/claims/${claimId}/submit`);
      setSubmitted(true);
      onCreated();
    } catch (err: any) {
      setSubmitError(err?.response?.data?.message || 'Could not submit claim.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New Claim{claimNumber ? ` — ${claimNumber}` : ''}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-6">
          {/* Vertical stepper */}
          <div className="w-40 shrink-0 space-y-3 hidden sm:block">
            {STEPS.map((s) => (
              <div key={s.n} className={`flex items-center gap-2 text-xs ${step === s.n ? 'text-teal-700 font-semibold' : step > s.n ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                {step > s.n ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <s.icon className="h-4 w-4 shrink-0" />}
                <span>{s.n}. {s.label}</span>
              </div>
            ))}
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Search for the member on the payer/hospital system to auto-fill their details.</p>
                <div className="flex gap-2">
                  <select className="border rounded-md px-2 text-sm bg-background" value={searchType} onChange={(e) => setSearchType(e.target.value as 'uhid' | 'mobile')}>
                    <option value="uhid">Patient ID (UHID)</option>
                    <option value="mobile">Mobile Number</option>
                  </select>
                  <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={searchType === 'uhid' ? 'e.g. 9' : 'e.g. 9876543210'} onKeyDown={(e) => { if (e.key === 'Enter') searchPatient(); }} />
                  <Button onClick={searchPatient} disabled={searching} className="gap-1 bg-teal-600 hover:bg-teal-700 whitespace-nowrap">
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
                  </Button>
                </div>
                {searchError && <p className="text-sm text-red-600">{searchError}</p>}
                {patient && (
                  <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 p-3 flex items-center gap-3">
                    <UserCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{patient.firstName} {patient.lastName}</p>
                      <p className="text-xs text-muted-foreground">{patient.phoneNumber || patient.email || `Patient ID ${patient.id}`}</p>
                    </div>
                    <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => setStep(2)}>
                      Continue <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {step === 2 && patient && (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">Member: <span className="font-medium text-foreground">{patient.firstName} {patient.lastName}</span></div>
                {createError && <p className="text-sm text-red-600">{createError}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Policy Number</Label>
                    <Input value={claimForm.policyNumber} onChange={(e) => setClaimForm((c) => ({ ...c, policyNumber: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Insurer / TPA</Label>
                    <Input value={claimForm.insuranceProvider} onChange={(e) => setClaimForm((c) => ({ ...c, insuranceProvider: e.target.value }))} placeholder="e.g. Star Health" />
                  </div>
                  <div>
                    <Label>Ward</Label>
                    <Input value={claimForm.ward} onChange={(e) => setClaimForm((c) => ({ ...c, ward: e.target.value }))} placeholder="General" />
                  </div>
                  <div className="col-span-2">
                    <Label>Diagnosis</Label>
                    <Input value={claimForm.diagnosis} onChange={(e) => setClaimForm((c) => ({ ...c, diagnosis: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <Label>Claim Amount</Label>
                    <div className="flex gap-2">
                      <Input type="number" value={claimForm.claimAmount} onChange={(e) => setClaimForm((c) => ({ ...c, claimAmount: e.target.value }))} />
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
                <div className="flex justify-between pt-2">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => setStep(1)}><ArrowLeft className="h-3.5 w-3.5" /> Back</Button>
                  <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={createDraft} disabled={creating}>
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create Draft &amp; Continue <ArrowRight className="h-3.5 w-3.5" /></>}
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Attach supporting documents — discharge summary and bills are used for AI field extraction and validation.</p>
                {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
                <div className="flex gap-2">
                  <select className="border rounded-md px-2 text-sm bg-background" value={docType} onChange={(e) => setDocType(e.target.value)}>
                    {DOC_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                  <label className="flex-1">
                    <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(f); e.target.value = ''; }} />
                    <div className="border rounded-md px-3 py-2 text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 flex items-center gap-2">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Choose file to upload
                    </div>
                  </label>
                </div>
                {uploadedDocs.length > 0 && (
                  <div className="space-y-1">
                    {uploadedDocs.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm border rounded-lg px-3 py-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="flex-1 truncate">{d.fileName}</span>
                        <Badge variant="outline" className="text-xs capitalize">{d.documentType.replace(/_/g, ' ')}</Badge>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-between pt-2">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => setStep(2)}><ArrowLeft className="h-3.5 w-3.5" /> Back</Button>
                  <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={goToFinalReview}>
                    Continue <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                {submitted ? (
                  <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 p-4 flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <p className="text-sm">Claim <strong>{claimNumber}</strong> submitted successfully.</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg border p-3 text-sm space-y-1">
                      <p><strong>{claimNumber}</strong> — {patient?.firstName} {patient?.lastName}</p>
                      <p className="text-muted-foreground">{claimForm.insuranceProvider || 'No insurer'} · Policy {claimForm.policyNumber} · {formatCurrency(parseFloat(claimForm.claimAmount) || 0)}</p>
                      <p className="text-muted-foreground">{uploadedDocs.length} document{uploadedDocs.length === 1 ? '' : 's'} attached</p>
                    </div>
                    {validating ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Running pre-submit checks…</div>
                    ) : validation && (
                      <div className="space-y-2">
                        {validation.errors.map((e, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-red-600"><XCircle className="h-4 w-4 shrink-0 mt-0.5" /> {e.message}</div>
                        ))}
                        {validation.warnings.map((w, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-amber-600"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {w.message}</div>
                        ))}
                        {validation.canSubmit && validation.errors.length === 0 && validation.warnings.length === 0 && (
                          <div className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" /> No issues found — ready to submit.</div>
                        )}
                      </div>
                    )}
                    {submitError && <p className="text-sm text-red-600">{submitError}</p>}
                    <div className="flex justify-between pt-2">
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => setStep(3)}><ArrowLeft className="h-3.5 w-3.5" /> Back</Button>
                      <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={submitClaim} disabled={submitting}>
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Claim'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {step === 4 && submitted && (
          <DialogFooter>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={close}>Done</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default NewClaimWizard;
