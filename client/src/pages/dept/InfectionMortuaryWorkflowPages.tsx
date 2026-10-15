import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import api from "@/utils/api";
import DeptStaffLayout from "@/components/hosp-dept/DeptStaffLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, FilePlus, HeartPulse, Loader2, Plus, RefreshCw, ShieldAlert, UserCheck } from "lucide-react";
import { infectionControlNav, mortuaryNav } from "./DepartmentDashboards";

type WorkflowPageProps = { title: string; description: string };

type InfectionCase = {
  id: string;
  case_number: string;
  patient_id?: string | null;
  admission_id?: string | null;
  organism?: string | null;
  source?: string | null;
  status: "open" | "confirmed" | "closed";
  onset_at?: string | null;
  created_at?: string;
  isolation_orders?: Array<{ id: string; status: string; precaution_type: string }>;
};

type MortuaryDeath = {
  id: string;
  death_number: string;
  patient_id?: string | null;
  patient_name?: string | null;
  declared_at?: string;
  status: "declared" | "stored" | "released" | "closed";
  cause_of_death?: string | null;
  legal_hold?: boolean;
  body_id?: string | null;
  body_tag?: string | null;
  body_status?: string | null;
};

const tokenFor = (key: string) => (typeof window === "undefined" ? null : window.localStorage.getItem(key));
const idempotencyKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ui-${Date.now()}-${Math.random().toString(16).slice(2)}`);
const errorMessage = (error: any) => error?.response?.data?.message || error?.message || "Unable to load the workflow data";
const fmt = (value?: string | null) => value ? new Date(value).toLocaleString() : "—";

function StatusBadge({ value }: { value?: string | null }) {
  const variant = value === "confirmed" || value === "stored" ? "success" : value === "closed" || value === "released" ? "secondary" : "outline";
  return <Badge variant={variant as any}>{(value || "unknown").replace(/_/g, " ")}</Badge>;
}

function LiveState({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading live records…</div>;
  if (error) return <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><span>{error}</span><Button size="sm" variant="outline" onClick={onRetry}><RefreshCw className="mr-1 h-4 w-4" />Retry</Button></div>;
  return null;
}

export function InfectionWorkflowPage({ title, description }: WorkflowPageProps) {
  const token = tokenFor("infectionControlToken");
  const [cases, setCases] = useState<InfectionCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ patientId: "", admissionId: "", organism: "", source: "", onsetAt: "" });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const response = await api.get("/infection-control/cases", { headers: { Authorization: `Bearer ${token}` }, skipAuth: true } as any);
      setCases(response.data?.data || []);
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    active: cases.filter((item) => item.status !== "closed").length,
    confirmed: cases.filter((item) => item.status === "confirmed").length,
    isolation: cases.reduce((sum, item) => sum + (item.isolation_orders || []).filter((order) => order.status === "active").length, 0),
  }), [cases]);

  const createCase = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(null);
    try {
      await api.post("/infection-control/cases", {
        ...form,
        patientId: form.patientId || undefined,
        admissionId: form.admissionId || undefined,
        onsetAt: form.onsetAt || undefined,
      }, { headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": idempotencyKey() }, skipAuth: true } as any);
      setForm({ patientId: "", admissionId: "", organism: "", source: "", onsetAt: "" });
      setShowCreate(false); await load();
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const transition = async (item: InfectionCase, action: "confirm" | "close") => {
    const reason = action === "close" ? window.prompt("Reason for closing this infection case") : undefined;
    if (action === "close" && !reason?.trim()) return;
    try {
      await api.post(`/infection-control/cases/${item.id}/${action}`, action === "close" ? { reason } : {}, { headers: { Authorization: `Bearer ${token}` }, skipAuth: true } as any);
      await load();
    } catch (err) { setError(errorMessage(err)); }
  };

  return <DeptStaffLayout deptKey="infection-control" deptName="Infection Control" badgeLabel="INF. CTRL" loginPath="/infection-control/login" DeptIcon={ShieldAlert} navSections={infectionControlNav} title={title} subtitle={description}>
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">Active cases</p><p className="mt-1 text-2xl font-bold">{counts.active}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">Confirmed</p><p className="mt-1 text-2xl font-bold">{counts.confirmed}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">Active isolation orders</p><p className="mt-1 text-2xl font-bold">{counts.isolation}</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>{title}</CardTitle><p className="mt-1 text-sm text-muted-foreground">Live tenant-scoped infection-control records.</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={load}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button><Button size="sm" onClick={() => setShowCreate((value) => !value)}><Plus className="mr-1 h-4 w-4" />New case</Button></div></CardHeader>
        <CardContent className="space-y-4">
          <LiveState loading={loading} error={error} onRetry={load} />
          {showCreate && <form onSubmit={createCase} className="grid gap-3 rounded-lg border bg-slate-50 p-4 md:grid-cols-2">
            <div><Label htmlFor="infection-patient">Patient ID</Label><Input id="infection-patient" value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} /></div>
            <div><Label htmlFor="infection-admission">Admission ID</Label><Input id="infection-admission" value={form.admissionId} onChange={(e) => setForm({ ...form, admissionId: e.target.value })} /></div>
            <div><Label htmlFor="infection-organism">Organism / suspected agent</Label><Input id="infection-organism" value={form.organism} onChange={(e) => setForm({ ...form, organism: e.target.value })} /></div>
            <div><Label htmlFor="infection-source">Source</Label><Input id="infection-source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></div>
            <div><Label htmlFor="infection-onset">Onset date</Label><Input id="infection-onset" type="datetime-local" value={form.onsetAt} onChange={(e) => setForm({ ...form, onsetAt: e.target.value })} /></div>
            <div className="flex items-end"><Button disabled={saving} type="submit">{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FilePlus className="mr-1 h-4 w-4" />}Create case</Button></div>
          </form>}
          {!loading && !error && cases.length === 0 && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No infection cases have been recorded for this organization.</div>}
          {!loading && !error && cases.length > 0 && <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="p-2">Case</th><th className="p-2">Patient / admission</th><th className="p-2">Organism</th><th className="p-2">Status</th><th className="p-2">Created</th><th className="p-2">Actions</th></tr></thead><tbody>{cases.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="p-2 font-medium">{item.case_number}</td><td className="p-2">{item.patient_id || "—"}<span className="block text-xs text-muted-foreground">{item.admission_id || "No admission"}</span></td><td className="p-2">{item.organism || "—"}</td><td className="p-2"><StatusBadge value={item.status} /></td><td className="p-2">{fmt(item.created_at)}</td><td className="p-2"><div className="flex gap-2">{item.status === "open" && <Button size="sm" variant="outline" onClick={() => transition(item, "confirm")}>Confirm</Button>}{item.status !== "closed" && <Button size="sm" variant="outline" onClick={() => transition(item, "close")}>Close</Button>}</div></td></tr>)}</tbody></table></div>}
        </CardContent>
      </Card>
    </div>
  </DeptStaffLayout>;
}

export function MortuaryWorkflowPage({ title, description }: WorkflowPageProps) {
  const token = tokenFor("mortuaryToken");
  const [deaths, setDeaths] = useState<MortuaryDeath[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ patientId: "", patientName: "", causeOfDeath: "" });
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try { const response = await api.get("/mortuary/deaths", { headers: { Authorization: `Bearer ${token}` }, skipAuth: true } as any); setDeaths(response.data?.data || []); }
    catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  const counts = useMemo(() => ({ occupied: deaths.filter((item) => item.status === "stored").length, pending: deaths.filter((item) => item.status !== "released" && item.status !== "closed").length, holds: deaths.filter((item) => item.legal_hold).length }), [deaths]);
  const createDeath = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null);
    try { await api.post("/mortuary/deaths", { patientId: form.patientId || undefined, patientName: form.patientName || undefined, causeOfDeath: form.causeOfDeath || undefined }, { headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": idempotencyKey() }, skipAuth: true } as any); setForm({ patientId: "", patientName: "", causeOfDeath: "" }); setShowCreate(false); await load(); }
    catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };
  return <DeptStaffLayout deptKey="mortuary" deptName="Mortuary" badgeLabel="MORTUARY" loginPath="/mortuary/login" DeptIcon={HeartPulse} navSections={mortuaryNav} title={title} subtitle={description}>
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">Bodies in storage</p><p className="mt-1 text-2xl font-bold">{counts.occupied}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">Pending release</p><p className="mt-1 text-2xl font-bold">{counts.pending}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">Legal holds</p><p className="mt-1 text-2xl font-bold">{counts.holds}</p></CardContent></Card></div>
      <Card><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>{title}</CardTitle><p className="mt-1 text-sm text-muted-foreground">Live, tenant-scoped mortuary register and release queue.</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={load}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button><Button size="sm" onClick={() => setShowCreate((value) => !value)}><Plus className="mr-1 h-4 w-4" />Declare death</Button></div></CardHeader><CardContent className="space-y-4"><LiveState loading={loading} error={error} onRetry={load} />
        {showCreate && <form onSubmit={createDeath} className="grid gap-3 rounded-lg border bg-slate-50 p-4 md:grid-cols-2"><div><Label htmlFor="mortuary-patient">Patient ID</Label><Input id="mortuary-patient" value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} /></div><div><Label htmlFor="mortuary-name">Patient name</Label><Input id="mortuary-name" value={form.patientName} onChange={(e) => setForm({ ...form, patientName: e.target.value })} /></div><div className="md:col-span-2"><Label htmlFor="mortuary-cause">Cause / declaration note</Label><Textarea id="mortuary-cause" value={form.causeOfDeath} onChange={(e) => setForm({ ...form, causeOfDeath: e.target.value })} /></div><div><Button disabled={saving} type="submit">{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FilePlus className="mr-1 h-4 w-4" />}Declare</Button></div></form>}
        {!loading && !error && deaths.length === 0 && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No mortuary deaths have been recorded for this organization.</div>}
        {!loading && !error && deaths.length > 0 && <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="p-2">Death</th><th className="p-2">Patient</th><th className="p-2">Body tag</th><th className="p-2">Status</th><th className="p-2">Declared</th><th className="p-2">Legal hold</th></tr></thead><tbody>{deaths.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="p-2 font-medium">{item.death_number}</td><td className="p-2">{item.patient_name || item.patient_id || "—"}</td><td className="p-2">{item.body_tag || "Not registered"}</td><td className="p-2"><StatusBadge value={item.status} /></td><td className="p-2">{fmt(item.declared_at)}</td><td className="p-2">{item.legal_hold ? <Badge variant="destructive">Held</Badge> : <Badge variant="outline">Clear</Badge>}</td></tr>)}</tbody></table></div>}
      </CardContent></Card>
    </div>
  </DeptStaffLayout>;
}
