/**
 * Enterprise SSO callback — stores JWT from SAML ACS redirect
 */
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function EnterpriseCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get('token');
    const redirect = params.get('redirect') || '/hospital/dashboard';
    if (token) {
      localStorage.setItem('hospitalToken', token);
      localStorage.setItem('token', token);
      localStorage.setItem('userType', 'hospital');
      navigate(redirect, { replace: true });
    } else {
      navigate('/enterprise/login', { replace: true });
    }
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
    </div>
  );
}
