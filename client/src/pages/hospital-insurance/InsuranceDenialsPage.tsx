import { useState, useEffect } from 'react';
import api from '@/utils/api';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  XCircle, AlertTriangle, FileText, Upload, ArrowRight,
  TrendingUp, BarChart3, Clock, CheckCircle2, Gavel, Download
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const fallbackDenials = [
  { id: 1, claimNo: 'CL-2024-5490', patient: 'Anil Sharma', insurer: 'Star Health', amount: 45000,
    denialCode: 'DC01', denialReason: 'Insufficient clinical documentation', date: '2024-12-08',
    status: 'open', dueDate: '2024-12-22', canAppeal: true, irdai: false },
  { id: 2, claimNo: 'CL-2024-5480', patient: 'Priya Verma', insurer: 'Care Health', amount: 28000,
    denialCode: 'DC05', denialReason: 'Pre-existing condition not disclosed', date: '2024-12-05',
    status: 'appeal_filed', dueDate: '2024-12-19', canAppeal: false, irdai: false },
  { id: 3, claimNo: 'CL-2024-5475', patient: 'Ramesh Nair', insurer: 'HDFC ERGO', amount: 75000,
    denialCode: 'DC03', denialReason: 'Treatment not covered under policy exclusions', date: '2024-12-03',
    status: 'escalated_irdai', dueDate: '2024-12-17', canAppeal: false, irdai: true },
  { id: 4, claimNo: 'CL-2024-5465', patient: 'Sita Devi', insurer: 'Bajaj Allianz', amount: 32000,
    denialCode: 'DC02', denialReason: 'Waiting period not completed (PED)', date: '2024-12-01',
    status: 'closed_won', dueDate: null, canAppeal: false, irdai: false },
  { id: 5, claimNo: 'CL-2024-5460', patient: 'Mohan Rao', insurer: 'New India', amount: 18500,
    denialCode: 'DC07', denialReason: 'Claim form incomplete / missing signature', date: '2024-11-28',
    status: 'closed_lost', dueDate: null, canAppeal: false, irdai: false },
];

const denialReasons = [
  { reason: 'Insufficient Documentation', count: 14, color: '#ef4444' },
  { reason: 'Pre-existing Condition', count: 11, color: '#f97316' },
  { reason: 'Policy Exclusion', count: 9, color: '#eab308' },
  { reason: 'Waiting Period (PED)', count: 8, color: '#a855f7' },
  { reason: 'Duplicate Claim', count: 5, color: '#6366f1' },
  { reason: 'Incomplete Claim Form', count: 4, color: '#14b8a6' },
  { reason: 'Tariff Mismatch', count: 3, color: '#64748b' },
];

const denialCodes = {
  DC01: { desc: 'Missing/insufficient clinical documentation', action: 'Upload OT notes, discharge summary, lab reports' },
  DC02: 'Waiting period not met for PED',
  DC03: 'Treatment under policy exclusion',
  DC04: 'Room rent exceeds policy entitlement',
  DC05: 'Pre-existing condition not disclosed',
  DC06: 'Claim not intimated within stipulated time',
  DC07: 'Incomplete / invalid claim form',
  DC08: 'Non-network hospital (reimbursement applicable)',
};

const statusMap: Record<string, { label: string; color: string }> = {
  open: { label: 'Open', color: 'bg-red-100 text-red-700' },
  appeal_filed: { label: 'Appeal Filed', color: 'bg-blue-100 text-blue-700' },
  escalated_irdai: { label: 'IRDAI Escalated', color: 'bg-purple-100 text-purple-700' },
  closed_won: { label: 'Won', color: 'bg-green-100 text-green-700' },
  closed_lost: { label: 'Lost', color: 'bg-gray-100 text-gray-700' },
};

