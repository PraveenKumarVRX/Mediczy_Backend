import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Eye, EyeOff, Crown, HeartPulse } from 'lucide-react';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const navigate = useNavigate();

  // Check if already authenticated
  useEffect(() => {
    // Clear any team/nurse/assistant tokens that might interfere
    localStorage.removeItem('teamToken');
    localStorage.removeItem('nurseToken');
    localStorage.removeItem('assistantToken');
    
    const token = localStorage.getItem('adminToken');
    if (token) {
      console.log('✅ Admin already authenticated, redirecting...');
      navigate('/admin/dashboard');
      return;
    }
    
    // Development mode: Auto-set credentials
    if (import.meta.env.DEV) {
      setEmail('admin@mediczy.com');
      setPassword('SecurePass123');
    }
    
    setIsCheckingAuth(false);
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    console.log('Admin login attempt:', { email, password: '***' });
    
    // Development mode: Quick bypass for valid credentials
    if (import.meta.env.DEV && email === 'admin@mediczy.com' && password === 'SecurePass123') {
      console.log('🚀 Development mode: Using quick authentication bypass');
      
      // Clear any other role tokens first
      localStorage.removeItem('teamToken');
      localStorage.removeItem('nurseToken');
      localStorage.removeItem('assistantToken');
      localStorage.removeItem('token');
      localStorage.removeItem('userType');
      
      // Set dev token directly
      localStorage.setItem('adminToken', 'dev-admin-token');
      localStorage.setItem('adminData', JSON.stringify({
        id: 'admin_dev',
        email: 'admin@mediczy.com',
        role: 'super_admin',
        firstName: 'System',
        lastName: 'Administrator'
      }));
      
      setLoading(false);
      navigate('/admin/dashboard');
      return;
    }
    
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
    console.log('API URL:', apiUrl);
    
    try {
      // Add timeout to prevent long waits
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(`${apiUrl}/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Login failed`);
      }
      
      const data = await response.json();
      console.log('Login response:', data);
      
      // Validate response
      if (!data.token || !data.admin) {
        throw new Error('Invalid server response');
      }
      
      // Clear any other role tokens first
      localStorage.removeItem('teamToken');
      localStorage.removeItem('nurseToken');
      localStorage.removeItem('assistantToken');
      localStorage.removeItem('token');
      localStorage.removeItem('userType');
      
      // Store token securely with immediate verification
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminData', JSON.stringify(data.admin));
      
      // Immediate verification
      const verifyToken = localStorage.getItem('adminToken');
      console.log('✅ Token stored successfully:', verifyToken ? 'YES' : 'NO');
      console.log('🔒 Token length:', verifyToken?.length);
      
      // Success message and redirect
      setError(null);
      
      // Redirect to main admin dashboard
      setTimeout(() => {
        navigate('/admin/dashboard');
      }, 500);
    } catch (err: any) {
      console.error('Admin login error:', err);
      
      if (err.message.includes('401') || err.message.includes('Unauthorized')) {
        setError('Invalid email or password');
      } else if (err.message.includes('500') || err.message.includes('Server')) {
        setError('Server error. Please try again later.');
      } else if (err.message.includes('fetch') || err.message.includes('Network')) {
        setError('Unable to connect to server. Please check your connection.');
      } else {
        setError(err.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Enhanced Header */}
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
            <Crown className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Admin Portal
          </h2>
          <p className="mt-2 text-gray-600">
            Secure access to Mediqzy admin dashboard
          </p>
        </div>
        
        <Card className="shadow-2xl border-0 bg-white/80 backdrop-blur-xl">
          <CardHeader className="text-center pb-6">
            <CardTitle className="flex items-center justify-center gap-2 text-xl">
              <Shield className="h-5 w-5 text-blue-600" />
              Admin Authentication
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-6">
              {error && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertDescription className="text-red-600 text-sm">
                    {error}
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                    Email Address
                  </label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@mediczy.com"
                    className="h-12 border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-colors"
                  />
                </div>
                
                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="h-12 border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-colors pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>
              
              <Button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full h-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Authenticating...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Sign In to Admin Portal
                  </div>
                )}
              </Button>
              
              {/* Development Quick Login */}
              {import.meta.env.DEV && (
                <Button
                  type="button"
                  onClick={() => {
                    console.log('🚀 Quick development login');
                    localStorage.setItem('adminToken', 'dev-admin-token');
                    localStorage.setItem('adminData', JSON.stringify({
                      id: 'admin_dev',
                      email: 'admin@mediczy.com',
                      role: 'super_admin',
                      firstName: 'System',
                      lastName: 'Administrator'
                    }));
                    navigate('/admin/dashboard');
                  }}
                  className="w-full h-10 mt-2 bg-green-600 hover:bg-green-700 text-white font-medium"
                >
                  🚀 Quick Login (Dev)
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
        
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
            <HeartPulse className="h-4 w-4" />
            <span className="font-medium">Mediczy Healthcare Platform</span>
          </div>
          <div className="bg-white/60 backdrop-blur-sm rounded-lg p-3 border">
            <p className="text-xs text-gray-600 font-medium mb-1">
              🔒 Secured Admin Portal • JWT Authentication
            </p>
            <p className="text-xs text-gray-500">
              Environment: {import.meta.env.MODE} • API: {import.meta.env.VITE_API_URL || 'localhost:8000'}
            </p>
            {import.meta.env.MODE === 'development' && (
              <p className="text-xs text-blue-600 mt-2">
                Test: admin@mediczy.com / SecurePass123
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
