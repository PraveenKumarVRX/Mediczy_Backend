import DeptLoginTemplate from '@/components/hosp-dept/DeptLoginTemplate';
import { ShieldCheck } from 'lucide-react';

export default function QualityLogin() {
  return (
    <DeptLoginTemplate
      deptKey="quality"
      title="Quality & NABH"
      description="Quality Department — NABH Accreditation & Compliance Portal"
      Icon={ShieldCheck}
      dashboardPath="/quality/dashboard"
    />
  );
}
