import { useState } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ShieldCheck, ClipboardList, FileText, Building2, UserCheck,
  Search, BarChart3, Settings, HelpCircle, Loader2, X, Bot, Sparkles, Send,
} from 'lucide-react';
import api from '@/utils/api';

import { navSections } from './navSections';

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

  const [appealOpen, setAppealOpen] = useState(false);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [submittingAppeal, setSubmittingAppeal] = useState(false);
  const [appealSubmitted, setAppealSubmitted] = useState<string | null>(null);

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

  const openAppealDialog = () => {
    setAppealOpen(true);
    setRejectionReasonInput('');
    setDraftError(null);
    setDraftSubject('');
    setDraftBody('');
    setAppealSubmitted(null);
  };

  const draftAppeal = async () => {
    if (!selected || !rejectionReasonInput.trim()) {
      setDraftError('Enter the denial/query reason stated by the insurer first.');
      return;
    }
    setDrafting(true);
    setDraftError(null);
    try {
      const { data } = await api.post(`/hospital/insurance/claims/${selected.id}/copilot/draft-appeal`, {
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
    setSubmittingAppeal(true);
    setDraftError(null);
    try {
      await api.post(`/hospital/insurance/claims/${selected.id}/appeal`, {
        appealReason: draftBody.trim(),
        supportingNotes: `AI-drafted appeal — subject: ${draftSubject}`,
      });
      setAppealSubmitted('Appeal submitted. Claim moved to pending review.');
      openHistory(selected);
    } catch (err: any) {
      setDraftError(err?.response?.data?.message || 'Could not submit appeal.');
    } finally {
      setSubmittingAppeal(false);
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
            <div className="flex items-center gap-2">
              {(selected.status === 'rejected' || selected.status === 'query') && (
                <Button size="sm" variant="outline" className="gap-1" onClick={openAppealDialog}>
                  <Bot className="h-4 w-4 text-teal-600" /> Draft Appeal (AI)
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}><X className="h-4 w-4" /></Button>
            </div>
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

      <Dialog open={appealOpen} onOpenChange={setAppealOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Bot className="h-4 w-4 text-teal-600" /> AI-Drafted Appeal — {selected?.claimNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Denial/query reason (as stated by insurer)</Label>
              <Textarea rows={2} value={rejectionReasonInput} onChange={(e) => setRejectionReasonInput(e.target.value)}
                placeholder="e.g. Room rent exceeds policy sub-limit; alleged non-disclosure of pre-existing condition." />
            </div>
            {draftError && <p className="text-sm text-red-600">{draftError}</p>}
            {appealSubmitted ? (
              <p className="text-sm text-emerald-600">{appealSubmitted}</p>
            ) : (
              <>
                <Button size="sm" variant="outline" className="gap-1" onClick={draftAppeal} disabled={drafting}>
                  {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {draftBody ? 'Regenerate Draft' : 'Generate Draft'}
                </Button>
                {draftBody && (
                  <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                    <div>
                      <Label className="text-xs">Subject</Label>
                      <Input value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Body (edit before submitting)</Label>
                      <Textarea rows={10} value={draftBody} onChange={(e) => setDraftBody(e.target.value)} className="font-sans text-sm" />
                    </div>
                    <p className="text-xs text-muted-foreground">AI-generated draft — review and edit before submitting. Nothing is sent to the insurer until you click Submit.</p>
                  </div>
                )}
              </>
            )}
          </div>
          {!appealSubmitted && draftBody && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setAppealOpen(false)}>Cancel</Button>
              <Button className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={submitAppeal} disabled={submittingAppeal}>
                {submittingAppeal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit Appeal
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </HospDeptLayout>
  );
};

export default InsuranceDeskSearch;
