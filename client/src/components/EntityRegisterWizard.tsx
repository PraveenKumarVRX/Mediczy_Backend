import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/utils/api";
import {
  Mail, Lock, Phone, MapPin, FileText, Upload, X, CheckCircle2,
  Eye, EyeOff, ChevronRight, AlertCircle, Shield, HeartPulse,
  Sparkles, ArrowLeft, MessageCircle, RefreshCw, Building2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ContactField {
  key: string;
  label: string;
  placeholder: string;
  Icon: React.FC<{ className?: string }>;
  required: boolean;
}
export interface WizardConfig {
  entityKey: string;
  entityLabel: string;
  EntityIcon: React.FC<{ className?: string }>;
  scheme: "teal" | "violet" | "emerald" | "blue" | "rose" | "orange" | "amber" | "indigo";
  btnGradient: string;
  btnShadow: string;
  btnHoverShadow: string;
  panelGradient: string;
  accentHex: string;
  entityNameLabel: string;
  entityNamePlaceholder: string;
  entityTypes: string[];
  entityTypeLabel: string;
  entityTypeFieldKey: string;
  contactSectionTitle: string;
  contactFields: ContactField[];
  contactDropdown?: { key: string; label: string; options: string[] };
  contactIdCard?: { label: string; hint: string };
  requiredDocs: Array<{ id: string; label: string; hint: string }>;
  tagline: string;
  heroLine1: string;
  heroLine2: string;
  heroText: string;
  features: Array<{ Icon: React.FC<{ className?: string }>; title: string; desc: string }>;
  apiPrefix: string;
  loginPath: string;
  stepDetailsLabel: string;
}

// ── Color scheme lookup — ALL class variants listed explicitly for Tailwind ──
const SCHEMES = {
  teal:    { text: "text-teal-400",    border: "border-teal-500/50",    ring: "ring-teal-500/25",    bg: "bg-teal-500/[0.08]",    badgeBg: "bg-teal-500/20",    stepDone: "bg-teal-500",    stepActive: "from-teal-400 to-cyan-500",    stepActiveShadow: "shadow-[0_0_18px_rgba(20,184,166,0.6)]",    stepDoneShadow: "shadow-[0_0_10px_rgba(20,184,166,0.5)]",    stepActiveRing: "ring-teal-400/40",   lineGrad: "from-teal-500 to-cyan-500",    pill: "bg-teal-400/10 border-teal-400/25 text-teal-300",    iconBg: "bg-teal-500/25",    iconText: "text-teal-300",    badgeText: "text-teal-200/55",    badgeText2: "text-teal-100/65",    confirmBg: "bg-teal-500/[0.1]",    confirmBorder: "border-teal-500/30",    confirmText: "text-teal-300",    confirmTitle: "text-teal-400"  },
  violet:  { text: "text-violet-400",  border: "border-violet-500/50",  ring: "ring-violet-500/25",  bg: "bg-violet-500/[0.08]",  badgeBg: "bg-violet-500/20",  stepDone: "bg-violet-500",  stepActive: "from-violet-400 to-purple-500",  stepActiveShadow: "shadow-[0_0_18px_rgba(139,92,246,0.6)]",  stepDoneShadow: "shadow-[0_0_10px_rgba(139,92,246,0.5)]", stepActiveRing: "ring-violet-400/40",  lineGrad: "from-violet-500 to-purple-500",  pill: "bg-violet-400/10 border-violet-400/25 text-violet-300",  iconBg: "bg-violet-500/25",  iconText: "text-violet-300",  badgeText: "text-violet-200/55",  badgeText2: "text-violet-100/65",  confirmBg: "bg-violet-500/[0.1]",  confirmBorder: "border-violet-500/30",  confirmText: "text-violet-300",  confirmTitle: "text-violet-400"  },
  emerald: { text: "text-emerald-400", border: "border-emerald-500/50", ring: "ring-emerald-500/25", bg: "bg-emerald-500/[0.08]", badgeBg: "bg-emerald-500/20", stepDone: "bg-emerald-500", stepActive: "from-emerald-400 to-green-500",  stepActiveShadow: "shadow-[0_0_18px_rgba(16,185,129,0.6)]",  stepDoneShadow: "shadow-[0_0_10px_rgba(16,185,129,0.5)]", stepActiveRing: "ring-emerald-400/40", lineGrad: "from-emerald-500 to-green-500",  pill: "bg-emerald-400/10 border-emerald-400/25 text-emerald-300", iconBg: "bg-emerald-500/25", iconText: "text-emerald-300", badgeText: "text-emerald-200/55", badgeText2: "text-emerald-100/65", confirmBg: "bg-emerald-500/[0.1]", confirmBorder: "border-emerald-500/30", confirmText: "text-emerald-300", confirmTitle: "text-emerald-400" },
  blue:    { text: "text-blue-400",    border: "border-blue-500/50",    ring: "ring-blue-500/25",    bg: "bg-blue-500/[0.08]",    badgeBg: "bg-blue-500/20",    stepDone: "bg-blue-500",    stepActive: "from-blue-400 to-indigo-500",   stepActiveShadow: "shadow-[0_0_18px_rgba(59,130,246,0.6)]",   stepDoneShadow: "shadow-[0_0_10px_rgba(59,130,246,0.5)]",  stepActiveRing: "ring-blue-400/40",    lineGrad: "from-blue-500 to-indigo-500",    pill: "bg-blue-400/10 border-blue-400/25 text-blue-300",    iconBg: "bg-blue-500/25",    iconText: "text-blue-300",    badgeText: "text-blue-200/55",    badgeText2: "text-blue-100/65",    confirmBg: "bg-blue-500/[0.1]",    confirmBorder: "border-blue-500/30",    confirmText: "text-blue-300",    confirmTitle: "text-blue-400"    },
  rose:    { text: "text-rose-400",    border: "border-rose-500/50",    ring: "ring-rose-500/25",    bg: "bg-rose-500/[0.08]",    badgeBg: "bg-rose-500/20",    stepDone: "bg-rose-500",    stepActive: "from-rose-400 to-pink-500",     stepActiveShadow: "shadow-[0_0_18px_rgba(244,63,94,0.6)]",    stepDoneShadow: "shadow-[0_0_10px_rgba(244,63,94,0.5)]",   stepActiveRing: "ring-rose-400/40",    lineGrad: "from-rose-500 to-pink-500",      pill: "bg-rose-400/10 border-rose-400/25 text-rose-300",    iconBg: "bg-rose-500/25",    iconText: "text-rose-300",    badgeText: "text-rose-200/55",    badgeText2: "text-rose-100/65",    confirmBg: "bg-rose-500/[0.1]",    confirmBorder: "border-rose-500/30",    confirmText: "text-rose-300",    confirmTitle: "text-rose-400"    },
  orange:  { text: "text-orange-400",  border: "border-orange-500/50",  ring: "ring-orange-500/25",  bg: "bg-orange-500/[0.08]",  badgeBg: "bg-orange-500/20",  stepDone: "bg-orange-500",  stepActive: "from-orange-400 to-red-500",    stepActiveShadow: "shadow-[0_0_18px_rgba(249,115,22,0.6)]",   stepDoneShadow: "shadow-[0_0_10px_rgba(249,115,22,0.5)]",  stepActiveRing: "ring-orange-400/40",  lineGrad: "from-orange-500 to-red-500",     pill: "bg-orange-400/10 border-orange-400/25 text-orange-300", iconBg: "bg-orange-500/25", iconText: "text-orange-300", badgeText: "text-orange-200/55", badgeText2: "text-orange-100/65", confirmBg: "bg-orange-500/[0.1]", confirmBorder: "border-orange-500/30", confirmText: "text-orange-300", confirmTitle: "text-orange-400" },
  amber:   { text: "text-amber-400",   border: "border-amber-500/50",   ring: "ring-amber-500/25",   bg: "bg-amber-500/[0.08]",   badgeBg: "bg-amber-500/20",   stepDone: "bg-amber-500",   stepActive: "from-amber-400 to-yellow-500",  stepActiveShadow: "shadow-[0_0_18px_rgba(245,158,11,0.6)]",   stepDoneShadow: "shadow-[0_0_10px_rgba(245,158,11,0.5)]",  stepActiveRing: "ring-amber-400/40",   lineGrad: "from-amber-500 to-yellow-500",   pill: "bg-amber-400/10 border-amber-400/25 text-amber-300",  iconBg: "bg-amber-500/25",   iconText: "text-amber-300",   badgeText: "text-amber-200/55",   badgeText2: "text-amber-100/65",   confirmBg: "bg-amber-500/[0.1]",   confirmBorder: "border-amber-500/30",   confirmText: "text-amber-300",   confirmTitle: "text-amber-400"   },
  indigo:  { text: "text-indigo-400",  border: "border-indigo-500/50",  ring: "ring-indigo-500/25",  bg: "bg-indigo-500/[0.08]",  badgeBg: "bg-indigo-500/20",  stepDone: "bg-indigo-500",  stepActive: "from-indigo-400 to-blue-500",   stepActiveShadow: "shadow-[0_0_18px_rgba(99,102,241,0.6)]",   stepDoneShadow: "shadow-[0_0_10px_rgba(99,102,241,0.5)]",  stepActiveRing: "ring-indigo-400/40",  lineGrad: "from-indigo-500 to-blue-500",    pill: "bg-indigo-400/10 border-indigo-400/25 text-indigo-300", iconBg: "bg-indigo-500/25", iconText: "text-indigo-300", badgeText: "text-indigo-200/55", badgeText2: "text-indigo-100/65", confirmBg: "bg-indigo-500/[0.1]", confirmBorder: "border-indigo-500/30", confirmText: "text-indigo-300", confirmTitle: "text-indigo-400" },
};

interface UploadedFile { file: File; docType: string; }
const fmtBytes = (b: number) => b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;

// ── OTP digit input ───────────────────────────────────────────────────────────
function OtpInput({ value, onChange, disabled, status = "idle", accentHex }: {
  value: string; onChange: (v: string) => void; disabled?: boolean;
  status?: "idle" | "verifying" | "success" | "error"; accentHex: string;
}) {
  const refs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null));
  const handleChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const char = e.target.value.replace(/\D/g, "").slice(-1);
    if (!char) { onChange(value.slice(0, i) + value.slice(i + 1)); return; }
    const arr = value.split("").slice(0, 6); arr[i] = char;
    const next = arr.join("").slice(0, 6); onChange(next);
    if (i < 5) refs[i + 1]?.current?.focus();
  };
  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[i]) { onChange(value.slice(0, i) + value.slice(i + 1)); }
      else if (i > 0) { refs[i - 1]?.current?.focus(); onChange(value.slice(0, i - 1) + value.slice(i)); }
    }
  };
  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) { onChange(pasted); refs[Math.min(pasted.length, 5)]?.current?.focus(); }
    e.preventDefault();
  };
  return (
    <div className="flex gap-2 sm:gap-3 justify-center" onPaste={handlePaste}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input key={i} ref={refs[i]} type="text" inputMode="numeric" maxLength={1}
          value={value[i] || ""} disabled={disabled}
          onChange={e => handleChange(i, e)} onKeyDown={e => handleKeyDown(i, e)} onFocus={e => e.target.select()}
          style={value[i] && status !== "error" && status !== "verifying" ? { borderColor: accentHex, color: accentHex } : undefined}
          className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold rounded-xl border-2 transition-all duration-200 outline-none
            ${value[i]
              ? status === "error" ? "border-red-400 bg-red-500/10 text-red-300 shadow-[0_0_14px_rgba(239,68,68,0.3)]"
                : status === "verifying" ? "border-amber-400/60 bg-amber-500/10 text-amber-300"
                : "bg-white/[0.06]"
              : "border-white/12 bg-white/5 text-white"}
            ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          `}
        />
      ))}
    </div>
  );
}

// ── Background blobs ──────────────────────────────────────────────────────────
function BgBlobs({ panelGradient }: { panelGradient: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
      <div className="absolute -top-48 -right-48 w-[650px] h-[650px] rounded-full blur-[120px]"
        style={{ background: panelGradient.replace("linear-gradient(135deg,", "radial-gradient(ellipse at top right,").slice(0, -1) + ", transparent)" }} />
      <div className="absolute -bottom-24 -left-24 w-[450px] h-[450px] rounded-full blur-[80px] opacity-30"
        style={{ background: panelGradient }} />
    </div>
  );
}

// ── Step progress bar ─────────────────────────────────────────────────────────
function StepBar({ step, steps, c }: { step: number; steps: string[]; c: typeof SCHEMES["teal"] }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center gap-1 flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-400 ${ 
              i < step ? `${c.stepDone} text-white ${c.stepDoneShadow}`
              : i === step ? `bg-gradient-to-br ${c.stepActive} text-white ring-2 ${c.stepActiveRing} ring-offset-2 ring-offset-[#07101f] ${c.stepActiveShadow}`
              : "bg-white/5 text-slate-600 border border-white/10"
            }`}>
              {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-[8px] font-semibold uppercase tracking-wider hidden sm:block ${ 
              i === step ? c.text : i < step ? "text-slate-500" : "text-slate-700"
            }`}>{label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className="flex-1 h-px mx-1 rounded-full overflow-hidden bg-white/8">
              <div className={`h-full rounded-full transition-all duration-600 bg-gradient-to-r ${c.lineGrad} ${i < step ? "w-full" : "w-0"}`} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

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
      <input {...props} className={`w-full h-11 bg-white/[0.04] border border-white/[0.09] rounded-xl text-white placeholder:text-slate-600 text-sm focus:outline-none focus:border-white/30 focus:bg-white/[0.07] focus:ring-1 focus:ring-white/10 transition-all ${IconComp ? "pl-10" : "pl-4"} pr-4 ${className}`} />
    </div>
  );
}
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
function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full mt-5 flex items-center justify-center gap-2 text-slate-500 text-sm hover:text-slate-300 transition-colors">
      <ArrowLeft className="w-4 h-4" /> Back
    </button>
  );
}

