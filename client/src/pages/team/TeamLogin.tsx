import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Users, 
  Eye, 
  EyeOff, 
  HeartPulse, 
  Shield, 
  ArrowLeft, 
  Plus,
  Crown,
  CheckCircle2,
  Activity
} from 'lucide-react';
import api from '@/utils/api';
import { clearAuthTokens } from '@/hooks/auth';

const TeamLogin = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // On mount: verify existing token before redirecting; skip straight to form if missing
  useEffect(() => {
    const token = localStorage.getItem('teamToken');
    if (!token) {
      setIsCheckingAuth(false);
      return;
    }
    // Verify the stored token is still valid server-side
    api.get('/team/auth/verify', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(() => navigate('/team/dashboard'))
      .catch(() => {
        // Token invalid/expired — clear and show login form
        localStorage.removeItem('teamToken');
        localStorage.removeItem('teamRefreshToken');
        localStorage.removeItem('teamUserData');
        setIsCheckingAuth(false);
      });
  }, [navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
    // Clear error when user starts typing
    if (error) setError('');
  };

  const establishTeamSession = (token: string, refreshToken?: string, teamUser?: any) => {
    clearAuthTokens();
    localStorage.setItem('teamToken', token);
    // Store refresh token separately — never overwrite the generic 'token' slot
    if (refreshToken) {
      localStorage.setItem('teamRefreshToken', refreshToken);
    }
    localStorage.setItem('userType', 'team');
    if (teamUser) {
      localStorage.setItem('teamUserData', JSON.stringify({
        id: teamUser.id,
        email: teamUser.email,
        firstName: teamUser.firstName,
        lastName: teamUser.lastName,
        role: teamUser.role,
        department: teamUser.department,
        isActive: teamUser.isActive
      }));
    } else {
      localStorage.removeItem('teamUserData');
    }
    window.dispatchEvent(new Event('authChange'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data } = await api.post('/team/login', formData, { skipAuth: true });

      if (data.success && data.token && data.teamUser) {
        establishTeamSession(data.token, data.refreshToken, data.teamUser);
        navigate('/team/dashboard', { replace: true });
      } else {
        setError('Invalid login response from server');
      }
    } catch (err: any) {
      if (err.response?.status === 429) {
        setError(err.response.data?.message || 'Too many attempts. Try again later.');
      } else if (err.response?.status === 401) {
        setError('Invalid email or password');
      } else if (err.response?.status === 403) {
        setError('Your account is inactive or login access is disabled');
      } else if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError('Login failed. Please check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Show loading while checking authentication
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500/5 via-background/95 to-purple-500/5 flex items-center justify-center p-6">
      {/* Background Pattern */}
      <div className="absolute inset-0">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.03) 0%, transparent 25%)`,
          backgroundSize: '40px 40px',
          backgroundPosition: '0 0, 20px 20px'
        }} />
      </div>

      <div className="relative w-full max-w-md animate-in fade-in duration-700">
        {/* Back Navigation */}
        <Link
          to="/login"
          className="absolute -top-16 left-0 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-300 group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          <span>Back to User Login</span>
        </Link>

        {/* Login Card with gradient styling */}
        <Card className="
          relative overflow-hidden backdrop-blur-xl 
          bg-gradient-to-br from-background/80 via-background/90 to-background/80
          border border-border/50 shadow-2xl
          transform transition-all duration-500
        ">
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-blue-500/5" />
          
          <CardHeader className="relative text-center pb-8">
            {/* Logo section with gradient background */}
            <div className="flex justify-center mb-6">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 relative">
                <div className="relative">
                  <HeartPulse className="h-8 w-8 text-purple-500" />
                  <Shield className="absolute -top-1 -right-1 h-4 w-4 text-blue-500" />
                </div>
              </div>
            </div>
            
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-2">
              Team Member Portal
            </CardTitle>
            <p className="text-muted-foreground">
              Access the Mediqzy healthcare team system
            </p>

            {/* Decorative elements */}
            <div className="absolute -top-8 -right-8 opacity-[0.02] pointer-events-none">
              <Plus className="w-32 h-32 text-purple-500 rotate-12" />
            </div>
          </CardHeader>

          <CardContent className="relative space-y-6">
            {error && (
              <Alert variant="destructive" className="animate-in slide-in-from-top-2 duration-300 border-red-200 bg-red-50" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email Field with gradient styling */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Work Email
                </Label>
                <div className="relative">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    placeholder="john.doe@company.com"
                    className="h-12 pl-12 bg-background/50 border-border/50 focus:border-purple-500/50 focus:ring-purple-500/20 transition-all duration-300"
                    disabled={loading}
                  />
                  <Users className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={handleChange}
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
                  <Link
                    to="/forgot-password?type=team"
                    className="text-xs text-purple-600 hover:text-purple-700 hover:underline transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              {/* Submit Button with gradient */}
              <Button
                type="submit"
                className="
                  w-full h-12 
                  bg-gradient-to-r from-purple-500 to-blue-500 
                  hover:from-purple-600 hover:to-blue-600 
                  text-white font-medium 
                  transition-all duration-300 
                  transform hover:scale-[1.02] 
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                  shadow-lg hover:shadow-xl
                "
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
                    Access Team Portal
                  </div>
                )}
              </Button>
              
            </form>

            {/* Help Links */}
            <div className="text-center space-y-4">
              <div className="text-sm text-muted-foreground">
                Need help accessing your account?
              </div>
              <div className="flex items-center justify-center gap-4 text-xs">
                <Link
                  to="/nurse/login"
                  className="text-purple-600 hover:text-purple-700 hover:underline transition-colors flex items-center gap-1"
                >
                  <Activity className="h-3 w-3" />
                  Nurse Login
                </Link>
                <span className="text-muted-foreground">•</span>
                <Link
                  to="/doctor-login"
                  className="text-green-600 hover:text-green-700 hover:underline transition-colors flex items-center gap-1"
                >
                  <Activity className="h-3 w-3" />
                  Doctor Login
                </Link>
              </div>
            </div>
            <div className="text-center text-xs text-muted-foreground">
              Trouble signing in?{' '}
              <a
                href="mailto:support@mediczy.com?subject=Team%20Portal%20Login%20Help"
                className="font-semibold underline underline-offset-2 hover:text-purple-600"
              >
                Contact support
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Footer Info with gradient */}
        <div className="text-center mt-6 space-y-2">
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            <span>Mediqzy Healthcare Management System</span>
          </div>
          <p className="text-xs text-muted-foreground">
            For team members and healthcare staff only
          </p>
        </div>
      </div>

      {/* Background decorative elements */}
      <div className="absolute -bottom-16 -left-16 opacity-[0.01] pointer-events-none">
        <Plus className="w-64 h-64 text-purple-500 -rotate-12" />
      </div>
      <div className="absolute -top-16 -right-16 opacity-[0.01] pointer-events-none">
        <Plus className="w-64 h-64 text-blue-500 rotate-12" />
      </div>
    </div>
  );
};

export default TeamLogin;
