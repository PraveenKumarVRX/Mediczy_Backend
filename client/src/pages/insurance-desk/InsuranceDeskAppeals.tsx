import { useEffect, useState, useCallback } from 'react';
import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ShieldCheck, RefreshCw, Loader2, Bot, Sparkles, Send, Scale, Gauge, AlertTriangle,
} from 'lucide-react';
import api from '@/utils/api';
import { navSections } from './navSections';

interface Appeal {
  claimId: number;
  claimNumber: string;
  patientName: string;
  status: string;
  rejectionReason?: string | null;
  appealCount: number;
  latestAppeal?: { appealedAt: string; appealReason: string; supportingNotes?: string } | null;
}

interface ClaimDenial {
  id: number;
  denialCode?: string | null;
  denialReason?: string | null;
  deniedAmount?: number | null;
  status: string;
  appealLetter?: string | null;
}

interface DenialRisk {
  riskScore?: number;
  riskLevel?: string;
  recommendations?: string[];
}

const STATUS_STYLES: Record<string, string> = {
  rejected: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  query: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
};

const formatDate = (v?: string) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

const InsuranceDeskAppeals = () => {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Appeal | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const [denials, setDenials] = useState<ClaimDenial[]>([]);
  const [denialsLoading, setDenialsLoading] = useState(false);

  const [riskForm, setRiskForm] = useState({
    documentationComplete: 'yes', preAuthPresent: 'yes', codeMismatch: 'no', payerHistoryDenialRate: '10',
  });
  const [riskResult, setRiskResult] = useState<DenialRisk | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/hospital/insurance/claims/appeals');
      setAppeals(data.appeals || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load appeals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDraft = async (appeal: Appeal) => {
    setSelected(appeal);
    setRejectionReasonInput(appeal.rejectionReason || '');
    setDraftError(null);
    setDraftSubject('');
    setDraftBody('');
    setSubmitted(null);
    setDenials([]);
    setRiskResult(null);

    setDenialsLoading(true);
    try {
      const { data } = await api.get(`/hospital/insurance/claims/${appeal.claimId}/denials`);
      setDenials(data.denials || []);
    } catch {
      // Non-fatal — denial-code context is supplementary, the query_history
      // reason above already carries the core information.
    } finally {
      setDenialsLoading(false);
    }
  };

  const checkDenialRisk = async () => {
    setRiskLoading(true);
    try {
      const { data } = await api.post('/roadmap-intelligence/revenue-cycle/denial-risk', {
        documentationComplete: riskForm.documentationComplete === 'yes',
        preAuthPresent: riskForm.preAuthPresent === 'yes',
        codeMismatch: riskForm.codeMismatch === 'yes',
        payerHistoryDenialRate: Number(riskForm.payerHistoryDenialRate || 0),
      });
      setRiskResult(data?.data ?? null);
    } catch (err: any) {
      setDraftError(err?.response?.data?.message || 'Could not calculate denial risk.');
    } finally {
      setRiskLoading(false);
    }
  };

  const draftAppeal = async () => {
    if (!selected || !rejectionReasonInput.trim()) {
      setDraftError('Enter the denial/query reason stated by the insurer.');
      return;
    }
    setDrafting(true);
    setDraftError(null);
    try {
      const { data } = await api.post(`/hospital/insurance/claims/${selected.claimId}/copilot/draft-appeal`, {
        rejectionReason: rejectionReasonInput.trim(),
      });
      setDraftSubject(data.draft.subject || '');
      setDraftBody(data.draft.body || '');
    } catch (err: any) {
      setDraftError(err?.response?.data?.message || 'Could not draft appeal letter.');
    } finally {
      setDrafting(false);
    }
  };

  const submitAppeal = async () => {
    if (!selected || !draftBody.trim()) return;
    setSubmitting(true);
    setDraftError(null);
    try {
      await api.post(`/hospital/insurance/claims/${selected.claimId}/appeal`, {
        appealReason: draftBody.trim(),
        supportingNotes: `AI-drafted appeal — subject: ${draftSubject}`,
      });
      setSubmitted('Appeal submitted. Claim moved to pending review.');
      load();
    } catch (err: any) {
      setDraftError(err?.response?.data?.message || 'Could not submit appeal.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Appeals & Denial Management" subtitle="Rejected and queried claims awaiting an appeal" copilotModule="insurance">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Scale className="h-4 w-4 text-teal-600" /> Claims Needing Appeal</CardTitle>
          <Button variant="outline" size="sm" className="gap-1" onClick={load}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-amber-600 mb-3">{error}</p>}
          {loading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…</div>
          ) : appeals.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl">
              <Scale className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No rejected or queried claims right now.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim #</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Denial / Query Reason</TableHead>
                    <TableHead className="text-center">Appeals Sent</TableHead>
                    <TableHead>Last Appeal</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appeals.map((a) => (
                    <TableRow key={a.claimId}>
                      <TableCell className="font-mono text-xs">{a.claimNumber}</TableCell>
                      <TableCell>{a.patientName}</TableCell>
                      <TableCell><Badge className={STATUS_STYLES[a.status] || ''} variant="outline">{a.status}</Badge></TableCell>
                      <TableCell className="max-w-[240px] truncate">{a.rejectionReason || '—'}</TableCell>
                      <TableCell className="text-center">{a.appealCount}</TableCell>
                      <TableCell>{formatDate(a.latestAppeal?.appealedAt)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => openDraft(a)}>
                          <Bot className="h-3.5 w-3.5 text-teal-600" /> Draft Appeal (AI)
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

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Bot className="h-4 w-4 text-teal-600" /> AI-Drafted Appeal — {selected?.claimNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {denialsLoading ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading denial record…</p>
            ) : denials.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-2.5 text-xs space-y-1">
                {denials.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2">
                    <span>
                      {d.denialCode && <span className="font-mono mr-1.5">{d.denialCode}</span>}
                      {d.denialReason || 'No reason recorded'}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      {d.deniedAmount != null && <span className="font-medium">₹{Number(d.deniedAmount).toLocaleString('en-IN')}</span>}
                      <Badge variant="outline" className="text-[10px]">{d.status}</Badge>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div>
              <Label>Denial/query reason (as stated by insurer)</Label>
              <Textarea rows={2} value={rejectionReasonInput} onChange={(e) => setRejectionReasonInput(e.target.value)} />
            </div>
            {draftError && <p className="text-sm text-red-600">{draftError}</p>}
            {submitted ? (
              <p className="text-sm text-emerald-600">{submitted}</p>
            ) : (
              <>
                <Button size="sm" variant="outline" className="gap-1" onClick={draftAppeal} disabled={drafting}>
                  {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {draftBody ? 'Regenerate Draft' : 'Generate Draft'}
                </Button>
                {draftBody && (
                  <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                    <div><Label className="text-xs">Subject</Label><Input value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} /></div>
                    <div><Label className="text-xs">Body</Label><Textarea rows={10} value={draftBody} onChange={(e) => setDraftBody(e.target.value)} className="font-sans text-sm" /></div>
                  </div>
                )}
              </>
            )}

            {!submitted && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground"><Gauge className="h-3.5 w-3.5" /> Future-claim denial risk (AI)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px]">Documentation complete?</Label>
                    <Select value={riskForm.documentationComplete} onValueChange={(v) => setRiskForm((s) => ({ ...s, documentationComplete: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px]">Pre-auth on file?</Label>
                    <Select value={riskForm.preAuthPresent} onValueChange={(v) => setRiskForm((s) => ({ ...s, preAuthPresent: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px]">Code mismatch risk?</Label>
                    <Select value={riskForm.codeMismatch} onValueChange={(v) => setRiskForm((s) => ({ ...s, codeMismatch: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="no">No</SelectItem><SelectItem value="yes">Yes</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px]">Payer's historical denial rate (%)</Label>
                    <Input className="h-8 text-xs" type="number" min={0} max={100} value={riskForm.payerHistoryDenialRate}
                      onChange={(e) => setRiskForm((s) => ({ ...s, payerHistoryDenialRate: e.target.value }))} />
                  </div>
                </div>
                <Button size="sm" variant="outline" className="gap-1 w-full" onClick={checkDenialRisk} disabled={riskLoading}>
                  {riskLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gauge className="h-3.5 w-3.5" />}
                  Estimate Risk
                </Button>
                {riskResult && (
                  <div className="rounded-lg border p-2.5 text-xs flex items-start gap-2 bg-muted/30">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">
                        {riskResult.riskLevel ? `${riskResult.riskLevel} risk` : 'Risk estimate'}
                        {riskResult.riskScore != null && <span className="text-muted-foreground font-normal"> — score {riskResult.riskScore}</span>}
                      </p>
                      {riskResult.recommendations && riskResult.recommendations.length > 0 && (
                        <ul className="list-disc pl-4 mt-1 space-y-0.5 text-muted-foreground">
                          {riskResult.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {!submitted && draftBody && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
              <Button className="bg-teal-600 hover:bg-teal-700 gap-1" onClick={submitAppeal} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit Appeal
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </HospDeptLayout>
  );
};

export default InsuranceDeskAppeals;
