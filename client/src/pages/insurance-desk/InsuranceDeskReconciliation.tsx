import { useEffect, useState, useCallback } from 'react';
import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ShieldCheck, RefreshCw, Loader2, ArrowLeftRight, Plus, CheckCircle2, XCircle } from 'lucide-react';
import api from '@/utils/api';
import { navSections } from './navSections';

interface Posting {
  id: number;
  claim_id: number | null;
  claim_number?: string | null;
  patient_id?: number | null;
  payer_name?: string | null;
  check_number?: string | null;
  payment_amount: number;
  adjustment_amount: number;
  patient_responsibility: number;
  status: string;
  posted_at: string;
}

const formatCurrency = (amount?: number | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
const formatDate = (v?: string) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

const emptyRemit = { claimNumber: '', paidAmount: '', checkNumber: '', payerName: '' };

const InsuranceDeskReconciliation = () => {
  const [postings, setPostings] = useState<Posting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showPost, setShowPost] = useState(false);
  const [remit, setRemit] = useState(emptyRemit);
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/hospital/insurance/reconciliation/postings');
      setPostings(data.postings || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load reconciliation postings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitRemittance = async () => {
    const paidAmount = parseFloat(remit.paidAmount);
    if (!remit.claimNumber.trim() || !(paidAmount > 0)) {
      setPostResult({ ok: false, msg: 'Claim number and a positive paid amount are required.' });
      return;
    }
    setPosting(true);
    setPostResult(null);
    try {
      const { data } = await api.post('/hospital/insurance/reconciliation/upload', {
        remittances: [{
          claimNumber: remit.claimNumber.trim(),
          paidAmount,
          checkNumber: remit.checkNumber.trim() || undefined,
          payerName: remit.payerName.trim() || undefined,
        }],
      });
      const failed = data.results?.find((r: any) => !r.success);
      if (failed) {
        setPostResult({ ok: false, msg: failed.message || 'Posting failed.' });
      } else {
        setPostResult({ ok: true, msg: `Posted ${formatCurrency(paidAmount)} against ${remit.claimNumber}.` });
        setRemit(emptyRemit);
        load();
      }
    } catch (err: any) {
      setPostResult({ ok: false, msg: err?.response?.data?.message || 'Posting failed.' });
    } finally {
      setPosting(false);
    }
  };

  const totalPosted = postings.reduce((s, p) => s + (Number(p.payment_amount) || 0), 0);

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Reconciliation" subtitle="Post insurer remittances (ERA/bank statement) against claims" copilotModule="insurance">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Postings</p><p className="text-xl font-bold">{postings.length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total Posted</p><p className="text-xl font-bold text-emerald-600">{formatCurrency(totalPosted)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Unlinked to a Claim</p><p className="text-xl font-bold text-amber-600">{postings.filter((p) => !p.claim_id).length}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2"><ArrowLeftRight className="h-4 w-4 text-teal-600" /> Posted Remittances</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => { setShowPost(true); setPostResult(null); }}>
              <Plus className="h-4 w-4" /> Post Remittance
            </Button>
            <Button variant="outline" size="sm" className="gap-1" onClick={load}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-amber-600 mb-3">{error}</p>}
          {loading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…</div>
          ) : postings.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl">
              <ArrowLeftRight className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No remittances posted yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Claim #</TableHead><TableHead>Payer</TableHead><TableHead>Reference</TableHead>
                  <TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Adjustment</TableHead>
                  <TableHead>Linked</TableHead><TableHead>Posted</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {postings.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.claim_number || '—'}</TableCell>
                      <TableCell>{p.payer_name || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{p.check_number || '—'}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(p.payment_amount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(p.adjustment_amount)}</TableCell>
                      <TableCell>
                        {p.claim_id
                          ? <Badge className="bg-emerald-100 text-emerald-700 gap-1"><CheckCircle2 className="h-3 w-3" /> Linked</Badge>
                          : <Badge variant="outline" className="text-amber-700 border-amber-400 gap-1"><XCircle className="h-3 w-3" /> Unmatched</Badge>}
                      </TableCell>
                      <TableCell>{formatDate(p.posted_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showPost} onOpenChange={setShowPost}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Post a Remittance</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Enter one remittance line at a time from the insurer's payment advice or bank statement. It will be matched to the claim by claim number and the claim's settlement status updated automatically.
            </p>
            <div><Label>Claim Number</Label><Input value={remit.claimNumber} onChange={(e) => setRemit((r) => ({ ...r, claimNumber: e.target.value }))} placeholder="e.g. CLM1783..." /></div>
            <div><Label>Paid Amount</Label><Input type="number" value={remit.paidAmount} onChange={(e) => setRemit((r) => ({ ...r, paidAmount: e.target.value }))} /></div>
            <div><Label>Payer Name</Label><Input value={remit.payerName} onChange={(e) => setRemit((r) => ({ ...r, payerName: e.target.value }))} placeholder="e.g. Star Health" /></div>
            <div><Label>UTR / Reference Number</Label><Input value={remit.checkNumber} onChange={(e) => setRemit((r) => ({ ...r, checkNumber: e.target.value }))} /></div>
            {postResult && <p className={`text-sm ${postResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>{postResult.msg}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPost(false)}>Cancel</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={submitRemittance} disabled={posting}>
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Post'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HospDeptLayout>
  );
};

export default InsuranceDeskReconciliation;
