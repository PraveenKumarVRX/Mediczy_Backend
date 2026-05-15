import { useEffect, useMemo, useState } from "react";
import {
  Activity, BarChart3, CheckCircle2, Clock3, Hash, History, Layers,
  MonitorCheck, Plus, Printer, QrCode, RefreshCw, Search, UserPlus, Users,
} from "lucide-react";
import DeptStaffLayout from "@/components/hosp-dept/DeptStaffLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { queueNav } from "@/pages/dept/DepartmentDashboards";

type QueueStatus = "waiting" | "called" | "serving" | "completed" | "skipped";
type VisitType = "General OPD" | "Follow-up" | "Lab" | "Billing" | "Emergency";

type Patient = {
  id: string;
  mrn: string;
  name: string;
  phone: string;
  age: string;
  gender: string;
  createdAt: string;
};

type Ticket = {
  id: string;
  token: string;
  patientId: string;
  visitType: VisitType;
  counter: string;
  priority: "Normal" | "Senior" | "Emergency";
  source: "frontdesk" | "kiosk";
  status: QueueStatus;
  createdAt: string;
  calledAt?: string;
  completedAt?: string;
};

type QueueState = {
  patients: Patient[];
  tickets: Ticket[];
};

const STORAGE_KEY = "queueExperienceState";
const counters = ["Counter 1", "Counter 2", "Counter 3", "Triage"];
const visitTypes: VisitType[] = ["General OPD", "Follow-up", "Lab", "Billing", "Emergency"];

const seedState = (): QueueState => ({
  patients: [
    { id: "p1", mrn: "MRN-1001", name: "Asha Patel", phone: "9876543210", age: "34", gender: "Female", createdAt: new Date().toISOString() },
    { id: "p2", mrn: "MRN-1002", name: "Rohan Mehta", phone: "9876501234", age: "62", gender: "Male", createdAt: new Date().toISOString() },
  ],
  tickets: [
    { id: "t1", token: "A-001", patientId: "p1", visitType: "General OPD", counter: "Counter 1", priority: "Normal", source: "frontdesk", status: "waiting", createdAt: new Date(Date.now() - 18 * 60000).toISOString() },
    { id: "t2", token: "A-002", patientId: "p2", visitType: "Follow-up", counter: "Counter 2", priority: "Senior", source: "kiosk", status: "called", createdAt: new Date(Date.now() - 10 * 60000).toISOString(), calledAt: new Date(Date.now() - 2 * 60000).toISOString() },
  ],
});

const readState = (): QueueState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : seedState();
  } catch {
    return seedState();
  }
};

const useQueueState = () => {
  const [state, setState] = useState<QueueState>(() => readState());
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), [state]);
  return [state, setState] as const;
};

const patientName = (state: QueueState, patientId: string) =>
  state.patients.find((patient) => patient.id === patientId)?.name ?? "Unknown patient";

const nextToken = (tickets: Ticket[]) => {
  const today = new Date().toDateString();
  const count = tickets.filter((ticket) => new Date(ticket.createdAt).toDateString() === today).length + 1;
  return `A-${String(count).padStart(3, "0")}`;
};

const waitMinutes = (ticket: Ticket) =>
  Math.max(0, Math.round((Date.now() - new Date(ticket.createdAt).getTime()) / 60000));

const statusTone: Record<QueueStatus, string> = {
  waiting: "bg-amber-100 text-amber-700",
  called: "bg-blue-100 text-blue-700",
  serving: "bg-emerald-100 text-emerald-700",
  completed: "bg-slate-100 text-slate-700",
  skipped: "bg-rose-100 text-rose-700",
};

