import { useNavigate } from 'react-router-dom';
import { logoutAllSessions } from '@/hooks/useRingFencing';
import api from '@/utils/api';

export const useUniversalLogout = () => {
  const navigate = useNavigate();

  const logout = async (userType?: string) => {
    try {
      // Determine user type and token
      let tokenKey = 'token';
      let loginPath = '/login';
      
      if (userType) {
        // Use provided user type
        const typeToToken: Record<string, { token: string; path: string }> = {
          user: { token: 'token', path: '/login' },
          doctor: { token: 'doctorToken', path: '/doctor/login' },
          admin: { token: 'adminToken', path: '/admin/login' },
          team: { token: 'teamToken', path: '/team/login' },
          nurse: { token: 'nurseToken', path: '/nurse/login' },
          assistant: { token: 'assistantToken', path: '/assistant/login' },
          corporate: { token: 'corporateToken', path: '/corporate/login' },
          hospital: { token: 'hospitalToken', path: '/hospital/login' },
          clinic: { token: 'clinicToken', path: '/clinic/login' },
          lab: { token: 'labToken', path: '/lab/login' },
          pharmacy: { token: 'pharmacyToken', path: '/pharmacy/login' },
          ambulance: { token: 'ambulanceToken', path: '/ambulance/login' },
          homecare: { token: 'homecareToken', path: '/homecare/login' }
        };
        
        if (typeToToken[userType]) {
          tokenKey = typeToToken[userType].token;
          loginPath = typeToToken[userType].path;
        }
      } else {
        // Auto-detect user type from localStorage
        const tokenKeys = [
          { key: 'adminToken', path: '/admin/login' },
          { key: 'doctorToken', path: '/doctor/login' },
          { key: 'teamToken', path: '/team/login' },
          { key: 'nurseToken', path: '/nurse/login' },
          { key: 'assistantToken', path: '/assistant/login' },
          { key: 'corporateToken', path: '/corporate/login' },
          { key: 'hospitalToken', path: '/hospital/login' },
          { key: 'clinicToken', path: '/clinic/login' },
          { key: 'labToken', path: '/lab/login' },
          { key: 'pharmacyToken', path: '/pharmacy/login' },
          { key: 'ambulanceToken', path: '/ambulance/login' },
          { key: 'homecareToken', path: '/homecare/login' },
          { key: 'token', path: '/login' }
        ];
        
        for (const { key, path } of tokenKeys) {
          if (localStorage.getItem(key)) {
            tokenKey = key;
            loginPath = path;
            break;
          }
        }
      }
      
      const token = localStorage.getItem(tokenKey);
      
      // Call backend logout endpoint
      if (token) {
        try {
          await api.post(
            '/auth/logout',
            {},
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
        } catch (error) {
          console.error('Backend logout failed:', error);
          // Continue with client-side logout even if backend fails
        }
      }
      
      // Clear all tokens and user data
      logoutAllSessions();
      
      console.log(`🚪 User logged out, redirecting to ${loginPath}`);
      
      // Redirect to appropriate login page
      navigate(loginPath, { replace: true });
      
      // Force reload to clear any cached state
      setTimeout(() => {
        window.location.reload();
      }, 100);
      
    } catch (error) {
      console.error('Logout error:', error);
      // Even on error, clear all tokens
      logoutAllSessions();
      navigate('/login', { replace: true });
    }
  };

  return { logout };
};

export default useUniversalLogout;
