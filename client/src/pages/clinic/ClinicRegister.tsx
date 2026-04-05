import { useState, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import api from "@/utils/api";
import {
  Building2, Mail, Lock, Phone, MapPin, FileText, Upload, X, CheckCircle2,
  Eye, EyeOff, ChevronRight, AlertCircle, Stethoscope, Users, Pill, BookOpen, Clock, Shield,
} from "lucide-react";

const CLINIC_TYPES = ["General Practice", "Specialty Clinic", "Polyclinic", "Day Care", "Dental Clinic", "Eye Clinic", "Skin Clinic", "Orthopaedic"];
const REQUIRED_DOCS = [
  { id: "reg_cert", label: "Registration Certificate", hint: "Clinic/hospital registration from state authority" },
  { id: "owner_id", label: "Owner / Director ID Proof", hint: "Aadhar, Passport, or Driving License" },
  { id: "address_proof", label: "Address Proof", hint: "Utility bill, lease agreement, or property document" },
];

interface UploadedFile { file: File; docType: string; preview?: string; }

const formatBytes = (b: number) => b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;

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
  const [form, setForm] = useState({
    name: "", email: "", password: "", confirmPassword: "",
    phone: "", clinicType: "General Practice", city: "", state: "", address: "", registrationNumber: ""
  });

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const allowed = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
    const newFiles: UploadedFile[] = Array.from(files)
      .filter(f => allowed.includes(f.type) && f.size <= 10 * 1024 * 1024)
      .map(f => ({ file: f, docType: REQUIRED_DOCS[uploadedFiles.length]?.id || "other" }));
    setUploadedFiles(prev => [...prev, ...newFiles].slice(0, 5));
  }, [uploadedFiles.length]);

  const removeFile = (idx: number) => setUploadedFiles(f => f.filter((_, i) => i !== idx));

  const validateStep = () => {
    setError("");
    if (step === 0) {
      if (!form.name.trim()) return setError("Clinic name is required"), false;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError("Enter a valid email address"), false;
      if (form.password.length < 8) return setError("Password must be at least 8 characters"), false;
      if (form.password !== form.confirmPassword) return setError("Passwords do not match"), false;
    }
    if (step === 1) {
      if (!form.phone.trim()) return setError("Phone number is required"), false;
      if (!form.city.trim()) return setError("City is required"), false;
    }
    return true;
  };

  const handleNext = () => { if (validateStep()) setStep(s => s + 1); };

  const handleSubmit = async () => {
    setLoading(true); setError("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      uploadedFiles.forEach((u, i) => { fd.append("documents", u.file); fd.append(`docType_${i}`, u.docType); });
      await api.post("/clinic/register", fd, { headers: { "Content-Type": "multipart/form-data" }, skipAuth: true } as any);
      setStep(3);
    } catch (e: any) {
      setError(e.response?.data?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const steps = ["Account", "Details", "Documents"];

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-50 via-teal-50/30 to-cyan-50/20">
      {/* Left panel */}
      <div className="hidden lg:flex w-[420px] shrink-0 flex-col bg-gradient-to-br from-teal-600 via-teal-700 to-cyan-800 p-12 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute bottom-10 -left-10 w-56 h-56 rounded-full bg-cyan-400/20 blur-2xl" />
          <div className="absolute top-1/2 right-0 w-40 h-40 rounded-full bg-teal-300/10 blur-2xl" />
        </div>
        <div className="relative z-10 flex-1 flex flex-col">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <span className="text-white font-extrabold text-xl tracking-tight">Mediczy</span>
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-extrabold text-white leading-tight mb-4">Register Your<br />Clinic</h1>
            <p className="text-teal-100 text-lg leading-relaxed mb-12">Join India's fastest-growing digital health network and transform your practice.</p>
            <div className="space-y-5">
              {[
                { icon: Stethoscope, title: "Smart Appointment System", desc: "Reduce no-shows with automated reminders" },
                { icon: FileText, title: "Digital EMR & Prescriptions", desc: "Paperless, ABDM-compliant records" },
                { icon: Users, title: "Multi-Doctor Practice", desc: "Manage entire clinic staff effortlessly" },
                { icon: BookOpen, title: "Billing & Analytics", desc: "Real-time revenue & patient insights" },
              ].map((f, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center shrink-0">
                    <f.icon className="w-5 h-5 text-teal-200" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">{f.title}</p>
                    <p className="text-teal-200/80 text-xs mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-12 p-4 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/15">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-teal-200" />
              <span className="text-white text-xs font-bold">ABDM & HIPAA Compliant</span>
            </div>
            <p className="text-teal-200/80 text-xs">Your data is encrypted, secured, and fully compliant with Indian healthcare regulations.</p>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 overflow-y-auto">
        <div className="w-full max-w-[500px]">
          {/* Step indicator */}
          {step < 3 && (
            <div className="flex items-center justify-center gap-2 mb-10">
              {steps.map((label, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold transition-all duration-300 ${
                      i < step ? "bg-teal-600 text-white" : i === step ? "bg-teal-600 text-white ring-4 ring-teal-100" : "bg-slate-100 text-slate-400"
                    }`}>
                      {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${i === step ? "text-teal-600" : "text-slate-400"}`}>{label}</span>
                  </div>
                  {i < steps.length - 1 && <div className={`w-12 h-0.5 mb-4 rounded-full transition-all ${i < step ? "bg-teal-600" : "bg-slate-200"}`} />}
                </div>
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div key="s0" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
                <h2 className="text-2xl font-extrabold text-slate-800 mb-1.5">Create your account</h2>
                <p className="text-slate-500 text-sm mb-8">Set up your clinic's login credentials</p>
                {error && <Alert variant="destructive" className="mb-5 rounded-xl"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Clinic Name *</label>
                    <div className="relative"><Building2 className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" /><Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Apollo Clinic, Koramangala" className="pl-10 h-11 rounded-xl border-slate-200 focus:border-teal-500" /></div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email Address *</label>
                    <div className="relative"><Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" /><Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="clinic@example.com" className="pl-10 h-11 rounded-xl border-slate-200 focus:border-teal-500" /></div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password *</label>
                    <div className="relative"><Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" /><Input type={showPass ? "text" : "password"} value={form.password} onChange={e => set("password", e.target.value)} placeholder="Minimum 8 characters" className="pl-10 pr-11 h-11 rounded-xl border-slate-200 focus:border-teal-500" /><button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600">{showPass ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}</button></div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Confirm Password *</label>
                    <div className="relative"><Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" /><Input type={showConfirm ? "text" : "password"} value={form.confirmPassword} onChange={e => set("confirmPassword", e.target.value)} placeholder="Re-enter your password" className="pl-10 pr-11 h-11 rounded-xl border-slate-200 focus:border-teal-500" /><button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600">{showConfirm ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}</button></div>
                  </div>
                </div>
                <Button onClick={handleNext} className="w-full h-12 mt-8 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-base">Continue <ChevronRight className="w-4 h-4 ml-1" /></Button>
                <p className="text-center text-sm text-slate-500 mt-5">Already registered? <Link to="/clinic/login" className="text-teal-600 font-semibold hover:underline">Sign in</Link></p>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
                <h2 className="text-2xl font-extrabold text-slate-800 mb-1.5">Clinic details</h2>
                <p className="text-slate-500 text-sm mb-8">Tell us about your practice</p>
                {error && <Alert variant="destructive" className="mb-5 rounded-xl"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Phone Number *</label>
                    <div className="relative"><Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" /><Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+91 98765 43210" className="pl-10 h-11 rounded-xl border-slate-200 focus:border-teal-500" /></div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Clinic Type *</label>
                    <select value={form.clinicType} onChange={e => set("clinicType", e.target.value)} className="w-full h-11 rounded-xl border border-slate-200 px-3.5 text-sm text-slate-700 focus:outline-none focus:border-teal-500 bg-white">
                      {CLINIC_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">City *</label>
                      <div className="relative"><MapPin className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" /><Input value={form.city} onChange={e => set("city", e.target.value)} placeholder="Bengaluru" className="pl-9 h-11 rounded-xl border-slate-200 focus:border-teal-500" /></div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">State</label>
                      <Input value={form.state} onChange={e => set("state", e.target.value)} placeholder="Karnataka" className="h-11 rounded-xl border-slate-200 focus:border-teal-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Address</label>
                    <Input value={form.address} onChange={e => set("address", e.target.value)} placeholder="Street, Area, Landmark" className="h-11 rounded-xl border-slate-200 focus:border-teal-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Registration Number <span className="text-slate-400 font-normal">(optional)</span></label>
                    <Input value={form.registrationNumber} onChange={e => set("registrationNumber", e.target.value)} placeholder="MCI/State registration number" className="h-11 rounded-xl border-slate-200 focus:border-teal-500" />
                  </div>
                </div>
                <div className="flex gap-3 mt-8">
                  <Button variant="outline" onClick={() => setStep(0)} className="flex-1 h-12 rounded-xl border-slate-200 font-semibold">Back</Button>
                  <Button onClick={handleNext} className="flex-1 h-12 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold">Continue <ChevronRight className="w-4 h-4 ml-1" /></Button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
                <h2 className="text-2xl font-extrabold text-slate-800 mb-1.5">Upload documents</h2>
                <p className="text-slate-500 text-sm mb-6">Help us verify your clinic. Documents are securely stored and reviewed only by our team.</p>
                {error && <Alert variant="destructive" className="mb-5 rounded-xl"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

                {/* Required docs list */}
                <div className="grid gap-2 mb-5">
                  {REQUIRED_DOCS.map((d, i) => (
                    <div key={d.id} className={`flex items-start gap-3 p-3 rounded-xl border text-sm transition-all ${uploadedFiles[i] ? "bg-teal-50 border-teal-200" : "bg-slate-50 border-slate-100"}`}>
                      {uploadedFiles[i] ? <CheckCircle2 className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-300 mt-0.5 shrink-0" />}
                      <div>
                        <p className={`font-semibold ${uploadedFiles[i] ? "text-teal-700" : "text-slate-600"}`}>{d.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{d.hint}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${isDragging ? "border-teal-500 bg-teal-50 scale-[1.02]" : "border-slate-200 hover:border-teal-300 hover:bg-teal-50/50"}`}
                >
                  <Upload className={`w-10 h-10 mx-auto mb-3 transition-colors ${isDragging ? "text-teal-500" : "text-slate-300"}`} />
                  <p className="font-semibold text-slate-600 text-sm">Drop files here or <span className="text-teal-600">click to browse</span></p>
                  <p className="text-xs text-slate-400 mt-1.5">PDF, JPG, PNG · Max 10 MB per file · Up to 5 files</p>
                  <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={e => addFiles(e.target.files)} />
                </div>

                {/* Uploaded files */}
                {uploadedFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {uploadedFiles.map((u, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                        <div className="w-9 h-9 bg-teal-100 rounded-lg flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-teal-600" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-700 truncate">{u.file.name}</p>
                          <p className="text-xs text-slate-400">{formatBytes(u.file.size)}</p>
                        </div>
                        <button onClick={() => removeFile(i)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mt-5">
                  <strong>Note:</strong> Documents help speed up verification. You can also submit them later via email to <span className="font-semibold">support@mediczy.com</span>.
                </p>

                <div className="flex gap-3 mt-6">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1 h-12 rounded-xl border-slate-200 font-semibold">Back</Button>
                  <Button onClick={handleSubmit} disabled={loading} className="flex-1 h-12 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold">
                    {loading ? "Submitting…" : "Submit Application"}
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: "easeOut" }} className="text-center px-4 py-8">
                <div className="relative inline-flex mb-8">
                  <div className="w-24 h-24 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-full flex items-center justify-center shadow-xl shadow-teal-500/30">
                    <CheckCircle2 className="w-12 h-12 text-white" />
                  </div>
                  <motion.div
                    initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                    className="absolute -top-1 -right-1 w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg"
                  >
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </motion.div>
                </div>
                <h2 className="text-3xl font-extrabold text-slate-800 mb-3">Application Submitted!</h2>
                <p className="text-slate-500 text-base leading-relaxed mb-2">Your clinic registration is now under review by our team.</p>
                <div className="my-8 p-6 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-2xl border border-teal-100 text-left space-y-3">
                  {[
                    { icon: Clock, text: "Review typically takes 24–48 hours" },
                    { icon: Mail, text: "You'll receive an email with your login credentials once approved" },
                    { icon: Shield, text: "Your documents are reviewed securely and confidentially" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center shrink-0"><item.icon className="w-4 h-4 text-teal-600" /></div>
                      <p className="text-sm text-slate-600">{item.text}</p>
                    </div>
                  ))}
                </div>
                <Button onClick={() => navigate("/clinic/login")} className="w-full h-12 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-base">
                  Go to Login Page
                </Button>
                <p className="text-xs text-slate-400 mt-4">Questions? Email <a href="mailto:support@mediczy.com" className="text-teal-600 font-semibold">support@mediczy.com</a></p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
