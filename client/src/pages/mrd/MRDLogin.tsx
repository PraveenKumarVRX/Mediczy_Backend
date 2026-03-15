import DeptLoginTemplate from '@/components/hosp-dept/DeptLoginTemplate';
import { FolderOpen } from 'lucide-react';

const MRDLogin = () => (
  <DeptLoginTemplate
    deptKey="mrd"
    title="MRD Login"
    description="Medical Records Department — access your records portal"
    Icon={FolderOpen}
    dashboardPath="/mrd/dashboard"
  />
);

export default MRDLogin;
