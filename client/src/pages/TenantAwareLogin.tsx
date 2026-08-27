import { useEffect, useState } from 'react';
import Login from '@/auth/Login';
import ClinicLogin from '@/pages/clinic/ClinicLogin';
import LabLogin from '@/pages/lab/LabLogin';
import HospitalLogin from '@/pages/hospital/HospitalLogin';
import CorporateLogin from '@/pages/corporate/CorporateLogin';
import { getTenantSubdomain } from '@/utils/tenantHost';
import api from '@/utils/api';

type PortalType = 'lab' | 'clinic' | 'hospital' | 'corporate' | string | null;

/**
 * On tenant hosts (e.g. ajdental.mediqzy.com, radolabs.mediqzy.com), /login
 * routes to the correct portal's login form. The tenants table and the labs
 * table are two separate systems with no shared identity, so which login
 * form belongs to a given subdomain can't be known client-side without
 * asking the server — GET /api/tenants/resolve-portal checks both.
 *
 * Previously this unconditionally sent every tenant subdomain to the clinic
 * login, which is why lab subdomains (radolabs, ichegmore) rendered a
 * dental-clinic login form and rejected valid lab credentials.
 */
const TenantAwareLogin = () => {
  const subdomain = getTenantSubdomain();
  const [portalType, setPortalType] = useState<PortalType>(null);
  const [resolved, setResolved] = useState(!subdomain);

  useEffect(() => {
    if (!subdomain) return;
    let cancelled = false;
    // The shared api client's default timeout is 30s (sized for video-call
    // setup elsewhere) — much too long for a login page to sit blank on. This
    // call is two indexed lookups that never itself returns a 4xx/5xx (see
    // server/routes/tenant.route.js), so the only realistic slow case is a
    // genuinely unreachable/hung backend — 5s is generous for that and still
    // gives a fast, safe fallback to the generic login instead of an
    // indefinite blank screen.
    api
      .get('/tenants/resolve-portal', { timeout: 5000 })
      .then(({ data }) => {
        if (!cancelled) setPortalType(data?.type ?? null);
      })
      .catch(() => {
        if (!cancelled) setPortalType(null);
      })
      .finally(() => {
        if (!cancelled) setResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  if (!subdomain) {
    return <Login />;
  }

  if (!resolved) {
    return null; // brief resolve call; avoid flashing the wrong portal's form
  }

  switch (portalType) {
    case 'lab':
      return <LabLogin />;
    case 'hospital':
      return <HospitalLogin />;
    case 'corporate':
      return <CorporateLogin />;
    case 'clinic':
      return <ClinicLogin />;
    default:
      // Unrecognized subdomain — same safe fallback as "no subdomain at all"
      // rather than guessing clinic, which was the original bug.
      return <Login />;
  }
};

export default TenantAwareLogin;
