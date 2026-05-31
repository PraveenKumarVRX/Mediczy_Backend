import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, Plus, Trash2, FileText, Upload, Eye, Download, Calendar,
  IndianRupee, Users, Building2, AlertTriangle, CheckCircle,
  Clock, RefreshCw, ShieldCheck, Info,
} from "lucide-react";
import api from "@/utils/api";
import {
  INSURANCE_POLICY_CATEGORIES,
  DEFAULT_INSURANCE_POLICY_CATEGORY
} from "@/constants/insurancePolicyCategories";

interface PersonalPolicy {
  id: string;
  insurerName: string;
  policyNumber: string;
  policyType: string;
  coverageAmount: number | null;
  premiumAmount: number | null;
  premiumFrequency: string;
  startDate: string | null;
  endDate: string | null;
  membersName: string | null;
  notes: string | null;
  documentUrl: string | null;
  createdAt: string;
}

const FREQUENCIES = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semi_annual", label: "Semi-Annual" },
  { value: "annual", label: "Annual" },
  { value: "single", label: "Single Premium" },
];

const isExpired = (endDate?: string | null) => {
  if (!endDate) return false;
  return new Date(endDate) < new Date();
};
const isExpiringSoon = (endDate?: string | null) => {
  if (!endDate) return false;
  const d = new Date(endDate);
  const now = new Date();
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 30;
};