// ── Main Wizard Component ─────────────────────────────────────────────────────
export default function EntityRegisterWizard({ config }: { config: WizardConfig }) {
  const navigate = useNavigate();
  const c = SCHEMES[config.scheme];
  const STEPS = ["Account", "Verify Email", config.stepDetailsLabel, "Verify Phone", "Documents"];

  const [step, setStep] = useState(0);
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const formArrivalTime = useRef<number>(Date.now());

  // Base form fields + contact fields initialised to ""
  const baseForm = {
    name: "", email: "", password: "", confirmPassword: "",
    phone: "", [config.entityTypeFieldKey]: config.entityTypes[0],
    city: "", state: "", address: "", registrationNumber: "",
  };
  const contactInit: Record<string, string> = {};
  config.contactFields.forEach(f => { contactInit[f.key] = ""; });
  if (config.contactDropdown) contactInit[config.contactDropdown.key] = config.contactDropdown.options[0];
  const [form, setForm] = useState<Record<string, string>>({ ...baseForm, ...contactInit });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const [contactIdCardFile, setContactIdCardFile] = useState<File | null>(null);
  const contactIdCardRef = useRef<HTMLInputElement>(null);

  // Google Places
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  // OTP states
  const [emailOtp, setEmailOtp] = useState("");
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpLoading, setEmailOtpLoading] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailOtpStatus, setEmailOtpStatus] = useState<"idle"|"verifying"|"success"|"error">("idle");

  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtpLoading, setPhoneOtpLoading] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneOtpStatus, setPhoneOtpStatus] = useState<"idle"|"verifying"|"success"|"error">("idle");

  const [countdown, setCountdown] = useState(0);
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(n => n - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Files
  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const allowed = ["application/pdf","image/jpeg","image/jpg","image/png","image/webp"];
    const newFiles: UploadedFile[] = Array.from(files)
      .filter(f => allowed.includes(f.type) && f.size <= 10 * 1024 * 1024)
      .map((f, idx) => ({ file: f, docType: config.requiredDocs[uploadedFiles.length + idx]?.id || "other" }));
    setUploadedFiles(prev => [...prev, ...newFiles].slice(0, 5));
  }, [uploadedFiles.length, config.requiredDocs]);
  const removeFile = (idx: number) => setUploadedFiles(f => f.filter((_, i) => i !== idx));

  // Google Places
  const initAutocomplete = useCallback(() => {
    if (!addressRef.current || !window.google?.maps?.places || autocompleteRef.current) return;
    const ac = new window.google.maps.places.Autocomplete(addressRef.current, {
      componentRestrictions: { country: "in" },
      fields: ["formatted_address", "address_components", "geometry", "name"],
      types: ["geocode", "establishment"],
    });
    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (!place.geometry?.location) return;
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      setCoords({ lat, lng });
      let city = "", state = "";
      for (const comp of place.address_components || []) {
        if (comp.types.includes("locality")) city = comp.long_name;
        else if (comp.types.includes("administrative_area_level_2") && !city) city = comp.long_name;
        if (comp.types.includes("administrative_area_level_1")) state = comp.long_name;
      }
      setForm(f => ({
        ...f,
        address: place.formatted_address || f.address,
        ...(city && { city }),
        ...(state && { state }),
      }));
    });
    autocompleteRef.current = ac;
  }, []);

  useEffect(() => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!key) return;
    if (window.google?.maps?.places) { initAutocomplete(); return; }
    if (document.querySelector("script[data-gplaces]")) return;
    const style = document.createElement("style");
    style.textContent = ".pac-container { z-index: 9999 !important; }";
    document.head.appendChild(style);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    s.async = true; s.dataset.gplaces = "1";
    s.onload = () => initAutocomplete();
    document.head.appendChild(s);
  }, [initAutocomplete]);

  useEffect(() => {
    if (step === 2) initAutocomplete();
    return () => { if (step === 2) autocompleteRef.current = null; };
  }, [step, initAutocomplete]);

  // OTP handlers
  const sendEmailOtp = async () => {
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError("Enter a valid email address first");
    setEmailOtpLoading(true); setError("");
    try {
      await api.post(`${config.apiPrefix}/send-email-otp`, { email: form.email }, { skipAuth: true } as any);
      setEmailOtpSent(true); setCountdown(60);
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to send OTP. Please try again.");
    } finally { setEmailOtpLoading(false); }
  };
  const verifyEmailOtp = async (inlineCode?: string) => {
    const code = inlineCode ?? emailOtp;
    if (code.length !== 6) return setError("Enter the complete 6-digit OTP");
    setEmailOtpStatus("verifying"); setLoading(true); setError("");
    try {
      await api.post(`${config.apiPrefix}/verify-email-otp`, { email: form.email, code }, { skipAuth: true } as any);
      setEmailOtpStatus("success"); setEmailVerified(true);
      setTimeout(() => setStep(2), 700);
    } catch (e: any) {
      setEmailOtpStatus("error");
      setError(e.response?.data?.message || "Incorrect OTP. Please try again.");
      setTimeout(() => { setEmailOtp(""); setEmailOtpStatus("idle"); }, 1500);
    } finally { setLoading(false); }
  };
  const sendPhoneOtp = async () => {
    if (!form.phone.trim()) return setError("Enter your phone number first");
    setPhoneOtpLoading(true); setError("");
    try {
      await api.post(`${config.apiPrefix}/send-phone-otp`, { phone: form.phone }, { skipAuth: true } as any);
      setPhoneOtpSent(true); setCountdown(60);
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to send OTP. Check your phone number.");
    } finally { setPhoneOtpLoading(false); }
  };
  const verifyPhoneOtp = async (inlineCode?: string) => {
    const code = inlineCode ?? phoneOtp;
    if (code.length !== 6) return setError("Enter the complete 6-digit OTP");
    setPhoneOtpStatus("verifying"); setLoading(true); setError("");
    try {
      await api.post(`${config.apiPrefix}/verify-phone-otp`, { phone: form.phone, code }, { skipAuth: true } as any);
      setPhoneOtpStatus("success"); setPhoneVerified(true);
      setTimeout(() => setStep(4), 700);
    } catch (e: any) {
      setPhoneOtpStatus("error");
      setError(e.response?.data?.message || "Incorrect OTP. Please try again.");
      setTimeout(() => { setPhoneOtp(""); setPhoneOtpStatus("idle"); }, 1500);
    } finally { setLoading(false); }
  };

  // Validations
  const validateStep0 = () => {
    if (!form.name.trim()) return setError(`${config.entityNameLabel} is required`), false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError("Enter a valid email address"), false;
    if (form.password.length < 8) return setError("Password must be at least 8 characters"), false;
    if (form.password !== form.confirmPassword) return setError("Passwords do not match"), false;
    return true;
  };
  const validateStep2 = () => {
    if (!form.phone.trim()) return setError("Phone number is required"), false;
    if (!form.address.trim()) return setError("Address is required"), false;
    if (!form.city.trim()) return setError("City is required"), false;
    for (const f of config.contactFields) {
      if (f.required && !form[f.key]?.trim()) return setError(`${f.label} is required`), false;
    }
    if (config.contactIdCard && !contactIdCardFile) return setError(`${config.contactIdCard.label} upload is required`), false;
    return true;
  };

  // Submit
  const handleSubmit = async () => {
    setLoading(true); setError("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (coords) { fd.append("lat", String(coords.lat)); fd.append("lng", String(coords.lng)); }
      uploadedFiles.forEach((u, i) => { fd.append("documents", u.file); fd.append(`docType_${i}`, u.docType); });
      if (contactIdCardFile) fd.append("contactIdCard", contactIdCardFile);
      fd.append("_hp", "");
      fd.append("_fat", String(formArrivalTime.current));
      await api.post(`${config.apiPrefix}/register`, fd, { headers: { "Content-Type": "multipart/form-data" }, skipAuth: true } as any);
      setStep(5);
    } catch (e: any) {
      setError(e.response?.data?.message || "Registration failed. Please try again.");
    } finally { setLoading(false); }
  };
  const goBack = () => { setError(""); setStep(s => Math.max(0, s - 1)); };

  // ── Styled button helper ──────────────────────────────────────────────────
  const PrimaryBtn = ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ background: config.btnGradient, boxShadow: config.btnShadow }}
      className="w-full h-12 rounded-2xl text-white font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = config.btnHoverShadow; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = config.btnShadow; }}>
      {children}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#07101f] text-white flex overflow-hidden">
      <BgBlobs panelGradient={config.panelGradient} />

      {/* ── Left decorative panel ── */}
      <div className="hidden xl:flex w-[400px] shrink-0 flex-col relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: config.panelGradient }} />
        <svg className="absolute inset-0 w-full h-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
          <defs><pattern id="dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="white" />
          </pattern></defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
        </svg>
        <div className="absolute -top-28 -right-28 w-96 h-96 rounded-full blur-[80px] opacity-20 bg-white pointer-events-none" />
        <div className="absolute bottom-16 -left-12 w-56 h-56 rounded-full blur-[60px] opacity-15 bg-white pointer-events-none" />
        <div className="relative z-10 flex flex-col h-full p-10">
          <div className="flex items-center gap-3 mb-14">
            <div className="w-10 h-10 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20">
              <HeartPulse className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-black text-xl tracking-tight">Mediczy</span>
          </div>
          <div className="flex-1">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border mb-5 ${c.pill}`}>
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-xs font-bold tracking-wide">{config.tagline}</span>
              </div>
              <h1 className="text-[2.4rem] font-black text-white leading-[1.1] mb-4">
                {config.heroLine1}<br />
                <span className="text-white/80">{config.heroLine2}</span>
              </h1>
              <p className={`text-sm leading-relaxed mb-10 ${c.badgeText2}`}>{config.heroText}</p>
            </motion.div>
            <div className="space-y-3">
              {config.features.map((f, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.08 }}
                  className="flex items-center gap-3.5 p-3 bg-white/[0.07] backdrop-blur-sm rounded-2xl border border-white/[0.09]">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${c.iconBg}`}>
                    <f.Icon className={`w-4.5 h-4.5 ${c.iconText}`} />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">{f.title}</p>
                    <p className={`text-xs mt-0.5 ${c.badgeText}`}>{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
          <div className="mt-8 p-4 bg-white/[0.07] rounded-2xl border border-white/[0.09]">
            <div className="flex items-center gap-2 mb-1.5">
              <Shield className="w-4 h-4 text-white/70" />
              <span className="text-white text-xs font-bold">ABDM & HIPAA Compliant</span>
            </div>
            <p className={`text-xs ${c.badgeText}`}>Data encrypted, DISHA-compliant &amp; audited annually.</p>
          </div>
        </div>
      </div>

      {/* ── Right: multi-step form ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10 overflow-y-auto relative z-10">
        <div className="w-full max-w-[460px]">
          <div className="flex xl:hidden items-center gap-2 justify-center mb-8">
            <HeartPulse className="w-5 h-5" style={{ color: config.accentHex }} />
            <span className="text-sm font-black tracking-widest uppercase" style={{ color: config.accentHex + "cc" }}>Mediczy</span>
          </div>

          {step < 5 && <StepBar step={step} steps={STEPS} c={c} />}

          <AnimatePresence mode="wait">

            {/* ── Step 0: Account ── */}
            {step === 0 && (
              <motion.div key="s0" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ duration: 0.22 }}>
                <div className="mb-7">
                  <h2 className="text-[1.65rem] font-black text-white mb-1">Create your account</h2>
                  <p className="text-slate-500 text-sm">Set up your secure login credentials</p>
                </div>
                <ErrBanner msg={error} />
                <div className="space-y-4">
                  <DField label={config.entityNameLabel} required>
                    <DInput icon={config.EntityIcon as any} value={form.name} onChange={e => set("name", e.target.value)} placeholder={config.entityNamePlaceholder} />
                  </DField>
                  <DField label="Email Address" required hint="A verification OTP will be sent to this address">
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none z-10" />
                      <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="contact@example.com"
                        className={`w-full h-11 bg-white/[0.04] border rounded-xl text-white placeholder:text-slate-600 text-sm focus:outline-none focus:ring-1 transition-all pl-10 pr-10
                          ${form.email.length > 0 ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? "border-green-500/50 focus:border-green-500/70 focus:ring-green-500/25" : "border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20" : "border-white/[0.09] focus:border-white/25 focus:ring-white/10"}`}
                      />
                      {form.email.length > 0 && (
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
                          {/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
                        </span>
                      )}
                    </div>
                  </DField>
                  <DField label="Password" required>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                      <input type={showPass ? "text" : "password"} value={form.password} onChange={e => set("password", e.target.value)} placeholder="Minimum 8 characters"
                        className="w-full h-11 bg-white/[0.04] border border-white/[0.09] rounded-xl text-white placeholder:text-slate-600 text-sm focus:outline-none focus:border-white/25 focus:ring-1 focus:ring-white/10 transition-all pl-10 pr-11" />
                      <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </DField>
                  <DField label="Confirm Password" required>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                      <input type={showConfirm ? "text" : "password"} value={form.confirmPassword} onChange={e => set("confirmPassword", e.target.value)} placeholder="Re-enter password"
                        className="w-full h-11 bg-white/[0.04] border border-white/[0.09] rounded-xl text-white placeholder:text-slate-600 text-sm focus:outline-none focus:border-white/25 focus:ring-1 focus:ring-white/10 transition-all pl-10 pr-11" />
                      <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </DField>
                </div>
                <div aria-hidden="true" style={{ position:"absolute",opacity:0,height:0,width:0,overflow:"hidden",pointerEvents:"none" }}>
                  <input type="text" name="_hp" autoComplete="off" tabIndex={-1} defaultValue="" />
                </div>
                <div className="mt-7">
                  <PrimaryBtn onClick={() => { setError(""); if (validateStep0()) { setStep(1); setEmailOtpSent(false); setEmailOtp(""); } }}>
                    Continue to Email Verification <ChevronRight className="w-4 h-4" />
                  </PrimaryBtn>
                </div>
                <p className="text-center text-sm text-slate-600 mt-5">
                  Already registered? <Link to={config.loginPath} className={`font-semibold hover:opacity-80 transition-opacity ${c.text}`}>Sign in</Link>
                </p>
              </motion.div>
            )}

            {/* ── Step 1: Email OTP ── */}
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ duration: 0.22 }}>
                <div className="text-center mb-7">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 220, delay: 0.05 }}
                    className={`w-16 h-16 mx-auto mb-4 rounded-2xl border flex items-center justify-center ${c.bg} ${c.border}`}>
                    <Mail className={`w-8 h-8 ${c.text}`} />
                  </motion.div>
                  <h2 className="text-[1.65rem] font-black text-white mb-1">Verify your email</h2>
                  <p className="text-slate-500 text-sm">
                    {emailOtpSent ? <>OTP sent to <span className={`font-semibold ${c.text}`}>{form.email}</span></> : <>We'll send a 6-digit code to <span className={`font-semibold ${c.text}`}>{form.email}</span></>}
                  </p>
                </div>
                <ErrBanner msg={error} />
                {emailVerified ? (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className={`p-6 rounded-2xl border text-center ${c.bg} ${c.border}`}>
                    <CheckCircle2 className={`w-10 h-10 mx-auto mb-2 ${c.text}`} />
                    <p className={`font-bold text-lg ${c.text}`}>Email Verified!</p>
                    <p className="text-slate-500 text-sm mt-1">Proceeding to details…</p>
                  </motion.div>
                ) : !emailOtpSent ? (
                  <PrimaryBtn onClick={sendEmailOtp} disabled={emailOtpLoading}>
                    {emailOtpLoading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</> : <><Mail className="w-4 h-4" /> Send Verification Email</>}
                  </PrimaryBtn>
                ) : (
                  <div className="space-y-5">
                    <div className="text-center text-xs text-slate-600 mb-1">Enter the 6-digit code from your email</div>
                    <OtpInput value={emailOtp} accentHex={config.accentHex}
                      onChange={v => { setEmailOtp(v); setEmailOtpStatus("idle"); setError(""); if (v.length === 6) verifyEmailOtp(v); }}
                      disabled={emailOtpStatus === "verifying" || emailOtpStatus === "success"} status={emailOtpStatus} />
                    <div className="text-center min-h-[20px]">
                      {emailOtpStatus === "verifying" && <p className="text-amber-400 text-xs flex items-center justify-center gap-1.5"><RefreshCw className="w-3 h-3 animate-spin" /> Verifying…</p>}
                      {emailOtpStatus === "error" && <p className="text-red-400 text-xs flex items-center justify-center gap-1.5"><AlertCircle className="w-3 h-3" /> Incorrect OTP — clearing in a moment</p>}
                    </div>
                    <div className="text-center">
                      {countdown > 0 ? <p className="text-slate-500 text-sm">Resend in <span className={`font-bold tabular-nums ${c.text}`}>{countdown}s</span></p>
                        : <button type="button" onClick={sendEmailOtp} disabled={emailOtpLoading} className={`text-sm font-semibold hover:opacity-80 transition-opacity inline-flex items-center gap-1.5 ${c.text}`}>
                            <RefreshCw className={`w-3.5 h-3.5 ${emailOtpLoading ? "animate-spin" : ""}`} /> Resend OTP
                          </button>}
                    </div>
                  </div>
                )}
                <BackBtn onClick={goBack} />
              </motion.div>
            )}

            {/* ── Step 2: Entity details ── */}
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ duration: 0.22 }}>
                <div className="mb-7">
                  <h2 className="text-[1.65rem] font-black text-white mb-1">{config.stepDetailsLabel}</h2>
                  <p className="text-slate-500 text-sm">Tell us about your {config.entityLabel.toLowerCase()}</p>
                </div>
                <ErrBanner msg={error} />
                <div className="space-y-4">
                  {/* Phone */}
                  <DField label="Phone Number" required hint="You'll receive a WhatsApp OTP to verify this number">
                    <div className="flex gap-2">
                      <div className="flex items-center gap-1.5 px-3 h-11 bg-white/[0.04] border border-white/[0.09] rounded-xl shrink-0">
                        <span className="text-base">🇮🇳</span>
                        <span className="text-slate-400 text-sm font-semibold">+91</span>
                      </div>
                      <div className="relative flex-1">
                        <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                        <input type="tel" value={form.phone} onChange={e => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="98765 43210"
                          className={`w-full h-11 bg-white/[0.04] border rounded-xl text-white placeholder:text-slate-600 text-sm focus:outline-none focus:ring-1 transition-all pl-10 pr-10
                            ${form.phone.length > 0 ? form.phone.length === 10 ? "border-green-500/50 focus:border-green-500/70 focus:ring-green-500/25" : "border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20" : "border-white/[0.09] focus:border-white/25 focus:ring-white/10"}`}
                        />
                        {form.phone.length > 0 && (
                          <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
                            {form.phone.length === 10 ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
                          </span>
                        )}
                      </div>
                    </div>
                  </DField>

                  {/* Entity type */}
                  <DField label={config.entityTypeLabel}>
                    <select value={form[config.entityTypeFieldKey]} onChange={e => set(config.entityTypeFieldKey, e.target.value)}
                      className="w-full h-11 bg-white/[0.04] border border-white/[0.09] rounded-xl text-white text-sm px-4 focus:outline-none focus:border-white/25 focus:ring-1 focus:ring-white/10 transition-all appearance-none cursor-pointer">
                      {config.entityTypes.map(t => <option key={t} className="bg-[#0f1f35] text-white">{t}</option>)}
                    </select>
                  </DField>

                  {/* Address with Google Places */}
                  <DField label="Address" required hint="Start typing — select from Google suggestions to auto-fill city, state & coordinates">
                    <div className="relative">
                      <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none z-10" />
                      <input ref={addressRef} type="text" value={form.address} autoComplete="off"
                        onChange={e => { set("address", e.target.value); if (!e.target.value) setCoords(null); }}
                        placeholder="Start typing your address…"
                        className="w-full h-11 bg-white/[0.04] border border-white/[0.09] rounded-xl text-white placeholder:text-slate-600 text-sm focus:outline-none focus:border-white/25 focus:bg-white/[0.07] focus:ring-1 focus:ring-white/10 transition-all pl-10 pr-4" />
                    </div>
                    {coords && (
                      <p className="text-[11px] text-green-400 mt-1.5 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        Coordinates captured: {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                      </p>
                    )}
                  </DField>

                  {/* City / State */}
                  <div className="grid grid-cols-2 gap-3">
                    <DField label="City" hint="Auto-filled from address">
                      <DInput icon={MapPin} value={form.city} onChange={e => set("city", e.target.value)} placeholder="Bengaluru" />
                    </DField>
                    <DField label="State" hint="Auto-filled from address">
                      <DInput value={form.state} onChange={e => set("state", e.target.value)} placeholder="Karnataka" />
                    </DField>
                  </div>

                  {/* Registration number */}
                  <DField label="Registration Number" hint="Optional — government/council registration number">
                    <DInput value={form.registrationNumber} onChange={e => set("registrationNumber", e.target.value)} placeholder="Reg. number" />
                  </DField>

                  {/* Contact section divider */}
                  <div className="pt-2">
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-white/[0.07]" />
                      <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-[0.12em] px-2">{config.contactSectionTitle}</span>
                      <div className="h-px flex-1 bg-white/[0.07]" />
                    </div>
                  </div>

                  {/* Contact fields */}
                  {config.contactFields.map(f => (
                    <DField key={f.key} label={f.label} required={f.required}>
                      <DInput icon={f.Icon as any} value={form[f.key] || ""} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} />
                    </DField>
                  ))}

                  {/* Optional dropdown */}
                  {config.contactDropdown && (
                    <DField label={config.contactDropdown.label} required>
                      <select value={form[config.contactDropdown.key] || config.contactDropdown.options[0]} onChange={e => set(config.contactDropdown!.key, e.target.value)}
                        className="w-full h-11 bg-white/[0.04] border border-white/[0.09] rounded-xl text-white text-sm px-4 focus:outline-none focus:border-white/25 focus:ring-1 focus:ring-white/10 transition-all appearance-none cursor-pointer">
                        {config.contactDropdown.options.map(o => <option key={o} className="bg-[#0f1f35] text-white">{o}</option>)}
                      </select>
                    </DField>
                  )}

                  {/* ID card upload */}
                  {config.contactIdCard && (
                    <DField label={config.contactIdCard.label} required hint={config.contactIdCard.hint}>
                      {contactIdCardFile ? (
                        <div className={`flex items-center gap-3 p-3 rounded-xl border ${c.bg} ${c.border}`}>
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${c.badgeBg}`}>
                            <FileText className={`w-4 h-4 ${c.text}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{contactIdCardFile.name}</p>
                            <p className="text-xs text-slate-500">{fmtBytes(contactIdCardFile.size)}</p>
                          </div>
                          <button type="button" onClick={() => { setContactIdCardFile(null); if (contactIdCardRef.current) contactIdCardRef.current.value = ""; }}
                            className="p-1.5 hover:bg-red-500/15 rounded-lg text-slate-500 hover:text-red-400 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div onClick={() => contactIdCardRef.current?.click()}
                          className="flex items-center gap-3 p-4 border border-dashed border-white/15 rounded-xl cursor-pointer hover:border-white/30 hover:bg-white/[0.02] transition-all">
                          <Upload className="w-5 h-5 text-slate-600 shrink-0" />
                          <div>
                            <p className="text-sm text-slate-400 font-medium">Click to upload</p>
                            <p className="text-xs text-slate-600 mt-0.5">PDF, JPG, PNG · Max 10 MB</p>
                          </div>
                          <input ref={contactIdCardRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f && f.size <= 10 * 1024 * 1024) setContactIdCardFile(f); }} />
                        </div>
                      )}
                    </DField>
                  )}
                </div>

                <div className="flex gap-3 mt-7">
                  <button type="button" onClick={goBack}
                    className="flex-1 h-12 rounded-2xl border border-white/10 text-slate-400 hover:border-white/20 hover:text-white font-semibold text-sm transition-all flex items-center justify-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button type="button"
                    onClick={() => { setError(""); if (validateStep2()) { setStep(3); setPhoneOtpSent(false); setPhoneOtp(""); } }}
                    style={{ background: config.btnGradient, boxShadow: config.btnShadow }}
                    className="flex-1 h-12 rounded-2xl text-white font-bold text-sm transition-all flex items-center justify-center gap-2">
                    Verify Phone <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Step 3: Phone / WhatsApp OTP ── */}
            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ duration: 0.22 }}>
                <div className="text-center mb-7">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 220, delay: 0.05 }}
                    className="w-16 h-16 mx-auto mb-4 bg-[#25D366]/[0.12] rounded-2xl border border-[#25D366]/30 flex items-center justify-center">
                    <MessageCircle className="w-8 h-8 text-[#25D366]" />
                  </motion.div>
                  <h2 className="text-[1.65rem] font-black text-white mb-1">Verify via WhatsApp</h2>
                  <p className="text-slate-500 text-sm">
                    {phoneOtpSent ? <>OTP sent to <span className="text-[#25D366] font-semibold">+91 {form.phone}</span> on WhatsApp</>
                      : <>We'll send a code to <span className="text-[#25D366] font-semibold">+91 {form.phone}</span> on WhatsApp</>}
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
                    className="w-full h-12 rounded-2xl bg-[#25D366] hover:bg-[#22C55E] text-white font-bold text-sm shadow-[0_4px_24px_rgba(37,211,102,0.35)] hover:shadow-[0_4px_36px_rgba(37,211,102,0.5)] transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                    {phoneOtpLoading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</> : <><MessageCircle className="w-4 h-4" /> Send OTP via WhatsApp</>}
                  </button>
                ) : (
                  <div className="space-y-5">
                    <div className="text-center text-xs text-slate-600 mb-1">Enter the 6-digit code from WhatsApp</div>
                    <OtpInput value={phoneOtp} accentHex="#25D366"
                      onChange={v => { setPhoneOtp(v); setPhoneOtpStatus("idle"); setError(""); if (v.length === 6) verifyPhoneOtp(v); }}
                      disabled={phoneOtpStatus === "verifying" || phoneOtpStatus === "success"} status={phoneOtpStatus} />
                    <div className="text-center min-h-[20px]">
                      {phoneOtpStatus === "verifying" && <p className="text-amber-400 text-xs flex items-center justify-center gap-1.5"><RefreshCw className="w-3 h-3 animate-spin" /> Verifying…</p>}
                      {phoneOtpStatus === "error" && <p className="text-red-400 text-xs flex items-center justify-center gap-1.5"><AlertCircle className="w-3 h-3" /> Incorrect OTP — clearing in a moment</p>}
                    </div>
                    <div className="text-center">
                      {countdown > 0 ? <p className="text-slate-500 text-sm">Resend in <span className="text-[#25D366] font-bold tabular-nums">{countdown}s</span></p>
                        : <button type="button" onClick={sendPhoneOtp} disabled={phoneOtpLoading} className="text-[#25D366] text-sm font-semibold hover:text-[#22C55E] transition-colors inline-flex items-center gap-1.5">
                            <RefreshCw className={`w-3.5 h-3.5 ${phoneOtpLoading ? "animate-spin" : ""}`} /> Resend OTP
                          </button>}
                    </div>
                  </div>
                )}
                <BackBtn onClick={goBack} />
              </motion.div>
            )}

            {/* ── Step 4: Documents ── */}
            {step === 4 && (
              <motion.div key="s4" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={{ duration: 0.22 }}>
                <div className="mb-7">
                  <h2 className="text-[1.65rem] font-black text-white mb-1">Upload documents</h2>
                  <p className="text-slate-500 text-sm">Helps us verify your {config.entityLabel.toLowerCase()} faster.</p>
                </div>
                <ErrBanner msg={error} />
                <div className="grid gap-2 mb-5">
                  {config.requiredDocs.map((d, i) => (
                    <div key={d.id} className={`flex items-start gap-3 p-3 rounded-xl border text-sm transition-all ${uploadedFiles[i] ? `${c.bg} ${c.border}` : "bg-white/[0.02] border-white/[0.07]"}`}>
                      {uploadedFiles[i] ? <CheckCircle2 className={`w-4 h-4 mt-0.5 shrink-0 ${c.text}`} /> : <div className="w-4 h-4 rounded-full border border-white/20 mt-0.5 shrink-0" />}
                      <div>
                        <p className={`font-semibold text-sm ${uploadedFiles[i] ? c.text : "text-slate-400"}`}>{d.label}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{d.hint}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${isDragging ? "border-white/30 bg-white/[0.04] scale-[1.01]" : "border-white/10 hover:border-white/20 hover:bg-white/[0.02]"}`}>
                  <Upload className={`w-9 h-9 mx-auto mb-3 transition-colors ${isDragging ? "text-white/60" : "text-slate-600"}`} />
                  <p className="font-semibold text-slate-400 text-sm">Drop files or <span className={c.text}>click to browse</span></p>
                  <p className="text-xs text-slate-600 mt-1.5">PDF, JPG, PNG · Max 10 MB · Up to 5 files</p>
                  <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={e => addFiles(e.target.files)} />
                </div>
                {uploadedFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {uploadedFiles.map((u, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-white/[0.04] border border-white/[0.07] rounded-xl">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${c.badgeBg}`}>
                          <FileText className={`w-4 h-4 ${c.text}`} />
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
                    style={{ background: config.btnGradient, boxShadow: config.btnShadow }}
                    className="flex-1 h-12 rounded-2xl text-white font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                    {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Submitting…</> : "Submit Application"}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Step 5: Success ── */}
            {step === 5 && (
              <motion.div key="s5" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: "easeOut" }}
                className="text-center px-2 py-4">
                <div className="relative inline-flex mb-8">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 180, delay: 0.1 }}
                    style={{ background: config.btnGradient, boxShadow: config.btnShadow }}
                    className="w-24 h-24 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-12 h-12 text-white" />
                  </motion.div>
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.45, type: "spring", stiffness: 300 }}
                    className="absolute -top-1 -right-1 w-8 h-8 bg-emerald-400 rounded-full flex items-center justify-center shadow-lg border-[2.5px] border-[#07101f]">
                    <Sparkles className="w-4 h-4 text-white" />
                  </motion.div>
                </div>
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                  <h2 className="text-3xl font-black text-white mb-3">Application Submitted!</h2>
                  <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-[320px] mx-auto">
                    Your {config.entityLabel.toLowerCase()} registration is under review. Our team will verify your details and activate your account within <strong className="text-white">24–48 hours</strong>.
                  </p>
                  <div className="space-y-3 mb-8">
                    {[
                      "Documents are being reviewed by our team",
                      "You'll receive an email once approved",
                      `Log in with your credentials after approval`,
                    ].map((t, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/[0.07] rounded-xl">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="text-slate-400 text-sm">{t}</span>
                      </div>
                    ))}
                  </div>
                  <Link to={config.loginPath}
                    style={{ background: config.btnGradient }}
                    className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl text-white font-bold text-sm transition-all hover:brightness-110">
                    Go to Login <ChevronRight className="w-4 h-4" />
                  </Link>
                </motion.div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
