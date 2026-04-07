import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Eye, EyeOff, Activity, ArrowRight, Briefcase, Building2, Lock } from 'lucide-react';
import api from '@/utils/api';

const InsuranceBrokerLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('teamToken');
    localStorage.removeItem('nurseToken');
    localStorage.removeItem('assistantToken');
    localStorage.removeItem('tpaToken');
    localStorage.removeItem('insuranceCompanyToken');
    const token = localStorage.getItem('insuranceBrokerToken');
    if (token) { navigate('/insurance-broker/dashboard'); return; }
    setIsCheckingAuth(false);
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const { data } = await api.post('/insurance-broker/login', { email, password }, { signal: controller.signal, skipAuth: true } as any);
      clearTimeout(timeoutId);
      if (!data.token || !data.user) throw new Error('Invalid server response');
      localStorage.removeItem('adminToken'); localStorage.removeItem('teamToken');
      localStorage.removeItem('nurseToken'); localStorage.removeItem('assistantToken');
      localStorage.removeItem('tpaToken'); localStorage.removeItem('insuranceCompanyToken');
      localStorage.removeItem('token'); localStorage.removeItem('userType');
      localStorage.setItem('insuranceBrokerToken', data.token);
      localStorage.setItem('insuranceBrokerData', JSON.stringify(data.user));
      setTimeout(() => navigate('/insurance-broker/dashboard'), 300);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') { setError('Request timed out. Please try again.'); }
      else {
        const status = err?.response?.status;
        const msg = err?.response?.data?.message || err?.message || 'Login failed';
        if (status === 401) setError('Invalid email or password');
        else if (status === 403) setError('Your broker account is not yet active. Please contact support.');
        else if (status === 500) setError('Server error. Please try again later.');
        else setError(msg);
      }
    } finally { setLoading(false); }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Activity className="w-5 h-5 text-emerald-400" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 border-r border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-semibold text-lg">InsureCorrect</span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Broker Portal</span>
        </div>

        <div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Manage your<br />
            <span className="text-emerald-400">insurance operations</span><br />
            with confidence
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed mb-10">
            Unified platform for policy tracking, corporate management, commissions, and compliance reporting.
          </p>

          <div className="space-y-4">
            {[
              { icon: Shield, label: 'IRDAI Licensed Operations', desc: 'Compliant broker management framework' },
              { icon: Building2, label: 'Corporate Client Hub', desc: 'Onboard and manage group health policies' },
              { icon: Lock, label: 'Secure & Audited', desc: 'JWT auth with full login audit trail' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{label}</p>
                  <p className="text-slate-500 text-xs">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-slate-600 text-sm">
          © {new Date().getFullYear()} Mediczy Healthcare Platform
        </p>
      </div>

      {/* Right panel - login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
              <Briefcase className="w-4 w-4 text-white" />
            </div>
            <span className="text-white font-semibold">InsureCorrect Broker Portal</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-1">Sign in</h2>
            <p className="text-slate-400 text-sm">Enter your broker credentials to continue</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            {error && (
              <Alert className="bg-red-500/10 border-red-500/30">
                <AlertDescription className="text-red-400 text-sm flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0"></div>
                  {error}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-slate-300">
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="broker@company.com"
                className="h-11 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500/20"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-slate-300">
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500/20 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Authenticating…</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              )}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-800">
            <p className="text-xs text-slate-500 text-center">
              Don't have an account?{' '}
              <a href="/insurance-broker/register" className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
                Register as a broker
              </a>
            </p>
          </div>

          <div className="mt-6 flex items-center justify-center gap-1.5">
            <Shield className="w-3 h-3 text-emerald-500" />
            <span className="text-xs text-slate-600">End-to-End Encrypted · IRDAI Compliant</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InsuranceBrokerLogin;
