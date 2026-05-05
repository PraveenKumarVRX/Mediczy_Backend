import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import api from "@/utils/api";
import {
  Building2, FlaskConical, Pill, Heart, Briefcase, Stethoscope,
  CheckCircle2, XCircle, Clock, FileText, Mail,
  Phone, MapPin, RefreshCw, AlertCircle,
} from "lucide-react";

const ENTITY_META: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  clinic:    { label: "Clinic",    color: "text-teal-700",   bg: "bg-teal-50 border-teal-200",   icon: Building2 },
  lab:       { label: "Lab",       color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",   icon: FlaskConical },
  pharmacy:  { label: "Pharmacy",  color: "text-emerald-700",bg: "bg-emerald-50 border-emerald-200", icon: Pill },
  homecare:  { label: "Homecare",  color: "text-pink-700",   bg: "bg-pink-50 border-pink-200",   icon: Heart },
  corporate: { label: "Corporate", color: "text-violet-700", bg: "bg-violet-50 border-violet-200", icon: Briefcase },
  doctor:    { label: "Doctor",    color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200", icon: Stethoscope },
};

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
}

export default function PendingRegistrations() {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [selected, setSelected] = useState<Registration | null>(null);
  const [modal, setModal] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

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
    setSelected(reg); setNote(""); setModal(action);
  };
  const closeModal = () => { setSelected(null); setModal(null); setNote(""); };

  const handleAction = async () => {
    if (!selected || !modal) return;
    setActionLoading(true);
    try {
      const endpoint = `/admin/pending-registrations/${modal}`;
      const body = modal === "approve"
        ? { entityType: selected.entityType, id: selected.id, adminNote: note }
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
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Approve/Reject Dialog */}
      <Dialog open={!!modal} onOpenChange={() => closeModal()}>
        <DialogContent className="rounded-2xl max-w-md">
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
                  <p className="text-sm text-slate-600 mb-2">
                    {selected.entityType === "doctor"
                      ? <>The account will be activated and an email will be sent to <strong>{selected.email}</strong>. The doctor will use their existing password to log in.</>
                      : <>A temporary password will be generated and emailed to <strong>{selected.email}</strong>. The account will become active immediately.</>
                    }
                  </p>
                  <Textarea
                    placeholder="Optional admin note to include in email..."
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="resize-none rounded-xl h-20 text-sm"
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
              disabled={actionLoading || (modal === "reject" && !note.trim())}
              className={`flex-1 rounded-xl font-bold ${modal === "approve" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}`}
            >
              {actionLoading ? "Processing…" : modal === "approve" ? "Approve & Send Credentials" : "Reject Application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
