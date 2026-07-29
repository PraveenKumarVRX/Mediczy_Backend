import DeptLoginTemplate from '@/components/hosp-dept/DeptLoginTemplate';
import { ClipboardList } from 'lucide-react';

/**
 * Front desk / reception login on hospital tenant hosts.
 * Example: https://hycare.mediqzy.com/frontdesk/login
 *
 * Uses the assistant (front-office) staff auth under the hood.
 */
const FrontDeskLogin = () => (
  <DeptLoginTemplate
    deptKey="assistant"
    title="Front Desk Login"
    description="Reception & front office — registrations, appointments, and queue"
    Icon={ClipboardList}
    dashboardPath="/assistant/dashboard"
  />
);

export default FrontDeskLogin;
