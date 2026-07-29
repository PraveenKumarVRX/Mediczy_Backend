import Login from '@/auth/Login';
import ClinicLogin from '@/pages/clinic/ClinicLogin';
import { getTenantSubdomain } from '@/utils/tenantHost';

/**
 * On tenant hosts (e.g. ajdental.mediqzy.com), /login is the clinic portal login.
 * On app/apex hosts, /login stays the platform patient/user login.
 */
const TenantAwareLogin = () => {
  if (getTenantSubdomain()) {
    return <ClinicLogin />;
  }
  return <Login />;
};

export default TenantAwareLogin;
