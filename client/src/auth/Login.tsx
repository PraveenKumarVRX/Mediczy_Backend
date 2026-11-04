import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { BRAND } from "@/config/brand";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { OTPInput } from "@/components/OTPInput";
import {
  Eye,
  EyeOff,
  HeartPulse,
  Chrome,
  Facebook,
  CheckCircle2,
  Shield,
  Sparkles,
  ArrowRight,
  Lock,
  Mail,
  Phone,
  KeyRound,
  ChevronLeft,
  Clock,
  Star,
  Zap,
  Gift,
  FlaskConical,
  Pill,
  Brain,
  Video,
  FileText,
  Ambulance,
} from "lucide-react";
import "../index.css";
import { MediqzyLogo3D } from "@/components/ui/MediqzyLogo3D";
import { useLogin } from "../hooks/auth";
import { initializeFirebaseMessaging } from "@/lib/firebase-config";
import api from "@/utils/api";
import { clearAuthTokens } from "@/hooks/auth";

const formSchema = z.object({
  email: z.string().min(1, "Email, phone number, or login ID is required").refine(
    (val) => {
      const trimmed = val.trim();
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
      const digits = trimmed.replace(/[^0-9]/g, '');
      const isPhone = digits.length >= 7 && digits.length <= 15 && !trimmed.includes('@');
      // Admin/HR-provisioned corporate employees log in with their 6-char
      // corporate_employees UID (e.g. E7K2PX) instead of an email.
      const isLoginUid = /^[A-Za-z][A-Za-z0-9]{5}$/.test(trimmed);
      return isEmail || isPhone || isLoginUid;
    },
    { message: 'Must be a valid email address, phone number, or login ID' }
  ),
  password: z.string().min(1, "Password is required"),
});

type LoginMode = "password" | "otp";
type OtpStep = "input" | "verify";
type LoginAudience = "individual" | "corporate_employee";

const CORPORATE_EMPLOYEE_HOME = "/employee/home";
const POST_PASSWORD_ROUTE_KEY = "mediczy:post-password-route";

const WELLNESS_BENEFITS = [
  { icon: Video,       label: "Free Video Consult",    desc: "First consultation free",         color: "#f0fdf4", iconColor: "#16a34a", accent: "#bbf7d0" },
  { icon: Pill,        label: "Medicine Delivery",     desc: "Doorstep in under 2 hours",       color: "#fef3c7", iconColor: "#d97706", accent: "#fde68a" },
  { icon: FlaskConical,label: "Lab Tests",              desc: "Up to 40% off on 500+ tests",     color: "#eff6ff", iconColor: "#2563eb", accent: "#bfdbfe" },
  { icon: Brain,       label: "AI Health Assistant",   desc: "24/7 smart symptom checker",      color: "#fdf4ff", iconColor: "#9333ea", accent: "#e9d5ff" },
  { icon: Gift,        label: "Health Coins",           desc: "Earn rewards on every visit",     color: "#fff7ed", iconColor: "#ea580c", accent: "#fed7aa" },
  { icon: FileText,    label: "Digital Records",        desc: "All reports in one place",        color: "#f0fdfa", iconColor: "#0d9488", accent: "#99f6e4" },
  { icon: Ambulance,   label: "Emergency Support",      desc: "One-tap SOS, always on",          color: "#fff1f2", iconColor: "#e11d48", accent: "#fecdd3" },
  { icon: Zap,         label: "Instant Appointments",  desc: "Book in under 60 seconds",        color: "#fefce8", iconColor: "#ca8a04", accent: "#fef08a" },
];

function detectIdentifierType(value: string): "email" | "phone" | "unknown" {
  const trimmed = value.trim();
  if (!trimmed) return "unknown";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "email";
  const digits = trimmed.replace(/[^0-9+\-\s()]/g, '');
  if (digits.replace(/[^0-9]/g, '').length >= 7) return "phone";
  return "unknown";
}

