import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Eye, EyeOff, Activity, Lock, ArrowRight, CheckCircle2, LifeBuoy, ArrowLeft } from 'lucide-react';
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
          role: adminUser.role || adminUser.type || 'admin',
          firstName: adminUser.firstName || null,
          lastName: adminUser.lastName || null,
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
      localStorage.setItem('userType', 'admin');
      window.dispatchEvent(new Event('authChange'));
      navigate('/admin/dashboard');
      return;
    }
    
    setIsCheckingAuth(false);
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    
    try {
      // Add timeout to prevent long waits
      timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      // Use the shared api instance (same env/LAN-IP/proxy resolution every
      // other portal login relies on) instead of hand-rolling the base URL.
      const { data } = await api.post('/admin/login', { email, password }, {
        signal: controller.signal,
        withCredentials: true,
        timeout: 30000,
        skipAuth: true,
      } as any);
      
      if (import.meta.env.DEV) {
        console.log('Login response:', data);
      }
      
      // Validate response - API returns 'user' object (not 'admin')
      if (!data.token || !data.user) {
        throw new Error('Invalid server response');
      }
      
      establishAdminSession(data.token, data.user);
      
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500/5 via-background/95 to-purple-500/5">
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
    <div className="auth-shell min-h-screen flex items-center justify-center p-4">
      <div className="grid w-full max-w-5xl grid-cols-1 lg:grid-cols-2 overflow-hidden brand-panel relative">
        <div className="hidden lg:flex flex-col p-10 text-white brand-hero">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="relative z-20 inline-flex items-center gap-2 text-lg font-bold cursor-pointer"
          >
            <Shield className="h-6 w-6" />
            Mediqzy
            <span className="ml-2 text-[10px] uppercase bg-white/20 px-2 py-0.5 rounded-full">Admin</span>
          </button>
          <div className="mt-auto space-y-3">
            <h2 className="text-3xl font-semibold">Secure Admin Access</h2>
            <p className="text-white/80">
              Control users, providers, and compliance inside the same branded shell as the other portals.
            </p>
            <ul className="space-y-2 text-sm text-white/85">
              <li className="flex items-center gap-2"><Lock className="h-4 w-4" /> Role-gated controls and oversight</li>
              <li className="flex items-center gap-2"><Activity className="h-4 w-4" /> Audit trails across actions</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Unified patient/provider governance</li>
            </ul>
          </div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="p-6 lg:p-10 h-full flex items-center bg-white"
        >
          <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[360px]">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 border border-slate-200 hover:bg-slate-100 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to user login
              </button>
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
                <Shield className="h-3.5 w-3.5" />
                Admin Portal
              </div>
            </div>

            <div className="flex flex-col space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome Back</h1>
              <p className="text-sm text-muted-foreground">
                Sign in to access the admin dashboard.
              </p>
            </div>

            <Card className="border border-slate-200 shadow-lg">
              <CardContent className="pt-6">
                <form onSubmit={onSubmit} className="space-y-5">
                  {error && (
                    <Alert className="border-red-100 bg-red-50/50 text-red-800" role="alert">
                      <AlertDescription className="flex items-center gap-2 text-sm font-medium">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                        {error}
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="email" className="text-sm font-medium text-slate-700 ml-1">
                        Work Email
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
                          placeholder="admin@mediqzy.com"
                          className="h-11 bg-white border-slate-300 focus:bg-white focus:border-blue-500 focus:ring-blue-500/20 transition-all pl-4 text-gray-900 font-medium placeholder:text-slate-500 autofill:bg-white autofill:text-gray-900"
                        />
                        <Shield className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
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
                          className="h-11 bg-white border-slate-300 focus:bg-white focus:border-blue-500 focus:ring-blue-500/20 transition-all pr-12 pl-4 text-gray-900 font-medium placeholder:text-slate-500 autofill:bg-white autofill:text-gray-900"
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

            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-50 border border-slate-200 shadow-sm">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span className="text-xs font-medium text-slate-600">End-to-end encrypted connection</span>
              </div>
              <p className="mt-4 text-xs text-slate-400">
                © {new Date().getFullYear()} Mediczy Healthcare Platform. All rights reserved.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default AdminLogin;
