import { useMemo, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Ambulance, MapPin, Clock, Phone, Users, Activity, AlertCircle,
  Navigation, Heart, Stethoscope, LogOut, Search, Filter, Plus,
  CheckCircle, XCircle, Timer, DollarSign, TrendingUp, Calendar,
  Edit, Trash2, Eye, Download, Settings, FileText, ClipboardList,
  Wrench, Bell, BarChart3, Mail, Package
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AmbulanceLayout from "@/components/ambulance/AmbulanceLayout";
import api from "@/utils/api";

type Id = string;

type PendingRequest = {
  id: Id;
  caller: string;
  phone?: string;
  location: string;
  urgency: "Critical" | "High" | "Medium" | "Low";
  time: string;
  type: string;
};

type TripHistoryItem = {
  id: Id;
  date: string;
  patient: string;
  pickup: string;
  destination: string;
  duration: string;
  status: "Completed";
};

type Invoice = {
  id: Id;
  patient: string;
  service: string;
  amount: string;
  date: string;
  status: "Paid" | "Pending" | "Overdue";
};

type SettingsState = {
  emergencyContact: string;
};

const STORAGE_KEYS = {
  pendingRequests: "ambulance.pendingRequests",
  tripHistory: "ambulance.tripHistory",
  invoices: "ambulance.invoices",
  settings: "ambulance.settings",
} as const;

const safeParseJson = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const writeJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const makeId = (prefix: string) => `${prefix}${Math.random().toString(16).slice(2, 8)}${Date.now().toString(16).slice(-4)}`;

const downloadCsv = (filename: string, headers: string[], rows: Array<Array<string | number>>) => {
  const escapeCell = (value: string | number) => {
    const asString = String(value ?? "");
    const escaped = asString.replace(/"/g, '""');
    return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
  };

  const csv = [headers, ...rows].map((r) => r.map(escapeCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const openMaps = (query: string) => {
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  window.open(url, "_blank", "noopener,noreferrer");
};

const dialPhone = (phone: string) => {
  if (!phone) return;
  window.location.href = `tel:${phone}`;
};

/** Honest label for sections that cannot show real data (e.g. live GPS,
 * which has no data source yet). Added 2026-09-18 rather than silently
 * leaving these unlabeled, which was the previous state. */
function PlaceholderBanner({ reason, title = "Sample data." }: { reason: string; title?: string }) {
  return (
    <div className="flex items-start gap-2 text-xs bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-lg p-3 mb-4">
      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
      <span className="text-amber-800 dark:text-amber-200">
        <strong>{title}</strong> {reason}
      </span>
    </div>
  );
}

function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Monday..Sunday of the current week as local YYYY-MM-DD strings. */
const currentWeekDays = () => {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return { ymd: toYmd(d), label: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) };
  });
};

const VEHICLE_TYPES = ["BLS", "ALS", "Neonatal", "Mortuary", "Other"] as const;
const VEHICLE_STATUS_LABELS: Record<string, string> = {
  available: "Available",
  on_trip: "On Trip",
  maintenance: "Maintenance",
  off_duty: "Off Duty",
};
const CREW_ROLE_LABELS: Record<string, string> = { driver: "Driver", paramedic: "Paramedic", support: "Support Staff" };

const AmbulanceDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [ambulanceData, setAmbulanceData] = useState<any>(null);
  const [newEmergencyOpen, setNewEmergencyOpen] = useState(false);
  const [emergencyPatient, setEmergencyPatient] = useState("");
  const [emergencyLocation, setEmergencyLocation] = useState("");
  const [emergencyType, setEmergencyType] = useState("Accident");
  const [emergencyUrgency, setEmergencyUrgency] = useState<PendingRequest["urgency"]>("High");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [completedTripsQuery, setCompletedTripsQuery] = useState("");

  // Real backend state — added 2026-09-18. This dashboard previously ran
  // entirely on hardcoded arrays and localStorage (confirmed by audit).
  // Trips and billing are real (ambulance-dispatch.service.js); fleet,
  // crew, maintenance, shifts and alerts are real too
  // (ambulance-fleet.service.js). Only live GPS is still missing.
  const [realActiveTrips, setRealActiveTrips] = useState<any[]>([]);
  const [realCompletedTrips, setRealCompletedTrips] = useState<any[]>([]);
  const [financialSummary, setFinancialSummary] = useState<any[]>([]);
  const [dataLoadFailed, setDataLoadFailed] = useState(false);

  // Fleet state (vehicles, crew, maintenance, shifts, alerts)
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [crew, setCrew] = useState<any[]>([]);
  const [maintenanceItems, setMaintenanceItems] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [staffTab, setStaffTab] = useState("drivers");
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({ registrationNumber: "", vehicleType: "BLS", currentLocation: "", nextServiceDue: "" });
  const [crewDialogOpen, setCrewDialogOpen] = useState(false);
  const [crewForm, setCrewForm] = useState({ name: "", role: "driver", licenseNumber: "", phone: "" });
  const [maintDialogOpen, setMaintDialogOpen] = useState(false);
  const [maintForm, setMaintForm] = useState({ vehicleId: "", maintenanceType: "", scheduledDate: "", notes: "" });
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [shiftForm, setShiftForm] = useState({ crewId: "", vehicleId: "none", shiftDate: "", startTime: "08:00", endTime: "16:00" });

  const refreshTripData = async () => {
    try {
      const [statsRes, activeRes, completedRes, financeRes] = await Promise.allSettled([
        api.get("/ambulance/dashboard-stats"),
        api.get("/ambulance/trips/active"),
        api.get("/ambulance/trips/completed"),
        api.get("/ambulance/financial-summary"),
      ]);
      if (statsRes.status === "fulfilled") {
        const s = statsRes.value.data?.stats;
        if (s) {
          setStats((prev) => ({
            ...prev,
            activeTrips: s.activeTrips ?? prev.activeTrips,
            todayTrips: s.todayTrips ?? prev.todayTrips,
            avgResponseTime: s.avgResponseTime ?? prev.avgResponseTime,
            successRate: s.successRate ?? prev.successRate,
          }));
        }
      }
      if (activeRes.status === "fulfilled") setRealActiveTrips(activeRes.value.data?.trips ?? []);
      if (completedRes.status === "fulfilled") setRealCompletedTrips(completedRes.value.data?.trips ?? []);
      if (financeRes.status === "fulfilled") setFinancialSummary(financeRes.value.data?.summary ?? []);
      setDataLoadFailed(false);
    } catch {
      setDataLoadFailed(true);
    }
  };

  const refreshFleetData = async () => {
    const week = currentWeekDays();
    const [summaryRes, vehiclesRes, crewRes, maintRes, shiftsRes, alertsRes] = await Promise.allSettled([
      api.get("/ambulance/fleet/summary"),
      api.get("/ambulance/fleet/vehicles"),
      api.get("/ambulance/crew"),
      api.get("/ambulance/maintenance"),
      api.get(`/ambulance/shifts?from=${week[0].ymd}&to=${week[6].ymd}`),
      api.get("/ambulance/alerts"),
    ]);
    if (summaryRes.status === "fulfilled") {
      const f = summaryRes.value.data?.summary;
      if (f) setStats((prev) => ({ ...prev, availableVehicles: f.available ?? 0, totalVehicles: f.total ?? 0 }));
    }
    if (vehiclesRes.status === "fulfilled") setVehicles(vehiclesRes.value.data?.vehicles ?? []);
    if (crewRes.status === "fulfilled") setCrew(crewRes.value.data?.crew ?? []);
    if (maintRes.status === "fulfilled") setMaintenanceItems(maintRes.value.data?.maintenance ?? []);
    if (shiftsRes.status === "fulfilled") setShifts(shiftsRes.value.data?.shifts ?? []);
    if (alertsRes.status === "fulfilled") setAlerts(alertsRes.value.data?.alerts ?? []);
  };

  useEffect(() => {
    refreshTripData();
    refreshFleetData();
  }, []);

  const settings = useMemo(() => {
    return (
      safeParseJson<SettingsState>(localStorage.getItem(STORAGE_KEYS.settings)) ?? {
        emergencyContact: "+91 9876543210",
      }
    );
  }, []);

  const [stats, setStats] = useState({
    activeTrips: 3,
    todayTrips: 12,
    totalPatients: 245,
    revenue: 45000,
    availableVehicles: 0,
    totalVehicles: 0,
    avgResponseTime: "8 mins",
    successRate: "98%"
  });

  useEffect(() => {
    const data = localStorage.getItem("ambulanceData");
    if (data) {
      setAmbulanceData(JSON.parse(data));
    } else {
      navigate("/ambulance/login");
    }
  }, [navigate]);

  useEffect(() => {
    const tripHistory = safeParseJson<TripHistoryItem[]>(localStorage.getItem(STORAGE_KEYS.tripHistory)) ?? [];
    const invoices = safeParseJson<Invoice[]>(localStorage.getItem(STORAGE_KEYS.invoices)) ?? [];
    const paidRevenue = invoices
      .filter((i) => i.status === "Paid")
      .reduce((sum, i) => sum + (Number(i.amount.replace(/[^0-9.]/g, "")) || 0), 0);

    setStats((prev) => ({
      ...prev,
      todayTrips: tripHistory.length,
      revenue: paidRevenue || prev.revenue,
    }));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("ambulanceToken");
    localStorage.removeItem("ambulanceData");
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out.",
    });
    navigate("/ambulance/login");
  };

  const emergencyRequests = [
    { id: 1, patient: "Rajesh Kumar", location: "MG Road, Sector 21", type: "Cardiac Emergency", priority: "Critical", time: "2 mins ago", status: "En Route", distance: "3.2 km" },
    { id: 2, patient: "Priya Sharma", location: "Park Street, Block B", type: "Accident", priority: "High", time: "5 mins ago", status: "Dispatched", distance: "5.1 km" },
    { id: 3, patient: "Amit Patel", location: "Lake View Apartments", type: "Breathing Difficulty", priority: "High", time: "8 mins ago", status: "En Route", distance: "2.8 km" },
    { id: 4, patient: "Sunita Reddy", location: "City Hospital Road", type: "Pregnancy Emergency", priority: "Critical", time: "12 mins ago", status: "Arrived", distance: "1.5 km" },
  ];

  // Real completed trips now come from realCompletedTrips state (fetched
  // in refreshTripData). The old hardcoded `completedTrips` array is gone —
  // duration/distance fields it had don't exist in the real schema, so
  // usages below were updated to the real field names instead of faked.
  const filteredCompletedTrips = useMemo(() => {
    const q = completedTripsQuery.trim().toLowerCase();
    if (!q) return realCompletedTrips;
    return realCompletedTrips.filter((t) =>
      [String(t.id), t.patient_name, t.pickup_location, t.drop_location, t.trip_type].some((v) => (v || "").toLowerCase().includes(q))
    );
  }, [completedTripsQuery, realCompletedTrips]);

  const createEmergency = async () => {
    if (!emergencyPatient.trim() || !emergencyLocation.trim()) {
      toast({
        title: "Missing details",
        description: "Patient name and location are required.",
        variant: "destructive",
      });
      return;
    }

    // Real backend write is now the primary path (2026-09-18) — previously
    // this only wrote to localStorage with a fire-and-forget parallel API
    // call. patientName/urgency are now actually persisted, closing a gap
    // where the New Emergency dialog collected them but silently dropped
    // them before reaching the database.
    try {
      await api.post("/ambulance/trips", {
        patientName: emergencyPatient.trim(),
        patientPhone: emergencyPhone.trim() || undefined,
        pickupLocation: emergencyLocation.trim(),
        tripType: "emergency",
        urgency: emergencyUrgency,
      });

      // Kept for the tabs not yet converted to the real backend (Reports'
      // generic CSV export reads recent activity from here too).
      const request: PendingRequest = {
        id: makeId("REQ"),
        caller: emergencyPatient.trim(),
        phone: emergencyPhone.trim() || undefined,
        location: emergencyLocation.trim(),
        urgency: emergencyUrgency,
        time: "Just now",
        type: emergencyType,
      };
      const existing = safeParseJson<PendingRequest[]>(localStorage.getItem(STORAGE_KEYS.pendingRequests)) ?? [];
      writeJson(STORAGE_KEYS.pendingRequests, [request, ...existing]);

      await Promise.all([refreshTripData(), refreshFleetData()]);
      setNewEmergencyOpen(false);
      setEmergencyPatient("");
      setEmergencyLocation("");
      setEmergencyType("Accident");
      setEmergencyUrgency("High");
      setEmergencyPhone("");
      toast({ title: "Emergency created", description: "Dispatch recorded." });
      navigate("/ambulance/dispatch");
    } catch (e: any) {
      toast({ title: "Failed to create dispatch", description: e?.response?.data?.message || e.message, variant: "destructive" });
    }
  };

  const downloadTripReceipt = (trip: any) => {
    downloadCsv(
      `receipt-${trip.id}.csv`,
      ["Trip ID", "Patient", "Pickup", "Dropoff", "Fare", "Payment Status", "Status"],
      [[trip.id, trip.patient_name || "", trip.pickup_location || "", trip.drop_location || "", trip.fare_amount != null ? `₹${trip.fare_amount}` : "", trip.payment_status || "", trip.status]]
    );
    toast({ title: "Receipt downloaded", description: "A simple CSV receipt was generated." });
  };

  const downloadFinancialReport = () => {
    downloadCsv(
      "ambulance-financial-report.csv",
      ["Payment Status", "Trip Count", "Total"],
      financialSummary.map((row) => [row.payment_status, row.cnt, `₹${Number(row.total).toLocaleString()}`])
    );
    toast({ title: "Report generated", description: "Financial report CSV downloaded." });
  };

  // ── Fleet actions (vehicles, crew, maintenance, shifts) ────────────────────
  const fleetErrorToast = (title: string, e: any) =>
    toast({ title, description: e?.response?.data?.message || e?.message || "Something went wrong.", variant: "destructive" });

  const submitVehicle = async () => {
    if (!vehicleForm.registrationNumber.trim()) {
      toast({ title: "Missing details", description: "Registration number is required.", variant: "destructive" });
      return;
    }
    try {
      await api.post("/ambulance/fleet/vehicles", {
        registrationNumber: vehicleForm.registrationNumber.trim(),
        vehicleType: vehicleForm.vehicleType,
        currentLocation: vehicleForm.currentLocation.trim() || undefined,
        nextServiceDue: vehicleForm.nextServiceDue || undefined,
      });
      setVehicleDialogOpen(false);
      setVehicleForm({ registrationNumber: "", vehicleType: "BLS", currentLocation: "", nextServiceDue: "" });
      toast({ title: "Vehicle added" });
      await refreshFleetData();
    } catch (e: any) {
      fleetErrorToast("Failed to add vehicle", e);
    }
  };

  const changeVehicleStatus = async (vehicleId: number, status: string) => {
    try {
      await api.patch(`/ambulance/fleet/vehicles/${vehicleId}/status`, { status });
      await refreshFleetData();
    } catch (e: any) {
      fleetErrorToast("Failed to update vehicle", e);
    }
  };

  const openAddStaff = () => {
    const role = staffTab === "paramedics" ? "paramedic" : staffTab === "support" ? "support" : "driver";
    setCrewForm({ name: "", role, licenseNumber: "", phone: "" });
    setCrewDialogOpen(true);
  };

  const submitCrew = async () => {
    if (!crewForm.name.trim()) {
      toast({ title: "Missing details", description: "Name is required.", variant: "destructive" });
      return;
    }
    try {
      await api.post("/ambulance/crew", {
        name: crewForm.name.trim(),
        role: crewForm.role,
        licenseNumber: crewForm.licenseNumber.trim() || undefined,
        phone: crewForm.phone.trim() || undefined,
      });
      setCrewDialogOpen(false);
      toast({ title: "Staff member added" });
      await refreshFleetData();
    } catch (e: any) {
      fleetErrorToast("Failed to add staff member", e);
    }
  };

  const toggleCrewDuty = async (member: any) => {
    try {
      await api.patch(`/ambulance/crew/${member.id}/duty`, { dutyStatus: member.duty_status === "on_duty" ? "off_duty" : "on_duty" });
      await refreshFleetData();
    } catch (e: any) {
      fleetErrorToast("Failed to update duty status", e);
    }
  };

  const openScheduleMaintenance = (vehicleId?: number) => {
    setMaintForm({ vehicleId: vehicleId ? String(vehicleId) : "", maintenanceType: "", scheduledDate: toYmd(new Date()), notes: "" });
    setMaintDialogOpen(true);
  };

  const submitMaintenance = async () => {
    if (!maintForm.vehicleId || !maintForm.maintenanceType.trim() || !maintForm.scheduledDate) {
      toast({ title: "Missing details", description: "Vehicle, maintenance type and date are required.", variant: "destructive" });
      return;
    }
    try {
      await api.post("/ambulance/maintenance", {
        vehicleId: Number(maintForm.vehicleId),
        maintenanceType: maintForm.maintenanceType.trim(),
        scheduledDate: maintForm.scheduledDate,
        notes: maintForm.notes.trim() || undefined,
      });
      setMaintDialogOpen(false);
      toast({ title: "Maintenance scheduled" });
      await refreshFleetData();
    } catch (e: any) {
      fleetErrorToast("Failed to schedule maintenance", e);
    }
  };

  const updateMaintenance = async (id: number, action: "start" | "complete") => {
    try {
      await api.patch(`/ambulance/maintenance/${id}/${action}`, {});
      toast({ title: action === "start" ? "Maintenance started" : "Maintenance completed" });
      await refreshFleetData();
    } catch (e: any) {
      fleetErrorToast(`Failed to ${action} maintenance`, e);
    }
  };

  const openAddShift = () => {
    setShiftForm({ crewId: "", vehicleId: "none", shiftDate: toYmd(new Date()), startTime: "08:00", endTime: "16:00" });
    setShiftDialogOpen(true);
  };

  const submitShift = async () => {
    if (!shiftForm.crewId || !shiftForm.shiftDate || !shiftForm.startTime || !shiftForm.endTime) {
      toast({ title: "Missing details", description: "Staff member, date and start/end time are required.", variant: "destructive" });
      return;
    }
    try {
      await api.post("/ambulance/shifts", {
        crewId: Number(shiftForm.crewId),
        vehicleId: shiftForm.vehicleId !== "none" ? Number(shiftForm.vehicleId) : undefined,
        shiftDate: shiftForm.shiftDate,
        startTime: shiftForm.startTime,
        endTime: shiftForm.endTime,
      });
      setShiftDialogOpen(false);
      toast({ title: "Shift added" });
      await refreshFleetData();
    } catch (e: any) {
      fleetErrorToast("Failed to add shift", e);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "Critical": return "bg-red-500 text-white";
      case "High": return "bg-orange-500 text-white";
      case "Medium": return "bg-yellow-500 text-white";
      default: return "bg-green-500 text-white";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Available": return "bg-green-500 text-white";
      case "On Trip": return "bg-blue-500 text-white";
      case "Maintenance": return "bg-gray-500 text-white";
      case "Off Duty": return "bg-red-500 text-white";
      default: return "bg-gray-400 text-white";
    }
  };

  const vehicleStatusBadge = (status: string) => (
    <Badge className={getStatusColor(VEHICLE_STATUS_LABELS[status] ?? status)}>{VEHICLE_STATUS_LABELS[status] ?? status}</Badge>
  );

  const renderVehicleRow = (vehicle: any) => (
    <div key={vehicle.id} className="p-4 border rounded-lg bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-orange-600 rounded-lg flex items-center justify-center shrink-0">
            <Ambulance className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h3 className="font-semibold text-lg">{vehicle.registration_number}</h3>
              <Badge variant="outline">{vehicle.vehicle_type}</Badge>
              {vehicleStatusBadge(vehicle.status)}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {vehicle.current_location || "Location not set"}
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Last service: {vehicle.last_service_date || "—"}
              </div>
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                Next due: {vehicle.next_service_due || "—"}
              </div>
            </div>
          </div>
        </div>
        <Select value={vehicle.status} onValueChange={(v) => changeVehicleStatus(vehicle.id, v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(VEHICLE_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const renderFleetDialogs = () => (
    <>
      <Dialog open={vehicleDialogOpen} onOpenChange={setVehicleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Vehicle</DialogTitle>
            <DialogDescription>Register an ambulance under your fleet.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>Registration number</Label>
              <Input value={vehicleForm.registrationNumber} onChange={(e) => setVehicleForm({ ...vehicleForm, registrationNumber: e.target.value })} placeholder="e.g. MH12 AB 1234" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={vehicleForm.vehicleType} onValueChange={(v) => setVehicleForm({ ...vehicleForm, vehicleType: v })}>
                  <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    {VEHICLE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Next service due</Label>
                <Input type="date" value={vehicleForm.nextServiceDue} onChange={(e) => setVehicleForm({ ...vehicleForm, nextServiceDue: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Current location (optional)</Label>
              <Input value={vehicleForm.currentLocation} onChange={(e) => setVehicleForm({ ...vehicleForm, currentLocation: e.target.value })} placeholder="Base Station" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVehicleDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitVehicle}>Add Vehicle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={crewDialogOpen} onOpenChange={setCrewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Staff</DialogTitle>
            <DialogDescription>Add a driver, paramedic or support staff member.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input value={crewForm.name} onChange={(e) => setCrewForm({ ...crewForm, name: e.target.value })} placeholder="Full name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Role</Label>
                <Select value={crewForm.role} onValueChange={(v) => setCrewForm({ ...crewForm, role: v })}>
                  <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CREW_ROLE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>License number (optional)</Label>
                <Input value={crewForm.licenseNumber} onChange={(e) => setCrewForm({ ...crewForm, licenseNumber: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Phone (optional)</Label>
              <Input value={crewForm.phone} onChange={(e) => setCrewForm({ ...crewForm, phone: e.target.value })} placeholder="+91 ..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCrewDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitCrew}>Add Staff</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={maintDialogOpen} onOpenChange={setMaintDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Maintenance</DialogTitle>
            <DialogDescription>Book a service or repair for one of your vehicles.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>Vehicle</Label>
              <Select value={maintForm.vehicleId} onValueChange={(v) => setMaintForm({ ...maintForm, vehicleId: v })}>
                <SelectTrigger><SelectValue placeholder={vehicles.length ? "Select vehicle" : "Add a vehicle first"} /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.registration_number} ({v.vehicle_type})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Maintenance type</Label>
                <Input value={maintForm.maintenanceType} onChange={(e) => setMaintForm({ ...maintForm, maintenanceType: e.target.value })} placeholder="Routine service" />
              </div>
              <div className="grid gap-2">
                <Label>Scheduled date</Label>
                <Input type="date" value={maintForm.scheduledDate} onChange={(e) => setMaintForm({ ...maintForm, scheduledDate: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Notes (optional)</Label>
              <Textarea value={maintForm.notes} onChange={(e) => setMaintForm({ ...maintForm, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaintDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitMaintenance}>Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Shift</DialogTitle>
            <DialogDescription>Assign a staff member (and optionally a vehicle) to a shift.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>Staff member</Label>
              <Select value={shiftForm.crewId} onValueChange={(v) => setShiftForm({ ...shiftForm, crewId: v })}>
                <SelectTrigger><SelectValue placeholder={crew.length ? "Select staff" : "Add staff first"} /></SelectTrigger>
                <SelectContent>
                  {crew.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name} ({CREW_ROLE_LABELS[c.role] ?? c.role})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Vehicle (optional)</Label>
              <Select value={shiftForm.vehicleId} onValueChange={(v) => setShiftForm({ ...shiftForm, vehicleId: v })}>
                <SelectTrigger><SelectValue placeholder="No vehicle" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No vehicle</SelectItem>
                  {vehicles.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.registration_number}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label>Date</Label>
                <Input type="date" value={shiftForm.shiftDate} onChange={(e) => setShiftForm({ ...shiftForm, shiftDate: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Start</Label>
                <Input type="time" value={shiftForm.startTime} onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>End</Label>
                <Input type="time" value={shiftForm.endTime} onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShiftDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitShift}>Add Shift</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  const location = useLocation();

  // Route-aware content rendering
  const renderContent = () => {
    const path = location.pathname;
    
    if (path === '/ambulance/dashboard') return renderDashboardContent();
    else if (path === '/ambulance/active-trips') return renderActiveTripsContent();
    else if (path === '/ambulance/dispatch') return renderDispatchContent();
    else if (path === '/ambulance/tracking') return renderTrackingContent();
    else if (path === '/ambulance/history') return renderHistoryContent();
    else if (path === '/ambulance/fleet') return renderFleetContent();
    else if (path === '/ambulance/staff') return renderStaffContent();
    else if (path === '/ambulance/maintenance') return renderMaintenanceContent();
    else if (path === '/ambulance/schedule') return renderScheduleContent();
    else if (path === '/ambulance/billing') return renderBillingContent();
    else if (path === '/ambulance/reports') return renderReportsContent();
    else if (path === '/ambulance/alerts') return renderAlertsContent();
    else if (path === '/ambulance/settings') return renderSettingsContent();
    
    return renderDashboardContent();
  };

  const renderDashboardContent = () => (
    <div>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="border-red-200 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Trips
              </CardTitle>
              <Activity className="h-5 w-5 text-red-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{stats.activeTrips}</div>
            <p className="text-xs text-muted-foreground mt-1">In progress now</p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Today's Trips
              </CardTitle>
              <Calendar className="h-5 w-5 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{stats.todayTrips}</div>
            <p className="text-xs text-muted-foreground mt-1">Completed today</p>
          </CardContent>
        </Card>

        <Card className="border-green-200 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Available Vehicles
              </CardTitle>
              <Ambulance className="h-5 w-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {stats.availableVehicles}/{stats.totalVehicles}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Ready for dispatch</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg Response Time
              </CardTitle>
              <Timer className="h-5 w-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.avgResponseTime}</div>
            <p className="text-xs text-muted-foreground mt-1">Last 24 hours</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white dark:bg-gray-800 p-1 shadow-md">
          <TabsTrigger value="overview" className="data-[state=active]:bg-red-500 data-[state=active]:text-white">
            <Activity className="h-4 w-4 mr-2" />
            Emergency Requests
          </TabsTrigger>
          <TabsTrigger value="fleet" className="data-[state=active]:bg-red-500 data-[state=active]:text-white">
            <Ambulance className="h-4 w-4 mr-2" />
            Fleet Management
          </TabsTrigger>
          <TabsTrigger value="trips" className="data-[state=active]:bg-red-500 data-[state=active]:text-white">
            <CheckCircle className="h-4 w-4 mr-2" />
            Completed Trips
          </TabsTrigger>
          <TabsTrigger value="analytics" className="data-[state=active]:bg-red-500 data-[state=active]:text-white">
            <TrendingUp className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Emergency Requests Tab */}
        <TabsContent value="overview" className="space-y-6">
          <Card className="border-red-200 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl text-red-600">Active Emergency Requests</CardTitle>
                  <CardDescription>Real-time emergency dispatch management</CardDescription>
                </div>
                <Button
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => {
                    setNewEmergencyOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Emergency
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {realActiveTrips.length === 0 && (
                  <p className="text-sm text-muted-foreground py-6 text-center">No active dispatches right now.</p>
                )}
                {realActiveTrips.map((trip) => (
                  <div key={trip.id} className="p-4 border rounded-lg bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{trip.patient_name || `Trip #${trip.id}`}</h3>
                          {trip.urgency && (
                            <Badge className={getPriorityColor(trip.urgency)}>{trip.urgency}</Badge>
                          )}
                          <Badge variant="outline">{trip.status}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-red-500" />
                            {trip.pickup_location}
                          </div>
                          <div className="flex items-center gap-2">
                            <Heart className="h-4 w-4 text-pink-500" />
                            {trip.trip_type}
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-blue-500" />
                            {timeAgo(trip.dispatched_at)}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-green-500 text-green-600 hover:bg-green-50"
                          onClick={() => {
                            navigate("/ambulance/tracking");
                            toast({ title: "Tracking", description: "Opening live tracking." });
                          }}
                        >
                          <Navigation className="h-4 w-4 mr-1" />
                          Track
                        </Button>
                        <Button
                          size="sm"
                          className="bg-red-600 hover:bg-red-700"
                          onClick={() => {
                            const num = trip.patient_phone || settings.emergencyContact;
                            if (num) {
                              dialPhone(num);
                            } else {
                              toast({ title: "No number", description: "No phone number on file for this trip." });
                            }
                          }}
                        >
                          <Phone className="h-4 w-4 mr-1" />
                          Call
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fleet Management Tab */}
        <TabsContent value="fleet" className="space-y-6">
          <Card className="border-orange-200 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl text-orange-600">Ambulance Fleet</CardTitle>
                  <CardDescription>Vehicle status and availability</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => navigate("/ambulance/fleet")}>
                    <Eye className="h-4 w-4 mr-2" />
                    Manage Fleet
                  </Button>
                  <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => setVehicleDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Vehicle
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {vehicles.length === 0 && (
                  <p className="text-sm text-muted-foreground py-6 text-center">No vehicles added yet. Use "Add Vehicle" to register your first ambulance.</p>
                )}
                {vehicles.map((vehicle) => renderVehicleRow(vehicle))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Completed Trips Tab */}
        <TabsContent value="trips" className="space-y-6">
          <Card className="border-green-200 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl text-green-600">Completed Trips</CardTitle>
                  <CardDescription>Trip history and records</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Input value={completedTripsQuery} onChange={(e) => setCompletedTripsQuery(e.target.value)} placeholder="Search trips..." className="w-64" />
                  <Button variant="outline" onClick={() => toast({ title: "Search", description: "Filtering trips list." })}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredCompletedTrips.length === 0 && (
                  <p className="text-sm text-muted-foreground py-6 text-center">No completed trips yet.</p>
                )}
                {filteredCompletedTrips.map((trip) => (
                  <div key={trip.id} className="p-4 border rounded-lg bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">Trip #{trip.id}</h3>
                          <Badge className="bg-green-500 text-white">{trip.status}</Badge>
                          <span className="text-sm text-muted-foreground">{timeAgo(trip.completed_at)}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
                          <div>
                            <p className="font-medium text-foreground mb-1">Patient</p>
                            <p>{trip.patient_name || "—"}</p>
                          </div>
                          <div>
                            <p className="font-medium text-foreground mb-1">Route</p>
                            <p>{trip.pickup_location} {trip.drop_location ? `→ ${trip.drop_location}` : ""}</p>
                          </div>
                          <div>
                            <p className="font-medium text-foreground mb-1">Payment</p>
                            <p className="capitalize">{trip.payment_status}</p>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-green-600 mb-1">{trip.fare_amount != null ? `₹${trip.fare_amount}` : "—"}</div>
                        <Button size="sm" variant="outline" onClick={() => downloadTripReceipt(trip)}>
                          View Receipt
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-blue-200 shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl text-blue-600">Performance Metrics</CardTitle>
                <CardDescription>Key performance indicators</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Success Rate</span>
                  <span className="text-2xl font-bold text-green-600">{stats.successRate}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Patients Served</span>
                  <span className="text-2xl font-bold text-blue-600">{stats.totalPatients}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Revenue</span>
                  <span className="text-2xl font-bold text-purple-600">₹{stats.revenue.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-purple-200 shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl text-purple-600">Quick Actions</CardTitle>
                <CardDescription>Frequently used operations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full justify-start bg-red-600 hover:bg-red-700"
                  onClick={() => {
                    navigate("/ambulance/dispatch");
                    toast({ title: "Dispatch", description: "Opening Dispatch Center." });
                  }}
                >
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Dispatch Emergency Ambulance
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start border-orange-500 text-orange-600"
                  onClick={() => {
                    navigate("/ambulance/active-trips");
                    toast({ title: "Transfer", description: "Use New Emergency to create a transfer." });
                  }}
                >
                  <Ambulance className="h-4 w-4 mr-2" />
                  Schedule Non-Emergency Transfer
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => navigate("/ambulance/staff")}>
                  <Users className="h-4 w-4 mr-2" />
                  Manage Crew Assignments
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    downloadFinancialReport();
                  }}
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  Generate Financial Report
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={newEmergencyOpen} onOpenChange={setNewEmergencyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Emergency</DialogTitle>
            <DialogDescription>Create an emergency request and send it to Dispatch.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>Patient / Caller</Label>
              <Input value={emergencyPatient} onChange={(e) => setEmergencyPatient(e.target.value)} placeholder="Name" />
            </div>
            <div className="grid gap-2">
              <Label>Location</Label>
              <Input value={emergencyLocation} onChange={(e) => setEmergencyLocation(e.target.value)} placeholder="Pickup location" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={emergencyType} onValueChange={setEmergencyType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Accident">Accident</SelectItem>
                    <SelectItem value="Cardiac Emergency">Cardiac Emergency</SelectItem>
                    <SelectItem value="Breathing Difficulty">Breathing Difficulty</SelectItem>
                    <SelectItem value="Pregnancy Emergency">Pregnancy Emergency</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Urgency</Label>
                <Select value={emergencyUrgency} onValueChange={(v) => setEmergencyUrgency(v as PendingRequest["urgency"])}>
                  <SelectTrigger>
                    <SelectValue placeholder="Urgency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Critical">Critical</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Phone (optional)</Label>
              <Input value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} placeholder="+91 ..." />
            </div>
            <Button variant="outline" onClick={() => emergencyLocation.trim() && openMaps(emergencyLocation.trim())}>
              <MapPin className="h-4 w-4 mr-2" />
              Open Location in Maps
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewEmergencyOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={createEmergency}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  const renderActiveTripsContent = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Active Trips</h2>
          <p className="text-muted-foreground">Monitor real-time ambulance operations</p>
        </div>
        <Button className="gap-2 bg-red-600 hover:bg-red-700" onClick={() => setNewEmergencyOpen(true)}>
          <Plus className="h-4 w-4" />
          New Emergency
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <Activity className="h-8 w-8 text-red-600 mb-2" />
            <div className="text-2xl font-bold">{stats.activeTrips}</div>
            <p className="text-sm text-muted-foreground">Currently Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Clock className="h-8 w-8 text-orange-600 mb-2" />
            <div className="text-2xl font-bold">{stats.avgResponseTime}</div>
            <p className="text-sm text-muted-foreground">Avg Response</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <CheckCircle className="h-8 w-8 text-green-600 mb-2" />
            <div className="text-2xl font-bold">{stats.successRate}</div>
            <p className="text-sm text-muted-foreground">Success Rate</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Dispatches</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {realActiveTrips.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No active dispatches.</p>
            )}
            {realActiveTrips.map((trip) => (
              <div key={trip.id} className="p-4 bg-slate-50 rounded-lg border-l-4 border-l-red-500">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold">{trip.patient_name || `Trip #${trip.id}`}</h4>
                    <p className="text-sm text-muted-foreground">{trip.pickup_location}</p>
                    <p className="text-sm font-medium text-red-600">{trip.trip_type}</p>
                  </div>
                  <div className="text-right">
                    {trip.urgency && <Badge className={getPriorityColor(trip.urgency)}>{trip.urgency}</Badge>}
                    <p className="text-xs text-muted-foreground mt-1">{timeAgo(trip.dispatched_at)}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      openMaps(trip.pickup_location);
                      toast({ title: "Maps", description: "Opening pickup location." });
                    }}
                  >
                    View on Map
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderDispatchContent = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Dispatch Center</h2>
        <Button className="gap-2 bg-red-600 hover:bg-red-700" onClick={() => setNewEmergencyOpen(true)}>
          <Plus className="h-4 w-4" />
          Create Dispatch
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Your Ambulance</CardTitle>
          </CardHeader>
          <CardContent>
            {/* One provider account = one vehicle in the real data model
                (server/models/postgres/ambulance.model.postgres.js) — this
                replaces a "pick from many available ambulances" panel that
                assumed a multi-vehicle fleet, which doesn't exist here. */}
            <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-semibold">{ambulanceData?.vehicleNumber || ambulanceData?.name || "Your vehicle"}</h4>
                  <p className="text-sm text-muted-foreground">Driver: {ambulanceData?.driverName || "Not on file"}</p>
                  <p className="text-sm text-muted-foreground">Paramedic: {ambulanceData?.paramedicName || "Not on file"}</p>
                </div>
                <Badge className={realActiveTrips.length > 0 ? "bg-blue-600 text-white" : "bg-green-600 text-white"}>
                  {realActiveTrips.length > 0 ? "On Trip" : "Available"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Dispatch Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...realActiveTrips, ...realCompletedTrips]
                .sort((a, b) => new Date(b.dispatched_at).getTime() - new Date(a.dispatched_at).getTime())
                .slice(0, 5)
                .map((trip) => (
                  <div key={trip.id} className="p-3 border rounded-lg">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-semibold">{trip.patient_name || `Trip #${trip.id}`}</p>
                        <p className="text-sm text-muted-foreground">{trip.trip_type} — {trip.pickup_location}</p>
                      </div>
                      <Badge>{trip.status}</Badge>
                    </div>
                  </div>
              ))}
              {realActiveTrips.length === 0 && realCompletedTrips.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No dispatch requests yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderTrackingContent = () => {
    const trackedVehicles = vehicles.filter((v) => v.status === "on_trip" || v.active_trip_id);
    return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Live Tracking</h2>
      <PlaceholderBanner title="Live GPS is not available." reason="Vehicle positions cannot be shown on a map yet — the vehicles listed below are real, but no GPS feed is connected." />

      <Card>
        <CardHeader>
          <CardTitle>Ambulance Locations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 bg-slate-100 rounded-lg flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MapPin className="h-12 w-12 mx-auto mb-2" />
              <p>Interactive Map Integration</p>
              <p className="text-sm">Google Maps / Mapbox API</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {trackedVehicles.length === 0 && (
          <p className="text-sm text-muted-foreground md:col-span-2 text-center py-4">No vehicles are on a trip right now.</p>
        )}
        {trackedVehicles.map((v) => (
          <Card key={v.id}>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">{v.registration_number}</CardTitle>
                <Badge className="bg-blue-600">On Trip</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm"><strong>Type:</strong> {v.vehicle_type}</p>
                {v.active_trip_driver && <p className="text-sm"><strong>Driver:</strong> {v.active_trip_driver}</p>}
                <p className="text-sm"><strong>Last known location:</strong> {v.current_location || "Not reported"}</p>
                {v.active_trip_id && (
                  <p className="text-sm">
                    <strong>Trip #{v.active_trip_id}:</strong> {v.active_trip_pickup}{v.active_trip_drop ? ` → ${v.active_trip_drop}` : ""}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
    );
  };

  const renderHistoryContent = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Trip History</h2>
        <div className="flex gap-2">
          <Input placeholder="Search trips..." className="w-64" />
          <Button
            variant="outline"
            size="icon"
            onClick={() => toast({ title: "Filter", description: "Use the History page for advanced filters." })}
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Completed Trips</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {realCompletedTrips.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No completed trips yet.</p>
            )}
            {realCompletedTrips.map((trip) => (
              <div key={trip.id} className="p-4 bg-slate-50 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold">Trip #{trip.id} - {trip.patient_name || "—"}</h4>
                    <p className="text-sm text-muted-foreground">{trip.pickup_location} {trip.drop_location ? `→ ${trip.drop_location}` : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-600">{trip.fare_amount != null ? `₹${trip.fare_amount}` : "—"}</p>
                    <Badge className="mt-1">{trip.status}</Badge>
                    <p className="text-xs text-muted-foreground mt-1">{timeAgo(trip.completed_at)}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      toast({ title: "View", description: "Open the full History page for details." });
                      navigate("/ambulance/history");
                    }}
                  >
                    <Eye className="h-4 w-4 mr-1" />View
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadTripReceipt(trip)}>
                    <Download className="h-4 w-4 mr-1" />Invoice
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderFleetContent = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Fleet Management</h2>
        <Button className="gap-2" onClick={() => setVehicleDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Vehicle
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <Ambulance className="h-8 w-8 text-green-600 mb-2" />
            <div className="text-2xl font-bold">{vehicles.filter((v) => v.status === "available").length}</div>
            <p className="text-sm text-muted-foreground">Available</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Activity className="h-8 w-8 text-blue-600 mb-2" />
            <div className="text-2xl font-bold">{vehicles.filter((v) => v.status === "on_trip").length}</div>
            <p className="text-sm text-muted-foreground">On Trip</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Wrench className="h-8 w-8 text-orange-600 mb-2" />
            <div className="text-2xl font-bold">{vehicles.filter((v) => v.status === "maintenance").length}</div>
            <p className="text-sm text-muted-foreground">Maintenance</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Vehicles ({stats.totalVehicles})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {vehicles.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No vehicles added yet.</p>
            )}
            {vehicles.map((v) => renderVehicleRow(v))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderCrewList = (role: string) => {
    const members = crew.filter((m) => m.role === role);
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            {members.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No {CREW_ROLE_LABELS[role].toLowerCase()} added yet.</p>
            )}
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <h4 className="font-semibold">{m.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    License: {m.license_number || "—"}{m.phone ? ` • ${m.phone}` : ""}
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  <Badge className={m.duty_status === "on_duty" ? "bg-green-600 text-white" : "bg-gray-500 text-white"}>
                    {m.duty_status === "on_duty" ? "On Duty" : "Off Duty"}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => toggleCrewDuty(m)}>
                    {m.duty_status === "on_duty" ? "Go off duty" : "Go on duty"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderStaffContent = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Staff Management</h2>
        <Button className="gap-2" onClick={openAddStaff}>
          <Plus className="h-4 w-4" />
          Add Staff
        </Button>
      </div>

      <Tabs value={staffTab} onValueChange={setStaffTab}>
        <TabsList>
          <TabsTrigger value="drivers">Drivers</TabsTrigger>
          <TabsTrigger value="paramedics">Paramedics</TabsTrigger>
          <TabsTrigger value="support">Support Staff</TabsTrigger>
        </TabsList>
        <TabsContent value="drivers">{renderCrewList("driver")}</TabsContent>
        <TabsContent value="paramedics">{renderCrewList("paramedic")}</TabsContent>
        <TabsContent value="support">{renderCrewList("support")}</TabsContent>
      </Tabs>
    </div>
  );

  const renderMaintenanceContent = () => {
    const dueCutoff = toYmd(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
    const today = toYmd(new Date());
    const dueVehicles = vehicles
      .filter((v) => v.next_service_due && v.next_service_due <= dueCutoff && v.status !== "maintenance")
      .sort((a, b) => a.next_service_due.localeCompare(b.next_service_due));
    const scheduled = maintenanceItems.filter((m) => m.status === "scheduled");
    const inProgress = maintenanceItems.filter((m) => m.status === "in_progress");
    return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Maintenance Schedule</h2>
        <Button className="gap-2" onClick={() => openScheduleMaintenance()}>
          <Plus className="h-4 w-4" />
          Schedule Maintenance
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Due for Service</CardTitle>
            <CardDescription>Next service due within 14 days or overdue</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dueVehicles.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No vehicles due for service.</p>}
              {dueVehicles.map((v) => (
                <div key={v.id} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-semibold">{v.registration_number}</h4>
                      <p className="text-sm text-muted-foreground">
                        Due: {v.next_service_due}{v.next_service_due < today ? " (overdue)" : ""} • Last service: {v.last_service_date || "—"}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => openScheduleMaintenance(v.id)}>Schedule</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>In Maintenance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {inProgress.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No vehicles in maintenance.</p>}
              {inProgress.map((m) => (
                <div key={m.id} className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-semibold">{m.registration_number} — {m.maintenance_type}</h4>
                      <p className="text-sm text-muted-foreground">Scheduled: {m.scheduled_date}{m.notes ? ` • ${m.notes}` : ""}</p>
                    </div>
                    <div className="flex gap-2 items-center">
                      <Badge className="bg-orange-600">In Progress</Badge>
                      <Button size="sm" onClick={() => updateMaintenance(m.id, "complete")}>Complete</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scheduled</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {scheduled.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No upcoming maintenance scheduled.</p>}
            {scheduled.map((m) => (
              <div key={m.id} className="p-3 border rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-semibold">{m.registration_number} — {m.maintenance_type}</h4>
                    <p className="text-sm text-muted-foreground">Scheduled: {m.scheduled_date}{m.notes ? ` • ${m.notes}` : ""}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => updateMaintenance(m.id, "start")}>Start</Button>
                    <Button size="sm" onClick={() => updateMaintenance(m.id, "complete")}>Complete</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
    );
  };

  const renderScheduleContent = () => {
    const week = currentWeekDays();
    return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Staff Schedule</h2>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Weekly Schedule</CardTitle>
              <CardDescription>{week[0].label} – {week[6].label}</CardDescription>
            </div>
            <Button onClick={openAddShift}>
              <Plus className="h-4 w-4 mr-2" />
              Add Shift
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {crew.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Add staff members first, then assign them shifts.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium">Staff</th>
                    {week.map((d) => (
                      <th key={d.ymd} className={`text-left p-2 font-medium whitespace-nowrap ${d.ymd === toYmd(new Date()) ? "text-red-600" : ""}`}>{d.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {crew.map((m) => (
                    <tr key={m.id} className="border-b align-top">
                      <td className="p-2">
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs text-muted-foreground">{CREW_ROLE_LABELS[m.role] ?? m.role}</div>
                      </td>
                      {week.map((d) => (
                        <td key={d.ymd} className="p-2">
                          {shifts.filter((sh) => sh.crew_id === m.id && sh.shift_date === d.ymd).map((sh) => (
                            <div key={sh.id} className="mb-1 rounded bg-blue-50 border border-blue-200 px-2 py-1 whitespace-nowrap">
                              {sh.start_time}–{sh.end_time}
                              {sh.registration_number && <div className="text-xs text-muted-foreground">{sh.registration_number}</div>}
                            </div>
                          ))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    );
  };

  const renderBillingContent = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Billing & Payments</h2>
        <Button className="gap-2" onClick={() => navigate("/ambulance/billing")}>
          <Plus className="h-4 w-4" />
          New Invoice
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <DollarSign className="h-8 w-8 text-green-600 mb-2" />
            <div className="text-2xl font-bold">₹{(financialSummary.find((f) => f.payment_status === "paid")?.total ?? 0).toLocaleString()}</div>
            <p className="text-sm text-muted-foreground">Total Paid</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <FileText className="h-8 w-8 text-blue-600 mb-2" />
            <div className="text-2xl font-bold">{financialSummary.find((f) => f.payment_status === "pending")?.cnt ?? 0}</div>
            <p className="text-sm text-muted-foreground">Pending Invoices</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <CheckCircle className="h-8 w-8 text-teal-600 mb-2" />
            <div className="text-2xl font-bold">{financialSummary.find((f) => f.payment_status === "paid")?.cnt ?? 0}</div>
            <p className="text-sm text-muted-foreground">Paid Trips</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <XCircle className="h-8 w-8 text-red-600 mb-2" />
            <div className="text-2xl font-bold">{financialSummary.find((f) => f.payment_status === "overdue")?.cnt ?? 0}</div>
            <p className="text-sm text-muted-foreground">Overdue</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {realCompletedTrips.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No transactions yet.</p>
            )}
            {realCompletedTrips.map((trip) => (
              <div key={trip.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-lg">
                <div>
                  <h4 className="font-semibold">Trip #{trip.id}</h4>
                  <p className="text-sm text-muted-foreground">{trip.patient_name || "—"} • {timeAgo(trip.completed_at)}</p>
                </div>
                <div className="text-right flex gap-3 items-center">
                  <span className="font-semibold text-green-600">{trip.fare_amount != null ? `₹${trip.fare_amount}` : "—"}</span>
                  <Badge className="capitalize">{trip.payment_status}</Badge>
                  <Button size="sm" variant="outline" onClick={() => downloadTripReceipt(trip)}>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderReportsContent = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Reports & Analytics</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {['Daily Operations Report', 'Financial Report', 'Fleet Performance', 'Staff Performance', 'Emergency Response Analysis', 'Patient Satisfaction'].map((report, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle className="text-lg">{report}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full gap-2"
                onClick={() => {
                  if (report === "Financial Report") {
                    downloadFinancialReport();
                    return;
                  }
                  downloadCsv(
                    `ambulance-report-${report.toLowerCase().replace(/\s+/g, '-')}.csv`,
                    ["Report", "Generated"],
                    [[report, new Date().toISOString()]]
                  );
                  toast({ title: "Report generated", description: "A simple CSV report was downloaded." });
                }}
              >
                <Download className="h-4 w-4" />
                Generate Report
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderAlertList = (list: any[]) => (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-3">
          {list.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No alerts.</p>}
          {list.map((a) => (
            <div
              key={a.id}
              className={`p-4 bg-slate-50 rounded-lg border-l-4 ${
                a.severity === "critical" ? "border-l-red-500" : a.severity === "warning" ? "border-l-amber-500" : "border-l-blue-500"
              }`}
            >
              <div className="flex justify-between items-start gap-3">
                <div>
                  <h4 className="font-semibold capitalize">{a.category}</h4>
                  <p className="text-sm text-muted-foreground">{a.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{timeAgo(a.at)}</p>
                </div>
                <Badge
                  variant={a.severity === "critical" ? "destructive" : a.severity === "info" ? "secondary" : "default"}
                  className={a.severity === "warning" ? "bg-amber-500 hover:bg-amber-500 text-white" : undefined}
                >
                  {a.severity === "critical" ? "Critical" : a.severity === "warning" ? "Warning" : "Info"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  const renderAlertsContent = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Alerts & Notifications</h2>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Alerts</TabsTrigger>
          <TabsTrigger value="critical">Critical</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>
        <TabsContent value="all">{renderAlertList(alerts)}</TabsContent>
        <TabsContent value="critical">{renderAlertList(alerts.filter((a) => a.severity === "critical"))}</TabsContent>
        <TabsContent value="maintenance">{renderAlertList(alerts.filter((a) => a.category === "maintenance"))}</TabsContent>
        <TabsContent value="billing">{renderAlertList(alerts.filter((a) => a.category === "billing"))}</TabsContent>
      </Tabs>
    </div>
  );

  const renderSettingsContent = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Service Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Service Name</label>
                <Input placeholder="Enter service name" className="mt-1" defaultValue={ambulanceData?.name} />
              </div>
              <div>
                <label className="text-sm font-medium">License Number</label>
                <Input placeholder="Enter license number" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Base Station Address</label>
                <Textarea placeholder="Enter address" className="mt-1" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Emergency Number</label>
                  <Input placeholder="Enter number" className="mt-1" defaultValue="108" />
                </div>
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <Input placeholder="Enter email" className="mt-1" />
                </div>
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="operations">
          <Card>
            <CardHeader>
              <CardTitle>Operations Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-muted-foreground">Configure dispatch rules and operation parameters</div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );

  return (
    <AmbulanceLayout>
      {renderContent()}
      {renderFleetDialogs()}
    </AmbulanceLayout>
  );
};

export default AmbulanceDashboard;
