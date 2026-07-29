import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import DeptLoginTemplate from '@/components/hosp-dept/DeptLoginTemplate';
import { Users } from 'lucide-react';

const slugToDisplayName = (slug: string) =>
  slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

/**
 * HR login.
 * - Generic:   /hr/login
 * - Dedicated: /hr/:slug/login  (e.g. /hr/hycare-hospitals/login)
 */
const HRLogin = () => {
  const { slug } = useParams<{ slug?: string }>();
  const hospitalSlug = String(slug || '').trim().toLowerCase() || undefined;
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
    />
  );
};

export default HRLogin;
