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
    <div className="container relative min-h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      {/* Left Side with Background */}
      <div
        style={{ backgroundImage: `url("../../aiH.jpg")` }}
        className="relative hidden h-full bg-cover bg-center flex-col bg-muted p-10 text-white dark:border-r lg:flex"
      >
        <div className="relative z-20 flex items-center gap-2 text-lg font-bold primary-grad">
          <HeartPulse className="h-6 w-6" />
          Mediqzy
        </div>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg">
              "Mediqzy streamlines my practice workflow and improves patient
              care outcomes significantly."
            </p>
            <footer className="text-sm">Dr. Michael Chen</footer>
          </blockquote>
        </div>
      </div>

      {/* Right Side Login Form */}
      <div className="p-4 lg:p-8 h-full flex items-center">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          {/* Header */}
          <div className="flex flex-col space-y-2 text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-primary/10 p-3 rounded-full">
                <Stethoscope className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Doctor Login
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your credentials to access your practice dashboard
            </p>
          </div>

          {/* Login Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* OAuth Login Buttons */}
              <div className="grid grid-cols-2 gap-3 mb-4">
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

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or continue with email
                  </span>
                </div>
              </div>

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
                        placeholder="doctor@hospital.com"
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
  );
};

export default DoctorLogin;
