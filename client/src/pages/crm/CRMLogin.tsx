import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  TrendingUp, Eye, EyeOff, Target, Shield, ArrowRight,
  BarChart3, Users, DollarSign, Zap, Globe, Lock,
} from 'lucide-react';
import api from '@/utils/api';
import { clearAuthTokens } from '@/hooks/auth';

const CRMLogin = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('crmToken');
    if (!token) { setIsCheckingAuth(false); return; }
    api.get('/crm/auth/verify', { headers: { Authorization: `Bearer ${token}` } })
      .then(() => navigate('/crm/dashboard'))
      .catch(() => {
        localStorage.removeItem('crmToken');
        localStorage.removeItem('crmRefreshToken');
        localStorage.removeItem('crmUserData');
        setIsCheckingAuth(false);
      });
  }, [navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
  };

  const establishCRMSession = (token: string, refreshToken?: string, crmUser?: any) => {
    clearAuthTokens();
    localStorage.setItem('crmToken', token);
    if (refreshToken) localStorage.setItem('crmRefreshToken', refreshToken);
    localStorage.setItem('userType', 'crm');
    if (crmUser) {
      localStorage.setItem('crmUserData', JSON.stringify({
        id: crmUser.id, email: crmUser.email,
        firstName: crmUser.firstName, lastName: crmUser.lastName,
        role: crmUser.role, designation: crmUser.designation,
        department: crmUser.department, permissions: crmUser.permissions,
      }));
    }
    window.dispatchEvent(new Event('authChange'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/crm/login', formData, { skipAuth: true } as any);
      if (data.success && data.token && data.crmUser) {
        establishCRMSession(data.token, data.refreshToken, data.crmUser);
        navigate('/crm/dashboard', { replace: true });
      } else {
        setError('Invalid login response from server');
      }
    } catch (err: any) {
      if (err.response?.status === 429) setError(err.response.data?.message || 'Too many attempts. Try again later.');
      else if (err.response?.status === 401) setError('Invalid email or password');
      else if (err.response?.status === 403) setError(err.response.data?.message || 'CRM access denied');
      else if (err.response?.data?.message) setError(err.response.data.message);
      else setError('Login failed. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0e1a]">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-400 tracking-wide">Verifying session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#0a0e1a] relative overflow-hidden">
      {/* Ambient background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-violet-600/[0.07] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-600/[0.05] rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-500/[0.03] rounded-full blur-[150px]" />
      </div>

      {/* Left panel — branding showcase (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-[55%] relative flex-col justify-between p-12 xl:p-16">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <Target className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">Mediqzy</span>
          </div>
          <span className="text-[11px] font-medium text-violet-400/80 uppercase tracking-[0.2em] ml-[52px]">Sales Intelligence</span>
        </div>

        <div className="relative z-10 max-w-lg">
          <h1 className="text-4xl xl:text-5xl font-bold text-white leading-[1.15] tracking-tight mb-6">
            Close more deals
            <br />
            <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
              with precision
            </span>
          </h1>
          <p className="text-base text-slate-400 leading-relaxed mb-10 max-w-md">
            Enterprise-grade CRM designed for healthcare sales teams. Track leads, manage pipelines, and drive revenue — all in one place.
          </p>

          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: TrendingUp, label: 'Pipeline Tracking', value: 'Real-time' },
              { icon: BarChart3, label: 'Sales Analytics', value: 'AI-Powered' },
              { icon: Globe, label: 'Team Collaboration', value: 'Unified' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="group p-4 rounded-2xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all duration-300">
                <Icon className="h-5 w-5 text-violet-400 mb-3 group-hover:text-violet-300 transition-colors" />
                <p className="text-xs font-semibold text-white/90 mb-0.5">{value}</p>
                <p className="text-[10px] text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-6 text-[11px] text-slate-600">
          <span className="flex items-center gap-1.5"><Lock className="h-3 w-3" /> 256-bit Encrypted</span>
          <span className="flex items-center gap-1.5"><Shield className="h-3 w-3" /> HIPAA Ready</span>
          <span className="flex items-center gap-1.5"><Zap className="h-3 w-3" /> 99.9% Uptime</span>
        </div>

        {/* Decorative grid lines */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-6 sm:p-10 relative z-10">
        <div className="w-full max-w-[420px] space-y-8">
          {/* Mobile only branding */}
          <div className="lg:hidden flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
              <Target className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold text-white">Mediqzy CRM</span>
              <p className="text-[10px] text-violet-400/70 uppercase tracking-[0.15em] -mt-0.5">Sales Intelligence</p>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight mb-1.5">Welcome back</h2>
            <p className="text-sm text-slate-500">Sign in to your CRM account to continue</p>
          </div>

          {error && (
            <Alert className="bg-red-500/10 border-red-500/20 text-red-300 animate-in slide-in-from-top-2 duration-300" role="alert">
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-medium text-slate-400 uppercase tracking-wider">Email</label>
              <div className={`relative rounded-xl transition-all duration-300 ${focusedField === 'email' ? 'ring-2 ring-violet-500/40' : ''}`}>
                <Input
                  id="email" name="email" type="email" value={formData.email}
                  onChange={handleChange} required placeholder="your@email.com"
                  onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)}
                  className="h-12 pl-11 bg-white/[0.05] border-white/[0.08] text-white placeholder:text-slate-600 rounded-xl focus:border-violet-500/50 focus-visible:ring-0 transition-all duration-300"
                  disabled={loading}
                />
                <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-medium text-slate-400 uppercase tracking-wider">Password</label>
              <div className={`relative rounded-xl transition-all duration-300 ${focusedField === 'password' ? 'ring-2 ring-violet-500/40' : ''}`}>
                <Input
                  id="password" name="password" type={showPassword ? 'text' : 'password'}
                  value={formData.password} onChange={handleChange} required
                  placeholder="Enter your password"
                  onFocus={() => setFocusedField('password')} onBlur={() => setFocusedField(null)}
                  className="h-12 pl-11 pr-11 bg-white/[0.05] border-white/[0.08] text-white placeholder:text-slate-600 rounded-xl focus:border-violet-500/50 focus-visible:ring-0 transition-all duration-300"
                  disabled={loading}
                />
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
                <button
                  type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors focus:outline-none"
                  disabled={loading} aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg shadow-violet-600/25 hover:shadow-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed group"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2.5">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Authenticating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Sign In
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </span>
              )}
            </Button>
          </form>

          <div className="flex items-center gap-4 pt-2">
            <div className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[10px] text-slate-600 uppercase tracking-wider">Secure Access</span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: DollarSign, label: 'Revenue' },
              { icon: BarChart3, label: 'Analytics' },
              { icon: Users, label: 'Pipeline' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <Icon className="h-4 w-4 text-violet-400/60" />
                <span className="text-[10px] text-slate-600">{label}</span>
              </div>
            ))}
          </div>

          <p className="text-center text-[11px] text-slate-700">
            Need help?{' '}
            <a href="mailto:support@mediczy.com?subject=CRM%20Portal%20Login%20Help"
              className="text-violet-500/70 hover:text-violet-400 transition-colors">
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default CRMLogin;
