import DeptLoginTemplate from '@/components/hosp-dept/DeptLoginTemplate';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Activity,
  Archive,
  Banknote,
  ClipboardCheck,
  Droplets,
  HeartPulse,
  PackageCheck,
  ShieldCheck,
  Stethoscope,
  Utensils,
  Wrench,
} from 'lucide-react';

const departments = {
  asset: {
    title: 'Asset',
    description: 'Hospital asset management department portal',
    Icon: Archive,
  },
  biomedical: {
    title: 'Biomedical',
    description: 'Biomedical equipment and maintenance department portal',
    Icon: Wrench,
  },
  'blood-bank': {
    title: 'Blood Bank',
    description: 'Blood bank inventory and issue management portal',
    Icon: Droplets,
  },
  consent: {
    title: 'Consent',
    description: 'Patient consent and authorization department portal',
    Icon: ClipboardCheck,
  },
  cssd: {
    title: 'CSSD',
    description: 'Central sterile services department portal',
    Icon: ShieldCheck,
  },
  dietary: {
    title: 'Dietary',
    description: 'Dietary services and nutrition department portal',
    Icon: Utensils,
  },
  finance: {
    title: 'Finance',
    description: 'Hospital finance department portal',
    Icon: Banknote,
  },
  'infection-control': {
    title: 'Infection Control',
    description: 'Infection control and surveillance department portal',
    Icon: Stethoscope,
  },
  mortuary: {
    title: 'Mortuary',
    description: 'Mortuary operations department portal',
    Icon: HeartPulse,
  },
  procurement: {
    title: 'Procurement',
    description: 'Procurement and purchase operations department portal',
    Icon: PackageCheck,
  },
  queue: {
    title: 'Queue',
    description: 'Queue management department portal',
    Icon: Activity,
  },
} as const;

type DepartmentKey = keyof typeof departments;

const DepartmentLogin = ({ deptKey }: { deptKey: DepartmentKey }) => {
  const dept = departments[deptKey];
  return (
    <DeptLoginTemplate
      deptKey={deptKey}
      title={`${dept.title} Login`}
      description={dept.description}
      Icon={dept.Icon}
      dashboardPath={`/${deptKey}/dashboard`}
    />
  );
};

const DepartmentDashboard = ({ deptKey }: { deptKey: DepartmentKey }) => {
  const navigate = useNavigate();
  const dept = departments[deptKey];
  const tokenKey = `${deptKey}Token`;
  const dataKey = `${deptKey}Data`;
  const token = typeof window !== 'undefined' ? localStorage.getItem(tokenKey) : null;
  const data = (() => {
    try {
      return JSON.parse(localStorage.getItem(dataKey) || '{}');
    } catch {
      return {};
    }
  })();

  useEffect(() => {
    if (!token) navigate(`/${deptKey}/login`, { replace: true });
  }, [deptKey, navigate, token]);

  const logout = () => {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(dataKey);
    localStorage.removeItem(`${deptKey}RefreshToken`);
    localStorage.removeItem('userType');
    navigate(`/${deptKey}/login`, { replace: true });
  };

  if (!token) return null;

  const Icon = dept.Icon;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-teal-600 p-2 text-white">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{dept.title} Dashboard</h1>
              <p className="text-sm text-slate-500">{dept.description}</p>
            </div>
          </div>
          <Button variant="outline" onClick={logout}>Logout</Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-6 py-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p><span className="font-medium text-slate-900">Status:</span> Signed in</p>
            <p><span className="font-medium text-slate-900">Email:</span> {data.email || 'Department staff'}</p>
            <p><span className="font-medium text-slate-900">Role:</span> {data.role || deptKey}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Department</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            {dept.description}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Access</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            Use this portal for department-specific workflows as modules are enabled.
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export const AssetLogin = () => (
  <DepartmentLogin deptKey="asset" />
);

export const BiomedicalLogin = () => (
  <DepartmentLogin deptKey="biomedical" />
);

export const BloodBankLogin = () => (
  <DepartmentLogin deptKey="blood-bank" />
);

export const ConsentLogin = () => (
  <DepartmentLogin deptKey="consent" />
);

export const CSSDLogin = () => (
  <DepartmentLogin deptKey="cssd" />
);

export const DietaryLogin = () => (
  <DepartmentLogin deptKey="dietary" />
);

export const FinanceLogin = () => (
  <DepartmentLogin deptKey="finance" />
);

export const InfectionControlLogin = () => (
  <DepartmentLogin deptKey="infection-control" />
);

export const MortuaryLogin = () => (
  <DepartmentLogin deptKey="mortuary" />
);

export const ProcurementLogin = () => (
  <DepartmentLogin deptKey="procurement" />
);

export const QueueLogin = () => (
  <DepartmentLogin deptKey="queue" />
);

export const AssetDashboard = () => <DepartmentDashboard deptKey="asset" />;
export const BiomedicalDashboard = () => <DepartmentDashboard deptKey="biomedical" />;
export const BloodBankDashboard = () => <DepartmentDashboard deptKey="blood-bank" />;
export const ConsentDashboard = () => <DepartmentDashboard deptKey="consent" />;
export const CSSDDashboard = () => <DepartmentDashboard deptKey="cssd" />;
export const DietaryDashboard = () => <DepartmentDashboard deptKey="dietary" />;
export const FinanceDashboard = () => <DepartmentDashboard deptKey="finance" />;
export const InfectionControlDashboard = () => <DepartmentDashboard deptKey="infection-control" />;
export const MortuaryDashboard = () => <DepartmentDashboard deptKey="mortuary" />;
export const ProcurementDashboard = () => <DepartmentDashboard deptKey="procurement" />;
export const QueueDashboard = () => <DepartmentDashboard deptKey="queue" />;
