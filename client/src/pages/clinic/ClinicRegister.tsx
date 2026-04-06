import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/utils/api";
import {
  Building2, Mail, Lock, Phone, MapPin, FileText, Upload, X, CheckCircle2,
  Eye, EyeOff, ChevronRight, AlertCircle, Stethoscope, Users, BookOpen,
  Shield, HeartPulse, Sparkles, ArrowLeft, MessageCircle, RefreshCw,
  GraduationCap, UserCheck,
} from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────────
const CLINIC_TYPES = [
  "General Practice","Specialty Clinic","Polyclinic","Day Care",
  "Dental Clinic","Eye Clinic","Skin & Dermatology","Orthopaedic",
  "Paediatric Clinic","ENT Clinic","Gynaecology Clinic","Psychiatric Clinic",
];
const REQUIRED_DOCS = [
  { id: "reg_cert",      label: "Registration Certificate",    hint: "Clinic/hospital registration from state authority" },
  { id: "owner_id",      label: "Owner / Director ID Proof",   hint: "Aadhar, Passport, or Driving License" },
  { id: "address_proof", label: "Address Proof",               hint: "Utility bill, lease agreement, or property document" },
];
const STEPS = ["Account","Verify Email","Clinic Details","Verify Phone","Documents"];
const SYSTEMS_OF_MEDICINE = [
  "Allopathy","Homeopathy","Ayurveda","Unani","Siddha",
  "Naturopathy","Yoga & Naturopathy","Dental","Veterinary","Other",
];

interface UploadedFile { file: File; docType: string; }
const fmtBytes = (b: number) => b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;

// ── OTP digit input ──────────────────────────────────────────────────────────
function OtpInput({ value, onChange, disabled, status = "idle" }: { value: string; onChange: (v: string) => void; disabled?: boolean; status?: "idle" | "verifying" | "success" | "error" }) {
  const r0 = useRef<HTMLInputElement>(null);
  const r1 = useRef<HTMLInputElement>(null);
  const r2 = useRef<HTMLInputElement>(null);
  const r3 = useRef<HTMLInputElement>(null);
  const r4 = useRef<HTMLInputElement>(null);
  const r5 = useRef<HTMLInputElement>(null);
  const inputRefs = [r0, r1, r2, r3, r4, r5];

  const handleChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const char = e.target.value.replace(/\D/g, "").slice(-1);
    if (!char) { 
      const next = value.slice(0, i) + value.slice(i + 1);
      onChange(next);
      return;
    }
    const arr = value.split("").slice(0, 6);
    arr[i] = char;
    const next = arr.join("").slice(0, 6);
    onChange(next);
    if (i < 5) inputRefs[i + 1]?.current?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[i]) {
        onChange(value.slice(0, i) + value.slice(i + 1));
      } else if (i > 0) {
        inputRefs[i - 1]?.current?.focus();
        onChange(value.slice(0, i - 1) + value.slice(i));
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) { onChange(pasted); inputRefs[Math.min(pasted.length, 5)]?.current?.focus(); }
    e.preventDefault();
  };

  return (
    <div className="flex gap-2 sm:gap-3 justify-center" onPaste={handlePaste}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={inputRefs[i]}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ""}
          disabled={disabled}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKeyDown(i, e)}
          onFocus={e => e.target.select()}
          className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold rounded-xl border-2 transition-all duration-200 outline-none
            ${value[i]
              ? status === "error"
                ? "border-red-400 bg-red-500/10 text-red-300 shadow-[0_0_14px_rgba(239,68,68,0.3)]"
                : status === "verifying"
                ? "border-amber-400/60 bg-amber-500/10 text-amber-300"
                : "border-teal-400 bg-teal-500/10 text-teal-300 shadow-[0_0_14px_rgba(20,184,166,0.3)]"
              : "border-white/12 bg-white/5 text-white focus:border-teal-500/60 focus:bg-white/8"}
            ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          `}
        />
      ))}
    </div>
  );
}

// ── Floating ambient blobs ───────────────────────────────────────────────────
function BgBlobs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
      <div className="absolute -top-48 -right-48 w-[650px] h-[650px] rounded-full bg-teal-500/8 blur-[120px]" />
      <div className="absolute -bottom-24 -left-24 w-[450px] h-[450px] rounded-full bg-cyan-600/5 blur-[80px]" />
      <div className="absolute top-1/3 left-1/4 w-[350px] h-[250px] rounded-full bg-teal-900/15 blur-[60px]" />
    </div>
  );
}

// ── Step progress ────────────────────────────────────────────────────────────
function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-1 flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-400 ${ 
              i < step
                ? "bg-teal-500 text-white shadow-[0_0_10px_rgba(20,184,166,0.5)]"
                : i === step
                ? "bg-gradient-to-br from-teal-400 to-cyan-500 text-white ring-2 ring-teal-400/40 ring-offset-2 ring-offset-[#07101f] shadow-[0_0_18px_rgba(20,184,166,0.6)]"
                : "bg-white/5 text-slate-600 border border-white/10"
            }`}>
              {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-[8px] font-semibold uppercase tracking-wider hidden sm:block ${ 
              i === step ? "text-teal-400" : i < step ? "text-teal-600" : "text-slate-700"
            }`}>{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className="flex-1 h-px mx-1 rounded-full overflow-hidden bg-white/8">
              <div className={`h-full rounded-full transition-all duration-600 ${i < step ? "bg-gradient-to-r from-teal-500 to-cyan-500 w-full" : "w-0"}`} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Reusable dark input ──────────────────────────────────────────────────────
function DField({ label, hint, children, required }: { label: string; hint?: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-[0.12em] mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{hint}</p>}
    </div>
  );
}

function DInput({ icon: IconComp, className = "", ...props }: { icon?: React.ComponentType<{ className?: string }> } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      {IconComp && <IconComp className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />}
      <input
        {...props}
        className={`w-full h-11 bg-white/[0.04] border border-white/[0.09] rounded-xl text-white placeholder:text-slate-600 text-sm
          focus:outline-none focus:border-teal-500/50 focus:bg-white/[0.07] focus:ring-1 focus:ring-teal-500/25 transition-all
          ${IconComp ? "pl-10" : "pl-4"} pr-4 ${className}`}
      />
    </div>
  );
}

// ── Error banner ─────────────────────────────────────────────────────────────
function ErrBanner({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2.5 p-3.5 bg-red-500/10 border border-red-500/25 rounded-2xl mb-5">
      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
      <p className="text-red-300 text-sm leading-snug">{msg}</p>
    </motion.div>
  );
}

// ── Primary CTA button ───────────────────────────────────────────────────────
function PrimaryBtn({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...props}
      className={`w-full h-12 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-bold text-sm
        shadow-[0_4px_24px_rgba(20,184,166,0.35)] hover:shadow-[0_4px_36px_rgba(20,184,166,0.55)]
        hover:from-teal-400 hover:to-cyan-400 transition-all flex items-center justify-center gap-2
        disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >{children}</button>
  );
}

