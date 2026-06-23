import { useState, useRef, useCallback, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload, X, Search, ZoomIn, ZoomOut, RotateCw, Maximize2, Minimize2,
  Trash2, ChevronLeft, ChevronRight, Download, Play, FileText,
  ScanLine, Activity, Waves, Heart, Radio, Zap, RefreshCw,
  Filter, Calendar, User, FlaskConical, Eye, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/utils/api";
import { useToast } from "@/hooks/use-toast";
import ImagingStudyPanel from "@/components/imaging/ImagingStudyPanel";

const DicomViewer = lazy(() => import("@/components/lab/DicomViewer"));

// ─── Types ───────────────────────────────────────────────────────────────────
interface ImagingStudy {
  id: number;
  patient_id: number | null;
  patient_name: string;
  study_type: string;
  study_date: string;
  title: string;
  notes: string;
  file_name: string;
  original_name: string;
  file_size: number;
  mime_type: string;
  fileUrl: string;
  isVideo: boolean;
  isImage: boolean;
  isPdf: boolean;
  created_at: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const STUDY_TYPES = ["All", "CT", "MRI", "USG", "Echo", "Cathlab", "X-Ray", "Other"] as const;

const STUDY_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  CT:      { icon: ScanLine,  color: "text-blue-400",    bg: "bg-blue-500/15" },
  MRI:     { icon: Activity,  color: "text-purple-400",  bg: "bg-purple-500/15" },
  USG:     { icon: Waves,     color: "text-cyan-400",    bg: "bg-cyan-500/15" },
  Echo:    { icon: Heart,     color: "text-red-400",     bg: "bg-red-500/15" },
  Cathlab: { icon: Radio,     color: "text-orange-400",  bg: "bg-orange-500/15" },
  "X-Ray": { icon: Zap,       color: "text-amber-400",   bg: "bg-amber-500/15" },
  Other:   { icon: FileText,  color: "text-slate-400",   bg: "bg-slate-500/15" },
};

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────
function UploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    patientName: "",
    studyType: "X-Ray",
    studyDate: new Date().toISOString().slice(0, 10),
    title: "",
    notes: "",
  });

  const handleFile = (f: File) => {
    setFile(f);
    setForm(p => ({ ...p, title: p.title || f.name }));
    if (f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast({ title: "No file selected", variant: "destructive" });
    if (!form.patientName.trim()) return toast({ title: "Patient name is required", variant: "destructive" });

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("patientName", form.patientName);
      fd.append("studyType", form.studyType);
      fd.append("studyDate", form.studyDate);
      fd.append("title", form.title);
      fd.append("notes", form.notes);
      await api.post("/doctors/imaging/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast({ title: "Imaging uploaded successfully" });
      onUploaded();
      onClose();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.response?.data?.message || err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <Upload className="w-4 h-4 text-teal-400" /> Upload Imaging Study
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <ScrollArea className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Drop zone */}
            <div
              className={cn(
                "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all",
                file ? "border-teal-500/60 bg-teal-500/5" : "border-slate-600 hover:border-slate-500 bg-slate-800/40"
              )}
              onClick={() => fileRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
            >
              {preview ? (
                <img src={preview} className="max-h-40 mx-auto rounded-lg object-contain" alt="preview" />
              ) : file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileText className="w-10 h-10 text-teal-400" />
                  <p className="text-sm text-white font-medium truncate max-w-full">{file.name}</p>
                  <p className="text-xs text-slate-400">{formatBytes(file.size)}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <Upload className="w-8 h-8" />
                  <p className="text-sm font-medium">Drop file here or click to browse</p>
                  <p className="text-xs">Images, Videos, DICOM, PDF up to 200 MB</p>
                </div>
              )}
              <input ref={fileRef} type="file" className="hidden"
                accept="image/*,video/*,application/pdf,.dcm"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>

            {/* Study type */}
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Study Type</label>
              <div className="flex flex-wrap gap-2">
                {STUDY_TYPES.filter(t => t !== "All").map(t => {
                  const m = STUDY_META[t] || STUDY_META.Other;
                  return (
                    <button key={t} type="button"
                      onClick={() => setForm(p => ({ ...p, studyType: t }))}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                        form.studyType === t
                          ? `${m.bg} ${m.color} border-current`
                          : "bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500"
                      )}>
                      <m.icon className="w-3.5 h-3.5" /> {t}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Patient Name *</label>
                <Input className="bg-slate-800 border-slate-700 text-white text-sm h-9"
                  placeholder="Patient name"
                  value={form.patientName}
                  onChange={e => setForm(p => ({ ...p, patientName: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Study Date</label>
                <Input type="date" className="bg-slate-800 border-slate-700 text-white text-sm h-9"
                  value={form.studyDate}
                  onChange={e => setForm(p => ({ ...p, studyDate: e.target.value }))} />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Title</label>
              <Input className="bg-slate-800 border-slate-700 text-white text-sm h-9"
                placeholder="e.g. Chest CT — Post-op day 1"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Notes</label>
              <textarea rows={2}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-teal-500"
                placeholder="Clinical notes, findings..."
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={onClose}
                className="flex-1 h-9 text-slate-400 border border-slate-700 hover:bg-slate-800">
                Cancel
              </Button>
              <Button type="submit" disabled={uploading || !file}
                className="flex-1 h-9 bg-teal-600 hover:bg-teal-700 text-white font-semibold disabled:opacity-50">
                {uploading ? "Uploading…" : "Upload"}
              </Button>
            </div>
          </form>
        </ScrollArea>
      </div>
    </div>
  );
}

// ─── Lightbox Viewer ──────────────────────────────────────────────────────────
function Lightbox({
  studies, index, onClose, onNavigate,
}: {
  studies: ImagingStudy[]; index: number; onClose: () => void; onNavigate: (i: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const study = studies[index];

  useEffect(() => { setZoom(1); setRotation(0); }, [index]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      if (e.key === "ArrowRight" && index < studies.length - 1) onNavigate(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, studies.length, onClose, onNavigate]);

  const meta = STUDY_META[study.study_type] || STUDY_META.Other;
  const token = localStorage.getItem("doctorToken") || "";
  const fileUrl = `${import.meta.env.VITE_API_URL || "/api"}${study.fileUrl.replace("/api", "")}`;

  return (
    <div className={cn("fixed inset-0 z-[9999] flex flex-col bg-black/95", fullscreen && "bg-black")}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("p-1.5 rounded-lg", meta.bg)}>
            <meta.icon className={cn("w-4 h-4", meta.color)} />
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm truncate">{study.title || study.original_name}</p>
            <p className="text-slate-400 text-xs">{study.patient_name} · {formatDate(study.study_date)}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-4">
          {study.isImage && (
            <>
              <button onClick={() => setZoom(z => Math.min(z + 0.25, 4))}
                className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors" title="Zoom in">
                <ZoomIn className="w-4 h-4" />
              </button>
              <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}
                className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors" title="Zoom out">
                <ZoomOut className="w-4 h-4" />
              </button>
              <button onClick={() => setRotation(r => (r + 90) % 360)}
                className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors" title="Rotate">
                <RotateCw className="w-4 h-4" />
              </button>
            </>
          )}
          <button onClick={() => setFullscreen(f => !f)}
            className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors" title="Fullscreen">
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <a href={`/api/doctors/imaging/file/${study.id}`}
            download={study.original_name}
            className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors" title="Download">
            <Download className="w-4 h-4" />
          </a>
          <button onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors ml-1" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Viewer area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {/* Nav arrows */}
        {index > 0 && (
          <button onClick={() => onNavigate(index - 1)}
            className="absolute left-3 z-10 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {index < studies.length - 1 && (
          <button onClick={() => onNavigate(index + 1)}
            className="absolute right-3 z-10 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white transition-colors">
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {study.isImage && (
          <img
            src={`/api/doctors/imaging/file/${study.id}`}
            alt={study.title || study.original_name}
            className="max-h-full max-w-full object-contain transition-transform duration-200 select-none"
            style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
            draggable={false}
          />
        )}
        {study.isVideo && (
          <video
            src={`/api/doctors/imaging/file/${study.id}`}
            controls
            autoPlay
            className="max-h-full max-w-full rounded-lg"
          />
        )}
        {study.isPdf && (
          <iframe
            src={`/api/doctors/imaging/file/${study.id}`}
            className="w-full h-full border-none"
            title={study.title || study.original_name}
          />
        )}
      </div>

      {/* Notes strip */}
      {study.notes && (
        <div className="shrink-0 px-5 py-3 bg-black/50 border-t border-white/10">
          <p className="text-slate-300 text-xs"><span className="text-slate-500 font-semibold mr-2">Notes:</span>{study.notes}</p>
        </div>
      )}

      {/* Thumbnail strip */}
      {studies.length > 1 && (
        <div className="shrink-0 flex gap-2 px-4 py-3 overflow-x-auto border-t border-white/10 bg-black/50">
          {studies.map((s, i) => {
            const m = STUDY_META[s.study_type] || STUDY_META.Other;
            return (
              <button key={s.id} onClick={() => onNavigate(i)}
                className={cn(
                  "shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all",
                  i === index ? "border-teal-400" : "border-white/20 opacity-60 hover:opacity-90"
                )}>
                {s.isImage
                  ? <img src={`/api/doctors/imaging/file/${s.id}`} alt="" className="w-full h-full object-cover" />
                  : (
                    <div className={cn("w-full h-full flex items-center justify-center", m.bg)}>
                      <m.icon className={cn("w-5 h-5", m.color)} />
                    </div>
                  )
                }
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Referred Studies Panel ───────────────────────────────────────────────────
interface RisStudy {
  id: number | string;
  patient_name: string;
  modality: string;
  study_date: string;
  study_description: string | null;
  status: string;
  report_status: string;
  report_text: string | null;
  file_name: string;
  mime_type: string;
  is_dicom: boolean;
  referring_doctor_name: string | null;
  lab_id: number;
}

const REPORT_STATUS_COLORS: Record<string, string> = {
  Final:    'bg-green-900/60 text-green-300',
  Draft:    'bg-amber-900/60 text-amber-300',
  Addendum: 'bg-blue-900/60 text-blue-300',
  Pending:  'bg-gray-800 text-gray-400',
};

function ReferredStudiesPanel() {
  const { toast } = useToast();
  const [studies, setStudies]         = useState<RisStudy[]>([]);
  const [loading, setLoading]         = useState(false);
  const [search, setSearch]           = useState('');
  const [viewer, setViewer]           = useState<RisStudy | null>(null);
  const doctorToken = localStorage.getItem('token') || '';

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search.trim()) params.patientName = search.trim();
      const { data } = await api.get('/doctors/ris-referred', { params });
      setStudies(data.studies || []);
    } catch (err: any) {
      toast({ title: 'Failed to load referred studies', description: err.response?.data?.message || err.message, variant: 'destructive' });
      setStudies([]);
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => { fetch(); }, []);

  useEffect(() => {
    const t = setTimeout(() => fetch(), 400);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line

  return (
    <div className="space-y-4">
      {/* Search + refresh */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <Input
            className="bg-slate-800/60 border-slate-700/60 text-white text-sm h-8 pl-8 rounded-xl"
            placeholder="Search patient name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button onClick={fetch} className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-400 hover:text-white transition-colors" title="Refresh">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-slate-800/60 animate-pulse" />
          ))}
        </div>
      ) : studies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="p-5 rounded-2xl bg-slate-800/60 mb-4">
            <FlaskConical className="w-10 h-10 text-slate-600" />
          </div>
          <p className="text-slate-300 font-semibold text-base">No referred studies</p>
          <p className="text-slate-500 text-sm mt-1">Studies linked to you by a lab will appear here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {studies.map(s => {
            const meta = STUDY_META[s.modality] || STUDY_META.Other;
            return (
              <div
                key={String(s.id)}
                className="rounded-2xl bg-slate-800/60 border border-slate-700/40 p-4 hover:border-teal-500/50 hover:shadow-lg hover:shadow-teal-500/10 transition-all cursor-pointer"
                onClick={() => setViewer(s)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className={cn('p-2 rounded-xl', meta.bg)}>
                    <meta.icon className={cn('w-5 h-5', meta.color)} />
                  </div>
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-md', REPORT_STATUS_COLORS[s.report_status] || REPORT_STATUS_COLORS.Pending)}>
                    {s.report_status}
                  </span>
                </div>
                <p className="text-white font-semibold text-sm mt-2 truncate">{s.patient_name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-md', meta.bg, meta.color)}>{s.modality}</span>
                  {s.study_description && <span className="text-slate-400 text-[11px] truncate">{s.study_description}</span>}
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center gap-1 text-slate-500 text-[10px]">
                    <Calendar className="w-3 h-3" /> {s.study_date ? new Date(s.study_date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric'}) : '—'}
                  </div>
                </div>
                {s.report_text && (
                  <p className="text-slate-400 text-[11px] mt-2 line-clamp-2 italic">{s.report_text}</p>
                )}
                <Button
                  size="sm"
                  className="mt-3 w-full h-7 text-[11px] bg-teal-700/40 hover:bg-teal-700/70 text-teal-300 border border-teal-700/40"
                  onClick={e => { e.stopPropagation(); setViewer(s); }}
                >
                  <Eye className="w-3 h-3 mr-1" /> View Study
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* DicomViewer modal */}
      {viewer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-5xl max-h-[90vh] overflow-auto">
            <Suspense fallback={<div className="flex items-center justify-center h-64 text-slate-400">Loading viewer…</div>}>
              <DicomViewer
                studyId={viewer.id}
                fileName={viewer.file_name}
                mimeType={viewer.mime_type}
                isDicom={viewer.is_dicom}
                patientName={viewer.patient_name}
                modality={viewer.modality}
                studyDate={viewer.study_date}
                tokenOverride={doctorToken}
                apiBaseOverride="/api/doctors/ris-referred"
                onClose={() => setViewer(null)}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DoctorImaging() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [view, setView]               = useState<'my-studies' | 'referred' | 'pacs'>('my-studies');
  const [studies, setStudies]         = useState<ImagingStudy[]>([]);
  const [loading, setLoading]         = useState(false);
  const [activeType, setActiveType]   = useState<string>("All");
  const [search, setSearch]           = useState("");
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [showUpload, setShowUpload]   = useState(false);
  const [deleting, setDeleting]       = useState<number | null>(null);

  const fetchStudies = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (activeType !== "All") params.studyType = activeType;
      if (search.trim()) params.patientName = search.trim();
      const { data } = await api.get("/doctors/imaging", { params });
      setStudies(data.studies || []);
    } catch (err: any) {
      toast({ title: "Failed to load imaging studies", description: err.response?.data?.message || err.message, variant: "destructive" });
      setStudies([]);
    } finally {
      setLoading(false);
    }
  }, [activeType, search, toast]);

  useEffect(() => { fetchStudies(); }, [fetchStudies]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => fetchStudies(), 400);
    return () => clearTimeout(t);
  }, [search]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this imaging study? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await api.delete(`/doctors/imaging/${id}`);
      setStudies(prev => prev.filter(s => s.id !== id));
      toast({ title: "Study deleted" });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
              <ScanLine className="w-6 h-6 text-teal-400" /> Medical Imaging
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">CT · MRI · USG · Echo · Cathlab · X-Ray</p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex gap-1 p-1 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <button
                onClick={() => setView('my-studies')}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', view === 'my-studies' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white')}
              >
                <ScanLine className="w-3.5 h-3.5" /> My Studies
              </button>
              <button
                onClick={() => setView('referred')}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', view === 'referred' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white')}
              >
                <FlaskConical className="w-3.5 h-3.5" /> Lab Referred
              </button>
              <button
                onClick={() => setView('pacs')}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', view === 'pacs' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white')}
              >
                <Activity className="w-3.5 h-3.5" /> PACS / OHIF
              </button>
            </div>
            {view === 'my-studies' && (
              <Button onClick={() => setShowUpload(true)}
                className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold h-9 px-4 rounded-xl">
                <Upload className="w-4 h-4" /> Upload Study
              </Button>
            )}
          </div>
        </div>

        {/* Referred studies panel */}
        {view === 'referred' && <ReferredStudiesPanel />}

        {/* HyperGrid PACS + OHIF */}
        {view === 'pacs' && (
          <div className="min-h-[70vh] rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
            <ImagingStudyPanel />
          </div>
        )}

        {/* Filters — only shown for My Studies */}
        {view === 'my-studies' && (<>
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Study type tabs */}
          <div className="flex gap-1.5 flex-wrap">
            {STUDY_TYPES.map(t => {
              const m = t !== "All" ? (STUDY_META[t] || STUDY_META.Other) : null;
              return (
                <button key={t} onClick={() => setActiveType(t)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all",
                    activeType === t
                      ? m ? `${m.bg} ${m.color} border-current` : "bg-teal-500/15 text-teal-400 border-teal-400/50"
                      : "bg-slate-800/60 text-slate-400 border-slate-700/60 hover:border-slate-500"
                  )}>
                  {m && <m.icon className="w-3.5 h-3.5" />}
                  {t}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <Input
              className="bg-slate-800/60 border-slate-700/60 text-white text-sm h-8 pl-8 rounded-xl"
              placeholder="Search patient name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <button onClick={fetchStudies} className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors" title="Refresh">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-2xl bg-slate-800/60 animate-pulse" />
            ))}
          </div>
        ) : studies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="p-5 rounded-2xl bg-slate-800/60 mb-4">
              <ScanLine className="w-10 h-10 text-slate-600" />
            </div>
            <p className="text-slate-300 font-semibold text-base">No imaging studies found</p>
            <p className="text-slate-500 text-sm mt-1">Upload CT, MRI, USG, Echo, Cathlab, or X-Ray files</p>
            <Button onClick={() => setShowUpload(true)} className="mt-4 bg-teal-600 hover:bg-teal-700 text-white h-9 px-4 rounded-xl text-sm font-semibold">
              <Upload className="w-4 h-4 mr-2" /> Upload First Study
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {studies.map((study, idx) => {
              const meta = STUDY_META[study.study_type] || STUDY_META.Other;
              return (
                <div
                  key={study.id}
                  onClick={() => setLightboxIdx(idx)}
                  className="group relative rounded-2xl bg-slate-800/60 border border-slate-700/40 overflow-hidden cursor-pointer hover:border-teal-500/50 hover:shadow-lg hover:shadow-teal-500/10 active:scale-[0.98] transition-all duration-200"
                >
                  {/* Thumbnail */}
                  <div className="aspect-square relative">
                    {study.isImage ? (
                      <img
                        src={`/api/doctors/imaging/file/${study.id}`}
                        alt={study.title || study.original_name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : study.isVideo ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/80">
                        <Play className="w-10 h-10 text-white/70" />
                        <span className="text-xs text-white/50 mt-1">Video</span>
                      </div>
                    ) : (
                      <div className={cn("w-full h-full flex flex-col items-center justify-center", meta.bg)}>
                        <meta.icon className={cn("w-10 h-10", meta.color)} />
                        <span className={cn("text-xs font-semibold mt-1", meta.color)}>{study.study_type}</span>
                      </div>
                    )}

                    {/* Study type badge */}
                    <div className="absolute top-2 left-2">
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md", meta.bg, meta.color)}>
                        {study.study_type}
                      </span>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={e => handleDelete(study.id, e)}
                      disabled={deleting === study.id}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Info */}
                  <div className="p-2.5">
                    <p className="text-white text-xs font-semibold truncate">{study.title || study.original_name}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <User className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="text-slate-400 text-[10px] truncate">{study.patient_name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="text-slate-500 text-[10px]">{formatDate(study.study_date)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </>)}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)} onUploaded={fetchStudies} />
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <Lightbox
          studies={studies}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onNavigate={setLightboxIdx}
        />
      )}
    </MainLayout>
  );
}
