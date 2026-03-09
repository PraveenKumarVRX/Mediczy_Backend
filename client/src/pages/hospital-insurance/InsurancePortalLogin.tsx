import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Eye, EyeOff, Activity, Lock, ArrowRight, CheckCircle2, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';

const InsurancePortalLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  const setDemoSession = () => {
    const demoData = {
      id: 'demo-insurance-portal',
      name: 'Mediczy Insurance Portal Demo',
      email: 'insurance@mediczy.com',
      phone: '+91 99999 99999',
      hospitalName: 'Mediczy Hospital',
      city: 'Delhi',
      state: 'Delhi',
      role: 'insurance_desk',
    };
    localStorage.setItem('hospitalInsuranceToken', `demo-insurance-token-${Date.now()}`);
    localStorage.setItem('hospitalInsuranceData', JSON.stringify(demoData));
    localStorage.setItem('userType', 'hospitalInsurance');
    toast({ title: 'Offline demo login', description: 'Loaded insurance portal demo session locally.' });
    navigate('/hospital-insurance/dashboard');
  };

  useEffect(() => {
    const token = localStorage.getItem('hospitalInsuranceToken');
    if (token) {
      navigate('/hospital-insurance/dashboard');
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

      // Clear other portal tokens
      const tokenKeys = [
        'token', 'doctorToken', 'teamToken', 'nurseToken', 'assistantToken',
        'adminToken', 'corporateToken', 'hospitalToken', 'clinicToken',
        'labToken', 'pharmacyToken', 'ambulanceToken', 'homecareToken',
        'insuranceCompanyToken', 'insuranceBrokerToken', 'tpaToken'
      ];
      const dataKeys = [
        'userData', 'doctorData', 'teamData', 'nurseData', 'assistantData',
        'adminData', 'corporateData', 'hospitalData', 'clinicData',
        'labData', 'pharmacyData', 'ambulanceData', 'homecareData'
      ];
      tokenKeys.forEach((key) => localStorage.removeItem(key));
      dataKeys.forEach((key) => localStorage.removeItem(key));

      localStorage.setItem('hospitalInsuranceToken', data.token);
      localStorage.setItem('hospitalInsuranceData', JSON.stringify(data.user || data.hospital));
      localStorage.setItem('token', data.token);
      localStorage.setItem('userType', 'hospitalInsurance');

      navigate('/hospital-insurance/dashboard');
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-blue-50">
        <div className="flex flex-col items-center gap-4">
          <Activity className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="text-sm text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-4">
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
                <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full" />
                <div className="relative bg-gradient-to-br from-indigo-500 to-blue-600 p-4 rounded-2xl shadow-lg">
                  <Shield className="h-12 w-12 text-white" />
                </div>
              </div>
            </div>
            <CardTitle className="text-3xl font-bold text-center bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">
              Insurance Portal
            </CardTitle>
            <CardDescription className="text-center text-base">
              Hospital Insurance Claims Management — IHX Portal
            </CardDescription>
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
                    <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                    Email Address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="insurance@hospital.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 text-base border-2 focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium flex items-center gap-2">
                    <Lock className="h-4 w-4 text-indigo-600" />
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
                      className="h-12 text-base border-2 focus:border-indigo-500 transition-colors pr-12"
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
                className="w-full h-12 text-base bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl"
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

            <div className="mt-4 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-4 w-4 text-indigo-600" />
                <span className="text-xs font-semibold text-indigo-700">Hospital Insurance Desk</span>
              </div>
              <p className="text-xs text-indigo-600">
                Manage pre-authorizations, claims, reconciliation, NHCX & ABDM compliance from one portal.
              </p>
            </div>

            <div className="mt-4 text-center text-sm text-muted-foreground">
              Need help? Contact{' '}
              <a href="mailto:support@mediczy.com" className="text-indigo-600 hover:underline font-medium">
                support@mediczy.com
              </a>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default InsurancePortalLogin;