function isIdentifierValid(value: string): boolean {
  const trimmed = value.trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  const digits = trimmed.replace(/[^0-9]/g, '');
  const isPhone = digits.length >= 7 && digits.length <= 15 && !trimmed.includes('@');
  // Admin/HR-provisioned corporate employees log in with their 6-char
  // corporate_employees UID (e.g. E7K2PX) instead of an email.
  const isLoginUid = /^[A-Za-z][A-Za-z0-9]{5}$/.test(trimmed);
  return isEmail || isPhone || isLoginUid;
}

function getInactiveAccountResolution(error: any): {
  title: string;
  description: string;
  nextPath?: string;
} {
  const details = error?.response?.data?.details;
  const reasonCode = details?.reasonCode;

  if (reasonCode === 'MEMBERSHIP_EXPIRED') {
    const expiredOn = details?.expiredOn ? ` (expired on ${details.expiredOn})` : '';
    return {
      title: 'Membership expired',
      description: `Your plan has expired${expiredOn}. Renew now to continue.`,
      nextPath: '/my-plans',
    };
  }

  if (reasonCode === 'NO_ACTIVE_MEMBERSHIP') {
    return {
      title: 'No active membership',
      description: 'Choose a plan to reactivate your account access.',
      nextPath: '/choose-plan',
    };
  }

  return {
    title: 'Account inactive',
    description: error?.response?.data?.message || 'Please contact support for account help.',
  };
}

// Resend cooldown timer hook
function useResendTimer(initial = 30) {
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = () => {
    setSeconds(initial);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);
  return { seconds, start, canResend: seconds === 0 };
}

