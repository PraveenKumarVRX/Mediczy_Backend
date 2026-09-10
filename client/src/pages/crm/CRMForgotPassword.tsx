import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, KeyRound, Lock, ArrowLeft, ArrowRight, Target } from 'lucide-react';
import api from '@/utils/api';

// CRM users are rows in the same `users` table the platform's "team" accounts
// live in, so this reuses the existing password-reset API with
// `userType: 'team'` — no CRM-specific backend endpoint was needed.
const USER_TYPE = 'team';

type Step = 'email' | 'otp' | 'reset' | 'done';

const CRMForgotPassword = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const requestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/password-reset/request', { email, userType: USER_TYPE }, { skipAuth: true } as any);
      if (data.success) {
        setInfo(data.message || 'If an account exists, an OTP has been sent.');
        setStep('otp');
      } else {
        setError(data.message || 'Unable to send OTP.');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/password-reset/verify-otp', { email, code, userType: USER_TYPE }, { skipAuth: true } as any);
      if (data.success && data.data?.resetToken) {
        setResetToken(data.data.resetToken);
        setStep('reset');
      } else {
        setError(data.message || 'Invalid or expired code.');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid or expired code.');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/password-reset/reset', { resetToken, newPassword, userType: USER_TYPE }, { skipAuth: true } as any);
      if (data.success) {
        setStep('done');
      } else {
        setError(data.message || 'Unable to reset password.');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0e1a] relative overflow-hidden p-6">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-violet-600/[0.07] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-600/[0.05] rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-[420px] space-y-8 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
            <Target className="h-4.5 w-4.5 text-white" />
          </div>
          <span className="text-lg font-bold text-white">Mediqzy CRM</span>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight mb-1.5">Reset your password</h2>
          <p className="text-sm text-slate-500">
            {step === 'email' && "Enter the email on your CRM login and we'll send you a code."}
            {step === 'otp' && `Enter the 6-digit code sent to ${email}.`}
            {step === 'reset' && 'Choose a new password for your CRM login.'}
            {step === 'done' && 'Your password has been reset.'}
          </p>
        </div>

        {error && (
          <Alert className="bg-red-500/10 border-red-500/20 text-red-300" role="alert">
            <AlertDescription className="text-sm">{error}</AlertDescription>
          </Alert>
        )}
        {info && step === 'otp' && (
          <Alert className="bg-emerald-500/10 border-emerald-500/20 text-emerald-300">
            <AlertDescription className="text-sm">{info}</AlertDescription>
          </Alert>
        )}

        {step === 'email' && (
          <form onSubmit={requestOtp} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Email</label>
              <div className="relative">
                <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com" disabled={loading}
                  className="h-12 pl-11 bg-white/[0.05] border-white/[0.08] text-white placeholder:text-slate-600 rounded-xl" />
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full h-12 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-semibold rounded-xl">
              {loading ? 'Sending…' : <span className="flex items-center gap-2">Send code <ArrowRight className="h-4 w-4" /></span>}
            </Button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={verifyOtp} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">6-digit code</label>
              <div className="relative">
                <Input required value={code} onChange={(e) => setCode(e.target.value)} maxLength={6}
                  placeholder="123456" disabled={loading}
                  className="h-12 pl-11 bg-white/[0.05] border-white/[0.08] text-white placeholder:text-slate-600 rounded-xl tracking-[0.3em]" />
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full h-12 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-semibold rounded-xl">
              {loading ? 'Verifying…' : 'Verify code'}
            </Button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={resetPassword} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">New password</label>
              <div className="relative">
                <Input required type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  minLength={6} disabled={loading}
                  className="h-12 pl-11 bg-white/[0.05] border-white/[0.08] text-white rounded-xl" />
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Confirm password</label>
              <div className="relative">
                <Input required type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={6} disabled={loading}
                  className="h-12 pl-11 bg-white/[0.05] border-white/[0.08] text-white rounded-xl" />
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full h-12 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-semibold rounded-xl">
              {loading ? 'Resetting…' : 'Reset password'}
            </Button>
          </form>
        )}

        {step === 'done' && (
          <Button onClick={() => navigate('/crm/login')} className="w-full h-12 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-semibold rounded-xl">
            Go to login
          </Button>
        )}

        <Link to="/crm/login" className="flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-300 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
      </div>
    </div>
  );
};

export default CRMForgotPassword;
