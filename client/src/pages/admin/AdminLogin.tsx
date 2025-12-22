import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Eye, EyeOff, Activity, Lock, ArrowRight, CheckCircle2, LifeBuoy } from 'lucide-react';
import api from '@/utils/api';
import { clearAuthTokens } from '@/hooks/auth';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const navigate = useNavigate();

  const establishAdminSession = (token: string, adminUser?: any) => {
    clearAuthTokens();
    const safeAdminData = adminUser
      ? {
          id: adminUser.id,
          email: adminUser.email,
          role: adminUser.role || adminUser.type || 'admin'
        }
      : null;

    localStorage.setItem('adminToken', token);
    localStorage.setItem('token', token);
    localStorage.setItem('userType', 'admin');
    if (safeAdminData) {
      localStorage.setItem('adminData', JSON.stringify(safeAdminData));
    } else {
      localStorage.removeItem('adminData');
    }
    window.dispatchEvent(new Event('authChange'));
  };

  // Check if already authenticated
  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      console.log('✅ Admin already authenticated, redirecting...');
      localStorage.setItem('userType', 'admin');
      window.dispatchEvent(new Event('authChange'));
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
    
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    
    try {
      // Add timeout to prevent long waits
      timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const { data } = await api.post('/admin/login', { email, password }, { signal: controller.signal, skipAuth: true });
      
      if (import.meta.env.DEV) {
        console.log('Login response:', data);
      }
      
      // Validate response - API returns 'user' not 'admin'
      if (!data.token || !data.user) {
        throw new Error('Invalid server response');
      }
      
      establishAdminSession(data.token, data.user);
      
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

      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') {
        setError('Request timed out. Please try again.');
        return;
      }

      const status = err?.response?.status;
      const serverMessage = err?.response?.data?.message || err?.response?.data?.error;
      const message = serverMessage || err?.message || 'Login failed. Please try again.';
      
      if (status === 401 || message.includes('401') || message.includes('Unauthorized')) {
        setError('Invalid email or password');
      } else if (status === 500 || message.includes('500') || message.includes('Server')) {
        setError('Server error. Please try again later.');
      } else if (message.includes('Network') || message.includes('ERR_NETWORK')) {
        setError('Unable to connect to server. Please check your connection.');
      } else {
        setError(message);
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      setLoading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Activity className="w-6 h-6 text-blue-600" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 relative overflow-hidden font-sans">
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[30%] -left-[10%] w-[70%] h-[70%] rounded-full bg-blue-100/40 blur-3xl"></div>
        <div className="absolute top-[20%] -right-[10%] w-[60%] h-[60%] rounded-full bg-indigo-100/40 blur-3xl"></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md px-6 relative z-10"
      >
        <div className="text-center mb-8">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-xl shadow-blue-600/20 flex items-center justify-center mb-6 transform rotate-3 hover:rotate-0 transition-transform duration-300"
          >
            <Activity className="h-8 w-8 text-white" />
          </motion.div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
            Welcome Back
          </h2>
          <p className="mt-2 text-slate-500">
            Sign in to access the admin dashboard
          </p>
        </div>
        
        <Card className="border-0 shadow-2xl shadow-slate-200/50 bg-white/80 backdrop-blur-xl overflow-hidden">
          <CardHeader className="pb-0">
            <div className="flex items-center justify-center gap-2 py-2 px-4 bg-blue-50/50 rounded-full w-fit mx-auto mb-2">
              <Shield className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Secure Admin Portal</span>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={onSubmit} className="space-y-5">
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                >
                  <Alert className="border-red-100 bg-red-50/50 text-red-800" role="alert">
                    <AlertDescription className="flex items-center gap-2 text-sm font-medium">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                      {error}
                    </AlertDescription>
                  </Alert>
                </motion.div>
              )}
              
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-sm font-medium text-slate-700 ml-1">
                    Email Address
                  </label>
                  <div className="relative group">
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@mediczy.com"
                      className="h-11 bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-blue-500/20 transition-all pl-4 text-slate-900 placeholder:text-slate-400 dark:text-white"
                    />
                  </div>
                </div>
                
                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-slate-700 ml-1">
                    Password
                  </label>
                  <div className="relative group">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-11 bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-blue-500/20 transition-all pr-12 pl-4 text-slate-900 placeholder:text-slate-400 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md hover:bg-slate-100"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              </div>
              
              <Button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed group"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Authenticating...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                )}
              </Button>
              
              {/* Development Quick Login */}
              {import.meta.env.DEV && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    console.log('🚀 Quick development login');
                    establishAdminSession('dev-admin-token', {
                      id: 'admin_dev',
                      email: 'admin@mediczy.com',
                      role: 'super_admin'
                    });
                    navigate('/admin/dashboard');
                  }}
                  className="w-full h-9 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                >
                  Dev Mode: Quick Access
                </Button>
              )}
            </form>

            <div className="mt-6 text-center space-y-2">
              <button
                type="button"
                className="text-sm text-blue-600 hover:underline font-medium"
                onClick={() => window.open('mailto:support@mediczy.com?subject=Admin%20Access%20Help', '_self')}
              >
                Forgot password or locked out?
              </button>
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                <LifeBuoy className="h-3.5 w-3.5" aria-hidden="true" />
                <a
                  href="mailto:support@mediczy.com?subject=Admin%20Portal%20Assistance"
                  className="underline-offset-2 hover:underline"
                >
                  Contact support
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/50 backdrop-blur-sm border border-slate-200/50 shadow-sm">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span className="text-xs font-medium text-slate-600">End-to-End Encrypted Connection</span>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            © {new Date().getFullYear()} Mediczy Healthcare Platform. All rights reserved.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminLogin;
