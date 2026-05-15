/**
 * DeptLoginTemplate — reusable login page template for all hospital department portals.
 * Each department login page is a thin wrapper that supplies its own config.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Eye, EyeOff, Activity, Lock, ArrowRight, CheckCircle2 } from 'lucide-react';
import api from '@/utils/api';
import { clearDeptSession } from '@/hooks/useHospDeptAuth';

interface DeptLoginTemplateProps {
  deptKey: string;
  title: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  dashboardPath: string;
}

const DeptLoginTemplate = ({
  deptKey, title, description, Icon, dashboardPath,
}: DeptLoginTemplateProps) => {
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const navigate = useNavigate();

  const tokenKey = `${deptKey}Token`;

  useEffect(() => {
    const token = localStorage.getItem(tokenKey);
    if (token) {
      navigate(dashboardPath);
      return;
    }
    setIsCheckingAuth(false);
  }, [navigate, tokenKey, dashboardPath]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), 10000);

      // Try department-specific staff endpoint first, then fall back to legacy hospital auth
      const attempts = [
        { endpoint: `/${deptKey}/login`,                 body: { email, password } },
        { endpoint: `/hospital/staff/${deptKey}/login`,  body: { email, password } },
        { endpoint: `/hospital/dept/${deptKey}/login`,   body: { email, password } },
        { endpoint: '/hospital/auth/login',              body: { email, password } },
        { endpoint: '/hospital/login',                   body: { email, password } },
      ];

      let data: unknown = null;
      let lastError: unknown = null;

      for (const attempt of attempts) {
        try {
          const response = await api.post(attempt.endpoint, attempt.body, {
            signal: controller.signal,
            skipAuth: true,
          } as any);
          data = response.data;
          break;
        } catch (err: any) {
          lastError = err;
          if (err?.response?.status && ![404, 405].includes(err.response.status)) {
            throw err;
          }
        }
      }

      if (!data) throw lastError || new Error('Login endpoint unavailable');

      clearTimeout(timeoutId);

      // Store token under department-specific key
      const d = data as any;
      const token = d.token ?? d.data?.token;
      // Debug logging: API response and token
      // eslint-disable-next-line no-console
      console.log('[DeptLoginTemplate] Login API response:', d);
      // eslint-disable-next-line no-console
      console.log('[DeptLoginTemplate] Storing token under key:', tokenKey, 'Token:', token);
      localStorage.setItem(tokenKey, token);
      if (d.refreshToken) localStorage.setItem(`${deptKey}RefreshToken`, d.refreshToken);
      localStorage.setItem('userType', deptKey);
      localStorage.setItem(`${deptKey}Data`, JSON.stringify(d.data?.staff ?? d.hospital ?? d.user ?? {}));
      // Debug logging: localStorage state after login
      // eslint-disable-next-line no-console
      console.log('[DeptLoginTemplate] localStorage snapshot:', {
        [tokenKey]: localStorage.getItem(tokenKey),
        [`${deptKey}RefreshToken`]: localStorage.getItem(`${deptKey}RefreshToken`),
        userType: localStorage.getItem('userType'),
        [`${deptKey}Data`]: localStorage.getItem(`${deptKey}Data`),
      });

      navigate(dashboardPath);
    } catch (err: any) {
      clearDeptSession(deptKey);
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') {
        setError('Request timeout. Please check your connection and try again.');
      } else {
        setError(
          err?.response?.data?.message ?? err?.message ?? 'Login failed. Please check your credentials.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 via-white to-emerald-50">
        <div className="flex flex-col items-center gap-4">
          <Activity className="h-8 w-8 animate-spin text-teal-600" />
          <p className="text-sm text-muted-foreground">Checking authentication…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 via-white to-emerald-50 p-4">
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
                <div className="absolute inset-0 bg-teal-500/20 blur-xl rounded-full" />
                <div className="relative bg-gradient-to-br from-teal-500 to-teal-600 p-4 rounded-2xl shadow-lg">
                  <Icon className="h-12 w-12 text-white" />
                </div>
              </div>
            </div>
            <CardTitle className="text-3xl font-bold text-center bg-gradient-to-r from-teal-600 to-teal-500 bg-clip-text text-transparent">
              {title}
            </CardTitle>
            <CardDescription className="text-center text-base">{description}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-6">
              {error && (
                <Alert variant="destructive" className="animate-in slide-in-from-top-2">
                  <AlertDescription className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-teal-600" />
                    Email Address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="staff@hospital.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 text-base border-2 focus:border-teal-500 transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium flex items-center gap-2">
                    <Lock className="h-4 w-4 text-teal-600" />
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
                      className="h-12 text-base border-2 focus:border-teal-500 transition-colors pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 text-base bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                {loading ? (
                  <Activity className="h-5 w-5 animate-spin" />
                ) : (
                  <>Sign In <ArrowRight className="ml-2 h-5 w-5" /></>
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              Need help? Contact{' '}
              <a href="mailto:support@mediczy.com" className="text-teal-600 hover:underline font-medium">
                support@mediczy.com
              </a>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default DeptLoginTemplate;
