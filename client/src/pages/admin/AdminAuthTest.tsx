import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  RefreshCw,
  User,
  Key,
  Clock,
  ExternalLink,
  Trash2
} from 'lucide-react';
import api from '@/utils/api';

const AdminAuthTest = () => {
  const [authStatus, setAuthStatus] = useState<{
    hasToken: boolean;
    hasAdminData: boolean;
    isValid: boolean;
    isExpired: boolean;
    tokenData?: any;
    adminData?: any;
    error?: string;
  }>({ hasToken: false, hasAdminData: false, isValid: false, isExpired: false });
  
  const [loginStatus, setLoginStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [loginError, setLoginError] = useState<string>('');
  const navigate = useNavigate();

  const checkAuthStatus = () => {
    try {
      const token = localStorage.getItem('adminToken');
      const adminDataStr = localStorage.getItem('adminData');
      
      if (!token || !adminDataStr) {
        setAuthStatus({
          hasToken: !!token,
          hasAdminData: !!adminDataStr,
          isValid: false,
          isExpired: false,
          error: 'Missing authentication data'
        });
        return;
      }

      const adminData = JSON.parse(adminDataStr);
      
      // Validate JWT structure
      const tokenParts = token.split('.');
      if (tokenParts.length !== 3) {
        setAuthStatus({
          hasToken: true,
          hasAdminData: true,
          isValid: false,
          isExpired: false,
          error: 'Invalid token format'
        });
        return;
      }

      // Decode and check expiration
      const payload = JSON.parse(atob(tokenParts[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      const isExpired = payload.exp < currentTime;
      const isValid = !isExpired && (payload.isAdmin || payload.role === 'admin' || payload.role === 'super_admin');

      setAuthStatus({
        hasToken: true,
        hasAdminData: true,
        isValid,
        isExpired,
        tokenData: payload,
        adminData
      });
    } catch (error: any) {
      setAuthStatus({
        hasToken: false,
        hasAdminData: false,
        isValid: false,
        isExpired: false,
        error: error.message
      });
    }
  };

  const loginAsAdmin = async () => {
    setLoginStatus('loading');
    setLoginError('');

    try {
      const { data } = await api.post('/admin/login', {
        email: 'admin@mediczy.com',
        password: 'SecurePass123'
      }, { skipAuth: true });

      if (data.token) {
        // Store authentication data
        localStorage.setItem('adminToken', data.token);
        localStorage.setItem('adminData', JSON.stringify(data.admin));
        
        setLoginStatus('success');
        checkAuthStatus();
      } else {
        setLoginError(data.message || 'Login failed');
        setLoginStatus('error');
      }
    } catch (error: any) {
      setLoginError(error?.response?.data?.message || error.message);
      setLoginStatus('error');
    }
  };

  const clearAuth = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminData');
    checkAuthStatus();
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const getStatusIcon = () => {
    if (authStatus.isValid) return <CheckCircle className="h-6 w-6 text-green-600" />;
    if (authStatus.isExpired) return <Clock className="h-6 w-6 text-yellow-600" />;
    return <XCircle className="h-6 w-6 text-red-600" />;
  };

  const getStatusText = () => {
    if (authStatus.isValid) return 'Authenticated';
    if (authStatus.isExpired) return 'Token Expired';
    if (authStatus.hasToken) return 'Invalid Token';
    return 'Not Authenticated';
  };

  const getStatusColor = () => {
    if (authStatus.isValid) return 'bg-green-100 text-green-800 border-green-200';
    if (authStatus.isExpired) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Admin Authentication Test
          </h1>
          <p className="text-gray-600 mt-2">
            Test and debug admin authentication for activity log access
          </p>
        </div>

        {/* Current Status */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getStatusIcon()}
              Authentication Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">Current Status:</span>
              <Badge className={`${getStatusColor()} border`}>
                {getStatusText()}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-blue-600" />
                <span className="text-sm">Has Token:</span>
                <Badge variant={authStatus.hasToken ? "default" : "destructive"}>
                  {authStatus.hasToken ? "Yes" : "No"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-green-600" />
                <span className="text-sm">Has Admin Data:</span>
                <Badge variant={authStatus.hasAdminData ? "default" : "destructive"}>
                  {authStatus.hasAdminData ? "Yes" : "No"}
                </Badge>
              </div>
            </div>

            {authStatus.error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">Error:</span>
                </div>
                <p className="text-red-700 mt-1">{authStatus.error}</p>
              </div>
            )}

            {authStatus.tokenData && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-700 mb-2">Token Details:</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><strong>User ID:</strong> {authStatus.tokenData.id}</div>
                  <div><strong>Email:</strong> {authStatus.tokenData.email}</div>
                  <div><strong>Role:</strong> {authStatus.tokenData.role}</div>
                  <div><strong>Is Admin:</strong> {authStatus.tokenData.isAdmin ? 'Yes' : 'No'}</div>
                  <div><strong>Issued:</strong> {new Date(authStatus.tokenData.iat * 1000).toLocaleString()}</div>
                  <div><strong>Expires:</strong> {new Date(authStatus.tokenData.exp * 1000).toLocaleString()}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Login Section */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Admin Login</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button 
                onClick={loginAsAdmin}
                disabled={loginStatus === 'loading'}
                className="gap-2"
                size="lg"
              >
                {loginStatus === 'loading' ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Shield className="h-4 w-4" />
                )}
                {loginStatus === 'loading' ? 'Logging in...' : 'Login as Admin'}
              </Button>
              
              <Button 
                onClick={clearAuth}
                variant="outline"
                className="gap-2"
                size="lg"
              >
                <Trash2 className="h-4 w-4" />
                Clear Authentication
              </Button>
            </div>

            {loginStatus === 'success' && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-green-800">
                  <CheckCircle className="h-4 w-4" />
                  <span className="font-medium">Login Successful!</span>
                </div>
                <p className="text-green-700 mt-1">Admin authentication has been stored in localStorage.</p>
              </div>
            )}

            {loginStatus === 'error' && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-800">
                  <XCircle className="h-4 w-4" />
                  <span className="font-medium">Login Failed!</span>
                </div>
                <p className="text-red-700 mt-1">{loginError}</p>
              </div>
            )}

            <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
              <strong>Default Admin Credentials:</strong><br />
              Email: admin@mediczy.com<br />
              Password: SecurePass123
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button 
                onClick={checkAuthStatus}
                variant="outline"
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh Status
              </Button>
              
              <Button 
                onClick={() => navigate('/admin/login')}
                variant="outline"
                className="gap-2"
              >
                <User className="h-4 w-4" />
                Admin Login Page
              </Button>
              
              <Button 
                onClick={() => navigate('/admin/activity-log')}
                disabled={!authStatus.isValid}
                className="gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Activity Log
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Environment Info */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Environment Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div>
                <h4 className="font-semibold text-gray-700 mb-2">API Configuration</h4>
                <div className="space-y-1">
                  <div><strong>API URL:</strong> {import.meta.env.VITE_API_URL}</div>
                  <div><strong>Mode:</strong> {import.meta.env.MODE}</div>
                  <div><strong>Dev Mode:</strong> {import.meta.env.DEV ? 'Yes' : 'No'}</div>
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-gray-700 mb-2">Local Storage</h4>
                <div className="space-y-1">
                  <div><strong>Admin Token:</strong> {localStorage.getItem('adminToken') ? 'Present' : 'Missing'}</div>
                  <div><strong>Admin Data:</strong> {localStorage.getItem('adminData') ? 'Present' : 'Missing'}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminAuthTest;