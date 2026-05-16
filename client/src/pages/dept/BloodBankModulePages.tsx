import { useEffect, useMemo, useState, type ReactNode } from "react";
import api from "@/utils/api";
import DeptStaffLayout from "@/components/hosp-dept/DeptStaffLayout";
import { bloodBankNav } from "./DepartmentDashboards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Droplets, ArrowRightLeft, Users, BarChart3, AlertTriangle, ClipboardCheck } from "lucide-react";

const groups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("bloodBankToken") || ""}` });

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <DeptStaffLayout deptKey="blood-bank" deptName="Blood Bank" badgeLabel="BLOOD BANK" loginPath="/blood-bank/login" DeptIcon={Droplets} navSections={bloodBankNav} title={title} subtitle="Operational blood bank workflow">
      {children}
    </DeptStaffLayout>
  );
}

export const BloodBankInventory = () => {
  const [units, setUnits] = useState<any[]>([]);
  const [form, setForm] = useState({ unitNumber: "", bloodGroup: "O+", component: "whole_blood", collectedAt: "", expiresAt: "", donorName: "" });
  const load = () => api.get("/blood-bank/inventory", { headers: headers() }).then(r => setUnits(r.data.data || []));
  useEffect(() => { load(); }, []);
  const expiring = units.filter(u => u.status === "available" && new Date(u.expires_at) <= new Date(Date.now() + 7 * 86400000)).length;
  return <Shell title="Inventory">
    <div className="grid gap-4 md:grid-cols-[1fr_360px]">
      <Card><CardHeader><CardTitle>Blood Units</CardTitle></CardHeader><CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">{units.length} total units, {expiring} expiring within 7 days</div>
        <div className="space-y-2">{units.map(u => <div key={u.id} className="flex justify-between rounded border p-3 text-sm"><span>{u.unit_number} · {u.blood_group} · {u.component}</span><span>{u.status} · exp {u.expires_at}</span></div>)}</div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Add Unit</CardTitle></CardHeader><CardContent className="space-y-3">
        <Label>Unit Number</Label><Input value={form.unitNumber} onChange={e => setForm({ ...form, unitNumber: e.target.value })} />
        <Label>Blood Group</Label><Select value={form.bloodGroup} onValueChange={bloodGroup => setForm({ ...form, bloodGroup })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{groups.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select>
        <Label>Collected</Label><Input type="date" value={form.collectedAt} onChange={e => setForm({ ...form, collectedAt: e.target.value })} />
        <Label>Expires</Label><Input type="date" value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} />
        <Button className="w-full" onClick={async () => { await api.post("/blood-bank/inventory", form, { headers: headers() }); setForm({ ...form, unitNumber: "", donorName: "" }); load(); }}>Add Unit</Button>
      </CardContent></Card>
    </div>
  </Shell>;
};

export const BloodBankRequisitions = () => {
  const [items, setItems] = useState<any[]>([]);
  const [crossMatch, setCrossMatch] = useState<any>(null);
  const [form, setForm] = useState({ patientName: "", patientId: "", ward: "", bloodGroup: "O+", unitsRequested: 1, urgency: "routine" });
  const load = () => api.get("/blood-bank/requisitions", { headers: headers() }).then(r => setItems(r.data.data || []));
  useEffect(() => { load(); }, []);
  return <Shell title="Requisitions">
    <div className="grid gap-4 md:grid-cols-[1fr_360px]">
      <Card><CardHeader><CardTitle>Requests</CardTitle></CardHeader><CardContent className="space-y-2">{items.map(r => <div key={r.id} className="flex items-center justify-between rounded border p-3 text-sm"><span>{r.requisition_number} · {r.patient_name} · {r.blood_group} x{r.units_requested}</span><div className="flex items-center gap-2">{r.status === "pending" && <Button size="sm" onClick={async () => { await api.post(`/blood-bank/requisitions/${r.id}/issue`, {}, { headers: headers() }); load(); }}>Issue</Button>}{r.status === "issued" && <Button size="sm" variant="outline" onClick={async () => { await api.post(`/blood-bank/requisitions/${r.id}/return`, {}, { headers: headers() }); load(); }}>Return</Button>}<span className="capitalize">{r.status}</span></div></div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>New Requisition</CardTitle></CardHeader><CardContent className="space-y-3">
        <Label>Patient Name</Label><Input value={form.patientName} onChange={e => setForm({ ...form, patientName: e.target.value })} />
        <Label>Ward</Label><Input value={form.ward} onChange={e => setForm({ ...form, ward: e.target.value })} />
        <Label>Blood Group</Label><Select value={form.bloodGroup} onValueChange={bloodGroup => setForm({ ...form, bloodGroup })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{groups.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select>
        <Button variant="outline" className="w-full" onClick={async () => { const r = await api.post("/blood-bank/cross-match", { bloodGroup: form.bloodGroup, unitsRequested: form.unitsRequested }, { headers: headers() }); setCrossMatch(r.data.data); }}>Check Cross-Match</Button>
        {crossMatch && <div className={`rounded border p-3 text-sm ${crossMatch.compatible ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>{crossMatch.compatible ? `${crossMatch.units.length} compatible units available` : 'Insufficient compatible units available'}</div>}
        <Button className="w-full" onClick={async () => { await api.post("/blood-bank/requisitions", form, { headers: headers() }); setForm({ ...form, patientName: "", ward: "" }); setCrossMatch(null); load(); }}>Create Request</Button>
      </CardContent></Card>
    </div>
  </Shell>;
};

