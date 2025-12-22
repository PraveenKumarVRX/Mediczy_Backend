import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Eye, EyeOff, Crown, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

const AdminLoginDebug = () => {
  const [email, setEmail] = useState('admin@mediczy.com');
  const [password, setPassword] = useState('SecurePass123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>({});
  const navigate = useNavigate();

  const testLogin = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);
    
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
    const loginData = { email, password };
    
    console.log('🚀 Login attempt:', {
      email,
      apiUrl,
      timestamp: new Date().toISOString()
    });

    try {
      const response = await fetch(`${apiUrl}/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(loginData)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${data.message || 'Login failed'}`);
      }
      
      console.log('✅ Login successful:', data);
      
      // Store authentication data
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminData', JSON.stringify(data.admin));
      
      setDebugInfo({
        loginSuccess: true,
        token: data.token.substring(0, 20) + '...',
        adminEmail: data.admin.email,
        apiUrl,
        timestamp: new Date().toISOString()
      });
      
      setSuccess('Login successful! Redirecting to dashboard...');
      
      // Successful login - redirect
      setTimeout(() => {
        navigate('/admin/dashboard');
      }, 2000);
      
    } catch (err: any) {
      console.error('❌ Login failed:', err);
      setError(err.message || 'Login failed');
      setDebugInfo({
        loginError: {
          message: err.message,
          timestamp: new Date().toISOString()
        },
        apiUrl,
        requestData: loginData
      });
    } finally {
      setLoading(false);
    }
  };

  const clearAuth = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminData');
    setDebugInfo({});
    setError(null);
    setSuccess(null);
    console.log('🧹 Auth data cleared');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Debug Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-red-600 to-orange-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">
            Admin Login Debug
          </h1>
          <p className="text-gray-600 mt-2">
            Diagnostic tool for admin authentication issues
          </p>
        </div>

        {/* Login Form */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-purple-600" />
                Admin Login Test
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <Alert className="border-red-200 bg-red-50">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription className="text-red-600 text-sm">
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription className="text-green-600 text-sm">
                    {success}
                  </AlertDescription>
                </Alert>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Email Address
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@mediczy.com"
                  className="h-12"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="SecurePass123"
                    className="h-12 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <Button
                onClick={testLogin}
                disabled={loading}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700"
              >
                {loading ? 'Testing Login...' : 'Test Admin Login'}
              </Button>

              <div className="flex gap-2">
                <Button
                  onClick={clearAuth}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  Clear Auth Data
                </Button>
                <Button
                  onClick={() => navigate('/admin/dashboard')}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  Go to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Debug Information */}
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                Debug Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">Current Auth State</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      {localStorage.getItem('adminToken') ? 
                        <CheckCircle className="h-4 w-4 text-green-600" /> : 
                        <XCircle className="h-4 w-4 text-red-600" />
                      }
                      <span>Admin Token</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {localStorage.getItem('adminData') ? 
                        <CheckCircle className="h-4 w-4 text-green-600" /> : 
                        <XCircle className="h-4 w-4 text-red-600" />
                      }
                      <span>Admin Data</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">Environment Info</h4>
                  <div className="bg-gray-50 p-3 rounded text-xs font-mono">
                    <p><strong>Mode:</strong> {import.meta.env.MODE}</p>
                    <p><strong>API URL:</strong> {import.meta.env.VITE_API_URL || 'undefined'}</p>
                    <p><strong>Dev:</strong> {import.meta.env.DEV ? 'true' : 'false'}</p>
                  </div>
                </div>

                {Object.keys(debugInfo).length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">Debug Log</h4>
                    <div className="bg-gray-50 p-3 rounded max-h-40 overflow-y-auto">
                      <pre className="text-xs">{JSON.stringify(debugInfo, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Test Credentials */}
        <Card className="shadow-lg border-0 bg-yellow-50/80 backdrop-blur-xl border-yellow-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <h3 className="font-semibold text-yellow-800">Test Credentials</h3>
            </div>
            <p className="text-sm text-yellow-700">
              <strong>Email:</strong> admin@mediczy.com<br />
              <strong>Password:</strong> SecurePass123<br />
              <strong>Note:</strong> These are development/test credentials. Ensure your backend accepts these.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminLoginDebug;