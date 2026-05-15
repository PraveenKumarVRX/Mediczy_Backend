
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { BRAND } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";
import { useNavigate, Link } from "react-router-dom";
import { MediqzyLogo3D } from "@/components/ui/MediqzyLogo3D";
import {
  Sparkles, Shield, CheckCircle2, Lock, Mail, ArrowRight, Eye, EyeOff,
  Utensils, Apple, Leaf, Heart, ChefHat, Salad,
} from "lucide-react";

const formSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
  remember: z.boolean().optional(),
});

const floatingIcons = [
  { Icon: Apple,   top: "12%",  left: "8%",  delay: 0,    size: 22, opacity: 0.18 },
  { Icon: Leaf,    top: "28%",  left: "82%", delay: 0.6,  size: 18, opacity: 0.14 },
  { Icon: Heart,   top: "55%",  left: "5%",  delay: 1.2,  size: 20, opacity: 0.16 },
  { Icon: ChefHat, top: "70%",  left: "88%", delay: 0.3,  size: 24, opacity: 0.13 },
  { Icon: Salad,   top: "82%",  left: "15%", delay: 0.9,  size: 19, opacity: 0.15 },
  { Icon: Utensils,top: "18%",  left: "74%", delay: 1.5,  size: 21, opacity: 0.12 },
];

const features = [
  { label: "FSSAI Compliant", desc: "Full food safety compliance" },
  { label: "AI-Powered Plans", desc: "Smart diet recommendations" },
  { label: "Real-time Alerts", desc: "Allergy & NPO notifications" },
  { label: "99.9% Uptime", desc: "Always-on reliability" },
];

