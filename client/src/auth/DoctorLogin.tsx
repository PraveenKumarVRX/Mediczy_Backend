import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import {
  Eye,
  EyeOff,
  HeartPulse,
  CheckCircle2,
  Shield,
  Sparkles,
  ArrowRight,
  Lock,
  Mail,
  Phone,
  Calendar,
  Video,
  FileText,
  BarChart3,
  Brain,
  Users,
  Activity,
  Stethoscope,
  Star,
  Clock,
} from "lucide-react";
import "../index.css";
import { MediqzyLogo3D } from "@/components/ui/MediqzyLogo3D";
import { useLogin, clearAuthTokens } from "@/hooks/auth";
import api from "@/utils/api";
import { initializeFirebaseMessaging } from "@/lib/firebase-config";

const formSchema = z.object({
  email: z
    .string()
    .min(1, "Email or phone number is required")
    .refine(
      (val) => {
        const trimmed = val.trim();
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
        const digits = trimmed.replace(/[^0-9]/g, "");
        const isPhone =
          digits.length >= 7 && digits.length <= 15 && !trimmed.includes("@");
        return isEmail || isPhone;
      },
      { message: "Must be a valid email address or phone number" }
    ),
  password: z.string().min(1, "Password is required"),
});

const PRACTICE_BENEFITS = [
  { icon: Calendar,   label: "Smart Scheduling",     desc: "Manage appointments in seconds",      color: "#eff6ff", iconColor: "#2563eb", accent: "#bfdbfe" },
  { icon: Video,      label: "HD Video Consults",    desc: "Crystal-clear telemedicine built-in", color: "#f0fdf4", iconColor: "#16a34a", accent: "#bbf7d0" },
  { icon: FileText,   label: "E-Prescriptions",      desc: "Sign & send scripts in 3 taps",       color: "#fdf4ff", iconColor: "#9333ea", accent: "#e9d5ff" },
  { icon: Brain,      label: "AI Diagnosis Aid",     desc: "CDSS-powered clinical support",       color: "#fff7ed", iconColor: "#ea580c", accent: "#fed7aa" },
  { icon: BarChart3,  label: "Revenue Dashboard",    desc: "Real-time earnings & analytics",      color: "#fefce8", iconColor: "#ca8a04", accent: "#fef08a" },
  { icon: Users,      label: "Team Management",      desc: "Coordinate nurses & clinic staff",    color: "#f0fdfa", iconColor: "#0d9488", accent: "#99f6e4" },
  { icon: Activity,   label: "Remote Monitoring",    desc: "IoT vitals for your patients",        color: "#fff1f2", iconColor: "#e11d48", accent: "#fecdd3" },
  { icon: Shield,     label: "Patient Privacy",      desc: "HIPAA & DPDP compliant by default",  color: "#f8fafc", iconColor: "#475569", accent: "#e2e8f0" },
];

function detectIdentifierType(value: string): "email" | "phone" | "unknown" {
  const trimmed = value.trim();
  if (!trimmed) return "unknown";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "email";
  const digits = trimmed.replace(/[^0-9+\-\s()]/g, "");
  if (digits.replace(/[^0-9]/g, "").length >= 7) return "phone";
  return "unknown";
}

function isIdentifierValid(value: string): boolean {
  const trimmed = value.trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  const digits = trimmed.replace(/[^0-9]/g, "");
  const isPhone =
    digits.length >= 7 && digits.length <= 15 && !trimmed.includes("@");
  return isEmail || isPhone;
}

