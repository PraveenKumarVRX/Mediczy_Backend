import LabLayout from "@/components/lab/LabLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Plus, Search, Filter, Calendar, Clock, Users, TestTube, Microscope,
  CheckCircle, FileText, Package, Receipt, CreditCard, TrendingUp,
  UserCog, Bell, Settings, HelpCircle, ArrowLeft, Edit, Trash2,
  Eye, AlertCircle, Download, Upload, Activity, BarChart3
} from "lucide-react";

type Id = string;

type OrderStatus = "Pending" | "Processing" | "Completed";
type Priority = "Routine" | "Normal" | "Urgent";

type LabOrder = {
  id: Id;
  patientName: string;
  tests: string;
  status: OrderStatus;
  priority: Priority;
  orderedAt: string; // yyyy-mm-dd
};

type LabPatient = {
  uhid: Id;
  name: string;
  age: number;
  gender: "M" | "F" | "O";
  phone?: string;
  lastVisit?: string;
  status: "Active" | "Inactive";
};

type LabAppointment = {
  id: Id;
  patientName: string;
  tests: string;
  date: string; // yyyy-mm-dd
  time: string; // hh:mm
  status: "Scheduled" | "Completed" | "No-show";
};

type SampleStatus = "Pending" | "Collected" | "Processing" | "Completed";
type LabSample = {
  sampleId: Id;
  patientName: string;
  tests: string;
  priority: Priority;
  status: SampleStatus;
  sampleType?: string;
  containerType?: string;
  barcode?: string;
  collectedAt?: string; // iso
};

type ProcessingItem = {
  id: Id;
  sampleId: Id;
  test: string;
  technician: string;
  progress: number; // 0-100
  status: "Processing" | "QC" | "Review";
};

type ResultItem = {
  id: Id;
  sampleId: Id;
  patientName: string;
  test: string;
  value: string;
  unit?: string;
  flag: "Normal" | "Critical";
  enteredAt: string; // iso
};

type ReportItem = {
  id: Id;
  patientName: string;
  tests: string;
  generatedAt: string; // yyyy-mm-dd
  status: "Ready" | "Delivered";
};

type InventoryItem = {
  code: Id;
  name: string;
  category: string;
  stock: number;
  expiry?: string;
};

type BillStatus = "Paid" | "Unpaid";
type BillItem = {
  id: Id;
  patientName: string;
  amount: number;
  status: BillStatus;
  date: string; // yyyy-mm-dd
  notes?: string;
};

type PaymentItem = {
  id: Id;
  billId?: Id;
  patientName: string;
  amount: number;
  method: "Cash" | "Card" | "UPI" | "Insurance";
  status: "Completed" | "Pending";
  date: string; // yyyy-mm-dd
};

type StaffMember = {
  id: Id;
  name: string;
  role: string;
  department: string;
  status: "Active" | "Inactive";
};

type NotificationItem = {
  id: Id;
  title: string;
  description: string;
  level: "Critical" | "Info";
  createdAt: string; // iso
  read: boolean;
};

type LabSettings = {
  labName: string;
  licenseNumber: string;
  defaultPriority: Priority;
  reportFooter: string;
  equipmentNotes: string;
};

const escapeCsvCell = (value: unknown) => {
  const s = String(value ?? "");
  if (/[\n\r,\"]/g.test(s)) return `"${s.replace(/\"/g, '""')}"`;
  return s;
};

const downloadCsv = (filename: string, rows: Array<Record<string, unknown>>) => {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((r) => headers.map((h) => escapeCsvCell((r as any)[h])).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const today = () => new Date().toISOString().slice(0, 10);

const makeId = (prefix: string) => {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${today().replace(/-/g, "")}-${rand}`;
};

const makeBarcode = (sampleId: string) => `LAB-${sampleId.replace(/[^A-Z0-9]/gi, "").slice(-12).toUpperCase()}`;

function useLocalStorageState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }, [key, value]);

  return [value, setValue] as const;
}

interface StatCardProps {
  title: string;
  value: string;
  helper?: string;
}

const StatGrid = ({ items }: { items: StatCardProps[] }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
    {items.map((item) => (
      <Card key={item.title}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">{item.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold text-slate-900">{item.value}</p>
          {item.helper && <p className="text-xs text-muted-foreground mt-1">{item.helper}</p>}
        </CardContent>
      </Card>
    ))}
  </div>
);

const PlaceholderList = ({
  items,
}: {
  items: { label: string; meta?: string; status?: string }[];
}) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Recent Updates</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm text-slate-900">{item.label}</p>
            {item.meta && <p className="text-xs text-muted-foreground">{item.meta}</p>}
          </div>
          {item.status && <Badge variant="outline">{item.status}</Badge>}
        </div>
      ))}
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">No records yet.</p>
      )}
    </CardContent>
  </Card>
);

