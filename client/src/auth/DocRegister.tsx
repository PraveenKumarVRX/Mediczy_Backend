import { useState, useRef, useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { BRAND } from "@/config/brand";
import { MediqzyLogo3D } from "@/components/ui/MediqzyLogo3D";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useDocRegister } from "@/hooks/auth";
import { generateDoctorSeal } from "@/components/doctor/DoctorSealGenerator";
import api from "@/utils/api";
import {
  Eye, EyeOff, Lock, User, Stethoscope, FileText, FileCheck2,
  ArrowRight, ArrowLeft, CheckCircle2, Upload, X, Plus,
  Building2, Phone, Mail, Shield, Star, Clock, Check, AlertCircle,
  MapPin, Search, Loader2, RefreshCw, Download,
} from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, "")
    : typeof window !== "undefined" ? window.location.origin : "");

// ─── Specializations ──────────────────────────────────────────────────────────
const SPECIALIZATIONS = [
  "General Practitioner","Cardiologist","Dermatologist","Pediatrician",
  "Orthopedist","Neurologist","Psychiatrist","Psychologist","Gynecologist",
  "ENT Specialist","Ophthalmologist","Rheumatologist","Pulmonologist",
  "Physiotherapist","Occupational Therapist","Nutritionist","Dietician",
  "Nephrologist","Urologist","Diabetologist","Intensivist",
  "Cardio Thoracic Surgeon","Vascular Surgeon","Neuro Surgeon",
  "Cardio Vascular Surgeon","Gastroenterologist","Gastro Surgeon",
  "General Surgeon","Proctologist","Podiatrician","Dentist",
  "Endocrinologist","Oncologist","Other",
] as const;

const INDIAN_COUNCILS = [
  "Medical Council of India (MCI)","National Medical Commission (NMC)",
  "Delhi Medical Council","Maharashtra Medical Council","Tamil Nadu Medical Council",
  "Karnataka Medical Council","Kerala Medical Council","West Bengal Medical Council",
  "Andhra Pradesh Medical Council","Telangana State Medical Council",
  "Rajasthan Medical Council","Uttar Pradesh Medical Council","Punjab Medical Council",
  "Gujarat Medical Council","Other",
];

// ─── Zod schema ───────────────────────────────────────────────────────────────
const formSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string()
    .min(8, "At least 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[a-z]/, "Must contain a lowercase letter")
    .regex(/[0-9]/, "Must contain a number"),
  phoneNumber: z.string().min(7, "Enter a valid phone number"),
  prefix: z.enum(["Dr","Mr","Ms","Mrs","Prof"]),
  firstName: z.string().min(3, "At least 3 characters").max(30),
  lastName: z.string().min(3, "At least 3 characters").max(30),
  specialization: z.enum(SPECIALIZATIONS as unknown as [string, ...string[]]),
  experience: z.preprocess(Number, z.number().min(0)),
  hospitalClinicName: z.string().optional(),
  practiceAddress: z.string().optional(),
  practiceCity: z.string().optional(),
  practiceState: z.string().optional(),
  practiceZipCode: z.string().optional(),
  practiceLatitude: z.number().optional(),
  practiceLongitude: z.number().optional(),
  qualifications: z.array(z.string().min(2)).min(1),
  ugQualifications: z.array(z.string()).optional(),
  pgQualifications: z.array(z.string()).optional(),
  medicalCouncilName: z.string().optional(),
  medicalCouncilRegistrationNumber: z.string().optional(),
  registrationNumber: z.string().optional(),
  onlineConsultationFee: z.preprocess(Number, z.number().min(0, 'Enter a valid fee')),
  inPersonConsultationFee: z.preprocess(Number, z.number().min(0, 'Enter a valid fee')),
  smFacebook:  z.string().optional(),
  smInstagram: z.string().optional(),
  smLinkedin:  z.string().optional(),
  smYoutube:   z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

// ─── Steps config ─────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, icon: Lock,        title: "Account",     desc: "Verify your email & phone" },
  { id: 2, icon: User,        title: "Profile",     desc: "Personal & professional info" },
  { id: 3, icon: MapPin,      title: "Practice",    desc: "Clinic / hospital address" },
  { id: 4, icon: Stethoscope, title: "Credentials", desc: "Qualifications & council" },
  { id: 5, icon: FileText,    title: "Documents",   desc: "Upload verification docs" },
  { id: 6, icon: FileCheck2,  title: "MOU",   desc: "Review & sign" },
];

const STEP_FIELDS: Record<number, Array<keyof FormValues>> = {
  1: ["email", "password", "phoneNumber"],
  2: ["prefix", "firstName", "lastName", "specialization", "experience", "onlineConsultationFee", "inPersonConsultationFee"],
  3: [],
  4: [],
};

// ─── Password strength ────────────────────────────────────────────────────────
function getStrength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}
const STR_LABEL = ["", "Too weak", "Weak", "Fair", "Strong", "Very strong"];
const STR_COLOR = ["", "#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"];

// ─── OTP Input ────────────────────────────────────────────────────────────────
interface OtpState {
  sent: boolean; code: string; verified: boolean;
  error: string; timer: number; sending: boolean; verifying: boolean;
}
const initOtp = (): OtpState => ({
  sent: false, code: "", verified: false,
  error: "", timer: 0, sending: false, verifying: false,
});

// ─── UploadZone ───────────────────────────────────────────────────────────────
interface UploadZoneProps {
  label: string; hint: string; accept: string;
  required?: boolean; file: File | null; onFile: (f: File | null) => void;
}
function UploadZone({ label, hint, accept, required, file, onFile }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  function validateAndSet(f: File) {
    if (f.size > 8 * 1024 * 1024) { alert("File too large (max 8 MB)"); return; }
    onFile(f);
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
        {label}
        {required && <span className="text-rose-500 text-xs">*</span>}
      </label>
      {file ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-emerald-800 truncate">{file.name}</p>
            <p className="text-xs text-emerald-600">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
          <button type="button" onClick={() => onFile(null)}
            className="p-1 rounded-lg hover:bg-emerald-100 text-emerald-500 hover:text-emerald-700 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) validateAndSet(f); }}
          className={`flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-xl border-2 border-dashed cursor-pointer transition-all ${drag ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"}`}
        >
          <Upload className={`h-5 w-5 ${drag ? "text-blue-500" : "text-slate-400"}`} />
          <p className="text-sm font-medium text-slate-600">Drop here or <span className="text-blue-600">browse</span></p>
          <p className="text-xs text-slate-400">{hint}</p>
        </div>
      )}
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) validateAndSet(f); }} />
    </div>
  );
}

// ─── SignaturePad ─────────────────────────────────────────────────────────────
function SignaturePad({ canvasRef, isEmpty, setIsEmpty }: {
  canvasRef: React.RefObject<HTMLCanvasElement>; isEmpty: boolean; setIsEmpty: (v: boolean) => void;
}) {
  const drawing = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); drawing.current = true;
    const pos = getPos(e); lastPt.current = pos;
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 1, 0, Math.PI * 2);
    ctx.fillStyle = "#1e293b"; ctx.fill();
    setIsEmpty(false);
  };
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); if (!drawing.current || !lastPt.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const pos = getPos(e);
    ctx.beginPath(); ctx.moveTo(lastPt.current.x, lastPt.current.y); ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
    lastPt.current = pos;
  };
  const endDraw = () => { drawing.current = false; lastPt.current = null; };
  const clear = () => { canvasRef.current!.getContext("2d")!.clearRect(0, 0, 560, 160); setIsEmpty(true); };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">Your Signature <span className="text-rose-500 text-xs">*</span></label>
        <button type="button" onClick={clear} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"><X className="h-3 w-3" /> Clear</button>
      </div>
      <div className={`rounded-xl border-2 overflow-hidden ${isEmpty ? "border-dashed border-slate-200" : "border-slate-300"}`}>
        <canvas ref={canvasRef} width={560} height={160} className="w-full touch-none cursor-crosshair bg-white block" style={{ height: 120 }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
      </div>
      {isEmpty && <p className="text-xs text-slate-400 text-center">Draw your signature above using mouse or touch</p>}
    </div>
  );
}

// ─── DocFiles ─────────────────────────────────────────────────────────────────
interface DocFiles { idProof: File | null; addressProof: File | null; medicalDegree: File | null; councilCertificate: File | null; signatureImage: File | null; sealImage: File | null; }

