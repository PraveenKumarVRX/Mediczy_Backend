import DeptLoginTemplate from '@/components/hosp-dept/DeptLoginTemplate';
import { Lock } from 'lucide-react';

export default function SecurityLogin() {
  return (
    <DeptLoginTemplate
      deptKey="security"
      title="Security"
      description="Hospital Security Department Portal"
      Icon={Lock}
      dashboardPath="/security/dashboard"
    />
  );
}