// Test Orders Page
export const LabOrdersPage = () => {
  const { toast } = useToast();
  const location = useLocation();

  const [orders, setOrders] = useLocalStorageState<LabOrder[]>("lab.orders", [
    {
      id: "ORD-2024-001",
      patientName: "Rajesh Kumar",
      tests: "CBC, Lipid Profile",
      status: "Pending",
      priority: "Normal",
      orderedAt: "2024-12-10",
    },
  ]);

  const [openNew, setOpenNew] = useState(false);
  const [openView, setOpenView] = useState(false);
  const [viewOrder, setViewOrder] = useState<LabOrder | null>(null);
  const [form, setForm] = useState({ patientName: "", tests: "", priority: "Normal" as Priority });

  useEffect(() => {
    if (location.pathname === "/lab/orders/new") setOpenNew(true);
  }, [location.pathname]);

  const stats = useMemo(() => {
    const pending = orders.filter((o) => o.status === "Pending").length;
    const urgent = orders.filter((o) => o.priority === "Urgent").length;
    const todays = orders.filter((o) => o.orderedAt === today()).length;
    return [
      { title: "Pending Orders", value: String(pending), helper: "Awaiting processing" },
      { title: "Today's Orders", value: String(todays), helper: "Created today" },
      { title: "Urgent Orders", value: String(urgent), helper: "High priority" },
      { title: "Total Orders", value: String(orders.length), helper: "All orders" },
    ];
  }, [orders]);

  const createOrder = () => {
    if (!form.patientName.trim() || !form.tests.trim()) {
      toast({ title: "Missing details", description: "Patient and tests are required." });
      return;
    }
    const newOrder: LabOrder = {
      id: makeId("ORD"),
      patientName: form.patientName.trim(),
      tests: form.tests.trim(),
      status: "Pending",
      priority: form.priority,
      orderedAt: today(),
    };
    setOrders((prev) => [newOrder, ...prev]);
    setOpenNew(false);
    setForm({ patientName: "", tests: "", priority: "Normal" });
    toast({ title: "Order created", description: `${newOrder.id} added.` });
  };

  const processOrder = (id: string) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: "Processing" } : o)));
    toast({ title: "Processing started", description: `${id} moved to Processing.` });
  };

  return (
    <LabLayout title="Test Orders" subtitle="Manage laboratory test orders">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Test Orders</h1>
              <p className="text-muted-foreground">Manage laboratory test orders and requests</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => downloadCsv("lab-orders.csv", orders)}
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button className="gap-2" onClick={() => setOpenNew(true)}>
              <Plus className="h-4 w-4" /> New Order
            </Button>
          </div>
        </div>

        <StatGrid items={stats} />

        <Card>
          <CardHeader>
            <CardTitle>Recent Test Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Tests</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ordered</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono">{order.id}</TableCell>
                    <TableCell>{order.patientName}</TableCell>
                    <TableCell>{order.tests}</TableCell>
                    <TableCell>
                      <Badge variant={order.status === "Pending" ? "default" : "outline"}>{order.status}</Badge>
                    </TableCell>
                    <TableCell>{order.orderedAt}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setViewOrder(order);
                            setOpenView(true);
                          }}
                        >
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => processOrder(order.id)}
                          disabled={order.status !== "Pending"}
                        >
                          Process
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Test Order</DialogTitle>
              <DialogDescription>Create a new lab order.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Patient Name *</Label>
                <Input value={form.patientName} onChange={(e) => setForm((p) => ({ ...p, patientName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Tests *</Label>
                <Input value={form.tests} onChange={(e) => setForm((p) => ({ ...p, tests: e.target.value }))} placeholder="e.g. CBC, Lipid Profile" />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v as Priority }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Routine">Routine</SelectItem>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenNew(false)}>Cancel</Button>
              <Button onClick={createOrder}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={openView} onOpenChange={setOpenView}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Order Details</DialogTitle>
            </DialogHeader>
            {viewOrder ? (
              <div className="space-y-2 text-sm">
                <div><span className="text-muted-foreground">Order:</span> <span className="font-mono">{viewOrder.id}</span></div>
                <div><span className="text-muted-foreground">Patient:</span> {viewOrder.patientName}</div>
                <div><span className="text-muted-foreground">Tests:</span> {viewOrder.tests}</div>
                <div><span className="text-muted-foreground">Priority:</span> {viewOrder.priority}</div>
                <div><span className="text-muted-foreground">Status:</span> {viewOrder.status}</div>
                <div><span className="text-muted-foreground">Ordered:</span> {viewOrder.orderedAt}</div>
              </div>
            ) : null}
            <DialogFooter>
              <Button onClick={() => setOpenView(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </LabLayout>
  );
};

// Patients Page
export const LabPatientsPage = () => {
  const { toast } = useToast();
  const location = useLocation();
  const [patients, setPatients] = useLocalStorageState<LabPatient[]>("lab.patients", [
    {
      uhid: "UHID001234",
      name: "Rajesh Kumar",
      age: 45,
      gender: "M",
      lastVisit: "2024-12-10",
      status: "Active",
      phone: "",
    },
  ]);

  const [query, setQuery] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [openView, setOpenView] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [selected, setSelected] = useState<LabPatient | null>(null);

  const [form, setForm] = useState({ name: "", age: "", gender: "M" as LabPatient["gender"], phone: "" });
  const [editForm, setEditForm] = useState({ name: "", age: "", gender: "M" as LabPatient["gender"], phone: "", status: "Active" as LabPatient["status"] });

  useEffect(() => {
    if (location.pathname === "/lab/patients/new") setOpenAdd(true);
  }, [location.pathname]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) =>
      [p.uhid, p.name, p.phone ?? ""].some((x) => String(x).toLowerCase().includes(q))
    );
  }, [patients, query]);

  const stats = useMemo(() => {
    const active = patients.filter((p) => p.status === "Active").length;
    return [
      { title: "Total Patients", value: String(patients.length), helper: "Registered patients" },
      { title: "Active", value: String(active), helper: "Active records" },
      { title: "Filtered", value: String(filtered.length), helper: "Matches search" },
      { title: "Critical Cases", value: "0", helper: "Not configured" },
    ];
  }, [patients.length, filtered.length, patients]);

  const addPatient = () => {
    const age = Number(form.age);
    if (!form.name.trim() || !Number.isFinite(age)) {
      toast({ title: "Missing details", description: "Name and valid age are required." });
      return;
    }
    const newPatient: LabPatient = {
      uhid: makeId("UHID"),
      name: form.name.trim(),
      age,
      gender: form.gender,
      phone: form.phone.trim() || undefined,
      lastVisit: today(),
      status: "Active",
    };
    setPatients((prev) => [newPatient, ...prev]);
    setOpenAdd(false);
    setForm({ name: "", age: "", gender: "M", phone: "" });
    toast({ title: "Patient added", description: `${newPatient.uhid} created.` });
  };

  const openEditFor = (p: LabPatient) => {
    setSelected(p);
    setEditForm({
      name: p.name,
      age: String(p.age),
      gender: p.gender,
      phone: p.phone ?? "",
      status: p.status,
    });
    setOpenEdit(true);
  };

  const saveEdit = () => {
    if (!selected) return;
    const age = Number(editForm.age);
    if (!editForm.name.trim() || !Number.isFinite(age)) {
      toast({ title: "Invalid details", description: "Name and valid age are required." });
      return;
    }
    setPatients((prev) =>
      prev.map((p) =>
        p.uhid === selected.uhid
          ? {
              ...p,
              name: editForm.name.trim(),
              age,
              gender: editForm.gender,
              phone: editForm.phone.trim() || undefined,
              status: editForm.status,
            }
          : p
      )
    );
    setOpenEdit(false);
    toast({ title: "Saved", description: "Patient updated." });
  };

  return (
    <LabLayout title="Patients" subtitle="Patient management and records">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Patients</h1>
              <p className="text-muted-foreground">Manage patient records and information</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search UHID, name, phone" className="w-64" />
            </div>
            <Button variant="outline" className="gap-2" onClick={() => downloadCsv("lab-patients.csv", patients)}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button className="gap-2" onClick={() => setOpenAdd(true)}>
              <Plus className="h-4 w-4" /> Add Patient
            </Button>
          </div>
        </div>

        <StatGrid items={stats} />

        <Card>
          <CardHeader>
            <CardTitle>Patient Directory</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>UHID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Age/Gender</TableHead>
                  <TableHead>Last Visit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.uhid}>
                    <TableCell className="font-mono">{p.uhid}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>
                      {p.age}/{p.gender}
                    </TableCell>
                    <TableCell>{p.lastVisit ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{p.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelected(p);
                            setOpenView(true);
                          }}
                        >
                          View
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openEditFor(p)}>
                          Edit
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={openAdd} onOpenChange={setOpenAdd}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Patient</DialogTitle>
              <DialogDescription>Create a new patient record.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Age *</Label>
                  <Input value={form.age} onChange={(e) => setForm((p) => ({ ...p, age: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select value={form.gender} onValueChange={(v) => setForm((p) => ({ ...p, gender: v as any }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">M</SelectItem>
                      <SelectItem value="F">F</SelectItem>
                      <SelectItem value="O">O</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenAdd(false)}>Cancel</Button>
              <Button onClick={addPatient}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={openView} onOpenChange={setOpenView}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Patient Details</DialogTitle>
            </DialogHeader>
            {selected ? (
              <div className="space-y-2 text-sm">
                <div><span className="text-muted-foreground">UHID:</span> <span className="font-mono">{selected.uhid}</span></div>
                <div><span className="text-muted-foreground">Name:</span> {selected.name}</div>
                <div><span className="text-muted-foreground">Age/Gender:</span> {selected.age}/{selected.gender}</div>
                <div><span className="text-muted-foreground">Phone:</span> {selected.phone || "—"}</div>
                <div><span className="text-muted-foreground">Status:</span> {selected.status}</div>
              </div>
            ) : null}
            <DialogFooter>
              <Button onClick={() => setOpenView(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={openEdit} onOpenChange={setOpenEdit}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Patient</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Age *</Label>
                  <Input value={editForm.age} onChange={(e) => setEditForm((p) => ({ ...p, age: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select value={editForm.gender} onValueChange={(v) => setEditForm((p) => ({ ...p, gender: v as any }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">M</SelectItem>
                      <SelectItem value="F">F</SelectItem>
                      <SelectItem value="O">O</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm((p) => ({ ...p, status: v as any }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenEdit(false)}>Cancel</Button>
              <Button onClick={saveEdit}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </LabLayout>
  );
};

// Appointments Page
export const LabAppointmentsPage = () => {
  const { toast } = useToast();
  const location = useLocation();
  const [appointments, setAppointments] = useLocalStorageState<LabAppointment[]>("lab.appointments", [
    {
      id: "APT-001",
      patientName: "Rajesh Kumar",
      tests: "CBC, Lipid Profile",
      date: "2024-12-10",
      time: "09:00",
      status: "Completed",
    },
  ]);

  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({ patientName: "", tests: "", date: today(), time: "09:00" });

  useEffect(() => {
    if (location.pathname === "/lab/appointments/new") setOpenNew(true);
  }, [location.pathname]);

  const stats = useMemo(() => {
    const todayCount = appointments.filter((a) => a.date === today()).length;
    const completed = appointments.filter((a) => a.status === "Completed").length;
    const pending = appointments.filter((a) => a.status === "Scheduled").length;
    const noShows = appointments.filter((a) => a.status === "No-show").length;
    return [
      { title: "Today's Appointments", value: String(todayCount), helper: "Scheduled today" },
      { title: "Completed", value: String(completed), helper: "Finished" },
      { title: "Pending", value: String(pending), helper: "Remaining" },
      { title: "No-shows", value: String(noShows), helper: "Missed" },
    ];
  }, [appointments]);

  const createAppointment = () => {
    if (!form.patientName.trim() || !form.tests.trim() || !form.date || !form.time) {
      toast({ title: "Missing details", description: "Patient, tests, date and time are required." });
      return;
    }
    const newApt: LabAppointment = {
      id: makeId("APT"),
      patientName: form.patientName.trim(),
      tests: form.tests.trim(),
      date: form.date,
      time: form.time,
      status: "Scheduled",
    };
    setAppointments((prev) => [newApt, ...prev]);
    setOpenNew(false);
    setForm({ patientName: "", tests: "", date: today(), time: "09:00" });
    toast({ title: "Appointment created", description: `${newApt.id} scheduled.` });
  };

  return (
    <LabLayout title="Appointments" subtitle="Schedule and manage lab appointments">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Appointments</h1>
              <p className="text-muted-foreground">Schedule and manage laboratory appointments</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => downloadCsv("lab-appointments.csv", appointments)}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button className="gap-2" onClick={() => setOpenNew(true)}>
              <Plus className="h-4 w-4" /> New Appointment
            </Button>
          </div>
        </div>

        <StatGrid items={stats} />

        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Tests</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.date}</TableCell>
                    <TableCell>{a.time}</TableCell>
                    <TableCell>{a.patientName}</TableCell>
                    <TableCell>{a.tests}</TableCell>
                    <TableCell>
                      <Badge variant={a.status === "Scheduled" ? "default" : "outline"}>{a.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Appointment</DialogTitle>
              <DialogDescription>Schedule a lab appointment.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Patient Name *</Label>
                <Input value={form.patientName} onChange={(e) => setForm((p) => ({ ...p, patientName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Tests *</Label>
                <Input value={form.tests} onChange={(e) => setForm((p) => ({ ...p, tests: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Time *</Label>
                  <Input type="time" value={form.time} onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenNew(false)}>Cancel</Button>
              <Button onClick={createAppointment}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </LabLayout>
  );
};

// Sample Queue Page
export const LabQueuePage = () => {
  const { toast } = useToast();
  const location = useLocation();
  const [samples, setSamples] = useLocalStorageState<LabSample[]>("lab.samples", [
    {
      sampleId: "SAMP-001",
      patientName: "Rajesh Kumar",
      tests: "CBC, Lipid Profile",
      priority: "Normal",
      status: "Pending",
    },
  ]);

  const [openAdd, setOpenAdd] = useState(false);
  const [form, setForm] = useState({ patientName: "", tests: "", priority: "Normal" as Priority });

  useEffect(() => {
    if (location.pathname === "/lab/queue/new") setOpenAdd(true);
  }, [location.pathname]);

  const stats = useMemo(() => {
    const inQueue = samples.filter((s) => s.status === "Pending").length;
    const collected = samples.filter((s) => s.status === "Collected").length;
    const processing = samples.filter((s) => s.status === "Processing").length;
    const completed = samples.filter((s) => s.status === "Completed").length;
    return [
      { title: "In Queue", value: String(inQueue), helper: "Awaiting collection" },
      { title: "Collected", value: String(collected), helper: "Ready for processing" },
      { title: "Processing", value: String(processing), helper: "Currently testing" },
      { title: "Completed", value: String(completed), helper: "Finished" },
    ];
  }, [samples]);

  const addSample = () => {
    if (!form.patientName.trim() || !form.tests.trim()) {
      toast({ title: "Missing details", description: "Patient and tests are required." });
      return;
    }
    const newSample: LabSample = {
      sampleId: makeId("SAMP"),
      patientName: form.patientName.trim(),
      tests: form.tests.trim(),
      priority: form.priority,
      status: "Pending",
    };
    setSamples((prev) => [newSample, ...prev]);
    setOpenAdd(false);
    setForm({ patientName: "", tests: "", priority: "Normal" });
    toast({ title: "Added to queue", description: `${newSample.sampleId} created.` });
  };

  const collectSample = (sampleId: string) => {
    setSamples((prev) =>
      prev.map((s) =>
        s.sampleId === sampleId
          ? {
              ...s,
              status: "Collected",
              collectedAt: s.collectedAt ?? new Date().toISOString(),
              barcode: s.barcode ?? makeBarcode(sampleId),
            }
          : s
      )
    );
    toast({ title: "Sample collected", description: `${sampleId} marked as Collected.` });
  };

  const startProcessing = (sampleId: string) => {
    setSamples((prev) => prev.map((s) => (s.sampleId === sampleId ? { ...s, status: "Processing" } : s)));
    toast({ title: "Processing started", description: `${sampleId} moved to Processing.` });
  };

  const completeSample = (sampleId: string) => {
    setSamples((prev) => prev.map((s) => (s.sampleId === sampleId ? { ...s, status: "Completed" } : s)));
    toast({ title: "Completed", description: `${sampleId} moved to Completed.` });
  };

  const collectionQueue = samples.filter((s) => s.status === "Pending");
  const processingQueue = samples.filter((s) => s.status === "Collected" || s.status === "Processing");
  const completedQueue = samples.filter((s) => s.status === "Completed");

  return (
    <LabLayout title="Sample Queue" subtitle="Manage sample collection and processing queue">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Sample Queue</h1>
              <p className="text-muted-foreground">Manage sample collection and processing workflow</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => downloadCsv("lab-samples.csv", samples)}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button className="gap-2" onClick={() => setOpenAdd(true)}>
              <Plus className="h-4 w-4" /> Add Sample
            </Button>
          </div>
        </div>

        <StatGrid items={stats} />

        <Tabs defaultValue="collection" className="space-y-4">
          <TabsList>
            <TabsTrigger value="collection">Collection Queue</TabsTrigger>
            <TabsTrigger value="processing">Processing</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>

          <TabsContent value="collection" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Sample Collection Queue</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sample ID</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Tests</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {collectionQueue.map((s) => (
                      <TableRow key={s.sampleId}>
                        <TableCell className="font-mono">{s.sampleId}</TableCell>
                        <TableCell>{s.patientName}</TableCell>
                        <TableCell>{s.tests}</TableCell>
                        <TableCell><Badge variant="outline">{s.priority}</Badge></TableCell>
                        <TableCell><Badge>Pending</Badge></TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => collectSample(s.sampleId)}>Collect</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="processing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Processing Queue</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sample ID</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processingQueue.map((s) => (
                      <TableRow key={s.sampleId}>
                        <TableCell className="font-mono">{s.sampleId}</TableCell>
                        <TableCell>{s.patientName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{s.status}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{s.barcode ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => startProcessing(s.sampleId)}
                              disabled={s.status === "Processing"}
                            >
                              Start
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => completeSample(s.sampleId)}>
                              Complete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Completed</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sample ID</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Tests</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedQueue.map((s) => (
                      <TableRow key={s.sampleId}>
                        <TableCell className="font-mono">{s.sampleId}</TableCell>
                        <TableCell>{s.patientName}</TableCell>
                        <TableCell>{s.tests}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              downloadCsv("sample-label.csv", [
                                {
                                  sampleId: s.sampleId,
                                  patient: s.patientName,
                                  tests: s.tests,
                                  barcode: s.barcode ?? "",
                                },
                              ])
                            }
                          >
                            Download Label
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={openAdd} onOpenChange={setOpenAdd}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Sample</DialogTitle>
              <DialogDescription>Add a new sample into the queue.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Patient Name *</Label>
                <Input value={form.patientName} onChange={(e) => setForm((p) => ({ ...p, patientName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Tests *</Label>
                <Input value={form.tests} onChange={(e) => setForm((p) => ({ ...p, tests: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v as Priority }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Routine">Routine</SelectItem>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenAdd(false)}>Cancel</Button>
              <Button onClick={addSample}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </LabLayout>
  );
};

// Sample Collection Page
export const LabSamplesPage = () => {
  const { toast } = useToast();
  const location = useLocation();
  const [samples, setSamples] = useLocalStorageState<LabSample[]>("lab.samples", []);

  const [openCollect, setOpenCollect] = useState(false);
  const [form, setForm] = useState({ patientName: "", tests: "", priority: "Normal" as Priority, sampleType: "blood", containerType: "tube" });
  const [lastCreated, setLastCreated] = useState<LabSample | null>(null);
  const [openBarcode, setOpenBarcode] = useState(false);

  useEffect(() => {
    if (location.pathname === "/lab/samples/new") setOpenCollect(true);
  }, [location.pathname]);

  const counts = useMemo(() => {
    const todayIso = today();
    const collectedToday = samples.filter((s) => (s.collectedAt ?? "").startsWith(todayIso)).length;
    const blood = samples.filter((s) => s.sampleType === "blood").length;
    const urine = samples.filter((s) => s.sampleType === "urine").length;
    return [
      { title: "Samples Today", value: String(collectedToday), helper: "Collected today" },
      { title: "Blood Samples", value: String(blood), helper: "Blood tests" },
      { title: "Urine Samples", value: String(urine), helper: "Urine tests" },
      { title: "Other Samples", value: String(Math.max(0, samples.length - blood - urine)), helper: "Other" },
    ];
  }, [samples]);

  const generateAndCollect = () => {
    if (!form.patientName.trim() || !form.tests.trim()) {
      toast({ title: "Missing details", description: "Patient and tests are required." });
      return;
    }
    const sampleId = makeId("SAMP");
    const created: LabSample = {
      sampleId,
      patientName: form.patientName.trim(),
      tests: form.tests.trim(),
      priority: form.priority,
      status: "Collected",
      sampleType: form.sampleType,
      containerType: form.containerType,
      collectedAt: new Date().toISOString(),
      barcode: makeBarcode(sampleId),
    };
    setSamples((prev) => [created, ...prev]);
    setLastCreated(created);
    setOpenCollect(false);
    setOpenBarcode(true);
    toast({ title: "Collected", description: `${created.sampleId} barcode generated.` });
  };

  return (
    <LabLayout title="Sample Collection" subtitle="Collect and label laboratory samples">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Sample Collection</h1>
              <p className="text-muted-foreground">Collect and label laboratory samples</p>
            </div>
          </div>
          <Button className="gap-2" onClick={() => setOpenCollect(true)}>
            <TestTube className="h-4 w-4" /> Collect Sample
          </Button>
        </div>

        <StatGrid items={counts} />

        <Card>
          <CardHeader>
            <CardTitle>Collection Station</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Patient Name *</Label>
              <Input value={form.patientName} onChange={(e) => setForm((p) => ({ ...p, patientName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Tests *</Label>
              <Input value={form.tests} onChange={(e) => setForm((p) => ({ ...p, tests: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sample Type</Label>
                <Select value={form.sampleType} onValueChange={(v) => setForm((p) => ({ ...p, sampleType: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blood">Blood</SelectItem>
                    <SelectItem value="urine">Urine</SelectItem>
                    <SelectItem value="stool">Stool</SelectItem>
                    <SelectItem value="sputum">Sputum</SelectItem>
                    <SelectItem value="swab">Swab</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Container Type</Label>
                <Select value={form.containerType} onValueChange={(v) => setForm((p) => ({ ...p, containerType: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tube">Vacutainer Tube</SelectItem>
                    <SelectItem value="bottle">Collection Bottle</SelectItem>
                    <SelectItem value="vial">Vial</SelectItem>
                    <SelectItem value="slide">Slide</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v as Priority }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Routine">Routine</SelectItem>
                  <SelectItem value="Normal">Normal</SelectItem>
                  <SelectItem value="Urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={generateAndCollect}>Generate Barcode & Collect</Button>
          </CardContent>
        </Card>

        <Dialog open={openCollect} onOpenChange={setOpenCollect}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Collect Sample</DialogTitle>
              <DialogDescription>Generate barcode and mark as collected.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Patient Name *</Label>
                <Input value={form.patientName} onChange={(e) => setForm((p) => ({ ...p, patientName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Tests *</Label>
                <Input value={form.tests} onChange={(e) => setForm((p) => ({ ...p, tests: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenCollect(false)}>Cancel</Button>
              <Button onClick={generateAndCollect}>Collect</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={openBarcode} onOpenChange={setOpenBarcode}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Barcode Generated</DialogTitle>
            </DialogHeader>
            {lastCreated ? (
              <div className="space-y-2 text-sm">
                <div><span className="text-muted-foreground">Sample:</span> <span className="font-mono">{lastCreated.sampleId}</span></div>
                <div><span className="text-muted-foreground">Barcode:</span> <span className="font-mono">{lastCreated.barcode}</span></div>
                <div><span className="text-muted-foreground">Patient:</span> {lastCreated.patientName}</div>
                <div><span className="text-muted-foreground">Tests:</span> {lastCreated.tests}</div>
              </div>
            ) : null}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() =>
                  lastCreated
                    ? downloadCsv("barcode-label.csv", [
                        {
                          sampleId: lastCreated.sampleId,
                          barcode: lastCreated.barcode,
                          patient: lastCreated.patientName,
                          tests: lastCreated.tests,
                          sampleType: lastCreated.sampleType,
                          containerType: lastCreated.containerType,
                        },
                      ])
                    : undefined
                }
              >
                Download Label
              </Button>
              <Button onClick={() => setOpenBarcode(false)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </LabLayout>
  );
};

// Processing Page
export const LabProcessingPage = () => {
  const { toast } = useToast();
  const location = useLocation();
  const [samples, setSamples] = useLocalStorageState<LabSample[]>("lab.samples", []);
  const [processing, setProcessing] = useLocalStorageState<ProcessingItem[]>("lab.processing", []);

  const [openStart, setOpenStart] = useState(false);
  const [form, setForm] = useState({ sampleId: "", test: "", technician: "" });

  useEffect(() => {
    if (location.pathname === "/lab/processing/new") setOpenStart(true);
  }, [location.pathname]);

  const availableSamples = useMemo(
    () => samples.filter((s) => ["Collected", "Processing", "Pending"].includes(s.status)),
    [samples]
  );

  const stats = useMemo(() => {
    const inProgress = processing.length;
    const qc = processing.filter((p) => p.status === "QC").length;
    const completed = samples.filter((s) => s.status === "Completed").length;
    const pendingReview = processing.filter((p) => p.status === "Review").length;
    return [
      { title: "In Progress", value: String(inProgress), helper: "Currently processing" },
      { title: "Quality Checks", value: String(qc), helper: "QC" },
      { title: "Completed", value: String(completed), helper: "Completed samples" },
      { title: "Pending Review", value: String(pendingReview), helper: "Review" },
    ];
  }, [processing, samples]);

  const startProcessing = () => {
    if (!form.sampleId || !form.test.trim() || !form.technician.trim()) {
      toast({ title: "Missing details", description: "Sample, test and technician are required." });
      return;
    }
    const item: ProcessingItem = {
      id: makeId("PROC"),
      sampleId: form.sampleId,
      test: form.test.trim(),
      technician: form.technician.trim(),
      progress: 0,
      status: "Processing",
    };
    setProcessing((prev) => [item, ...prev]);
    setSamples((prev) =>
      prev.map((s) =>
        s.sampleId === form.sampleId
          ? {
              ...s,
              status: "Processing",
              collectedAt: s.collectedAt ?? new Date().toISOString(),
              barcode: s.barcode ?? makeBarcode(s.sampleId),
            }
          : s
      )
    );
    setOpenStart(false);
    setForm({ sampleId: "", test: "", technician: "" });
    toast({ title: "Started", description: `${item.sampleId} processing started.` });
  };

  const bumpProgress = (id: string, next: number) => {
    setProcessing((prev) => prev.map((p) => (p.id === id ? { ...p, progress: Math.max(0, Math.min(100, next)) } : p)));
  };

  const setStage = (id: string, status: ProcessingItem["status"]) => {
    setProcessing((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
  };

  return (
    <LabLayout title="Processing" subtitle="Laboratory test processing and analysis">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Processing</h1>
              <p className="text-muted-foreground">Laboratory test processing and analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => downloadCsv("lab-processing.csv", processing)}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button className="gap-2" onClick={() => setOpenStart(true)}>
              <Microscope className="h-4 w-4" /> Start Processing
            </Button>
          </div>
        </div>

        <StatGrid items={stats} />

        <Card>
          <CardHeader>
            <CardTitle>Active Processing</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sample ID</TableHead>
                  <TableHead>Test</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Technician</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processing.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono">{p.sampleId}</TableCell>
                    <TableCell>{p.test}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={p.progress} className="w-24" />
                        <span className="text-sm">{p.progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell>{p.technician}</TableCell>
                    <TableCell><Badge>{p.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => bumpProgress(p.id, p.progress + 25)}>
                          +25%
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setStage(p.id, p.status === "Processing" ? "QC" : "Review")}>
                          Next
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={openStart} onOpenChange={setOpenStart}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start Processing</DialogTitle>
              <DialogDescription>Assign a sample and test to a technician.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Sample *</Label>
                <Select value={form.sampleId} onValueChange={(v) => setForm((p) => ({ ...p, sampleId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select sample" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSamples.map((s) => (
                      <SelectItem key={s.sampleId} value={s.sampleId}>
                        {s.sampleId} — {s.patientName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Test *</Label>
                <Input value={form.test} onChange={(e) => setForm((p) => ({ ...p, test: e.target.value }))} placeholder="e.g. CBC" />
              </div>
              <div className="space-y-2">
                <Label>Technician *</Label>
                <Input value={form.technician} onChange={(e) => setForm((p) => ({ ...p, technician: e.target.value }))} placeholder="e.g. Dr. Sharma" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenStart(false)}>Cancel</Button>
              <Button onClick={startProcessing}>Start</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </LabLayout>
  );
};

// Results Entry Page
export const LabResultsPage = () => {
  const { toast } = useToast();
  const location = useLocation();
  const [samples, setSamples] = useLocalStorageState<LabSample[]>("lab.samples", []);
  const [results, setResults] = useLocalStorageState<ResultItem[]>("lab.results", []);
  const [openEntry, setOpenEntry] = useState(false);
  const [form, setForm] = useState({ sampleId: "", patientName: "", test: "", value: "", unit: "", flag: "Normal" as ResultItem["flag"] });

  useEffect(() => {
    if (location.pathname === "/lab/results/new") setOpenEntry(true);
  }, [location.pathname]);

  const readySamples = useMemo(() => samples.filter((s) => s.status === "Processing" || s.status === "Collected"), [samples]);

  const stats = useMemo(() => {
    const pending = readySamples.length;
    const enteredToday = results.filter((r) => r.enteredAt.startsWith(today())).length;
    const validated = results.length;
    const critical = results.filter((r) => r.flag === "Critical").length;
    return [
      { title: "Pending Entry", value: String(pending), helper: "Awaiting results" },
      { title: "Entered Today", value: String(enteredToday), helper: "Results entered" },
      { title: "Validated", value: String(validated), helper: "Saved" },
      { title: "Critical Values", value: String(critical), helper: "Flagged" },
    ];
  }, [readySamples.length, results]);

  const openForSample = (s: LabSample) => {
    setForm((p) => ({
      ...p,
      sampleId: s.sampleId,
      patientName: s.patientName,
      test: s.tests.split(",")[0]?.trim() || "",
    }));
    setOpenEntry(true);
  };

  const saveResult = () => {
    if (!form.sampleId || !form.test.trim() || !form.value.trim()) {
      toast({ title: "Missing details", description: "Sample, test, and value are required." });
      return;
    }
    const item: ResultItem = {
      id: makeId("RES"),
      sampleId: form.sampleId,
      patientName: form.patientName || "—",
      test: form.test.trim(),
      value: form.value.trim(),
      unit: form.unit.trim() || undefined,
      flag: form.flag,
      enteredAt: new Date().toISOString(),
    };
    setResults((prev) => [item, ...prev]);
    setSamples((prev) => prev.map((s) => (s.sampleId === form.sampleId ? { ...s, status: "Completed" } : s)));
    setOpenEntry(false);
    setForm({ sampleId: "", patientName: "", test: "", value: "", unit: "", flag: "Normal" });
    toast({ title: "Saved", description: `Result saved for ${item.sampleId}.` });
  };

  return (
    <LabLayout title="Results Entry" subtitle="Enter and validate test results">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Results Entry</h1>
              <p className="text-muted-foreground">Enter and validate laboratory test results</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => downloadCsv("lab-results.csv", results)}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button className="gap-2" onClick={() => setOpenEntry(true)}>
              <CheckCircle className="h-4 w-4" /> Enter Results
            </Button>
          </div>
        </div>

        <StatGrid items={stats} />

        <Card>
          <CardHeader>
            <CardTitle>Result Entry Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sample ID</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Test(s)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readySamples.map((s) => (
                  <TableRow key={s.sampleId}>
                    <TableCell className="font-mono">{s.sampleId}</TableCell>
                    <TableCell>{s.patientName}</TableCell>
                    <TableCell>{s.tests}</TableCell>
                    <TableCell><Badge>Ready</Badge></TableCell>
                    <TableCell><Badge variant="outline">{s.priority}</Badge></TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => openForSample(s)}>Enter Results</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saved Results</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Result ID</TableHead>
                  <TableHead>Sample</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Test</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Flag</TableHead>
                  <TableHead>Entered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.id}</TableCell>
                    <TableCell className="font-mono text-xs">{r.sampleId}</TableCell>
                    <TableCell>{r.patientName}</TableCell>
                    <TableCell>{r.test}</TableCell>
                    <TableCell>
                      {r.value}
                      {r.unit ? ` ${r.unit}` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.flag === "Critical" ? "destructive" : "outline"}>{r.flag}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.enteredAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {results.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      No results saved yet. Enter a result to see it here.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={openEntry} onOpenChange={setOpenEntry}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enter Results</DialogTitle>
              <DialogDescription>Record test results for a sample.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Sample</Label>
                <Select value={form.sampleId} onValueChange={(v) => {
                  const s = readySamples.find((x) => x.sampleId === v);
                  setForm((p) => ({ ...p, sampleId: v, patientName: s?.patientName ?? p.patientName, test: s?.tests.split(",")[0]?.trim() || p.test }));
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select sample" />
                  </SelectTrigger>
                  <SelectContent>
                    {readySamples.map((s) => (
                      <SelectItem key={s.sampleId} value={s.sampleId}>
                        {s.sampleId} — {s.patientName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Test *</Label>
                <Input value={form.test} onChange={(e) => setForm((p) => ({ ...p, test: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Value *</Label>
                  <Input value={form.value} onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Input value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Flag</Label>
                <Select value={form.flag} onValueChange={(v) => setForm((p) => ({ ...p, flag: v as any }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenEntry(false)}>Cancel</Button>
              <Button onClick={saveResult}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </LabLayout>
  );
};

// Reports Page
export const LabReportsPage = () => {
  const { toast } = useToast();
  const location = useLocation();
  const [reports, setReports] = useLocalStorageState<ReportItem[]>("lab.reports", [
    { id: "REP-001", patientName: "Rajesh Kumar", tests: "CBC, Lipid Profile", generatedAt: "2024-12-10", status: "Delivered" },
  ]);
  const [openGen, setOpenGen] = useState(false);
  const [form, setForm] = useState({ patientName: "", tests: "", status: "Ready" as ReportItem["status"] });
  const [openView, setOpenView] = useState(false);
  const [selected, setSelected] = useState<ReportItem | null>(null);

  useEffect(() => {
    if (location.pathname === "/lab/reports/new") setOpenGen(true);
  }, [location.pathname]);

  const stats = useMemo(() => {
    const generated = reports.length;
    const delivered = reports.filter((r) => r.status === "Delivered").length;
    const pending = reports.filter((r) => r.status === "Ready").length;
    return [
      { title: "Reports Generated", value: String(generated), helper: "All time" },
      { title: "Pending Approval", value: "0", helper: "Not configured" },
      { title: "Delivered", value: String(delivered), helper: "Delivered" },
      { title: "Reprints", value: "0", helper: "Not tracked" },
    ];
  }, [reports]);

  const generate = () => {
    if (!form.patientName.trim() || !form.tests.trim()) {
      toast({ title: "Missing details", description: "Patient and tests are required." });
      return;
    }
    const item: ReportItem = {
      id: makeId("REP"),
      patientName: form.patientName.trim(),
      tests: form.tests.trim(),
      generatedAt: today(),
      status: form.status,
    };
    setReports((prev) => [item, ...prev]);
    setOpenGen(false);
    setForm({ patientName: "", tests: "", status: "Ready" });
    downloadCsv("lab-report.csv", [item]);
    toast({ title: "Report generated", description: `${item.id} exported.` });
  };

  const printReport = (r: ReportItem) => {
    downloadCsv(`report-${r.id}.csv`, [r]);
    toast({ title: "Downloaded", description: `Report ${r.id} downloaded.` });
  };

  return (
    <LabLayout title="Reports" subtitle="Generate and manage laboratory reports">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Reports</h1>
              <p className="text-muted-foreground">Generate and manage laboratory reports</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => downloadCsv("lab-reports.csv", reports)}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button className="gap-2" onClick={() => setOpenGen(true)}>
              <FileText className="h-4 w-4" /> Generate Report
            </Button>
          </div>
        </div>

        <StatGrid items={stats} />

        <Card>
          <CardHeader>
            <CardTitle>Recent Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report ID</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Tests</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">{r.id}</TableCell>
                    <TableCell>{r.patientName}</TableCell>
                    <TableCell>{r.tests}</TableCell>
                    <TableCell>{r.generatedAt}</TableCell>
                    <TableCell><Badge>{r.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setSelected(r); setOpenView(true); }}>
                          View
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => printReport(r)}>
                          Print
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={openGen} onOpenChange={setOpenGen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Report</DialogTitle>
              <DialogDescription>Create a report entry and export it.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Patient Name *</Label>
                <Input value={form.patientName} onChange={(e) => setForm((p) => ({ ...p, patientName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Tests *</Label>
                <Input value={form.tests} onChange={(e) => setForm((p) => ({ ...p, tests: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as any }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ready">Ready</SelectItem>
                    <SelectItem value="Delivered">Delivered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenGen(false)}>Cancel</Button>
              <Button onClick={generate}>Generate</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={openView} onOpenChange={setOpenView}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Report Details</DialogTitle>
            </DialogHeader>
            {selected ? (
              <div className="space-y-2 text-sm">
                <div><span className="text-muted-foreground">Report:</span> <span className="font-mono">{selected.id}</span></div>
                <div><span className="text-muted-foreground">Patient:</span> {selected.patientName}</div>
                <div><span className="text-muted-foreground">Tests:</span> {selected.tests}</div>
                <div><span className="text-muted-foreground">Generated:</span> {selected.generatedAt}</div>
                <div><span className="text-muted-foreground">Status:</span> {selected.status}</div>
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => selected && printReport(selected)}>Download</Button>
              <Button onClick={() => setOpenView(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </LabLayout>
  );
};

// Inventory Page
export const LabInventoryPage = () => {
  const { toast } = useToast();
  const location = useLocation();
  const [inventory, setInventory] = useLocalStorageState<InventoryItem[]>("lab.inventory", [
    { code: "CBC-KIT-001", name: "CBC Test Kit", category: "Hematology", stock: 45, expiry: "2025-06-15" },
  ]);
  const [openAdd, setOpenAdd] = useState(false);
  const [openUpdate, setOpenUpdate] = useState(false);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState({ code: "", name: "", category: "", stock: "", expiry: "" });
  const [updateStock, setUpdateStock] = useState("");

  useEffect(() => {
    if (location.pathname === "/lab/inventory/new") setOpenAdd(true);
  }, [location.pathname]);

  const lowStockCount = inventory.filter((i) => i.stock <= 20).length;
  const expiredCount = inventory.filter((i) => i.expiry && i.expiry < today()).length;
  const outOfStock = inventory.filter((i) => i.stock <= 0).length;

  const add = () => {
    const stock = Number(form.stock);
    if (!form.code.trim() || !form.name.trim() || !Number.isFinite(stock)) {
      toast({ title: "Missing details", description: "Code, name and valid stock are required." });
      return;
    }
    const item: InventoryItem = {
      code: form.code.trim(),
      name: form.name.trim(),
      category: form.category.trim() || "General",
      stock,
      expiry: form.expiry || undefined,
    };
    setInventory((prev) => [item, ...prev]);
    setOpenAdd(false);
    setForm({ code: "", name: "", category: "", stock: "", expiry: "" });
    toast({ title: "Item added", description: `${item.code} created.` });
  };

  const openUpdateFor = (item: InventoryItem) => {
    setSelected(item);
    setUpdateStock(String(item.stock));
    setOpenUpdate(true);
  };

  const saveUpdate = () => {
    if (!selected) return;
    const stock = Number(updateStock);
    if (!Number.isFinite(stock)) {
      toast({ title: "Invalid stock", description: "Enter a valid number." });
      return;
    }
    setInventory((prev) => prev.map((i) => (i.code === selected.code ? { ...i, stock } : i)));
    setOpenUpdate(false);
    toast({ title: "Updated", description: `${selected.code} stock updated.` });
  };

  const reorder = (item: InventoryItem) => {
    toast({ title: "Reorder requested", description: `Reorder created for ${item.code}.` });
  };

  return (
    <LabLayout title="Inventory" subtitle="Manage laboratory supplies and reagents">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Inventory</h1>
              <p className="text-muted-foreground">Manage laboratory supplies and reagents</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => downloadCsv("lab-inventory.csv", inventory)}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button className="gap-2" onClick={() => setOpenAdd(true)}>
              <Package className="h-4 w-4" /> Add Item
            </Button>
          </div>
        </div>

        <StatGrid
          items={[
            { title: "Total Items", value: String(inventory.length), helper: "In inventory" },
            { title: "Low Stock", value: String(lowStockCount), helper: "≤ 20 units" },
            { title: "Expired", value: String(expiredCount), helper: "Past expiry" },
            { title: "Out of Stock", value: String(outOfStock), helper: "Unavailable" },
          ]}
        />

        <Card>
          <CardHeader>
            <CardTitle>Inventory Items</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.map((item) => {
                  const expired = item.expiry && item.expiry < today();
                  const status = expired ? "Expired" : item.stock <= 0 ? "Out" : item.stock <= 20 ? "Low" : "In Stock";
                  return (
                    <TableRow key={item.code}>
                      <TableCell className="font-mono">{item.code}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell>{item.stock}</TableCell>
                      <TableCell>{item.expiry ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline">{status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openUpdateFor(item)}>Update</Button>
                          <Button variant="outline" size="sm" onClick={() => reorder(item)}>Reorder</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={openAdd} onOpenChange={setOpenAdd}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Inventory Item</DialogTitle>
              <DialogDescription>Create a new inventory item.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Code *</Label>
                  <Input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Stock *</Label>
                  <Input value={form.stock} onChange={(e) => setForm((p) => ({ ...p, stock: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Expiry</Label>
                  <Input type="date" value={form.expiry} onChange={(e) => setForm((p) => ({ ...p, expiry: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenAdd(false)}>Cancel</Button>
              <Button onClick={add}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={openUpdate} onOpenChange={setOpenUpdate}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update Stock</DialogTitle>
              <DialogDescription>{selected ? selected.code : ""}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Stock</Label>
              <Input value={updateStock} onChange={(e) => setUpdateStock(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenUpdate(false)}>Cancel</Button>
              <Button onClick={saveUpdate}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </LabLayout>
  );
};

// Billing Page
export const LabBillingPage = () => {
  const { toast } = useToast();
  const location = useLocation();
  const [bills, setBills] = useLocalStorageState<BillItem[]>("lab.bills", [
    { id: "BILL-001", patientName: "Rajesh Kumar", amount: 2450, status: "Paid", date: "2024-12-10" },
  ]);
  const [openGen, setOpenGen] = useState(false);
  const [openView, setOpenView] = useState(false);
  const [selected, setSelected] = useState<BillItem | null>(null);
  const [form, setForm] = useState({ patientName: "", amount: "", status: "Unpaid" as BillStatus, notes: "" });

  useEffect(() => {
    if (location.pathname === "/lab/billing/new") setOpenGen(true);
  }, [location.pathname]);

  const stats = useMemo(() => {
    const revenueToday = bills.filter((b) => b.date === today()).reduce((sum, b) => sum + b.amount, 0);
    const pendingAmount = bills.filter((b) => b.status === "Unpaid").reduce((sum, b) => sum + b.amount, 0);
    const paid = bills.filter((b) => b.status === "Paid").reduce((sum, b) => sum + b.amount, 0);
    return [
      { title: "Today's Revenue", value: `₹${revenueToday}`, helper: "Billed today" },
      { title: "Pending Bills", value: `₹${pendingAmount}`, helper: "Unpaid invoices" },
      { title: "Insurance Claims", value: "₹0", helper: "Not configured" },
      { title: "Collections", value: `₹${paid}`, helper: "Paid total" },
    ];
  }, [bills]);

  const generateBill = () => {
    const amount = Number(form.amount);
    if (!form.patientName.trim() || !Number.isFinite(amount)) {
      toast({ title: "Missing details", description: "Patient and valid amount are required." });
      return;
    }
    const bill: BillItem = {
      id: makeId("BILL"),
      patientName: form.patientName.trim(),
      amount,
      status: form.status,
      date: today(),
      notes: form.notes.trim() || undefined,
    };
    setBills((prev) => [bill, ...prev]);
    setOpenGen(false);
    setForm({ patientName: "", amount: "", status: "Unpaid", notes: "" });
    downloadCsv("lab-bill.csv", [bill]);
    toast({ title: "Bill generated", description: `${bill.id} exported.` });
  };

  const printBill = (b: BillItem) => downloadCsv(`bill-${b.id}.csv`, [b]);

  return (
    <LabLayout title="Billing" subtitle="Manage laboratory billing and invoices">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Billing</h1>
              <p className="text-muted-foreground">Manage laboratory billing and invoices</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => downloadCsv("lab-bills.csv", bills)}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button className="gap-2" onClick={() => setOpenGen(true)}>
              <Receipt className="h-4 w-4" /> Generate Bill
            </Button>
          </div>
        </div>

        <StatGrid items={stats} />

        <Card>
          <CardHeader>
            <CardTitle>Recent Bills</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill ID</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono">{b.id}</TableCell>
                    <TableCell>{b.patientName}</TableCell>
                    <TableCell>₹{b.amount}</TableCell>
                    <TableCell><Badge>{b.status}</Badge></TableCell>
                    <TableCell>{b.date}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setSelected(b); setOpenView(true); }}>View</Button>
                        <Button variant="outline" size="sm" onClick={() => printBill(b)}>Print</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={openGen} onOpenChange={setOpenGen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Bill</DialogTitle>
              <DialogDescription>Create a bill and download it.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Patient Name *</Label>
                <Input value={form.patientName} onChange={(e) => setForm((p) => ({ ...p, patientName: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount (₹) *</Label>
                  <Input value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as any }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Unpaid">Unpaid</SelectItem>
                      <SelectItem value="Paid">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenGen(false)}>Cancel</Button>
              <Button onClick={generateBill}>Generate</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={openView} onOpenChange={setOpenView}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bill Details</DialogTitle>
            </DialogHeader>
            {selected ? (
              <div className="space-y-2 text-sm">
                <div><span className="text-muted-foreground">Bill:</span> <span className="font-mono">{selected.id}</span></div>
                <div><span className="text-muted-foreground">Patient:</span> {selected.patientName}</div>
                <div><span className="text-muted-foreground">Amount:</span> ₹{selected.amount}</div>
                <div><span className="text-muted-foreground">Status:</span> {selected.status}</div>
                <div><span className="text-muted-foreground">Date:</span> {selected.date}</div>
                <div><span className="text-muted-foreground">Notes:</span> {selected.notes || "—"}</div>
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => selected && printBill(selected)}>Download</Button>
              <Button onClick={() => setOpenView(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </LabLayout>
  );
};

// Payments Page
export const LabPaymentsPage = () => {
  const { toast } = useToast();
  const location = useLocation();
  const [payments, setPayments] = useLocalStorageState<PaymentItem[]>("lab.payments", [
    { id: "TXN-001", patientName: "Rajesh Kumar", amount: 2450, method: "Cash", status: "Completed", date: "2024-12-10" },
  ]);
  const [bills, setBills] = useLocalStorageState<BillItem[]>("lab.bills", []);

  const [openRec, setOpenRec] = useState(false);
  const [form, setForm] = useState({ billId: "", patientName: "", amount: "", method: "Cash" as PaymentItem["method"], status: "Completed" as PaymentItem["status"] });

  useEffect(() => {
    if (location.pathname === "/lab/payments/new") setOpenRec(true);
  }, [location.pathname]);

  const stats = useMemo(() => {
    const total = payments.reduce((sum, p) => sum + p.amount, 0);
    const pending = bills.filter((b) => b.status === "Unpaid").reduce((sum, b) => sum + b.amount, 0);
    const insurance = payments.filter((p) => p.method === "Insurance").reduce((sum, p) => sum + p.amount, 0);
    const cash = payments.filter((p) => p.method === "Cash").reduce((sum, p) => sum + p.amount, 0);
    return [
      { title: "Total Received", value: `₹${total}`, helper: "All time" },
      { title: "Pending", value: `₹${pending}`, helper: "Outstanding" },
      { title: "Insurance", value: `₹${insurance}`, helper: "Insurance" },
      { title: "Cash Payments", value: `₹${cash}`, helper: "Cash" },
    ];
  }, [payments, bills]);

  const record = () => {
    const amount = Number(form.amount);
    const patientName = form.patientName.trim() || (form.billId ? bills.find((b) => b.id === form.billId)?.patientName : "") || "";
    if (!patientName || !Number.isFinite(amount)) {
      toast({ title: "Missing details", description: "Patient and valid amount are required." });
      return;
    }
    const txn: PaymentItem = {
      id: makeId("TXN"),
      billId: form.billId || undefined,
      patientName,
      amount,
      method: form.method,
      status: form.status,
      date: today(),
    };
    setPayments((prev) => [txn, ...prev]);
    if (form.billId) {
      setBills((prev) => prev.map((b) => (b.id === form.billId ? { ...b, status: "Paid" } : b)));
    }
    setOpenRec(false);
    setForm({ billId: "", patientName: "", amount: "", method: "Cash", status: "Completed" });
    toast({ title: "Payment recorded", description: `${txn.id} saved.` });
  };

  return (
    <LabLayout title="Payments" subtitle="Track payments and financial transactions">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Payments</h1>
              <p className="text-muted-foreground">Track payments and financial transactions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => downloadCsv("lab-payments.csv", payments)}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button className="gap-2" onClick={() => setOpenRec(true)}>
              <CreditCard className="h-4 w-4" /> Record Payment
            </Button>
          </div>
        </div>

        <StatGrid items={stats} />

        <Card>
          <CardHeader>
            <CardTitle>Payment Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction ID</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono">{p.id}</TableCell>
                    <TableCell>{p.patientName}</TableCell>
                    <TableCell>₹{p.amount}</TableCell>
                    <TableCell>{p.method}</TableCell>
                    <TableCell><Badge>{p.status}</Badge></TableCell>
                    <TableCell>{p.date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={openRec} onOpenChange={setOpenRec}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Payment</DialogTitle>
              <DialogDescription>Save a payment transaction (and mark bill as Paid).</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Bill (optional)</Label>
                <Select value={form.billId} onValueChange={(v) => {
                  const bill = bills.find((b) => b.id === v);
                  setForm((p) => ({ ...p, billId: v, patientName: bill?.patientName ?? p.patientName, amount: bill ? String(bill.amount) : p.amount }));
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select bill" />
                  </SelectTrigger>
                  <SelectContent>
                    {bills.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.id} — {b.patientName} (₹{b.amount})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Patient Name *</Label>
                <Input value={form.patientName} onChange={(e) => setForm((p) => ({ ...p, patientName: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount (₹) *</Label>
                  <Input value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Method</Label>
                  <Select value={form.method} onValueChange={(v) => setForm((p) => ({ ...p, method: v as any }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Card">Card</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="Insurance">Insurance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as any }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenRec(false)}>Cancel</Button>
              <Button onClick={record}>Record</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </LabLayout>
  );
};

// Analytics Page
export const LabAnalyticsPage = () => {
  const { toast } = useToast();
  const [orders] = useLocalStorageState<LabOrder[]>("lab.orders", []);
  const [bills] = useLocalStorageState<BillItem[]>("lab.bills", []);
  const [samples] = useLocalStorageState<LabSample[]>("lab.samples", []);

  const revenue = bills.reduce((sum, b) => sum + b.amount, 0);
  const testsPerformed = Math.max(0, orders.length);

  const trend = useMemo(() => {
    // Simple derived trend: last 7 points based on existing sample/order volume.
    const base = Math.max(5, orders.length + samples.length);
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return days.map((d, i) => ({ day: d, tests: Math.max(0, Math.round(base * (0.6 + (i % 3) * 0.15))) }));
  }, [orders.length, samples.length]);

  const exportAnalytics = () => {
    downloadCsv("lab-analytics.csv", trend);
    toast({ title: "Exported", description: "Analytics report downloaded." });
  };

  return (
    <LabLayout title="Analytics" subtitle="Laboratory performance analytics and insights">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Analytics</h1>
              <p className="text-muted-foreground">Laboratory performance analytics and insights</p>
            </div>
          </div>
          <Button className="gap-2" onClick={exportAnalytics}>
            <TrendingUp className="h-4 w-4" /> Generate Report
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Tests Performed</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">{testsPerformed}</p>
              <p className="text-xs text-muted-foreground mt-1">From orders</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">₹{revenue}</p>
              <p className="text-xs text-muted-foreground mt-1">From bills</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Turnaround Time</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">—</p>
              <p className="text-xs text-muted-foreground mt-1">Not configured</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Quality Score</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">—</p>
              <p className="text-xs text-muted-foreground mt-1">Not configured</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Test Volume Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ left: 12, right: 12, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="tests" stroke="currentColor" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </LabLayout>
  );
};

// Staff Page
export const LabStaffPage = () => {
  const { toast } = useToast();
  const location = useLocation();
  const [staff, setStaff] = useLocalStorageState<StaffMember[]>("lab.staff", [
    { id: "EMP-001", name: "Dr. Rajiv Sharma", role: "Pathologist", department: "Hematology", status: "Active" },
  ]);

  const [openAdd, setOpenAdd] = useState(false);
  const [openView, setOpenView] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [form, setForm] = useState({ name: "", role: "Technician", department: "General" });
  const [editForm, setEditForm] = useState({ name: "", role: "", department: "", status: "Active" as StaffMember["status"] });

  useEffect(() => {
    if (location.pathname === "/lab/staff/new") setOpenAdd(true);
  }, [location.pathname]);

  const stats = useMemo(() => {
    const total = staff.length;
    const technicians = staff.filter((s) => s.role.toLowerCase().includes("tech")).length;
    const pathologists = staff.filter((s) => s.role.toLowerCase().includes("path")).length;
    const support = Math.max(0, total - technicians - pathologists);
    return [
      { title: "Total Staff", value: String(total), helper: "Employees" },
      { title: "Technicians", value: String(technicians), helper: "Technicians" },
      { title: "Pathologists", value: String(pathologists), helper: "Doctors" },
      { title: "Support Staff", value: String(support), helper: "Other" },
    ];
  }, [staff]);

  const add = () => {
    if (!form.name.trim()) {
      toast({ title: "Missing name", description: "Staff name is required." });
      return;
    }
    const member: StaffMember = {
      id: makeId("EMP"),
      name: form.name.trim(),
      role: form.role.trim() || "Technician",
      department: form.department.trim() || "General",
      status: "Active",
    };
    setStaff((prev) => [member, ...prev]);
    setOpenAdd(false);
    setForm({ name: "", role: "Technician", department: "General" });
    toast({ title: "Added", description: `${member.id} created.` });
  };

  const openEditFor = (m: StaffMember) => {
    setSelected(m);
    setEditForm({ name: m.name, role: m.role, department: m.department, status: m.status });
    setOpenEdit(true);
  };

  const save = () => {
    if (!selected) return;
    if (!editForm.name.trim()) {
      toast({ title: "Missing name", description: "Staff name is required." });
      return;
    }
    setStaff((prev) =>
      prev.map((s) =>
        s.id === selected.id
          ? { ...s, name: editForm.name.trim(), role: editForm.role.trim(), department: editForm.department.trim(), status: editForm.status }
          : s
      )
    );
    setOpenEdit(false);
    toast({ title: "Saved", description: "Staff updated." });
  };

  return (
    <LabLayout title="Staff" subtitle="Manage laboratory staff and technicians">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Staff Management</h1>
              <p className="text-muted-foreground">Manage laboratory staff and technicians</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => downloadCsv("lab-staff.csv", staff)}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button className="gap-2" onClick={() => setOpenAdd(true)}>
              <UserCog className="h-4 w-4" /> Add Staff
            </Button>
          </div>
        </div>

        <StatGrid items={stats} />

        <Card>
          <CardHeader>
            <CardTitle>Staff Directory</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono">{m.id}</TableCell>
                    <TableCell>{m.name}</TableCell>
                    <TableCell>{m.role}</TableCell>
                    <TableCell>{m.department}</TableCell>
                    <TableCell><Badge variant="outline">{m.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setSelected(m); setOpenView(true); }}>View</Button>
                        <Button variant="outline" size="sm" onClick={() => openEditFor(m)}>Edit</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={openAdd} onOpenChange={setOpenAdd}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Staff</DialogTitle>
              <DialogDescription>Create a new staff member.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Input value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenAdd(false)}>Cancel</Button>
              <Button onClick={add}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={openView} onOpenChange={setOpenView}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Staff Details</DialogTitle>
            </DialogHeader>
            {selected ? (
              <div className="space-y-2 text-sm">
                <div><span className="text-muted-foreground">ID:</span> <span className="font-mono">{selected.id}</span></div>
                <div><span className="text-muted-foreground">Name:</span> {selected.name}</div>
                <div><span className="text-muted-foreground">Role:</span> {selected.role}</div>
                <div><span className="text-muted-foreground">Department:</span> {selected.department}</div>
                <div><span className="text-muted-foreground">Status:</span> {selected.status}</div>
              </div>
            ) : null}
            <DialogFooter>
              <Button onClick={() => setOpenView(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={openEdit} onOpenChange={setOpenEdit}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Staff</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Input value={editForm.role} onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input value={editForm.department} onChange={(e) => setEditForm((p) => ({ ...p, department: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm((p) => ({ ...p, status: v as any }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenEdit(false)}>Cancel</Button>
              <Button onClick={save}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </LabLayout>
  );
};

// Notifications Page
export const LabNotificationsPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useLocalStorageState<NotificationItem[]>("lab.notifications", [
    {
      id: "NTF-001",
      title: "Critical Value Alert",
      description: "Patient Rajesh Kumar has critical potassium levels",
      level: "Critical",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      read: false,
    },
    {
      id: "NTF-002",
      title: "Test Completed",
      description: "CBC results for patient Priya Singh are ready",
      level: "Info",
      createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      read: false,
    },
  ]);

  const unread = notifications.filter((n) => !n.read).length;
  const critical = notifications.filter((n) => n.level === "Critical" && !n.read).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    toast({ title: "Updated", description: "All notifications marked read." });
  };

  return (
    <LabLayout title="Notifications" subtitle="System notifications and alerts">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Notifications</h1>
              <p className="text-muted-foreground">System notifications and alerts</p>
            </div>
          </div>
          <Button variant="outline" className="gap-2" onClick={markAllRead}>
            <Bell className="h-4 w-4" /> Mark All Read
          </Button>
        </div>

        <StatGrid
          items={[
            { title: "Unread", value: String(unread), helper: "New notifications" },
            { title: "Today", value: String(notifications.length), helper: "In list" },
            { title: "This Week", value: String(notifications.length), helper: "In list" },
            { title: "Critical", value: String(critical), helper: "Urgent alerts" },
          ]}
        />

        <Card>
          <CardHeader>
            <CardTitle>Recent Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {notifications.map((n) => (
              <div key={n.id} className="flex items-start gap-3 p-3 border rounded-lg">
                {n.level === "Critical" ? (
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="font-medium">
                    {n.title} {n.read ? <span className="text-xs text-muted-foreground">(read)</span> : null}
                  </p>
                  <p className="text-sm text-muted-foreground">{n.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                {n.level === "Critical" ? (
                  <Badge variant="destructive">Critical</Badge>
                ) : (
                  <Badge variant="outline">Info</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </LabLayout>
  );
};

// Settings Page
export const LabSettingsPage = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useLocalStorageState<LabSettings>("lab.settings", {
    labName: "Mediczy Diagnostic Lab",
    licenseNumber: "DL-2024-001",
    defaultPriority: "Normal",
    reportFooter: "Generated by Mediczy Lab System",
    equipmentNotes: "",
  });

  const save = () => {
    setSettings((prev) => ({ ...prev }));
    toast({ title: "Saved", description: "Settings saved." });
  };

  return (
    <LabLayout title="Settings" subtitle="Laboratory configuration and preferences">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Settings</h1>
              <p className="text-muted-foreground">Laboratory configuration and preferences</p>
            </div>
          </div>
          <Button className="gap-2" onClick={save}>
            <Settings className="h-4 w-4" /> Save Changes
          </Button>
        </div>

        <Tabs defaultValue="general" className="space-y-4">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="tests">Test Configuration</TabsTrigger>
            <TabsTrigger value="equipment">Equipment</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Laboratory Name</Label>
                    <Input value={settings.labName} onChange={(e) => setSettings((p) => ({ ...p, labName: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>License Number</Label>
                    <Input value={settings.licenseNumber} onChange={(e) => setSettings((p) => ({ ...p, licenseNumber: e.target.value }))} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tests" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Test Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Default Priority</Label>
                  <Select value={settings.defaultPriority} onValueChange={(v) => setSettings((p) => ({ ...p, defaultPriority: v as any }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Routine">Routine</SelectItem>
                      <SelectItem value="Normal">Normal</SelectItem>
                      <SelectItem value="Urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="equipment" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Equipment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Equipment Notes</Label>
                  <Textarea value={settings.equipmentNotes} onChange={(e) => setSettings((p) => ({ ...p, equipmentNotes: e.target.value }))} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Reports</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Report Footer</Label>
                  <Textarea value={settings.reportFooter} onChange={(e) => setSettings((p) => ({ ...p, reportFooter: e.target.value }))} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </LabLayout>
  );
};

// Support Page
export const LabSupportPage = () => (
  <LabLayout title="Help & Support" subtitle="Get help and support resources">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Help & Support</h1>
            <p className="text-muted-foreground">Get help and support resources</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5" /> Quick Help
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 border rounded-lg">
              <h4 className="font-medium">How to enter test results?</h4>
              <p className="text-sm text-muted-foreground">Go to Results Entry → Select sample → Enter values → Validate</p>
            </div>
            <div className="p-3 border rounded-lg">
              <h4 className="font-medium">Managing inventory?</h4>
              <p className="text-sm text-muted-foreground">Use Inventory → Add items → Set reorder levels → Track expiry</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" /> System Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span>LIS System</span>
              <Badge className="bg-green-100 text-green-800">Online</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Equipment Status</span>
              <Badge className="bg-green-100 text-green-800">All Operational</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Network</span>
              <Badge className="bg-green-100 text-green-800">Connected</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </LabLayout>
);