const DietaryLogin = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "", remember: false },
    mode: "onChange",
  });

  const onSubmit = async (values: { email: string; password: string; remember?: boolean }) => {
    setIsSubmitting(true);
    try {
      const { data } = await api.post("/dietary/login", values, { skipAuth: true });
      if (data?.token) {
        localStorage.setItem("dietaryToken", data.token);
        if (values.remember) localStorage.setItem("dietaryRemember", values.email);
        setLoginSuccess(true);
        setTimeout(() => navigate("/dietary/dashboard"), 900);
      } else {
        throw new Error(data?.message || "Login failed");
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Login failed",
        description: error?.response?.data?.message || error?.message || "Please try again",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loginSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
            className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mx-auto shadow-2xl shadow-green-200"
          >
            <CheckCircle2 className="w-12 h-12 text-white" />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <p className="text-slate-900 font-bold text-xl">Welcome to Dietary Services!</p>
            <p className="text-slate-500 text-sm mt-1">Taking you to your dashboard…</p>
          </motion.div>
          <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.5, duration: 0.6 }}
            className="h-1 w-48 mx-auto rounded-full bg-gradient-to-r from-green-400 to-emerald-500"
          />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#f0fdf4]">
      {/* Soft mesh background */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 80% 50% at 20% 20%, rgba(134,239,172,0.18), transparent), radial-gradient(ellipse 60% 60% at 80% 80%, rgba(52,211,153,0.12), transparent)",
      }} />
      <div className="absolute inset-0 pointer-events-none opacity-[0.025]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23166534' fill-opacity='1'%3E%3Cpath d='M20 20h2v2h-2zm-10 0h2v2h-2zm20 0h2v2h-2zm-10-10h2v2h-2zm0 20h2v2h-2z'/%3E%3C/g%3E%3C/svg%3E")`,
      }} />

      {/* Floating icons */}
      {floatingIcons.map(({ Icon, top, left, delay, size, opacity }) => (
        <motion.div
          key={`${top}-${left}`}
          className="absolute pointer-events-none"
          style={{ top, left }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity, y: [0, -12, 0] }}
          transition={{ opacity: { delay, duration: 0.8 }, y: { delay, duration: 3.5 + delay, repeat: Infinity, ease: "easeInOut" } }}
        >
          <Icon style={{ width: size, height: size }} className="text-green-700" />
        </motion.div>
      ))}

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] overflow-hidden rounded-2xl bg-white shadow-[0_8px_80px_-12px_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.04)] relative z-10"
      >
        {/* ─── LEFT PANEL ─── */}
        <div
          className="hidden lg:flex flex-col relative overflow-hidden"
          style={{ background: "linear-gradient(150deg, #052e16 0%, #14532d 30%, #166534 60%, #15803d 85%, #16a34a 100%)" }}
        >
          {/* Mesh blobs */}
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, #4ade80, transparent)" }} />
          <div className="absolute top-1/2 -left-16 w-60 h-60 rounded-full opacity-15 blur-3xl" style={{ background: "radial-gradient(circle, #86efac, transparent)" }} />
          <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full opacity-10 blur-3xl" style={{ background: "radial-gradient(circle, #34d399, transparent)" }} />
          <div className="absolute inset-0 opacity-[0.06]" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1.5' cy='1.5' r='1.5' fill='white'/%3E%3C/svg%3E")`,
          }} />

          <div className="relative z-10 flex flex-col h-full p-9">
            {/* Logo */}
            <motion.button
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              onClick={() => navigate("/dietary/dashboard")}
              className="flex items-center gap-3 self-start group mb-8"
            >
              <MediqzyLogo3D size="lg" interactive float />
              <div className="flex flex-col">
                <span className="text-white/80 text-[10px] font-bold tracking-widest uppercase">Dietary</span>
                <span className="text-white/40 text-[9px] tracking-wide">Services Portal</span>
              </div>
            </motion.button>

            {/* Headline */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} className="mb-8">
              <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-4 text-[11px] font-semibold text-green-200 border border-green-400/25" style={{ background: "rgba(74,222,128,0.08)" }}>
                <Sparkles className="h-3 w-3" />
                AI-Powered Nutrition Management
              </div>
              <h2 className="text-[28px] font-extrabold text-white leading-tight">
                Nourish patients,<br />
                <span className="bg-gradient-to-r from-green-300 via-emerald-300 to-teal-200 bg-clip-text text-transparent">
                  heal with food.
                </span>
              </h2>
              <p className="text-white/50 text-xs mt-3 leading-relaxed">
                Complete dietary management — from personalized meal plans and allergy tracking to real-time kitchen coordination.
              </p>
            </motion.div>

            {/* Feature list */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="space-y-3 mb-8">
              {features.map(({ label, desc }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.08 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-6 h-6 rounded-full bg-green-500/20 border border-green-400/30 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-300" />
                  </div>
                  <div>
                    <span className="text-white/90 text-xs font-semibold">{label}</span>
                    <span className="text-white/40 text-[10px] ml-2">{desc}</span>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Trust badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
              className="mt-auto pt-5 border-t border-white/10 grid grid-cols-2 gap-3"
            >
              {[
                { icon: Shield, value: "FSSAI", label: "Certified" },
                { icon: Utensils, value: "500+", label: "Diet Types" },
                { icon: CheckCircle2, value: "Zero", label: "Allergy Errors" },
                { icon: Sparkles, value: "AI", label: "Recommendations" },
              ].map(({ icon: Icon, value, label }) => (
                <div key={label} className="flex items-center gap-2.5 bg-white/5 rounded-xl p-2.5">
                  <Icon className="h-4 w-4 text-green-300 shrink-0" />
                  <div>
                    <p className="text-white font-bold text-xs leading-none">{value}</p>
                    <p className="text-white/40 text-[10px] mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* ─── RIGHT FORM PANEL ─── */}
        <div className="flex flex-col px-8 py-10 lg:px-11 lg:py-12 bg-white overflow-y-auto">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <MediqzyLogo3D size="md" theme="dark" />
            <span className="text-slate-400 text-xs border border-slate-200 rounded-full px-2 py-0.5">Dietary</span>
          </div>

          {/* Heading */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mb-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-green-50 border border-green-100 px-3 py-1.5 text-xs font-semibold text-green-700 mb-3">
              <Utensils className="h-3.5 w-3.5" />
              Dietary Services
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome back</h1>
            <p className="text-slate-500 text-sm mt-1">Sign in to manage patient nutrition</p>
          </motion.div>

          {/* Form */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Email */}
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          placeholder="Email address"
                          autoComplete="username"
                          className="h-12 pl-10 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
                        />
                      </FormControl>
                    </div>
                    <FormMessage className="text-xs mt-1" />
                  </FormItem>
                )} />

                {/* Password */}
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <FormControl>
                        <Input
                          {...field}
                          type={showPassword ? "text" : "password"}
                          placeholder="Password"
                          autoComplete="current-password"
                          className="h-12 pl-10 pr-12 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
                        />
                      </FormControl>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        tabIndex={-1}
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.div key={showPassword ? "off" : "on"} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ duration: 0.15 }}>
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </motion.div>
                        </AnimatePresence>
                      </button>
                    </div>
                    <FormMessage className="text-xs mt-1" />
                  </FormItem>
                )} />

                {/* Remember me + Forgot */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      {...form.register("remember")}
                      className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500 cursor-pointer"
                    />
                    <span className="text-xs text-slate-500 group-hover:text-slate-700 transition-colors">Remember me</span>
                  </label>
                  <a href="#" className="text-xs text-green-600 hover:text-green-500 font-semibold transition-colors">
                    Forgot password?
                  </a>
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-12 text-sm font-semibold rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-70 shadow-md shadow-green-500/20 hover:shadow-lg hover:shadow-green-500/30 transition-all duration-200 group"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {isSubmitting ? (
                      <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                        Signing in…
                      </motion.span>
                    ) : (
                      <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                        Sign in to Dashboard
                        <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Button>
              </form>
            </Form>
          </motion.div>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-xs text-slate-400 font-medium">Dietary Staff Portal</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          {/* Security badge */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
            className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-100"
          >
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-green-800">256-bit SSL Encrypted</p>
              <p className="text-[10px] text-green-600 mt-0.5">FSSAI & HIPAA compliant session</p>
            </div>
          </motion.div>

          {/* Footer */}
          <div className="mt-6 space-y-2 text-center">
            <p className="text-sm text-slate-500">
              Need access?{" "}
              <Link to="#" className="text-green-600 font-semibold hover:text-green-500 transition-colors">
                Request account
              </Link>
            </p>
            <p className="text-xs text-slate-400">
              Having trouble?{" "}
              <a href={`mailto:${BRAND.support.email}?subject=Dietary+Portal+Help`} className="font-semibold text-green-600 hover:text-green-500 transition-colors">
                Contact support
              </a>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default DietaryLogin;
