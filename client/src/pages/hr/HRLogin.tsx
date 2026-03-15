import DeptLoginTemplate from '@/components/hosp-dept/DeptLoginTemplate';
import { Users } from 'lucide-react';

const HRLogin = () => (
  <DeptLoginTemplate
    deptKey="hr"
    title="HR Login"
    description="Human Resources — staff & workforce management portal"
    Icon={Users}
    dashboardPath="/hr/dashboard"
  />
);

export default HRLogin;
