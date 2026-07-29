import { Navigate } from 'react-router-dom';
import ClinicLogin from '@/pages/clinic/ClinicLogin';
import { getTenantSubdomain } from '@/utils/tenantHost';

/**
 * On tenant hosts, canonicalize clinic login to /login
 * (e.g. ajdental.mediqzy.com/clinic/login → /login).
 */
const ClinicLoginEntry = () => {
  if (getTenantSubdomain()) {
    return <Navigate to="/login" replace />;
  }
  return <ClinicLogin />;
};

export default ClinicLoginEntry;