const DoctorLogin = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [loginSuccess, setLoginSuccess] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("doctorToken");
    const userType = localStorage.getItem("userType");
    if (userType === "user" && localStorage.getItem("token")) {
      navigate("/profile", { replace: true });
      return;
    }
    if (token) {
      // Validate token is still accepted by the server before auto-redirecting
      api.get('/doctors/profile')
        .then(() => {
          navigate("/doctor/dashboard", { replace: true });
        })
        .catch(() => {
          // Token rejected (expired/invalid) — clear and show login form
          localStorage.removeItem("doctorToken");
          localStorage.removeItem("token");
          localStorage.removeItem("userType");
          setIsCheckingAuth(false);
        });
      return;
    }
    setIsCheckingAuth(false);
  }, [navigate]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
    mode: "onChange",
  });

  const emailValue = form.watch("email");
  const identifierType = detectIdentifierType(emailValue || "");
  const identifierValid = isIdentifierValid(emailValue || "");
  const IdentifierIcon = identifierType === "phone" ? Phone : Mail;

  const loginMutation = useLogin();

  const onSubmit = (values: { email: string; password: string }) => {
    loginMutation.mutate(
      { credentials: values, loginType: "doctor" },
      {
        onSuccess: () => {
          setLoginSuccess(true);
          setTimeout(() => {
            initializeFirebaseMessaging().catch(() => {});
          }, 500);
          setTimeout(() => navigate("/doctor/dashboard"), 800);
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Sign in failed",
            description:
              (error as any)?.response?.data?.message ||
              "Invalid credentials. Please try again.",
          });
        },
      }
    );
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50/30">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center space-y-4"
        >
          <div className="relative w-16 h-16 mx-auto">
            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <Stethoscope className="absolute inset-0 m-auto w-7 h-7 text-blue-600 animate-pulse" />
          </div>
          <p className="text-slate-500 text-sm font-medium">
            Loading your practice...
          </p>
        </motion.div>
      </div>
    );
  }

  if (loginSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50/30">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
            className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto shadow-xl shadow-blue-200"
          >
            <CheckCircle2 className="w-10 h-10 text-white" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <p className="text-slate-900 font-semibold text-lg">
              Welcome, Doctor!
            </p>
            <p className="text-slate-500 text-sm mt-1">
              Redirecting to your dashboard...
            </p>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#f8fafc]">
      {/* Background grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230f172a' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />
      {/* Ambient orbs */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, rgba(59,130,246,0.08), transparent)" }} />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.07), transparent)" }} />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] overflow-hidden rounded-2xl bg-white shadow-[0_8px_64px_-12px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)] relative z-10"
      >
        {/* ─── LEFT PRACTICE PANEL ─── */}
        <div
          className="hidden lg:flex flex-col relative overflow-hidden"
          style={{
            background:
              "linear-gradient(155deg, #0f172a 0%, #1e3a8a 35%, #1d4ed8 65%, #0284c7 100%)",
          }}
        >
          {/* Mesh blobs */}
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, #60a5fa, transparent)" }} />
          <div className="absolute top-1/2 -left-12 w-52 h-52 rounded-full opacity-15 blur-3xl" style={{ background: "radial-gradient(circle, #818cf8, transparent)" }} />
          <div className="absolute bottom-10 right-10 w-56 h-56 rounded-full opacity-15 blur-3xl" style={{ background: "radial-gradient(circle, #38bdf8, transparent)" }} />
          {/* Dot grid */}
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='1' fill='white'/%3E%3C/svg%3E")`,
            }}
          />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

          <div className="relative z-10 flex flex-col h-full p-9">
            {/* Logo */}
            <motion.button
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              onClick={() => navigate("/doctor/dashboard")}
              className="flex items-center gap-2.5 self-start group mb-7"
            >
              <MediqzyLogo3D size="lg" interactive float />
              <span className="text-white/50 text-[11px] px-2.5 py-1 rounded-full border border-white/15 group-hover:border-white/35 transition-colors font-medium tracking-wide">
                Doctor Portal
              </span>
            </motion.button>

            {/* Headline */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 }}
              className="mb-6"
            >
              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-3 text-[11px] font-semibold text-blue-200 border border-blue-400/25"
                style={{ background: "rgba(96,165,250,0.1)" }}
              >
                <Sparkles className="h-3 w-3" />
                Your practice, supercharged
              </div>
              <h2 className="text-[26px] font-extrabold text-white leading-tight">
                Practice smarter,<br />
                <span className="bg-gradient-to-r from-blue-300 via-cyan-300 to-sky-200 bg-clip-text text-transparent">
                  care better
                </span>
              </h2>
              <p className="text-white/50 text-xs mt-2 leading-relaxed">
                Trusted by 5,000+ doctors to manage their entire practice in one place.
              </p>
            </motion.div>

            {/* Benefit cards */}
            <div className="flex-1 overflow-hidden">
              <div className="grid grid-cols-2 gap-2.5">
                {PRACTICE_BENEFITS.map(({ icon: Icon, label, desc, color, iconColor, accent }, i) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, y: 14, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 0.35 + i * 0.06, ease: [0.23, 1, 0.32, 1] }}
                    className="rounded-2xl p-3 flex flex-col gap-2 cursor-default select-none"
                    style={{
                      background: "rgba(255,255,255,0.07)",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: color,
                        boxShadow: `0 0 12px ${accent}60`,
                      }}
                    >
                      <Icon className="h-4 w-4" style={{ color: iconColor }} />
                    </div>
                    <div>
                      <p className="text-white text-[12px] font-semibold leading-tight">
                        {label}
                      </p>
                      <p className="text-white/45 text-[10px] mt-0.5 leading-tight">
                        {desc}
                      </p>
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
                { icon: Shield,      value: "HIPAA",    label: "Compliant"   },
                { icon: Star,        value: "4.9 / 5",  label: "Doctor Rating" },
                { icon: Clock,       value: "24 / 7",   label: "Support"     },
              ].map(({ icon: Icon, value, label }) => (
                <div key={label} className="flex flex-col items-center gap-1">
                  <Icon className="h-3.5 w-3.5 text-blue-300" />
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
            <span className="text-slate-400 text-xs border border-slate-200 rounded-full px-2 py-0.5">
              Doctor Portal
            </span>
          </div>

          {/* Heading */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mb-8"
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700 mb-3">
              <Stethoscope className="h-3.5 w-3.5" />
              Doctor Portal
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Welcome back, Doctor
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Sign in to access your practice dashboard
            </p>
          </motion.div>

          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
          >
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
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
                            placeholder="Email or mobile number"
                            autoComplete="username"
                            className="h-12 pl-10 pr-10 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
                            className="h-12 pl-10 pr-12 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                          />
                        </FormControl>
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5"
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      <FormMessage className="text-xs mt-1" />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end">
                  <Link
                    to="/doctor/forgot-password"
                    className="text-xs text-blue-600 hover:text-blue-500 font-medium transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>

                <Button
                  type="submit"
                  disabled={loginMutation.isPending}
                  className="w-full h-12 text-sm font-semibold rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-200 group"
                >
                  {loginMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Signing in...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Sign in to Dashboard
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  )}
                </Button>
              </form>
            </Form>
          </motion.div>

          {/* Footer links */}
          <div className="mt-7 space-y-3 text-center">
            <p className="text-sm text-slate-500">
              New to {BRAND.name}?{" "}
              <Link
                to="/doc-register"
                className="text-blue-600 font-semibold hover:text-blue-500 transition-colors"
              >
                Register as a doctor
              </Link>
            </p>

            <p className="text-xs text-slate-400">
              Trouble signing in?{" "}
              <a
                href="mailto:support@mediczy.com?subject=Doctor%20Portal%20Login%20Help"
                className="font-semibold text-blue-600 hover:text-blue-500 transition-colors"
              >
                Contact support
              </a>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default DoctorLogin;
