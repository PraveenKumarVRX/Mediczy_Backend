import { useState, useEffect } from "react";
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
import { Eye, EyeOff, HeartPulse, Stethoscope } from "lucide-react";
import { Chrome, Facebook } from "lucide-react";
import "../index.css";
import { useLogin, clearAuthTokens } from "@/hooks/auth";
import { initializeFirebaseMessaging } from "@/lib/firebase-config";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
    : (typeof window !== 'undefined' ? window.location.origin : ''));

const formSchema = z.object({
  email: z.string().email("Must be a valid email"),
  password: z.string().min(1, "Password is required"),
});

const DoctorLogin = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check if already authenticated
  useEffect(() => {
    const token = localStorage.getItem('doctorToken');
    if (token) {
      console.log('✅ Doctor already authenticated, redirecting...');
      navigate('/doctor/dashboard');
      return;
    }

    setIsCheckingAuth(false);
  }, [navigate]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "doctor@mediczy.com",
      password: "Doctor123",
    },
  });

  const loginMutation = useLogin();

  // Handle OAuth Login
  const handleOAuthLogin = (provider: 'google' | 'facebook') => {
    const oauthUrl = `${API_BASE_URL}/api/auth/doctor/${provider}`;
    console.log(`🔵 Redirecting to ${provider} OAuth:`, oauthUrl);
    window.location.href = oauthUrl;
  };

  const establishDoctorSession = (token: string, doctorProfile?: any) => {
    clearAuthTokens();
    localStorage.setItem('doctorToken', token);
    localStorage.setItem('token', token);
    localStorage.setItem('userType', 'doctor');
    if (doctorProfile) {
      localStorage.setItem('doctorData', JSON.stringify({
        id: doctorProfile.id,
        email: doctorProfile.email,
        firstName: doctorProfile.firstName,
        lastName: doctorProfile.lastName,
        specialty: doctorProfile.specialty,
      }));
    } else {
      localStorage.removeItem('doctorData');
    }
    window.dispatchEvent(new Event('authChange'));
  };

  const onSubmit = (values: { email: string; password: string }) => {
    // Dev bypass for testing
    const emailLower = values.email.toLowerCase().trim();
    if (
      import.meta.env.DEV &&
      emailLower === 'doctor@mediczy.com' &&
      values.password === 'Doctor123'
    ) {
      console.log('🚀 Doctor: Using quick authentication bypass');
      establishDoctorSession('dev-doctor-token', {
        id: 'doctor_dev',
        email: 'doctor@mediczy.com',
        firstName: 'John',
        lastName: 'Smith',
        specialty: 'General Medicine'
      });
      
      toast({
        title: "Success",
        description: "Logged in successfully. Redirecting...",
      });
      
      navigate("/doctor-dashboard");
      return;
    }

    loginMutation.mutate(
      { credentials: values, loginType: "doctor" },
      {
        onSuccess: () => {
          toast({
            title: "Success",
            description: "Logged in successfully. Redirecting...",
          });
          
          // Initialize Firebase messaging after successful login
          setTimeout(() => {
            initializeFirebaseMessaging().catch(err => {
              console.log('Firebase messaging initialization skipped:', err.message);
            });
          }, 500);
          
          navigate("/doctor-dashboard");
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
    <div className="auth-shell min-h-screen flex items-center justify-center p-4">
      <div className="grid w-full max-w-5xl grid-cols-1 lg:grid-cols-2 overflow-hidden brand-panel">
        {/* Left Side with Brand Hero */}
        <div className="hidden lg:flex flex-col p-10 text-white brand-hero">
          <div
            className="relative z-20 flex items-center gap-2 text-lg font-bold cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => navigate("/doctor-dashboard")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                navigate("/doctor-dashboard");
              }
            }}
            aria-label="Go to doctor dashboard"
            title="Go to dashboard"
          >
            <HeartPulse className="h-6 w-6" />
            Mediqzy
            <span className="ml-2 text-[10px] uppercase bg-white/20 px-2 py-0.5 rounded-full">Doctor</span>
          </div>
          <div className="mt-auto space-y-3">
            <h2 className="text-3xl font-semibold">Welcome back</h2>
            <p className="text-white/80">
              Sign in to manage your clinic, appointments, and consults with a consistent, secure experience.
            </p>
            <ul className="space-y-2 text-sm text-white/85">
              <li className="flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Confirm and manage schedules</li>
              <li className="flex items-center gap-2"><HeartPulse className="h-4 w-4" /> Keep patient access ring-fenced</li>
              <li className="flex items-center gap-2"><Eye className="h-4 w-4" /> Track consultation history quickly</li>
            </ul>
          </div>
        </div>

        {/* Right Side Login Form */}
        <div className="p-6 lg:p-10 h-full flex items-center bg-white">
          <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[360px]">
            {/* Header */}
            <div className="flex flex-col space-y-2">
              <div className="inline-flex items-center gap-2 self-start rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                Doctor Portal
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Welcome Back</h1>
              <p className="text-sm text-muted-foreground">
                Enter your credentials to access your practice dashboard.
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
                          placeholder="doctor@mediczy.com"
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
                      <div className="flex items-center justify-between">
                        <FormLabel>Password</FormLabel>
                        <Link
                          to="/forgot-password?type=doctor"
                          className="text-xs text-primary hover:underline"
                        >
                          Forgot password?
                        </Link>
                      </div>
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
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Eye className="h-4 w-4" aria-hidden="true" />
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

                {/* OAuth Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-muted-foreground">
                      Or continue with
                    </span>
                  </div>
                </div>

                {/* OAuth Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOAuthLogin('google')}
                    className="w-full"
                  >
                    <Chrome className="mr-2 h-4 w-4" />
                    Google
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOAuthLogin('facebook')}
                    className="w-full"
                  >
                    <Facebook className="mr-2 h-4 w-4" />
                    Facebook
                  </Button>
                </div>
              </form>
            </Form>

            {/* Links */}
            <div className="space-y-2 text-center text-sm">
              <div className="text-muted-foreground">
                Don't have an account?{" "}
                <Link
                  to="/doc-register"
                  className="underline underline-offset-4 hover:text-primary font-medium"
                >
                  Register as a doctor
                </Link>
              </div>
              <div className="text-muted-foreground">
                Are you a user?{" "}
                <Link
                  to="/login"
                  className="underline underline-offset-4 hover:text-primary font-medium"
                >
                  Login here
                </Link>
              </div>
              <div className="text-muted-foreground">
                Team member?{" "}
                <Link
                  to="/team/login"
                  className="underline underline-offset-4 hover:text-purple-600 font-medium text-purple-600"
                >
                  Team Login
                </Link>
                {" "}•{" "}
                <Link
                  to="/admin/login"
                  className="underline underline-offset-4 hover:text-amber-600 font-medium text-amber-600"
                >
                  Admin Login
                </Link>
              </div>
            </div>

            <div className="text-center text-xs text-muted-foreground">
              Trouble signing in?{" "}
              <a
                href="mailto:support@mediczy.com?subject=Doctor%20Portal%20Login%20Help"
                className="font-semibold underline underline-offset-2 hover:text-primary"
              >
                Contact support
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorLogin;
