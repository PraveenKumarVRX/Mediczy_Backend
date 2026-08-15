import { useState, useEffect } from 'react';
import api from '@/utils/api';
import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import {
  Bed, Search, CheckCircle2, AlertCircle, User, Shield,
  ShieldCheck, XCircle,
} from 'lucide-react';
import { navSections } from './navSections';

interface Admission {
  id: number;
  uhid: string;
  name: string;
  age: number;
  policy: string;
  insurer: string;
  tpa: string;
  ward: string;
  admDate: string;
  status: string;
  preAuthNo: string;
  sumInsured: number;
}

const mapAdmission = (a: any): Admission => ({
  id: a.id,
  uhid: a.uhid || `UH-${String(a.patientId || a.id).padStart(8, '0')}`,
  name: a.name || 'Unknown',
  age: a.age || 0,
  policy: a.policy || a.policyNumber || '—',
  insurer: a.insurer || a.insuranceProvider || '—',
  tpa: a.tpa || '—',
  ward: a.ward || 'General',
  admDate: a.admDate ? new Date(a.admDate).toISOString().slice(0, 10) : '—',
  status: a.status || 'admitted',
  preAuthNo: a.preAuthNo || a.preAuthNumber || '—',
  sumInsured: a.sumInsured || a.approvedAmt || 0,
});

const extractPatientIdFromUhid = (uhid: string) => {
  const numericId = parseInt(String(uhid || '').replace(/^UH-?/i, '').replace(/\D/g, ''), 10);
  return Number.isNaN(numericId) ? null : numericId;
};

/**
 * Ported 2026-08-15 from the (retired) pages/hospital-insurance/InsuranceAdmissionPage —
 * one of the two genuine feature gaps between the two insurance-desk UI trees.
 * Same backend, /hospital/insurance/admissions — no server changes needed.
 */