// ─── OtpRow ───────────────────────────────────────────────────────────────────
function OtpRow({ otp, setOtp, onSend, onVerify, label }: {
  otp: OtpState; setOtp: React.Dispatch<React.SetStateAction<OtpState>>;
  onSend: () => void; onVerify: () => void; label: string;
}) {
  if (otp.verified) {
    return (
      <div className="flex items-center gap-2 mt-1.5 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
        <span className="text-sm font-medium text-emerald-700">{label} verified</span>
      </div>
    );
  }
  if (!otp.sent) {
    return (
      <div className="mt-1.5">
        <button type="button" onClick={onSend} disabled={otp.sending}
          className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-60 transition-colors">
          {otp.sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
          {otp.sending ? "Sending…" : `Send verification OTP`}
        </button>
        {otp.error && <p className="text-xs text-rose-500 mt-1">{otp.error}</p>}
      </div>
    );
  }
  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-2">
        <Input
          value={otp.code}
          onChange={(e) => setOtp(o => ({ ...o, code: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
          placeholder="6-digit OTP"
          maxLength={6}
          className="h-10 text-center tracking-[0.3em] font-mono text-lg border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 flex-1"
        />
        <button type="button" onClick={onVerify} disabled={otp.code.length !== 6 || otp.verifying}
          className="h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-1.5">
          {otp.verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Verify
        </button>
      </div>
      <div className="flex items-center justify-between">
        {otp.error && <p className="text-xs text-rose-500">{otp.error}</p>}
        <div className="ml-auto">
          {otp.timer > 0 ? (
            <p className="text-xs text-slate-400">Resend in {otp.timer}s</p>
          ) : (
            <button type="button" onClick={onSend} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium">
              <RefreshCw className="h-3 w-3" /> Resend OTP
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
const DocRegister = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const docRegister = useDocRegister();

  const DRAFT_KEY = "docregister_draft_v1";

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [showPw, setShowPw] = useState(false);
  const [emailOtp, setEmailOtp] = useState<OtpState>(initOtp());
  const [phoneOtp, setPhoneOtp] = useState<OtpState>(initOtp());
  const [docFiles, setDocFiles] = useState<DocFiles>({ idProof: null, addressProof: null, medicalDegree: null, councilCertificate: null, signatureImage: null, sealImage: null });
  const [agreed, setAgreed] = useState({ accuracy: false, terms: false, ethics: false });
  const [sigEmpty, setSigEmpty] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qualifications, setQualifications] = useState([""]);
  const [ugQuals, setUgQuals] = useState([""]);
  const [pgQuals, setPgQuals] = useState([""]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationSubmitted, setRegistrationSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  // Google Places autocomplete state
  const [placeInput, setPlaceInput] = useState("");
  const [placePredictions, setPlacePredictions] = useState<any[]>([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [placeSelected, setPlaceSelected] = useState(false);
  const placeDebounce = useRef<NodeJS.Timeout>();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      email: "", password: "", phoneNumber: "",
      prefix: "Dr", firstName: "", lastName: "",
      specialization: undefined as any, experience: 0,
      hospitalClinicName: "", practiceAddress: "", practiceCity: "",
      practiceState: "", practiceZipCode: "",
      qualifications: [""], ugQualifications: [""], pgQualifications: [""],
      medicalCouncilName: "", medicalCouncilRegistrationNumber: "", registrationNumber: "",
      onlineConsultationFee: 0, inPersonConsultationFee: 0,
    },
  });

  const pwValue = form.watch("password");
  const pwStrength = getStrength(pwValue || "");

  // ─── Draft save / restore ─────────────────────────────────────────────────
  const saveDraft = useCallback(() => {
    try {
      const draft = {
        step,
        formValues: form.getValues(),
        qualifications,
        ugQuals,
        pgQuals,
        emailVerified: emailOtp.verified,
        phoneVerified: phoneOtp.verified,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch { /* non-fatal */ }
  }, [step, form, qualifications, ugQuals, pgQuals, emailOtp.verified, phoneOtp.verified, DRAFT_KEY]);

  // Restore draft on first mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.formValues) form.reset(draft.formValues);
      if (draft.qualifications?.length) setQualifications(draft.qualifications);
      if (draft.ugQuals?.length) setUgQuals(draft.ugQuals);
      if (draft.pgQuals?.length) setPgQuals(draft.pgQuals);
      if (draft.step) { setStep(draft.step); }
      if (draft.emailVerified) setEmailOtp(o => ({ ...o, verified: true }));
      if (draft.phoneVerified) setPhoneOtp(o => ({ ...o, verified: true }));
    } catch { /* non-fatal */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown timers
  useEffect(() => {
    if (emailOtp.timer <= 0) return;
    const t = setTimeout(() => setEmailOtp(o => ({ ...o, timer: o.timer - 1 })), 1000);
    return () => clearTimeout(t);
  }, [emailOtp.timer]);

  useEffect(() => {
    if (phoneOtp.timer <= 0) return;
    const t = setTimeout(() => setPhoneOtp(o => ({ ...o, timer: o.timer - 1 })), 1000);
    return () => clearTimeout(t);
  }, [phoneOtp.timer]);

  // Redirect if already logged in
  useEffect(() => {
    if (localStorage.getItem("doctorToken")) navigate("/doctor/dashboard", { replace: true });
  }, [navigate]);

  // ─── OTP helpers ─────────────────────────────────────────────────────────
  const sendEmailOtp = async () => {
    const ok = await form.trigger("email");
    if (!ok) return;
    const email = form.getValues("email");
    setEmailOtp(o => ({ ...o, sending: true, error: "" }));
    try {
      const res = await fetch("/api/doctors/send-email-otp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.success) {
        setEmailOtp(o => ({ ...o, sent: true, sending: false, timer: 60, code: "" }));
        toast({ title: "OTP sent", description: `Check your inbox at ${email}` });
      } else {
        setEmailOtp(o => ({ ...o, sending: false, error: data.message || "Failed to send" }));
      }
    } catch {
      setEmailOtp(o => ({ ...o, sending: false, error: "Network error — try again" }));
    }
  };

  const verifyEmailOtp = async () => {
    const email = form.getValues("email");
    setEmailOtp(o => ({ ...o, verifying: true, error: "" }));
    try {
      const res = await fetch("/api/doctors/verify-email-otp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: emailOtp.code }),
      });
      const data = await res.json();
      if (data.success) {
        setEmailOtp(o => ({ ...o, verified: true, verifying: false }));
        toast({ title: "Email verified ✓" });
      } else {
        setEmailOtp(o => ({ ...o, verifying: false, error: data.message || "Invalid OTP" }));
      }
    } catch {
      setEmailOtp(o => ({ ...o, verifying: false, error: "Verification failed" }));
    }
  };

  const sendPhoneOtp = async () => {
    const ok = await form.trigger("phoneNumber");
    if (!ok) return;
    const phone = form.getValues("phoneNumber");
    setPhoneOtp(o => ({ ...o, sending: true, error: "" }));
    try {
      const res = await fetch("/api/doctors/send-phone-otp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (data.success) {
        setPhoneOtp(o => ({ ...o, sent: true, sending: false, timer: 60, code: "" }));
        toast({ title: "OTP sent", description: `WhatsApp verification code sent to ${phone}` });
      } else {
        setPhoneOtp(o => ({ ...o, sending: false, error: data.message || "Failed to send" }));
      }
    } catch {
      setPhoneOtp(o => ({ ...o, sending: false, error: "Network error — try again" }));
    }
  };

  const verifyPhoneOtp = async () => {
    const phone = form.getValues("phoneNumber");
    setPhoneOtp(o => ({ ...o, verifying: true, error: "" }));
    try {
      const res = await fetch("/api/doctors/verify-phone-otp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: phoneOtp.code }),
      });
      const data = await res.json();
      if (data.success) {
        setPhoneOtp(o => ({ ...o, verified: true, verifying: false }));
        toast({ title: "Phone verified ✓" });
      } else {
        setPhoneOtp(o => ({ ...o, verifying: false, error: data.message || "Invalid OTP" }));
      }
    } catch {
      setPhoneOtp(o => ({ ...o, verifying: false, error: "Verification failed" }));
    }
  };

  // ─── Google Places ────────────────────────────────────────────────────────
  const onPlaceInput = (val: string) => {
    setPlaceInput(val);
    setPlaceSelected(false);
    form.setValue("hospitalClinicName", val);
    clearTimeout(placeDebounce.current);
    if (val.length < 3) { setPlacePredictions([]); return; }
    placeDebounce.current = setTimeout(async () => {
      setPlaceLoading(true);
      try {
        const r = await fetch(`/api/doctors/places-autocomplete?input=${encodeURIComponent(val)}&type=establishment`);
        const data = await r.json();
        setPlacePredictions(data.success ? (data.data || []) : []);
      } catch {
        setPlacePredictions([]);
      } finally {
        setPlaceLoading(false);
      }
    }, 350);
  };

  const onPlaceSelect = async (prediction: any) => {
    setPlaceInput(prediction.description || prediction.structured_formatting?.main_text || "");
    form.setValue("hospitalClinicName", prediction.structured_formatting?.main_text || prediction.description || "");
    setPlacePredictions([]);
    setPlaceSelected(true);

    // Fetch place details to auto-fill address fields
    if (prediction.place_id) {
      try {
        const r = await fetch(`/api/addresses/place/${prediction.place_id}`);
        const data = await r.json();
        if (data.success && data.data) {
          const d = data.data;
          if (d.formattedAddress) form.setValue("practiceAddress", d.formattedAddress);
          if (d.city)        form.setValue("practiceCity", d.city);
          if (d.state)       form.setValue("practiceState", d.state);
          if (d.postalCode)  form.setValue("practiceZipCode", d.postalCode);
          if (d.latitude)    form.setValue("practiceLatitude", d.latitude);
          if (d.longitude)   form.setValue("practiceLongitude", d.longitude);
        }
      } catch { /* non-fatal — user can fill manually */ }
    }
  };

  // ─── Navigation ───────────────────────────────────────────────────────────
  const go = async (dir: number) => {
    if (dir > 0) {
      const fields = STEP_FIELDS[step];
      if (fields?.length) {
        const ok = await form.trigger(fields as any);
        if (!ok) return;
      }
      if (step === 1) {
        if (!emailOtp.verified) {
          toast({ variant: "destructive", title: "Email not verified", description: "Please verify your email address before continuing." });
          return;
        }
        if (!phoneOtp.verified) {
          toast({ variant: "destructive", title: "Phone not verified", description: "Please verify your phone number before continuing." });
          return;
        }
      }
      if (step === 5) {
        if (!docFiles.idProof || !docFiles.medicalDegree) {
          toast({ variant: "destructive", title: "Required documents missing", description: "ID Proof and Medical Degree are required." });
          return;
        }
      }
      // Save draft when advancing
      saveDraft();
    }
    setDirection(dir);
    setStep(s => s + dir);
  };

  // ─── Seal auto-gen ────────────────────────────────────────────────────────
  const autoGenerateSeal = async (values: FormValues) => {
    try {
      const canvas = document.createElement("canvas");
      const name = `${values.firstName} ${values.lastName}`;
      const quals = qualifications.filter(Boolean).join(", ") || "MBBS";
      const reg = values.registrationNumber || values.medicalCouncilRegistrationNumber || "PENDING";
      const sealDataUrl = generateDoctorSeal(canvas, name, quals, reg, values.specialization || "", 200);
      await api.put("/doctors/template-settings", { seal: sealDataUrl, registrationNumber: reg, signatureName: `Dr. ${name}` });
    } catch { /* non-fatal */ }
  };

  const readBase64 = (file: File): Promise<string> =>
    new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(file); });

  // ─── Agreement ID (stable per session) ───────────────────────────────────
  const agreementIdRef = useRef(`MSP-${Date.now()}`);  

  // ─── Generate Agreement PDF ───────────────────────────────────────────────
  const generateAgreementPDFDoc = async (): Promise<string> => {
    const { default: JsPDF } = await import('jspdf');
    const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const values = form.getValues();
    const doctorName = `${values.prefix || 'Dr.'} ${values.firstName} ${values.lastName}`.trim();
    const doctorAddr = [values.practiceAddress, values.practiceCity, values.practiceState, values.practiceZipCode].filter(Boolean).join(', ') || 'Not provided';
    const quals = qualifications.filter(Boolean).join(', ') || 'Not provided';
    const regNo = values.registrationNumber || values.medicalCouncilRegistrationNumber || 'Pending';
    const council = values.medicalCouncilName || 'Not specified';
    const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const W = 210; const L = 20; const R = 190; const TW = R - L;
    let y = 0;

    // Header bar
    doc.setFillColor(29, 78, 216);
    doc.rect(0, 0, W, 20, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text('MAYDEN SMARTHEALTH PVT LTD', L, 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('403, D-Block, 4th Floor, IITM Research Park, Tharamani, Chennai – 600114, Tamil Nadu, India', L, 15);
    doc.setFontSize(7);
    doc.text(`CIN: U85110TN2023PTC000000  |  GST: 33AAAAA0000A1Z5`, R, 15, { align: 'right' });

    y = 28;
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('MEMORANDUM OF UNDERSTANDING (MOU)', W / 2, y, { align: 'center' });
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Agreement Date: ${today}   |   Agreement ID: ${agreementIdRef.current}`, W / 2, y, { align: 'center' });
    y += 7;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(L, y, R, y);
    y += 7;

    // Parties boxes
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text('PARTIES', L, y);
    y += 5;
    const bw = TW / 2 - 3;

    // Company box
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(191, 219, 254);
    doc.roundedRect(L, y, bw, 42, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(59, 130, 246);
    doc.text('SERVICE PROVIDER', L + 3, y + 6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(15, 23, 42);
    doc.text('Mayden SmartHealth Pvt Ltd', L + 3, y + 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(71, 85, 105);
    doc.text('Brand: My SmartHealth  |  Rep.: Dr. Shiva Kumar, CEO', L + 3, y + 18);
    const ca = doc.splitTextToSize('403, D-Block, 4th Floor, IITM Research Park, Tharamani, Chennai – 600114, Tamil Nadu, India', bw - 6);
    doc.text(ca, L + 3, y + 24);

    // Doctor box
    const bx = L + bw + 6;
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(167, 243, 208);
    doc.roundedRect(bx, y, bw, 42, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(16, 185, 129);
    doc.text('PRACTITIONER', bx + 3, y + 6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(15, 23, 42);
    const dnLines = doc.splitTextToSize(doctorName, bw - 6);
    doc.text(dnLines, bx + 3, y + 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(71, 85, 105);
    const da = doc.splitTextToSize(doctorAddr, bw - 6);
    doc.text(da, bx + 3, y + 18);
    y += 48;

    // Doctor credentials row
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(71, 85, 105);
    doc.text(`Clinic/Hospital: ${values.hospitalClinicName || '—'}`, L, y); y += 4.5;
    doc.text(`Phone: ${values.phoneNumber || '—'}   Email: ${values.email || '—'}`, L, y); y += 4.5;
    doc.text(`Qualifications: ${quals}`, L, y); y += 4.5;
    doc.text(`Medical Council: ${council}   Registration No.: ${regNo}`, L, y); y += 4.5;
    doc.text(`Specialization: ${values.specialization || '—'}   Experience: ${values.experience || '—'} years`, L, y); y += 4.5;
    doc.text(`Declared Fees — Online: \u20b9${values.onlineConsultationFee ?? '—'}   In-Person: \u20b9${values.inPersonConsultationFee ?? '—'}  (locked 1 year)`, L, y); y += 7;

    // Documents submitted box
    doc.setFillColor(254, 252, 232); doc.setDrawColor(253, 224, 71);
    doc.roundedRect(L, y, TW, 13, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(161, 98, 7);
    doc.text('IDENTITY DOCUMENTS SUBMITTED WITH THIS AGREEMENT:', L + 3, y + 5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 80, 0);
    doc.text(`ID Proof: ${docFiles.idProof?.name || '—'}   |   Address Proof: ${docFiles.addressProof?.name || '—'}`, L + 3, y + 10.5);
    y += 18;

    doc.setDrawColor(203, 213, 225); doc.line(L, y, R, y); y += 6;

    // Preamble
    doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(71, 85, 105);
    const preambleLines = doc.splitTextToSize(
      `This Memorandum of Understanding ("Agreement") is made on ${today}, by and between Mayden SmartHealth Pvt Ltd, a company incorporated under the Companies Act, 2013, operating the technology platform under the brand "My SmartHealth" that facilitates remote medical consultations, represented by Dr. Shiva Kumar (CEO) (hereinafter referred to as "the Company"); and ${doctorName}, Reg. No.: ${regNo} (hereinafter referred to as "the Physician"). Collectively referred to as the "Parties."`,
      TW - 5);
    doc.text(preambleLines, L, y); y += preambleLines.length * 4.2 + 5;

    // Terms heading
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(30, 41, 59);
    doc.text('TERMS AND CONDITIONS', L, y); y += 6;

    const clauses = [
      { n: '1', title: 'Scope of Services',
        body: `The Physician (which includes individual doctors, doctors with clinics, and doctors working in or owning hospitals) agrees to provide the following services:
1.1 Types of Consultations: Virtual (online) and in-person medical consultations for corporate employees through the SmartHealth platform and at designated premises, covering: general health issues; chronic disease management; mental wellness support; preventive care; and emergency advisory (non-critical cases).
1.2 Follow-up & Documentation: Conduct follow-up reviews and document patient progress on the platform. Two follow-up reviews shall be conducted free of charge.
1.3 Availability: Be available during agreed consultation hours and ensure timely communication with patients.
1.4 Guidelines: Provide medical guidance aligned with applicable Indian Medical Council (IMC) regulations.
1.5 Registration: Must be registered with the MCI or respective State Medical Council with a valid registration number, to be provided to the Company at signing.
1.6 Information Disclosure: Provide all information related to qualifications, experience, and place of business with documentary evidence, as requested by the Company.` },
      { n: '2', title: 'Ethics and Integrity',
        body: `2.1 Conduct consultations with the highest standards of ethics and integrity.
2.2 Patient safety shall be of paramount importance during all consultations and medical advice.
2.3 Follow all applicable professional codes of conduct and medical ethics guidelines.
2.4 Act ethically while referring patients to specialists, hospitals, or other healthcare providers.
2.5 Prescribe diagnostic tests and medications only when medically necessary and in line with established medical guidelines and best practices.
2.6 Adhere to the Prevention of Sexual Harassment (POSH) Act, 2013 while consulting female patients, ensuring all interactions are conducted with dignity and respect.` },
      { n: '3', title: 'Technology and Connectivity',
        body: `3.1 The Physician shall be responsible for having up-to-date electronic devices and maintaining optimal internet connectivity to conduct teleconsultations without interruptions.
3.2 In case of a call drop or connectivity issue, the Physician shall reconnect with the patient at the earliest and complete the consultation.
3.3 The Company will implement a patient review system where patients can rate the consultation and provide feedback for quality monitoring and service improvement.` },
      { n: '4', title: 'Prescription Compliance',
        body: `All prescriptions issued by the Physician shall strictly comply with prevailing guidelines, including but not limited to:
4.1 Schedule H – Prescription drugs
4.2 Schedule H1 – Restricted antibiotics
4.3 Schedule X – Narcotic and psychotropic substances
4.4 Schedule G – Caution drugs (to be taken under medical supervision)
4.5 Schedule J – Diseases and conditions that cannot be claimed to be treated
4.6 Schedule K – Exempted drugs from certain regulatory requirements
4.7 Schedule M – Good Manufacturing Practices (GMP) for pharmaceuticals` },
      { n: '5', title: "Dos and Don'ts",
        body: `5.1 Dos:\n• Conduct consultations professionally, adhering to the highest medical standards.\n• Ensure timely follow-up with patients for continuity of care.\n• Provide accurate and complete information regarding health conditions and treatment options.\n• Maintain patient confidentiality and comply with data protection laws.\n• Prescribe medications and tests only when medically necessary and in line with regulatory guidelines.\n• Reconnect promptly in case of a call drop or technical issue.\n• Keep patient records updated and accurate.\n5.2 Don'ts:\n• Do not disclose patient information to third parties without consent.\n• Do not prescribe medications or tests for non-medical reasons or under external influence.\n• Do not refuse consultation without valid reasons.\n• Do not engage in unethical practices, including accepting commissions for referrals.\n• Do not mislead patients with false information or unproven treatments.\n• Do not over-prescribe medications or tests to generate additional fees.\n• Do not engage in any behavior that could be construed as harassment or misconduct.` },
      { n: '6', title: 'Payment Terms',
        body: `The Physician's declared consultation fees are:\nOnline Consultation: \u20b9${values.onlineConsultationFee ?? '\u2014'}\nIn-Person Consultation: \u20b9${values.inPersonConsultationFee ?? '\u2014'}\nThese rates are locked for one year from the effective date of this MOU and shall not be revised without mutual written consent.\n\n6.1 The payment structure will vary depending on the Physician's specialization and experience and will be mutually agreed upon in writing.\n6.2 Payment is due within 30 days of receiving the invoice.\n6.3 Payments are subject to applicable taxes and deductions as per Indian tax laws.\n6.4 In case of any dispute regarding payment, the Company shall have the right to review and withhold the disputed amount until resolution.\n6.5 No payment will be made in the following cases: no-show by the Physician; incomplete consultation; or poor patient feedback regarding the consultation.` },
      { n: '7', title: 'Duration and Termination',
        body: `7.1 Term: This Agreement shall be effective for one year from the date of digital acceptance unless terminated earlier.
7.2 Renewal: The Agreement may be renewed upon mutual agreement of both Parties at the end of the term.
7.3 Termination with Notice: The Company reserves the right to terminate this Agreement at any time, without assigning any reason.
7.4 Immediate Termination: The Company reserves the right to terminate immediately upon: breach of contract by the Physician; professional misconduct or malpractice; regulatory action or legal issues affecting the Physician's practice; violation of confidentiality or data protection obligations; or any act or omission that harms the reputation of the Company.` },
      { n: '8', title: 'Confidentiality and Data Protection',
        body: `8.1 The Physician shall maintain strict confidentiality regarding patient information, medical records, and Company data.
8.2 The Physician shall not disclose any patient data or Company-related information to any third party without prior written consent, except as required by law.
8.3 Patient data shall not be misused or shared with any third party for financial or pecuniary gains.
8.4 The Physician shall not reach out to patients for any marketing or promotional purposes.` },
      { n: '9', title: 'Indemnity and Liability',
        body: `The Physician shall indemnify and hold harmless the Company from any claims, liabilities, or damages arising from:
9.1 Professional misconduct or negligence.
9.2 Violation of medical guidelines or statutory obligations.
9.3 Data breaches due to the Physician's negligence.
9.4 Incorrect medical advice or misdiagnosis.` },
      { n: '10', title: 'Arbitration and Governing Law',
        body: `All disputes arising out of or in connection with this Agreement shall be referred to arbitration under the Arbitration and Conciliation Act, 1996. The place of arbitration shall be Chennai, Tamil Nadu, and proceedings shall be conducted in English.
The above terms are agreeable to both parties and have been signed in the presence of the undersigned witnesses.` },
    ];

    for (const clause of clauses) {
      if (y > 245) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(15, 23, 42);
      doc.text(`${clause.n}. ${clause.title}`, L, y); y += 4.5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(71, 85, 105);
      const bl = doc.splitTextToSize(clause.body, TW - 5);
      doc.text(bl, L + 4, y); y += bl.length * 4.2 + 4;
    }

    // Signature section
    if (y > 200) { doc.addPage(); y = 20; } else { y += 5; }
    doc.setDrawColor(203, 213, 225); doc.line(L, y, R, y); y += 8;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(30, 41, 59);
    doc.text('EXECUTION — SIGNATURES', W / 2, y, { align: 'center' }); y += 8;

    const sbw = TW / 2 - 5;
    // Company sig block
    doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240);
    doc.roundedRect(L, y, sbw, 46, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(71, 85, 105);
    doc.text('FOR MAYDEN SMARTHEALTH PVT LTD', L + 3, y + 6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(148, 163, 184);
    doc.text('(To be signed by authorised representative)', L + 3, y + 11);
    doc.setDrawColor(148, 163, 184); doc.line(L + 3, y + 28, L + sbw - 3, y + 28);
    doc.setFontSize(7.5); doc.setTextColor(71, 85, 105);
    doc.text('Authorised Signatory', L + 3, y + 33);
    doc.text(`Date: ${today}`, L + 3, y + 40);

    // Doctor sig block
    const sb2 = L + sbw + 10;
    doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240);
    doc.roundedRect(sb2, y, sbw, 46, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(71, 85, 105);
    doc.text('PRACTITIONER SIGNATURE', sb2 + 3, y + 6);
    if (canvasRef.current && !sigEmpty) {
      try { doc.addImage(canvasRef.current.toDataURL('image/png'), 'PNG', sb2 + 3, y + 9, sbw - 6, 16); } catch {}
    }
    doc.setDrawColor(148, 163, 184); doc.line(sb2 + 3, y + 28, sb2 + sbw - 3, y + 28);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(71, 85, 105);
    doc.text(doctorName, sb2 + 3, y + 33);
    doc.text(`Reg. No.: ${regNo}`, sb2 + 3, y + 38);
    doc.text(`Date: ${today}`, sb2 + 3, y + 43);
    y += 53;

    // Witnesses
    if (y > 238) { doc.addPage(); y = 20; } else { y += 4; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(30, 41, 59);
    doc.text('Witnesses:', L, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(71, 85, 105);
    doc.line(L, y + 5, L + 55, y + 5);
    doc.text('1. ___________________________', L, y + 9);
    doc.line(L + 95, y + 5, L + 150, y + 5);
    doc.text('2. ___________________________', L + 95, y + 9);
    y += 18;

    // Footer
    doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5); doc.setTextColor(148, 163, 184);
    doc.text(`This MOU was digitally accepted by ${doctorName} on ${today} via the SmartHealth Doctor Registration Portal.`, W / 2, y, { align: 'center' });
    y += 4;
    doc.text(`Agreement ID: ${agreementIdRef.current}   |   CIN: U85110TN2023PTC000000`, W / 2, y, { align: 'center' });

    return doc.output('datauristring');
  };

  const downloadAgreement = async () => {
    try {
      const uri = await generateAgreementPDFDoc();
      const link = document.createElement('a');
      link.href = uri;
      const values = form.getValues();
      link.download = `MSH_MOU_${values.firstName}_${values.lastName}_${new Date().toISOString().slice(0,10)}.pdf`;
      link.click();
    } catch (e) {
      toast({ variant: 'destructive', title: 'PDF generation failed', description: 'Please try again.' });
    }
  };

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!agreed.accuracy || !agreed.terms || !agreed.ethics) {
      toast({ variant: "destructive", title: "Agreement required", description: "Please accept all three declarations." });
      return;
    }
    if (sigEmpty) {
      toast({ variant: "destructive", title: "Signature required", description: "Please sign in the signature box." });
      return;
    }
    setIsSubmitting(true);
    try {
      const docs: Record<string, any> = {};
      if (docFiles.idProof)           docs.idProof           = { name: docFiles.idProof.name,           type: docFiles.idProof.type,           data: await readBase64(docFiles.idProof) };
      if (docFiles.addressProof)      docs.addressProof      = { name: docFiles.addressProof.name,      type: docFiles.addressProof.type,      data: await readBase64(docFiles.addressProof) };
      if (docFiles.medicalDegree)     docs.medicalDegree     = { name: docFiles.medicalDegree.name,     type: docFiles.medicalDegree.type,     data: await readBase64(docFiles.medicalDegree) };
      if (docFiles.councilCertificate)docs.councilCertificate= { name: docFiles.councilCertificate.name,type: docFiles.councilCertificate.type,data: await readBase64(docFiles.councilCertificate) };
      if (docFiles.signatureImage)    docs.signatureImage    = { name: docFiles.signatureImage.name,    type: docFiles.signatureImage.type,    data: await readBase64(docFiles.signatureImage) };
      if (docFiles.sealImage)         docs.sealImage         = { name: docFiles.sealImage.name,         type: docFiles.sealImage.type,         data: await readBase64(docFiles.sealImage) };
      // Generate signed agreement PDF
      let agreementPdf: string | undefined;
      try { agreementPdf = await generateAgreementPDFDoc(); } catch { /* non-fatal */ }
      docs.agreement = {
        signedAt: new Date().toISOString(),
        signature: canvasRef.current?.toDataURL("image/png"),
        termsVersion: "1.0",
        agreementId: agreementIdRef.current,
        pdf: agreementPdf,
        parties: {
          company: "Mayden SmartHealth Pvt Ltd, 403 D-Block, IIT Madras Research Park, Tharamani, Chennai – 600113, Tamil Nadu, India",
          practitioner: `${form.getValues().prefix || 'Dr.'} ${form.getValues().firstName} ${form.getValues().lastName}`.trim(),
        },
      };
      docs.verifications = { emailVerified: true, phoneVerified: true };

      const values = form.getValues();
      const { smFacebook, smInstagram, smLinkedin, smYoutube, ...coreValues } = values;
      const payload = {
        ...coreValues,
        qualifications: qualifications.filter(Boolean),
        ugQualifications: ugQuals.filter(Boolean),
        pgQualifications: pgQuals.filter(Boolean),
        socialMedia: {
          facebook:  smFacebook?.trim()  || null,
          instagram: smInstagram?.trim() || null,
          linkedin:  smLinkedin?.trim()  || null,
          youtube:   smYoutube?.trim()   || null,
        },
        documents: docs,
      };

      docRegister.mutate(payload as any, {
        onSuccess: async (data: any) => {
          // No token issued — account needs manual activation
          // Clear saved draft on successful submission
          try { localStorage.removeItem(DRAFT_KEY); } catch { /* non-fatal */ }
          setSubmittedEmail(form.getValues('email'));
          setRegistrationSubmitted(true);
          toast({ title: "Application submitted!", description: "Our team will review your documents and activate your account." });
        },
        onError: (error: any) => {
          const msg = error?.response?.data?.[0]?.message || error?.response?.data?.message || "Registration failed. Please try again.";
          toast({ variant: "destructive", title: "Registration failed", description: msg });
          setIsSubmitting(false);
        },
      });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Something went wrong. Please try again." });
      setIsSubmitting(false);
    }
  };

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? 48 : -48, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit:  (d: number) => ({ x: d > 0 ? -48 : 48, opacity: 0 }),
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  // ── Pending activation screen ───────────────────────────────────────────────
  if (registrationSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#f8fafc]">
        <div className="max-w-lg w-full text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold text-slate-900">Application Submitted!</h1>
            <p className="text-slate-500 text-sm leading-relaxed">
              Your registration and documents have been submitted to <strong>Mayden SmartHealth Pvt Ltd</strong> for verification.
              Our team will review your details and activate your account within 1–2 business days.
            </p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 space-y-3 text-left">
            <p className="text-sm font-semibold text-blue-800">What happens next?</p>
            <ul className="space-y-2 text-sm text-blue-700">
              <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" /> A confirmation email has been sent to <strong>{submittedEmail}</strong></li>
              <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" /> Our team will verify your ID proof, address proof, and medical credentials</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" /> Once approved, you will receive an activation email with your login link</li>
            </ul>
          </div>
          <p className="text-xs text-slate-400">
            Questions? Email us at <a href="mailto:support@mediczy.com" className="text-blue-600 hover:underline">support@mediczy.com</a>
          </p>
          <Link to="/doctor/login" className="inline-block mt-2 text-sm text-blue-600 hover:underline font-medium">
            Already activated? Sign in →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-start justify-center p-4 py-8 relative overflow-hidden bg-[#f8fafc]">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%230f172a' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4z'/%3E%3C/g%3E%3C/svg%3E")` }} />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(59,130,246,0.07), transparent)" }} />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[320px_1fr] rounded-2xl overflow-hidden bg-white shadow-[0_8px_64px_-12px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)] relative z-10">

        {/* ─── LEFT PANEL ──────────────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col relative overflow-hidden"
          style={{ background: "linear-gradient(155deg, #0f172a 0%, #1e3a8a 40%, #1d4ed8 70%, #0284c7 100%)" }}>
          <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full blur-3xl opacity-20"
            style={{ background: "radial-gradient(circle, #60a5fa, transparent)" }} />
          <div className="absolute bottom-20 -left-8 w-44 h-44 rounded-full blur-3xl opacity-15"
            style={{ background: "radial-gradient(circle, #818cf8, transparent)" }} />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div className="absolute inset-0 opacity-[0.05]"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='1' fill='white'/%3E%3C/svg%3E")` }} />

          <div className="relative z-10 flex flex-col h-full p-7">
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-7">
              <MediqzyLogo3D size="md" float theme="light" />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} className="mb-7">
              <h2 className="text-xl font-extrabold text-white leading-tight">
                Join India's leading<br />
                <span className="bg-gradient-to-r from-blue-300 to-cyan-300 bg-clip-text text-transparent">doctor network</span>
              </h2>
              <p className="text-white/45 text-xs mt-2">Complete all 6 steps to activate your account</p>
            </motion.div>

            <div className="flex-1 space-y-0.5">
              {STEPS.map(({ id, icon: Icon, title, desc }, i) => {
                const done = step > id; const active = step === id;
                return (
                  <motion.div key={id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.05 }} className="flex items-start gap-2.5">
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-all duration-300 ${done ? "bg-emerald-400 text-white shadow-[0_0_10px_rgba(52,211,153,0.5)]" : active ? "bg-white text-blue-700 shadow-[0_0_14px_rgba(255,255,255,0.4)]" : "bg-white/10 text-white/35"}`}>
                        {done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                      </div>
                      {i < STEPS.length - 1 && <div className={`w-0.5 h-5 my-0.5 rounded-full transition-all duration-500 ${done ? "bg-emerald-400/60" : "bg-white/10"}`} />}
                    </div>
                    <div className={`pt-1 pb-3 transition-all duration-200 ${active ? "opacity-100" : "opacity-35"}`}>
                      <p className={`text-xs font-semibold leading-none ${active ? "text-white" : "text-white/70"}`}>{title}</p>
                      {active && <p className="text-[10px] text-white/50 mt-0.5">{desc}</p>}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-3 gap-1.5">
              {[{ icon: Shield, value: "HIPAA", label: "Compliant" }, { icon: Star, value: "4.9/5", label: "Rating" }, { icon: Clock, value: "24/7", label: "Support" }].map(({ icon: Icon, value, label }) => (
                <div key={label} className="flex flex-col items-center gap-0.5">
                  <Icon className="h-3 w-3 text-blue-300" />
                  <p className="text-white font-bold text-[11px]">{value}</p>
                  <p className="text-white/35 text-[10px]">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── RIGHT FORM PANEL ────────────────────────────────────────── */}
        <div className="flex flex-col bg-white min-h-0 text-slate-900">
          {/* Header */}
          <div className="px-8 pt-7 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-4 lg:hidden">
              <MediqzyLogo3D size="sm" theme="dark" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-0.5">Step {step} of 6</p>
                <h1 className="text-xl font-bold text-slate-900">{STEPS[step - 1].title}</h1>
                <p className="text-slate-400 text-xs mt-0.5">{STEPS[step - 1].desc}</p>
              </div>
              <div className="hidden sm:flex items-center gap-1">
                {STEPS.map(({ id }) => (
                  <div key={id} className={`h-1.5 rounded-full transition-all duration-500 ${id < step ? "bg-emerald-400 w-5" : id === step ? "bg-blue-500 w-7" : "bg-slate-200 w-3.5"}`} />
                ))}
              </div>
            </div>
          </div>

          {/* Step body */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <Form {...form}>
              <form onSubmit={(e) => e.preventDefault()}>
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div key={step} custom={direction} variants={variants}
                    initial="enter" animate="center" exit="exit"
                    transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>

                    {/* ── STEP 1: Account + OTP ─────────────────────── */}
                    {step === 1 && (
                      <div className="space-y-5">
                        {/* Email */}
                        <div>
                          <FormField control={form.control} name="email" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium text-slate-700 flex items-center justify-between">
                                Email Address
                                {emailOtp.verified && (
                                  <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> Verified
                                  </span>
                                )}
                              </FormLabel>
                              <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                                <FormControl>
                                  <Input {...field} type="email" placeholder="doctor@example.com" autoComplete="email"
                                    disabled={emailOtp.verified}
                                    className="h-11 pl-10 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-60 transition-all" />
                                </FormControl>
                              </div>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )} />
                          <OtpRow otp={emailOtp} setOtp={setEmailOtp} onSend={sendEmailOtp} onVerify={verifyEmailOtp} label="Email" />
                        </div>

                        {/* Password */}
                        <FormField control={form.control} name="password" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium text-slate-700">Password</FormLabel>
                            <div className="relative">
                              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                              <FormControl>
                                <Input {...field} type={showPw ? "text" : "password"} placeholder="Create a strong password" autoComplete="new-password"
                                  className="h-11 pl-10 pr-12 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                              </FormControl>
                              <button type="button" onClick={() => setShowPw(!showPw)}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                            {(pwValue || "").length > 0 && (
                              <div className="space-y-1 mt-2">
                                <div className="flex gap-1">
                                  {[1,2,3,4,5].map(i => (
                                    <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
                                      style={{ background: i <= pwStrength ? STR_COLOR[pwStrength] : "#e2e8f0" }} />
                                  ))}
                                </div>
                                <p className="text-[11px] font-medium" style={{ color: STR_COLOR[pwStrength] || "#94a3b8" }}>
                                  {STR_LABEL[pwStrength]}
                                </p>
                              </div>
                            )}
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )} />

                        {/* Phone */}
                        <div>
                          <FormField control={form.control} name="phoneNumber" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium text-slate-700 flex items-center justify-between">
                                Phone Number (WhatsApp)
                                {phoneOtp.verified && (
                                  <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> Verified
                                  </span>
                                )}
                              </FormLabel>
                              <div className="relative">
                                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                                <FormControl>
                                  <Input {...field} type="tel" placeholder="+91 98765 43210" autoComplete="tel"
                                    disabled={phoneOtp.verified}
                                    className="h-11 pl-10 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-60 transition-all" />
                                </FormControl>
                              </div>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )} />
                          <OtpRow otp={phoneOtp} setOtp={setPhoneOtp} onSend={sendPhoneOtp} onVerify={verifyPhoneOtp} label="Phone" />
                        </div>

                        {/* OAuth */}
                        <div className="relative my-1">
                          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-100" /></div>
                          <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-slate-400 uppercase tracking-wider">or sign up with</span></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <button type="button" onClick={() => window.location.href = `${API_BASE_URL}/api/auth/doctor/google`}
                            className="h-10 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 transition-all">
                            <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                            Google
                          </button>
                          <button type="button" onClick={() => window.location.href = `${API_BASE_URL}/api/auth/doctor/facebook`}
                            className="h-10 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-blue-50 text-sm font-medium text-slate-700 transition-all">
                            <svg className="h-4 w-4 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                            Facebook
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── STEP 2: Personal & Professional ──────────── */}
                    {step === 2 && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                          <FormField control={form.control} name="prefix" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium text-slate-700">Title</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-11 border-slate-200 bg-slate-50 rounded-xl focus:ring-2 focus:ring-blue-500/20">
                                    <SelectValue placeholder="Dr" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {["Dr","Mr","Ms","Mrs","Prof"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="firstName" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium text-slate-700">First Name</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Rahul" className="h-11 border-slate-200 bg-slate-50 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="lastName" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium text-slate-700">Last Name</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Sharma" className="h-11 border-slate-200 bg-slate-50 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )} />
                        </div>

                        <FormField control={form.control} name="specialization" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium text-slate-700">Specialization</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger className="h-11 border-slate-200 bg-slate-50 rounded-xl focus:ring-2 focus:ring-blue-500/20">
                                  <SelectValue placeholder="Select your specialty" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="max-h-[260px]">
                                {SPECIALIZATIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )} />

                        <FormField control={form.control} name="experience" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium text-slate-700">Years of Experience</FormLabel>
                            <FormControl>
                              <Input {...field} type="number" min="0" max="60" placeholder="e.g. 8"
                                className="h-11 border-slate-200 bg-slate-50 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )} />

                        {/* Social Media Pages */}
                        <div className="pt-3 border-t border-slate-100">
                          <div className="flex items-center gap-2 mb-1">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
                            <p className="text-sm font-semibold text-slate-700">Social Media Pages <span className="text-xs font-normal text-slate-400">(optional)</span></p>
                          </div>
                          <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                            Add your professional pages — your profile picture, bio and videos will be displayed to patients in their health feed.
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <FormField control={form.control} name="smFacebook" render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <div className="flex items-center gap-2 h-11 border border-slate-200 bg-slate-50 rounded-xl px-3 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.791-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.884v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
                                    <input {...field} placeholder="facebook.com/your-page" className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 outline-none" />
                                  </div>
                                </FormControl>
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="smInstagram" render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <div className="flex items-center gap-2 h-11 border border-slate-200 bg-slate-50 rounded-xl px-3 focus-within:ring-2 focus-within:ring-pink-500/20 focus-within:border-pink-400">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="url(#igGrad)"><defs><linearGradient id="igGrad" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#f09433"/><stop offset="25%" stopColor="#e6683c"/><stop offset="50%" stopColor="#dc2743"/><stop offset="75%" stopColor="#cc2366"/><stop offset="100%" stopColor="#bc1888"/></linearGradient></defs><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
                                    <input {...field} placeholder="instagram.com/your-handle" className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 outline-none" />
                                  </div>
                                </FormControl>
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="smLinkedin" render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <div className="flex items-center gap-2 h-11 border border-slate-200 bg-slate-50 rounded-xl px-3 focus-within:ring-2 focus-within:ring-blue-600/20 focus-within:border-blue-600">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                                    <input {...field} placeholder="linkedin.com/in/your-profile" className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 outline-none" />
                                  </div>
                                </FormControl>
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="smYoutube" render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <div className="flex items-center gap-2 h-11 border border-slate-200 bg-slate-50 rounded-xl px-3 focus-within:ring-2 focus-within:ring-red-500/20 focus-within:border-red-500">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF0000"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                                    <input {...field} placeholder="youtube.com/@your-channel" className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 outline-none" />
                                  </div>
                                </FormControl>
                              </FormItem>
                            )} />
                          </div>
                        </div>

                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
                          <p className="text-xs text-amber-700 font-medium flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 shrink-0" /> Consultation fees declared here will be locked for 1 year from your registration date and will appear in your MoU.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <FormField control={form.control} name="onlineConsultationFee" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium text-slate-700">Online Consultation Fee (₹)</FormLabel>
                              <FormControl>
                                <Input {...field} type="number" min="0" placeholder="e.g. 500"
                                  className="h-11 border-slate-200 bg-slate-50 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="inPersonConsultationFee" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium text-slate-700">In-Person Consultation Fee (₹)</FormLabel>
                              <FormControl>
                                <Input {...field} type="number" min="0" placeholder="e.g. 800"
                                  className="h-11 border-slate-200 bg-slate-50 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )} />
                        </div>
                      </div>
                    )}

                    {/* ── STEP 3: Practice Address (Google Places) ── */}
                    {step === 3 && (
                      <div className="space-y-4">
                        <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
                          <MapPin className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                          <p className="text-xs text-blue-700 leading-relaxed">
                            Search for your clinic or hospital name below — we'll auto-fill the verified address from Google. You can edit the fields if needed.
                          </p>
                        </div>

                        {/* Clinic / hospital name autocomplete */}
                        <div className="relative">
                          <label className="text-sm font-medium text-slate-700 block mb-1.5">
                            Clinic / Hospital Name
                            {placeSelected && <span className="ml-2 text-xs text-emerald-600 font-semibold inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Verified by Google</span>}
                          </label>
                          <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                            <input
                              value={placeInput}
                              onChange={(e) => onPlaceInput(e.target.value)}
                              placeholder="Start typing clinic or hospital name…"
                              className="w-full h-11 pl-10 pr-10 border border-slate-200 bg-slate-50 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm outline-none transition-all"
                            />
                            {placeLoading && <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />}
                            {!placeLoading && placeSelected && <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />}
                          </div>

                          {/* Dropdown */}
                          {placePredictions.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
                              {placePredictions.map((p, i) => (
                                <button key={p.place_id || i} type="button" onClick={() => onPlaceSelect(p)}
                                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0">
                                  <MapPin className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-slate-800 truncate">
                                      {p.structured_formatting?.main_text || p.description}
                                    </p>
                                    {p.structured_formatting?.secondary_text && (
                                      <p className="text-xs text-slate-500 truncate">{p.structured_formatting.secondary_text}</p>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Address fields — auto-filled or manual */}
                        <FormField control={form.control} name="practiceAddress" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium text-slate-700">Full Address</FormLabel>
                            <FormControl>
                              <textarea {...field} placeholder="Street, area, locality" rows={2}
                                className="w-full px-3.5 py-2.5 border border-slate-200 bg-slate-50 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm resize-none outline-none transition-all" />
                            </FormControl>
                          </FormItem>
                        )} />

                        <div className="grid grid-cols-3 gap-3">
                          <FormField control={form.control} name="practiceCity" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium text-slate-700">City</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Mumbai" className="h-10 border-slate-200 bg-slate-50 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm" />
                              </FormControl>
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="practiceState" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium text-slate-700">State</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Maharashtra" className="h-10 border-slate-200 bg-slate-50 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm" />
                              </FormControl>
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="practiceZipCode" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium text-slate-700">PIN Code</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="400001" className="h-10 border-slate-200 bg-slate-50 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm" />
                              </FormControl>
                            </FormItem>
                          )} />
                        </div>

                        <p className="text-xs text-slate-400 flex items-center gap-1.5">
                          <MapPin className="h-3 w-3" />
                          Address powered by Google Places — you can also type manually
                        </p>
                      </div>
                    )}

                    {/* ── STEP 4: Credentials ───────────────────────── */}
                    {step === 4 && (
                      <div className="space-y-5">
                        <div>
                          <label className="text-sm font-medium text-slate-700 block mb-2">
                            Primary Qualifications <span className="text-rose-500 text-xs">*</span>
                          </label>
                          <div className="space-y-2">
                            {qualifications.map((q, i) => (
                              <div key={i} className="flex gap-2">
                                <FormField control={form.control} name={`qualifications.${i}`} render={({ field }) => (
                                  <FormItem className="flex-1">
                                    <FormControl>
                                      <Input {...field} placeholder="e.g. MBBS, MD, DM"
                                        className="h-10 border-slate-200 bg-slate-50 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        onChange={(e) => { const n = [...qualifications]; n[i] = e.target.value; setQualifications(n); field.onChange(e); }} />
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                  </FormItem>
                                )} />
                                {qualifications.length > 1 && (
                                  <button type="button" onClick={() => setQualifications(qualifications.filter((_, j) => j !== i))}
                                    className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 hover:border-rose-200 hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-all">
                                    <X className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          <button type="button" onClick={() => setQualifications([...qualifications, ""])}
                            className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors">
                            <Plus className="h-3.5 w-3.5" /> Add qualification
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-slate-700 block mb-2">UG Qualifications</label>
                            {ugQuals.map((q, i) => (
                              <div key={i} className="flex gap-2 mb-2">
                                <Input value={q} placeholder="e.g. MBBS" onChange={(e) => { const n = [...ugQuals]; n[i] = e.target.value; setUgQuals(n); form.setValue(`ugQualifications.${i}`, e.target.value); }}
                                  className="h-10 border-slate-200 bg-slate-50 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-sm" />
                              </div>
                            ))}
                            <button type="button" onClick={() => setUgQuals([...ugQuals, ""])} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                              <Plus className="h-3 w-3" /> Add
                            </button>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-slate-700 block mb-2">PG Qualifications</label>
                            {pgQuals.map((q, i) => (
                              <div key={i} className="flex gap-2 mb-2">
                                <Input value={q} placeholder="e.g. MD, DM" onChange={(e) => { const n = [...pgQuals]; n[i] = e.target.value; setPgQuals(n); form.setValue(`pgQualifications.${i}`, e.target.value); }}
                                  className="h-10 border-slate-200 bg-slate-50 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-sm" />
                              </div>
                            ))}
                            <button type="button" onClick={() => setPgQuals([...pgQuals, ""])} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                              <Plus className="h-3 w-3" /> Add
                            </button>
                          </div>
                        </div>

                        <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50/60 space-y-3">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Medical Council Registration</p>
                          <FormField control={form.control} name="medicalCouncilName" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium text-slate-700">Council Name</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-11 border-slate-200 bg-white rounded-xl focus:ring-2 focus:ring-blue-500/20">
                                    <SelectValue placeholder="Select council" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {INDIAN_COUNCILS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )} />
                          <div className="grid grid-cols-2 gap-3">
                            <FormField control={form.control} name="medicalCouncilRegistrationNumber" render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium text-slate-700">Council Reg. No.</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="MCI-12345" className="h-11 border-slate-200 bg-white rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                                </FormControl>
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="registrationNumber" render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium text-slate-700">General Reg. No.</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="REG-98765" className="h-11 border-slate-200 bg-white rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                                </FormControl>
                              </FormItem>
                            )} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── STEP 5: Documents ─────────────────────────── */}
                    {step === 5 && (
                      <div className="space-y-4">
                        <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
                          <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                          <p className="text-xs text-blue-700 leading-relaxed">
                            Upload clear, legible copies. Accepted: PDF, JPEG, PNG (max 8 MB each).
                            ID Proof and Medical Degree are <strong>required</strong>.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          <UploadZone label="Government ID Proof" hint="Aadhaar / Passport / PAN / Driving License · PDF, JPG, PNG" accept=".pdf,.jpg,.jpeg,.png" required
                            file={docFiles.idProof} onFile={(f) => setDocFiles(d => ({ ...d, idProof: f }))} />
                          <UploadZone label="Address Proof" hint="Utility bill / Aadhaar / Bank statement · PDF, JPG, PNG" accept=".pdf,.jpg,.jpeg,.png"
                            file={docFiles.addressProof} onFile={(f) => setDocFiles(d => ({ ...d, addressProof: f }))} />
                          <UploadZone label="Medical Degree Certificate" hint="MBBS / MD / DM degree certificate · PDF, JPG, PNG" accept=".pdf,.jpg,.jpeg,.png" required
                            file={docFiles.medicalDegree} onFile={(f) => setDocFiles(d => ({ ...d, medicalDegree: f }))} />
                          <UploadZone label="Medical Council Registration Certificate" hint="Issued by state / national medical council · PDF, JPG, PNG" accept=".pdf,.jpg,.jpeg,.png"
                            file={docFiles.councilCertificate} onFile={(f) => setDocFiles(d => ({ ...d, councilCertificate: f }))} />
                          <UploadZone label="Signature Image" hint="Clear scan or photo of your handwritten signature · JPG, PNG" accept=".jpg,.jpeg,.png"
                            file={docFiles.signatureImage} onFile={(f) => setDocFiles(d => ({ ...d, signatureImage: f }))} />
                          <UploadZone label="Seal / Stamp Image" hint="Doctor's official seal or rubber stamp · JPG, PNG" accept=".jpg,.jpeg,.png"
                            file={docFiles.sealImage} onFile={(f) => setDocFiles(d => ({ ...d, sealImage: f }))} />
                        </div>
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          {[
                            { label: "ID Proof", done: !!docFiles.idProof, req: true },
                            { label: "Address", done: !!docFiles.addressProof, req: false },
                            { label: "Degree", done: !!docFiles.medicalDegree, req: true },
                            { label: "Council Cert", done: !!docFiles.councilCertificate, req: false },
                            { label: "Signature", done: !!docFiles.signatureImage, req: false },
                            { label: "Seal", done: !!docFiles.sealImage, req: false },
                          ].map(({ label, done, req }) => (
                            <span key={label} className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full ${done ? "bg-emerald-100 text-emerald-700" : req ? "bg-rose-50 text-rose-500" : "bg-slate-100 text-slate-500"}`}>
                              {done ? <Check className="h-2.5 w-2.5" /> : req ? <AlertCircle className="h-2.5 w-2.5" /> : null}
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── STEP 6: Agreement & Signature ────────────── */}
                    {step === 6 && (() => {
                      const v = form.getValues();
                      const doctorName = `${v.prefix || 'Dr.'} ${v.firstName} ${v.lastName}`.trim();
                      const doctorAddr = [v.practiceAddress, v.practiceCity, v.practiceState, v.practiceZipCode].filter(Boolean).join(', ') || 'Address on file';
                      const quals = qualifications.filter(Boolean).join(', ') || '—';
                      const regNo = v.registrationNumber || v.medicalCouncilRegistrationNumber || 'Pending';
                      const council = v.medicalCouncilName || '—';
                      const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
                      return (
                        <div className="space-y-5">
                          {/* Agreement document preview */}
                          <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                            {/* Header bar */}
                            <div className="px-5 py-3.5 flex items-center justify-between"
                              style={{ background: 'linear-gradient(90deg, #1d4ed8, #0284c7)' }}>
                              <div className="flex items-center gap-2">
                                <FileCheck2 className="h-4 w-4 text-white" />
                                <span className="text-sm font-bold text-white">Memorandum of Understanding (MOU)</span>
                                <span className="text-[10px] text-blue-200 border border-blue-300 rounded px-1.5 py-0.5">v1.0</span>
                              </div>
                              <button type="button" onClick={downloadAgreement}
                                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-all">
                                <Download className="h-3.5 w-3.5" /> Download PDF
                              </button>
                            </div>

                            {/* Scrollable contract body */}
                            <div className="max-h-72 overflow-y-auto bg-white">
                              {/* Company letterhead strip */}
                              <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
                                <p className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Mayden SmartHealth Pvt Ltd</p>
                                <p className="text-[10px] text-slate-500">403, D-Block, 4th Floor, IITM Research Park, Tharamani, Chennai – 600114, Tamil Nadu, India</p>
                              </div>

                              <div className="px-5 py-4 space-y-4 text-xs text-slate-700 leading-relaxed">
                                {/* Title */}
                                <div className="text-center space-y-1">
                                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">Memorandum of Understanding (MOU)</h3>
                                  <p className="text-slate-500">Agreement Date: {today} &nbsp;|&nbsp; ID: {agreementIdRef.current}</p>
                                </div>

                                {/* Preamble */}
                                <p className="text-[11px] text-slate-600 leading-relaxed italic border-l-2 border-slate-200 pl-3">
                                  This MOU is made on {today} by and between <strong>Mayden SmartHealth Pvt Ltd</strong>, operating under the brand <strong>"My SmartHealth"</strong>, represented by <strong>Dr. Shiva Kumar (CEO)</strong> (hereinafter "the Company"); and <strong>{doctorName}</strong> (hereinafter "the Physician"). Collectively referred to as the "Parties."
                                </p>

                                {/* Parties */}
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-0.5">
                                    <p className="text-[10px] font-bold text-blue-600 uppercase">Service Provider</p>
                                    <p className="font-bold text-slate-800 text-xs">Mayden SmartHealth Pvt Ltd</p>
                                    <p className="text-slate-500 text-[10px] italic">Brand: My SmartHealth</p>
                                    <p className="text-slate-500 text-[10px]">Rep.: Dr. Shiva Kumar, CEO</p>
                                    <p className="text-slate-500 text-[10px]">403, D-Block, 4th Floor, IITM Research Park</p>
                                    <p className="text-slate-500 text-[10px]">Tharamani, Chennai – 600114</p>
                                  </div>
                                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 space-y-0.5">
                                    <p className="text-[10px] font-bold text-emerald-600 uppercase">Practitioner</p>
                                    <p className="font-bold text-slate-800 text-xs">{doctorName}</p>
                                    <p className="text-slate-500 text-[10px]">{doctorAddr}</p>
                                    {quals !== '—' && <p className="text-slate-500 text-[10px]">{quals}</p>}
                                    {regNo !== 'Pending' && <p className="text-slate-500 text-[10px]">Reg. No.: {regNo}</p>}
                                    {v.hospitalClinicName && <p className="text-slate-500 text-[10px]">{v.hospitalClinicName}</p>}
                                    {v.phoneNumber && <p className="text-slate-500 text-[10px]">Ph: {v.phoneNumber}</p>}
                                    {v.email && <p className="text-slate-500 text-[10px]">{v.email}</p>}
                                    {(v.onlineConsultationFee > 0) && <p className="text-slate-500 text-[10px]">Online Fee: ₹{v.onlineConsultationFee} (locked 1 yr)</p>}
                                    {(v.inPersonConsultationFee > 0) && <p className="text-slate-500 text-[10px]">In-Person Fee: ₹{v.inPersonConsultationFee} (locked 1 yr)</p>}
                                  </div>
                                </div>

                                {/* Documents submitted */}
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                                  <p className="text-[10px] font-bold text-amber-700 uppercase mb-1">Identity Documents Submitted with this Agreement</p>
                                  <div className="flex gap-4 flex-wrap">
                                    <span className="flex items-center gap-1 text-[11px] text-amber-800">
                                      {docFiles.idProof ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                                      <strong>ID Proof:</strong> {docFiles.idProof?.name || '—'}
                                    </span>
                                    <span className="flex items-center gap-1 text-[11px] text-amber-800">
                                      {docFiles.addressProof ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                                      <strong>Address Proof:</strong> {docFiles.addressProof?.name || '—'}
                                    </span>
                                  </div>
                                </div>

                                {/* Clauses */}
                                {[
                                  { n: '1', title: 'Scope of Services', body: `The Physician (which includes individual doctors, doctors with clinics, and doctors working in or owning hospitals) agrees to provide the following services:\n1.1 Types of Consultations: Virtual (online) and in-person consultations for corporate employees through the SmartHealth platform, covering: general health issues; chronic disease management; mental wellness support; preventive care; and emergency advisory (non-critical cases).\n1.2 Follow-up & Documentation: Conduct follow-up reviews and document patient progress. Two follow-up reviews shall be conducted free of charge.\n1.3 Availability: Be available during agreed consultation hours and ensure timely patient communication.\n1.4 Guidelines: Provide medical guidance aligned with applicable IMC regulations.\n1.5 Registration: Must be registered with the MCI or respective State Medical Council with a valid registration number.\n1.6 Information Disclosure: Provide all information related to qualifications, experience, and place of business with documentary evidence as requested.` },
                                  { n: '2', title: 'Ethics and Integrity', body: `2.1 Conduct consultations with the highest standards of ethics and integrity.\n2.2 Patient safety shall be of paramount importance during all consultations.\n2.3 Follow all applicable professional codes of conduct and medical ethics guidelines.\n2.4 Act ethically while referring patients to specialists or other healthcare providers.\n2.5 Prescribe tests and medications only when medically necessary and in line with established guidelines.\n2.6 Adhere to the Prevention of Sexual Harassment (POSH) Act, 2013 while consulting female patients.` },
                                  { n: '3', title: 'Technology and Connectivity', body: `3.1 The Physician shall be responsible for having up-to-date electronic devices and maintaining optimal internet connectivity for teleconsultations.\n3.2 In case of a call drop or connectivity issue, the Physician shall reconnect with the patient at the earliest and complete the consultation.\n3.3 The Company will implement a patient review system for quality monitoring and service improvement.` },
                                  { n: '4', title: 'Prescription Compliance', body: `All prescriptions shall strictly comply with prevailing guidelines including:\n4.1 Schedule H – Prescription drugs\n4.2 Schedule H1 – Restricted antibiotics\n4.3 Schedule X – Narcotic and psychotropic substances\n4.4 Schedule G – Caution drugs (to be taken under medical supervision)\n4.5 Schedule J – Diseases/conditions that cannot be claimed to be treated\n4.6 Schedule K – Exempted drugs from certain regulatory requirements\n4.7 Schedule M – Good Manufacturing Practices (GMP) for pharmaceuticals` },
                                  { n: '5', title: "Dos and Don'ts", body: `5.1 Dos:\n• Conduct consultations professionally.\n• Ensure timely follow-up with patients for continuity of care.\n• Provide accurate and complete information regarding health conditions.\n• Maintain patient confidentiality and comply with data protection laws.\n• Prescribe medications and tests only when medically necessary.\n• Reconnect promptly in case of a call drop or technical issue.\n• Keep patient records updated and accurate.\n5.2 Don'ts:\n• Do not disclose patient information to third parties without consent.\n• Do not prescribe under external influence or for non-medical reasons.\n• Do not refuse consultation without valid reasons.\n• Do not engage in unethical practices, including accepting commissions for referrals.\n• Do not mislead patients with false information or unproven treatments.\n• Do not over-prescribe medications or tests.\n• Do not engage in any behavior that could be construed as harassment or misconduct.` },
                                  { n: '6', title: 'Payment Terms', body: `The Physician's declared consultation fees are:\nOnline Consultation: ₹${v.onlineConsultationFee ?? '—'}\nIn-Person Consultation: ₹${v.inPersonConsultationFee ?? '—'}\nThese rates are locked for one year from the effective date of this MOU and shall not be revised without mutual written consent.\n\n6.1 The payment structure will vary depending on the Physician's specialization and experience and will be mutually agreed upon in writing.\n6.2 Payment is due within 30 days of receiving the invoice.\n6.3 Payments are subject to applicable taxes and deductions as per Indian tax laws.\n6.4 In case of any dispute, the Company shall have the right to review and withhold the disputed amount until resolution.\n6.5 No payment will be made in the following cases: no-show by the Physician; incomplete consultation; or poor patient feedback.` },
                                  { n: '7', title: 'Duration and Termination', body: `7.1 Term: This Agreement shall be effective for one year from the date of digital acceptance unless terminated earlier.\n7.2 Renewal: The Agreement may be renewed upon mutual agreement at the end of the term.\n7.3 Termination with Notice: The Company reserves the right to terminate at any time without assigning any reason.\n7.4 Immediate Termination: The Company may terminate immediately upon: breach of contract; professional misconduct or malpractice; regulatory action affecting the Physician's practice; violation of confidentiality obligations; or any act harming the reputation of the Company.` },
                                  { n: '8', title: 'Confidentiality and Data Protection', body: `8.1 The Physician shall maintain strict confidentiality regarding patient information, medical records, and Company data.\n8.2 The Physician shall not disclose any patient data or Company information to any third party without prior written consent, except as required by law.\n8.3 Patient data shall not be misused or shared for financial or pecuniary gains.\n8.4 The Physician shall not reach out to patients for any marketing or promotional purposes.` },
                                  { n: '9', title: 'Indemnity and Liability', body: `The Physician shall indemnify and hold harmless the Company from any claims, liabilities, or damages arising from:\n9.1 Professional misconduct or negligence.\n9.2 Violation of medical guidelines or statutory obligations.\n9.3 Data breaches due to the Physician's negligence.\n9.4 Incorrect medical advice or misdiagnosis.` },
                                  { n: '10', title: 'Arbitration and Governing Law', body: `All disputes arising out of or in connection with this Agreement shall be referred to arbitration under the Arbitration and Conciliation Act, 1996. The place of arbitration shall be Chennai, Tamil Nadu, and proceedings shall be conducted in English.\nThe above terms are agreeable to both parties and have been signed in the presence of the undersigned witnesses.` },
                                ].map(({ n, title, body }) => (
                                  <div key={n} className="space-y-1">
                                    <p className="font-bold text-slate-800">{n}. {title}</p>
                                    <div className="pl-3 space-y-0.5">
                                      {body.split('\n').map((line, i) => (
                                        <p key={i} className="text-slate-600 leading-relaxed">{line}</p>
                                      ))}
                                    </div>
                                  </div>
                                ))}

                                {/* Signature preview area */}
                                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase">For Mayden SmartHealth Pvt Ltd</p>
                                    <p className="text-[9px] text-slate-400">Dr. Shiva Kumar, CEO</p>
                                    <div className="h-8 border-b border-dashed border-slate-300" />
                                    <p className="text-[10px] text-slate-500">Authorised Signatory</p>
                                    <p className="text-[10px] text-slate-400">Date: {today}</p>
                                  </div>
                                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase">Practitioner</p>
                                    {!sigEmpty && canvasRef.current ? (
                                      <img src={canvasRef.current.toDataURL()} alt="signature" className="h-8 object-contain" />
                                    ) : (
                                      <div className="h-8 border-b border-dashed border-slate-300 flex items-end">
                                        <span className="text-[10px] text-slate-300 italic">Signature below</span>
                                      </div>
                                    )}
                                    <p className="text-[10px] text-slate-500">{doctorName}</p>
                                    <p className="text-[10px] text-slate-400">Date: {today}</p>
                                  </div>
                                </div>
                                {/* Witnesses */}
                                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 mt-2">
                                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Witnesses</p>
                                  <div className="grid grid-cols-2 gap-6">
                                    <div>
                                      <div className="border-b border-dashed border-slate-300 h-6 mb-1" />
                                      <p className="text-[10px] text-slate-400">1. ________________________</p>
                                    </div>
                                    <div>
                                      <div className="border-b border-dashed border-slate-300 h-6 mb-1" />
                                      <p className="text-[10px] text-slate-400">2. ________________________</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Declarations */}
                          <div className="space-y-3">
                            {[
                              { key: "accuracy", label: `I, ${doctorName}, confirm that all information and documents submitted are genuine, accurate, and complete.` },
                              { key: "terms",    label: "I have read, understood, and agree to the Memorandum of Understanding between Mayden SmartHealth Pvt Ltd and myself." },
                              { key: "ethics",   label: "I agree to abide by the platform's code of medical ethics and all applicable professional conduct guidelines." },
                            ].map(({ key, label }) => (
                              <label key={key} className="flex items-start gap-3 cursor-pointer group">
                                <div onClick={() => setAgreed(a => ({ ...a, [key]: !a[key as keyof typeof a] }))}
                                  className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${agreed[key as keyof typeof agreed] ? "bg-blue-600 border-blue-600" : "border-slate-300 group-hover:border-blue-400"}`}>
                                  {agreed[key as keyof typeof agreed] && <Check className="h-3 w-3 text-white" />}
                                </div>
                                <span className="text-sm text-slate-600 leading-relaxed">{label}</span>
                              </label>
                            ))}
                          </div>

                          <SignaturePad canvasRef={canvasRef} isEmpty={sigEmpty} setIsEmpty={setSigEmpty} />

                          <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-medium ${agreed.accuracy && agreed.terms && agreed.ethics && !sigEmpty ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-amber-50 border border-amber-200 text-amber-700"}`}>
                            {agreed.accuracy && agreed.terms && agreed.ethics && !sigEmpty
                              ? <><CheckCircle2 className="h-4 w-4 shrink-0" /> All requirements met. Ready to create your account.</>
                              : <><AlertCircle className="h-4 w-4 shrink-0" /> Please accept all declarations and provide your signature.</>
                            }
                          </div>
                        </div>
                      );
                    })()}

                  </motion.div>
                </AnimatePresence>
              </form>
            </Form>
          </div>

          {/* Footer nav */}
          <div className="px-8 py-5 border-t border-slate-100 flex items-center justify-between gap-3">
            <div>
              {step === 1 ? (
                <Link to="/doctor-login"
                  className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors">
                  <ArrowLeft className="h-4 w-4" /> Back to Login
                </Link>
              ) : (
                <button type="button" onClick={() => go(-1)}
                  className="flex items-center gap-2 h-11 px-5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-semibold hover:bg-slate-50 hover:border-slate-300 transition-all">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 hidden sm:block">Step {step} of 6</span>
              {step < 6 ? (
                <button type="button" onClick={() => go(1)}
                  className="flex items-center gap-2 h-11 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold hover:opacity-90 shadow-md shadow-blue-500/20 transition-all group">
                  Save &amp; Continue <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              ) : (
                <button type="button" onClick={handleSubmit} disabled={isSubmitting || docRegister.isPending}
                  className="flex items-center gap-2 h-11 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold hover:opacity-90 shadow-md shadow-emerald-500/20 disabled:opacity-60 transition-all">
                  {isSubmitting || docRegister.isPending
                    ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating account…</>
                    : <><CheckCircle2 className="h-4 w-4" /> Create Account</>
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default DocRegister;
