import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import api from '@/utils/api';

const HomecareLogin = () => {
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

    const token = localStorage.getItem('homecareToken');
    if (token) {
      console.log('✅ Homecare already authenticated, redirecting...');
      navigate('/homecare/dashboard');
      return;
    }

    setIsCheckingAuth(false);
  }, [navigate]);

  // Dev credentials
  const DEV_EMAIL = "homecare@mediczy.com";
  const DEV_PASSWORD = "Homecare123";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Development mode bypass - allows login without backend (DEV only)
    if (import.meta.env.DEV && email === DEV_EMAIL && password === DEV_PASSWORD) {
      console.log('🚀 Development mode: Using quick authentication bypass for Homecare');
      
      // Clear all other tokens for ring-fencing
      const otherTokens = [
        'token', 'doctorToken', 'adminToken', 'teamToken', 
        'nurseToken', 'assistantToken', 'corporateToken',
        'hospitalToken', 'clinicToken', 'labToken', 'pharmacyToken', 'ambulanceToken'
      ];
      otherTokens.forEach(token => localStorage.removeItem(token));

      localStorage.setItem('homecareToken', 'dev-homecare-token');
      localStorage.setItem('homecareData', JSON.stringify({
        id: 'homecare_dev',
        email: DEV_EMAIL,
        name: 'Sample Homecare Services',
        type: 'Home Healthcare Provider',
        services: ['Nursing', 'Physiotherapy', 'Elder Care', 'Post-Surgery Care'],
        status: 'active'
      }));

      toast({
        title: "Login Successful",
        description: "Welcome back, Sample Homecare Services!",
      });

      setIsLoading(false);
      navigate("/homecare/dashboard");
      return;
    }

    try {
      const { data } = await api.post('/homecare/login', { email, password }, { skipAuth: true });

      if (data.token) {
        // Store homecare token and data
        localStorage.setItem("homecareToken", data.token);
        localStorage.setItem("homecareData", JSON.stringify(data.homecare));

        // Clear all other tokens for ring-fencing
        const otherTokens = [
          'token', 'doctorToken', 'adminToken', 'teamToken', 
          'nurseToken', 'assistantToken', 'corporateToken',
          'hospitalToken', 'clinicToken', 'labToken', 'pharmacyToken', 'ambulanceToken'
        ];
        otherTokens.forEach(token => localStorage.removeItem(token));

        toast({
          title: "Login Successful",
          description: `Welcome back, ${data.homecare?.name || 'Homecare Provider'}!`,
        });

        navigate("/homecare/dashboard");
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 dark:from-purple-950 dark:via-pink-950 dark:to-rose-950 p-4">
      <Card className="w-full max-w-md shadow-2xl border-2 border-purple-200 dark:border-purple-800">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Home className="h-12 w-12 text-white" />
          </div>
          <div>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Homecare Portal
            </CardTitle>
            <CardDescription className="text-base mt-2">
              Home Healthcare Services Login
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
                placeholder="homecare@mediczy.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 border-purple-200 focus:border-purple-500 focus:ring-purple-500"
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
                  className="h-11 pr-10 border-purple-200 focus:border-purple-500 focus:ring-purple-500"
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
              className="w-full h-11 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold shadow-lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Signing In...
                </>
              ) : (
                <>
                  <Home className="mr-2 h-5 w-5" />
                  Sign In
                </>
              )}
            </Button>

            <div className="mt-6 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-purple-900 dark:text-purple-100">
                    Development Credentials
                  </p>
                  <p className="text-purple-700 dark:text-purple-300">
                    Email: {DEV_EMAIL}
                  </p>
                  <p className="text-purple-700 dark:text-purple-300">
                    Password: {DEV_PASSWORD}
                  </p>
                </div>
              </div>
            </div>
          </form>

          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Need assistance?{" "}
              <a href="#" className="text-purple-600 hover:text-purple-700 font-medium">
                Contact Support
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default HomecareLogin;
