import { useState, useEffect, useCallback, useRef } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import api from "@/utils/api";
import {
  Building2, FlaskConical, Pill, Heart, Briefcase, Stethoscope,
  CheckCircle2, XCircle, Clock, FileText, Mail,
  Phone, MapPin, RefreshCw, AlertCircle, ExternalLink, Download,
} from "lucide-react";

const ENTITY_META: Record<string, { label: string; color: string; bg: string; icon: React.ComponentType<any> }> = {
  clinic:    { label: "Clinic",    color: "text-teal-700",   bg: "bg-teal-50 border-teal-200",   icon: Building2 },
  lab:       { label: "Lab",       color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",   icon: FlaskConical },
  pharmacy:  { label: "Pharmacy",  color: "text-emerald-700",bg: "bg-emerald-50 border-emerald-200", icon: Pill },
  homecare:  { label: "Homecare",  color: "text-pink-700",   bg: "bg-pink-50 border-pink-200",   icon: Heart },
  corporate: { label: "Corporate", color: "text-violet-700", bg: "bg-violet-50 border-violet-200", icon: Briefcase },
  doctor:    { label: "Doctor",    color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200", icon: Stethoscope },
};

interface DocFile {
  name: string;
  type: string;
  data: string; // base64 data URL
}

interface Registration {
  id: string | number;
  entityType: keyof typeof ENTITY_META;
  name: string;
  email: string;
  phone?: string;
  city?: string;
  state?: string;
  registrationDocs?: number;
  submittedAt?: string;
  specialization?: string;
  experience?: number;
  metadata?: Record<string, unknown>;
  documents?: Record<string, DocFile>;
}

const DOC_LABELS: { key: string; label: string }[] = [
  { key: "idProof",           label: "ID Proof" },
  { key: "addressProof",      label: "Address Proof" },
  { key: "medicalDegree",     label: "Medical Degree" },
  { key: "councilCertificate",label: "Council Registration Certificate" },
];

export default function PendingRegistrations() {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [selected, setSelected] = useState<Registration | null>(null);
  const [modal, setModal] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [docsView, setDocsView] = useState<Registration | null>(null);

  // ── Admin MOU countersignature pad ──────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [adminSignData, setAdminSignData] = useState<string | null>(null);
  const [adminSignName, setAdminSignName] = useState("");

  const getSigPos = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
  ) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };
  const sigStartDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return;
    e.preventDefault(); setIsDrawing(true); lastPos.current = getSigPos(e, canvas);
  };
  const sigDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current; if (!canvas || !lastPos.current) return;
    e.preventDefault();
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const pos = getSigPos(e, canvas);
    ctx.beginPath(); ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.moveTo(lastPos.current.x, lastPos.current.y); ctx.lineTo(pos.x, pos.y); ctx.stroke();
    lastPos.current = pos;
  };
  const sigEndDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false); lastPos.current = null;
    const canvas = canvasRef.current;
    if (canvas) setAdminSignData(canvas.toDataURL("image/png"));
  };
  const clearSig = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setAdminSignData(null);
  };

  const openDocInNewTab = (doc: DocFile) => {
    try {
      const arr = doc.data.split(",");
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
      const bstr = atob(arr[1]);
      const u8 = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([u8], { type: mime }));
      window.open(blobUrl, "_blank", "noopener,noreferrer");
    } catch {
      // fallback: direct data URL open
      const win = window.open();
      if (win) win.document.write(`<iframe src="${doc.data}" style="width:100%;height:100vh;border:0"></iframe>`);
    }
  };

  const fetchPending = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data } = await api.get("/admin/pending-registrations");
      setRegistrations(data.registrations || []);
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load pending registrations");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const openModal = (reg: Registration, action: "approve" | "reject") => {
    setSelected(reg); setNote(""); setModal(action); setAdminSignData(null); setAdminSignName("");
  };
  const closeModal = () => { setSelected(null); setModal(null); setNote(""); setAdminSignData(null); setAdminSignName(""); };

  const handleAction = async () => {
    if (!selected || !modal) return;
    setActionLoading(true);
    try {
      const endpoint = `/admin/pending-registrations/${modal}`;
      const body = modal === "approve"
        ? {
            entityType: selected.entityType, id: selected.id, adminNote: note,
            ...(selected.entityType === "doctor" && { adminSignature: adminSignData, adminSignName }),
          }
        : { entityType: selected.entityType, id: selected.id, reason: note };
      await api.post(endpoint, body);
      setSuccessMsg(modal === "approve"
        ? `${selected.name} approved — credentials emailed.`
        : `${selected.name} rejected.`);
      closeModal();
      fetchPending();
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch (e: any) {
      setError(e.response?.data?.message || "Action failed");
    } finally { setActionLoading(false); }
  };

  const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">Pending Registrations</h1>
            <p className="text-slate-500 text-sm mt-1">Review and activate new provider &amp; doctor accounts</p>
          </div>
          <Button variant="outline" onClick={fetchPending} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {successMsg && (
          <Alert className="mb-5 bg-green-50 border-green-200 rounded-xl">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 font-semibold">{successMsg}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" className="mb-5 rounded-xl">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-48 gap-3 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin" />
            <span className="text-sm">Loading registrations...</span>
          </div>
        ) : registrations.length === 0 ? (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <CheckCircle2 className="w-12 h-12 text-slate-200 mb-4" />
              <p className="font-semibold text-slate-500">No pending registrations</p>
              <p className="text-sm text-slate-400 mt-1">All accounts are either active or rejected.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {registrations.map((reg) => {
              const meta = ENTITY_META[reg.entityType] || ENTITY_META.clinic;
              const Icon = meta.icon;
              return (
                <Card key={`${reg.entityType}-${reg.id}`} className="rounded-2xl border hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold ${meta.bg} ${meta.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {meta.label}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                        <Clock className="w-3 h-3" />
                        Pending
                      </div>
                    </div>

                    <h3 className="font-extrabold text-slate-800 text-base mb-1 truncate">{reg.name}</h3>

                    <div className="space-y-1.5 mb-4">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{reg.email}</span>
                      </div>
                      {reg.phone && (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          <span>{reg.phone}</span>
                        </div>
                      )}
                      {(reg.city || reg.state) && (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span>{[reg.city, reg.state].filter(Boolean).join(", ")}</span>
                        </div>
                      )}
                      {reg.registrationDocs !== undefined && (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                          <span>{reg.registrationDocs > 0 ? `${reg.registrationDocs} document(s) uploaded` : "No documents uploaded"}</span>
                        </div>
                      )}
                      {reg.specialization && (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Stethoscope className="w-3.5 h-3.5 shrink-0" />
                          <span>{reg.specialization}{reg.experience !== undefined ? ` · ${reg.experience} yrs exp` : ""}</span>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 mb-4">Submitted: {formatDate(reg.submittedAt)}</p>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => openModal(reg, "approve")}
                        className="flex-1 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Approve
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => openModal(reg, "reject")}
                        className="flex-1 h-9 rounded-xl border-red-200 text-red-600 hover:bg-red-50 text-sm font-bold gap-1.5"
                      >
                        <XCircle className="w-4 h-4" /> Reject
                      </Button>
                    </div>
                    {reg.entityType === "doctor" && (
                      <Button
                        variant="outline"
                        onClick={() => setDocsView(reg)}
                        className="w-full mt-2 h-8 rounded-xl border-indigo-200 text-indigo-600 hover:bg-indigo-50 text-xs font-semibold gap-1.5"
                      >
                        <FileText className="w-3.5 h-3.5" /> View Uploaded Documents
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Approve/Reject Dialog */}
      <Dialog open={!!modal} onOpenChange={() => closeModal()}>
        <DialogContent className={`rounded-2xl ${modal === "approve" && selected?.entityType === "doctor" ? "max-w-lg" : "max-w-md"}`}>
          <DialogHeader>
            <DialogTitle className={modal === "approve" ? "text-emerald-700" : "text-red-600"}>
              {modal === "approve" ? "Approve Registration" : "Reject Registration"}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="py-2">
              <div className={`p-4 rounded-xl border mb-4 ${ENTITY_META[selected.entityType]?.bg || ""}`}>
                <p className="font-bold text-slate-800">{selected.name}</p>
                <p className="text-sm text-slate-500 mt-0.5">{selected.email}</p>
                <Badge variant="outline" className="mt-2 text-xs">{ENTITY_META[selected.entityType]?.label}</Badge>
              </div>

              {modal === "approve" ? (
                <>
                  {selected.entityType === "doctor" ? (
                    <div className="space-y-3 mb-1">
                      {/* Warning banner */}
                      <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                        <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-800 leading-relaxed">
                          <strong>Manual verification required.</strong> Review the doctor's uploaded documents and signed MOU, then countersign below to activate the account.
                        </p>
                      </div>

                      {/* View MOU button */}
                      {(selected as any).documents?.agreement?.pdf && (
                        <button
                          type="button"
                          onClick={() => {
                            const pdf = (selected as any).documents.agreement.pdf as string;
                            const win = window.open();
                            if (win) win.document.write(`<iframe src="${pdf}" style="width:100%;height:100vh;border:0"></iframe>`);
                          }}
                          className="w-full flex items-center justify-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-semibold border border-indigo-200 rounded-xl py-2 hover:bg-indigo-50 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" /> View Doctor&apos;s Signed MOU PDF
                        </button>
                      )}

                      {/* Admin countersignature canvas */}
                      <div>
                        <p className="text-xs font-semibold text-slate-700 mb-1.5">
                          Admin / Team Countersignature
                          <span className="text-red-500 ml-0.5">*</span>
                          <span className="text-slate-400 font-normal ml-1.5">required to activate</span>
                        </p>
                        <div className="relative border-2 border-slate-200 rounded-xl overflow-hidden bg-white select-none">
                          <canvas
                            ref={canvasRef}
                            width={440}
                            height={110}
                            className="w-full touch-none cursor-crosshair block"
                            onMouseDown={sigStartDraw}
                            onMouseMove={sigDraw}
                            onMouseUp={sigEndDraw}
                            onMouseLeave={sigEndDraw}
                            onTouchStart={sigStartDraw}
                            onTouchMove={sigDraw}
                            onTouchEnd={sigEndDraw}
                          />
                          {!adminSignData && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <span className="text-slate-300 text-sm">Draw your signature here</span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={clearSig}
                            className="absolute top-1.5 right-2 text-xs text-slate-400 hover:text-red-500 transition-colors font-medium"
                          >
                            Clear
                          </button>
                        </div>
                        {adminSignData
                          ? <p className="text-xs text-emerald-600 mt-1 font-semibold">✓ Signature captured</p>
                          : <p className="text-xs text-amber-600 mt-1">Draw above to countersign the MOU</p>
                        }
                      </div>

                      {/* Admin name / designation */}
                      <Input
                        placeholder="Your name & designation (e.g. Dr. Arjun Kumar, Medical Director)"
                        value={adminSignName}
                        onChange={e => setAdminSignName(e.target.value)}
                        className="text-sm rounded-xl h-9"
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 mb-2">
                      A temporary password will be generated and emailed to <strong>{selected.email}</strong>. The account will become active immediately.
                    </p>
                  )}
                  <Textarea
                    placeholder={selected.entityType === "doctor" ? "Optional note for activation email…" : "Optional admin note to include in email..."}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="resize-none rounded-xl h-16 text-sm"
                  />
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-600 mb-2">
                    Please provide a reason for rejection — it will be included in the notification email to <strong>{selected.email}</strong>.
                  </p>
                  <Textarea
                    placeholder="Reason for rejection (e.g. incomplete documents)..."
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="resize-none rounded-xl h-20 text-sm"
                  />
                </>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 flex-row">
            <Button variant="outline" onClick={closeModal} className="flex-1 rounded-xl">Cancel</Button>
            <Button
              onClick={handleAction}
              disabled={actionLoading || (modal === "reject" && !note.trim()) || (modal === "approve" && selected?.entityType === "doctor" && !adminSignData)}
              className={`flex-1 rounded-xl font-bold ${modal === "approve" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}`}
            >
              {actionLoading ? "Processing…" : modal === "approve" ? (selected?.entityType === "doctor" ? "Countersign & Activate Doctor" : "Approve & Send Credentials") : "Reject Application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Viewer Dialog */}
      <Dialog open={!!docsView} onOpenChange={() => setDocsView(null)}>
        <DialogContent className="rounded-2xl max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-indigo-700 flex items-center gap-2">
              <FileText className="w-5 h-5" /> Documents — {docsView?.name}
            </DialogTitle>
          </DialogHeader>

          {docsView && (
            <div className="space-y-4 py-2">
              {DOC_LABELS.map(({ key, label }) => {
                const doc = docsView.documents?.[key];
                if (!doc?.data) {
                  return (
                    <div key={key} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-dashed">
                      <span className="text-sm font-medium text-slate-500">{label}</span>
                      <Badge variant="outline" className="text-slate-400 text-xs">Not uploaded</Badge>
                    </div>
                  );
                }
                const isImage = doc.type?.startsWith("image/");
                return (
                  <div key={key} className="rounded-xl border overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-500" />
                        <span className="text-sm font-semibold text-slate-700">{label}</span>
                        <span className="text-xs text-slate-400 truncate max-w-[160px]">({doc.name})</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openDocInNewTab(doc)}
                          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Open
                        </button>
                        <a
                          href={doc.data}
                          download={doc.name}
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 font-semibold"
                        >
                          <Download className="w-3.5 h-3.5" /> Save
                        </a>
                      </div>
                    </div>
                    {isImage ? (
                      <img
                        src={doc.data}
                        alt={label}
                        className="w-full max-h-72 object-contain bg-slate-100 p-2"
                      />
                    ) : (
                      <div className="bg-slate-50 flex items-center justify-center h-24 text-sm text-slate-400 gap-2">
                        <FileText className="w-5 h-5" />
                        {doc.name} — click <strong>Open</strong> or <strong>Save</strong> above to view
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDocsView(null)} className="rounded-xl">
              Close
            </Button>
            {docsView && (
              <Button
                onClick={() => { setDocsView(null); openModal(docsView, "approve"); }}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" /> Approve This Doctor
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}