const Login = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Show a toast when the OAuth server redirects back with ?error=
  useEffect(() => {
    const oauthError = searchParams.get('error');
    if (oauthError) {
      const provider = oauthError.startsWith('google') ? 'Google' : oauthError.startsWith('facebook') ? 'Facebook' : 'OAuth';
      toast({
        variant: 'destructive',
        title: `${provider} sign-in failed`,
        description: 'Could not authenticate with the provider. Please try again or use email/password.',
      });
    }
  }, []);

  const [showPassword, setShowPassword] = useState(false);
  const [loginAudience, setLoginAudience] = useState<LoginAudience>(
    searchParams.get("audience") === "corporate" ? "corporate_employee" : "individual"
  );
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [loginMode, setLoginMode] = useState<LoginMode>("password");
  const [otpStep, setOtpStep] = useState<OtpStep>("input");
  const [otpIdentifier, setOtpIdentifier] = useState('');
  const [otpDeliveredTo, setOtpDeliveredTo] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [identifierValue, setIdentifierValue] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const { seconds: resendSeconds, start: startResendTimer, canResend } = useResendTimer(30);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setIsCheckingAuth(false);
      return;
    }
    // Validate the token is still accepted by the server before redirecting.
    // If it's stale/invalid, clear it and show the login form.
    api.get('/users/profile', { skipAuth: false } as any)
      .then(() => {
        navigate('/', { replace: true });
      })
      .catch(() => {
        // Token rejected — clear all auth state and stay on login page
        clearAuthTokens();
        setIsCheckingAuth(false);
      });
  }, [navigate]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
    mode: "onChange",
  });

  const emailValue = form.watch("email");
  const identifierType = detectIdentifierType(emailValue || "");
  const identifierValid = isIdentifierValid(emailValue || "");
  const passwordValue = form.watch("password");

  const loginMutation = useLogin();

  // The selector is a product boundary, not an authorization claim. The
  // server-derived employee context remains the sole proof of employment.
  const confirmSelectedAudience = async () => {
    if (loginAudience === "individual") return true;
    try {
      const { data } = await api.get('/employee/context');
      if (data?.success && data?.isCorporateEmployee) return true;
    } catch {
      // Treat an unavailable context as a failed corporate-employee login;
      // never fall back silently to individual benefits.
    }
    clearAuthTokens();
    sessionStorage.removeItem(POST_PASSWORD_ROUTE_KEY);
    sessionStorage.removeItem("mediczy:experience");
    toast({
      variant: "destructive",
      title: "Corporate employee access not available",
      description: "This account is not on an active employer roster. Use Individual login or contact your HR team.",
    });
    return false;
  };

  const handleOtpSend = async () => {
    if (!otpIdentifier.trim()) return;
    setOtpLoading(true);
    try {
      const { data } = await api.post(
        "/users/login/send-otp",
        { identifier: otpIdentifier.trim() },
        { skipAuth: true } as any
      );
      if (data?.success) {
        // Mask identifier for display: sh****@gmail.com or ****7890
        const id = otpIdentifier.trim();
        const masked = id.includes('@')
          ? id.slice(0, 2) + '****' + id.slice(id.indexOf('@'))
          : id.slice(0, 2) + '****' + id.slice(-4);
        setOtpDeliveredTo(masked);
        setOtpStep("verify");
        startResendTimer();
      } else {
        throw new Error(data?.message || "Failed to send OTP");
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to send OTP",
        description: error?.response?.data?.message || error?.message || "Please try again",
      });
    } finally {
      setOtpLoading(false);
    }
  };

  const handleOtpVerify = async () => {
    if (!otpIdentifier.trim() || otpCode.length !== 6) return;
    setOtpVerifying(true);
    try {
      const { data } = await api.post(
        "/users/login/verify-otp",
        { identifier: otpIdentifier.trim(), code: otpCode.trim() },
        { skipAuth: true } as any
      );
      if (!data?.token) throw new Error(data?.message || "OTP verification failed");
      clearAuthTokens();
      localStorage.setItem("token", data.token);
      localStorage.setItem("userType", "user");
      if (data?.user?.id) {
        localStorage.setItem("userId", String(data.user.id));
        localStorage.setItem("userData", JSON.stringify(data.user));
      }
      if (!(await confirmSelectedAudience())) return;
      if (loginAudience === "corporate_employee") {
        sessionStorage.setItem("mediczy:experience", "corporate_employee");
      } else {
        sessionStorage.removeItem("mediczy:experience");
      }
      window.dispatchEvent(new Event("authChange"));
      initializeFirebaseMessaging().catch(() => {});
      setLoginSuccess(true);
      if (loginAudience === "corporate_employee") {
        setTimeout(() => navigate(CORPORATE_EMPLOYEE_HOME, { replace: true }), 800);
        return;
      }
      try {
        const planRes = await api.get('/membership/my/current');
        const hasNoPlan = planRes?.status === 200 && planRes?.data?.userPlan === null;
        if (hasNoPlan) { navigate('/choose-plan', { replace: true }); return; }
      } catch {
        toast({
          variant: 'destructive',
          title: 'Plan status unavailable',
          description: 'You are signed in, but we could not verify membership right now.',
        });
      }
      setTimeout(() => navigate("/", { replace: true }), 800);
    } catch (error: any) {
      if (error?.response?.data?.code === 'ACCOUNT_INACTIVE') {
        const resolution = getInactiveAccountResolution(error);
        toast({
          variant: 'destructive',
          title: resolution.title,
          description: resolution.description,
        });
        if (resolution.nextPath) {
          navigate(resolution.nextPath, { replace: true });
        }
        return;
      }
      toast({
        variant: "destructive",
        title: "Verification failed",
        description: error?.response?.data?.message || error?.message || "Invalid or expired OTP",
      });
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleOAuthLogin = (provider: 'google' | 'facebook') => {
    const baseUrl =
      import.meta.env.VITE_API_BASE_URL ||
      (import.meta.env.VITE_API_URL
        ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
        : window.location.origin);
    window.location.href = `${baseUrl}/api/auth/${provider}`;
  };

  const onSubmit = (values: { email: string; password: string }) => {
    loginMutation.mutate(
      { credentials: values, loginType: "user" },
      {
        onSuccess: async (data) => {
          if (data.requirePasswordChange) {
            if (loginAudience === "corporate_employee") {
              sessionStorage.setItem(POST_PASSWORD_ROUTE_KEY, CORPORATE_EMPLOYEE_HOME);
              sessionStorage.setItem("mediczy:experience", "corporate_employee");
            } else {
              sessionStorage.removeItem(POST_PASSWORD_ROUTE_KEY);
              sessionStorage.removeItem("mediczy:experience");
            }
            toast({ title: "Password change required", description: "Please set a new password before continuing." });
            navigate("/change-password", { replace: true });
            return;
          }
          if (!(await confirmSelectedAudience())) return;
          if (loginAudience === "corporate_employee") {
            sessionStorage.setItem("mediczy:experience", "corporate_employee");
          } else {
            sessionStorage.removeItem("mediczy:experience");
          }
          try {
            const res = await api.post('/wallet/earn/daily-login');
            if (res?.data?.coinsEarned) {
              toast({
                title: "Health Coins added",
                description: `Earned ${res.data.coinsEarned} HC${res.data.bonusCoins ? ` + ${res.data.bonusCoins} bonus HC` : ''} for logging in.`,
              });
            }
          } catch {
            // Daily-login rewards are best-effort and never block authentication.
          }
          initializeFirebaseMessaging().catch(() => {});
          window.dispatchEvent(new Event('authChange'));
          setLoginSuccess(true);
          if (loginAudience === "corporate_employee") {
            setTimeout(() => navigate(CORPORATE_EMPLOYEE_HOME, { replace: true }), 800);
            return;
          }
          try {
            const planRes = await api.get('/membership/my/current');
            const hasNoPlan = planRes?.status === 200 && planRes?.data?.userPlan === null;
            if (hasNoPlan) { navigate('/choose-plan', { replace: true }); return; }
          } catch {
            toast({
              variant: 'destructive',
              title: 'Plan status unavailable',
              description: 'You are signed in, but we could not verify membership right now.',
            });
          }
          setTimeout(() => navigate("/", { replace: true }), 800);
        },
        onError: (error) => {
          setFailedAttempts(n => n + 1);
          if ((error as any)?.response?.data?.code === 'ACCOUNT_INACTIVE') {
            const resolution = getInactiveAccountResolution(error as any);
            toast({
              variant: 'destructive',
              title: resolution.title,
              description: resolution.description,
            });
            if (resolution.nextPath) {
              navigate(resolution.nextPath, { replace: true });
            }
            return;
          }
          const status = (error as any)?.response?.status;
          let description = "We couldn't find an account with those details. Check your email or reset your password.";
          if (status === 500) description = "Something went wrong on our end. Please try again in a moment.";
          else if (!navigator.onLine) description = "No connection. Check your internet and try again.";
          toast({
            variant: "destructive",
            title: "Sign in failed",
            description,
          });
        },
      }
    );
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-teal-50/30">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <HeartPulse className="absolute inset-0 m-auto w-7 h-7 text-primary animate-pulse" />
          </div>
          <p className="text-slate-500 text-sm font-medium">Loading your experience...</p>
        </motion.div>
      </div>
    );
  }

  if (loginSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-teal-50/30">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
            className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto shadow-xl shadow-emerald-200"
          >
            <CheckCircle2 className="w-10 h-10 text-white" />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <p className="text-slate-900 font-semibold text-lg">Welcome back!</p>
            <p className="text-slate-500 text-sm mt-1">Redirecting to your dashboard...</p>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  const IdentifierIcon = identifierType === "phone" ? Phone : Mail;
  const identifierInputValid = isIdentifierValid(otpIdentifier);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#f8fafc]">
      {/* Subtle background grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230f172a' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />
      {/* Ambient orbs */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-radial from-teal-100/40 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-radial from-blue-100/30 to-transparent rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] overflow-hidden rounded-2xl bg-white shadow-[0_8px_64px_-12px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)] relative z-10"
      >
        {/* ─── LEFT WELLNESS PANEL ─── */}
        <div
          className="hidden lg:flex flex-col relative overflow-hidden"
          style={{ background: "linear-gradient(160deg, #1e1b4b 0%, #312e81 30%, #0f766e 75%, #065f46 100%)" }}
        >
          {/* Animated mesh blobs */}
          <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, #818cf8, transparent)" }} />
          <div className="absolute top-1/3 right-0 w-56 h-56 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, #34d399, transparent)" }} />
          <div className="absolute bottom-0 left-1/4 w-64 h-64 rounded-full opacity-15 blur-3xl" style={{ background: "radial-gradient(circle, #f472b6, transparent)" }} />
          {/* Subtle dot grid */}
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='1' fill='white'/%3E%3C/svg%3E")` }} />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

          <div className="relative z-10 flex flex-col h-full p-9">
            {/* Logo */}
            <motion.button
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              onClick={() => navigate("/")}
              className="flex items-center gap-2.5 self-start group mb-7"
            >
              <MediqzyLogo3D size="lg" interactive float />
              <span className="text-white/50 text-[11px] px-2.5 py-1 rounded-full border border-white/15 group-hover:border-white/35 transition-colors font-medium tracking-wide">
                Patient Portal
              </span>
            </motion.button>

            {/* Headline */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 }}
              className="mb-6"
            >
              <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-3 text-[11px] font-semibold text-emerald-300 border border-emerald-400/25" style={{ background: "rgba(52,211,153,0.08)" }}>
                <Sparkles className="h-3 w-3" />
                Everything you need, all in one app
              </div>
              <h2 className="text-[26px] font-extrabold text-white leading-tight">
                Your wellness,<br />
                <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-300 bg-clip-text text-transparent">
                  unlocked for free
                </span>
              </h2>
              <p className="text-white/50 text-xs mt-2 leading-relaxed">
                Join 50,000+ members enjoying premium healthcare benefits at zero cost.
              </p>
            </motion.div>

            {/* Benefit cards — scrollable grid */}
            <div className="flex-1 overflow-hidden">
              <div className="grid grid-cols-2 gap-2.5">
                {WELLNESS_BENEFITS.map(({ icon: Icon, label, desc, color, iconColor, accent }, i) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, y: 14, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 0.35 + i * 0.06, ease: [0.23, 1, 0.32, 1] }}
                    className="rounded-2xl p-3 flex flex-col gap-2 cursor-default select-none"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: color, boxShadow: `0 0 12px ${accent}60` }}
                    >
                      <Icon className="h-4 w-4" style={{ color: iconColor }} />
                    </div>
                    <div>
                      <p className="text-white text-[12px] font-semibold leading-tight">{label}</p>
                      <p className="text-white/45 text-[10px] mt-0.5 leading-tight">{desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Trust badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
              className="mt-5 pt-4 border-t border-white/10 grid grid-cols-3 gap-2"
            >
              {[
                { icon: Shield, value: "HIPAA",   label: "Compliant"   },
                { icon: Star,   value: "4.9 / 5", label: "App Rating"  },
                { icon: Clock,  value: "< 5 min", label: "Wait Time"   },
              ].map(({ icon: Icon, value, label }) => (
                <div key={label} className="flex flex-col items-center gap-1">
                  <Icon className="h-3.5 w-3.5 text-emerald-400" />
                  <p className="text-white font-bold text-xs leading-none">{value}</p>
                  <p className="text-white/40 text-[10px]">{label}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* ─── RIGHT FORM PANEL ─── */}
        <div className="flex flex-col px-8 py-10 lg:px-12 lg:py-12 bg-white overflow-y-auto">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <MediqzyLogo3D size="md" theme="dark" />
            <span className="text-slate-400 text-xs border border-slate-200 rounded-full px-2 py-0.5">Patient Portal</span>
          </div>

          {/* Heading */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mb-7"
          >
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome back</h1>
            <p className="text-slate-500 text-sm mt-1">{loginAudience === "corporate_employee" ? "Sign in to your employer-sponsored health experience" : "Sign in to access your health dashboard"}</p>
          </motion.div>

          {/* Audience is explicit, while entitlement remains server-verified after sign-in. */}
          <div className="mb-4" role="group" aria-label="Choose account experience">
            <div className="grid grid-cols-2 rounded-xl border border-slate-200 p-1 bg-slate-50 gap-1">
              <button type="button" onClick={() => setLoginAudience("individual")}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${loginAudience === "individual" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                Individual
              </button>
              <button type="button" onClick={() => setLoginAudience("corporate_employee")}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${loginAudience === "corporate_employee" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                Corporate employee
              </button>
            </div>
            {loginAudience === "corporate_employee" && <p className="mt-2 text-xs text-slate-500">Your active employer roster determines access. Annual health check-ups are sponsored benefits; pre-employment checks use a separate candidate process.</p>}
          </div>

          {/* Mode tabs */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-6"
          >
            <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => { setLoginMode("password"); setOtpStep("input"); setOtpCode(''); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  loginMode === "password"
                    ? "bg-white text-slate-900 shadow-sm shadow-slate-200"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <KeyRound className="h-3.5 w-3.5" />
                Password
              </button>
              <button
                type="button"
                onClick={() => { setLoginMode("otp"); setOtpStep("input"); setOtpCode(''); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  loginMode === "otp"
                    ? "bg-white text-slate-900 shadow-sm shadow-slate-200"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Phone className="h-3.5 w-3.5" />
                OTP Login
              </button>
            </div>
          </motion.div>

          <AnimatePresence mode="wait">
            {/* ── PASSWORD LOGIN ── */}
            {loginMode === "password" && (
              <motion.div
                key="password"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.2 }}
              >
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    {/* Identifier field */}
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <div className="relative">
                            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none transition-colors duration-200">
                              <IdentifierIcon className="h-4 w-4" />
                            </div>
                            <FormControl>
                              <Input
                                {...field}
                                type="text"
                                placeholder="Email, mobile number, or login ID"
                                autoComplete="username"
                                className="h-12 pl-10 pr-10 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                              />
                            </FormControl>
                            <AnimatePresence>
                              {identifierValid && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.5 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.5 }}
                                  className="absolute right-3.5 top-1/2 -translate-y-1/2"
                                >
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                          <FormMessage className="text-xs mt-1" />
                        </FormItem>
                      )}
                    />

                    {/* Password field */}
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <div className="relative">
                            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                            <FormControl>
                              <Input
                                {...field}
                                type={showPassword ? "text" : "password"}
                                placeholder="Password"
                                autoComplete="current-password"
                                className="h-12 pl-10 pr-12 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                              />
                            </FormControl>
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5"
                              aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          <FormMessage className="text-xs mt-1" />
                        </FormItem>
                      )}
                    />

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      {failedAttempts >= 2 && (
                        <p className="text-xs text-slate-500">
                          Having trouble?{" "}
                          <Link to="/user/forgot-password" className="text-primary font-semibold underline underline-offset-2">
                            Reset your password
                          </Link>
                        </p>
                      )}
                      <Link
                        to="/user/forgot-password"
                        className="ml-auto text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                      >
                        Forgot password?
                      </Link>
                    </div>

                    <Button
                      type="submit"
                      disabled={loginMutation.isPending}
                      className="w-full h-12 text-sm font-semibold rounded-xl bg-gradient-to-r from-primary to-teal-600 hover:opacity-90 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 group"
                    >
                      {loginMutation.isPending ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Signing in...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          Sign in
                          <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      )}
                    </Button>
                  </form>
                </Form>
              </motion.div>
            )}

            {/* ── OTP LOGIN ── */}
            {loginMode === "otp" && (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
              >
                <AnimatePresence mode="wait">
                  {otpStep === "input" ? (
                    <motion.div
                      key="otp-input"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-4"
                    >
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          {detectIdentifierType(otpIdentifier) === "phone" ? (
                            <Phone className="h-4 w-4" />
                          ) : (
                            <Mail className="h-4 w-4" />
                          )}
                        </div>
                        <Input
                          type="text"
                          placeholder="Email or mobile number"
                          value={otpIdentifier}
                          onChange={(e) => setOtpIdentifier(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && identifierInputValid) handleOtpSend(); }}
                          autoFocus
                          className="h-12 pl-10 pr-10 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        />
                        <AnimatePresence>
                          {identifierInputValid && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                              className="absolute right-3.5 top-1/2 -translate-y-1/2"
                            >
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <p className="text-xs text-slate-500">We'll send a 6-digit code to verify your identity.</p>
                      <Button
                        type="button"
                        onClick={handleOtpSend}
                        disabled={otpLoading || !identifierInputValid}
                        className="w-full h-12 text-sm font-semibold rounded-xl bg-gradient-to-r from-primary to-teal-600 hover:opacity-90 shadow-md shadow-primary/20 transition-all duration-200 group"
                      >
                        {otpLoading ? (
                          <span className="flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Sending...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            Send OTP
                            <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                          </span>
                        )}
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="otp-verify"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      className="space-y-5"
                    >
                      {/* Back button */}
                      <button
                        type="button"
                        onClick={() => { setOtpStep("input"); setOtpCode(''); }}
                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Change {detectIdentifierType(otpIdentifier) === "phone" ? "number" : "email"}
                      </button>

                      {/* Header */}
                      <div className="text-center space-y-1 py-2">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/10 to-teal-500/10 border border-primary/15 flex items-center justify-center mx-auto mb-3">
                          <Lock className="h-6 w-6 text-primary" />
                        </div>
                        <p className="font-semibold text-slate-900">Enter verification code</p>
                        <p className="text-xs text-slate-500">
                          6-digit code sent to{" "}
                          <span className="font-semibold text-slate-700">
                            {otpDeliveredTo || otpIdentifier}
                          </span>
                        </p>
                      </div>

                      {/* OTP input */}
                      <OTPInput
                        length={6}
                        value={otpCode}
                        onChange={setOtpCode}
                        className="justify-center"
                      />

                      {/* Resend */}
                      <div className="text-center">
                        {canResend ? (
                          <button
                            type="button"
                            onClick={() => { setOtpCode(''); handleOtpSend(); }}
                            disabled={otpLoading}
                            className="text-xs text-primary font-semibold hover:text-primary/80 transition-colors"
                          >
                            {otpLoading ? "Sending..." : "Resend code"}
                          </button>
                        ) : (
                          <p className="text-xs text-slate-400">
                            Resend in <span className="font-semibold text-slate-600 tabular-nums">{resendSeconds}s</span>
                          </p>
                        )}
                      </div>

                      <Button
                        type="button"
                        onClick={handleOtpVerify}
                        disabled={otpVerifying || otpCode.length !== 6}
                        className="w-full h-12 text-sm font-semibold rounded-xl bg-gradient-to-r from-primary to-teal-600 hover:opacity-90 shadow-md shadow-primary/20 transition-all duration-200 disabled:opacity-50"
                      >
                        {otpVerifying ? (
                          <span className="flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Verifying...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4" />
                            Verify & Sign in
                          </span>
                        )}
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* OAuth divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-100" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs text-slate-400 uppercase tracking-wider">or continue with</span>
            </div>
          </div>

          {/* OAuth buttons */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              type="button"
              onClick={() => handleOAuthLogin('google')}
              className="h-11 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-sm font-medium text-slate-700 transition-all duration-150 group"
            >
              <Chrome className="h-4 w-4 text-slate-500 group-hover:text-slate-700" />
              Google
            </button>
            <button
              type="button"
              onClick={() => handleOAuthLogin('facebook')}
              className="h-11 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-200 text-sm font-medium text-slate-700 transition-all duration-150 group"
            >
              <Facebook className="h-4 w-4 text-blue-600" />
              Facebook
            </button>
          </div>

          {/* Register link */}
          <p className="text-center text-sm text-slate-500">
            New to {BRAND.name}?{" "}
            <Link to="/register" className="text-primary font-semibold hover:text-primary/80 transition-colors">
              Create free account
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
