import DeptLoginTemplate from '@/components/hosp-dept/DeptLoginTemplate';
import { Scissors } from 'lucide-react';

const OTLogin = () => (
  <DeptLoginTemplate
    deptKey="ot"
    title="OT Login"
    description="Operation Theatre — surgical scheduling & management portal"
    Icon={Scissors}
    dashboardPath="/ot/dashboard"
  />
);

export default OTLogin;
