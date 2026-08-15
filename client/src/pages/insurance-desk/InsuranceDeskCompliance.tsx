import { useEffect, useState, useCallback } from 'react';
import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ShieldCheck, RefreshCw, Loader2, Landmark, Globe2, Fingerprint, Receipt, BadgeCheck, CheckCircle2, XCircle, Clock, Send, History, AlertTriangle,
} from 'lucide-react';
import api from '@/utils/api';
import { navSections } from './navSections';

const formatCurrency = (amount?: number | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

interface GovtScheme { id: string; name: string; fullName: string; empaneled: boolean; panelCode?: string | null; patientEligibility: string; coverage: string; claimProcess: string }
interface GovtClaim { id: string; scheme: string; claimNo: string; patient: string; amount: number; status: string; date: string; procedure: string }
interface NhcxData {
  activationStatus: string; environment: string; onboardingStep?: number;
  requirements: { item: string; done: boolean }[];
  timeline: { date: string; milestone: string; status: string }[];
  flows: { name: string; status: string; desc: string }[];
  hfrData?: { facilityId: string; [key: string]: any };
  participantData?: { participantName: string; [key: string]: any };
  [key: string]: any;
}
interface AbdmRegistration { facilityId: string; status: string; submittedAt?: string }
interface AbdmData { linkedRecords: AbdmRecord[]; consents: Consent[]; registration?: AbdmRegistration; [key: string]: any }
interface AbdmRecord { id: string; abhaId: string; name: string; mobile: string; status: string; linkedDate: string }
interface Consent { id: string; patient: string; purpose: string; hiu: string; status: string; expiry: string }
interface TariffItem { id: string; payerName: string; payerType: string; category: string; serviceName: string; unit: string; grossRate: number; contractedRate: number; validTo: string }
interface Empanelment { id: string; insurer: string; type: string; status: string; expiryDate: string; daysToExpiry: number; panelCode: string; accreditationStatus: string; complianceScore: number }
interface ComplianceItem { id: string; category: string; item: string; status: string; expiry: string | null }
interface NhcxActivityEntry { id: number; workflow: string; correlation_id: string | null; configured: boolean; sent: boolean; error: string | null; created_at: string }

const STATUS_DOT: Record<string, string> = {
  ready: 'text-emerald-600', active: 'text-emerald-600', valid: 'text-emerald-600', granted: 'text-emerald-600', verified: 'text-emerald-600',
  in_progress: 'text-amber-600', current: 'text-amber-600', renewal_due: 'text-amber-600', expiring: 'text-amber-600', pending_renewal: 'text-amber-600', requested: 'text-amber-600', pending: 'text-amber-600',
  pending_docs: 'text-blue-600', submitted: 'text-blue-600', approved: 'text-emerald-600', settled: 'text-emerald-600',
  upcoming: 'text-muted-foreground', overdue: 'text-red-600',
};

const InsuranceDeskCompliance = () => {
  const [tab, setTab] = useState('govt-schemes');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [govtSchemes, setGovtSchemes] = useState<GovtScheme[]>([]);
  const [govtClaims, setGovtClaims] = useState<GovtClaim[]>([]);
  const [nhcx, setNhcx] = useState<NhcxData | null>(null);
  const [abdm, setAbdm] = useState<AbdmData | null>(null);
  const [abdmRecords, setAbdmRecords] = useState<AbdmRecord[]>([]);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [tariffItems, setTariffItems] = useState<TariffItem[]>([]);
  const [empanelments, setEmpanelments] = useState<Empanelment[]>([]);
  const [complianceItems, setComplianceItems] = useState<ComplianceItem[]>([]);

  const [nhcxForm, setNhcxForm] = useState({ facilityId: '', mobile: '', email: '' });
  const [submittingNhcx, setSubmittingNhcx] = useState(false);
  const [nhcxSubmitError, setNhcxSubmitError] = useState<string | null>(null);
  const [nhcxActivity, setNhcxActivity] = useState<NhcxActivityEntry[]>([]);
  const [nhcxActivityLoading, setNhcxActivityLoading] = useState(false);

  const [abdmFacilityId, setAbdmFacilityId] = useState('');
  const [submittingAbdm, setSubmittingAbdm] = useState(false);
  const [abdmSubmitError, setAbdmSubmitError] = useState<string | null>(null);

  const load = useCallback(async (which: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/hospital/insurance/portal/compliance/${which}`);
      const d = data.data || {};
      if (which === 'govt-schemes') { setGovtSchemes(d.schemes || []); setGovtClaims(d.claims || []); }
      else if (which === 'nhcx') { setNhcx(d); setNhcxForm({ facilityId: d.hfrData?.facilityId || '', mobile: d.participantData?.mobile || '', email: d.participantData?.email || '' }); }
      else if (which === 'abdm') { setAbdm(d); setAbdmRecords(d.linkedRecords || []); setConsents(d.consents || []); setAbdmFacilityId(d.registration?.facilityId || ''); }
      else if (which === 'tariff') { setTariffItems(d.items || []); }
      else if (which === 'empanelment') { setEmpanelments(d.empanelments || []); setComplianceItems(d.complianceItems || []); }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load this section.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadNhcxActivity = useCallback(async () => {
    setNhcxActivityLoading(true);
    try {
      const { data } = await api.get('/hospital/insurance/nhcx/activity');
      setNhcxActivity(data.activity || []);
    } catch {
      setNhcxActivity([]);
    } finally {
      setNhcxActivityLoading(false);
    }
  }, []);

  useEffect(() => { load(tab); if (tab === 'nhcx') loadNhcxActivity(); }, [tab, load, loadNhcxActivity]);

  const submitNhcxOnboarding = async () => {
    if (!nhcx) return;
    if (!nhcxForm.facilityId.trim()) {
      setNhcxSubmitError('HFR (Health Facility Registry) ID is required.');
      return;
    }
    setSubmittingNhcx(true);
    setNhcxSubmitError(null);
    try {
      const payload = {
        ...nhcx,
        hfrData: { ...nhcx.hfrData, facilityId: nhcxForm.facilityId.trim() },
        participantData: { ...nhcx.participantData, mobile: nhcxForm.mobile.trim(), email: nhcxForm.email.trim() },
        activationStatus: 'Pending Verification',
        onboardingStep: Math.max(nhcx.onboardingStep || 0, 1),
      };
      const { data } = await api.put('/hospital/insurance/portal/compliance/nhcx', { data: payload });
      setNhcx(data.data);
    } catch (err: any) {
      setNhcxSubmitError(err?.response?.data?.message || 'Could not submit NHCX onboarding request.');
    } finally {
      setSubmittingNhcx(false);
    }
  };

  const submitAbdmRegistration = async () => {
    if (!abdm) return;
    if (!abdmFacilityId.trim()) {
      setAbdmSubmitError('Facility ID is required.');
      return;
    }
    setSubmittingAbdm(true);
    setAbdmSubmitError(null);
    try {
      const payload = {
        ...abdm,
        registration: { facilityId: abdmFacilityId.trim(), status: 'pending', submittedAt: new Date().toISOString() },
      };
      const { data } = await api.put('/hospital/insurance/portal/compliance/abdm', { data: payload });
      setAbdm(data.data);
    } catch (err: any) {
      setAbdmSubmitError(err?.response?.data?.message || 'Could not submit HIP/HIU registration.');
    } finally {
      setSubmittingAbdm(false);
    }
  };

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Compliance & Government Schemes" subtitle="CGHS/ECHS/ESI/PMJAY, NHCX readiness, ABDM, tariff, and empanelment" copilotModule="insurance">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Compliance</CardTitle>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => load(tab)}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-amber-600 mb-3">{error}</p>}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="govt-schemes" className="gap-1"><Landmark className="h-3.5 w-3.5" /> Govt Schemes</TabsTrigger>
              <TabsTrigger value="nhcx" className="gap-1"><Globe2 className="h-3.5 w-3.5" /> NHCX</TabsTrigger>
              <TabsTrigger value="abdm" className="gap-1"><Fingerprint className="h-3.5 w-3.5" /> ABDM</TabsTrigger>
              <TabsTrigger value="tariff" className="gap-1"><Receipt className="h-3.5 w-3.5" /> Tariff</TabsTrigger>
              <TabsTrigger value="empanelment" className="gap-1"><BadgeCheck className="h-3.5 w-3.5" /> Empanelment</TabsTrigger>
            </TabsList>

            {loading ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…</div>
            ) : (
              <>
                <TabsContent value="govt-schemes" className="space-y-4 mt-4">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Scheme</TableHead><TableHead>Empaneled</TableHead><TableHead>Eligibility</TableHead><TableHead>Claim Process</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {govtSchemes.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell><p className="font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{s.fullName}</p></TableCell>
                            <TableCell>{s.empaneled ? <Badge className="bg-emerald-100 text-emerald-700 gap-1"><CheckCircle2 className="h-3 w-3" />Empaneled</Badge> : <Badge variant="outline" className="text-muted-foreground gap-1"><XCircle className="h-3 w-3" />Not empaneled</Badge>}</TableCell>
                            <TableCell className="max-w-[220px] text-xs">{s.patientEligibility}</TableCell>
                            <TableCell className="max-w-[280px] text-xs text-muted-foreground">{s.claimProcess}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Recent Government Scheme Claims</p>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>Scheme</TableHead><TableHead>Claim #</TableHead><TableHead>Patient</TableHead><TableHead>Procedure</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {govtClaims.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell>{c.scheme}</TableCell>
                              <TableCell className="font-mono text-xs">{c.claimNo}</TableCell>
                              <TableCell>{c.patient}</TableCell>
                              <TableCell className="text-xs">{c.procedure}</TableCell>
                              <TableCell className="text-right">{formatCurrency(c.amount)}</TableCell>
                              <TableCell><Badge variant="outline" className={STATUS_DOT[c.status]}>{c.status.replace(/_/g, ' ')}</Badge></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="nhcx" className="space-y-4 mt-4">
                  {nhcx && (
                    <>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-sm">{nhcx.environment}</Badge>
                        <Badge className={nhcx.activationStatus === 'Sandbox Ready'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-muted text-muted-foreground'}>{nhcx.activationStatus}</Badge>
                      </div>

                      <Card>
                        <CardHeader className="pb-3"><CardTitle className="text-sm">Participant Onboarding</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                          <p className="text-xs text-muted-foreground">Submit facility details to initiate NHCX participant creation — this records the request for the National Health Authority's verification process; it does not itself grant live NHCX access.</p>
                          {nhcxSubmitError && <p className="text-sm text-red-600">{nhcxSubmitError}</p>}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label>Health Facility Registry (HFR) ID</Label>
                              <Input value={nhcxForm.facilityId} onChange={(e) => setNhcxForm((f) => ({ ...f, facilityId: e.target.value }))} placeholder="e.g. IN2910000123" />
                            </div>
                            <div>
                              <Label>Registered Mobile Number</Label>
                              <Input value={nhcxForm.mobile} onChange={(e) => setNhcxForm((f) => ({ ...f, mobile: e.target.value }))} placeholder="Registered in HFR" />
                            </div>
                            <div className="col-span-2">
                              <Label>Hospital Email Address</Label>
                              <Input value={nhcxForm.email} onChange={(e) => setNhcxForm((f) => ({ ...f, email: e.target.value }))} placeholder="Registered in HFR" />
                            </div>
                          </div>
                          <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={submitNhcxOnboarding} disabled={submittingNhcx}>
                            {submittingNhcx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Submit for NHCX Onboarding
                          </Button>
                        </CardContent>
                      </Card>

                      <div>
                        <p className="text-sm font-medium mb-2">Onboarding Requirements</p>
                        <div className="space-y-1.5">
                          {nhcx.requirements.map((r, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              {r.done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                              <span className={r.done ? '' : 'text-muted-foreground'}>{r.item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2">Rollout Timeline</p>
                        <div className="space-y-1.5">
                          {nhcx.timeline.map((t, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              <Clock className={`h-4 w-4 ${STATUS_DOT[t.status] || 'text-muted-foreground'}`} />
                              <span className="font-medium">{t.date}</span><span className="text-muted-foreground">— {t.milestone}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2">NHCX Flows</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {nhcx.flows.map((f, i) => (
                            <Card key={i}><CardContent className="p-3">
                              <p className="text-sm font-medium">{f.name}</p>
                              <p className="text-xs text-muted-foreground mb-1">{f.desc}</p>
                              <Badge variant="outline" className={STATUS_DOT[f.status]}>{f.status.replace(/_/g, ' ')}</Badge>
                            </CardContent></Card>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Recent Activity</p>
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={loadNhcxActivity}>
                            <RefreshCw className="h-3 w-3" /> Refresh
                          </Button>
                        </div>
                        {nhcxActivityLoading ? (
                          <div className="h-16 flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
                        ) : nhcxActivity.length === 0 ? (
                          <p className="text-xs text-muted-foreground border-2 border-dashed rounded-lg p-4 text-center">
                            No NHCX calls yet — eligibility checks, pre-auth, and claim submissions made through NHCX will appear here.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {nhcxActivity.map((a) => (
                              <div key={a.id} className="flex items-center justify-between gap-2 text-xs border rounded-lg p-2.5">
                                <div className="flex items-center gap-2">
                                  {a.sent ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                                  <span className="font-medium capitalize">{a.workflow.replace(/-/g, ' ')}</span>
                                  {a.error && <span className="text-muted-foreground truncate max-w-[240px]">{a.error}</span>}
                                </div>
                                <span className="text-muted-foreground shrink-0">{new Date(a.created_at).toLocaleString('en-IN')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="abdm" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-sm">Health Repository Provider</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {abdm?.registration ? (
                        <div className="flex items-center gap-2 text-sm">
                          <Badge className={STATUS_DOT[abdm.registration.status] || ''} variant="outline">{abdm.registration.status}</Badge>
                          <span className="font-mono text-xs text-muted-foreground">{abdm.registration.facilityId}</span>
                          {abdm.registration.submittedAt && <span className="text-xs text-muted-foreground">submitted {formatDate(abdm.registration.submittedAt)}</span>}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Not yet registered as a Health Information Provider/User (HIP/HIU) with ABDM.</p>
                      )}
                      {abdmSubmitError && <p className="text-sm text-red-600">{abdmSubmitError}</p>}
                      <div className="flex gap-2">
                        <Input value={abdmFacilityId} onChange={(e) => setAbdmFacilityId(e.target.value)} placeholder="Enter Facility ID" className="max-w-xs" />
                        <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700 whitespace-nowrap" onClick={submitAbdmRegistration} disabled={submittingAbdm}>
                          {submittingAbdm ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
                          Register as HIP/HIU
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  <div>
                    <p className="text-sm font-medium mb-2">Linked ABHA Records</p>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>ABHA ID</TableHead><TableHead>Name</TableHead><TableHead>Mobile</TableHead><TableHead>Status</TableHead><TableHead>Linked On</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {abdmRecords.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-mono text-xs">{r.abhaId}</TableCell>
                              <TableCell>{r.name}</TableCell>
                              <TableCell>{r.mobile}</TableCell>
                              <TableCell><Badge variant="outline" className={STATUS_DOT[r.status]}>{r.status}</Badge></TableCell>
                              <TableCell>{formatDate(r.linkedDate)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Consent Management</p>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Purpose</TableHead><TableHead>HIU</TableHead><TableHead>Status</TableHead><TableHead>Expiry</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {consents.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell>{c.patient}</TableCell>
                              <TableCell>{c.purpose}</TableCell>
                              <TableCell>{c.hiu}</TableCell>
                              <TableCell><Badge variant="outline" className={STATUS_DOT[c.status]}>{c.status}</Badge></TableCell>
                              <TableCell>{formatDate(c.expiry)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="tariff" className="mt-4">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Payer</TableHead><TableHead>Category</TableHead><TableHead>Service</TableHead><TableHead>Unit</TableHead>
                        <TableHead className="text-right">Gross Rate</TableHead><TableHead className="text-right">Contracted Rate</TableHead><TableHead>Valid To</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {tariffItems.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell>{t.payerName} <Badge variant="outline" className="ml-1 text-[10px]">{t.payerType}</Badge></TableCell>
                            <TableCell>{t.category}</TableCell>
                            <TableCell>{t.serviceName}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{t.unit}</TableCell>
                            <TableCell className="text-right">{formatCurrency(t.grossRate)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(t.contractedRate)}</TableCell>
                            <TableCell>{formatDate(t.validTo)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="empanelment" className="space-y-4 mt-4">
                  <div>
                    <p className="text-sm font-medium mb-2">Insurer / TPA Empanelments</p>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>Insurer</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Expiry</TableHead>
                          <TableHead>Accreditation</TableHead><TableHead className="text-right">Compliance Score</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {empanelments.map((e) => (
                            <TableRow key={e.id}>
                              <TableCell>{e.insurer}<p className="text-xs text-muted-foreground font-mono">{e.panelCode}</p></TableCell>
                              <TableCell>{e.type}</TableCell>
                              <TableCell>
                                <Badge className={e.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>{e.status.replace(/_/g, ' ')}</Badge>
                                {e.daysToExpiry <= 30 && <p className="text-[10px] text-red-600 mt-0.5">{e.daysToExpiry}d to expiry</p>}
                              </TableCell>
                              <TableCell>{formatDate(e.expiryDate)}</TableCell>
                              <TableCell className="text-xs">{e.accreditationStatus}</TableCell>
                              <TableCell className="text-right font-medium">{e.complianceScore}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Compliance Checklist</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {complianceItems.map((c) => (
                        <div key={c.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                          <div><p className="font-medium">{c.item}</p><p className="text-xs text-muted-foreground">{c.category}{c.expiry ? ` · expires ${formatDate(c.expiry)}` : ''}</p></div>
                          <Badge variant="outline" className={STATUS_DOT[c.status]}>{c.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>
              </>
            )}
          </Tabs>
        </CardContent>
      </Card>
    </HospDeptLayout>
  );
};

export default InsuranceDeskCompliance;