const fmtCurrency = (n?: number | null) =>
  n != null ? `₹${n.toLocaleString("en-IN")}` : "—";
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const MyInsurancePolicies = () => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [policies, setPolicies] = useState<PersonalPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [form, setForm] = useState({
    insurerName: "", policyNumber: "", policyType: DEFAULT_INSURANCE_POLICY_CATEGORY,
    coverageAmount: "", premiumAmount: "", premiumFrequency: "annual",
    startDate: "", endDate: "", membersName: "", notes: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/users/my-insurances");
      setPolicies(res.data.policies || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ insurerName: "", policyNumber: "", policyType: DEFAULT_INSURANCE_POLICY_CATEGORY, coverageAmount: "", premiumAmount: "", premiumFrequency: "annual", startDate: "", endDate: "", membersName: "", notes: "" });
    setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSave = async () => {
    if (!form.insurerName || !form.policyNumber) {
      toast({ title: "Insurer name and policy number are required", variant: "destructive" }); return;
    }
    setSaving(true);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
    if (selectedFile) fd.append("policyDocument", selectedFile);
    try {
      const res = await api.post("/users/my-insurances", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPolicies(p => [...p, res.data.policy]);
      toast({ title: "Policy saved successfully" });
      setAddDialogOpen(false);
      resetForm();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.response?.data?.message || "Error", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this insurance policy?")) return;
    setDeletingId(id);
    try {
      await api.delete(`/users/my-insurances/${id}`);
      setPolicies(p => p.filter(x => x.id !== id));
      toast({ title: "Policy removed" });
    } catch { toast({ title: "Failed to remove", variant: "destructive" }); }
    finally { setDeletingId(null); }
  };

  const expiredCount = policies.filter(p => isExpired(p.endDate)).length;
  const expiringSoonCount = policies.filter(p => isExpiringSoon(p.endDate)).length;

  return (
    <>
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="rounded-2xl border border-teal-200/80 bg-gradient-to-r from-teal-50 via-cyan-50 to-emerald-50 p-5 md:p-6 mb-6 shadow-sm transition-all duration-300">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-teal-600/10 px-3 py-1 text-xs font-semibold text-teal-700 mb-3">
                <ShieldCheck className="h-3.5 w-3.5" />
                Policy Protection Center
              </div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Shield className="w-6 h-6 text-teal-500" /> My Insurance Policies
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">Upload and manage your health insurance documents</p>
            </div>
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add Policy
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mt-5">
            <div className="rounded-lg border border-teal-200 bg-white/80 px-3 py-2">
              <p className="text-xs font-semibold text-teal-700">Step 1: Add policy details</p>
              <p className="text-[11px] text-slate-600">Capture insurer, policy number, cover amount, and members.</p>
            </div>
            <div className="rounded-lg border border-teal-200 bg-white/80 px-3 py-2">
              <p className="text-xs font-semibold text-teal-700">Step 2: Attach document</p>
              <p className="text-[11px] text-slate-600">Upload PDFs or images so policy proofs are always accessible.</p>
            </div>
            <div className="rounded-lg border border-teal-200 bg-white/80 px-3 py-2">
              <p className="text-xs font-semibold text-teal-700">Step 3: Track renewals</p>
              <p className="text-[11px] text-slate-600">Use expiry alerts to renew before coverage gaps happen.</p>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {expiredCount > 0 && (
          <Alert className="mb-4 border-red-200 bg-red-50 dark:bg-red-950/30">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-700 dark:text-red-300">
              {expiredCount} {expiredCount === 1 ? "policy has" : "policies have"} expired. Please renew them.
            </AlertDescription>
          </Alert>
        )}
        {expiringSoonCount > 0 && (
          <Alert className="mb-4 border-amber-200 bg-amber-50 dark:bg-amber-950/30">
            <Clock className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              {expiringSoonCount} {expiringSoonCount === 1 ? "policy expires" : "policies expire"} within 30 days.
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 transition-all duration-300">
          <div>
            <p className="text-xs font-semibold text-teal-700">Next Best Action</p>
            <p className="text-[11px] text-slate-600">Keep one active family policy and renew expiring covers before treatment requests.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Policy
            </Button>
            <Button size="sm" variant="outline" onClick={load}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh List
            </Button>
          </div>
        </div>

        {/* Stats row */}
        {!loading && policies.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { icon: ShieldCheck, label: "Total Policies", value: policies.length, color: "teal" },
              { icon: CheckCircle, label: "Active", value: policies.filter(p => !isExpired(p.endDate)).length, color: "green" },
              { icon: AlertTriangle, label: "Expired", value: expiredCount, color: "red" },
            ].map(({ icon: Icon, label, value, color }) => (
              <Card key={label} className="text-center">
                <CardContent className="pt-4 pb-3">
                  <Icon className={`w-5 h-5 mx-auto mb-1 text-${color}-500`} />
                  <p className="text-xl font-bold">{value}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Policy list */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map(i => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
          </div>
        ) : policies.length === 0 ? (
          <Card className="border-dashed border-2 border-slate-200 dark:border-slate-700">
            <CardContent className="py-16 text-center">
              <Shield className="w-14 h-14 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
              <p className="font-semibold text-slate-600 dark:text-slate-400 mb-1">No insurance policies saved</p>
              <p className="text-sm text-slate-400 mb-5">Upload your health insurance policy documents to keep them safe and accessible</p>
              <Button variant="outline" onClick={() => setAddDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Add Your First Policy
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {policies.map(p => {
              const expired = isExpired(p.endDate);
              const expiring = isExpiringSoon(p.endDate);
              return (
                <Card key={p.id} className={`transition-all border ${expired ? "border-red-200 dark:border-red-800" : expiring ? "border-amber-200 dark:border-amber-800" : "border-slate-200 dark:border-slate-700 hover:border-teal-200 dark:hover:border-teal-800"}`}>
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center shrink-0">
                          <ShieldCheck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{p.insurerName}</p>
                            <Badge variant="outline" className="text-xs">{p.policyType}</Badge>
                            {expired && <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs">Expired</Badge>}
                            {expiring && !expired && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs">Expires Soon</Badge>}
                          </div>
                          <p className="text-sm text-slate-500 mt-0.5">Policy No: <span className="font-mono">{p.policyNumber}</span></p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {p.documentUrl && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setPreviewUrl(p.documentUrl!)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" asChild>
                              <a href={`${import.meta.env.VITE_API_URL || ""}${p.documentUrl}`} target="_blank" rel="noreferrer">
                                <Download className="w-4 h-4" />
                              </a>
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" disabled={deletingId === p.id} onClick={() => handleDelete(p.id)}>
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      </div>
                    </div>
                    <Separator className="my-3" />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-slate-400 mb-0.5 flex items-center gap-1"><IndianRupee className="w-3 h-3" />Coverage</p>
                        <p className="font-medium">{fmtCurrency(p.coverageAmount)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-0.5">Premium</p>
                        <p className="font-medium">{fmtCurrency(p.premiumAmount)}{p.premiumAmount ? <span className="text-xs text-slate-400">/{p.premiumFrequency}</span> : ""}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-0.5 flex items-center gap-1"><Calendar className="w-3 h-3" />Start Date</p>
                        <p className="font-medium">{fmtDate(p.startDate)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-0.5 flex items-center gap-1"><Calendar className="w-3 h-3" />End Date</p>
                        <p className={`font-medium ${expired ? "text-red-600 dark:text-red-400" : expiring ? "text-amber-600 dark:text-amber-400" : ""}`}>{fmtDate(p.endDate)}</p>
                      </div>
                    </div>
                    {(p.membersName || p.notes) && (
                      <div className="mt-3 space-y-1">
                        {p.membersName && (
                          <p className="text-xs text-slate-500 flex items-center gap-1"><Users className="w-3 h-3" />Members: {p.membersName}</p>
                        )}
                        {p.notes && (
                          <p className="text-xs text-slate-500 flex items-center gap-1"><Info className="w-3 h-3" />{p.notes}</p>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-slate-400 mt-2">Added {new Date(p.createdAt).toLocaleDateString("en-IN")}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Policy Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(o) => { setAddDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Shield className="w-5 h-5 text-teal-500" />Add Insurance Policy</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Insurer / Company Name <span className="text-red-500">*</span></Label>
                <Input placeholder="e.g. Star Health, HDFC ERGO" value={form.insurerName}
                  onChange={e => setForm(f => ({ ...f, insurerName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Policy Number <span className="text-red-500">*</span></Label>
                <Input placeholder="e.g. P/21/2024/001" value={form.policyNumber}
                  onChange={e => setForm(f => ({ ...f, policyNumber: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Policy Type</Label>
                <Select value={form.policyType} onValueChange={v => setForm(f => ({ ...f, policyType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INSURANCE_POLICY_CATEGORIES.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500">
                  Standard categories only. E-card availability is determined by policy type.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Coverage Amount (₹)</Label>
                <Input type="number" placeholder="e.g. 500000" value={form.coverageAmount}
                  onChange={e => setForm(f => ({ ...f, coverageAmount: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Premium (₹)</Label>
                <Input type="number" placeholder="e.g. 15000" value={form.premiumAmount}
                  onChange={e => setForm(f => ({ ...f, premiumAmount: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Premium Frequency</Label>
                <Select value={form.premiumFrequency} onValueChange={v => setForm(f => ({ ...f, premiumFrequency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQUENCIES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Expiry Date</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Members Covered</Label>
                <Input placeholder="e.g. Self, Spouse, 2 Children" value={form.membersName}
                  onChange={e => setForm(f => ({ ...f, membersName: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Notes</Label>
                <Textarea placeholder="TPA name, network hospitals, special clauses…" rows={2} value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Upload Policy Document <span className="text-xs text-slate-400">(PDF or image, max 10MB)</span></Label>
                <div
                  className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-4 text-center cursor-pointer hover:border-teal-300 transition-colors"
                  onClick={() => fileRef.current?.click()}>
                  <Upload className="w-6 h-6 mx-auto text-slate-400 mb-2" />
                  {selectedFile
                    ? <p className="text-sm font-medium text-teal-600">{selectedFile.name}</p>
                    : <p className="text-sm text-slate-500">Click to upload PDF or image</p>
                  }
                </div>
                <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden"
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialogOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save Policy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document preview dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl h-[80vh]">
          <DialogHeader><DialogTitle>Policy Document</DialogTitle></DialogHeader>
          {previewUrl && (
            <iframe
              src={previewUrl.startsWith("http") ? previewUrl : `${import.meta.env.VITE_API_URL || ""}${previewUrl}`}
              className="w-full h-full rounded-lg border"
              title="Policy document"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MyInsurancePolicies;