// ── Back link ─────────────────────────────────────────────────────────────────
function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full mt-5 flex items-center justify-center gap-2 text-slate-500 text-sm hover:text-slate-300 transition-colors">
      <ArrowLeft className="w-4 h-4" /> Back
    </button>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function ClinicRegister() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  // Bot protection: record when the form page was first loaded
  const formArrivalTime = useRef<number>(Date.now());

  const [form, setForm] = useState({
    name: "", email: "", password: "", confirmPassword: "",
    phone: "", clinicType: "General Practice",
    city: "", state: "", address: "", registrationNumber: "",
    doctorName: "", doctorQualification: "", doctorSpecialty: "",
    systemOfMedicine: "Allopathy", doctorRegNumber: "", medicalCouncil: "",
  });
  const [doctorIdCard, setDoctorIdCard] = useState<File | null>(null);
  const doctorIdCardRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  // — Email OTP state —
  const [emailOtp, setEmailOtp] = useState("");
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpLoading, setEmailOtpLoading] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);

  // — Phone OTP state —
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtpLoading, setPhoneOtpLoading] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);

  // — OTP inline status —
  const [emailOtpStatus, setEmailOtpStatus] = useState<"idle"|"verifying"|"success"|"error">("idle");
  const [phoneOtpStatus, setPhoneOtpStatus] = useState<"idle"|"verifying"|"success"|"error">("idle");

  // — Countdown for resend —
  const [countdown, setCountdown] = useState(0);
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // — Files —
  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const allowed = ["application/pdf","image/jpeg","image/jpg","image/png","image/webp"];
    const newFiles: UploadedFile[] = Array.from(files)
      .filter(f => allowed.includes(f.type) && f.size <= 10 * 1024 * 1024)
      .map((f, idx) => ({ file: f, docType: REQUIRED_DOCS[uploadedFiles.length + idx]?.id || "other" }));
    setUploadedFiles(prev => [...prev, ...newFiles].slice(0, 5));
  }, [uploadedFiles.length]);
  const removeFile = (idx: number) => setUploadedFiles(f => f.filter((_, i) => i !== idx));

  // ── Send Email OTP ──
  const sendEmailOtp = async () => {
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError("Enter a valid email address first");
    setEmailOtpLoading(true); setError("");
    try {
      await api.post("/clinic/send-email-otp", { email: form.email }, { skipAuth: true } as any);
      setEmailOtpSent(true);
      setCountdown(60);
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to send OTP. Please try again.");
    } finally { setEmailOtpLoading(false); }
  };

  // ── Verify Email OTP ──
  const verifyEmailOtp = async (inlineCode?: string) => {
    const code = inlineCode ?? emailOtp;
    if (code.length !== 6) return setError("Enter the complete 6-digit OTP");
    setEmailOtpStatus("verifying");
    setLoading(true); setError("");
    try {
      await api.post("/clinic/verify-email-otp", { email: form.email, code }, { skipAuth: true } as any);
      setEmailOtpStatus("success");
      setEmailVerified(true);
      setTimeout(() => setStep(2), 700);
    } catch (e: any) {
      setEmailOtpStatus("error");
      setError(e.response?.data?.message || "Incorrect OTP. Please try again.");
      setTimeout(() => { setEmailOtp(""); setEmailOtpStatus("idle"); }, 1500);
    } finally { setLoading(false); }
  };

  // ── Send Phone OTP (WhatsApp) ──
  const sendPhoneOtp = async () => {
    if (!form.phone.trim()) return setError("Enter your phone number first");
    setPhoneOtpLoading(true); setError("");
    try {
      await api.post("/clinic/send-phone-otp", { phone: form.phone }, { skipAuth: true } as any);
      setPhoneOtpSent(true);
      setCountdown(60);
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to send OTP. Check your phone number.");
    } finally { setPhoneOtpLoading(false); }
  };

  // ── Verify Phone OTP ──
  const verifyPhoneOtp = async (inlineCode?: string) => {
    const code = inlineCode ?? phoneOtp;
    if (code.length !== 6) return setError("Enter the complete 6-digit OTP");
    setPhoneOtpStatus("verifying");
    setLoading(true); setError("");
    try {
      await api.post("/clinic/verify-phone-otp", { phone: form.phone, code }, { skipAuth: true } as any);
      setPhoneOtpStatus("success");
      setPhoneVerified(true);
      setTimeout(() => setStep(4), 700);
    } catch (e: any) {
      setPhoneOtpStatus("error");
      setError(e.response?.data?.message || "Incorrect OTP. Please try again.");
      setTimeout(() => { setPhoneOtp(""); setPhoneOtpStatus("idle"); }, 1500);
    } finally { setLoading(false); }
  };

  // ── Step validations ──
  const validateStep0 = () => {
    if (!form.name.trim()) return setError("Clinic name is required"), false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError("Enter a valid email address"), false;
    if (form.password.length < 8) return setError("Password must be at least 8 characters"), false;
    if (form.password !== form.confirmPassword) return setError("Passwords do not match"), false;
    return true;
  };
  const validateStep2 = () => {
    if (!form.phone.trim()) return setError("Phone number is required"), false;
    if (!form.city.trim()) return setError("City is required"), false;
    if (!form.doctorName.trim()) return setError("Doctor name is required"), false;
    if (!form.doctorQualification.trim()) return setError("Doctor qualification is required"), false;
    if (!form.doctorSpecialty.trim()) return setError("Doctor specialty is required"), false;
    if (!form.doctorRegNumber.trim()) return setError("Doctor registration number is required"), false;
    if (!form.medicalCouncil.trim()) return setError("Medical council name is required"), false;
    if (!doctorIdCard) return setError("Doctor ID card upload is required"), false;
    return true;
  };

  // ── Final submit ──
  const handleSubmit = async () => {
    setLoading(true); setError("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      uploadedFiles.forEach((u, i) => { fd.append("documents", u.file); fd.append(`docType_${i}`, u.docType); });
      if (doctorIdCard) fd.append("doctorIdCard", doctorIdCard);
      // Bot protection fields
      fd.append("_hp", "");                                          // honeypot — always empty
      fd.append("_fat", String(formArrivalTime.current));            // form arrival time
      await api.post("/clinic/register", fd, { headers: { "Content-Type": "multipart/form-data" }, skipAuth: true } as any);
      setStep(5);
    } catch (e: any) {
      setError(e.response?.data?.message || "Registration failed. Please try again.");
    } finally { setLoading(false); }
  };

  const goBack = () => { setError(""); setStep(s => Math.max(0, s - 1)); };

  return (
    <div className="min-h-screen bg-[#07101f] text-white flex overflow-hidden">
      <BgBlobs />

      {/* ───── Left decorative panel (xl+) ───── */}
      <div className="hidden xl:flex w-[400px] shrink-0 flex-col relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-600/85 via-teal-800/75 to-[#07101f]" />
        {/* dot grid */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
          <defs><pattern id="dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="white" />
          </pattern></defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
        </svg>
        <div className="absolute -top-28 -right-28 w-96 h-96 rounded-full bg-teal-400/15 blur-[80px] pointer-events-none" />
        <div className="absolute bottom-16 -left-12 w-56 h-56 rounded-full bg-cyan-500/15 blur-[60px] pointer-events-none" />

        <div className="relative z-10 flex flex-col h-full p-10">
          {/* Brand */}
          <div className="flex items-center gap-3 mb-14">
            <div className="w-10 h-10 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20">
              <HeartPulse className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-black text-xl tracking-tight">Mediczy</span>
          </div>

          <div className="flex-1">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full border border-white/15 mb-5">
                <Sparkles className="w-3.5 h-3.5 text-teal-300" />
                <span className="text-teal-200 text-xs font-bold tracking-wide">India's #1 Clinic Platform</span>
              </div>
              <h1 className="text-[2.4rem] font-black text-white leading-[1.1] mb-4">
                Register Your<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-300 to-cyan-300">Clinic Today</span>
              </h1>
              <p className="text-teal-100/65 text-sm leading-relaxed mb-10">
                Join 2,000+ clinics transforming patient care across India with smart digital health tools.
              </p>
            </motion.div>

            <div className="space-y-3">
              {[
                { icon: Stethoscope, title: "Smart Appointments",      desc: "AI scheduling with auto-reminders" },
                { icon: FileText,    title: "Digital EMR",             desc: "ABDM-compliant paperless records" },
                { icon: Users,       title: "Multi-Doctor Management", desc: "Manage your entire team effortlessly" },
                { icon: BookOpen,    title: "Revenue & Analytics",     desc: "Real-time business insight dashboard" },
              ].map((f, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.08 }}
                  className="flex items-center gap-3.5 p-3 bg-white/[0.07] backdrop-blur-sm rounded-2xl border border-white/[0.09]">
                  <div className="w-9 h-9 bg-teal-500/25 rounded-xl flex items-center justify-center shrink-0">
                    <f.icon className="w-4.5 h-4.5 text-teal-300" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">{f.title}</p>
                    <p className="text-teal-200/55 text-xs mt-0.5">{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="mt-8 p-4 bg-white/[0.07] rounded-2xl border border-white/[0.09]">
            <div className="flex items-center gap-2 mb-1.5">
              <Shield className="w-4 h-4 text-teal-300" />
              <span className="text-white text-xs font-bold">ABDM & HIPAA Compliant</span>
            </div>
            <p className="text-teal-200/55 text-xs">Data encrypted, DISHA-compliant &amp; audited annually.</p>
          </div>
        </div>
      </div>

      {/* ───── Right: multi-step form ───── */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10 overflow-y-auto relative z-10">
        <div className="w-full max-w-[460px]">

          {/* Mobile brand strip */}
          <div className="flex xl:hidden items-center gap-2 justify-center mb-8">
            <HeartPulse className="w-5 h-5 text-teal-400" />
            <span className="text-sm font-black tracking-widest text-teal-400/80 uppercase">Mediczy</span>
          </div>

          {step < 5 && <StepBar step={step} />}

          <AnimatePresence mode="wait">

            {/* ── Step 0 : Account creation ── */}
            {step === 0 && (
              <motion.div key="s0" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ duration: 0.22 }}>
                <div className="mb-7">
                  <h2 className="text-[1.65rem] font-black text-white mb-1">Create your account</h2>
                  <p className="text-slate-500 text-sm">Set up your clinic's secure login credentials</p>
                </div>

                <ErrBanner msg={error} />

                <div className="space-y-4">
                  <DField label="Clinic Name">
                    <DInput icon={Building2} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Apollo Clinic, Koramangala" />
                  </DField>

                  <DField label="Email Address" required hint="A verification OTP will be sent to this address">
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none z-10" />
                      <input
                        type="email" value={form.email}
                        onChange={e => set("email", e.target.value)}
                        placeholder="clinic@example.com"
                        className={`w-full h-11 bg-white/[0.04] border rounded-xl text-white placeholder:text-slate-600 text-sm focus:outline-none focus:ring-1 transition-all pl-10 pr-10
                          ${form.email.length > 0
                            ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
                              ? "border-teal-500/50 focus:border-teal-500/70 focus:ring-teal-500/25"
                              : "border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20"
                            : "border-white/[0.09] focus:border-teal-500/50 focus:ring-teal-500/25"
                          }`}
                      />
                      {form.email.length > 0 && (
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
                          {/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
                            ? <CheckCircle2 className="w-4 h-4 text-teal-400" />
                            : <AlertCircle className="w-4 h-4 text-red-400" />
                          }
                        </span>
                      )}
                    </div>
                  </DField>

                  <DField label="Password">
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                      <input
                        type={showPass ? "text" : "password"}
                        value={form.password} onChange={e => set("password", e.target.value)}
                        placeholder="Minimum 8 characters"
                        className="w-full h-11 bg-white/[0.04] border border-white/[0.09] rounded-xl text-white placeholder:text-slate-600 text-sm focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/25 transition-all pl-10 pr-11"
                      />
                      <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </DField>

                  <DField label="Confirm Password">
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                      <input
                        type={showConfirm ? "text" : "password"}
                        value={form.confirmPassword} onChange={e => set("confirmPassword", e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full h-11 bg-white/[0.04] border border-white/[0.09] rounded-xl text-white placeholder:text-slate-600 text-sm focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/25 transition-all pl-10 pr-11"
                      />
                      <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </DField>
                </div>

                {/* Honeypot: visually hidden, never filled by real users */}
                <div aria-hidden="true" style={{ position: "absolute", opacity: 0, height: 0, width: 0, overflow: "hidden", pointerEvents: "none" }}>
                  <input type="text" name="_hp" autoComplete="off" tabIndex={-1} defaultValue="" />
                </div>

                <PrimaryBtn className="mt-7" onClick={() => { setError(""); if (validateStep0()) { setStep(1); setEmailOtpSent(false); setEmailOtp(""); } }}>
                  Continue to Email Verification <ChevronRight className="w-4 h-4" />
                </PrimaryBtn>
                <p className="text-center text-sm text-slate-600 mt-5">
                  Already registered? <Link to="/clinic/login" className="text-teal-400 font-semibold hover:text-teal-300 transition-colors">Sign in</Link>
                </p>
              </motion.div>
            )}

            {/* ── Step 1 : Email OTP ── */}
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ duration: 0.22 }}>
                <div className="text-center mb-7">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 220, delay: 0.05 }}
                    className="w-16 h-16 mx-auto mb-4 bg-teal-500/[0.12] rounded-2xl border border-teal-500/25 flex items-center justify-center">
                    <Mail className="w-8 h-8 text-teal-400" />
                  </motion.div>
                  <h2 className="text-[1.65rem] font-black text-white mb-1">Verify your email</h2>
                  <p className="text-slate-500 text-sm">
                    {emailOtpSent
                      ? <>OTP sent to <span className="text-teal-400 font-semibold">{form.email}</span></>
                      : <>We'll send a code to <span className="text-teal-400 font-semibold">{form.email}</span></>
                    }
                  </p>
                </div>

                <ErrBanner msg={error} />

                {emailVerified ? (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    className="p-6 bg-teal-500/10 border border-teal-500/30 rounded-2xl text-center">
                    <CheckCircle2 className="w-10 h-10 text-teal-400 mx-auto mb-2" />
                    <p className="text-teal-300 font-bold text-lg">Email Verified!</p>
                    <p className="text-slate-500 text-sm mt-1">Proceeding to clinic details…</p>
                  </motion.div>
                ) : !emailOtpSent ? (
                  <PrimaryBtn onClick={sendEmailOtp} disabled={emailOtpLoading}>
                    {emailOtpLoading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</> : <><Mail className="w-4 h-4" /> Send OTP to Email</>}
                  </PrimaryBtn>
                ) : (
                  <div className="space-y-5">
                    <div className="text-center text-xs text-slate-600 mb-1">Enter the 6-digit code from your inbox</div>
                    <OtpInput
                      value={emailOtp}
                      onChange={v => { setEmailOtp(v); setEmailOtpStatus("idle"); setError(""); if (v.length === 6) verifyEmailOtp(v); }}
                      disabled={emailOtpStatus === "verifying" || emailOtpStatus === "success"}
                      status={emailOtpStatus}
                    />
                    <div className="text-center min-h-[20px]">
                      {emailOtpStatus === "verifying" && (
                        <p className="text-amber-400 text-xs flex items-center justify-center gap-1.5">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Verifying…
                        </p>
                      )}
                      {emailOtpStatus === "error" && (
                        <p className="text-red-400 text-xs flex items-center justify-center gap-1.5">
                          <AlertCircle className="w-3 h-3" /> Incorrect OTP — clearing in a moment
                        </p>
                      )}
                    </div>
                    <div className="text-center">
                      {countdown > 0
                        ? <p className="text-slate-500 text-sm">Resend in <span className="text-teal-400 font-bold tabular-nums">{countdown}s</span></p>
                        : <button type="button" onClick={sendEmailOtp} disabled={emailOtpLoading} className="text-teal-400 text-sm font-semibold hover:text-teal-300 transition-colors inline-flex items-center gap-1.5">
                            <RefreshCw className={`w-3.5 h-3.5 ${emailOtpLoading ? "animate-spin" : ""}`} /> Resend OTP
                          </button>
                      }
                    </div>
                  </div>
                )}

                <BackBtn onClick={goBack} />
              </motion.div>
            )}

            {/* ── Step 2 : Clinic details ── */}
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ duration: 0.22 }}>
                <div className="mb-7">
                  <h2 className="text-[1.65rem] font-black text-white mb-1">Clinic details</h2>
                  <p className="text-slate-500 text-sm">Tell us about your practice</p>
                </div>

                <ErrBanner msg={error} />

                <div className="space-y-4">
                  <DField label="Phone Number" required hint="You'll receive a WhatsApp OTP to verify this number">
                    <div className="flex gap-2">
                      <div className="flex items-center gap-1.5 px-3 h-11 bg-white/[0.04] border border-white/[0.09] rounded-xl shrink-0">
                        <span className="text-base">🇮🇳</span>
                        <span className="text-slate-400 text-sm font-semibold">+91</span>
                      </div>
                      <div className="relative flex-1">
                        <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                        <input
                          type="tel" value={form.phone}
                          onChange={e => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                          placeholder="98765 43210"
                          className={`w-full h-11 bg-white/[0.04] border rounded-xl text-white placeholder:text-slate-600 text-sm focus:outline-none focus:ring-1 transition-all pl-10 pr-10
                            ${form.phone.length > 0
                              ? form.phone.length === 10
                                ? "border-teal-500/50 focus:border-teal-500/70 focus:ring-teal-500/25"
                                : "border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20"
                              : "border-white/[0.09] focus:border-teal-500/50 focus:ring-teal-500/25"
                            }`}
                        />
                        {form.phone.length > 0 && (
                          <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
                            {form.phone.length === 10
                              ? <CheckCircle2 className="w-4 h-4 text-teal-400" />
                              : <AlertCircle className="w-4 h-4 text-red-400" />
                            }
                          </span>
                        )}
                      </div>
                    </div>
                  </DField>

                  <DField label="Clinic Type">
                    <select value={form.clinicType} onChange={e => set("clinicType", e.target.value)}
                      className="w-full h-11 bg-white/[0.04] border border-white/[0.09] rounded-xl text-white text-sm px-4 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/25 transition-all appearance-none cursor-pointer">
                      {CLINIC_TYPES.map(t => <option key={t} className="bg-[#0f1f35] text-white">{t}</option>)}
                    </select>
                  </DField>

                  <div className="grid grid-cols-2 gap-3">
                    <DField label="City">
                      <DInput icon={MapPin} value={form.city} onChange={e => set("city", e.target.value)} placeholder="Bengaluru" />
                    </DField>
                    <DField label="State">
                      <DInput value={form.state} onChange={e => set("state", e.target.value)} placeholder="Karnataka" />
                    </DField>
                  </div>

                  <DField label="Full Address">
                    <DInput value={form.address} onChange={e => set("address", e.target.value)} placeholder="Street, Area, Landmark" />
                  </DField>

                  <DField label="Clinic Registration Number" hint="Optional — MCI / State medical council registration">
                    <DInput value={form.registrationNumber} onChange={e => set("registrationNumber", e.target.value)} placeholder="MCI/State registration number" />
                  </DField>

                  {/* ── Primary Doctor Information ── */}
                  <div className="pt-2">
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-white/[0.07]" />
                      <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-[0.12em] px-2">Primary Doctor</span>
                      <div className="h-px flex-1 bg-white/[0.07]" />
                    </div>
                  </div>

                  <DField label="Doctor Full Name" required>
                    <DInput icon={UserCheck} value={form.doctorName} onChange={e => set("doctorName", e.target.value)} placeholder="Dr. Ramesh Kumar" />
                  </DField>

                  <div className="grid grid-cols-2 gap-3">
                    <DField label="Qualification" required>
                      <DInput icon={GraduationCap} value={form.doctorQualification} onChange={e => set("doctorQualification", e.target.value)} placeholder="MBBS, MD" />
                    </DField>
                    <DField label="Specialty" required>
                      <DInput icon={Stethoscope} value={form.doctorSpecialty} onChange={e => set("doctorSpecialty", e.target.value)} placeholder="Cardiology" />
                    </DField>
                  </div>

                  <DField label="System of Medicine" required>
                    <select value={form.systemOfMedicine} onChange={e => set("systemOfMedicine", e.target.value)}
                      className="w-full h-11 bg-white/[0.04] border border-white/[0.09] rounded-xl text-white text-sm px-4 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/25 transition-all appearance-none cursor-pointer">
                      {SYSTEMS_OF_MEDICINE.map(s => <option key={s} className="bg-[#0f1f35] text-white">{s}</option>)}
                    </select>
                  </DField>

                  <div className="grid grid-cols-2 gap-3">
                    <DField label="Medical Reg. Number" required>
                      <DInput icon={FileText} value={form.doctorRegNumber} onChange={e => set("doctorRegNumber", e.target.value)} placeholder="MCI/State reg. no." />
                    </DField>
                    <DField label="Medical Council" required>
                      <DInput icon={Shield} value={form.medicalCouncil} onChange={e => set("medicalCouncil", e.target.value)} placeholder="Delhi Medical Council" />
                    </DField>
                  </div>

                  <DField label="Doctor ID Card" required hint="Upload medical council ID, degree certificate, or registration card (PDF/JPG/PNG)">
                    {doctorIdCard ? (
                      <div className="flex items-center gap-3 p-3 bg-teal-500/[0.08] border border-teal-500/25 rounded-xl">
                        <div className="w-9 h-9 bg-teal-500/20 rounded-lg flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-teal-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{doctorIdCard.name}</p>
                          <p className="text-xs text-slate-500">{fmtBytes(doctorIdCard.size)}</p>
                        </div>
                        <button type="button" onClick={() => { setDoctorIdCard(null); if (doctorIdCardRef.current) doctorIdCardRef.current.value = ""; }}
                          className="p-1.5 hover:bg-red-500/15 rounded-lg text-slate-500 hover:text-red-400 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div onClick={() => doctorIdCardRef.current?.click()}
                        className="flex items-center gap-3 p-4 border border-dashed border-white/15 rounded-xl cursor-pointer hover:border-teal-500/40 hover:bg-teal-500/[0.03] transition-all">
                        <Upload className="w-5 h-5 text-slate-600 shrink-0" />
                        <div>
                          <p className="text-sm text-slate-400 font-medium">Click to upload ID card</p>
                          <p className="text-xs text-slate-600 mt-0.5">PDF, JPG, PNG · Max 10 MB</p>
                        </div>
                        <input ref={doctorIdCardRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f && f.size <= 10 * 1024 * 1024) setDoctorIdCard(f); }} />
                      </div>
                    )}
                  </DField>
                </div>

                <div className="flex gap-3 mt-7">
                  <button type="button" onClick={goBack}
                    className="flex-1 h-12 rounded-2xl border border-white/10 text-slate-400 hover:border-white/20 hover:text-white font-semibold text-sm transition-all flex items-center justify-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button type="button"
                    onClick={() => { setError(""); if (validateStep2()) { setStep(3); setPhoneOtpSent(false); setPhoneOtp(""); } }}
                    className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-bold text-sm shadow-[0_4px_24px_rgba(20,184,166,0.35)] hover:shadow-[0_4px_36px_rgba(20,184,166,0.55)] transition-all flex items-center justify-center gap-2">
                    Verify Phone <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Step 3 : Phone / WhatsApp OTP ── */}
            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ duration: 0.22 }}>
                <div className="text-center mb-7">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 220, delay: 0.05 }}
                    className="w-16 h-16 mx-auto mb-4 bg-[#25D366]/[0.12] rounded-2xl border border-[#25D366]/30 flex items-center justify-center">
                    <MessageCircle className="w-8 h-8 text-[#25D366]" />
                  </motion.div>
                  <h2 className="text-[1.65rem] font-black text-white mb-1">Verify via WhatsApp</h2>
                  <p className="text-slate-500 text-sm">
                    {phoneOtpSent
                      ? <>OTP sent to <span className="text-[#25D366] font-semibold">+91 {form.phone}</span> on WhatsApp</>
                      : <>We'll send a code to <span className="text-[#25D366] font-semibold">+91 {form.phone}</span> on WhatsApp</>
                    }
                  </p>
                </div>

                <ErrBanner msg={error} />

                {phoneVerified ? (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    className="p-6 bg-[#25D366]/10 border border-[#25D366]/30 rounded-2xl text-center">
                    <CheckCircle2 className="w-10 h-10 text-[#25D366] mx-auto mb-2" />
                    <p className="text-[#25D366] font-bold text-lg">Phone Verified!</p>
                    <p className="text-slate-500 text-sm mt-1">Proceeding to documents…</p>
                  </motion.div>
                ) : !phoneOtpSent ? (
                  <button type="button" onClick={sendPhoneOtp} disabled={phoneOtpLoading}
                    className="w-full h-12 rounded-2xl bg-[#25D366] hover:bg-[#22C55E] text-white font-bold text-sm
                      shadow-[0_4px_24px_rgba(37,211,102,0.35)] hover:shadow-[0_4px_36px_rgba(37,211,102,0.5)]
                      transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                    {phoneOtpLoading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</> : <><MessageCircle className="w-4 h-4" /> Send OTP via WhatsApp</>}
                  </button>
                ) : (
                  <div className="space-y-5">
                    <div className="text-center text-xs text-slate-600 mb-1">Enter the 6-digit code from WhatsApp</div>
                    <OtpInput
                      value={phoneOtp}
                      onChange={v => { setPhoneOtp(v); setPhoneOtpStatus("idle"); setError(""); if (v.length === 6) verifyPhoneOtp(v); }}
                      disabled={phoneOtpStatus === "verifying" || phoneOtpStatus === "success"}
                      status={phoneOtpStatus}
                    />
                    <div className="text-center min-h-[20px]">
                      {phoneOtpStatus === "verifying" && (
                        <p className="text-amber-400 text-xs flex items-center justify-center gap-1.5">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Verifying…
                        </p>
                      )}
                      {phoneOtpStatus === "error" && (
                        <p className="text-red-400 text-xs flex items-center justify-center gap-1.5">
                          <AlertCircle className="w-3 h-3" /> Incorrect OTP — clearing in a moment
                        </p>
                      )}
                    </div>
                    <div className="text-center">
                      {countdown > 0
                        ? <p className="text-slate-500 text-sm">Resend in <span className="text-[#25D366] font-bold tabular-nums">{countdown}s</span></p>
                        : <button type="button" onClick={sendPhoneOtp} disabled={phoneOtpLoading} className="text-[#25D366] text-sm font-semibold hover:text-[#22C55E] transition-colors inline-flex items-center gap-1.5">
                            <RefreshCw className={`w-3.5 h-3.5 ${phoneOtpLoading ? "animate-spin" : ""}`} /> Resend OTP
                          </button>
                      }
                    </div>
                  </div>
                )}

                <BackBtn onClick={goBack} />
              </motion.div>
            )}

            {/* ── Step 4 : Documents ── */}
            {step === 4 && (
              <motion.div key="s4" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ duration: 0.22 }}>
                <div className="mb-7">
                  <h2 className="text-[1.65rem] font-black text-white mb-1">Upload documents</h2>
                  <p className="text-slate-500 text-sm">Helps us verify your clinic faster. Reviewed securely by our team.</p>
                </div>

                <ErrBanner msg={error} />

                <div className="grid gap-2 mb-5">
                  {REQUIRED_DOCS.map((d, i) => (
                    <div key={d.id} className={`flex items-start gap-3 p-3 rounded-xl border text-sm transition-all ${uploadedFiles[i] ? "bg-teal-500/[0.08] border-teal-500/25" : "bg-white/[0.02] border-white/[0.07]"}`}>
                      {uploadedFiles[i]
                        ? <CheckCircle2 className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" />
                        : <div className="w-4 h-4 rounded-full border border-white/20 mt-0.5 shrink-0" />
                      }
                      <div>
                        <p className={`font-semibold text-sm ${uploadedFiles[i] ? "text-teal-300" : "text-slate-400"}`}>{d.label}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{d.hint}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${isDragging ? "border-teal-400 bg-teal-500/10 scale-[1.01]" : "border-white/10 hover:border-teal-500/35 hover:bg-teal-500/[0.04]"}`}
                >
                  <Upload className={`w-9 h-9 mx-auto mb-3 transition-colors ${isDragging ? "text-teal-400" : "text-slate-600"}`} />
                  <p className="font-semibold text-slate-400 text-sm">Drop files or <span className="text-teal-400">click to browse</span></p>
                  <p className="text-xs text-slate-600 mt-1.5">PDF, JPG, PNG · Max 10 MB · Up to 5 files</p>
                  <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={e => addFiles(e.target.files)} />
                </div>

                {uploadedFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {uploadedFiles.map((u, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-white/[0.04] border border-white/[0.07] rounded-xl">
                        <div className="w-9 h-9 bg-teal-500/20 rounded-lg flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-teal-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{u.file.name}</p>
                          <p className="text-xs text-slate-500">{fmtBytes(u.file.size)}</p>
                        </div>
                        <button type="button" onClick={() => removeFile(i)} className="p-1.5 hover:bg-red-500/15 rounded-lg text-slate-500 hover:text-red-400 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-5 px-4 py-3 bg-amber-500/[0.08] border border-amber-500/20 rounded-xl">
                  <p className="text-xs text-amber-400/80">
                    <strong className="text-amber-300">Note:</strong> You can also email documents later to{" "}
                    <a href="mailto:support@mediczy.com" className="text-amber-300 font-semibold">support@mediczy.com</a> to speed up review.
                  </p>
                </div>

                <div className="flex gap-3 mt-6">
                  <button type="button" onClick={goBack}
                    className="flex-1 h-12 rounded-2xl border border-white/10 text-slate-400 hover:border-white/20 hover:text-white font-semibold text-sm transition-all flex items-center justify-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button type="button" onClick={handleSubmit} disabled={loading}
                    className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-bold text-sm shadow-[0_4px_24px_rgba(20,184,166,0.35)] hover:shadow-[0_4px_36px_rgba(20,184,166,0.55)] transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                    {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Submitting…</> : "Submit Application"}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Step 5 : Success ── */}
            {step === 5 && (
              <motion.div key="s5" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: "easeOut" }}
                className="text-center px-2 py-4">
                <div className="relative inline-flex mb-8">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 180, delay: 0.1 }}
                    className="w-24 h-24 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-full flex items-center justify-center shadow-[0_8px_48px_rgba(20,184,166,0.55)]">
                    <CheckCircle2 className="w-12 h-12 text-white" />
                  </motion.div>
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.45, type: "spring", stiffness: 300 }}
                    className="absolute -top-1 -right-1 w-8 h-8 bg-emerald-400 rounded-full flex items-center justify-center shadow-lg border-[2.5px] border-[#07101f]">
                    <Sparkles className="w-4 h-4 text-white" />
                  </motion.div>
                </div>

                <h2 className="text-[1.9rem] font-black text-white mb-3">Application Submitted!</h2>
                <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-xs mx-auto">
                  Your clinic registration is under review. We'll verify documents and activate your account shortly.
                </p>

                <div className="p-5 bg-white/[0.04] border border-white/[0.08] rounded-2xl text-left space-y-4 mb-8">
                  {[
                    { e: "⏱️", t: "Review takes 24–48 business hours" },
                    { e: "📧", t: "Login credentials emailed once approved" },
                    { e: "🔒", t: "Documents reviewed securely & confidentially" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xl shrink-0">{item.e}</span>
                      <p className="text-sm text-slate-400">{item.t}</p>
                    </div>
                  ))}
                </div>

                <button type="button" onClick={() => navigate("/clinic/login")}
                  className="w-full h-12 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-bold text-sm shadow-[0_4px_24px_rgba(20,184,166,0.35)] hover:shadow-[0_4px_36px_rgba(20,184,166,0.55)] transition-all">
                  Go to Login Page
                </button>
                <p className="text-xs text-slate-600 mt-4">
                  Questions? <a href="mailto:support@mediczy.com" className="text-teal-400 font-semibold hover:text-teal-300">support@mediczy.com</a>
                </p>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