export const BloodBankDonors = () => {
  const [donors, setDonors] = useState<any[]>([]);
  const [form, setForm] = useState({ donorId: "", name: "", bloodGroup: "O+", phone: "" });
  const load = () => api.get("/blood-bank/donors", { headers: headers() }).then(r => setDonors(r.data.data || []));
  useEffect(() => { load(); }, []);
  return <Shell title="Donors">
    <div className="grid gap-4 md:grid-cols-[1fr_360px]">
      <Card><CardHeader><CardTitle>Registered Donors</CardTitle></CardHeader><CardContent className="space-y-2">{donors.map(d => <div key={d.id} className="rounded border p-3 text-sm">{d.donor_id} · {d.name} · {d.blood_group}</div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>Register Donor</CardTitle></CardHeader><CardContent className="space-y-3">
        <Label>Donor ID</Label><Input value={form.donorId} onChange={e => setForm({ ...form, donorId: e.target.value })} />
        <Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Label>Blood Group</Label><Select value={form.bloodGroup} onValueChange={bloodGroup => setForm({ ...form, bloodGroup })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{groups.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select>
        <Button className="w-full" onClick={async () => { await api.post("/blood-bank/donors", form, { headers: headers() }); setForm({ ...form, donorId: "", name: "" }); load(); }}>Register Donor</Button>
      </CardContent></Card>
    </div>
  </Shell>;
};

export const BloodBankReports = () => {
  const [summary, setSummary] = useState<any>(null);
  const [alerts, setAlerts] = useState<any>({ shortages: [], expiring: [] });
  const [audit, setAudit] = useState<any[]>([]);
  useEffect(() => {
    api.get("/blood-bank/summary", { headers: headers() }).then(r => setSummary(r.data.data));
    api.get("/blood-bank/alerts", { headers: headers() }).then(r => setAlerts(r.data.data || { shortages: [], expiring: [] }));
    api.get("/blood-bank/audit", { headers: headers() }).then(r => setAudit(r.data.data || []));
  }, []);
  const byGroup = useMemo(() => summary?.byGroup || [], [summary]);
  return <Shell title="Reports">
    <div className="grid gap-4 md:grid-cols-4">
      {[['Available Units', summary?.available_units], ['Expiring Soon', summary?.expiring_soon], ['Issued Today', summary?.issued_today], ['Pending Requests', summary?.pending_requests]].map(([label, value]) => <Card key={String(label)}><CardHeader><CardTitle className="text-sm">{label}</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{value ?? 0}</CardContent></Card>)}
    </div>
    <Card className="mt-4"><CardHeader><CardTitle>Available by Group</CardTitle></CardHeader><CardContent className="grid gap-2 md:grid-cols-4">{byGroup.map((g: any) => <div key={g.blood_group} className="rounded border p-3">{g.blood_group}: {g.units}</div>)}</CardContent></Card>
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Alerts</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{alerts.shortages.map((a: any) => <div key={a.blood_group} className="rounded border p-2">{a.blood_group}: {a.available_units} units available</div>)}{alerts.expiring.map((a: any) => <div key={a.id} className="rounded border p-2">{a.unit_number} expires {a.expires_at}</div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> Audit Trail</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{audit.slice(0, 6).map((a: any) => <div key={a.id} className="rounded border p-2">{a.event_type} · {a.actor}</div>)}</CardContent></Card>
    </div>
  </Shell>;
};
