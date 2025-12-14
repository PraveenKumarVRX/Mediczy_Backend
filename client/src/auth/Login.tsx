import { useCallback, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { 
  Eye, 
  EyeOff, 
  HeartPulse, 
  Stethoscope, 
  Building2, 
  FlaskConical, 
  Pill, 
  Ambulance, 
  Home, 
  Building,
  UserCog,
  Chrome,
  Facebook
} from "lucide-react";
import "../index.css";
import { useLogin } from "../hooks/auth"; // Import useLogin hook
import { initializeFirebaseMessaging } from "@/lib/firebase-config";

const formSchema = z.object({
  email: z.string().email("Must be a valid email"),
  password: z.string().min(1, "Password is required"),
});

const Login = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check if already authenticated
  useEffect(() => {
    // Clear any other role tokens that might interfere
    localStorage.removeItem('adminToken');
    localStorage.removeItem('teamToken');
    localStorage.removeItem('nurseToken');
    localStorage.removeItem('assistantToken');
    localStorage.removeItem('corporateToken');
    localStorage.removeItem('doctorToken');
    localStorage.removeItem('userType');

    const token = localStorage.getItem('token');
    if (token) {
      console.log('✅ User already authenticated, redirecting...');
      navigate('/dashboard');
      return;
    }

    setIsCheckingAuth(false);
  }, [navigate]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useLogin();

  // Handle OAuth2 Login
  const handleOAuthLogin = (provider: 'google' | 'facebook') => {
    const baseUrl =
      import.meta.env.VITE_API_BASE_URL ||
      (import.meta.env.VITE_API_URL
        ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
        : window.location.origin);
    window.location.href = `${baseUrl}/api/auth/${provider}`;
  };

  const onSubmit = (values: { email: string; password: string }) => {
    // Dev bypass for testing
    const emailLower = values.email.toLowerCase().trim();
    if (emailLower === 'user@mediczy.com' && values.password === 'User123') {
      console.log('🚀 User: Using quick authentication bypass');
      
      const devToken = 'dev-user-token';
      
      localStorage.setItem('token', devToken);
      localStorage.setItem('userType', 'user');
      localStorage.setItem('userId', '1');
      localStorage.setItem('userData', JSON.stringify({
        id: 1,
        email: 'user@mediczy.com',
        firstName: 'Demo',
        lastName: 'User',
        phone: '+91 9876543210'
      }));
      
      toast({
        title: "Success",
        description: "Logged in successfully. Redirecting...",
      });
      
      // Dispatch auth change event
      window.dispatchEvent(new Event('authChange'));
      
      navigate("/", { replace: true });
      return;
    }

    loginMutation.mutate(
      { credentials: values, loginType: "user" },
      {
        onSuccess: () => {
          toast({
            title: "Success",
            description: "Logged in successfully. Redirecting...",
          });
          
          // Initialize Firebase messaging after successful login
          initializeFirebaseMessaging().catch(err => {
            console.log('Firebase messaging initialization skipped:', err.message);
          });
          
          // Dispatch auth change event for same-tab updates
          window.dispatchEvent(new Event('authChange'));
          
          // Navigate immediately - AuthProvider will handle the rest
          navigate("/", { replace: true });
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Error",
            description:
              (error as any)?.response?.data.message || "Login failed",
          });
        },
      }
    );
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
    <div className="container relative min-h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      {/* Left Side with Background */}
      <div
        style={{ backgroundImage: `url("../../aiH.jpg")` }}
        className="relative hidden h-full bg-cover bg-center flex-col bg-muted p-10 text-white dark:border-r lg:flex"
      >
        <div
          className="relative z-20 flex items-center gap-2 text-lg font-bold primary-grad cursor-pointer"
          role="button"
          tabIndex={0}
          onClick={() => navigate("/")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              navigate("/");
            }
          }}
          aria-label="Go to patient dashboard"
          title="Go to dashboard"
        >
          <HeartPulse className="h-6 w-6" />
          Mediqzy
        </div>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg">
              "This healthcare platform has revolutionized how I manage my
              health and wellness journey."
            </p>
            <footer className="text-sm">Sofia Davis</footer>
          </blockquote>
        </div>
      </div>

      {/* Right Side Login Form */}
      <div className="p-4 lg:p-8 h-full flex items-center">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          {/* Header */}
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              Welcome Back
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your credentials to sign in to your account.
            </p>
          </div>

          {/* Login Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Email Field */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="name@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Password Field */}
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          className="placeholder:text-gray-300"
                          {...field}
                          autoComplete="current-password"
                        />
                      </FormControl>
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 transform -translate-y-1/2"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Signing in..." : "Sign in"}
              </Button>

              {/* OAuth2 Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-muted-foreground dark:bg-slate-950">
                    Or continue with
                  </span>
                </div>
              </div>

              {/* OAuth2 Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOAuthLogin('google')}
                  className="w-full"
                >
                  <Chrome className="h-4 w-4 mr-2" />
                  Google
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOAuthLogin('facebook')}
                  className="w-full"
                >
                  <Facebook className="h-4 w-4 mr-2" />
                  Facebook
                </Button>
              </div>
            </form>
          </Form>

          {/* Sign-Up Link */}
          <div className="text-center text-sm text-muted-foreground">
            Don't have an account?
            <Link
              to="/register"
              className="underline underline-offset-4 hover:text-primary ml-1"
            >
              Sign up
            </Link>
          </div>

          {/* Portal Login Links */}
          <div className="pt-6 border-t">
            <p className="text-center text-xs text-muted-foreground mb-4">
              Are you a healthcare provider or partner?
            </p>
            <div className="grid grid-cols-4 gap-2">
              <Link 
                to="/doctor/login" 
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 dark:from-blue-950 dark:to-blue-900 dark:hover:from-blue-900 dark:hover:to-blue-800 transition-all duration-200 group"
              >
                <Stethoscope className="h-5 w-5 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-medium text-blue-700 dark:text-blue-300">Doctor</span>
              </Link>
              <Link 
                to="/hospital/login" 
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-200 dark:from-purple-950 dark:to-purple-900 dark:hover:from-purple-900 dark:hover:to-purple-800 transition-all duration-200 group"
              >
                <Building2 className="h-5 w-5 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-medium text-purple-700 dark:text-purple-300">Hospital</span>
              </Link>
              <Link 
                to="/clinic/login" 
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-pink-50 to-pink-100 hover:from-pink-100 hover:to-pink-200 dark:from-pink-950 dark:to-pink-900 dark:hover:from-pink-900 dark:hover:to-pink-800 transition-all duration-200 group"
              >
                <Building className="h-5 w-5 text-pink-600 dark:text-pink-400 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-medium text-pink-700 dark:text-pink-300">Clinic</span>
              </Link>
              <Link 
                to="/lab/login" 
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 hover:from-emerald-100 hover:to-emerald-200 dark:from-emerald-950 dark:to-emerald-900 dark:hover:from-emerald-900 dark:hover:to-emerald-800 transition-all duration-200 group"
              >
                <FlaskConical className="h-5 w-5 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">Lab</span>
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-2">
              <Link 
                to="/pharmacy/login" 
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-teal-50 to-teal-100 hover:from-teal-100 hover:to-teal-200 dark:from-teal-950 dark:to-teal-900 dark:hover:from-teal-900 dark:hover:to-teal-800 transition-all duration-200 group"
              >
                <Pill className="h-5 w-5 text-teal-600 dark:text-teal-400 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-medium text-teal-700 dark:text-teal-300">Pharmacy</span>
              </Link>
              <Link 
                to="/ambulance/login" 
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-red-50 to-red-100 hover:from-red-100 hover:to-red-200 dark:from-red-950 dark:to-red-900 dark:hover:from-red-900 dark:hover:to-red-800 transition-all duration-200 group"
              >
                <Ambulance className="h-5 w-5 text-red-600 dark:text-red-400 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-medium text-red-700 dark:text-red-300">Ambulance</span>
              </Link>
              <Link 
                to="/homecare/login" 
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100 hover:from-amber-100 hover:to-amber-200 dark:from-amber-950 dark:to-amber-900 dark:hover:from-amber-900 dark:hover:to-amber-800 transition-all duration-200 group"
              >
                <Home className="h-5 w-5 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">Homecare</span>
              </Link>
              <Link 
                to="/corporate/login" 
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 hover:from-slate-100 hover:to-slate-200 dark:from-slate-800 dark:to-slate-700 dark:hover:from-slate-700 dark:hover:to-slate-600 transition-all duration-200 group"
              >
                <UserCog className="h-5 w-5 text-slate-600 dark:text-slate-400 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300">Corporate</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
