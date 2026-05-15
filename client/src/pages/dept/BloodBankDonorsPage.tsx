import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import DeptStaffLayout from "@/components/hosp-dept/DeptStaffLayout";
import { bloodBankNav } from "./DepartmentDashboards";
import { toast } from "sonner";
import {
  Droplets, Users, Search, Plus, Send, Zap, Phone, Mail, MapPin,
  CalendarCheck, CheckCircle2, AlertTriangle, Clock, RefreshCw,
  ChevronRight, X, Edit2, Trash2, MessageSquare, History, Bot,
  UserCheck, UserX, Heart, Syringe, BarChart3, Copy, Eye,
  TriangleAlert, Loader2, Filter, Download, Upload,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Donor {
  id: number;
  donor_id: string;
  name: string;
  blood_group: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  age: number | null;
  gender: string | null;
  city: string | null;
  pincode: string | null;
  address: string | null;
  donor_type: string;
  total_donations: number;
  last_donation_date: string | null;
  next_eligible_date: string | null;
  eligible: boolean;
  eligible_now: boolean;
  health_notes: string | null;
  notification_consent: boolean;
  preferred_channel: string;
  is_active: boolean;
  created_at: string;
}

interface CommHistory {
  id: number;
  blood_group_needed: string | null;
  component: string | null;
  urgency: string;
  message_subject: string | null;
  message_body: string;
  channel: string;
  status: string;
  total_donors: number;
  sent_count: number;
  responded_count: number;
  created_by: string | null;
  sent_at: string | null;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BLOOD_GROUPS = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
const COMPONENTS = [
  { value: "whole_blood", label: "Whole Blood" },
  { value: "prbc", label: "Packed RBCs (PRBC)" },
  { value: "ffp", label: "Fresh Frozen Plasma (FFP)" },
  { value: "platelets", label: "Platelets" },
  { value: "cryoprecipitate", label: "Cryoprecipitate" },
];
const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp", icon: "💬" },
  { value: "sms", label: "SMS", icon: "📱" },
  { value: "email", label: "Email", icon: "📧" },
];
const URGENCY_OPTS = [
  { value: "routine", label: "Routine", color: "bg-sky-100 text-sky-700" },
  { value: "high",    label: "High",    color: "bg-orange-100 text-orange-700" },
  { value: "critical",label: "Critical",color: "bg-red-100 text-red-700" },
];

const getToken = () => {
  const raw = localStorage.getItem("blood-bankAuth");
  try { return JSON.parse(raw || "{}").token || ""; } catch { return ""; }
};
const authH = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" });

const groupColor: Record<string, string> = {
  "O+": "bg-red-600", "O-": "bg-red-800",
  "A+": "bg-blue-600", "A-": "bg-blue-800",
  "B+": "bg-emerald-600", "B-": "bg-emerald-800",
  "AB+": "bg-violet-600", "AB-": "bg-violet-800",
};

// ─── Donor form defaults ──────────────────────────────────────────────────────

const emptyForm = () => ({
  name: "", bloodGroup: "O+", phone: "", whatsapp: "", email: "",
  age: "", gender: "", address: "", city: "", pincode: "",
  donorType: "voluntary", lastDonationDate: "",
  healthNotes: "", notificationConsent: true, preferredChannel: "whatsapp",
});

// ─── Main page ────────────────────────────────────────────────────────────────

export function BloodBankDonorsPage() {
  // Data
  const [donors, setDonors] = useState<Donor[]>([]);
  const [commHistory, setCommHistory] = useState<CommHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch]       = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [filterEligible, setFilterEligible] = useState("");
  const [filterType, setFilterType] = useState("");

  // Modals
  const [showForm, setShowForm]       = useState(false);
  const [showComm, setShowComm]       = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDonation, setShowDonation] = useState(false);
  const [editDonor, setEditDonor]     = useState<Donor | null>(null);
  const [donationTarget, setDonationTarget] = useState<Donor | null>(null);

  // Form state
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  // Communication state
  const [commGroup, setCommGroup]       = useState("O+");
  const [commComponent, setCommComponent] = useState("whole_blood");
  const [commUnits, setCommUnits]       = useState(1);
  const [commUrgency, setCommUrgency]   = useState("routine");
  const [commChannel, setCommChannel]   = useState("whatsapp");
  const [commContext, setCommContext]    = useState("");
  const [aiDraft, setAiDraft]           = useState<{ subject: string; body: string; summary: string } | null>(null);
  const [editedBody, setEditedBody]     = useState("");
  const [drafting, setDrafting]         = useState(false);
  const [sending, setSending]           = useState(false);
  const [eligibleForComm, setEligibleForComm] = useState<Donor[]>([]);
  const [selectedDonors, setSelectedDonors]   = useState<number[]>([]);
  const [commStep, setCommStep]         = useState<"compose" | "preview" | "sent">("compose");
  const [sentResult, setSentResult]     = useState<any>(null);

  // Donation form
  const [donForm, setDonForm] = useState({
    donationDate: new Date().toISOString().slice(0, 10),
    component: "whole_blood", bagNumber: "", hbLevel: "",
    bloodPressure: "", pulse: "", weight: "", screeningPassed: true,
    adverseReactions: "", campLocation: "", notes: "",
  });
  const [donSaving, setDonSaving] = useState(false);

  // ── Fetch donors ────────────────────────────────────────────────────────────

  const fetchDonors = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (search)        params.set("search", search);
      if (filterGroup)   params.set("bloodGroup", filterGroup);
      if (filterEligible) params.set("eligible", filterEligible);
      if (filterType)    params.set("donorType", filterType);
      const res = await fetch(`/api/blood-bank/donors?${params}`, { headers: authH() });
      const json = await res.json();
      if (json.success) { setDonors(json.data); setTotal(json.total); }
    } catch { toast.error("Failed to load donors"); }
    finally { setLoading(false); }
  }, [search, filterGroup, filterEligible, filterType]);

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/blood-bank/communications", { headers: authH() });
      const json = await res.json();
      if (json.success) setCommHistory(json.data);
    } catch {}
  };

  useEffect(() => { fetchDonors(); }, [fetchDonors]);

  // ── Fetch eligible donors for current comm config ───────────────────────────

  const fetchEligibleForComm = useCallback(async () => {
    try {
      const res = await fetch(`/api/blood-bank/donors/eligible/${commGroup}?compatibleGroups=true`, { headers: authH() });
      const json = await res.json();
      if (json.success) {
        setEligibleForComm(json.data);
        setSelectedDonors(json.data.map((d: Donor) => d.id));
      }
    } catch {}
  }, [commGroup]);

  useEffect(() => { if (showComm) fetchEligibleForComm(); }, [showComm, commGroup, fetchEligibleForComm]);

  // ── Save donor ──────────────────────────────────────────────────────────────

  const saveDonor = async () => {
    if (!form.name.trim() || !form.bloodGroup) return toast.error("Name and blood group are required");
    setSaving(true);
    try {
      const url = editDonor ? `/api/blood-bank/donors/${editDonor.id}` : "/api/blood-bank/donors";
      const method = editDonor ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: authH(), body: JSON.stringify(form) });
      const json = await res.json();
      if (json.success) {
        toast.success(editDonor ? "Donor updated" : "Donor registered");
        setShowForm(false); setEditDonor(null); setForm(emptyForm());
        fetchDonors();
      } else { toast.error(json.message); }
    } catch { toast.error("Failed to save donor"); }
    finally { setSaving(false); }
  };

  const openEdit = (d: Donor) => {
    setEditDonor(d);
    setForm({
      name: d.name, bloodGroup: d.blood_group, phone: d.phone || "",
      whatsapp: d.whatsapp || "", email: d.email || "", age: String(d.age || ""),
      gender: d.gender || "", address: d.address || "", city: d.city || "",
      pincode: d.pincode || "", donorType: d.donor_type,
      lastDonationDate: d.last_donation_date || "", healthNotes: d.health_notes || "",
      notificationConsent: d.notification_consent, preferredChannel: d.preferred_channel,
    });
    setShowForm(true);
  };

  const deactivateDonor = async (id: number) => {
    if (!confirm("Deactivate this donor?")) return;
    try {
      await fetch(`/api/blood-bank/donors/${id}`, { method: "DELETE", headers: authH() });
      toast.success("Donor deactivated");
      fetchDonors();
    } catch { toast.error("Failed"); }
  };

  // ── AI draft ────────────────────────────────────────────────────────────────

  const draftMessage = async () => {
    setDrafting(true); setAiDraft(null);
    try {
      const res = await fetch("/api/blood-bank/communications/ai-draft", {
        method: "POST", headers: authH(),
        body: JSON.stringify({
          bloodGroupNeeded: commGroup, component: commComponent,
          unitsNeeded: commUnits, urgency: commUrgency, channel: commChannel,
          donorCount: selectedDonors.length, additionalContext: commContext,
          hospitalName: "MGM Hospitals",
        }),
      });
      const json = await res.json();
      if (json.success) {
        setAiDraft(json.data);
        setEditedBody(json.data.body);
      } else { toast.error(json.message); }
    } catch { toast.error("AI drafting failed"); }
    finally { setDrafting(false); }
  };

  // ── Send communication ───────────────────────────────────────────────────────

  const sendComm = async () => {
    if (!editedBody.trim()) return toast.error("Message body is required");
    if (!selectedDonors.length) return toast.error("No donors selected");
    setSending(true);
    try {
      const res = await fetch("/api/blood-bank/communications/send", {
        method: "POST", headers: authH(),
        body: JSON.stringify({
          bloodGroupNeeded: commGroup, component: commComponent,
          unitsNeeded: commUnits, urgency: commUrgency, channel: commChannel,
          messageSubject: aiDraft?.subject, messageBody: editedBody,
          donorIds: selectedDonors,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSentResult(json.data);
        setCommStep("sent");
        toast.success(json.message);
        fetchHistory();
        fetchDonors();
      } else { toast.error(json.message); }
    } catch { toast.error("Send failed"); }
    finally { setSending(false); }
  };

  // ── Record donation ──────────────────────────────────────────────────────────

  const recordDonation = async () => {
    if (!donationTarget) return;
    setDonSaving(true);
    try {
      const res = await fetch(`/api/blood-bank/donors/${donationTarget.id}/donations`, {
        method: "POST", headers: authH(), body: JSON.stringify(donForm),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Donation recorded. Next eligible: ${json.data.next_eligible_date}`);
        setShowDonation(false); setDonationTarget(null);
        fetchDonors();
      } else { toast.error(json.message); }
    } catch { toast.error("Failed to record donation"); }
    finally { setDonSaving(false); }
  };

  // ── Stats ────────────────────────────────────────────────────────────────────

  const eligibleCount  = donors.filter(d => d.eligible_now).length;
  const criticalGroups = ["A-", "AB-"].filter(g => donors.filter(d => d.blood_group === g && d.eligible_now).length < 3);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <DeptStaffLayout
      deptKey="blood-bank"
      deptName="Blood Bank"
      badgeLabel="BLOOD BANK"
      DeptIcon={Droplets}
      loginPath="/blood-bank/login"
      navSections={bloodBankNav}
    >
      <div className="space-y-5 pb-8">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-5 w-5 text-red-600" /> Donor Registry
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {total} registered donors · {eligibleCount} eligible to donate now
              {criticalGroups.length > 0 && (
                <span className="ml-2 text-red-600 font-semibold">
                  ⚠ {criticalGroups.join(", ")} critically low
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { fetchHistory(); setShowHistory(true); }}>
              <History className="h-3.5 w-3.5" /> Comm History
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 border-red-200 text-red-700 hover:bg-red-50"
              onClick={() => { setCommStep("compose"); setAiDraft(null); setEditedBody(""); setShowComm(true); }}>
              <Bot className="h-3.5 w-3.5" /> AI Alert
            </Button>
            <Button size="sm" className="gap-1.5 bg-red-600 hover:bg-red-700 text-white"
              onClick={() => { setEditDonor(null); setForm(emptyForm()); setShowForm(true); }}>
              <Plus className="h-3.5 w-3.5" /> Register Donor
            </Button>
          </div>
        </div>

        {/* ── KPI strip ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: Users,        label: "Total Donors",     value: total,         color: "bg-slate-700" },
            { icon: CheckCircle2, label: "Eligible Now",     value: eligibleCount, color: "bg-emerald-600" },
            { icon: Syringe,      label: "Donated This Month", value: donors.filter(d => {
                if (!d.last_donation_date) return false;
                const m = new Date(); const ld = new Date(d.last_donation_date);
                return ld.getMonth() === m.getMonth() && ld.getFullYear() === m.getFullYear();
              }).length, color: "bg-blue-600" },
            { icon: MessageSquare, label: "Alerts Sent",    value: commHistory.length, color: "bg-violet-600" },
          ].map(({ icon: Icon, label, value, color }) => (
            <Card key={label} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${color} shrink-0`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-xl font-extrabold text-slate-900">{value}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Blood group summary bar ───────────────────────────────────────── */}
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Eligible Donors by Blood Group</p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {BLOOD_GROUPS.map(g => {
                const count = donors.filter(d => d.blood_group === g && d.eligible_now).length;
                const isCrit = count < 3;
                return (
                  <button key={g} onClick={() => setFilterGroup(filterGroup === g ? "" : g)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                      filterGroup === g ? "border-red-500 bg-red-50" :
                      isCrit ? "border-red-200 bg-red-50" : "border-transparent bg-slate-50 hover:bg-slate-100"
                    }`}>
                    <span className={`h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-extrabold ${groupColor[g]}`}>{g}</span>
                    <span className={`text-lg font-extrabold ${isCrit ? "text-red-600" : "text-slate-800"}`}>{count}</span>
                    {isCrit && <span className="text-[9px] text-red-500 font-bold">LOW</span>}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ── Search & filters ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Search name, phone, email, donor ID…"
              className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-400">
            <option value="">All Groups</option>
            {BLOOD_GROUPS.map(g => <option key={g}>{g}</option>)}
          </select>
          <select value={filterEligible} onChange={e => setFilterEligible(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-400">
            <option value="">All Status</option>
            <option value="true">Eligible</option>
            <option value="false">Not Eligible</option>
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-400">
            <option value="">All Types</option>
            <option value="voluntary">Voluntary</option>
            <option value="replacement">Replacement</option>
            <option value="family">Family</option>
          </select>
          <Button variant="outline" size="icon" onClick={fetchDonors} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* ── Donor table ───────────────────────────────────────────────────── */}
        <Card className="shadow-sm">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading donors…
              </div>
            ) : donors.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No donors found</p>
                <p className="text-sm mt-1">Register your first donor to get started</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      {["Donor","Blood Group","Contact","City","Type","Donations","Last Donated","Eligible","Actions"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    <AnimatePresence>
                      {donors.map((d, i) => (
                        <motion.tr key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.02 }} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${groupColor[d.blood_group] || "bg-slate-500"}`}>
                                {d.name.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-800">{d.name}</p>
                                <p className="text-[10px] text-slate-400 font-mono">{d.donor_id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex h-8 w-10 items-center justify-center rounded-lg text-white text-xs font-extrabold ${groupColor[d.blood_group]}`}>
                              {d.blood_group}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-0.5">
                              {d.phone && <p className="text-xs flex items-center gap-1 text-slate-600"><Phone className="h-3 w-3 text-slate-400" />{d.phone}</p>}
                              {d.email && <p className="text-xs flex items-center gap-1 text-slate-500"><Mail className="h-3 w-3 text-slate-400" />{d.email}</p>}
                              {!d.notification_consent && <p className="text-[10px] text-amber-600 font-medium">No notifications</p>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">{d.city || "—"}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs capitalize text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">{d.donor_type}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-base font-extrabold text-slate-800">{d.total_donations}</span>
                            {d.total_donations >= 10 && <span className="ml-1 text-yellow-500" title="Regular donor">★</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                            {d.last_donation_date
                              ? new Date(d.last_donation_date).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })
                              : "Never"}
                          </td>
                          <td className="px-4 py-3">
                            {d.eligible_now ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-[11px] font-bold">
                                <CheckCircle2 className="h-3 w-3" /> Eligible
                              </span>
                            ) : (
                              <div>
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2.5 py-0.5 text-[11px] font-bold">
                                  <Clock className="h-3 w-3" /> Deferred
                                </span>
                                {d.next_eligible_date && (
                                  <p className="text-[10px] text-slate-400 mt-0.5">
                                    From {new Date(d.next_eligible_date).toLocaleDateString("en-IN", { day:"2-digit", month:"short" })}
                                  </p>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEdit(d)} title="Edit"
                                className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-blue-100 text-blue-600 transition-colors">
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => { setDonationTarget(d); setDonForm({ ...donForm, donationDate: new Date().toISOString().slice(0,10) }); setShowDonation(true); }}
                                title="Record donation"
                                className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-red-100 text-red-600 transition-colors">
                                <Syringe className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => deactivateDonor(d.id)} title="Deactivate"
                                className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-500 transition-colors">
                                <UserX className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL: Register / Edit Donor
      ════════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-red-600" />
                  {editDonor ? "Edit Donor" : "Register New Donor"}
                </h2>
                <button onClick={() => setShowForm(false)} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-slate-100">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label>Full Name *</Label>
                    <Input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} placeholder="Donor full name" />
                  </div>
                  <div>
                    <Label>Blood Group *</Label>
                    <select value={form.bloodGroup} onChange={e => setForm(p => ({...p, bloodGroup: e.target.value}))}
                      className="w-full mt-1 rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                      {BLOOD_GROUPS.map(g => <option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Donor Type</Label>
                    <select value={form.donorType} onChange={e => setForm(p => ({...p, donorType: e.target.value}))}
                      className="w-full mt-1 rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                      <option value="voluntary">Voluntary</option>
                      <option value="replacement">Replacement</option>
                      <option value="family">Family</option>
                    </select>
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} placeholder="+91 9999999999" />
                  </div>
                  <div>
                    <Label>WhatsApp</Label>
                    <Input value={form.whatsapp} onChange={e => setForm(p => ({...p, whatsapp: e.target.value}))} placeholder="If different from phone" />
                  </div>
                  <div className="col-span-2">
                    <Label>Email</Label>
                    <Input type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} placeholder="donor@email.com" />
                  </div>
                  <div>
                    <Label>Age</Label>
                    <Input type="number" value={form.age} onChange={e => setForm(p => ({...p, age: e.target.value}))} placeholder="18–65" min={18} max={65} />
                  </div>
                  <div>
                    <Label>Gender</Label>
                    <select value={form.gender} onChange={e => setForm(p => ({...p, gender: e.target.value}))}
                      className="w-full mt-1 rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                      <option value="">Select</option>
                      <option>Male</option><option>Female</option><option>Other</option>
                    </select>
                  </div>
                  <div>
                    <Label>City</Label>
                    <Input value={form.city} onChange={e => setForm(p => ({...p, city: e.target.value}))} />
                  </div>
                  <div>
                    <Label>PIN Code</Label>
                    <Input value={form.pincode} onChange={e => setForm(p => ({...p, pincode: e.target.value}))} maxLength={6} />
                  </div>
                  <div className="col-span-2">
                    <Label>Address</Label>
                    <Input value={form.address} onChange={e => setForm(p => ({...p, address: e.target.value}))} />
                  </div>
                  <div>
                    <Label>Last Donation Date</Label>
                    <Input type="date" value={form.lastDonationDate} onChange={e => setForm(p => ({...p, lastDonationDate: e.target.value}))} />
                  </div>
                  <div>
                    <Label>Preferred Channel</Label>
                    <select value={form.preferredChannel} onChange={e => setForm(p => ({...p, preferredChannel: e.target.value}))}
                      className="w-full mt-1 rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                      {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <Label>Health Notes</Label>
                    <Textarea value={form.healthNotes} onChange={e => setForm(p => ({...p, healthNotes: e.target.value}))}
                      placeholder="Any relevant health conditions, deferral reasons, etc." rows={2} />
                  </div>
                  <div className="col-span-2 flex items-center gap-3">
                    <input type="checkbox" id="notif" checked={form.notificationConsent}
                      onChange={e => setForm(p => ({...p, notificationConsent: e.target.checked}))}
                      className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
                    <Label htmlFor="notif" className="cursor-pointer">
                      Donor consents to receive blood need notifications
                    </Label>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={saveDonor} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    {editDonor ? "Save Changes" : "Register Donor"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL: AI Communication
      ════════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showComm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">

              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-red-600 to-rose-600 rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">AI Donor Alert</h2>
                    <p className="text-red-100 text-xs">Draft and send blood need alerts to eligible donors</p>
                  </div>
                </div>
                <button onClick={() => setShowComm(false)} className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center hover:bg-white/30 text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 space-y-5">

                {/* Step indicator */}
                <div className="flex items-center gap-2">
                  {[["compose","1. Compose"],["preview","2. Preview & Select"],["sent","3. Sent"]].map(([step, label]) => (
                    <div key={step} className={`flex items-center gap-1.5 text-xs font-semibold ${commStep === step ? "text-red-600" : "text-slate-400"}`}>
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${commStep === step ? "bg-red-600 text-white" : commStep === "sent" && step !== "sent" ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>
                        {commStep === "sent" && step !== "sent" ? "✓" : step === "compose" ? "1" : step === "preview" ? "2" : "3"}
                      </div>
                      {label}
                      {step !== "sent" && <ChevronRight className="h-3 w-3 text-slate-300" />}
                    </div>
                  ))}
                </div>

                {/* ── COMPOSE STEP ── */}
                {commStep === "compose" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <Label>Blood Group Needed</Label>
                        <select value={commGroup} onChange={e => setCommGroup(e.target.value)}
                          className="w-full mt-1 rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                          {BLOOD_GROUPS.map(g => <option key={g}>{g}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label>Component</Label>
                        <select value={commComponent} onChange={e => setCommComponent(e.target.value)}
                          className="w-full mt-1 rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                          {COMPONENTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label>Units Needed</Label>
                        <Input type="number" min={1} value={commUnits} onChange={e => setCommUnits(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label>Urgency</Label>
                        <select value={commUrgency} onChange={e => setCommUrgency(e.target.value)}
                          className="w-full mt-1 rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                          {URGENCY_OPTS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {CHANNELS.map(c => (
                        <button key={c.value} onClick={() => setCommChannel(c.value)}
                          className={`flex items-center justify-center gap-2 rounded-xl border-2 p-3 text-sm font-semibold transition-all ${
                            commChannel === c.value ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 hover:border-slate-300 text-slate-600"}`}>
                          <span className="text-lg">{c.icon}</span> {c.label}
                        </button>
                      ))}
                    </div>

                    <div>
                      <Label>Additional Context (optional)</Label>
                      <Textarea value={commContext} onChange={e => setCommContext(e.target.value)}
                        placeholder="e.g. 'Emergency surgery patient in OT-3', 'Thalassemia patient on monthly transfusion'…"
                        rows={2} />
                    </div>

                    {/* Eligible donors preview */}
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                      <p className="text-xs font-bold text-emerald-800 mb-1">
                        {eligibleForComm.length} eligible donor{eligibleForComm.length !== 1 ? "s" : ""} match {commGroup} (compatible groups included)
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {eligibleForComm.slice(0, 12).map(d => (
                          <span key={d.id} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${groupColor[d.blood_group]}`}>
                            {d.blood_group} · {d.name.split(" ")[0]}
                          </span>
                        ))}
                        {eligibleForComm.length > 12 && <span className="text-[10px] text-emerald-600 font-medium">+{eligibleForComm.length - 12} more</span>}
                      </div>
                    </div>

                    {/* AI draft */}
                    {aiDraft && (
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-blue-800 flex items-center gap-1"><Bot className="h-3.5 w-3.5" /> AI Draft — edit as needed</p>
                          <button onClick={() => { setAiDraft(null); setEditedBody(""); }} className="text-[10px] text-blue-500 hover:text-blue-700">Clear</button>
                        </div>
                        {aiDraft.subject && (
                          <div>
                            <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wide">Subject</p>
                            <p className="text-sm text-blue-900 font-medium">{aiDraft.subject}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wide mb-1">Message (editable)</p>
                          <Textarea value={editedBody} onChange={e => setEditedBody(e.target.value)} rows={6}
                            className="text-sm bg-white border-blue-200 focus:ring-blue-400" />
                        </div>
                        {aiDraft.summary && (
                          <p className="text-[11px] text-blue-600 italic">{aiDraft.summary}</p>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1 gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
                        onClick={draftMessage} disabled={drafting}>
                        {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                        {aiDraft ? "Re-draft with AI" : "Draft Message with AI"}
                      </Button>
                      {editedBody && (
                        <Button className="flex-1 gap-2 bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => setCommStep("preview")}>
                          Preview & Send <ChevronRight className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* ── PREVIEW STEP ── */}
                {commStep === "preview" && (
                  <div className="space-y-4">
                    {/* Message preview */}
                    <div className="rounded-xl border-2 border-slate-200 p-4 bg-slate-50">
                      {aiDraft?.subject && <p className="text-xs font-bold text-slate-500 mb-1">SUBJECT: {aiDraft.subject}</p>}
                      <pre className="text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">{editedBody}</pre>
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">via</span>
                        <span className="text-xs font-semibold text-slate-600">{CHANNELS.find(c => c.value === commChannel)?.icon} {CHANNELS.find(c => c.value === commChannel)?.label}</span>
                        <span className="text-[10px] text-slate-400">·</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${URGENCY_OPTS.find(u => u.value === commUrgency)?.color}`}>{commUrgency}</span>
                      </div>
                    </div>

                    {/* Donor selection */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-bold text-slate-700">
                          Select Recipients ({selectedDonors.length} of {eligibleForComm.length})
                        </p>
                        <div className="flex gap-2">
                          <button onClick={() => setSelectedDonors(eligibleForComm.map(d => d.id))}
                            className="text-xs text-blue-600 hover:underline">Select all</button>
                          <button onClick={() => setSelectedDonors([])}
                            className="text-xs text-slate-500 hover:underline">Clear</button>
                        </div>
                      </div>
                      <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                        {eligibleForComm.map(d => (
                          <label key={d.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                            <input type="checkbox" checked={selectedDonors.includes(d.id)}
                              onChange={e => setSelectedDonors(prev => e.target.checked ? [...prev, d.id] : prev.filter(x => x !== d.id))}
                              className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
                            <span className={`h-7 w-7 rounded-full text-white text-[10px] font-extrabold flex items-center justify-center shrink-0 ${groupColor[d.blood_group]}`}>
                              {d.blood_group}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{d.name}</p>
                              <p className="text-[10px] text-slate-400">
                                {commChannel === "whatsapp" ? (d.whatsapp || d.phone || "No WhatsApp")
                                 : commChannel === "sms" ? (d.phone || "No phone")
                                 : (d.email || "No email")}
                              </p>
                            </div>
                            <span className="text-[10px] text-slate-400">{d.total_donations} donations</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setCommStep("compose")} className="flex-1">← Back</Button>
                      <Button className="flex-1 gap-2 bg-red-600 hover:bg-red-700 text-white" onClick={sendComm} disabled={sending || !selectedDonors.length}>
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Send to {selectedDonors.length} Donor{selectedDonors.length !== 1 ? "s" : ""}
                      </Button>
                    </div>
                  </div>
                )}

                {/* ── SENT STEP ── */}
                {commStep === "sent" && sentResult && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 text-center py-4">
                    <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Alert Dispatched!</h3>
                      <p className="text-slate-500 text-sm mt-1">
                        Message sent to <strong>{sentResult.totalDonors}</strong> donor{sentResult.totalDonors !== 1 ? "s" : ""} via <strong>{sentResult.channel}</strong>
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border p-4 text-left space-y-2 max-h-48 overflow-y-auto">
                      {sentResult.donors?.map((d: any) => (
                        <div key={d.id} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <span className="font-medium text-slate-700">{d.name}</span>
                          <span className="text-slate-400 text-xs">{d.contact || "—"}</span>
                        </div>
                      ))}
                    </div>
                    <Button className="w-full" variant="outline" onClick={() => { setShowComm(false); setCommStep("compose"); setSentResult(null); }}>
                      Close
                    </Button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL: Communication History
      ════════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showHistory && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between p-5 border-b">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <History className="h-5 w-5 text-violet-600" /> Communication History
                </h2>
                <button onClick={() => setShowHistory(false)} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-slate-100">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-5 space-y-3">
                {commHistory.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p>No communications sent yet</p>
                  </div>
                ) : commHistory.map(c => (
                  <div key={c.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {c.blood_group_needed && (
                            <span className={`h-6 w-8 rounded flex items-center justify-center text-white text-[10px] font-extrabold ${groupColor[c.blood_group_needed] || "bg-slate-500"}`}>
                              {c.blood_group_needed}
                            </span>
                          )}
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${URGENCY_OPTS.find(u => u.value === c.urgency)?.color || ""}`}>
                            {c.urgency}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {CHANNELS.find(ch => ch.value === c.channel)?.icon} {c.channel}
                          </span>
                        </div>
                        {c.message_subject && <p className="text-sm font-semibold text-slate-800 mt-1">{c.message_subject}</p>}
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{c.message_body}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-slate-700">{c.sent_count} sent</p>
                        <p className="text-[10px] text-emerald-600">{c.responded_count} responded</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      By {c.created_by || "—"} · {c.sent_at ? new Date(c.sent_at).toLocaleString("en-IN", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }) : "—"}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL: Record Donation
      ════════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showDonation && donationTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Syringe className="h-4 w-4 text-red-600" /> Record Donation
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {donationTarget.name} · <span className={`font-bold ${groupColor[donationTarget.blood_group]} text-white px-1.5 rounded text-xs`}>{donationTarget.blood_group}</span>
                  </p>
                </div>
                <button onClick={() => { setShowDonation(false); setDonationTarget(null); }} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-slate-100">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Donation Date</Label>
                    <Input type="date" value={donForm.donationDate} onChange={e => setDonForm(p => ({...p, donationDate: e.target.value}))} />
                  </div>
                  <div>
                    <Label>Component</Label>
                    <select value={donForm.component} onChange={e => setDonForm(p => ({...p, component: e.target.value}))}
                      className="w-full mt-1 rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                      {COMPONENTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Bag Number</Label>
                    <Input value={donForm.bagNumber} onChange={e => setDonForm(p => ({...p, bagNumber: e.target.value}))} placeholder="BAG-0001" />
                  </div>
                  <div>
                    <Label>Hb Level (g/dL)</Label>
                    <Input type="number" step="0.1" value={donForm.hbLevel} onChange={e => setDonForm(p => ({...p, hbLevel: e.target.value}))} placeholder="12.5" />
                  </div>
                  <div>
                    <Label>Blood Pressure</Label>
                    <Input value={donForm.bloodPressure} onChange={e => setDonForm(p => ({...p, bloodPressure: e.target.value}))} placeholder="120/80" />
                  </div>
                  <div>
                    <Label>Pulse (bpm)</Label>
                    <Input type="number" value={donForm.pulse} onChange={e => setDonForm(p => ({...p, pulse: e.target.value}))} placeholder="72" />
                  </div>
                  <div>
                    <Label>Weight (kg)</Label>
                    <Input type="number" step="0.1" value={donForm.weight} onChange={e => setDonForm(p => ({...p, weight: e.target.value}))} />
                  </div>
                  <div>
                    <Label>Camp / Location</Label>
                    <Input value={donForm.campLocation} onChange={e => setDonForm(p => ({...p, campLocation: e.target.value}))} placeholder="Blood Bank OPD" />
                  </div>
                  <div className="col-span-2 flex items-center gap-3">
                    <input type="checkbox" id="screen" checked={donForm.screeningPassed}
                      onChange={e => setDonForm(p => ({...p, screeningPassed: e.target.checked}))}
                      className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
                    <Label htmlFor="screen" className="cursor-pointer text-emerald-700 font-semibold">Screening passed — safe to collect</Label>
                  </div>
                  <div className="col-span-2">
                    <Label>Notes / Adverse Reactions</Label>
                    <Textarea value={donForm.notes} onChange={e => setDonForm(p => ({...p, notes: e.target.value}))} rows={2} placeholder="Any observations…" />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => { setShowDonation(false); setDonationTarget(null); }}>Cancel</Button>
                  <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-1.5" onClick={recordDonation} disabled={donSaving}>
                    {donSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Syringe className="h-4 w-4" />}
                    Record Donation
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </DeptStaffLayout>
  );
}

export default BloodBankDonorsPage;
