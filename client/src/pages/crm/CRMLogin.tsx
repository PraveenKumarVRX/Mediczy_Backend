import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  TrendingUp,
  Eye,
  EyeOff,
  Target,
  Shield,
  ArrowLeft,
  Plus,
  CheckCircle2,
  BarChart3,
  Users,
  DollarSign,
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
        id: crmUser.id,
        email: crmUser.email,
        firstName: crmUser.firstName,
        lastName: crmUser.lastName,
        role: crmUser.role,
        designation: crmUser.designation,
        department: crmUser.department,
        permissions: crmUser.permissions,
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-500/5 via-background/95 to-teal-500/5 flex items-center justify-center p-6">
      <div className="absolute inset-0">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.03) 0%, transparent 25%)`,
          backgroundSize: '40px 40px',
          backgroundPosition: '0 0, 20px 20px'
        }} />
      </div>

      <div className="relative w-full max-w-md animate-in fade-in duration-700">
        <Link
          to="/team/login"
          className="absolute -top-16 left-0 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-300 group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          <span>Back to Team Login</span>
        </Link>

        <Card className="relative overflow-hidden backdrop-blur-xl bg-gradient-to-br from-background/80 via-background/90 to-background/80 border border-border/50 shadow-2xl transform transition-all duration-500">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5" />

          <CardHeader className="relative text-center pb-8">
            <div className="flex justify-center mb-6">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 relative">
                <div className="relative">
                  <Target className="h-8 w-8 text-emerald-500" />
                  <TrendingUp className="absolute -top-1 -right-1 h-4 w-4 text-teal-500" />
                </div>
              </div>
            </div>

            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent mb-2">
              CRM Sales Portal
            </CardTitle>
            <p className="text-muted-foreground">
              Manage leads, deals &amp; sales pipeline
            </p>

            <div className="absolute -top-8 -right-8 opacity-[0.02] pointer-events-none">
              <Plus className="w-32 h-32 text-emerald-500 rotate-12" />
            </div>
          </CardHeader>

          <CardContent className="relative space-y-6">
            {error && (
              <Alert variant="destructive" className="animate-in slide-in-from-top-2 duration-300 border-red-200 bg-red-50" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Work Email</Label>
                <div className="relative">
                  <Input
                    id="email" name="email" type="email" value={formData.email}
                    onChange={handleChange} required placeholder="sales@company.com"
                    className="h-12 pl-12 bg-background/50 border-border/50 focus:border-emerald-500/50 focus:ring-emerald-500/20 transition-all duration-300"
                    disabled={loading}
                  />
                  <Users className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <div className="relative">
                  <Input
                    id="password" name="password" type={showPassword ? 'text' : 'password'}
                    value={formData.password} onChange={handleChange} required
                    placeholder="Enter your password"
                    className="h-12 pl-12 pr-12 bg-background/50 border-border/50 focus:border-emerald-500/50 focus:ring-emerald-500/20 transition-all duration-300"
                    disabled={loading}
                  />
                  <Shield className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <button
                    type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    disabled={loading}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-medium transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg hover:shadow-xl"
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing In...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Access CRM Portal
                  </div>
                )}
              </Button>
            </form>

            <div className="grid grid-cols-3 gap-3 pt-2">
              {[
                { icon: BarChart3, label: 'Pipeline', color: 'text-emerald-500' },
                { icon: DollarSign, label: 'Revenue', color: 'text-teal-500' },
                { icon: Users, label: 'Contacts', color: 'text-cyan-500' },
              ].map(({ icon: Icon, label, color }) => (
                <div key={label} className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/30">
                  <Icon className={`h-4 w-4 ${color}`} />
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>

            <div className="text-center text-xs text-muted-foreground">
              Trouble signing in?{' '}
              <a
                href="mailto:support@mediczy.com?subject=CRM%20Portal%20Login%20Help"
                className="font-semibold underline underline-offset-2 hover:text-emerald-600"
              >
                Contact support
              </a>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-6 space-y-2">
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            <span>Mediqzy CRM &amp; Sales Management</span>
          </div>
          <p className="text-xs text-muted-foreground">
            For authorized sales &amp; business development staff only
          </p>
        </div>
      </div>

      <div className="absolute -bottom-16 -left-16 opacity-[0.01] pointer-events-none">
        <Plus className="w-64 h-64 text-emerald-500 -rotate-12" />
      </div>
      <div className="absolute -top-16 -right-16 opacity-[0.01] pointer-events-none">
        <Plus className="w-64 h-64 text-teal-500 rotate-12" />
      </div>
    </div>
  );
};

export default CRMLogin;
