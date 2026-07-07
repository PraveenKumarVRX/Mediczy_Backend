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
import {
  ShieldCheck, RefreshCw, Loader2, Bot, Sparkles, Send, Scale,
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

  const openDraft = (appeal: Appeal) => {
    setSelected(appeal);
    setRejectionReasonInput(appeal.rejectionReason || '');
    setDraftError(null);
    setDraftSubject('');
    setDraftBody('');
    setSubmitted(null);
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
