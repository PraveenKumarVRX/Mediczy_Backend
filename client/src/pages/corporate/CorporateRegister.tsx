import { useState, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import api from "@/utils/api";
import {
  Building2, Mail, Lock, Phone, MapPin, FileText, Upload, X, CheckCircle2,
  Eye, EyeOff, ChevronRight, AlertCircle, Clock, Shield, Users,
} from "lucide-react";

const INDUSTRIES = ["Healthcare", "Information Technology", "Manufacturing", "Banking & Finance", "Retail & FMCG", "Education", "Logistics & Transport", "Consulting", "Pharmaceutical", "Other"];
const REQUIRED_DOCS = [
  { id: "incorporation", label: "Certificate of Incorporation / MOA", hint: "MCA-issued certificate or Memorandum of Association" },
  { id: "gst_pan", label: "GST Certificate or PAN Card", hint: "Valid GSTIN certificate or company PAN" },
  { id: "director_id", label: "Director / Authorized Signatory ID", hint: "Aadhaar or passport of the authorized contact person" },
];

interface UploadedFile { file: File; docType: string; }
const formatBytes = (b: number) => b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;

export default function CorporateRegister() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [form, setForm] = useState({
    companyName: "", email: "", password: "", confirmPassword: "",
    phoneNumber: "", industry: "Healthcare", employeeCount: "", city: "", state: "", gstNumber: ""
  });

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));
  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const allowed = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
    const newFiles: UploadedFile[] = Array.from(files).filter(f => allowed.includes(f.type) && f.size <= 10 * 1024 * 1024).map(f => ({ file: f, docType: REQUIRED_DOCS[uploadedFiles.length]?.id || "other" }));
    setUploadedFiles(prev => [...prev, ...newFiles].slice(0, 5));
  }, [uploadedFiles.length]);
  const removeFile = (i: number) => setUploadedFiles(f => f.filter((_, j) => j !== i));

  const validateStep = () => {
    setError("");
    if (step === 0) {
      if (!form.companyName.trim()) return setError("Company name is required"), false;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError("Enter a valid email"), false;
      if (form.password.length < 8) return setError("Password must be at least 8 characters"), false;
      if (form.password !== form.confirmPassword) return setError("Passwords do not match"), false;
    }
    if (step === 1) {
      if (!form.phoneNumber.trim()) return setError("Phone number is required"), false;
      if (!form.city.trim()) return setError("City is required"), false;
    }
    return true;
  };

  const handleSubmit = async () => {
    setLoading(true); setError("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      uploadedFiles.forEach(u => fd.append("documents", u.file));
      await api.post("/corporate/register", fd, { headers: { "Content-Type": "multipart/form-data" }, skipAuth: true } as any);
      setStep(3);
    } catch (e: any) {
      setError(e.response?.data?.message || "Registration failed. Please try again.");
    } finally { setLoading(false); }
  };

  const steps = ["Account", "Details", "Documents"];

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-50 via-violet-50/30 to-purple-50/20">
      <div className="hidden lg:flex w-[420px] shrink-0 flex-col bg-gradient-to-br from-violet-600 via-violet-700 to-purple-800 p-12 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none"><div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/10 blur-3xl" /><div className="absolute bottom-10 -left-10 w-56 h-56 rounded-full bg-violet-400/20 blur-2xl" /></div>
        <div className="relative z-10 flex-1 flex flex-col">
          <div className="flex items-center gap-3 mb-16"><div className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center"><Building2 className="w-6 h-6 text-white" /></div><span className="text-white font-extrabold text-xl">Mediczy</span></div>
          <div className="flex-1">
            <h1 className="text-4xl font-extrabold text-white leading-tight mb-4">Corporate<br />Health Benefits</h1>
            <p className="text-violet-100 text-lg leading-relaxed mb-12">Provide your employees with world-class healthcare benefits and wellness programs.</p>
            <div className="space-y-5">
              {[{ title: "Employee Health Dashboard", desc: "Track team health metrics and benefit usage" }, { title: "Group Insurance Management", desc: "Administer health policies at scale" }, { title: "Corporate OPD Plans", desc: "Unlimited doctor consultations for your team" }, { title: "Wellness Programs", desc: "Mental health, fitness, and preventive care" }].map((f, i) => (
                <div key={i} className="flex items-start gap-4"><div className="w-8 h-8 bg-white/15 rounded-xl flex items-center justify-center shrink-0"><CheckCircle2 className="w-4 h-4 text-violet-200" /></div><div><p className="text-white font-semibold text-sm">{f.title}</p><p className="text-violet-200/80 text-xs mt-0.5">{f.desc}</p></div></div>
              ))}
            </div>
          </div>
          <div className="mt-12 p-4 bg-white/10 rounded-2xl border border-white/15"><Shield className="w-4 h-4 text-violet-200 mb-2" /><p className="text-white text-xs font-bold mb-1">Enterprise Verified</p><p className="text-violet-200/80 text-xs">All corporate partners are verified before activation.</p></div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 overflow-y-auto">
        <div className="w-full max-w-[500px]">
          {step < 3 && (
            <div className="flex items-center justify-center gap-2 mb-10">
              {steps.map((label, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold transition-all ${i < step ? "bg-violet-600 text-white" : i === step ? "bg-violet-600 text-white ring-4 ring-violet-100" : "bg-slate-100 text-slate-400"}`}>{i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}</div>
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${i === step ? "text-violet-600" : "text-slate-400"}`}>{label}</span>
                  </div>
                  {i < steps.length - 1 && <div className={`w-12 h-0.5 mb-4 rounded-full ${i < step ? "bg-violet-600" : "bg-slate-200"}`} />}
                </div>
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div key="s0" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
                <h2 className="text-2xl font-extrabold text-slate-800 mb-1.5">Create your account</h2>
                <p className="text-slate-500 text-sm mb-8">Register your company on Mediczy</p>
                {error && <Alert variant="destructive" className="mb-5 rounded-xl"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
                <div className="space-y-4">
                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Company Name *</label><div className="relative"><Building2 className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" /><Input value={form.companyName} onChange={e => set("companyName", e.target.value)} placeholder="Acme Corporation Pvt. Ltd." className="pl-10 h-11 rounded-xl border-slate-200 focus:border-violet-500" /></div></div>
                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Work Email Address *</label><div className="relative"><Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" /><Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="hr@yourcompany.com" className="pl-10 h-11 rounded-xl border-slate-200 focus:border-violet-500" /></div></div>
                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Password *</label><div className="relative"><Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" /><Input type={showPass ? "text" : "password"} value={form.password} onChange={e => set("password", e.target.value)} placeholder="Minimum 8 characters" className="pl-10 pr-11 h-11 rounded-xl border-slate-200 focus:border-violet-500" /><button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3.5 top-3 text-slate-400">{showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div>
                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Confirm Password *</label><div className="relative"><Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" /><Input type="password" value={form.confirmPassword} onChange={e => set("confirmPassword", e.target.value)} placeholder="Re-enter password" className="pl-10 h-11 rounded-xl border-slate-200 focus:border-violet-500" /></div></div>
                </div>
                <Button onClick={() => validateStep() && setStep(1)} className="w-full h-12 mt-8 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold">Continue <ChevronRight className="w-4 h-4 ml-1" /></Button>
                <p className="text-center text-sm text-slate-500 mt-5">Already registered? <Link to="/corporate/login" className="text-violet-600 font-semibold hover:underline">Sign in</Link></p>
              </motion.div>
            )}
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
                <h2 className="text-2xl font-extrabold text-slate-800 mb-1.5">Company details</h2>
                <p className="text-slate-500 text-sm mb-8">Help us understand your organization</p>
                {error && <Alert variant="destructive" className="mb-5 rounded-xl"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
                <div className="space-y-4">
                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Contact Phone *</label><div className="relative"><Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" /><Input value={form.phoneNumber} onChange={e => set("phoneNumber", e.target.value)} placeholder="+91 98765 43210" className="pl-10 h-11 rounded-xl border-slate-200 focus:border-violet-500" /></div></div>
                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Industry *</label><select value={form.industry} onChange={e => set("industry", e.target.value)} className="w-full h-11 rounded-xl border border-slate-200 px-3.5 text-sm focus:outline-none focus:border-violet-500 bg-white">{INDUSTRIES.map(t => <option key={t}>{t}</option>)}</select></div>
                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Number of Employees</label><div className="relative"><Users className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" /><Input type="number" min="1" value={form.employeeCount} onChange={e => set("employeeCount", e.target.value)} placeholder="e.g. 250" className="pl-10 h-11 rounded-xl border-slate-200 focus:border-violet-500" /></div></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">City *</label><div className="relative"><MapPin className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" /><Input value={form.city} onChange={e => set("city", e.target.value)} placeholder="Mumbai" className="pl-9 h-11 rounded-xl border-slate-200 focus:border-violet-500" /></div></div>
                    <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">State</label><Input value={form.state} onChange={e => set("state", e.target.value)} placeholder="Maharashtra" className="h-11 rounded-xl border-slate-200 focus:border-violet-500" /></div>
                  </div>
                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">GST Number <span className="text-slate-400 font-normal">(optional)</span></label><Input value={form.gstNumber} onChange={e => set("gstNumber", e.target.value)} placeholder="22AAAAA0000A1Z5" className="h-11 rounded-xl border-slate-200 focus:border-violet-500" /></div>
                </div>
                <div className="flex gap-3 mt-8"><Button variant="outline" onClick={() => setStep(0)} className="flex-1 h-12 rounded-xl">Back</Button><Button onClick={() => validateStep() && setStep(2)} className="flex-1 h-12 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold">Continue <ChevronRight className="w-4 h-4 ml-1" /></Button></div>
              </motion.div>
            )}
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
                <h2 className="text-2xl font-extrabold text-slate-800 mb-1.5">Upload documents</h2>
                <p className="text-slate-500 text-sm mb-6">Verify your company's identity</p>
                {error && <Alert variant="destructive" className="mb-5 rounded-xl"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
                <div className="grid gap-2 mb-5">{REQUIRED_DOCS.map((d, i) => (<div key={d.id} className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${uploadedFiles[i] ? "bg-violet-50 border-violet-200" : "bg-slate-50 border-slate-100"}`}>{uploadedFiles[i] ? <CheckCircle2 className="w-4 h-4 text-violet-500 mt-0.5 shrink-0" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-300 mt-0.5 shrink-0" />}<div><p className={`font-semibold ${uploadedFiles[i] ? "text-violet-700" : "text-slate-600"}`}>{d.label}</p><p className="text-xs text-slate-400 mt-0.5">{d.hint}</p></div></div>))}</div>
                <div onDragOver={e => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={e => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); }} onClick={() => fileInputRef.current?.click()} className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${isDragging ? "border-violet-500 bg-violet-50" : "border-slate-200 hover:border-violet-300 hover:bg-violet-50/50"}`}>
                  <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragging ? "text-violet-500" : "text-slate-300"}`} /><p className="font-semibold text-slate-600 text-sm">Drop files here or <span className="text-violet-600">click to browse</span></p><p className="text-xs text-slate-400 mt-1.5">PDF, JPG, PNG · Max 10 MB · Up to 5 files</p>
                  <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={e => addFiles(e.target.files)} />
                </div>
                {uploadedFiles.length > 0 && <div className="mt-4 space-y-2">{uploadedFiles.map((u, i) => <div key={i} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl shadow-sm"><div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-violet-600" /></div><div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-700 truncate">{u.file.name}</p><p className="text-xs text-slate-400">{formatBytes(u.file.size)}</p></div><button onClick={() => removeFile(i)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button></div>)}</div>}
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mt-5"><strong>Note:</strong> Documents may also be emailed to <span className="font-semibold">support@mediczy.com</span>.</p>
                <div className="flex gap-3 mt-6"><Button variant="outline" onClick={() => setStep(1)} className="flex-1 h-12 rounded-xl">Back</Button><Button onClick={handleSubmit} disabled={loading} className="flex-1 h-12 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold">{loading ? "Submitting…" : "Submit Application"}</Button></div>
              </motion.div>
            )}
            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} className="text-center px-4 py-8">
                <div className="w-24 h-24 bg-gradient-to-br from-violet-500 to-purple-600 rounded-full flex items-center justify-center shadow-xl shadow-violet-500/30 mx-auto mb-8"><CheckCircle2 className="w-12 h-12 text-white" /></div>
                <h2 className="text-3xl font-extrabold text-slate-800 mb-3">Application Submitted!</h2>
                <p className="text-slate-500 text-base mb-8">Your corporate account is pending verification.</p>
                <div className="p-6 bg-gradient-to-br from-violet-50 to-purple-50 rounded-2xl border border-violet-100 text-left space-y-3">
                  {[{ icon: Clock, text: "Review takes 24–48 hours" }, { icon: Mail, text: "Login credentials sent to your work email upon approval" }, { icon: Shield, text: "All submitted data is treated with enterprise-grade security" }].map((item, i) => <div key={i} className="flex items-center gap-3"><div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center shrink-0"><item.icon className="w-4 h-4 text-violet-600" /></div><p className="text-sm text-slate-600">{item.text}</p></div>)}
                </div>
                <Button onClick={() => navigate("/corporate/login")} className="w-full h-12 mt-8 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold">Go to Login Page</Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
