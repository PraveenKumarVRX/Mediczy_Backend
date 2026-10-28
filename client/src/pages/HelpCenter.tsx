import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import {
  HelpCircle, Plus, Clock, CheckCircle, AlertCircle, XCircle,
  MessageSquare, RefreshCw, ChevronRight, Tag, Send, Ticket,
  Loader2, Search,
} from "lucide-react";
import api from "@/utils/api";

interface SupportTicket {
  id: number;
  ticketNumber?: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  messages?: { content: string; sender: { type: string; name: string }; sentAt: string }[];
}

const STATUS_CFG: Record<string, { label: string; color: string; icon: any }> = {
  open:        { label: "Open",        color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",    icon: AlertCircle  },
  "in-progress":{ label: "In Progress", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", icon: Clock        },
  resolved:    { label: "Resolved",    color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",  icon: CheckCircle  },
  closed:      { label: "Closed",      color: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",    icon: XCircle      },
};

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  low:      { label: "Low",      color: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400" },
  medium:   { label: "Medium",   color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  high:     { label: "High",     color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  critical: { label: "Critical", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const CATEGORIES = [
  { value: "billing",       label: "Billing & Payments" },
  { value: "appointment",   label: "Appointments" },
  { value: "technical",     label: "Technical Issue" },
  { value: "insurance",     label: "Insurance / Claims" },
  { value: "prescription",  label: "Prescription" },
  { value: "lab",           label: "Lab Reports" },
  { value: "account",       label: "Account & Profile" },
  { value: "general",       label: "General Enquiry" },
];

const FAQ_ITEMS = [
  { q: "How do I reschedule an appointment?", a: "Go to My Appointments, click on the appointment, and choose Reschedule. You can reschedule up to 2 hours before the appointment time." },
  { q: "How do I download my medical reports?", a: "Visit My Reports section, select the report, and click the Download button. Reports are available as PDF." },
  { q: "How do I raise an insurance claim?", a: "Open Insurance & Benefits → File a Claim. Claim filing requires an eligible active employer plan. Select the member and claim type, enter provider, amount and treatment date, and attach supporting documents. If filing is unavailable, raise an Insurance / Claims support ticket. Processing time depends on your plan and document review." },
  { q: "How do I change my registered mobile number?", a: "Go to Profile → Personal Information → Edit. Enter OTP sent to the new number to verify the change." },
  { q: "How do I cancel my membership?", a: "Go to My Plans and click Cancel Membership. Refunds are processed as per the cancellation policy." },
  { q: "My video consultation is not connecting. What do I do?", a: "Check your internet connection and allow browser camera/microphone permissions. Use Chrome or Firefox for best results. Contact support if the issue persists." },
];

const HelpCenter = () => {
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const [tab, setTab] = useState("new");

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [form, setForm] = useState({
    title: "", description: "", category: "general", priority: "medium",
  });
  const [submitting, setSubmitting] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const loadTickets = async () => {
    if (!currentUser) return;
    setLoadingTickets(true);
    try {
      const u = currentUser as any;
      const res = await api.get(`/tickets?requester=${encodeURIComponent(u.email)}&limit=50`);
      const data = res.data;
      setTickets(Array.isArray(data) ? data : (data.tickets || data.data || []));
    } catch { /* silent */ }
    finally { setLoadingTickets(false); }
  };

  useEffect(() => {
    if (tab === "my-tickets") loadTickets();
  }, [tab]);

  const handleSubmit = async () => {
    if (!form.title || !form.description) {
      toast({ title: "Title and description are required", variant: "destructive" }); return;
    }
    if (!currentUser) return;
    setSubmitting(true);
    const u = currentUser as any;
    try {
      await api.post("/tickets", {
        title: form.title,
        description: form.description,
        category: form.category,
        priority: form.priority,
        requester: {
          name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
          email: u.email,
          role: "User",
          userId: u.id,
        },
        source: "web",
      });
      toast({ title: "Ticket submitted", description: "We'll get back to you within 24 hours." });
      setForm({ title: "", description: "", category: "general", priority: "medium" });
      setTab("my-tickets");
      setTimeout(loadTickets, 500);
    } catch (err: any) {
      toast({ title: "Failed to submit", description: err.response?.data?.message || "Error", variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const filteredTickets = tickets.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="rounded-2xl border border-teal-200/80 bg-gradient-to-r from-teal-50 via-cyan-50 to-blue-50 p-5 md:p-6 mb-6 shadow-sm transition-all duration-300">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-600/10 px-3 py-1 text-xs font-semibold text-teal-700 mb-3">
            <MessageSquare className="h-3.5 w-3.5" />
            Guided Support Desk
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <HelpCircle className="w-6 h-6 text-teal-500" /> Help & Support
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">Raise a service request, monitor ticket progress, and resolve issues faster.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mt-5">
          <div className="rounded-lg border border-teal-200 bg-white/80 px-3 py-2">
            <p className="text-xs font-semibold text-teal-700">Step 1: Submit clearly</p>
            <p className="text-[11px] text-slate-600">Add category, priority, and full context to speed triage.</p>
          </div>
          <div className="rounded-lg border border-teal-200 bg-white/80 px-3 py-2">
            <p className="text-xs font-semibold text-teal-700">Step 2: Track updates</p>
            <p className="text-[11px] text-slate-600">Watch status changes and agent responses in one timeline.</p>
          </div>
          <div className="rounded-lg border border-teal-200 bg-white/80 px-3 py-2">
            <p className="text-xs font-semibold text-teal-700">Step 3: Use smart FAQs</p>
            <p className="text-[11px] text-slate-600">Resolve repeat queries quickly with guided answers.</p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          <TabsTrigger value="new" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:text-teal-600 rounded-lg">
            <Plus className="w-4 h-4 mr-1.5" />New Request
          </TabsTrigger>
          <TabsTrigger value="my-tickets" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:text-teal-600 rounded-lg">
            <Ticket className="w-4 h-4 mr-1.5" />My Tickets
            {tickets.filter(t => t.status === "open" || t.status === "in-progress").length > 0 && (
              <Badge className="ml-1.5 bg-teal-500 text-white text-xs px-1.5 py-0 h-4">
                {tickets.filter(t => t.status === "open" || t.status === "in-progress").length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="faq" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:text-teal-600 rounded-lg">
            <HelpCircle className="w-4 h-4 mr-1.5" />FAQs
          </TabsTrigger>
        </TabsList>

        <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3 mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 transition-all duration-300">
          <div>
            <p className="text-xs font-semibold text-teal-700">Next Best Action</p>
            <p className="text-[11px] text-slate-600">
              {tab === "new"
                ? "Use high priority only for care-blocking issues and include IDs for faster triage."
                : tab === "my-tickets"
                  ? "Open recent tickets and respond to agent updates to avoid resolution delays."
                  : "Check FAQs first for instant answers, then raise a request if needed."}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {tab !== "new" && (
              <Button size="sm" variant="outline" onClick={() => setTab("new")}>
                <Plus className="w-3.5 h-3.5 mr-1" /> New Ticket
              </Button>
            )}
            {tab === "my-tickets" && (
              <Button size="sm" variant="outline" onClick={loadTickets} disabled={loadingTickets}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loadingTickets ? "animate-spin" : ""}`} /> Refresh
              </Button>
            )}
            {tab !== "faq" && (
              <Button size="sm" variant="outline" onClick={() => setTab("faq")}>
                <HelpCircle className="w-3.5 h-3.5 mr-1" /> Browse FAQ
              </Button>
            )}
          </div>
        </div>

        {/* ── New Ticket ── */}
        <TabsContent value="new">
          <Card>
            <CardHeader>
              <CardTitle>Submit a Service Request</CardTitle>
              <CardDescription>Our support team typically responds within 24 hours on business days</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Subject <span className="text-red-500">*</span></Label>
                <Input placeholder="Brief description of your issue" value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low — General query</SelectItem>
                      <SelectItem value="medium">Medium — Needs attention</SelectItem>
                      <SelectItem value="high">High — Urgent</SelectItem>
                      <SelectItem value="critical">Critical — Blocking care</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description <span className="text-red-500">*</span></Label>
                <Textarea
                  placeholder="Describe your issue in detail — include appointment IDs, order numbers, or any relevant information…"
                  rows={5} value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Ticket will be submitted under <span className="font-medium">{(currentUser as any)?.email}</span>
                </p>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</> : <><Send className="w-4 h-4 mr-2" />Submit Request</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── My Tickets ── */}
        <TabsContent value="my-tickets">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input className="pl-9" placeholder="Search tickets…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Button variant="outline" size="icon" onClick={loadTickets} disabled={loadingTickets}>
              <RefreshCw className={`w-4 h-4 ${loadingTickets ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {loadingTickets ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
          ) : filteredTickets.length === 0 ? (
            <Card className="border-dashed border-2 border-slate-200 dark:border-slate-700">
              <CardContent className="py-14 text-center">
                <Ticket className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="font-medium text-slate-500">{search ? "No tickets match your search" : "No tickets yet"}</p>
                {!search && <Button variant="outline" className="mt-4" onClick={() => setTab("new")}><Plus className="w-4 h-4 mr-2" />Raise a Request</Button>}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredTickets.map(t => {
                const sc = STATUS_CFG[t.status] || STATUS_CFG.open;
                const pc = PRIORITY_CFG[t.priority] || PRIORITY_CFG.medium;
                const cat = CATEGORIES.find(c => c.value === t.category)?.label || t.category;
                const isOpen = expandedId === t.id;
                return (
                  <Card key={t.id} className="cursor-pointer hover:border-teal-200 dark:hover:border-teal-800 transition-colors"
                    onClick={() => setExpandedId(isOpen ? null : t.id)}>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge className={`text-xs ${sc.color}`}>
                              <sc.icon className="w-3 h-3 mr-1" />{sc.label}
                            </Badge>
                            <Badge variant="outline" className="text-xs">{cat}</Badge>
                            <Badge className={`text-xs ${pc.color}`}>{pc.label}</Badge>
                          </div>
                          <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{t.title}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {t.ticketNumber && <span className="font-mono mr-2">#{t.ticketNumber}</span>}
                            {new Date(t.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                          </p>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      </div>
                      {isOpen && t.description && (
                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                          <p className="text-sm text-slate-600 dark:text-slate-400">{t.description}</p>
                          {t.messages && t.messages.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs font-medium text-slate-500">Conversation</p>
                              {t.messages.slice(-5).map((m, i) => (
                                <div key={i} className={`text-xs p-2 rounded-lg ${m.sender.type === "agent" ? "bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-800" : "bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"}`}>
                                  <p className="font-medium text-slate-600 dark:text-slate-400 mb-0.5">{m.sender.name} · {new Date(m.sentAt).toLocaleTimeString()}</p>
                                  <p>{m.content}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── FAQ ── */}
        <TabsContent value="faq">
          <Card>
            <CardHeader>
              <CardTitle>Frequently Asked Questions</CardTitle>
              <CardDescription>Quick answers to common questions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-0">
              {FAQ_ITEMS.map((item, i) => (
                <div key={i}>
                  <button
                    className="w-full text-left py-4 flex items-center justify-between gap-3 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                    <span className="font-medium text-sm text-slate-800 dark:text-slate-200">{item.q}</span>
                    <ChevronRight className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${openFaq === i ? "rotate-90" : ""}`} />
                  </button>
                  {openFaq === i && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 pb-4 pl-1 leading-relaxed">{item.a}</p>
                  )}
                  {i < FAQ_ITEMS.length - 1 && <Separator />}
                </div>
              ))}
            </CardContent>
          </Card>
          <p className="text-center text-sm text-slate-400 mt-6">
            Didn't find your answer?{" "}
            <button className="text-teal-600 dark:text-teal-400 font-medium hover:underline" onClick={() => setTab("new")}>
              Raise a support request →
            </button>
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default HelpCenter;
