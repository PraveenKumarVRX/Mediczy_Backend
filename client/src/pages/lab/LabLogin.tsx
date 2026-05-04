import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FlaskConical, Eye, EyeOff, Activity, Lock, ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import api from '@/utils/api';
import { clearAuthTokens } from '@/hooks/auth';

const LabLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('labToken');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload?.exp && Date.now() >= payload.exp * 1000) {
          localStorage.removeItem('labToken');
          setIsCheckingAuth(false);
          return;
        }
      } catch {
        localStorage.removeItem('labToken');
        setIsCheckingAuth(false);
        return;
      }
      navigate('/lab/dashboard');
      return;
    }
    
    setIsCheckingAuth(false);
  }, [navigate]);

  const establishLabSession = (token: string, labProfile?: any) => {
    clearAuthTokens();
    localStorage.setItem('labToken', token);
    localStorage.setItem('token', token);
    localStorage.setItem('userType', 'lab');
    if (labProfile) {
      localStorage.setItem('labData', JSON.stringify({
        id: labProfile.id,
        email: labProfile.email,
        name: labProfile.name || labProfile.labName,
        license: labProfile.licenseNumber,
        department: labProfile.department || 'pathology',
      }));
      if (labProfile.id) {
        localStorage.setItem('userId', String(labProfile.id));
      }
    } else {
      localStorage.removeItem('labData');
      localStorage.removeItem('userId');
    }
    window.dispatchEvent(new CustomEvent('authChange'));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    console.log('Lab login attempt:', { email, password: '***' });

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 10000);

      const { data } = await api.post('/lab/login', { email, password }, { signal: controller.signal, skipAuth: true });

      establishLabSession(data.token, data.lab);
      navigate('/lab/dashboard', { replace: true });
      if (timeoutId) clearTimeout(timeoutId);
    } catch (err: any) {
      console.error('Lab login error:', err);
      if (err?.response?.data?.pending) { setIsPending(true); return; }
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') {
        setError('Request timeout. Please check your connection and try again.');
      } else {
        setError(err?.response?.data?.message || err?.message || 'Login failed. Please check your credentials.');
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-lime-50 via-white to-green-50">
        <div className="flex flex-col items-center gap-4">
          <Activity className="h-8 w-8 animate-spin text-lime-600" />
          <p className="text-sm text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-lime-50 via-white to-green-50 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="border-2 shadow-2xl">
          <CardHeader className="space-y-4 pb-8">
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-lime-500/20 blur-xl rounded-full" />
                <div className="relative bg-gradient-to-br from-lime-500 to-green-600 p-4 rounded-2xl shadow-lg">
                  <FlaskConical className="h-12 w-12 text-white" />
                </div>
              </div>
            </div>
            <CardTitle className="text-3xl font-bold text-center bg-gradient-to-r from-lime-600 to-green-600 bg-clip-text text-transparent">
              Laboratory Login
            </CardTitle>
            <CardDescription className="text-center text-base">
              Access your lab management portal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-6">
              {isPending && (
                <div className="mb-2 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <Clock className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-amber-800 text-sm">Account Under Review</p>
                    <p className="text-amber-700 text-xs mt-1">Your registration is being reviewed. You'll receive an email with login credentials once approved (24–48 hours).</p>
                  </div>
                </div>
              )}
              {error && (
                <Alert variant="destructive" className="animate-in slide-in-from-top-2" role="alert">
                  <AlertDescription className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    {error}
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-lime-600" />
                    Email Address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="lab@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 text-base border-2 focus:border-lime-500 transition-colors"
                  />
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium flex items-center gap-2">
                    <Lock className="h-4 w-4 text-lime-600" />
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="h-12 text-base border-2 focus:border-lime-500 transition-colors pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-500 transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              </div>
              
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 text-base bg-gradient-to-r from-lime-600 to-green-600 hover:from-lime-700 hover:to-green-700 transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                {loading ? (
                  <Activity className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
            </form>
            
            <div className="mt-6 text-center text-sm text-muted-foreground">
              Need help? Contact{' '}
              <a href="mailto:support@mediczy.com" className="text-lime-600 hover:underline font-medium">
                support@mediczy.com
              </a>
            </div>
            <div className="mt-4">
              <button type="button" onClick={() => navigate('/lab/register')} className="w-full h-11 rounded-xl border-2 border-blue-500 text-blue-600 font-bold text-sm hover:bg-blue-50 active:scale-95 transition-all">
                  New lab? Register here
                </button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default LabLogin;
