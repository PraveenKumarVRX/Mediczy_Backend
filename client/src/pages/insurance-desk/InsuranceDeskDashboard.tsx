import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck, FileText, ClipboardList,
  Building2, BarChart3, Settings, HelpCircle, PlusCircle,
  Clock, CheckCircle2, XCircle, AlertCircle, Search,
  Users, FileSearch, Download, CalendarClock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { navSections } from './navSections';

const kpis = [
  { label: 'Active Pre-Auths',   value: '23', sub: '8 pending response', icon: CalendarClock, color: 'text-teal-600' },
  { label: 'Pending Claims',     value: '41', sub: '12 follow-up due',   icon: AlertCircle,   color: 'text-amber-600' },
  { label: 'Approved Today',     value: '14', sub: '₹2.8L approved',     icon: CheckCircle2,  color: 'text-emerald-600' },
  { label: 'Rejected This Week', value: '6',  sub: 'Under review: 3',    icon: XCircle,       color: 'text-red-500' },
];

const preAuths = [
  { ref: 'PA-2234', patient: 'Ashok Mehta',  tpa: 'Medi Assist', amount: '₹1,20,000', surgery: 'CABG',            status: 'Pending', since: '2d' },
  { ref: 'PA-2233', patient: 'Neha Kapoor',  tpa: 'Star Health', amount: '₹45,000',   surgery: 'Lap Cholecystectomy', status: 'Approved', since: '1d' },
  { ref: 'PA-2232', patient: 'Sunil Bhat',   tpa: 'CGHS',        amount: '₹80,000',   surgery: 'Knee Replacement', status: 'Pending', since: '3d' },
  { ref: 'PA-2231', patient: 'Rita Sharma',  tpa: 'ICICI Lombard',amount:'₹35,000',   surgery: 'Cataract',         status: 'Approved', since: '1d' },
  { ref: 'PA-2230', patient: 'Mohan Singh',  tpa: 'New India',   amount: '₹2,00,000', surgery: 'Spine Surgery',    status: 'Query',    since: '4d' },
];

const activeClaims = [
  { ref: 'CLM-5541', patient: 'Dilip Patil',   tpa: 'HDFC Ergo', amount: '₹88,000', submitted: '10-Mar', status: 'Under Review' },
  { ref: 'CLM-5540', patient: 'Sunita Roy',     tpa: 'Bajaj',     amount: '₹62,000', submitted: '08-Mar', status: 'Deficiency'   },
  { ref: 'CLM-5539', patient: 'Arun Das',       tpa: 'Star Health',amount:'₹1,45,000',submitted: '05-Mar', status: 'Approved'     },
  { ref: 'CLM-5538', patient: 'Kamla Devi',     tpa: 'CGHS',      amount: '₹32,000', submitted: '03-Mar', status: 'Settled'      },
];

const statusColor: Record<string, string> = {
  Pending:       'bg-amber-100 text-amber-700',
  Approved:      'bg-emerald-100 text-emerald-700',
  Query:         'bg-blue-100 text-blue-700',
  'Under Review':'bg-violet-100 text-violet-700',
  Deficiency:    'bg-red-100 text-red-700',
  Settled:       'bg-teal-100 text-teal-700',
};

const InsuranceDeskDashboard = () => {
  const navigate = useNavigate();
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
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
                <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => navigate('/insurance-desk/pre-auth')}>
                  <PlusCircle className="h-4 w-4" />New Pre-Auth
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Ref</th>
                    <th className="pb-2 text-left font-medium">Patient</th>
                    <th className="pb-2 text-left font-medium hidden md:table-cell">TPA</th>
                    <th className="pb-2 text-right font-medium">Amount</th>
                    <th className="pb-2 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preAuths.map((p) => (
                    <tr key={p.ref} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                        onClick={() => navigate('/insurance-desk/pre-auth')}>
                      <td className="py-2.5 font-medium text-teal-700">{p.ref}</td>
                      <td className="py-2.5">{p.patient}<br/><span className="text-xs text-muted-foreground">{p.surgery}</span></td>
                      <td className="py-2.5 text-muted-foreground hidden md:table-cell">{p.tpa}</td>
                      <td className="py-2.5 text-right font-semibold">{p.amount}</td>
                      <td className="py-2.5 text-center">
                        <Badge className={`${statusColor[p.status]} border-0 text-xs`}>{p.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button variant="ghost" size="sm" className="mt-3 w-full text-teal-600" onClick={() => navigate('/insurance-desk/pre-auth')}>
                View all pre-auths →
              </Button>
            </CardContent>
          </Card>

          {/* Active Claims */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Active Claims</CardTitle>
              <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700" onClick={() => navigate('/insurance-desk/claims')}>
                <PlusCircle className="h-4 w-4" />New Claim
              </Button>
            </CardHeader>
            <CardContent>
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
                  {activeClaims.map((c) => (
                    <tr key={c.ref} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                        onClick={() => navigate('/insurance-desk/claims')}>
                      <td className="py-2.5 font-medium text-teal-700">{c.ref}</td>
                      <td className="py-2.5">{c.patient}<br/><span className="text-xs text-muted-foreground">{c.tpa}</span></td>
                      <td className="py-2.5 text-right font-semibold">{c.amount}</td>
                      <td className="py-2.5 text-center">
                        <Badge className={`${statusColor[c.status]} border-0 text-xs`}>{c.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                { label: 'New Pre-Auth',    icon: PlusCircle,   path: '/insurance-desk/pre-auth',          color: 'bg-teal-50 text-teal-700 hover:bg-teal-100' },
                { label: 'Submit Claim',    icon: ShieldCheck,  path: '/insurance-desk/claims',            color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
                { label: 'Verify Patient', icon: Search,       path: '/insurance-desk/patient-insurance', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
                { label: 'TPA Contact',    icon: Building2,    path: '/insurance-desk/tpa',               color: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
                { label: 'Documents',      icon: FileText,     path: '/insurance-desk/documents',         color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
                { label: 'Analytics',      icon: BarChart3,    path: '/insurance-desk/analytics',         color: 'bg-pink-50 text-pink-700 hover:bg-pink-100' },
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
                { label: 'Pre-Auth Awaiting',  value: '8' },
                { label: 'Queries to Reply',   value: '5' },
                { label: 'Deficiency Letters', value: '3' },
                { label: 'Docs to Upload',     value: '11' },
                { label: 'Claims to Bill',     value: '7' },
              ].map((s) => (
                <div key={s.label} className="flex justify-between">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="font-bold text-amber-600">{s.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">TPA Directory</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {['Medi Assist TPA','Star Health','CGHS','Bajaj Allianz','HDFC Ergo'].map((tpa) => (
                <div key={tpa} className="flex items-center justify-between text-sm">
                  <span>{tpa}</span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-teal-600 px-2" onClick={() => navigate('/insurance-desk/tpa')}>
                    Contact
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </HospDeptLayout>
  );
};

export default InsuranceDeskDashboard;
