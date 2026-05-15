
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion } from "framer-motion";
import { BRAND } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";
import { useNavigate, Link } from "react-router-dom";
import { MediqzyLogo3D } from "@/components/ui/MediqzyLogo3D";
import { Sparkles, Shield, CheckCircle2, Lock, Mail, ArrowRight } from "lucide-react";

const formSchema = z.object({
  email: z.string().min(1, "Email is required").email(),
  password: z.string().min(1, "Password is required"),
});


const CSSDLogin = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loginSuccess, setLoginSuccess] = useState(false);
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
    mode: "onChange",
  });

  const onSubmit = async (values: { email: string; password: string }) => {
    try {
      const { data } = await api.post("/cssd/login", values, { skipAuth: true });
      if (data?.token) {
        localStorage.setItem("cssdToken", data.token);
        setLoginSuccess(true);
        setTimeout(() => navigate("/cssd/dashboard"), 800);
      } else {
        throw new Error(data?.message || "Login failed");
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Login failed",
        description: error?.response?.data?.message || error?.message || "Please try again",
      });
    }
  };

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
              Welcome!
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
        {/* ─── LEFT PANEL ─── */}
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
              onClick={() => navigate("/cssd/dashboard")}
              className="flex items-center gap-2.5 self-start group mb-7"
            >
              <MediqzyLogo3D size="lg" interactive float />
              <span className="text-white/50 text-[11px] px-2.5 py-1 rounded-full border border-white/15 group-hover:border-white/35 transition-colors font-medium tracking-wide">
                CSSD
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
                CSSD management
              </div>
              <h2 className="text-[26px] font-extrabold text-white leading-tight">
                Manage CSSD,<br />
                <span className="bg-gradient-to-r from-blue-300 via-cyan-300 to-sky-200 bg-clip-text text-transparent">
                  ensure sterility
                </span>
              </h2>
              <p className="text-white/50 text-xs mt-2 leading-relaxed">
                Track, sterilize, and manage CSSD operations with full compliance and safety.
              </p>
            </motion.div>

            {/* Trust badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
              className="mt-5 pt-4 border-t border-white/10 grid grid-cols-3 gap-2"
            >
              {[
                { icon: Shield,      value: "NABH",    label: "Compliant"   },
                { icon: CheckCircle2, value: "99.99%",  label: "Uptime SLA" },
                { icon: Sparkles,    value: "AI Ready", label: "Automation"     },
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
              CSSD
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
              <Shield className="h-3.5 w-3.5" />
              CSSD
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Welcome back
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Sign in to access your CSSD dashboard
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
                {/* Email field */}
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <div className="relative">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none transition-colors duration-200">
                        <Mail className="h-4 w-4" />
                      </div>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          placeholder="Email"
                          autoComplete="username"
                          className="h-12 pl-10 pr-10 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        />
                      </FormControl>
                    </div>
                    <FormMessage className="text-xs mt-1" />
                  </FormItem>
                )} />

                {/* Password field */}
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="Password"
                          autoComplete="current-password"
                          className="h-12 pl-10 pr-12 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        />
                      </FormControl>
                    </div>
                    <FormMessage className="text-xs mt-1" />
                  </FormItem>
                )} />

                <Button type="submit" className="w-full h-12 text-sm font-semibold rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-200 group">
                  <span className="flex items-center gap-2">
                    Sign in to Dashboard
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </Button>
              </form>
            </Form>
          </motion.div>

          {/* Footer links */}
          <div className="mt-7 space-y-3 text-center">
            <p className="text-sm text-slate-500">
              New to {BRAND.name}? {" "}
              <Link
                to="#"
                className="text-blue-600 font-semibold hover:text-blue-500 transition-colors"
              >
                Request access
              </Link>
            </p>

            <p className="text-xs text-slate-400">
              Trouble signing in? {" "}
              <a
                href={`mailto:${BRAND.support.email}?subject=CSSD%20Portal%20Login%20Help`}
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

export default CSSDLogin;
