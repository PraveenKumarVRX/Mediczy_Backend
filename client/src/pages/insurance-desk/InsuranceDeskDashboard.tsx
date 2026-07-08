import { useEffect, useState } from 'react';
import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck, FileText, ClipboardList,
  Building2, BarChart3, PlusCircle,
  Clock, CheckCircle2, XCircle, AlertCircle, Search,
  CalendarClock, Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { navSections } from './navSections';
import api from '@/utils/api';

interface DashboardData {
  stats: {
    pending: number; approved: number; rejected: number; query: number;
    total: number; totalAmount: number; approvedAmount: number; pendingAmount: number;
  };
  recentActivity: Array<{
    id: number; claimNumber: string; claimAmount: number; approvedAmount?: number | null;
    status: string; submittedAt?: string; createdAt?: string; patientName?: string; insurer?: string | null;
  }>;
  alerts: { queriesNeedingResponse: number; pendingDocuments: number; expiringSoon: number };
  insurerBreakdown: Array<{ name: string; value: number }>;
}

interface PreAuthRow {
  id: number;
  preAuthNumber: string;
  estimatedAmount: string | number;
  diagnosis?: string | null;
  status: string;
  admissionDetails?: { insurer?: string };
  patient?: { firstName: string; lastName: string };
}

const formatCurrency = (amount?: number | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);

const statusColor: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700',
  approved:  'bg-emerald-100 text-emerald-700',
  query:     'bg-blue-100 text-blue-700',
  rejected:  'bg-red-100 text-red-700',
  paid:      'bg-teal-100 text-teal-700',
  submitted: 'bg-violet-100 text-violet-700',
  draft:     'bg-slate-100 text-slate-700',
};

const InsuranceDeskDashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [preAuths, setPreAuths] = useState<PreAuthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/hospital/insurance/dashboard'),
      api.get('/hospital/insurance/pre-auth/pending', { params: { limit: 5 } }),
    ])
      .then(([dashRes, preAuthRes]) => {
        setData(dashRes.data.dashboard);
        setPreAuths((preAuthRes.data.preAuths || []).slice(0, 5));
      })
      .catch((err) => setError(err?.response?.data?.message || 'Could not load dashboard.'))
      .finally(() => setLoading(false));
  }, []);

  const kpis = data ? [
    { label: 'Pending Claims',  value: String(data.stats.pending),  sub: formatCurrency(data.stats.pendingAmount), icon: CalendarClock, color: 'text-amber-600' },
    { label: 'Query',           value: String(data.stats.query),    sub: `${data.alerts.queriesNeedingResponse} need response`, icon: AlertCircle, color: 'text-blue-600' },
    { label: 'Approved',        value: String(data.stats.approved), sub: formatCurrency(data.stats.approvedAmount), icon: CheckCircle2, color: 'text-emerald-600' },
    { label: 'Rejected',        value: String(data.stats.rejected), sub: `${data.stats.total} total claims`, icon: XCircle, color: 'text-red-500' },
  ] : [];

  return (
    <HospDeptLayout
      deptKey="insurance-desk"
      deptName="Insurance Desk"
      badgeLabel="Insurance"
      loginPath="/insurance-desk/login"
      DeptIcon={ShieldCheck}
      navSections={navSections}
      title="Insurance Desk"
      subtitle="Claims & pre-authorization management"
    >
      {loading ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
        </div>
      ) : error ? (
        <Card><CardContent className="py-8 text-center text-sm text-red-600">{error}</CardContent></Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
            {kpis.map((k) => (
              <Card key={k.label} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">{k.label}</p>
                      <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
                      <k.icon className={`h-5 w-5 ${k.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Pre-Authorization table */}
            <div className="lg:col-span-2 space-y-5">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base">Pre-Authorization Requests</CardTitle>
                  <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => navigate('/insurance-desk/pre-auth')}>
                    <PlusCircle className="h-4 w-4" />New Pre-Auth
                  </Button>
                </CardHeader>
                <CardContent>
                  {preAuths.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No pending pre-authorizations.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="pb-2 text-left font-medium">Ref</th>
                          <th className="pb-2 text-left font-medium">Patient</th>
                          <th className="pb-2 text-left font-medium hidden md:table-cell">Insurer</th>
                          <th className="pb-2 text-right font-medium">Amount</th>
                          <th className="pb-2 text-center font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {preAuths.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                              onClick={() => navigate('/insurance-desk/pre-auth')}>
                            <td className="py-2.5 font-medium text-teal-700 font-mono text-xs">{p.preAuthNumber}</td>
                            <td className="py-2.5">{p.patient ? `${p.patient.firstName} ${p.patient.lastName}` : '—'}<br/><span className="text-xs text-muted-foreground">{p.diagnosis || ''}</span></td>
                            <td className="py-2.5 text-muted-foreground hidden md:table-cell">{p.admissionDetails?.insurer || '—'}</td>
                            <td className="py-2.5 text-right font-semibold">{formatCurrency(Number(p.estimatedAmount))}</td>
                            <td className="py-2.5 text-center">
                              <Badge className={`${statusColor[p.status] || ''} border-0 text-xs capitalize`}>{p.status}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <Button variant="ghost" size="sm" className="mt-3 w-full text-teal-600" onClick={() => navigate('/insurance-desk/pre-auth')}>
                    View all pre-auths →
                  </Button>
                </CardContent>
              </Card>

              {/* Active Claims (real recent activity) */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base">Recent Claims</CardTitle>
                  <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => navigate('/insurance-desk/claims')}>
                    <PlusCircle className="h-4 w-4" />New Claim
                  </Button>
                </CardHeader>
                <CardContent>
                  {(!data || data.recentActivity.length === 0) ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No claims yet.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="pb-2 text-left font-medium">Claim Ref</th>
                          <th className="pb-2 text-left font-medium">Patient</th>
                          <th className="pb-2 text-right font-medium">Amount</th>
                          <th className="pb-2 text-center font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data.recentActivity.slice(0, 5).map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                              onClick={() => navigate(`/insurance-desk/claims/${c.id}`)}>
                            <td className="py-2.5 font-medium text-teal-700 font-mono text-xs">{c.claimNumber}</td>
                            <td className="py-2.5">{c.patientName || '—'}<br/><span className="text-xs text-muted-foreground">{c.insurer || ''}</span></td>
                            <td className="py-2.5 text-right font-semibold">{formatCurrency(c.claimAmount)}</td>
                            <td className="py-2.5 text-center">
                              <Badge className={`${statusColor[c.status] || ''} border-0 text-xs capitalize`}>{c.status}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <Button variant="ghost" size="sm" className="mt-3 w-full text-teal-600" onClick={() => navigate('/insurance-desk/claims')}>
                    View all claims →
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Right Column */}
            <div className="space-y-5">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'New Pre-Auth',   icon: PlusCircle,  path: '/insurance-desk/pre-auth',          color: 'bg-teal-50 text-teal-700 hover:bg-teal-100' },
                    { label: 'Submit Claim',   icon: ShieldCheck, path: '/insurance-desk/claims',            color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
                    { label: 'Verify Patient', icon: Search,      path: '/insurance-desk/patient-insurance', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
                    { label: 'TPA Contact',    icon: Building2,   path: '/insurance-desk/tpa',               color: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
                    { label: 'Documents',      icon: FileText,    path: '/insurance-desk/documents',         color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
                    { label: 'Analytics',      icon: BarChart3,   path: '/insurance-desk/analytics',         color: 'bg-pink-50 text-pink-700 hover:bg-pink-100' },
                  ].map((a) => (
                    <button key={a.label} onClick={() => navigate(a.path)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs font-medium transition-colors ${a.color}`}>
                      <a.icon className="h-5 w-5" />
                      {a.label}
                    </button>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" /> Pending Actions
                </CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {[
                    { label: 'Queries to Reply',        value: data?.alerts.queriesNeedingResponse ?? 0 },
                    { label: 'Docs Pending',            value: data?.alerts.pendingDocuments ?? 0 },
                    { label: 'Pre-Auths Expiring Soon', value: data?.alerts.expiringSoon ?? 0 },
                    { label: 'Claims Pending',          value: data?.stats.pending ?? 0 },
                  ].map((s) => (
                    <div key={s.label} className="flex justify-between">
                      <span className="text-muted-foreground">{s.label}</span>
                      <span className="font-bold text-amber-600">{s.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Insurers on File</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {!data || data.insurerBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No claims yet.</p>
                  ) : data.insurerBreakdown.slice(0, 6).map((ins) => (
                    <div key={ins.name} className="flex items-center justify-between text-sm">
                      <span>{ins.name}</span>
                      <Badge variant="outline" className="text-xs">{ins.value} claim{ins.value === 1 ? '' : 's'}</Badge>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" className="mt-1 w-full text-teal-600" onClick={() => navigate('/insurance-desk/tpa')}>
                    View TPA directory →
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </HospDeptLayout>
  );
};

export default InsuranceDeskDashboard;
