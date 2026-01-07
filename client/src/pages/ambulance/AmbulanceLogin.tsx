import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Ambulance, Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import api from '@/utils/api';

const AmbulanceLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Check if already authenticated
  useEffect(() => {
    // Clear any other role tokens that might interfere
    localStorage.removeItem('adminToken');
    localStorage.removeItem('teamToken');
    localStorage.removeItem('nurseToken');
    localStorage.removeItem('assistantToken');
    localStorage.removeItem('corporateToken');
    localStorage.removeItem('doctorToken');
    localStorage.removeItem('token');
    localStorage.removeItem('userType');

    const token = localStorage.getItem('ambulanceToken');
    if (token) {
      console.log('✅ Ambulance already authenticated, redirecting...');
      navigate('/ambulance/dashboard');
      return;
    }

    setIsCheckingAuth(false);
  }, [navigate]);

  // Dev credentials
  const DEV_EMAIL = "ambulance@mediczy.com";
  const DEV_PASSWORD = "Ambulance123";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Development mode bypass - allows login without backend (DEV only)
    if (import.meta.env.DEV && email === DEV_EMAIL && password === DEV_PASSWORD) {
      console.log('🚀 Development mode: Using quick authentication bypass for Ambulance');
      
      // Clear all other tokens for ring-fencing
      const otherTokens = [
        'token', 'doctorToken', 'adminToken', 'teamToken', 
        'nurseToken', 'assistantToken', 'corporateToken',
        'hospitalToken', 'clinicToken', 'labToken', 'pharmacyToken', 'homecareToken'
      ];
      otherTokens.forEach(token => localStorage.removeItem(token));

      localStorage.setItem('ambulanceToken', 'dev-ambulance-token');
      localStorage.setItem('ambulanceData', JSON.stringify({
        id: 'ambulance_dev',
        email: DEV_EMAIL,
        name: 'Sample Ambulance Service',
        type: 'Emergency Medical Services',
        vehicles: 5,
        status: 'active'
      }));

      toast({
        title: "Login Successful",
        description: "Welcome back, Sample Ambulance Service!",
      });

      setIsLoading(false);
      navigate("/ambulance/dashboard");
      return;
    }

    try {
      const { data } = await api.post('/ambulance/login', { email, password }, { skipAuth: true });

      if (data.token) {
        // Store ambulance token and data
        localStorage.setItem("ambulanceToken", data.token);
        localStorage.setItem("ambulanceData", JSON.stringify(data.ambulance));

        // Clear all other tokens for ring-fencing
        const otherTokens = [
          'token', 'doctorToken', 'adminToken', 'teamToken', 
          'nurseToken', 'assistantToken', 'corporateToken',
          'hospitalToken', 'clinicToken', 'labToken', 'pharmacyToken', 'homecareToken'
        ];
        otherTokens.forEach(token => localStorage.removeItem(token));

        toast({
          title: "Login Successful",
          description: `Welcome back, ${data.ambulance?.name || 'Ambulance Provider'}!`,
        });

        navigate("/ambulance/dashboard");
      } else {
        toast({
          title: "Login Failed",
          description: data.message || "Invalid credentials",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Login error:", error);
      toast({
        title: "Error",
        description: error?.response?.data?.message || "Unable to connect to server. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 dark:from-red-950 dark:via-orange-950 dark:to-yellow-950 p-4">
      <Card className="w-full max-w-md shadow-2xl border-2 border-red-200 dark:border-red-800">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-red-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Ambulance className="h-12 w-12 text-white" />
          </div>
          <div>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">
              Ambulance Portal
            </CardTitle>
            <CardDescription className="text-base mt-2">
              Emergency Medical Services Login
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="ambulance@mediczy.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 border-red-200 focus:border-red-500 focus:ring-red-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 pr-10 border-red-200 focus:border-red-500 focus:ring-red-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-semibold shadow-lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Signing In...
                </>
              ) : (
                <>
                  <Ambulance className="mr-2 h-5 w-5" />
                  Sign In
                </>
              )}
            </Button>

            <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-red-900 dark:text-red-100">
                    Development Credentials
                  </p>
                  <p className="text-red-700 dark:text-red-300">
                    Email: {DEV_EMAIL}
                  </p>
                  <p className="text-red-700 dark:text-red-300">
                    Password: {DEV_PASSWORD}
                  </p>
                </div>
              </div>
            </div>
          </form>

          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Need assistance?{" "}
              <a href="#" className="text-red-600 hover:text-red-700 font-medium">
                Contact Support
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AmbulanceLogin;