const InsuranceDeskAdmissions = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'list' | 'new'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [eligibilityResult, setEligibilityResult] = useState<any>(null);
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [admitting, setAdmitting] = useState(false);
  const [form, setForm] = useState({
    uhid: '', policyNo: '', insurer: '', admDate: '', ward: '',
    preAuthNo: '', diagnosis: '', attendingDoctor: '', expectedDays: '',
  });

  const loadAdmissions = () => {
    setLoading(true);
    api.get('/hospital/insurance/admissions')
      .then((r) => {
        if (r.data?.success && Array.isArray(r.data.admissions)) {
          setAdmissions(r.data.admissions.map(mapAdmission));
        }
      })
      .catch(() => { /* empty list on failure — no fabricated fallback data */ })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAdmissions(); }, []);

  const filteredAdmissions = admissions.filter((a) =>
    !searchTerm || a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.policy.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.uhid.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const checkEligibility = async () => {
    if (!form.policyNo) return;
    setCheckingEligibility(true);
    try {
      let patientId = selectedPatientId || extractPatientIdFromUhid(form.uhid);

      if (!patientId) {
        const searchResponse = await api.post('/hospital/insurance/patient/search', {
          searchTerm: form.policyNo,
          searchType: 'policy',
        });
        const patient = searchResponse.data?.patients?.[0] || searchResponse.data?.results?.[0];
        if (patient?.id) {
          patientId = patient.id;
          setSelectedPatientId(patient.id);
          setForm((current) => ({
            ...current,
            uhid: current.uhid || `UH-${String(patient.id).padStart(8, '0')}`,
            insurer: current.insurer || patient.insurerName || current.insurer,
          }));
        }
      }

      if (!patientId) throw new Error('Patient lookup failed');

      const r = await api.get(`/hospital/insurance/patient/${patientId}/eligibility`, {
        params: { policyNumber: form.policyNo, insuranceProvider: form.insurer || undefined },
      });
      if (r.data?.success && r.data.eligibility) {
        setEligibilityResult(r.data.eligibility);
        toast({ title: 'Eligibility Checked', description: `Status: ${r.data.eligibility.status || 'unknown'}` });
      } else {
        throw new Error('No eligibility data');
      }
    } catch (err: any) {
      setEligibilityResult(null);
      toast({
        title: 'Eligibility check unavailable',
        description: err?.response?.data?.message || 'Could not verify eligibility right now — proceed manually if urgent.',
        variant: 'destructive',
      });
    } finally {
      setCheckingEligibility(false);
    }
  };

  const handleAdmit = async () => {
    if (!form.uhid || !form.policyNo) {
      toast({ title: 'Validation Error', description: 'Patient UHID and Policy No are required.', variant: 'destructive' });
      return;
    }
    setAdmitting(true);
    try {
      await api.post('/hospital/insurance/admissions', {
        uhid: form.uhid,
        policyNo: form.policyNo,
        insurer: form.insurer,
        admDate: form.admDate || new Date().toISOString(),
        ward: form.ward,
        preAuthNo: form.preAuthNo,
        diagnosis: form.diagnosis || 'To be confirmed',
        attendingDoctor: form.attendingDoctor,
        estimatedDays: form.expectedDays,
        estimatedAmount: eligibilityResult?.preAuthApproved || 0,
      });
      toast({ title: 'Patient Admitted', description: 'Admission registered. Insurer notified.' });
      loadAdmissions();
      setTab('list');
    } catch (err: any) {
      toast({ title: 'Admission failed', description: err?.response?.data?.message || 'Could not register admission.', variant: 'destructive' });
    } finally {
      setAdmitting(false);
    }
  };

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Admissions" subtitle="Policy verification & cashless admission" copilotModule="insurance">
      <div className="flex gap-2 mb-6">
        <Button variant={tab === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setTab('list')}>
          <Bed className="h-4 w-4 mr-1" />Current Admissions
        </Button>
        <Button variant={tab === 'new' ? 'default' : 'outline'} size="sm" onClick={() => setTab('new')}>
          <User className="h-4 w-4 mr-1" />New Admission
        </Button>
      </div>

      {tab === 'list' && (
        <div className="space-y-4">
          <Input placeholder="Search by name, UHID, or policy no..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)} className="max-w-xs" />

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      {['UHID', 'Patient', 'Policy / Insurer', 'Ward', 'Adm. Date', 'Pre-Auth', 'Actions'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {loading ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                    ) : filteredAdmissions.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No admissions found.</td></tr>
                    ) : filteredAdmissions.map((a) => (
                      <tr key={a.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs">{a.uhid}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{a.name}</p>
                          <p className="text-xs text-muted-foreground">{a.age} yrs</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs">{a.policy}</p>
                          <p className="text-xs text-muted-foreground">{a.insurer} / {a.tpa}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={a.ward === 'ICU' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'}>{a.ward}</Badge>
                        </td>
                        <td className="px-4 py-3 text-sm">{a.admDate}</td>
                        <td className="px-4 py-3">
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">{a.preAuthNo}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate(`/insurance-desk/pre-auth?status=approved`)}>
                              Pre-Auth
                            </Button>
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

      {tab === 'new' && (
        <div className="max-w-3xl space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Policy Eligibility Check</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-sm font-medium block mb-1">Policy Number / ABHA ID</label>
                  <Input placeholder="STAR-XXXXXXXX or 91-XXXX..." value={form.policyNo}
                    onChange={(e) => setForm({ ...form, policyNo: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Insurer</label>
                  <Select value={form.insurer} onValueChange={(v) => setForm({ ...form, insurer: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {['Star Health', 'Care Health', 'HDFC ERGO', 'ICICI Lombard', 'Bajaj Allianz', 'Niva Bupa', 'New India'].map((i) => (
                        <SelectItem key={i} value={i}>{i}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={checkEligibility} disabled={!form.policyNo || checkingEligibility}>
                <Search className="h-4 w-4 mr-1" />{checkingEligibility ? 'Checking...' : 'Check Eligibility'}
              </Button>

              {eligibilityResult && (
                <div className={`rounded-lg border p-4 space-y-3 ${eligibilityResult.status === 'eligible' ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900' : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900'}`}>
                  <div className="flex items-center gap-2">
                    {eligibilityResult.status === 'eligible'
                      ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                      : <XCircle className="h-5 w-5 text-red-500" />}
                    <span className="font-semibold">{eligibilityResult.status === 'eligible' ? 'Eligible for Cashless' : 'Not Eligible'}</span>
                    {eligibilityResult.networkHospital && <Badge className="bg-green-100 text-green-700 ml-auto">Network Hospital ✓</Badge>}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><p className="text-muted-foreground">Member</p><p className="font-semibold">{eligibilityResult.memberName || '—'}</p></div>
                    <div><p className="text-muted-foreground">Sum Insured</p><p className="font-semibold">₹{Number(eligibilityResult.sumInsured || 0).toLocaleString('en-IN')}</p></div>
                    <div><p className="text-muted-foreground">Balance Available</p><p className="font-semibold text-green-600">₹{Number(eligibilityResult.balance || 0).toLocaleString('en-IN')}</p></div>
                    <div><p className="text-muted-foreground">Co-pay</p><p className="font-semibold">{eligibilityResult.copay || '—'}</p></div>
                  </div>
                  {eligibilityResult.preAuthApproved && (
                    <div className="text-sm bg-background/60 rounded p-2">
                      <span className="text-muted-foreground">Pre-Auth Approved Amount: </span>
                      <span className="font-bold text-indigo-600">₹{Number(eligibilityResult.preAuthApproved).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {eligibilityResult.exclusions?.length > 0 && (
                    <div className="text-sm">
                      <p className="text-muted-foreground flex items-center gap-1"><AlertCircle className="h-3 w-3" />Policy Exclusions:</p>
                      <ul className="list-disc ml-4 mt-1">
                        {eligibilityResult.exclusions.map((e: string) => <li key={e}>{e}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Bed className="h-5 w-5" />Admission Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium block mb-1">Patient UHID *</label>
                  <Input placeholder="UH-XXXXXXXX" value={form.uhid} onChange={(e) => setForm({ ...form, uhid: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Pre-Auth Number (if approved)</label>
                  <Input placeholder="PA-XXXX" value={form.preAuthNo} onChange={(e) => setForm({ ...form, preAuthNo: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Admission Date *</label>
                  <Input type="date" value={form.admDate} onChange={(e) => setForm({ ...form, admDate: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Ward / Room Type</label>
                  <Select value={form.ward} onValueChange={(v) => setForm({ ...form, ward: v })}>
                    <SelectTrigger><SelectValue placeholder="Select ward" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General Ward</SelectItem>
                      <SelectItem value="semi_private">Semi-Private</SelectItem>
                      <SelectItem value="private">Private Room</SelectItem>
                      <SelectItem value="deluxe">Deluxe</SelectItem>
                      <SelectItem value="icu">ICU</SelectItem>
                      <SelectItem value="nicu">NICU</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Attending Doctor</label>
                  <Input placeholder="Dr. Name" value={form.attendingDoctor} onChange={(e) => setForm({ ...form, attendingDoctor: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Diagnosis / Procedure</label>
                  <Input placeholder="Primary diagnosis" value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Expected Stay (days)</label>
                  <Input type="number" placeholder="5" value={form.expectedDays} onChange={(e) => setForm({ ...form, expectedDays: e.target.value })} />
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 dark:bg-amber-950/30 dark:border-amber-900">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />Pre-admission Checklist
                </p>
                <ul className="text-xs space-y-1 text-amber-700 dark:text-amber-400">
                  <li>☐ Collect original policy card / e-card from patient</li>
                  <li>☐ Verify patient photo ID (Aadhaar / PAN)</li>
                  <li>☐ Confirm pre-auth status for non-emergency cases</li>
                  <li>☐ Get signed cashless authorization form</li>
                  <li>☐ Record room category as per policy entitlement</li>
                </ul>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setTab('list')}>Cancel</Button>
                <Button className="bg-green-600 hover:bg-green-700" onClick={handleAdmit} disabled={admitting}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />{admitting ? 'Admitting...' : 'Confirm Admission & Notify Insurer'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </HospDeptLayout>
  );
};

export default InsuranceDeskAdmissions;
