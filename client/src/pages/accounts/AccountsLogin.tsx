import DeptLoginTemplate from '@/components/hosp-dept/DeptLoginTemplate';
import { DollarSign } from 'lucide-react';

const AccountsLogin = () => (
  <DeptLoginTemplate
    deptKey="accounts"
    title="Accounts Login"
    description="Access the hospital accounts & finance portal"
    Icon={DollarSign}
    dashboardPath="/accounts/dashboard"
  />
);

export default AccountsLogin;
