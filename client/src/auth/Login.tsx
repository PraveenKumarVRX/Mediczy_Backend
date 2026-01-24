import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion } from "framer-motion";
import { BRAND } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Facebook,
  CheckCircle2,
  Shield,
  Sparkles,
  ArrowRight,
  Lock,
  Mail,
} from "lucide-react";
import "../index.css";
import { useLogin } from "../hooks/auth"; // Import useLogin hook
import { initializeFirebaseMessaging } from "@/lib/firebase-config";
import api from "@/utils/api";

const formSchema = z.object({
  email: z.string().email("Must be a valid email"),
  password: z.string().min(1, "Password is required"),
});

const Login = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [useOtpLogin, setUseOtpLogin] = useState(false);
  const [otpIdentifier, setOtpIdentifier] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);

  // Check if already authenticated
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      console.log('✅ User already authenticated, redirecting...');
      navigate('/', { replace: true });
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

  const handleOtpSend = async () => {
    if (!otpIdentifier.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Email or phone number is required",
      });
      return;
    }

    setOtpLoading(true);
    try {
      const { data } = await api.post(
        "/users/login/send-otp",
        { identifier: otpIdentifier.trim() },
        { skipAuth: true } as any
      );
      if (data?.success) {
        setOtpSent(true);
        toast({
          title: "OTP sent",
          description: data?.message || "OTP sent successfully",
        });
      } else {
        throw new Error(data?.message || "Failed to send OTP");
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error?.response?.data?.message || error?.message || "Failed to send OTP",
      });
    } finally {
      setOtpLoading(false);
    }
  };

  const handleOtpVerify = async () => {
    if (!otpIdentifier.trim() || !otpCode.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Identifier and OTP code are required",
      });
      return;
    }

    setOtpVerifying(true);
    try {
      const { data } = await api.post(
        "/users/login/verify-otp",
        { identifier: otpIdentifier.trim(), code: otpCode.trim() },
        { skipAuth: true } as any
      );

      if (!data?.token) {
        throw new Error(data?.message || "OTP verification failed");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("userType", "user");
      if (data?.user?.id) {
        localStorage.setItem("userId", String(data.user.id));
        localStorage.setItem("userData", JSON.stringify(data.user));
      }

      toast({
        title: "Success",
        description: "Logged in successfully. Redirecting...",
      });

      window.dispatchEvent(new Event("authChange"));
      initializeFirebaseMessaging().catch(err => {
        console.log('Firebase messaging initialization skipped:', err.message);
      });
      navigate("/", { replace: true });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error?.response?.data?.message || error?.message || "OTP verification failed",
      });
    } finally {
      setOtpVerifying(false);
    }
  };

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
    if (
      import.meta.env.DEV &&
      emailLower === 'user@mediczy.com' &&
      values.password === 'User123'
    ) {
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
        onSuccess: async () => {
          toast({
            title: "Success",
            description: "Logged in successfully. Redirecting...",
          });

          // Warm wallet with daily reward and ensure payment gateways are reachable post-login
          try {
            const res = await api.post('/wallet/earn/daily-login');
            if (res?.data?.coinsEarned) {
              toast({
                title: "Health Coins added",
                description: `Earned ${res.data.coinsEarned} HC${res.data.bonusCoins ? ` + ${res.data.bonusCoins} bonus HC` : ''} for logging in.`,
              });
            }
          } catch (err: any) {
            // Silently ignore repeat claim or network hiccups
            if (process.env.NODE_ENV === 'development') {
              console.debug('Wallet login reward skipped', err?.response?.data?.message || err?.message);
            }
          }
          
          // Initialize Firebase messaging after successful login
          initializeFirebaseMessaging().catch(err => {
            console.log('Firebase messaging initialization skipped:', err.message);
          });
          
          // Dispatch auth change event for same-tab updates
          window.dispatchEvent(new Event('authChange'));
          
          // Navigate to patient dashboard - user login redirects here
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-teal-50/20">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="relative">
            <div className="w-20 h-20 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
            <HeartPulse className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-primary animate-pulse" />
          </div>
          <p className="mt-6 text-slate-600 font-medium">Preparing your experience...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/50 to-teal-50/30">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-primary/10 to-teal-400/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-tr from-blue-400/10 to-primary/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/3 left-1/4 w-64 h-64 bg-gradient-to-r from-emerald-400/5 to-cyan-400/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="grid w-full max-w-5xl grid-cols-1 lg:grid-cols-2 overflow-hidden rounded-3xl bg-white/80 backdrop-blur-xl shadow-2xl shadow-slate-200/50 border border-white/60 relative z-10"
      >
        {/* Left Side with Brand Hero */}
        <div 
          className="hidden lg:flex flex-col p-10 text-white relative overflow-hidden"
          style={{
            backgroundImage: `linear-gradient(135deg, rgba(6, 78, 112, 0.75), rgba(4, 149, 133, 0.65)), url('/aiH.jpg')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* Decorative patterns */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-10 right-10 w-32 h-32 border border-white/30 rounded-full" />
            <div className="absolute top-20 right-20 w-20 h-20 border border-white/20 rounded-full" />
            <div className="absolute bottom-20 left-10 w-40 h-40 border border-white/20 rounded-full" />
            <svg className="absolute bottom-0 left-0 w-full h-48 opacity-20" viewBox="0 0 400 200">
              <path d="M0,100 Q100,50 200,100 T400,100" fill="none" stroke="white" strokeWidth="1" />
              <path d="M0,120 Q100,70 200,120 T400,120" fill="none" stroke="white" strokeWidth="0.5" />
            </svg>
          </div>
          
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="relative z-20 flex items-center gap-3 cursor-pointer group"
            role="button"
            tabIndex={0}
            onClick={() => navigate("/")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                navigate("/");
              }
            }}
            aria-label="Go to dashboard"
            title="Go to dashboard"
          >
            <img 
              src={BRAND.logo} 
              alt={BRAND.name} 
              className="h-12 w-auto object-contain"
            />
          </motion.div>
          
          <div className="mt-auto space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium mb-4">
                <Sparkles className="h-4 w-4" />
                <span>Your Health, Simplified</span>
              </div>
              <h2 className="text-4xl font-bold leading-tight">
                Welcome to Your<br />
                <span className="text-white/90">Health Journey</span>
              </h2>
              <p className="text-white/75 mt-4 text-lg leading-relaxed max-w-sm">
                Access personalized care, manage appointments, and connect with healthcare professionals seamlessly.
              </p>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="space-y-3 pt-4"
            >
              {[
                { icon: Shield, text: "Bank-grade security & privacy" },
                { icon: CheckCircle2, text: "Book appointments in seconds" },
                { icon: Stethoscope, text: "24/7 doctor consultations" }
              ].map((item, index) => (
                <motion.div 
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + index * 0.1 }}
                  className="flex items-center gap-3 text-white/90"
                >
                  <div className="p-1.5 rounded-lg bg-white/15">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium">{item.text}</span>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Right Side Login Form */}
        <div className="p-8 lg:p-12 flex items-center bg-white/50 backdrop-blur-sm">
          <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[380px]">
            {/* Header */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col space-y-3"
            >
              <div className="inline-flex items-center gap-2 self-start rounded-full bg-gradient-to-r from-primary/10 to-teal-500/10 px-4 py-1.5 text-xs font-semibold text-primary border border-primary/20">
                <Lock className="h-3.5 w-3.5" />
                Secure Login
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Welcome Back</h1>
              <p className="text-base text-slate-500">
                Sign in to continue managing your health journey.
              </p>
            </motion.div>

          {/* Login Form */}
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">Sign in to your account</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setUseOtpLogin(!useOtpLogin);
                  setOtpSent(false);
                  setOtpCode('');
                }}
              >
                {useOtpLogin ? "Use Password" : "Use OTP"}
              </Button>
            </div>

            {useOtpLogin ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <FormLabel className="text-slate-700 font-medium">Email or Phone</FormLabel>
                  <FormControl>
                    <div className="relative group">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                      <Input
                        type="text"
                        placeholder="name@example.com or 9876543210"
                        className="h-12 pl-11 bg-slate-50/50 border-slate-200 text-slate-900 focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-xl transition-all duration-200"
                        value={otpIdentifier}
                        onChange={(e) => setOtpIdentifier(e.target.value)}
                      />
                    </div>
                  </FormControl>
                </div>

                <Button
                  type="button"
                  className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-teal-600 hover:from-primary/90 hover:to-teal-600/90 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 rounded-xl"
                  onClick={handleOtpSend}
                  disabled={otpLoading}
                >
                  {otpLoading ? "Sending OTP..." : otpSent ? "Resend OTP" : "Send OTP"}
                </Button>

                {otpSent && (
                  <div className="space-y-2">
                    <FormLabel className="text-slate-700 font-medium">OTP Code</FormLabel>
                    <Input
                      type="text"
                      placeholder="Enter 6-digit OTP"
                      className="h-12"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                    />
                    <Button
                      type="button"
                      className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-teal-600 hover:from-primary/90 hover:to-teal-600/90 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 rounded-xl"
                      onClick={handleOtpVerify}
                      disabled={otpVerifying}
                    >
                      {otpVerifying ? "Verifying..." : "Verify & Login"}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              {/* Email Field */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700 font-medium">Email Address</FormLabel>
                      <FormControl>
                        <div className="relative group">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                          <Input
                            type="email"
                            placeholder="name@example.com"
                            className="h-12 pl-11 bg-slate-50/50 border-slate-200 text-slate-900 focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-xl transition-all duration-200"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </motion.div>

              {/* Password Field */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="text-slate-700 font-medium">Password</FormLabel>
                        <Link
                          to="/forgot-password?type=user"
                          className="text-xs text-primary hover:text-primary/80 font-medium hover:underline transition-colors"
                        >
                          Forgot password?
                        </Link>
                      </div>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                        <FormControl>
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            className="h-12 pl-11 pr-12 bg-slate-50/50 border-slate-200 text-slate-900 focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-xl transition-all duration-200"
                            {...field}
                            autoComplete="current-password"
                          />
                        </FormControl>
                        <button
                          type="button"
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
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
              </motion.div>

              {/* Submit Button */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <Button
                  type="submit"
                  className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-teal-600 hover:from-primary/90 hover:to-teal-600/90 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 rounded-xl group"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Signing in...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Sign in
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  )}
                </Button>
              </motion.div>

              {/* OAuth2 Divider */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="relative py-2"
              >
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-4 text-slate-400 font-medium">
                    Or continue with
                  </span>
                </div>
              </motion.div>

              {/* OAuth2 Buttons */}
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="grid grid-cols-2 gap-4"
              >
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOAuthLogin('google')}
                  className="h-12 rounded-xl border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all duration-200 group"
                >
                  <Chrome className="h-5 w-5 mr-2 text-slate-600 group-hover:text-slate-900" />
                  <span className="font-medium text-slate-700">Google</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOAuthLogin('facebook')}
                  className="h-12 rounded-xl border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all duration-200 group"
                >
                  <Facebook className="h-5 w-5 mr-2 text-blue-600" />
                  <span className="font-medium text-slate-700">Facebook</span>
                </Button>
              </motion.div>
                </form>
              </Form>
            )}
          </div>

          {/* Sign-Up Link */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-center text-sm text-slate-500"
          >
            Don't have an account?
            <Link
              to="/register"
              className="text-primary font-semibold hover:text-primary/80 ml-1.5 hover:underline transition-colors"
            >
              Create account
            </Link>
          </motion.div>

          {/* Portal Login Links */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className="pt-6 border-t border-slate-100"
          >
            <p className="text-center text-xs text-slate-400 font-medium mb-4">
              Healthcare Provider or Partner?
            </p>
            <div className="grid grid-cols-4 gap-2">
              <Link 
                to="/doctor/login" 
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 hover:from-blue-100 hover:to-blue-200/50 border border-blue-100/50 hover:border-blue-200 transition-all duration-200 group hover:shadow-md hover:shadow-blue-100/50"
              >
                <Stethoscope className="h-5 w-5 text-blue-600 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-semibold text-blue-700">Doctor</span>
              </Link>
              <Link 
                to="/hospital/login" 
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/50 hover:from-purple-100 hover:to-purple-200/50 border border-purple-100/50 hover:border-purple-200 transition-all duration-200 group hover:shadow-md hover:shadow-purple-100/50"
              >
                <Building2 className="h-5 w-5 text-purple-600 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-semibold text-purple-700">Hospital</span>
              </Link>
              <Link 
                to="/clinic/login" 
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-pink-50 to-pink-100/50 hover:from-pink-100 hover:to-pink-200/50 border border-pink-100/50 hover:border-pink-200 transition-all duration-200 group hover:shadow-md hover:shadow-pink-100/50"
              >
                <Building className="h-5 w-5 text-pink-600 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-semibold text-pink-700">Clinic</span>
              </Link>
              <Link 
                to="/lab/login" 
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 hover:from-emerald-100 hover:to-emerald-200/50 border border-emerald-100/50 hover:border-emerald-200 transition-all duration-200 group hover:shadow-md hover:shadow-emerald-100/50"
              >
                <FlaskConical className="h-5 w-5 text-emerald-600 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-semibold text-emerald-700">Lab</span>
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-2">
              <Link 
                to="/pharmacy/login" 
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-teal-50 to-teal-100/50 hover:from-teal-100 hover:to-teal-200/50 border border-teal-100/50 hover:border-teal-200 transition-all duration-200 group hover:shadow-md hover:shadow-teal-100/50"
              >
                <Pill className="h-5 w-5 text-teal-600 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-semibold text-teal-700">Pharmacy</span>
              </Link>
              <Link 
                to="/ambulance/login" 
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-red-50 to-red-100/50 hover:from-red-100 hover:to-red-200/50 border border-red-100/50 hover:border-red-200 transition-all duration-200 group hover:shadow-md hover:shadow-red-100/50"
              >
                <Ambulance className="h-5 w-5 text-red-600 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-semibold text-red-700">Ambulance</span>
              </Link>
              <Link 
                to="/homecare/login" 
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 hover:from-amber-100 hover:to-amber-200/50 border border-amber-100/50 hover:border-amber-200 transition-all duration-200 group hover:shadow-md hover:shadow-amber-100/50"
              >
                <Home className="h-5 w-5 text-amber-600 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-semibold text-amber-700">Homecare</span>
              </Link>
              <Link 
                to="/corporate/login" 
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100/50 hover:from-slate-100 hover:to-slate-200/50 border border-slate-200/50 hover:border-slate-300 transition-all duration-200 group hover:shadow-md hover:shadow-slate-100/50"
              >
                <UserCog className="h-5 w-5 text-slate-600 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-semibold text-slate-700">Corporate</span>
              </Link>
            </div>
          </motion.div>
        </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
