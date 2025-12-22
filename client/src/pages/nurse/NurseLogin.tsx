import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Heart, 
  Eye, 
  EyeOff, 
  HeartPulse, 
  ArrowLeft,
  Activity,
  Stethoscope
} from 'lucide-react';
import api from '@/utils/api';
import { clearAuthTokens } from '@/hooks/auth';

const NurseLogin = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check if already authenticated and setup dev credentials
  useEffect(() => {
    const token = localStorage.getItem('nurseToken');
    if (token) {
      console.log('✅ Nurse already authenticated, redirecting...');
      navigate('/nurse/dashboard');
      return;
    }

    // Development mode: Auto-fill test credentials
    if (import.meta.env.DEV) {
      setFormData({
        email: 'nurse@mediczy.com',
        password: 'Nurse123'
      });
    }

    setIsCheckingAuth(false);
  }, [navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
    if (error) setError('');
  };

  const establishNurseSession = (token: string, nurseProfile?: any) => {
    clearAuthTokens();
    localStorage.setItem('nurseToken', token);
    localStorage.setItem('token', token);
    localStorage.setItem('userType', 'nurse');
    if (nurseProfile) {
      localStorage.setItem('nurseData', JSON.stringify({
        id: nurseProfile.id,
        email: nurseProfile.email,
        firstName: nurseProfile.firstName,
        lastName: nurseProfile.lastName,
        department: nurseProfile.department,
        shift: nurseProfile.shift,
        assignedWard: nurseProfile.assignedWard,
      }));
    } else {
      localStorage.removeItem('nurseData');
    }
    window.dispatchEvent(new Event('authChange'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    console.log('[NurseLogin] Submitting credentials', { email: formData.email, ts: Date.now() });

    // Development mode bypass - allows login without backend
    if (
      import.meta.env.DEV &&
      formData.email === 'nurse@mediczy.com' &&
      formData.password === 'Nurse123'
    ) {
      console.log('🚀 Development mode: Using quick authentication bypass for Nurse');
      establishNurseSession('dev-nurse-token', {
        id: 'nurse_dev',
        email: 'nurse@mediczy.com',
        firstName: 'Sample',
        lastName: 'Nurse',
        department: 'General Ward',
        shift: 'Morning',
        assignedWard: 'General Ward'
      });
      setLoading(false);
      navigate('/nurse/dashboard', { replace: true });
      return;
    }

    try {
      console.log('[NurseLogin] POST /nurse/login start with body', formData);
      const { data } = await api.post('/nurse/login', formData, { skipAuth: true });
      console.log('[NurseLogin] POST /nurse/login response', data);
      
      if (data.success && data.token && data.nurse) {
        establishNurseSession(data.token, data.nurse);
        console.log('[NurseLogin] Token stored, navigating to dashboard');
        navigate('/nurse/dashboard', { replace: true });
      } else {
        console.warn('[NurseLogin] Unexpected response shape', data);
        setError('Invalid login response from server');
      }
    } catch (err: any) {
      console.error('Nurse login error:', err);
      console.log('[NurseLogin] Error object keys', Object.keys(err || {}));
      if (err.response?.status === 401) {
        setError('Invalid email or password');
      } else if (err.response?.status === 403) {
        setError('Your account is inactive or login access is disabled');
      } else if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError('Unable to connect to server. Please try again.');
      }
    } finally {
      console.log('[NurseLogin] Submit flow finished');
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back to Home */}
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <Card className="shadow-2xl border-t-4 border-t-blue-500">
          <CardHeader className="space-y-4 pb-6">
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500 rounded-full blur-xl opacity-30 animate-pulse"></div>
                <div className="relative bg-gradient-to-br from-blue-500 to-green-500 p-4 rounded-full">
                  <Heart className="h-10 w-10 text-white" />
                </div>
              </div>
            </div>
            <div className="text-center space-y-2">
              <CardTitle className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">
                Nurse Portal
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Healthcare Professional Access
              </p>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {error && (
              <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email Address
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="nurse@hospital.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="h-11"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    className="h-11 pr-10"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-11 bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white font-medium shadow-lg hover:shadow-xl transition-all"
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 animate-spin" />
                    Signing in...
                  </div>
                ) : (
                  <>Sign In</>
                )}
              </Button>
            </form>

            {/* Info Box */}
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <Stethoscope className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Nurse Portal Features
                  </p>
                  <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                    <li>• Patient vital signs monitoring</li>
                    <li>• Medication administration tracking</li>
                    <li>• Shift schedule management</li>
                    <li>• Emergency response coordination</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Other Login Options */}
            <div className="pt-4 border-t">
              <p className="text-sm text-center text-muted-foreground mb-3">
                Other staff portals
              </p>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1 h-9 text-xs"
                  onClick={() => navigate('/team/login')}
                >
                  Team Member
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1 h-9 text-xs"
                  onClick={() => navigate('/assistant/login')}
                >
                  Assistant
                </Button>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Trouble signing in?{' '}
              <a
                href="mailto:support@mediczy.com?subject=Nurse%20Portal%20Login%20Help"
                className="font-semibold underline underline-offset-2 hover:text-blue-600"
              >
                Contact support
              </a>
            </p>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          <HeartPulse className="h-3 w-3 inline mr-1" />
          Mediqzy Healthcare Management System
        </p>
      </div>
    </div>
  );
};

export default NurseLogin;
