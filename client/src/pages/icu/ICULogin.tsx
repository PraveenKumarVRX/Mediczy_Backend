import DeptLoginTemplate from '@/components/hosp-dept/DeptLoginTemplate';
import { HeartPulse } from 'lucide-react';

const ICULogin = () => (
  <DeptLoginTemplate
    deptKey="icu"
    title="ICU Login"
    description="Intensive Care Unit — patient monitoring & critical care portal"
    Icon={HeartPulse}
    dashboardPath="/icu/dashboard"
  />
);

export default ICULogin;