const QueueShell = ({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) => (
  <DeptStaffLayout
    deptKey="queue"
    deptName="Queue Management"
    badgeLabel="QUEUE"
    loginPath="/queue/login"
    DeptIcon={Activity}
    navSections={queueNav}
    title={title}
    subtitle={subtitle}
  >
    {children}
  </DeptStaffLayout>
);

const SummaryCards = ({ state }: { state: QueueState }) => {
  const active = state.tickets.filter((ticket) => ["waiting", "called", "serving"].includes(ticket.status));
  const completed = state.tickets.filter((ticket) => ticket.status === "completed").length;
  const avgWait = active.length ? Math.round(active.reduce((sum, ticket) => sum + waitMinutes(ticket), 0) / active.length) : 0;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: "Active Tokens", value: active.length, icon: Hash },
        { label: "Serving Now", value: state.tickets.filter((ticket) => ticket.status === "serving").length, icon: MonitorCheck },
        { label: "Avg Wait", value: `${avgWait} min`, icon: Clock3 },
        { label: "Completed Today", value: completed, icon: CheckCircle2 },
      ].map(({ label, value, icon: Icon }) => (
        <Card key={label}>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
              <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950">
              <Icon className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

const RegistrationPanel = ({
  state,
  setState,
  source = "frontdesk",
}: {
  state: QueueState;
  setState: React.Dispatch<React.SetStateAction<QueueState>>;
  source?: "frontdesk" | "kiosk";
}) => {
  const [form, setForm] = useState({ name: "", phone: "", age: "", gender: "Female", visitType: "General OPD" as VisitType, priority: "Normal" as Ticket["priority"] });

  const register = () => {
    if (!form.name.trim() || !form.phone.trim()) return;
    const patient: Patient = {
      id: crypto.randomUUID(),
      mrn: `MRN-${1000 + state.patients.length + 1}`,
      name: form.name.trim(),
      phone: form.phone.trim(),
      age: form.age.trim(),
      gender: form.gender,
      createdAt: new Date().toISOString(),
    };
    const ticket: Ticket = {
      id: crypto.randomUUID(),
      token: nextToken(state.tickets),
      patientId: patient.id,
      visitType: form.visitType,
      counter: form.visitType === "Emergency" ? "Triage" : "Counter 1",
      priority: form.visitType === "Emergency" ? "Emergency" : form.priority,
      source,
      status: "waiting",
      createdAt: new Date().toISOString(),
    };
    setState((current) => ({ patients: [patient, ...current.patients], tickets: [ticket, ...current.tickets] }));
    setForm({ name: "", phone: "", age: "", gender: "Female", visitType: "General OPD", priority: "Normal" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4 text-teal-600" />
          Patient Registration
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <Input placeholder="Patient name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <Input placeholder="Mobile number" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <Input placeholder="Age" value={form.age} onChange={(event) => setForm({ ...form, age: event.target.value })} />
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}>
          <option>Female</option>
          <option>Male</option>
          <option>Other</option>
        </select>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.visitType} onChange={(event) => setForm({ ...form, visitType: event.target.value as VisitType })}>
          {visitTypes.map((type) => <option key={type}>{type}</option>)}
        </select>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Ticket["priority"] })}>
          <option>Normal</option>
          <option>Senior</option>
          <option>Emergency</option>
        </select>
        <div className="md:col-span-2 flex justify-end">
          <Button onClick={register}>
            <Plus className="mr-2 h-4 w-4" />
            Register and Issue Token
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export const QueueDashboardPage = () => {
  const [state, setState] = useQueueState();
  const activeTickets = state.tickets.filter((ticket) => ["waiting", "called", "serving"].includes(ticket.status));

  const updateTicket = (id: string, status: QueueStatus) => {
    setState((current) => ({
      ...current,
      tickets: current.tickets.map((ticket) =>
        ticket.id === id
          ? {
              ...ticket,
              status,
              calledAt: status === "called" ? new Date().toISOString() : ticket.calledAt,
              completedAt: status === "completed" ? new Date().toISOString() : ticket.completedAt,
            }
          : ticket
      ),
    }));
  };

  return (
    <QueueShell title="Dashboard" subtitle="Live patient flow, registration, and service control">
      <div className="space-y-6">
        <SummaryCards state={state} />
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <RegistrationPanel state={state} setState={setState} />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-teal-600" />
                Live Queue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeTickets.map((ticket) => (
                <div key={ticket.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-16 rounded-md bg-slate-900 px-3 py-2 text-center font-bold text-white">{ticket.token}</div>
                    <div>
                      <p className="font-semibold">{patientName(state, ticket.patientId)}</p>
                      <p className="text-xs text-slate-500">{ticket.visitType} · {ticket.counter} · {waitMinutes(ticket)} min wait</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusTone[ticket.status]}>{ticket.status}</Badge>
                    {ticket.status === "waiting" && <Button size="sm" onClick={() => updateTicket(ticket.id, "called")}>Call</Button>}
                    {ticket.status === "called" && <Button size="sm" onClick={() => updateTicket(ticket.id, "serving")}>Start</Button>}
                    {ticket.status === "serving" && <Button size="sm" onClick={() => updateTicket(ticket.id, "completed")}>Complete</Button>}
                  </div>
                </div>
              ))}
              {!activeTickets.length && <p className="text-sm text-slate-500">No active patients in queue.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </QueueShell>
  );
};

export const QueueTokensPage = () => {
  const [state, setState] = useQueueState();
  const [query, setQuery] = useState("");
  const filtered = state.tickets.filter((ticket) =>
    `${ticket.token} ${patientName(state, ticket.patientId)} ${ticket.visitType}`.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <QueueShell title="Tokens" subtitle="Issue, search, and track every patient token">
      <div className="space-y-6">
        <RegistrationPanel state={state} setState={setState} />
        <Card>
          <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-base">Token Registry</CardTitle>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input className="pl-9" placeholder="Search token or patient" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {filtered.map((ticket) => (
              <div key={ticket.id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[90px_1fr_140px_120px_100px] md:items-center">
                <p className="font-bold">{ticket.token}</p>
                <div>
                  <p className="font-medium">{patientName(state, ticket.patientId)}</p>
                  <p className="text-xs text-slate-500">{ticket.visitType} · {ticket.source}</p>
                </div>
                <p className="text-sm">{ticket.counter}</p>
                <Badge className={statusTone[ticket.status]}>{ticket.status}</Badge>
                <Button variant="outline" size="sm">
                  <Printer className="mr-2 h-4 w-4" />
                  Print
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </QueueShell>
  );
};

export const QueueCountersPage = () => {
  const [state, setState] = useQueueState();
  const waiting = state.tickets.filter((ticket) => ticket.status === "waiting");
  const assignNext = (counter: string) => {
    const next = waiting[0];
    if (!next) return;
    setState((current) => ({
      ...current,
      tickets: current.tickets.map((ticket) =>
        ticket.id === next.id ? { ...ticket, counter, status: "called", calledAt: new Date().toISOString() } : ticket
      ),
    }));
  };
  return (
    <QueueShell title="Counters" subtitle="Balance load across service points">
      <div className="grid gap-4 lg:grid-cols-2">
        {counters.map((counter) => {
          const tickets = state.tickets.filter((ticket) => ticket.counter === counter && ["called", "serving"].includes(ticket.status));
          return (
            <Card key={counter}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">{counter}</CardTitle>
                <Button size="sm" onClick={() => assignNext(counter)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Call Next
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {tickets.map((ticket) => (
                  <div key={ticket.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-semibold">{ticket.token} · {patientName(state, ticket.patientId)}</p>
                      <p className="text-xs text-slate-500">{ticket.visitType}</p>
                    </div>
                    <Badge className={statusTone[ticket.status]}>{ticket.status}</Badge>
                  </div>
                ))}
                {!tickets.length && <p className="text-sm text-slate-500">No patient assigned.</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </QueueShell>
  );
};

export const QueueHistoryPage = () => {
  const [state] = useQueueState();
  const history = state.tickets.filter((ticket) => ["completed", "skipped"].includes(ticket.status));
  return (
    <QueueShell title="History" subtitle="Completed and skipped patient visits">
      <Card>
        <CardHeader><CardTitle className="text-base">Visit History</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {history.map((ticket) => (
            <div key={ticket.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-semibold">{ticket.token} · {patientName(state, ticket.patientId)}</p>
                <p className="text-xs text-slate-500">{ticket.visitType}</p>
              </div>
              <Badge className={statusTone[ticket.status]}>{ticket.status}</Badge>
            </div>
          ))}
          {!history.length && <p className="text-sm text-slate-500">No completed visits yet.</p>}
        </CardContent>
      </Card>
    </QueueShell>
  );
};

export const QueueReportsPage = () => {
  const [state] = useQueueState();
  const bySource = useMemo(() => ({
    kiosk: state.tickets.filter((ticket) => ticket.source === "kiosk").length,
    frontdesk: state.tickets.filter((ticket) => ticket.source === "frontdesk").length,
  }), [state]);
  return (
    <QueueShell title="Reports" subtitle="Operational insights for faster patient flow">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Registered Patients", value: state.patients.length, icon: Users },
          { label: "Kiosk Registrations", value: bySource.kiosk, icon: QrCode },
          { label: "Front Desk Tokens", value: bySource.frontdesk, icon: BarChart3 },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs uppercase text-slate-500">{label}</p>
                <p className="mt-1 text-3xl font-bold">{value}</p>
              </div>
              <Icon className="h-6 w-6 text-teal-600" />
            </CardContent>
          </Card>
        ))}
      </div>
    </QueueShell>
  );
};

export const QueueKioskPage = () => {
  const [state, setState] = useQueueState();
  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-xl bg-slate-900 p-6 text-white">
          <p className="text-sm text-teal-200">Self Registration Kiosk</p>
          <h1 className="mt-1 text-3xl font-bold">Patient Check-in</h1>
          <p className="mt-2 text-sm text-slate-300">Register, receive a token, and proceed to the waiting area.</p>
        </div>
        <RegistrationPanel state={state} setState={setState} source="kiosk" />
        <Card>
          <CardHeader><CardTitle className="text-base">Now Serving</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {counters.map((counter) => {
              const current = state.tickets.find((ticket) => ticket.counter === counter && ["called", "serving"].includes(ticket.status));
              return (
                <div key={counter} className="rounded-lg border bg-white p-4 text-center">
                  <p className="text-xs uppercase text-slate-500">{counter}</p>
                  <p className="mt-2 text-3xl font-bold">{current?.token ?? "--"}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
