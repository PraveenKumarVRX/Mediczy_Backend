import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  UserCog, 
  Eye, 
  EyeOff, 
  HeartPulse, 
  ArrowLeft,
  Activity,
  Calendar
} from 'lucide-react';
import api from '@/utils/api';

const AssistantLogin = () => {
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
    // Clear any other role tokens that might interfere
    localStorage.removeItem('adminToken');
    localStorage.removeItem('teamToken');
    localStorage.removeItem('nurseToken');
    localStorage.removeItem('corporateToken');
    localStorage.removeItem('doctorToken');
    localStorage.removeItem('token');
    localStorage.removeItem('userType');

    const token = localStorage.getItem('assistantToken');
    if (token) {
      console.log('✅ Assistant already authenticated, redirecting...');
      navigate('/assistant/dashboard');
      return;
    }

    // Development mode: Auto-fill test credentials
    if (import.meta.env.DEV) {
      setFormData({
        email: 'assistant@mediczy.com',
        password: 'AssistantPass123'
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data } = await api.post('/assistant/login', formData);
      
      if (data.success && data.token && data.assistant) {
        localStorage.setItem('assistantToken', data.token);
        localStorage.setItem('assistantData', JSON.stringify(data.assistant));
        navigate('/assistant/dashboard');
      } else {
        setError('Invalid login response from server');
      }
    } catch (err: any) {
      console.error('Assistant login error:', err);
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back to Home */}
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <Card className="shadow-2xl border-t-4 border-t-purple-500">
          <CardHeader className="space-y-4 pb-6">
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-purple-500 rounded-full blur-xl opacity-30 animate-pulse"></div>
                <div className="relative bg-gradient-to-br from-purple-500 to-pink-500 p-4 rounded-full">
                  <UserCog className="h-10 w-10 text-white" />
                </div>
              </div>
            </div>
            <div className="text-center space-y-2">
              <CardTitle className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                Assistant Portal
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Medical Secretary & Doctor Assistant Access
              </p>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {error && (
              <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
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
                  placeholder="assistant@clinic.com"
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-11 px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-11 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium shadow-lg hover:shadow-xl transition-all"
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
            <div className="mt-6 p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                    Assistant Portal Features
                  </p>
                  <ul className="text-xs text-purple-700 dark:text-purple-300 space-y-1">
                    <li>• Appointment scheduling & management</li>
                    <li>• Doctor's calendar coordination</li>
                    <li>• Patient communication handling</li>
                    <li>• Document & report management</li>
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
                  onClick={() => navigate('/nurse/login')}
                >
                  Nurse
                </Button>
              </div>
            </div>
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

export default AssistantLogin;
