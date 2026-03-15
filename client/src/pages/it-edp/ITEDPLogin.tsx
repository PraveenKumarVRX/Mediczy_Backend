import DeptLoginTemplate from '@/components/hosp-dept/DeptLoginTemplate';
import { Monitor } from 'lucide-react';

const ITEDPLogin = () => (
  <DeptLoginTemplate
    deptKey="it-edp"
    title="IT / EDP Login"
    description="Information Technology & Electronic Data Processing portal"
    Icon={Monitor}
    dashboardPath="/it-edp/dashboard"
  />
);

export default ITEDPLogin;
