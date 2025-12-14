import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, AlertTriangle, RefreshCw } from 'lucide-react';

interface AdminAuthGuardProps {
  children: React.ReactNode;
  redirectTo?: string;
  requiredRole?: string;
}

const AdminAuthGuard = ({ 
  children, 
  redirectTo = '/admin/login',
  requiredRole = 'admin'
}: AdminAuthGuardProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminData, setAdminData] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuthentication = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        const adminDataStr = localStorage.getItem('adminData');

        if (!token) {
          setError('No authentication token found');
          setIsAuthenticated(false);
          return;
        }

        if (!adminDataStr) {
          setError('No admin data found');
          setIsAuthenticated(false);
          return;
        }

        let parsedAdminData;
        try {
          parsedAdminData = JSON.parse(adminDataStr);
        } catch (parseError) {
          setError('Invalid admin data format');
          setIsAuthenticated(false);
          return;
        }

        // Check role if specified
        if (requiredRole && parsedAdminData.role !== requiredRole) {
          setError(`Insufficient permissions. Required: ${requiredRole}`);
          setIsAuthenticated(false);
          return;
        }

        // Basic JWT token validation (3 parts separated by dots)
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3) {
          setError('Invalid token format');
          setIsAuthenticated(false);
          return;
        }

        try {
          // Decode JWT payload to check expiration
          const payload = JSON.parse(atob(tokenParts[1]));
          const currentTime = Math.floor(Date.now() / 1000);
          
          if (payload.exp && payload.exp < currentTime) {
            setError('Token has expired');
            setIsAuthenticated(false);
            return;
          }

          // Check if token has admin role
          if (!payload.isAdmin && payload.role !== 'admin' && payload.role !== 'super_admin') {
            setError('Not an admin user');
            setIsAuthenticated(false);
            return;
          }

          setAdminData(parsedAdminData);
          setIsAuthenticated(true);
          setError(null);
        } catch (decodeError) {
          console.warn('Token decode failed:', decodeError);
          setError('Invalid token structure');
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Authentication check failed:', error);
        setError(`Authentication check failed: ${error.message}`);
        setIsAuthenticated(false);
      }
    };

    checkAuthentication();
  }, [requiredRole]);

  useEffect(() => {
    if (isAuthenticated === false) {
      const timer = setTimeout(() => {
        // Clear invalid tokens
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminData');
        navigate(redirectTo);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, navigate, redirectTo]);

  // Loading state
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="flex items-center gap-2 text-gray-600">
            <Shield className="h-5 w-5" />
            <span>Verifying admin authentication...</span>
          </div>
        </div>
      </div>
    );
  }

  // Authentication failed
  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-orange-50 to-pink-50">
        <div className="max-w-md mx-auto text-center bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="space-y-3">
            <button
              onClick={() => {
                localStorage.removeItem('adminToken');
                localStorage.removeItem('adminData');
                navigate(redirectTo);
              }}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2 px-4 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200"
            >
              Go to Admin Login
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Retry Authentication
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            Redirecting to login in 2 seconds...
          </p>
        </div>
      </div>
    );
  }

  // Authentication successful
  return <>{children}</>;
};

export default AdminAuthGuard;