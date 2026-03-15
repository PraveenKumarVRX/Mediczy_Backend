import DeptLoginTemplate from '@/components/hosp-dept/DeptLoginTemplate';
import { ShieldCheck } from 'lucide-react';

const InsuranceDeskLogin = () => (
  <DeptLoginTemplate
    deptKey="insurance-desk"
    title="Insurance Desk Login"
    description="Hospital Insurance Desk — claims & pre-authorization portal"
    Icon={ShieldCheck}
    dashboardPath="/insurance-desk/dashboard"
  />
);

export default InsuranceDeskLogin;
