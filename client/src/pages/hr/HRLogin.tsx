import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import DeptLoginTemplate from '@/components/hosp-dept/DeptLoginTemplate';
import { Users } from 'lucide-react';
import { getTenantSubdomain, slugToDisplayName } from '@/utils/tenantHost';

/**
 * HR login.
 * - Generic:            /hr/login
 * - Path-scoped:        /hr/:slug/login  (e.g. /hr/hycare-hospitals/login)
 * - Subdomain-scoped:   https://hycare.mediqzy.com/hr/login
 *
 * HR signs in with a USERNAME, unlike the other department portals. HR and ward staff commonly
 * share or lack a corporate email, and `users.email` is UNIQUE, so such a person could not be
 * given an hr_staff row at all and their HR privileges were unreachable. The server still accepts
 * an email for the HR accounts that already have one.
 */
const HRLogin = () => {
  const { slug } = useParams<{ slug?: string }>();
  const pathSlug = String(slug || '').trim().toLowerCase() || undefined;
  const hostSlug = getTenantSubdomain() || undefined;
  const hospitalSlug = pathSlug || hostSlug;

  const hospitalName = useMemo(
    () => (hospitalSlug ? slugToDisplayName(hospitalSlug) : undefined),
    [hospitalSlug],
  );

  return (
    <DeptLoginTemplate
      deptKey="hr"
      title="HR Login"
      description={
        hospitalSlug
          ? 'Human Resources portal for your hospital'
          : 'Human Resources — staff & workforce management portal'
      }
      Icon={Users}
      dashboardPath="/hr/dashboard"
      hospitalSlug={hospitalSlug}
      hospitalName={hospitalName}
      identifierField="username"
    />
  );
};

export default HRLogin;
