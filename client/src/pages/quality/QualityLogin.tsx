import DeptLoginTemplate from '@/components/hosp-dept/DeptLoginTemplate';
import { ShieldCheck } from 'lucide-react';

export default function QualityLogin() {
  return (
    <DeptLoginTemplate
      deptKey="quality"
      title="Quality & Accreditation"
      description="Quality Department — NABH & JCI Accreditation Portal"
      Icon={ShieldCheck}
      dashboardPath="/quality/dashboard"
    />
  );
}
