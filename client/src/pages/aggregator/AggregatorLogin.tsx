import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Shield, Building } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';

const AggregatorLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    brokerName: '',
    contactPersonName: '',
    email: '',
    password: '',
    confirmPassword: '',
    officeAddress: '',
    city: '',
    state: '',
    pincode: '',
    panNumber: '',
    gstin: '',
    phoneNumber: '',
  });

  // Check if already logged in
  useEffect(() => {
    const token = localStorage.getItem('aggregatorToken');
    if (token) {
      navigate('/aggregator/dashboard');
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!email || !password) {
      toast.error('Please enter email and password');
      setLoading(false);
      return;
    }

    try {
      const response = await api.post('/aggregator-auth/login', {
        email,
        password,
      });

      if (response.data?.success && response.data?.token) {
        localStorage.setItem('aggregatorToken', response.data.token);
        localStorage.setItem('aggregatorData', JSON.stringify(response.data.aggregator));
        localStorage.setItem('userType', 'aggregator');
        toast.success('Login successful!');
        navigate('/aggregator/dashboard');
      } else {
        toast.error(response.data?.message || 'Login failed');
      }
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.message || 'An error occurred during login';
      toast.error(errorMessage);
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validation
    if (!registerForm.email || !registerForm.password) {
      toast.error('Email and password are required');
      setLoading(false);
      return;
    }

    if (registerForm.password !== registerForm.confirmPassword) {
      toast.error('Passwords do not match');
      setLoading(false);
      return;
    }

    if (registerForm.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    try {
      const response = await api.post('/aggregator-auth/register', {
        brokerName: registerForm.brokerName,
        contactPersonName: registerForm.contactPersonName,
        email: registerForm.email,
        password: registerForm.password,
        phoneNumber: registerForm.phoneNumber,
        officeAddress: registerForm.officeAddress,
        city: registerForm.city,
        state: registerForm.state,
        pincode: registerForm.pincode,
        panNumber: registerForm.panNumber,
        gstin: registerForm.gstin,
        businessType: 'aggregator',
      });

      if (response.data?.success && response.data?.token) {
        localStorage.setItem('aggregatorToken', response.data.token);
        localStorage.setItem('aggregatorData', JSON.stringify(response.data.aggregator));
        localStorage.setItem('userType', 'aggregator');
        toast.success('Registration successful! Your account is pending verification.');
        navigate('/aggregator/dashboard');
      } else {
        toast.error(response.data?.message || 'Registration failed');
      }
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.message || 'An error occurred during registration';
      toast.error(errorMessage);
      console.error('Registration error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl"></div>

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 mb-4">
            {isRegister ? (
              <Building className="w-8 h-8 text-white" />
            ) : (
              <Shield className="w-8 h-8 text-white" />
            )}
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Mediczy</h1>
          <p className="text-slate-400">{isRegister ? 'Register your organization' : 'Aggregator Portal'}</p>
        </div>

        {/* Card */}
        <Card className="border-slate-700 bg-slate-900/80 backdrop-blur-sm shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl text-white">
              {isRegister ? 'Create Organization Account' : 'Welcome Back'}
            </CardTitle>
            <CardDescription className="text-slate-400">
              {isRegister
                ? 'Register your aggregator organization'
                : 'Sign in to your aggregator portal'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* Login Form */}
            {!isRegister ? (
              <form onSubmit={handleLogin} className="space-y-4">
                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-300">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@organization.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                  />
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-300">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium h-10"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>

                {/* Register Link */}
                <div className="text-center pt-2">
                  <p className="text-slate-400 text-sm">
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={() => setIsRegister(true)}
                      className="text-blue-400 hover:text-blue-300 font-medium"
                    >
                      Register here
                    </button>
                  </p>
                </div>
              </form>
            ) : (
              /* Registration Form */
              <form onSubmit={handleRegister} className="space-y-3 max-h-96 overflow-y-auto">
                {/* Organization Name */}
                <div className="space-y-1">
                  <Label htmlFor="brokerName" className="text-slate-300 text-xs">
                    Organization Name
                  </Label>
                  <Input
                    id="brokerName"
                    type="text"
                    placeholder="e.g., Mayden"
                    value={registerForm.brokerName}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, brokerName: e.target.value })
                    }
                    disabled={loading}
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                  />
                </div>

                {/* Contact Person */}
                <div className="space-y-1">
                  <Label htmlFor="contactPersonName" className="text-slate-300 text-xs">
                    Contact Person Name
                  </Label>
                  <Input
                    id="contactPersonName"
                    type="text"
                    placeholder="Full name"
                    value={registerForm.contactPersonName}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, contactPersonName: e.target.value })
                    }
                    disabled={loading}
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                  />
                </div>

                {/* Email */}
                <div className="space-y-1">
                  <Label htmlFor="regEmail" className="text-slate-300 text-xs">
                    Email Address
                  </Label>
                  <Input
                    id="regEmail"
                    type="email"
                    placeholder="email@organization.com"
                    value={registerForm.email}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, email: e.target.value })
                    }
                    disabled={loading}
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-1">
                  <Label htmlFor="phoneNumber" className="text-slate-300 text-xs">
                    Phone Number
                  </Label>
                  <Input
                    id="phoneNumber"
                    type="tel"
                    placeholder="10-digit number"
                    value={registerForm.phoneNumber}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, phoneNumber: e.target.value })
                    }
                    disabled={loading}
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                  />
                </div>

                {/* Office Address */}
                <div className="space-y-1">
                  <Label htmlFor="officeAddress" className="text-slate-300 text-xs">
                    Office Address
                  </Label>
                  <Input
                    id="officeAddress"
                    type="text"
                    placeholder="Full address"
                    value={registerForm.officeAddress}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, officeAddress: e.target.value })
                    }
                    disabled={loading}
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                  />
                </div>

                {/* City, State, Pincode */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="city" className="text-slate-300 text-xs">
                      City
                    </Label>
                    <Input
                      id="city"
                      type="text"
                      placeholder="City"
                      value={registerForm.city}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, city: e.target.value })
                      }
                      disabled={loading}
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="state" className="text-slate-300 text-xs">
                      State
                    </Label>
                    <Input
                      id="state"
                      type="text"
                      placeholder="State"
                      value={registerForm.state}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, state: e.target.value })
                      }
                      disabled={loading}
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pincode" className="text-slate-300 text-xs">
                      Pincode
                    </Label>
                    <Input
                      id="pincode"
                      type="text"
                      placeholder="Pincode"
                      value={registerForm.pincode}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, pincode: e.target.value })
                      }
                      disabled={loading}
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                    />
                  </div>
                </div>

                {/* PAN and GSTIN */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="panNumber" className="text-slate-300 text-xs">
                      PAN Number
                    </Label>
                    <Input
                      id="panNumber"
                      type="text"
                      placeholder="PAN"
                      value={registerForm.panNumber}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, panNumber: e.target.value })
                      }
                      disabled={loading}
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="gstin" className="text-slate-300 text-xs">
                      GSTIN
                    </Label>
                    <Input
                      id="gstin"
                      type="text"
                      placeholder="GSTIN"
                      value={registerForm.gstin}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, gstin: e.target.value })
                      }
                      disabled={loading}
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1">
                  <Label htmlFor="regPassword" className="text-slate-300 text-xs">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="regPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min 8 characters"
                      value={registerForm.password}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, password: e.target.value })
                      }
                      disabled={loading}
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="space-y-1">
                  <Label htmlFor="confirmPassword" className="text-slate-300 text-xs">
                    Confirm Password
                  </Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Confirm password"
                    value={registerForm.confirmPassword}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, confirmPassword: e.target.value })
                    }
                    disabled={loading}
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                  />
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium h-10 mt-4"
                >
                  {loading ? 'Creating account...' : 'Create Account'}
                </Button>

                {/* Back to Login */}
                <div className="text-center pt-2">
                  <p className="text-slate-400 text-sm">
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => setIsRegister(false)}
                      className="text-blue-400 hover:text-blue-300 font-medium"
                    >
                      Sign in
                    </button>
                  </p>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-slate-500 text-sm mt-6">
          For support, contact <span className="text-blue-400">support@mediczy.com</span>
        </p>
      </div>
    </div>
  );
};

export default AggregatorLogin;
