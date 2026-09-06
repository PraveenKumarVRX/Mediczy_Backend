import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TPASidebar from '@/components/tpa/TPASidebar';
import api from '@/utils/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Building2, ClipboardCheck, CreditCard, FileScan, FileText, Hospital, RefreshCw, ShieldCheck, Users } from 'lucide-react';

const metricCards = [
  { title: 'Underwriting', icon: ShieldCheck, key: 'underwritingCases', color: 'text-violet-600' },
  { title: 'Enrollments', icon: Users, key: 'enrollments', color: 'text-cyan-600' },
  { title: 'Providers', icon: Building2, key: 'providerContracts', color: 'text-emerald-600' },
  { title: 'Cashless', icon: Hospital, key: 'cashlessRequests', color: 'text-orange-600' },
];

const steps = [
  'Policy underwriting',
  'Member ID generation + e-card generation',
  'Provider MOU + SOC + blacklist controls',
  'Cashless form + provider request + approval/query/denial',
  'Provider claim submission',
  'Inward → scan → bill entry → adjudication → charge entry → payment',
];

export default function TPAOperationsWorkbench() {
  const navigate = useNavigate();
  const [data, setData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastClaimNumber, setLastClaimNumber] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [underwriting, enrollments, providers, forms, cashless, cases, interop] = await Promise.all([
        api.get('/tpa/underwriting/cases'),
        api.get('/tpa/member-enrollments'),
        api.get('/tpa/provider-contracts'),
        api.get('/tpa/cashless/forms'),
        api.get('/tpa/cashless/requests'),
        api.get('/tpa/provider-cases'),
        api.get('/tpa/interop/events'),
      ]);
      setData({
        underwritingCases: underwriting.data?.underwritingCases || [],
        enrollments: enrollments.data?.enrollments || [],
        providerContracts: providers.data?.providerContracts || [],
        cashlessForms: forms.data?.cashlessForms || [],
        cashlessRequests: cashless.data?.cashlessRequests || [],
        providerCases: cases.data?.providerCases || [],
        interopEvents: interop.data?.interopEvents || [],
      });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not load operations workbench.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const runDemoWorkflow = async () => {
    setBusy(true);
    setError(null);
    const stamp = Date.now();
    try {
      const uw = await api.post('/tpa/underwriting/cases', { caseNumber: `UW-UI-${stamp}`, corporateName: 'Workbench Corporate', livesCount: 240, sumInsured: 500000 });
      await api.post(`/tpa/underwriting/cases/${uw.data.underwritingCase.case_number}/decision`, { decision: 'approved', notes: 'Approved from operations workbench.' });

      const enrollment = await api.post('/tpa/member-enrollments', { enrollmentNumber: `ENR-UI-${stamp}`, corporateName: 'Workbench Corporate', policyNumber: 'POL-2026-001', employeeName: 'Workbench Member', coverageAmount: 500000 });
      const enrollmentDecision = await api.post(`/tpa/member-enrollments/${enrollment.data.enrollment.enrollment_number}/decision`, { decision: 'approved' });
      const generatedMemberId = enrollmentDecision.data?.memberId || enrollment.data?.memberId || enrollment.data?.enrollment?.member_id;
      await api.post(`/tpa/members/${encodeURIComponent(generatedMemberId)}/ecard/generate`);

      const providerCode = `PROV-UI-${stamp}`;
      await api.post('/tpa/provider-contracts', { providerCode, providerName: 'Workbench Network Hospital', city: 'Chennai', state: 'Tamil Nadu', mouNumber: `MOU-${stamp}`, cashlessEnabled: true });
      await api.post(`/tpa/provider-contracts/${providerCode}/soc`, { socNumber: `SOC-UI-${stamp}`, versionLabel: 'FY26', chargeSchedule: [{ code: 'ROOM_SINGLE', description: 'Single room', amount: 5000 }] });

      await api.post('/tpa/cashless/forms', { formCode: `CLF-UI-${stamp}`, formName: 'Workbench Cashless Form', policyNumber: 'POL-2026-001' });
      const cashless = await api.post('/tpa/cashless/requests', { requestNumber: `CLR-UI-${stamp}`, providerCode, providerName: 'Workbench Network Hospital', memberId: generatedMemberId, policyNumber: 'POL-2026-001', patientName: 'Workbench Member', estimatedAmount: 85000, procedureName: 'Planned admission' });
      await api.post(`/tpa/cashless/requests/${cashless.data.cashlessRequest.request_number}/decision`, { decision: 'approved', approvedAmount: 80000 });

      const providerClaim = await api.post('/tpa/provider-claims', { claimNumber: `CLM-UI-${stamp}`, providerCode, providerName: 'Workbench Network Hospital', memberId: generatedMemberId, employeeName: 'Workbench Member', corporateName: 'Workbench Corporate', policyNumber: 'POL-2026-001', finalBillAmount: 82000, documentsCount: 4 });
      const claimNumber = providerClaim.data.claim.claimNumber;
      await api.post(`/tpa/claims/${claimNumber}/scan`, { pagesCount: 14, qualityScore: 91 });
      await api.post(`/tpa/claims/${claimNumber}/bill-entry`, { grossAmount: 82000, nonPayableAmount: 2400, lineItems: [{ lineCode: 'ROOM_SINGLE', description: 'Room rent', quantity: 2, unitAmount: 5000 }, { lineCode: 'SURGERY', description: 'Procedure package', quantity: 1, unitAmount: 72000, nonPayableAmount: 2400 }] });
      await api.post(`/tpa/claims/${claimNumber}/adjudication`, { roomDays: 2, roomRentClaimed: 10000 });
      await api.post(`/tpa/claims/${claimNumber}/charge-entry`, { providerCode, chargeCode: 'SURGERY_PACKAGE', approvedAmount: 76000 });
      await api.post(`/tpa/claims/${claimNumber}/payment-advice`, { beneficiaryName: 'Workbench Network Hospital', payableAmount: 76000, utrNumber: `UTR${stamp}`, status: 'paid' });
      setLastClaimNumber(claimNumber);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Workflow failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <TPASidebar />
      <div className="flex-1 md:ml-64 overflow-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-950">TPA Operations Workbench</h1>
              <p className="mt-1 max-w-4xl text-slate-600">Policy underwriting, member enrollment, provider MOU/SOC, cashless approvals, and inward-to-payment claim operations in one command surface.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={load} disabled={loading} className="bg-white"><RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
              <Button onClick={runDemoWorkflow} disabled={busy}>{busy ? 'Running…' : 'Run full ops flow'}</Button>
            </div>
          </div>

          {error && <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle className="h-4 w-4" /> {error}</div>}

          <div className="grid gap-4 md:grid-cols-4">
            {metricCards.map((card) => {
              const Icon = card.icon;
              const items = data[card.key] || [];
              return <Card key={card.key}><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Icon className={`h-4 w-4 ${card.color}`} /> {card.title}</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{items.length}</div><p className="text-xs text-slate-500">Records in this TPA workspace</p></CardContent></Card>;
            })}
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Operating blueprint</CardTitle><CardDescription>End-to-end workflow implemented by this module.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {steps.map((step, index) => <div key={step} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">{index + 1}</span><p className="text-sm font-medium text-slate-800">{step}</p></div>)}
                {lastClaimNumber && <Button className="w-full" variant="outline" onClick={() => navigate(`/tpa/claims/${encodeURIComponent(lastClaimNumber)}`)}><FileText className="h-4 w-4 mr-2" /> Open latest claim workbench</Button>}
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <ListCard title="Underwriting Cases" icon={ShieldCheck} rows={data.underwritingCases} primary="case_number" secondary="corporate_name" status="status" />
              <ListCard title="Member Enrollments" icon={Users} rows={data.enrollments} primary="enrollment_number" secondary="employee_name" status="status" />
              <ListCard title="Provider Contracts" icon={Building2} rows={data.providerContracts} primary="provider_code" secondary="provider_name" status="contract_status" />
              <ListCard title="Cashless Requests" icon={Hospital} rows={data.cashlessRequests} primary="request_number" secondary="patient_name" status="status" />
              <ListCard title="Provider Cases" icon={FileScan} rows={data.providerCases} primary="case_number" secondary="hospital_name" status="status" />
              <ListCard title="Interop Queue" icon={CreditCard} rows={data.interopEvents} primary="event_number" secondary="target_system" status="status" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ListCard({ title, icon: Icon, rows = [], primary, secondary, status }: { title: string; icon: any; rows: any[]; primary: string; secondary: string; status: string }) {
  return (
    <Card className="bg-white/95">
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4 text-violet-600" /> {title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? <p className="text-sm text-slate-500">No records yet.</p> : rows.slice(0, 4).map((row) => (
          <div key={row.id || row[primary]} className="rounded-xl border border-slate-200 p-3">
            <div className="flex justify-between gap-3"><p className="text-sm font-semibold text-slate-900">{row[primary]}</p><Badge variant="outline">{row[status] || 'active'}</Badge></div>
            <p className="text-xs text-slate-500">{row[secondary]}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
