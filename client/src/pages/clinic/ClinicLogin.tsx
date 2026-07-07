import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, Eye, EyeOff, Loader2, Lock, ArrowRight, Clock, ShieldCheck, Stethoscope, HeartPulse } from 'lucide-react';
import api from '@/utils/api';
import { clearAuthTokens, setAuthData } from '@/hooks/auth';

const ClinicLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('clinicToken');
    if (token) {
      localStorage.setItem('token', token);
      localStorage.setItem('userType', 'clinic');
      window.dispatchEvent(new CustomEvent('authChange'));
      navigate('/clinic/dashboard', { replace: true });
      return;
    }

    if (localStorage.getItem('token') || localStorage.getItem('userType')) {
      clearAuthTokens();
    }
    
    setIsCheckingAuth(false);
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const { data } = await api.post('/clinic/login', { email, password }, { signal: controller.signal, skipAuth: true });

      clearTimeout(timeoutId);

      setAuthData(data.token, 'clinic', data.clinic?.id);
      localStorage.setItem('clinicData', JSON.stringify(data.clinic));
      
      navigate('/clinic/dashboard', { replace: true });
    } catch (err: any) {
      console.error('Clinic login error:', err);
      if (err?.response?.data?.pending) { setIsPending(true); return; }
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') {
        setError('Request timeout. Please check your connection and try again.');
      } else {
        setError(err?.response?.data?.message || err?.message || 'Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#07101f]">
        <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#07101f] overflow-hidden">
      {/* ── Ambient background blobs ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-teal-500/10 blur-[100px]" />
        <div className="absolute -bottom-24 -left-24 w-[400px] h-[400px] rounded-full bg-cyan-600/8 blur-[80px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full bg-teal-900/20 blur-[120px]" />
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center px-4 py-12">

        {/* ── Top brand strip ── */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-2 mb-10"
        >
          <HeartPulse className="w-5 h-5 text-teal-400" />
          <span className="text-sm font-bold tracking-widest text-teal-400/80 uppercase">Mediczy</span>
        </motion.div>

        {/* ── Main card ── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-sm"
        >
          {/* Icon badge */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-teal-500/30 blur-2xl rounded-full scale-150" />
              <div className="relative bg-gradient-to-br from-teal-500 to-cyan-600 p-4 rounded-2xl shadow-2xl shadow-teal-900/50">
                <Building2 className="h-9 w-9 text-white" />
              </div>
            </div>
          </div>

          {/* Heading */}
          <div className="text-center mb-7">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Clinic Portal</h1>
            <p className="text-slate-400 text-sm mt-1.5">Sign in to your clinic management dashboard</p>
          </div>

          {/* Glass card */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5">

            {/* Pending banner */}
            {isPending && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl"
              >
                <Clock className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold text-amber-300 text-sm">Account Pending Admin Approval</p>
                  <p className="text-amber-400/80 text-xs mt-1 leading-relaxed">
                    Your registration has been received and is awaiting review by our team. You'll receive an email at the address you registered with once your account is approved — typically within 24–48 hours.
                  </p>
                  <p className="text-amber-400/60 text-xs mt-1.5">
                    Questions? Email <a href="mailto:support@mediqzy.com" className="underline text-amber-300">support@mediqzy.com</a>
                  </p>
                </div>
              </motion.div>
            )}

            {/* Error banner */}
            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl"
              >
                <Lock className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-red-300 text-sm">{error}</p>
              </motion.div>
            )}

            <form onSubmit={onSubmit} className="space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Email Address</label>
                <div className="relative">
                  <input
                    type="email"
                    placeholder="clinic@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full h-12 bg-white/6 border border-white/10 rounded-xl px-4 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-teal-500/60 focus:ring-2 focus:ring-teal-500/20 transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full h-12 bg-white/6 border border-white/10 rounded-xl px-4 pr-12 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-teal-500/60 focus:ring-2 focus:ring-teal-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </div>

              {/* Sign in button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 mt-1 flex items-center justify-center gap-2.5 rounded-xl font-extrabold text-sm bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 active:scale-95 text-white shadow-lg shadow-teal-900/50 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/8" />
              <span className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold">or</span>
              <div className="flex-1 h-px bg-white/8" />
            </div>

            {/* Register button */}
            <button
              type="button"
              onClick={() => navigate('/clinic/register')}
              className="w-full h-11 flex items-center justify-center gap-2 rounded-xl border border-teal-500/40 text-teal-400 font-bold text-sm hover:bg-teal-500/10 hover:border-teal-400/60 active:scale-95 transition-all duration-200"
            >
              <Building2 className="h-4 w-4" />
              Register New Clinic
            </button>
          </div>

          {/* Trust badges */}
          <div className="flex items-center justify-center gap-5 mt-6">
            {[
              { icon: ShieldCheck, label: "HIPAA Secure" },
              { icon: Stethoscope, label: "Certified Platform" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-[10px] text-slate-600 font-semibold uppercase tracking-wide">
                <Icon className="w-3.5 h-3.5 text-teal-700" />
                {label}
              </div>
            ))}
          </div>

          {/* Support link */}
          <p className="text-center text-xs text-slate-600 mt-4">
            Need help?{' '}
            <a href="mailto:support@mediczy.com" className="text-teal-500 hover:text-teal-400 font-semibold transition-colors">
              support@mediczy.com
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default ClinicLogin;