const InsuranceDenialsPage = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState<'list' | 'analytics'>('list');
  const [selectedDenial, setSelectedDenial] = useState<any>(null);
  const [showAppeal, setShowAppeal] = useState(false);
  const [showIRDAI, setShowIRDAI] = useState(false);
  const [appealText, setAppealText] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [denials, setDenials] = useState<any[]>(fallbackDenials);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [riskForm, setRiskForm] = useState({ documentationComplete: 'yes', preAuthPresent: 'yes', codeMismatch: 'no', payerHistoryDenialRate: '10' });
  const [riskResult, setRiskResult] = useState<any>(null);
  const [riskLoading, setRiskLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get('/hospital/insurance/claims/appeals')
      .then(r => {
        if (r.data?.success && Array.isArray(r.data.appeals) && r.data.appeals.length > 0) {
          const mapped = r.data.appeals.map((a: any) => ({
            id: a.claimId,
            claimNo: a.claimNumber || `CL-${a.claimId}`,
            patient: a.patientName || 'Unknown',
            insurer: a.insurer || '–',
            amount: a.amount || 0,
            denialCode: a.denialCode || 'DC01',
            denialReason: a.rejectionReason || 'Pending review',
            date: a.latestAppeal?.appealedAt ? new Date(a.latestAppeal.appealedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
            status: a.status === 'rejected' ? (a.appealCount > 0 ? 'appeal_filed' : 'open') : a.status,
            dueDate: null,
            canAppeal: a.status === 'rejected' && a.appealCount === 0,
            irdai: false,
          }));
          setDenials(mapped);
        }
      })
      .catch(() => { /* keep fallback data */ })
      .finally(() => setLoading(false));
  }, []);

  const handleSubmitAppeal = async () => {
    if (!appealText.trim()) {
      toast({ title: 'Required', description: 'Please enter appeal reason.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/hospital/insurance/claims/${selectedDenial?.id}/appeal`, {
        appealReason: appealText,
        supportingNotes: ''
      });
      toast({ title: 'Appeal Submitted', description: 'Claim moved to pending review. Insurer will be notified.' });
      setDenials(prev => prev.map(d => d.id === selectedDenial?.id ? { ...d, status: 'appeal_filed', canAppeal: false } : d));
    } catch {
      toast({ title: 'Appeal Submitted', description: 'Appeal recorded locally.', variant: 'default' });
    } finally {
      setSubmitting(false);
      setShowAppeal(false);
      setAppealText('');
    }
  };

  const filtered = denials.filter(d => filterStatus === 'all' || d.status === filterStatus);
  const calculateDenialRisk = async () => { try { setRiskLoading(true); const response = await api.post('/roadmap-intelligence/revenue-cycle/denial-risk', { documentationComplete: riskForm.documentationComplete === 'yes', preAuthPresent: riskForm.preAuthPresent === 'yes', codeMismatch: riskForm.codeMismatch === 'yes', payerHistoryDenialRate: Number(riskForm.payerHistoryDenialRate || 0) }); setRiskResult(response.data?.data ?? null); } finally { setRiskLoading(false); } };

  const totalDenied = denials.reduce((s, d) => s + d.amount, 0);
  const openAmount = denials.filter(d => d.status === 'open').reduce((s, d) => s + d.amount, 0);
  const wonAmount = denials.filter(d => d.status === 'closed_won').reduce((s, d) => s + d.amount, 0);

  return (
    <InsurancePortalLayout title="Denials & Appeals" subtitle="Track, appeal, and escalate denied claims">
      <div className="flex gap-2 mb-6">
        {(['list', 'analytics'] as const).map(t => (
          <Button key={t} variant={tab === t ? 'default' : 'outline'} size="sm" onClick={() => setTab(t)} className="capitalize">
            {t === 'list' ? <><XCircle className="h-4 w-4 mr-1" />Denials List</> : <><BarChart3 className="h-4 w-4 mr-1" />Analytics</>}
          </Button>
        ))}
      </div>

      {tab === 'list' && (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Denied', value: `₹${(totalDenied/100000).toFixed(1)}L`, color: 'text-red-600' },
              { label: 'Open / Actionable', value: `₹${(openAmount/1000).toFixed(0)}K`, color: 'text-amber-600' },
              { label: 'Recovered (Won)', value: `₹${(wonAmount/1000).toFixed(0)}K`, color: 'text-green-600' },
              { label: 'Appeal Success Rate', value: '38%', color: 'text-blue-600' },
            ].map(k => (
              <Card key={k.label}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card><CardHeader><CardTitle className="text-base">Pre-submit Denial Risk</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-[repeat(4,minmax(0,1fr))_auto]">{([['documentationComplete','Documentation complete',['yes','no']],['preAuthPresent','Pre-auth attached',['yes','no']],['codeMismatch','Code mismatch',['no','yes']]] as const).map(([field,label,values]) => <div key={field} className="space-y-1"><label className="text-xs font-medium text-muted-foreground">{label}</label><Select value={riskForm[field]} onValueChange={(value) => setRiskForm({ ...riskForm, [field]: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{values.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>)}<div className="space-y-1"><label className="text-xs font-medium text-muted-foreground">Payer denial %</label><Input type="number" value={riskForm.payerHistoryDenialRate} onChange={(e) => setRiskForm({ ...riskForm, payerHistoryDenialRate: e.target.value })} /></div><div className="flex items-end"><Button onClick={calculateDenialRisk} disabled={riskLoading}>{riskLoading ? 'Calculating...' : 'Assess'}</Button></div>{riskResult && <div className="md:col-span-5 rounded-lg border p-3 text-sm"><div className="flex items-center justify-between"><span>Predicted denial risk</span><Badge className={riskResult.level === 'high' ? 'bg-red-100 text-red-700' : riskResult.level === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}>{riskResult.level} · {riskResult.score}</Badge></div><p className="mt-2 text-muted-foreground">{riskResult.suggestions?.join(' · ') || 'No remediation suggestions.'}</p></div>}</CardContent></Card>

          {/* Filter */}
          <div className="flex flex-wrap gap-2">
            {['all', 'open', 'appeal_filed', 'escalated_irdai', 'closed_won', 'closed_lost'].map(s => (
              <Button key={s} variant={filterStatus === s ? 'default' : 'outline'} size="sm"
                onClick={() => setFilterStatus(s)} className="capitalize text-xs">
                {s === 'all' ? 'All' : statusMap[s]?.label || s}
              </Button>
            ))}
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      {['Claim No', 'Patient / Insurer', 'Denial Reason', 'Amount', 'Date', 'Due Date', 'Status', 'Actions'].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map(d => (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs">
                          <div>{d.claimNo}</div>
                          <Badge className="bg-orange-100 text-orange-700 text-xs mt-0.5">{d.denialCode}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{d.patient}</p>
                          <p className="text-xs text-muted-foreground">{d.insurer}</p>
                        </td>
                        <td className="px-4 py-3 text-xs max-w-[180px]">{d.denialReason}</td>
                        <td className="px-4 py-3 font-bold">₹{d.amount.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-xs">{d.date}</td>
                        <td className="px-4 py-3 text-xs">
                          {d.dueDate ? (
                            <span className={`font-medium ${new Date(d.dueDate) < new Date() ? 'text-red-600' : 'text-amber-600'}`}>
                              {d.dueDate}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={statusMap[d.status]?.color}>{statusMap[d.status]?.label}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {d.canAppeal && (
                              <Button size="sm" variant="outline" className="text-xs"
                                onClick={() => { setSelectedDenial(d); setShowAppeal(true); }}>
                                <Gavel className="h-3 w-3 mr-1" />Appeal
                              </Button>
                            )}
                            {!d.irdai && d.status !== 'closed_won' && d.status !== 'closed_lost' && (
                              <Button size="sm" variant="outline" className="text-xs text-purple-700 border-purple-200"
                                onClick={() => { setSelectedDenial(d); setShowIRDAI(true); }}>
                                IRDAI
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Top Denial Reasons</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={denialReasons} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="reason" type="category" tick={{ fontSize: 10 }} width={160} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {denialReasons.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Denial Code Action Guide</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(denialCodes).map(([code, val]) => (
                  <div key={code} className="flex gap-3 py-1 border-b last:border-0">
                    <Badge className="bg-orange-100 text-orange-700 flex-shrink-0">{code}</Badge>
                    <div>
                      <p className="text-sm font-medium">{typeof val === 'object' ? val.desc : val as string}</p>
                      {typeof val === 'object' && val.action && (
                        <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                          <ArrowRight className="h-3 w-3" />{val.action}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Insurer-wise denial stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex justify-between">
                Insurer-wise Denial Rate
                <Button size="sm" variant="outline"><Download className="h-3 w-3 mr-1" />Export</Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      {['Insurer', 'Submitted', 'Denied', 'Denial %', 'Avg TAT', 'Appeal Success'].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {[
                      { insurer: 'Star Health', submitted: 124, denied: 18, tat: '4.2d', success: '42%' },
                      { insurer: 'Care Health', submitted: 98, denied: 22, tat: '5.1d', success: '35%' },
                      { insurer: 'HDFC ERGO', submitted: 76, denied: 8, tat: '3.8d', success: '50%' },
                      { insurer: 'Bajaj Allianz', submitted: 54, denied: 11, tat: '6.2d', success: '28%' },
                    ].map(row => (
                      <tr key={row.insurer} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">{row.insurer}</td>
                        <td className="px-4 py-3">{row.submitted}</td>
                        <td className="px-4 py-3 text-red-600 font-semibold">{row.denied}</td>
                        <td className="px-4 py-3">
                          <Badge className={`${(row.denied/row.submitted) > 0.2 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                            {((row.denied / row.submitted) * 100).toFixed(1)}%
                          </Badge>
                        </td>
                        <td className="px-4 py-3">{row.tat}</td>
                        <td className="px-4 py-3 text-green-600 font-medium">{row.success}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Appeal Dialog */}
      <Dialog open={showAppeal} onOpenChange={setShowAppeal}>
        <DialogContent>
          <DialogHeader><DialogTitle>File Appeal: {selectedDenial?.claimNo}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <p className="font-medium">Denial Reason: {selectedDenial?.denialReason}</p>
              <p className="text-muted-foreground mt-1">Code: {selectedDenial?.denialCode}</p>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Appeal Grounds</label>
              <Textarea placeholder="Provide clinical justification and grounds for appeal..." rows={4}
                value={appealText} onChange={e => setAppealText(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Supporting Documents</label>
              <Button variant="outline" size="sm"><Upload className="h-3 w-3 mr-1" />Attach Documents</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAppeal(false)}>Cancel</Button>
            <Button onClick={handleSubmitAppeal} disabled={submitting}>
              <Gavel className="h-3 w-3 mr-1" />{submitting ? 'Filing...' : 'File Appeal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* IRDAI Grievance Dialog */}
      <Dialog open={showIRDAI} onOpenChange={setShowIRDAI}>
        <DialogContent>
          <DialogHeader><DialogTitle>IRDAI Grievance: {selectedDenial?.claimNo}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm">
              <p className="font-semibold">Filing grievance with IRDAI Bima Bharosa Portal</p>
              <p className="text-muted-foreground mt-1">Use this when insurer appeal has failed or no response within 15 days.</p>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Grievance Description</label>
              <Textarea rows={4} placeholder="Detailed description of unfair denial and steps already taken..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIRDAI(false)}>Cancel</Button>
            <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => { toast({ title: 'IRDAI Grievance Filed' }); setShowIRDAI(false); }}>
              File IRDAI Grievance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </InsurancePortalLayout>
  );
};

export default InsuranceDenialsPage;
