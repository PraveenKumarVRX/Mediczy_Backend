import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  HeartPulse,
  Shield,
  Eye,
  EyeOff,
  Activity,
  ArrowLeft,
  Plus,
  CheckCircle2,
  Building2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';

const toSlug = (name: string) =>
  (name || 'hospital').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'hospital';

const InsurancePortalLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  const goToDashboard = (slug: string) => navigate(`/hospital/${slug}/insurance/dashboard`, { replace: true });

  const setDemoSession = () => {
    const demoData = {
      id: 'demo-insurance-portal',
      name: 'Mediqzy Insurance Portal Demo',
      email: 'insurance@mediczy.com',
      phone: '+91 99999 99999',
      hospitalName: 'Mediqzy Demo Hospital',
      city: 'Delhi',
      state: 'Delhi',
      role: 'insurance_desk',
    };

    const slug = toSlug(demoData.hospitalName);
    localStorage.setItem('hospitalInsuranceToken', `demo-insurance-token-${Date.now()}`);
    localStorage.setItem('hospitalInsuranceData', JSON.stringify(demoData));
    localStorage.setItem('hospitalInsuranceSlug', slug);
    localStorage.setItem('userType', 'hospitalInsurance');
    toast({ title: 'Offline demo login', description: 'Loaded insurance portal demo session locally.' });
    goToDashboard(slug);
  };

  useEffect(() => {
    const token = localStorage.getItem('hospitalInsuranceToken');
    if (token) {
      const slug = localStorage.getItem('hospitalInsuranceSlug') || 'hospital';
      goToDashboard(slug);
      return;
    }

    setIsCheckingAuth(false);
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const { data } = await api.post(
        '/hospital-insurance/auth/login',
        { email, password },
        { signal: controller.signal, skipAuth: true } as any
      );

      const tokenKeys = [
        'token', 'doctorToken', 'teamToken', 'nurseToken', 'assistantToken',
        'adminToken', 'corporateToken', 'hospitalToken', 'clinicToken',
        'labToken', 'pharmacyToken', 'ambulanceToken', 'homecareToken',
        'insuranceCompanyToken', 'insuranceBrokerToken', 'tpaToken',
      ];
      const dataKeys = [
        'userData', 'doctorData', 'teamData', 'nurseData', 'assistantData',
        'adminData', 'corporateData', 'hospitalData', 'clinicData',
        'labData', 'pharmacyData', 'ambulanceData', 'homecareData',
      ];

      tokenKeys.forEach((key) => localStorage.removeItem(key));
      dataKeys.forEach((key) => localStorage.removeItem(key));

      localStorage.setItem('hospitalInsuranceToken', data.token);
      localStorage.setItem('hospitalInsuranceData', JSON.stringify(data.user || data.hospital));
      localStorage.setItem('token', data.token);
      localStorage.setItem('userType', 'hospitalInsurance');

      const slug = toSlug((data.user || data.hospital)?.hospitalName || (data.user || data.hospital)?.name || 'hospital');
      localStorage.setItem('hospitalInsuranceSlug', slug);

      goToDashboard(slug);
    } catch (err: any) {
      console.error('Insurance portal login error:', err);
      const isDemoCredentials = email === 'insurance@mediczy.com' && password === 'Insurance123';

      if (isDemoCredentials) {
        setError(null);
        setDemoSession();
        return;
      }

      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') {
        setError('Request timeout. Please check your connection and try again.');
      } else {
        setError(err?.response?.data?.message || err?.message || 'Login failed. Please check your credentials.');
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-100 dark:border-blue-950 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500/5 via-background/95 to-purple-500/5 flex items-center justify-center p-6">
      <div className="absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.03) 0%, transparent 25%)',
            backgroundSize: '40px 40px',
            backgroundPosition: '0 0, 20px 20px',
          }}
        />
      </div>

      <div className="relative w-full max-w-md animate-in fade-in duration-700">
        <Link
          to="/login"
          className="absolute -top-16 left-0 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-300 group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          <span>Back to User Login</span>
        </Link>

        <Card className="relative overflow-hidden backdrop-blur-xl bg-gradient-to-br from-background/80 via-background/90 to-background/80 border border-border/50 shadow-2xl transform transition-all duration-500">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-blue-500/5" />

          <CardHeader className="relative text-center pb-8">
            <div className="flex justify-center mb-6">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 relative">
                <div className="relative">
                  <HeartPulse className="h-8 w-8 text-purple-500" />
                  <Shield className="absolute -top-1 -right-1 h-4 w-4 text-blue-500" />
                </div>
              </div>
            </div>

            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-2">
              Insurance Portal
            </CardTitle>
            <p className="text-muted-foreground">
              Access the Mediqzy hospital insurance system
            </p>

            <div className="absolute -top-8 -right-8 opacity-[0.02] pointer-events-none">
              <Plus className="w-32 h-32 text-purple-500 rotate-12" />
            </div>
          </CardHeader>

          <CardContent className="relative space-y-6">
            {error && (
              <Alert
                variant="destructive"
                className="animate-in slide-in-from-top-2 duration-300 border-red-200 bg-red-50 dark:border-red-950 dark:bg-red-950/30"
                role="alert"
              >
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={onSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Insurance Email
                </Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="insurance@hospital.com"
                    className="h-12 pl-12 bg-background/50 border-border/50 focus:border-purple-500/50 focus:ring-purple-500/20 transition-all duration-300"
                    disabled={loading}
                  />
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Enter your password"
                    className="h-12 pl-12 pr-12 bg-background/50 border-border/50 focus:border-purple-500/50 focus:ring-purple-500/20 transition-all duration-300"
                    disabled={loading}
                  />
                  <Shield className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                    disabled={loading}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
                <div className="text-right">
                  <span className="text-xs text-muted-foreground">
                    Demo: insurance@mediczy.com / Insurance123
                  </span>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white font-medium transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg hover:shadow-xl"
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing In...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Access Insurance Portal
                  </div>
                )}
              </Button>
            </form>

            <div className="text-center space-y-4">
              <div className="text-sm text-muted-foreground">
                Need help accessing your account?
              </div>
              <div className="rounded-xl border border-purple-500/15 bg-gradient-to-r from-purple-500/5 to-blue-500/5 px-4 py-3 text-xs text-muted-foreground">
                Manage pre-authorizations, claims, reconciliation, NHCX and ABDM workflows from a single hospital insurance desk.
              </div>
            </div>

            <div className="text-center text-xs text-muted-foreground">
              Trouble signing in?{' '}
              <a
                href="mailto:support@mediczy.com?subject=Insurance%20Portal%20Login%20Help"
                className="font-semibold underline underline-offset-2 hover:text-purple-600"
              >
                Contact support
              </a>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-6 space-y-2">
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            <span>Mediqzy Healthcare Management System</span>
          </div>
          <p className="text-xs text-muted-foreground">
            For hospital insurance and claims teams only
          </p>
        </div>
      </div>

      <div className="absolute -bottom-16 -left-16 opacity-[0.01] pointer-events-none">
        <Plus className="w-64 h-64 text-purple-500 -rotate-12" />
      </div>
      <div className="absolute -top-16 -right-16 opacity-[0.01] pointer-events-none">
        <Plus className="w-64 h-64 text-blue-500 rotate-12" />
      </div>
    </div>
  );
};

export default InsurancePortalLogin;
