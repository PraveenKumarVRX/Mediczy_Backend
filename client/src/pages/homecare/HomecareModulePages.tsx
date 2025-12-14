import { useEffect, useMemo, useState } from "react";
import HomecareLayout from "@/components/homecare/HomecareLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, Filter, Calendar, Clock, Users, Heart,
  CheckCircle, FileText, Receipt, CreditCard, TrendingUp,
  UserCog, Bell, Settings, HelpCircle, ArrowLeft, Edit, Trash2,
  Eye, AlertCircle, Download, Upload, Activity, BarChart3,
  Home, Stethoscope, Pill, UserCheck, ClipboardList
} from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  helper?: string;
}

type HomecarePatientStatus = "Active" | "Critical" | "Discharged";
type HomecareAppointmentStatus = "Scheduled" | "In Progress" | "Completed" | "Cancelled";

type HomecarePatient = {
  id: string;
  name: string;
  age: number;
  condition: string;
  caregiver: string;
  status: HomecarePatientStatus;
  lastVisit: string;
  phone: string;
  address?: string;
  notes?: string;
};

type HomecareStaff = {
  id: string;
  name: string;
  role: string;
  phone: string;
  patients: number;
  rating: number;
  status: "Active" | "On Duty" | "Off Duty";
};

type HomecareService = {
  id: string;
  name: string;
  category: string;
  price: string;
  duration: string;
  status: "Active" | "Inactive";
};

type HomecareAppointment = {
  id: string;
  patient: string;
  caregiver: string;
  service: string;
  date: string;
  time: string;
  status: HomecareAppointmentStatus;
  notes?: string;
};

const HOMECARE_STORAGE_KEYS = {
  patients: "homecare.patients",
  staff: "homecare.staff",
  services: "homecare.services",
  appointments: "homecare.appointments",
} as const;

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  return safeJsonParse<T>(window.localStorage.getItem(key), fallback);
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function ensureSeed<T>(key: string, seed: T) {
  if (typeof window === "undefined") return;
  const existing = window.localStorage.getItem(key);
  if (existing == null) {
    window.localStorage.setItem(key, JSON.stringify(seed));
  }
}

function generateId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
}

function openTel(phone: string) {
  if (typeof window === "undefined") return;
  const sanitized = phone.trim();
  if (!sanitized) return;
  window.location.href = `tel:${sanitized}`;
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
    <CardContent>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <p className="font-medium">{item.label}</p>
              {item.meta && <p className="text-sm text-muted-foreground">{item.meta}</p>}
            </div>
            {item.status && (
              <Badge variant={item.status === "Completed" ? "default" : item.status === "Pending" ? "secondary" : "destructive"}>
                {item.status}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

// Homecare Patients Page
export const HomecarePatientsPage = () => {
  const { toast } = useToast();
  const [patients, setPatients] = useState<HomecarePatient[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | Lowercase<HomecarePatientStatus>>("all");
  const [query, setQuery] = useState("");

  const [viewOpen, setViewOpen] = useState(false);
  const [upsertOpen, setUpsertOpen] = useState(false);
  const [selected, setSelected] = useState<HomecarePatient | null>(null);
  const [editing, setEditing] = useState<HomecarePatient | null>(null);
  const [form, setForm] = useState({
    name: "",
    age: "",
    condition: "",
    caregiver: "",
    status: "Active" as HomecarePatientStatus,
    lastVisit: "",
    phone: "",
    address: "",
    notes: "",
  });

  useEffect(() => {
    ensureSeed<HomecarePatient[]>(HOMECARE_STORAGE_KEYS.patients, [
      {
        id: "P001",
        name: "Mary Johnson",
        age: 72,
        condition: "Post-surgery care",
        caregiver: "Sarah Davis",
        status: "Active",
        lastVisit: "2025-12-10",
        phone: "+1 555 0101",
        address: "Springfield",
      },
      {
        id: "P002",
        name: "Robert Wilson",
        age: 68,
        condition: "Chronic care",
        caregiver: "Mike Chen",
        status: "Active",
        lastVisit: "2025-12-09",
        phone: "+1 555 0102",
        address: "Riverside",
      },
      {
        id: "P003",
        name: "Alice Brown",
        age: 75,
        condition: "Rehabilitation",
        caregiver: "Emma Taylor",
        status: "Critical",
        lastVisit: "2025-12-08",
        phone: "+1 555 0103",
        address: "Lakeside",
        notes: "Monitor vitals closely for the next 72 hours.",
      },
    ]);

    setPatients(readStorage<HomecarePatient[]>(HOMECARE_STORAGE_KEYS.patients, []));
  }, []);

  const stats = useMemo(() => {
    const activeCount = patients.filter((p) => p.status === "Active").length;
    const criticalCount = patients.filter((p) => p.status === "Critical").length;

    return [
      { title: "Active Patients", value: String(activeCount), helper: "Currently under care" },
      { title: "Care Plans", value: "—", helper: "Managed in Care Plans" },
      { title: "Today's Visits", value: "—", helper: "See Appointments" },
      { title: "Critical Cases", value: String(criticalCount), helper: "High priority" },
    ];
  }, [patients]);

  const filteredPatients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return patients.filter((p) => {
      const matchesStatus =
        statusFilter === "all" ? true : p.status.toLowerCase() === statusFilter;
      const matchesQuery =
        normalized.length === 0
          ? true
          : [p.id, p.name, p.condition, p.caregiver, p.phone]
              .join(" ")
              .toLowerCase()
              .includes(normalized);
      return matchesStatus && matchesQuery;
    });
  }, [patients, query, statusFilter]);

  const openAdd = () => {
    setEditing(null);
    setForm({
      name: "",
      age: "",
      condition: "",
      caregiver: "",
      status: "Active",
      lastVisit: "",
      phone: "",
      address: "",
      notes: "",
    });
    setUpsertOpen(true);
  };

  const openEdit = (patient: HomecarePatient) => {
    setEditing(patient);
    setForm({
      name: patient.name,
      age: String(patient.age),
      condition: patient.condition,
      caregiver: patient.caregiver,
      status: patient.status,
      lastVisit: patient.lastVisit,
      phone: patient.phone,
      address: patient.address || "",
      notes: patient.notes || "",
    });
    setUpsertOpen(true);
  };

  const openView = (patient: HomecarePatient) => {
    setSelected(patient);
    setViewOpen(true);
  };

  const persistPatients = (next: HomecarePatient[]) => {
    setPatients(next);
    writeStorage(HOMECARE_STORAGE_KEYS.patients, next);
  };

  const handleSave = () => {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      toast({ title: "Missing name", description: "Please enter patient name.", variant: "destructive" });
      return;
    }
    const parsedAge = Number(form.age);
    if (!Number.isFinite(parsedAge) || parsedAge <= 0) {
      toast({ title: "Invalid age", description: "Please enter a valid age.", variant: "destructive" });
      return;
    }

    const nextPatient: HomecarePatient = {
      id: editing?.id || generateId("P"),
      name: trimmedName,
      age: parsedAge,
      condition: form.condition.trim() || "—",
      caregiver: form.caregiver.trim() || "—",
      status: form.status,
      lastVisit: form.lastVisit.trim() || new Date().toISOString().slice(0, 10),
      phone: form.phone.trim() || "",
      address: form.address.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };

    const next = editing
      ? patients.map((p) => (p.id === editing.id ? nextPatient : p))
      : [nextPatient, ...patients];

    persistPatients(next);
    setUpsertOpen(false);
    toast({
      title: editing ? "Patient updated" : "Patient added",
      description: nextPatient.name,
    });
  };

  return (
    <HomecareLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Patient Management</h1>
            <p className="text-muted-foreground">Manage homecare patients and their care plans</p>
          </div>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Add Patient
          </Button>
        </div>

        <StatGrid items={stats} />

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Patient Directory</CardTitle>
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="discharged">Discharged</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Search patients..."
                  className="w-64"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Caregiver</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Visit</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPatients.map((patient) => (
                  <TableRow key={patient.id}>
                    <TableCell className="font-medium">{patient.id}</TableCell>
                    <TableCell>{patient.name}</TableCell>
                    <TableCell>{patient.age}</TableCell>
                    <TableCell>{patient.condition}</TableCell>
                    <TableCell>{patient.caregiver}</TableCell>
                    <TableCell>
                      <Badge variant={patient.status === "Critical" ? "destructive" : "default"}>
                        {patient.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{patient.lastVisit}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openView(patient)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(patient)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (!patient.phone) {
                              toast({ title: "No phone number", description: "Add a phone number to call this patient." });
                              return;
                            }
                            openTel(patient.phone);
                          }}
                        >
                          <Phone className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={viewOpen} onOpenChange={setViewOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Patient Details</DialogTitle>
              <DialogDescription>Quick view of patient information</DialogDescription>
            </DialogHeader>
            {selected && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Patient ID</p>
                    <p className="font-medium">{selected.id}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-medium">{selected.status}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Name</p>
                    <p className="font-medium">{selected.name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Phone</p>
                    <p className="font-medium">{selected.phone || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Condition</p>
                    <p className="font-medium">{selected.condition}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Caregiver</p>
                    <p className="font-medium">{selected.caregiver}</p>
                  </div>
                </div>
                {selected.notes && (
                  <div>
                    <p className="text-muted-foreground text-sm">Notes</p>
                    <p className="text-sm">{selected.notes}</p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewOpen(false)}>
                Close
              </Button>
              {selected?.phone ? (
                <Button onClick={() => openTel(selected.phone)}>Call</Button>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={upsertOpen} onOpenChange={setUpsertOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Patient" : "Add Patient"}</DialogTitle>
              <DialogDescription>Save patient details to Homecare</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Age</Label>
                <Input value={form.age} onChange={(e) => setForm((p) => ({ ...p, age: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Condition</Label>
                <Input value={form.condition} onChange={(e) => setForm((p) => ({ ...p, condition: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Caregiver</Label>
                <Input value={form.caregiver} onChange={(e) => setForm((p) => ({ ...p, caregiver: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as HomecarePatientStatus }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                    <SelectItem value="Discharged">Discharged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Last Visit (YYYY-MM-DD)</Label>
                <Input value={form.lastVisit} onChange={(e) => setForm((p) => ({ ...p, lastVisit: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUpsertOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>{editing ? "Save Changes" : "Add Patient"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </HomecareLayout>
  );
};

// Homecare Care Plans Page
export const HomecareCarePlansPage = () => {
  const carePlans = [
    { id: "CP001", patient: "Mary Johnson", type: "Post-Surgery Care", duration: "4 weeks", status: "Active", progress: 75 },
    { id: "CP002", patient: "Robert Wilson", type: "Chronic Disease Management", duration: "Ongoing", status: "Active", progress: 60 },
    { id: "CP003", patient: "Alice Brown", type: "Physical Therapy", duration: "8 weeks", status: "Active", progress: 40 },
  ];

  return (
    <HomecareLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Care Plans</h1>
            <p className="text-muted-foreground">Create and manage personalized care plans</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Care Plan
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Active Plans</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">89</p>
              <p className="text-xs text-muted-foreground mt-1">Currently in progress</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-blue-600">234</p>
              <p className="text-xs text-muted-foreground mt-1">This year</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Pending Review</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-orange-600">12</p>
              <p className="text-xs text-muted-foreground mt-1">Need attention</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Success Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-purple-600">94%</p>
              <p className="text-xs text-muted-foreground mt-1">Patient satisfaction</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Care Plans</CardTitle>
              <div className="flex gap-2">
                <Select>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Search plans..." className="w-64" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan ID</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Care Type</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carePlans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">{plan.id}</TableCell>
                    <TableCell>{plan.patient}</TableCell>
                    <TableCell>{plan.type}</TableCell>
                    <TableCell>{plan.duration}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={plan.progress} className="w-20" />
                        <span className="text-sm">{plan.progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">{plan.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </HomecareLayout>
  );
};

// Homecare Appointments Page
export const HomecareAppointmentsPage = () => {
  const { toast } = useToast();
  const [appointments, setAppointments] = useState<HomecareAppointment[]>([]);
  const [dateFilter, setDateFilter] = useState<"today" | "tomorrow" | "week" | "all">("all");
  const [query, setQuery] = useState("");

  const [viewOpen, setViewOpen] = useState(false);
  const [upsertOpen, setUpsertOpen] = useState(false);
  const [selected, setSelected] = useState<HomecareAppointment | null>(null);
  const [editing, setEditing] = useState<HomecareAppointment | null>(null);
  const [form, setForm] = useState({
    patient: "",
    caregiver: "",
    service: "",
    date: "",
    time: "",
    status: "Scheduled" as HomecareAppointmentStatus,
    notes: "",
  });

  useEffect(() => {
    ensureSeed<HomecareAppointment[]>(HOMECARE_STORAGE_KEYS.appointments, [
      {
        id: "AP001",
        patient: "Mary Johnson",
        caregiver: "Sarah Davis",
        service: "Wound Care",
        date: "2025-12-10",
        time: "10:00 AM",
        status: "Scheduled",
      },
      {
        id: "AP002",
        patient: "Robert Wilson",
        caregiver: "Mike Chen",
        service: "Medication Admin",
        date: "2025-12-10",
        time: "2:00 PM",
        status: "In Progress",
      },
      {
        id: "AP003",
        patient: "Alice Brown",
        caregiver: "Emma Taylor",
        service: "Physical Therapy",
        date: "2025-12-11",
        time: "9:00 AM",
        status: "Scheduled",
      },
    ]);

    setAppointments(readStorage<HomecareAppointment[]>(HOMECARE_STORAGE_KEYS.appointments, []));
  }, []);

  const persistAppointments = (next: HomecareAppointment[]) => {
    setAppointments(next);
    writeStorage(HOMECARE_STORAGE_KEYS.appointments, next);
  };

  const openAdd = () => {
    setEditing(null);
    setForm({
      patient: "",
      caregiver: "",
      service: "",
      date: new Date().toISOString().slice(0, 10),
      time: "",
      status: "Scheduled",
      notes: "",
    });
    setUpsertOpen(true);
  };

  const openEdit = (appointment: HomecareAppointment) => {
    setEditing(appointment);
    setForm({
      patient: appointment.patient,
      caregiver: appointment.caregiver,
      service: appointment.service,
      date: appointment.date,
      time: appointment.time,
      status: appointment.status,
      notes: appointment.notes || "",
    });
    setUpsertOpen(true);
  };

  const openView = (appointment: HomecareAppointment) => {
    setSelected(appointment);
    setViewOpen(true);
  };

  const handleSave = () => {
    const patient = form.patient.trim();
    const caregiver = form.caregiver.trim();
    const service = form.service.trim();
    if (!patient || !caregiver || !service) {
      toast({
        title: "Missing fields",
        description: "Please fill patient, caregiver and service.",
        variant: "destructive",
      });
      return;
    }
    const next: HomecareAppointment = {
      id: editing?.id || generateId("AP"),
      patient,
      caregiver,
      service,
      date: form.date.trim() || new Date().toISOString().slice(0, 10),
      time: form.time.trim() || "—",
      status: form.status,
      notes: form.notes.trim() || undefined,
    };

    const updated = editing
      ? appointments.map((a) => (a.id === editing.id ? next : a))
      : [next, ...appointments];

    persistAppointments(updated);
    setUpsertOpen(false);
    toast({ title: editing ? "Appointment updated" : "Visit scheduled", description: next.id });
  };

  const filteredAppointments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const inRange = (dateStr: string) => {
      if (dateFilter === "all") return true;
      if (dateFilter === "today") return dateStr === todayStr;
      if (dateFilter === "tomorrow") return dateStr === tomorrowStr;
      if (dateFilter === "week") {
        const d = new Date(dateStr);
        if (Number.isNaN(d.getTime())) return true;
        const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 7;
      }
      return true;
    };

    return appointments.filter((a) => {
      const matchesQuery =
        normalized.length === 0
          ? true
          : [a.id, a.patient, a.caregiver, a.service, a.status]
              .join(" ")
              .toLowerCase()
              .includes(normalized);
      return matchesQuery && inRange(a.date);
    });
  }, [appointments, dateFilter, query]);

  return (
    <HomecareLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
            <p className="text-muted-foreground">Schedule and manage homecare visits</p>
          </div>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Schedule Visit
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Today's Visits</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-blue-600">34</p>
              <p className="text-xs text-muted-foreground mt-1">Scheduled</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">28</p>
              <p className="text-xs text-muted-foreground mt-1">This week</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-orange-600">6</p>
              <p className="text-xs text-muted-foreground mt-1">Awaiting confirmation</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">No-shows</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-red-600">2</p>
              <p className="text-xs text-muted-foreground mt-1">This week</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Appointment Schedule</CardTitle>
              <div className="flex gap-2">
                <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as any)}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Date" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="tomorrow">Tomorrow</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Search appointments..."
                  className="w-64"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Appointment ID</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Caregiver</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAppointments.map((appointment) => (
                  <TableRow key={appointment.id}>
                    <TableCell className="font-medium">{appointment.id}</TableCell>
                    <TableCell>{appointment.patient}</TableCell>
                    <TableCell>{appointment.caregiver}</TableCell>
                    <TableCell>{appointment.service}</TableCell>
                    <TableCell>{appointment.date} {appointment.time}</TableCell>
                    <TableCell>
                      <Badge variant={
                        appointment.status === "In Progress" ? "secondary" :
                        appointment.status === "Scheduled" ? "default" : "outline"
                      }>
                        {appointment.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openView(appointment)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(appointment)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={viewOpen} onOpenChange={setViewOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Appointment Details</DialogTitle>
              <DialogDescription>Visit details</DialogDescription>
            </DialogHeader>
            {selected && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-muted-foreground">Appointment ID</p>
                    <p className="font-medium">{selected.id}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-medium">{selected.status}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Patient</p>
                    <p className="font-medium">{selected.patient}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Caregiver</p>
                    <p className="font-medium">{selected.caregiver}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Service</p>
                    <p className="font-medium">{selected.service}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Date & Time</p>
                    <p className="font-medium">{selected.date} {selected.time}</p>
                  </div>
                </div>
                {selected.notes && (
                  <div>
                    <p className="text-muted-foreground">Notes</p>
                    <p>{selected.notes}</p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewOpen(false)}>
                Close
              </Button>
              {selected ? (
                <Button onClick={() => openEdit(selected)}>Edit</Button>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={upsertOpen} onOpenChange={setUpsertOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Appointment" : "Schedule Visit"}</DialogTitle>
              <DialogDescription>Create or update a homecare visit</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Patient</Label>
                <Input value={form.patient} onChange={(e) => setForm((p) => ({ ...p, patient: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Caregiver</Label>
                <Input value={form.caregiver} onChange={(e) => setForm((p) => ({ ...p, caregiver: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Service</Label>
                <Input value={form.service} onChange={(e) => setForm((p) => ({ ...p, service: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as HomecareAppointmentStatus }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Scheduled">Scheduled</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date (YYYY-MM-DD)</Label>
                <Input value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input value={form.time} onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUpsertOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>{editing ? "Save Changes" : "Schedule"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </HomecareLayout>
  );
};

// Homecare Staff Page
export const HomecareStaffPage = () => {
  const { toast } = useToast();
  const [staff, setStaff] = useState<HomecareStaff[]>([]);
  const [roleFilter, setRoleFilter] = useState<"all" | "nurse" | "assistant" | "therapist">("all");
  const [query, setQuery] = useState("");

  const [viewOpen, setViewOpen] = useState(false);
  const [upsertOpen, setUpsertOpen] = useState(false);
  const [selected, setSelected] = useState<HomecareStaff | null>(null);
  const [editing, setEditing] = useState<HomecareStaff | null>(null);
  const [form, setForm] = useState({
    name: "",
    role: "Registered Nurse",
    phone: "",
    patients: "0",
    rating: "4.5",
    status: "Active" as HomecareStaff["status"],
  });

  useEffect(() => {
    ensureSeed<HomecareStaff[]>(HOMECARE_STORAGE_KEYS.staff, [
      { id: "EMP001", name: "Sarah Davis", role: "Registered Nurse", phone: "+1 555 0201", patients: 12, rating: 4.8, status: "On Duty" },
      { id: "EMP002", name: "Mike Chen", role: "Care Assistant", phone: "+1 555 0202", patients: 8, rating: 4.6, status: "Active" },
      { id: "EMP003", name: "Emma Taylor", role: "Physical Therapist", phone: "+1 555 0203", patients: 6, rating: 4.9, status: "Active" },
    ]);

    setStaff(readStorage<HomecareStaff[]>(HOMECARE_STORAGE_KEYS.staff, []));
  }, []);

  const persistStaff = (next: HomecareStaff[]) => {
    setStaff(next);
    writeStorage(HOMECARE_STORAGE_KEYS.staff, next);
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", role: "Registered Nurse", phone: "", patients: "0", rating: "4.5", status: "Active" });
    setUpsertOpen(true);
  };

  const openEdit = (member: HomecareStaff) => {
    setEditing(member);
    setForm({
      name: member.name,
      role: member.role,
      phone: member.phone,
      patients: String(member.patients),
      rating: String(member.rating),
      status: member.status,
    });
    setUpsertOpen(true);
  };

  const openView = (member: HomecareStaff) => {
    setSelected(member);
    setViewOpen(true);
  };

  const handleSave = () => {
    const name = form.name.trim();
    if (!name) {
      toast({ title: "Missing name", description: "Please enter staff name.", variant: "destructive" });
      return;
    }
    const patientsCount = Number(form.patients);
    const rating = Number(form.rating);
    const next: HomecareStaff = {
      id: editing?.id || generateId("EMP"),
      name,
      role: form.role.trim() || "—",
      phone: form.phone.trim() || "",
      patients: Number.isFinite(patientsCount) ? patientsCount : 0,
      rating: Number.isFinite(rating) ? rating : 0,
      status: form.status,
    };

    const updated = editing
      ? staff.map((s) => (s.id === editing.id ? next : s))
      : [next, ...staff];
    persistStaff(updated);
    setUpsertOpen(false);
    toast({ title: editing ? "Staff updated" : "Staff added", description: next.name });
  };

  const filteredStaff = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return staff.filter((s) => {
      const matchesRole =
        roleFilter === "all"
          ? true
          : (roleFilter === "nurse" && s.role.toLowerCase().includes("nurse")) ||
            (roleFilter === "assistant" && s.role.toLowerCase().includes("assistant")) ||
            (roleFilter === "therapist" && s.role.toLowerCase().includes("therap"));
      const matchesQuery =
        normalized.length === 0
          ? true
          : [s.id, s.name, s.role, s.phone, s.status]
              .join(" ")
              .toLowerCase()
              .includes(normalized);
      return matchesRole && matchesQuery;
    });
  }, [query, roleFilter, staff]);

  return (
    <HomecareLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Staff Management</h1>
            <p className="text-muted-foreground">Manage caregivers and homecare staff</p>
          </div>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Add Staff Member
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Staff</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">45</p>
              <p className="text-xs text-muted-foreground mt-1">Active caregivers</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Nurses</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-blue-600">18</p>
              <p className="text-xs text-muted-foreground mt-1">RNs and LPNs</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Care Assistants</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">22</p>
              <p className="text-xs text-muted-foreground mt-1">Certified assistants</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Avg Rating</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-purple-600">4.7/5</p>
              <p className="text-xs text-muted-foreground mt-1">Patient satisfaction</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Staff Directory</CardTitle>
              <div className="flex gap-2">
                <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as any)}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="nurse">Nurse</SelectItem>
                    <SelectItem value="assistant">Care Assistant</SelectItem>
                    <SelectItem value="therapist">Therapist</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Search staff..."
                  className="w-64"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Patients</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaff.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.id}</TableCell>
                    <TableCell>{member.name}</TableCell>
                    <TableCell>{member.role}</TableCell>
                    <TableCell>{member.patients}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="text-yellow-500">★</span>
                        <span>{member.rating}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">{member.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openView(member)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(member)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (!member.phone) {
                              toast({ title: "No phone number", description: "Add a phone number to call this staff member." });
                              return;
                            }
                            openTel(member.phone);
                          }}
                        >
                          <Phone className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={viewOpen} onOpenChange={setViewOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Staff Details</DialogTitle>
              <DialogDescription>Quick view of staff information</DialogDescription>
            </DialogHeader>
            {selected && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Employee ID</p>
                  <p className="font-medium">{selected.id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium">{selected.status}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Name</p>
                  <p className="font-medium">{selected.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Role</p>
                  <p className="font-medium">{selected.role}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phone</p>
                  <p className="font-medium">{selected.phone || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Active Patients</p>
                  <p className="font-medium">{selected.patients}</p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewOpen(false)}>
                Close
              </Button>
              {selected?.phone ? <Button onClick={() => openTel(selected.phone)}>Call</Button> : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={upsertOpen} onOpenChange={setUpsertOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle>
              <DialogDescription>Save caregiver/staff details</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Input value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as any }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="On Duty">On Duty</SelectItem>
                    <SelectItem value="Off Duty">Off Duty</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Active Patients</Label>
                <Input value={form.patients} onChange={(e) => setForm((p) => ({ ...p, patients: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Rating</Label>
                <Input value={form.rating} onChange={(e) => setForm((p) => ({ ...p, rating: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUpsertOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>{editing ? "Save Changes" : "Add Staff"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </HomecareLayout>
  );
};

// Homecare Services Page
export const HomecareServicesPage = () => {
  const { toast } = useToast();
  const [services, setServices] = useState<HomecareService[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<"all" | "medical" | "assistance" | "rehabilitation">("all");
  const [query, setQuery] = useState("");

  const [viewOpen, setViewOpen] = useState(false);
  const [upsertOpen, setUpsertOpen] = useState(false);
  const [selected, setSelected] = useState<HomecareService | null>(null);
  const [editing, setEditing] = useState<HomecareService | null>(null);
  const [form, setForm] = useState({
    name: "",
    category: "Medical",
    price: "",
    duration: "",
    status: "Active" as HomecareService["status"],
  });

  useEffect(() => {
    ensureSeed<HomecareService[]>(HOMECARE_STORAGE_KEYS.services, [
      { id: "SVC001", name: "Nursing Care", category: "Medical", price: "₹800/visit", duration: "1 hour", status: "Active" },
      { id: "SVC002", name: "Personal Care", category: "Assistance", price: "₹500/visit", duration: "45 mins", status: "Active" },
      { id: "SVC003", name: "Physical Therapy", category: "Rehabilitation", price: "₹1,200/session", duration: "1.5 hours", status: "Active" },
    ]);
    setServices(readStorage<HomecareService[]>(HOMECARE_STORAGE_KEYS.services, []));
  }, []);

  const persistServices = (next: HomecareService[]) => {
    setServices(next);
    writeStorage(HOMECARE_STORAGE_KEYS.services, next);
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", category: "Medical", price: "", duration: "", status: "Active" });
    setUpsertOpen(true);
  };

  const openEdit = (svc: HomecareService) => {
    setEditing(svc);
    setForm({
      name: svc.name,
      category: svc.category,
      price: svc.price,
      duration: svc.duration,
      status: svc.status,
    });
    setUpsertOpen(true);
  };

  const openView = (svc: HomecareService) => {
    setSelected(svc);
    setViewOpen(true);
  };

  const handleSave = () => {
    const name = form.name.trim();
    if (!name) {
      toast({ title: "Missing name", description: "Please enter service name.", variant: "destructive" });
      return;
    }
    const next: HomecareService = {
      id: editing?.id || generateId("SVC"),
      name,
      category: form.category.trim() || "—",
      price: form.price.trim() || "—",
      duration: form.duration.trim() || "—",
      status: form.status,
    };
    const updated = editing
      ? services.map((s) => (s.id === editing.id ? next : s))
      : [next, ...services];
    persistServices(updated);
    setUpsertOpen(false);
    toast({ title: editing ? "Service updated" : "Service added", description: next.name });
  };

  const filteredServices = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return services.filter((s) => {
      const matchesCategory =
        categoryFilter === "all"
          ? true
          : s.category.toLowerCase() === categoryFilter;
      const matchesQuery =
        normalized.length === 0
          ? true
          : [s.id, s.name, s.category, s.price, s.duration, s.status]
              .join(" ")
              .toLowerCase()
              .includes(normalized);
      return matchesCategory && matchesQuery;
    });
  }, [categoryFilter, query, services]);

  return (
    <HomecareLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Services</h1>
            <p className="text-muted-foreground">Manage homecare services and pricing</p>
          </div>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Add Service
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Services</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">24</p>
              <p className="text-xs text-muted-foreground mt-1">Available services</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Medical Services</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-blue-600">12</p>
              <p className="text-xs text-muted-foreground mt-1">Clinical care</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Support Services</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">8</p>
              <p className="text-xs text-muted-foreground mt-1">Daily assistance</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Rehabilitation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-purple-600">4</p>
              <p className="text-xs text-muted-foreground mt-1">Therapy services</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Service Catalog</CardTitle>
              <div className="flex gap-2">
                <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as any)}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="medical">Medical</SelectItem>
                    <SelectItem value="assistance">Assistance</SelectItem>
                    <SelectItem value="rehabilitation">Rehabilitation</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Search services..."
                  className="w-64"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredServices.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell className="font-medium">{service.id}</TableCell>
                    <TableCell>{service.name}</TableCell>
                    <TableCell>{service.category}</TableCell>
                    <TableCell>{service.price}</TableCell>
                    <TableCell>{service.duration}</TableCell>
                    <TableCell>
                      <Badge variant="default">{service.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(service)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openView(service)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={viewOpen} onOpenChange={setViewOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Service Details</DialogTitle>
              <DialogDescription>Quick view of service information</DialogDescription>
            </DialogHeader>
            {selected && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Service ID</p>
                  <p className="font-medium">{selected.id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium">{selected.status}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Name</p>
                  <p className="font-medium">{selected.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Category</p>
                  <p className="font-medium">{selected.category}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Price</p>
                  <p className="font-medium">{selected.price}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Duration</p>
                  <p className="font-medium">{selected.duration}</p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewOpen(false)}>
                Close
              </Button>
              {selected ? <Button onClick={() => openEdit(selected)}>Edit</Button> : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={upsertOpen} onOpenChange={setUpsertOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Service" : "Add Service"}</DialogTitle>
              <DialogDescription>Save service details</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Price</Label>
                <Input value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <Input value={form.duration} onChange={(e) => setForm((p) => ({ ...p, duration: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as any }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUpsertOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>{editing ? "Save Changes" : "Add Service"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </HomecareLayout>
  );
};

// Homecare Billing Page
export const HomecareBillingPage = () => {
  const invoices = [
    { id: "INV001", patient: "Mary Johnson", service: "Nursing Care", amount: "₹3,200", date: "2025-12-10", status: "Paid" },
    { id: "INV002", patient: "Robert Wilson", service: "Personal Care", amount: "₹2,000", date: "2025-12-09", status: "Pending" },
    { id: "INV003", patient: "Alice Brown", service: "Physical Therapy", amount: "₹4,800", date: "2025-12-08", status: "Paid" },
  ];

  return (
    <HomecareLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Billing & Payments</h1>
            <p className="text-muted-foreground">Manage invoices and payment processing</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Create Invoice
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Monthly Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">₹8,50,000</p>
              <p className="text-xs text-green-600 mt-1">+15% from last month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Outstanding</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-orange-600">₹45,000</p>
              <p className="text-xs text-muted-foreground mt-1">Pending payments</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Insurance Claims</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-blue-600">67</p>
              <p className="text-xs text-muted-foreground mt-1">This month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Avg Service Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-purple-600">₹950</p>
              <p className="text-xs text-muted-foreground mt-1">Per visit</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Billing Records</CardTitle>
              <div className="flex gap-2">
                <Select>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Search invoices..." className="w-64" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice ID</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.id}</TableCell>
                    <TableCell>{invoice.patient}</TableCell>
                    <TableCell>{invoice.service}</TableCell>
                    <TableCell>{invoice.amount}</TableCell>
                    <TableCell>{invoice.date}</TableCell>
                    <TableCell>
                      <Badge variant={invoice.status === "Paid" ? "default" : "secondary"}>
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </HomecareLayout>
  );
};

// Homecare Inventory Page
export const HomecareInventoryPage = () => {
  const inventory = [
    { name: "Blood Pressure Monitor", stock: 25, minStock: 10, category: "Medical Equipment", status: "In Stock" },
    { name: "Wound Care Supplies", stock: 8, minStock: 15, category: "Consumables", status: "Low Stock" },
    { name: "Mobility Aids", stock: 12, minStock: 8, category: "Equipment", status: "In Stock" },
  ];

  return (
    <HomecareLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Inventory Management</h1>
            <p className="text-muted-foreground">Track medical supplies and equipment</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Items</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">156</p>
              <p className="text-xs text-muted-foreground mt-1">In inventory</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Low Stock Items</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-orange-600">12</p>
              <p className="text-xs text-muted-foreground mt-1">Need restocking</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Out of Stock</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-red-600">3</p>
              <p className="text-xs text-muted-foreground mt-1">Urgent reorder</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-purple-600">8</p>
              <p className="text-xs text-muted-foreground mt-1">Product categories</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Inventory Items</CardTitle>
              <div className="flex gap-2">
                <Select>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="medical">Medical Equipment</SelectItem>
                    <SelectItem value="consumables">Consumables</SelectItem>
                    <SelectItem value="equipment">Equipment</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Search items..." className="w-64" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Name</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Min Stock</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.stock}</TableCell>
                    <TableCell>{item.minStock}</TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>
                      <Badge variant={item.status === "Low Stock" ? "destructive" : "default"}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </HomecareLayout>
  );
};

// Homecare Reports Page
export const HomecareReportsPage = () => {
  return (
    <HomecareLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Reports & Analytics</h1>
            <p className="text-muted-foreground">Generate comprehensive reports and performance metrics</p>
          </div>
          <Button>
            <Download className="w-4 h-4 mr-2" />
            Generate Report
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Patient Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">Care outcomes, satisfaction</p>
              <p className="text-xs text-muted-foreground mt-1">Patient care analytics</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Operational Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">Staff performance, visits</p>
              <p className="text-xs text-muted-foreground mt-1">Service delivery metrics</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Financial Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">Revenue, expenses, profitability</p>
              <p className="text-xs text-muted-foreground mt-1">Business performance</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Generate Custom Report</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Report Type</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select report type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="patient">Patient Report</SelectItem>
                    <SelectItem value="operational">Operational Report</SelectItem>
                    <SelectItem value="financial">Financial Report</SelectItem>
                    <SelectItem value="quality">Quality Report</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date Range</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select date range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Last Week</SelectItem>
                    <SelectItem value="month">Last Month</SelectItem>
                    <SelectItem value="quarter">Last Quarter</SelectItem>
                    <SelectItem value="year">Last Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4">
              <Button>Generate Report</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </HomecareLayout>
  );
};

// Homecare Settings Page
export const HomecareSettingsPage = () => {
  return (
    <HomecareLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
            <p className="text-muted-foreground">Configure homecare service preferences and system settings</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Service Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Service Area</Label>
                <Input defaultValue="Metropolitan Area" />
              </div>
              <div className="space-y-2">
                <Label>Operating Hours</Label>
                <Input defaultValue="24/7 Emergency Care" />
              </div>
              <div className="space-y-2">
                <Label>Response Time SLA</Label>
                <Input defaultValue="2 hours for routine, 30 mins for emergency" />
              </div>
              <div className="space-y-2">
                <Label>Emergency Contact</Label>
                <Input defaultValue="+91 9876543210" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quality Standards</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Staff Certification Requirements</Label>
                <Input defaultValue="All caregivers must be certified" />
              </div>
              <div className="space-y-2">
                <Label>Quality Check Frequency</Label>
                <Input defaultValue="Weekly patient assessments" />
              </div>
              <div className="space-y-2">
                <Label>Patient Satisfaction Surveys</Label>
                <Input defaultValue="Monthly feedback collection" />
              </div>
              <div className="space-y-2">
                <Label>Compliance Standards</Label>
                <Input defaultValue="HIPAA and local healthcare regulations" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>System Preferences</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Automated Scheduling</p>
                  <p className="text-sm text-muted-foreground">Auto-assign caregivers based on availability and location</p>
                </div>
                <Button variant="outline" size="sm">Enabled</Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Real-time GPS Tracking</p>
                  <p className="text-sm text-muted-foreground">Track caregiver locations during visits</p>
                </div>
                <Button variant="outline" size="sm">Enabled</Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Emergency Alerts</p>
                  <p className="text-sm text-muted-foreground">Instant notifications for critical patient situations</p>
                </div>
                <Button variant="outline" size="sm">Enabled</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline">Cancel</Button>
          <Button>Save Changes</Button>
        </div>
      </div>
    </HomecareLayout>
  );
};

// Homecare Support Page
export const HomecareSupportPage = () => {
  return (
    <HomecareLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Support & Help</h1>
            <p className="text-muted-foreground">Get help and support for homecare service operations</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">24/7 Support</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-red-600">Available</p>
              <p className="text-xs text-muted-foreground mt-1">Emergency support line</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Training Resources</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-blue-600">Available</p>
              <p className="text-xs text-muted-foreground mt-1">Caregiver training materials</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Documentation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">Complete</p>
              <p className="text-xs text-muted-foreground mt-1">User guides and manuals</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quick Support Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <Button className="w-full" variant="outline">
                  <Phone className="w-4 h-4 mr-2" />
                  Emergency Support Line
                </Button>
                <Button className="w-full" variant="outline">
                  <HelpCircle className="w-4 h-4 mr-2" />
                  Care Protocols Guide
                </Button>
                <Button className="w-full" variant="outline">
                  <FileText className="w-4 h-4 mr-2" />
                  Report Incident
                </Button>
              </div>
              <div className="space-y-3">
                <Button className="w-full" variant="outline">
                  <Users className="w-4 h-4 mr-2" />
                  Staff Training Portal
                </Button>
                <Button className="w-full" variant="outline">
                  <Settings className="w-4 h-4 mr-2" />
                  System Troubleshooting
                </Button>
                <Button className="w-full" variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Download Resources
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </HomecareLayout>
  );
};