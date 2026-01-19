import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AmbulanceLayout from "@/components/ambulance/AmbulanceLayout";
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
  Plus, Search, Filter, Calendar, Clock, Users, Ambulance,
  CheckCircle, FileText, Receipt, CreditCard, TrendingUp,
  UserCog, Bell, Settings, HelpCircle, ArrowLeft, Edit, Trash2,
  Eye, AlertCircle, Download, Upload, Activity, BarChart3,
  MapPin, Phone, Navigation, Wrench, Car, AlertTriangle
} from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  helper?: string;
}

type Id = string;

type ActiveTrip = {
  id: Id;
  patient: string;
  pickup: string;
  destination: string;
  status: "En Route" | "At Location" | "In Transit" | "Delayed" | "Completed";
  eta: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  phone?: string;
};

type PendingRequest = {
  id: Id;
  caller: string;
  phone?: string;
  location: string;
  urgency: "Critical" | "High" | "Medium" | "Low";
  time: string;
  type: string;
};

type AvailableAmbulance = {
  id: Id;
  type: string;
  location: string;
  status: "Available" | "Maintenance" | "On Trip";
  crew: string;
  phone?: string;
};

type TrackedAmbulance = {
  id: Id;
  driver: string;
  location: string;
  speed: string;
  eta: string;
  status: "Active" | "At Location" | "Returning";
  phone?: string;
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

type FleetVehicle = {
  id: Id;
  type: string;
  model: string;
  year: string;
  mileage: string;
  status: "Active" | "Maintenance" | "Retired";
  lastService: string;
};

type StaffMember = {
  id: Id;
  name: string;
  role: string;
  shift: string;
  status: "On Duty" | "Off Duty";
  phone: string;
};

type MaintenanceItem = {
  id: Id;
  vehicle: Id;
  type: string;
  dueDate: string;
  priority: "High" | "Medium" | "Low";
  status: "Pending" | "Overdue" | "Scheduled" | "In Progress" | "Completed";
};

type Invoice = {
  id: Id;
  patient: string;
  service: string;
  amount: string;
  date: string;
  status: "Paid" | "Pending" | "Overdue";
};

type AlertItem = {
  id: Id;
  type: string;
  message: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  time: string;
  status?: "Active" | "Acknowledged" | "Resolved";
};

type SettingsState = {
  gpsTracking: boolean;
  automaticDispatch: boolean;
  emergencyNotifications: boolean;
  serviceArea: string;
  emergencyResponseTime: string;
  maximumResponseRadius: string;
  baseLocation: string;
  criticalAlertResponseTime: string;
  maintenanceReminderDays: string;
  staffShiftReminderHours: string;
  emergencyContact: string;
};

type ScheduleEntry = {
  id: Id;
  day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  shift: "Day" | "Night";
  staffCount: number;
};

const STORAGE_KEYS = {
  activeTrips: "ambulance.activeTrips",
  pendingRequests: "ambulance.pendingRequests",
  availableAmbulances: "ambulance.availableAmbulances",
  trackedAmbulances: "ambulance.trackedAmbulances",
  tripHistory: "ambulance.tripHistory",
  fleet: "ambulance.fleet",
  staff: "ambulance.staff",
  maintenance: "ambulance.maintenance",
  schedule: "ambulance.schedule",
  invoices: "ambulance.invoices",
  alerts: "ambulance.alerts",
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

const useSeededLocalStorageState = <T,>(key: string, seed: T) => {
  const [state, setState] = useState<T>(() => {
    const existing = safeParseJson<T>(localStorage.getItem(key));
    if (existing !== null) return existing;
    writeJson(key, seed);
    return seed;
  });

  useEffect(() => {
    writeJson(key, state);
  }, [key, state]);

  return [state, setState] as const;
};

const makeId = (prefix: string) => `${prefix}${Math.random().toString(16).slice(2, 8)}${Date.now().toString(16).slice(-4)}`;
const createId = (prefix: string) => makeId(prefix);

const downloadCsv = (filename: string, headers: string[], rows: Array<Array<string | number>>) => {
  const escapeCell = (value: string | number) => {
    const asString = String(value ?? "");
    const escaped = asString.replace(/\"/g, '""');
    return /[\n\r,\"]/g.test(escaped) ? `"${escaped}"` : escaped;
  };
  const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\n");
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

const openMaps = (query: string) => {
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  window.open(url, "_blank", "noopener,noreferrer");
};

const dialPhone = (phone?: string) => {
  if (!phone) return false;
  window.location.href = `tel:${phone}`;
  return true;
};

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

// Ambulance Active Trips Page
export const AmbulanceActiveTripsPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const stats = [
    { title: "Active Trips", value: "8", helper: "Currently en route" },
    { title: "Emergency Calls", value: "12", helper: "Today" },
    { title: "Completed Today", value: "24", helper: "+15% from yesterday" },
    { title: "Average Response", value: "8.5 min", helper: "Response time" },
  ];

  const [activeTrips, setActiveTrips] = useSeededLocalStorageState<ActiveTrip[]>(STORAGE_KEYS.activeTrips, [
    { id: "AMB001", patient: "John Doe", pickup: "City Hospital", destination: "Medical Center", status: "En Route", eta: "5 mins", priority: "High", phone: "+91 9876543210" },
    { id: "AMB002", patient: "Jane Smith", pickup: "Home", destination: "Emergency Room", status: "At Location", eta: "Arrived", priority: "Critical", phone: "+91 9876543211" },
    { id: "AMB003", patient: "Bob Johnson", pickup: "Clinic", destination: "General Hospital", status: "En Route", eta: "12 mins", priority: "Medium", phone: "+91 9876543212" },
  ]);

  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [newTripOpen, setNewTripOpen] = useState(false);
  const [tripDetails, setTripDetails] = useState<ActiveTrip | null>(null);
  const [newTripDraft, setNewTripDraft] = useState<Omit<ActiveTrip, "id">>({
    patient: "",
    pickup: "",
    destination: "",
    status: "En Route",
    eta: "",
    priority: "High",
    phone: "",
  });

  const filteredTrips = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeTrips.filter((trip) => {
      const matchesPriority = priorityFilter === "all" ? true : trip.priority.toLowerCase() === priorityFilter;
      const matchesQuery =
        q.length === 0
          ? true
          : [trip.id, trip.patient, trip.pickup, trip.destination, trip.status].some((value) => value.toLowerCase().includes(q));
      return matchesPriority && matchesQuery;
    });
  }, [activeTrips, priorityFilter, query]);

  const createTrip = () => {
    if (!newTripDraft.patient.trim() || !newTripDraft.pickup.trim() || !newTripDraft.destination.trim()) {
      toast({ title: "Missing details", description: "Patient, pickup, and destination are required." });
      return;
    }
    const trip: ActiveTrip = {
      id: makeId("TRIP"),
      ...newTripDraft,
      eta: newTripDraft.eta.trim() || "--",
      phone: newTripDraft.phone?.trim() || undefined,
    };
    setActiveTrips((prev) => [trip, ...prev]);
    setNewTripOpen(false);
    setNewTripDraft({ patient: "", pickup: "", destination: "", status: "En Route", eta: "", priority: "High", phone: "" });
    toast({ title: "Trip created", description: `${trip.id} added to Active Trips.` });
  };

  return (
    <AmbulanceLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Active Trips</h1>
            <p className="text-muted-foreground">Monitor ongoing ambulance trips and real-time status</p>
          </div>
          <Dialog open={newTripOpen} onOpenChange={setNewTripOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Trip
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Trip</DialogTitle>
                <DialogDescription>Add a new active trip (minimal working demo).</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label>Patient</Label>
                  <Input value={newTripDraft.patient} onChange={(e) => setNewTripDraft((d) => ({ ...d, patient: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>Pickup</Label>
                  <Input value={newTripDraft.pickup} onChange={(e) => setNewTripDraft((d) => ({ ...d, pickup: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>Destination</Label>
                  <Input value={newTripDraft.destination} onChange={(e) => setNewTripDraft((d) => ({ ...d, destination: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Priority</Label>
                    <Select
                      value={newTripDraft.priority.toLowerCase()}
                      onValueChange={(value) =>
                        setNewTripDraft((d) => ({
                          ...d,
                          priority: value === "critical" ? "Critical" : value === "high" ? "High" : value === "medium" ? "Medium" : "Low",
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="critical">Critical</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>ETA</Label>
                    <Input value={newTripDraft.eta} onChange={(e) => setNewTripDraft((d) => ({ ...d, eta: e.target.value }))} placeholder="e.g. 10 mins" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Contact Phone (optional)</Label>
                  <Input value={newTripDraft.phone ?? ""} onChange={(e) => setNewTripDraft((d) => ({ ...d, phone: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNewTripOpen(false)}>Cancel</Button>
                <Button onClick={createTrip}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <StatGrid items={stats} />

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Active Ambulance Trips</CardTitle>
              <div className="flex gap-2">
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search trips..." className="w-64" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trip ID</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>ETA</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTrips.map((trip) => (
                  <TableRow key={trip.id}>
                    <TableCell className="font-medium">{trip.id}</TableCell>
                    <TableCell>{trip.patient}</TableCell>
                    <TableCell>{trip.pickup}</TableCell>
                    <TableCell>{trip.destination}</TableCell>
                    <TableCell>
                      <Badge variant={
                        trip.status === "En Route" ? "default" :
                        trip.status === "At Location" ? "secondary" : "destructive"
                      }>
                        {trip.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{trip.eta}</TableCell>
                    <TableCell>
                      <Badge variant={
                        trip.priority === "Critical" ? "destructive" :
                        trip.priority === "High" ? "default" : "secondary"
                      }>
                        {trip.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setTripDetails(trip)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (!dialPhone(trip.phone)) {
                              toast({ title: "No phone", description: "No contact number available for this trip." });
                            }
                          }}
                        >
                          <Phone className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            openMaps(`${trip.pickup} to ${trip.destination}`);
                            toast({ title: "Opened maps", description: "Route opened in a new tab." });
                          }}
                        >
                          <Navigation className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Dialog open={!!tripDetails} onOpenChange={(open) => !open && setTripDetails(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Trip Details</DialogTitle>
                </DialogHeader>
                {tripDetails && (
                  <div className="space-y-2 text-sm">
                    <div><span className="font-medium">Trip ID:</span> {tripDetails.id}</div>
                    <div><span className="font-medium">Patient:</span> {tripDetails.patient}</div>
                    <div><span className="font-medium">Route:</span> {tripDetails.pickup} → {tripDetails.destination}</div>
                    <div><span className="font-medium">Status:</span> {tripDetails.status}</div>
                    <div><span className="font-medium">ETA:</span> {tripDetails.eta}</div>
                    <div><span className="font-medium">Priority:</span> {tripDetails.priority}</div>
                    {tripDetails.phone && <div><span className="font-medium">Phone:</span> {tripDetails.phone}</div>}
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setTripDetails(null)}>Close</Button>
                  <Button
                    onClick={() => {
                      if (!tripDetails) return;
                      downloadCsv(
                        `trip-${tripDetails.id}.csv`,
                        ["Trip ID", "Patient", "Pickup", "Destination", "Status", "ETA", "Priority"],
                        [[tripDetails.id, tripDetails.patient, tripDetails.pickup, tripDetails.destination, tripDetails.status, tripDetails.eta, tripDetails.priority]]
                      );
                      toast({ title: "Exported", description: "Trip CSV downloaded." });
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                  <Button onClick={() => navigate("/ambulance/tracking")}>Go to Tracking</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    </AmbulanceLayout>
  );
};

// Ambulance Dispatch Page
export const AmbulanceDispatchPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [pendingRequests, setPendingRequests] = useSeededLocalStorageState<PendingRequest[]>(STORAGE_KEYS.pendingRequests, [
    { id: "REQ001", caller: "Dr. Smith", phone: "+91 9000000001", location: "123 Main St, City", urgency: "Critical", time: "2 mins ago", type: "Emergency" },
    { id: "REQ002", caller: "John Doe", phone: "+91 9000000002", location: "456 Oak Ave, City", urgency: "High", time: "5 mins ago", type: "Medical Transport" },
    { id: "REQ003", caller: "Jane Wilson", phone: "+91 9000000003", location: "789 Pine Rd, City", urgency: "Medium", time: "8 mins ago", type: "Non-emergency" },
  ]);

  const [availableAmbulances, setAvailableAmbulances] = useSeededLocalStorageState<AvailableAmbulance[]>(STORAGE_KEYS.availableAmbulances, [
    { id: "AMB001", type: "ALS", location: "Station A", status: "Available", crew: "2 paramedics", phone: "+91 9111111111" },
    { id: "AMB002", type: "BLS", location: "Station B", status: "Available", crew: "1 paramedic, 1 driver", phone: "+91 9222222222" },
    { id: "AMB003", type: "ALS", location: "Station C", status: "Maintenance", crew: "2 paramedics", phone: "+91 9333333333" },
  ]);

  const [callOpen, setCallOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const [selectedAmbulanceId, setSelectedAmbulanceId] = useState<string>("");
  const [newCallDraft, setNewCallDraft] = useState<Omit<PendingRequest, "id" | "time">>({
    caller: "",
    phone: "",
    location: "",
    urgency: "High",
    type: "Emergency",
  });

  const createEmergencyCall = () => {
    if (!newCallDraft.caller.trim() || !newCallDraft.location.trim()) {
      toast({ title: "Missing details", description: "Caller and location are required." });
      return;
    }
    const req: PendingRequest = {
      id: makeId("REQ"),
      caller: newCallDraft.caller.trim(),
      phone: newCallDraft.phone?.trim() || undefined,
      location: newCallDraft.location.trim(),
      urgency: newCallDraft.urgency,
      type: newCallDraft.type.trim() || "Emergency",
      time: "Just now",
    };
    setPendingRequests((prev) => [req, ...prev]);
    setCallOpen(false);
    setNewCallDraft({ caller: "", phone: "", location: "", urgency: "High", type: "Emergency" });
    toast({ title: "Emergency call logged", description: `${req.id} added to pending requests.` });
  };

  const startDispatch = (request: PendingRequest) => {
    setSelectedRequest(request);
    setSelectedAmbulanceId("");
    setDispatchOpen(true);
  };

  const dispatchSelected = () => {
    if (!selectedRequest) return;
    if (!selectedAmbulanceId) {
      toast({ title: "Select an ambulance", description: "Choose an available ambulance to dispatch." });
      return;
    }
    const ambulance = availableAmbulances.find((a) => a.id === selectedAmbulanceId);
    if (!ambulance) {
      toast({ title: "Not found", description: "Selected ambulance not found." });
      return;
    }
    if (ambulance.status !== "Available") {
      toast({ title: "Not available", description: "Selected ambulance is not available." });
      return;
    }

    setPendingRequests((prev) => prev.filter((r) => r.id !== selectedRequest.id));
    setAvailableAmbulances((prev) => prev.map((a) => (a.id === ambulance.id ? { ...a, status: "On Trip" } : a)));
    setDispatchOpen(false);
    setSelectedRequest(null);
    toast({ title: "Dispatched", description: `Dispatched ${ambulance.id} to ${selectedRequest.location}.` });
    navigate("/ambulance/active-trips");
  };

  return (
    <AmbulanceLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dispatch Center</h1>
            <p className="text-muted-foreground">Manage emergency calls and ambulance assignments</p>
          </div>
          <Button onClick={() => setCallOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Emergency Call
          </Button>
        </div>

        <Dialog open={callOpen} onOpenChange={setCallOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Emergency Call</DialogTitle>
              <DialogDescription>Log a new call into Pending Requests.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label>Caller</Label>
                <Input value={newCallDraft.caller} onChange={(e) => setNewCallDraft((d) => ({ ...d, caller: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Phone (optional)</Label>
                <Input value={newCallDraft.phone ?? ""} onChange={(e) => setNewCallDraft((d) => ({ ...d, phone: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Location</Label>
                <Input value={newCallDraft.location} onChange={(e) => setNewCallDraft((d) => ({ ...d, location: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Urgency</Label>
                  <Select
                    value={newCallDraft.urgency.toLowerCase()}
                    onValueChange={(value) =>
                      setNewCallDraft((d) => ({
                        ...d,
                        urgency: value === "critical" ? "Critical" : value === "high" ? "High" : value === "medium" ? "Medium" : "Low",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Urgency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Type</Label>
                  <Input value={newCallDraft.type} onChange={(e) => setNewCallDraft((d) => ({ ...d, type: e.target.value }))} placeholder="Emergency / Transport" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCallOpen(false)}>Cancel</Button>
              <Button onClick={createEmergencyCall}>Add Call</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Pending Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-orange-600">12</p>
              <p className="text-xs text-muted-foreground mt-1">Awaiting dispatch</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Available Ambulances</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">8</p>
              <p className="text-xs text-muted-foreground mt-1">Ready for dispatch</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Response Time</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-blue-600">6.2 min</p>
              <p className="text-xs text-muted-foreground mt-1">Average today</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Pending Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingRequests.map((request) => (
                  <div key={request.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{request.caller}</p>
                        <Badge variant={
                          request.urgency === "Critical" ? "destructive" :
                          request.urgency === "High" ? "default" : "secondary"
                        }>
                          {request.urgency}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{request.location}</p>
                      <p className="text-xs text-muted-foreground">{request.time} • {request.type}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (!dialPhone(request.phone)) toast({ title: "No phone", description: "No caller phone available." });
                        }}
                      >
                        <Phone className="w-4 h-4" />
                      </Button>
                      <Button size="sm" onClick={() => startDispatch(request)}>
                        Dispatch
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Available Ambulances</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {availableAmbulances.map((ambulance) => (
                  <div key={ambulance.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{ambulance.id}</p>
                        <Badge variant="outline">{ambulance.type}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{ambulance.location}</p>
                      <p className="text-xs text-muted-foreground">{ambulance.crew}</p>
                    </div>
                    <Badge variant={ambulance.status === "Available" ? "default" : "secondary"}>
                      {ambulance.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Dialog open={dispatchOpen} onOpenChange={setDispatchOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dispatch Ambulance</DialogTitle>
              <DialogDescription>Assign an available ambulance to the selected request.</DialogDescription>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-3">
                <div className="text-sm">
                  <div><span className="font-medium">Request:</span> {selectedRequest.id}</div>
                  <div><span className="font-medium">Caller:</span> {selectedRequest.caller}</div>
                  <div><span className="font-medium">Location:</span> {selectedRequest.location}</div>
                  <div><span className="font-medium">Urgency:</span> {selectedRequest.urgency}</div>
                </div>
                <div className="grid gap-2">
                  <Label>Available Ambulance</Label>
                  <Select value={selectedAmbulanceId} onValueChange={setSelectedAmbulanceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select ambulance" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAmbulances.map((a) => (
                        <SelectItem key={a.id} value={a.id} disabled={a.status !== "Available"}>
                          {a.id} • {a.type} • {a.status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDispatchOpen(false)}>Cancel</Button>
              <Button onClick={dispatchSelected}>Dispatch</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AmbulanceLayout>
  );
};

// Ambulance Tracking Page
export const AmbulanceTrackingPage = () => {
  const { toast } = useToast();
  const [trackedAmbulances] = useSeededLocalStorageState<TrackedAmbulance[]>(STORAGE_KEYS.trackedAmbulances, [
    { id: "AMB001", driver: "Mike Johnson", location: "En route to City Hospital", speed: "45 km/h", eta: "8 mins", status: "Active", phone: "+91 9000000101" },
    { id: "AMB002", driver: "Sarah Davis", location: "At Emergency Room", speed: "0 km/h", eta: "Arrived", status: "At Location", phone: "+91 9000000102" },
    { id: "AMB003", driver: "Tom Wilson", location: "Returning to Station", speed: "35 km/h", eta: "15 mins", status: "Returning", phone: "+91 9000000103" },
  ]);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [mapOpen, setMapOpen] = useState(false);

  const filteredTracked = useMemo(() => {
    const q = query.trim().toLowerCase();
    return trackedAmbulances.filter((a) => {
      const matchesStatus = statusFilter === "all" ? true : a.status.toLowerCase().replace(/\s+/g, "-") === statusFilter;
      const matchesQuery = q.length === 0 ? true : [a.id, a.driver, a.location, a.status].some((v) => v.toLowerCase().includes(q));
      return matchesStatus && matchesQuery;
    });
  }, [trackedAmbulances, statusFilter, query]);

  return (
    <AmbulanceLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">GPS Tracking</h1>
            <p className="text-muted-foreground">Real-time location tracking of all ambulances</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                downloadCsv(
                  "ambulance-tracking.csv",
                  ["Ambulance ID", "Driver", "Location", "Speed", "ETA", "Status"],
                  filteredTracked.map((a) => [a.id, a.driver, a.location, a.speed, a.eta, a.status])
                );
                toast({ title: "Exported", description: "Tracking data CSV downloaded." });
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Export Data
            </Button>
            <Button onClick={() => setMapOpen(true)}>
              <Navigation className="w-4 h-4 mr-2" />
              View Map
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Active Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">12</p>
              <p className="text-xs text-muted-foreground mt-1">Ambulances tracked</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Average Speed</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-blue-600">38 km/h</p>
              <p className="text-xs text-muted-foreground mt-1">Current average</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Coverage Area</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-purple-600">85%</p>
              <p className="text-xs text-muted-foreground mt-1">City coverage</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Signal Strength</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">98%</p>
              <p className="text-xs text-muted-foreground mt-1">GPS connectivity</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Live Ambulance Tracking</CardTitle>
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="at-location">At Location</SelectItem>
                    <SelectItem value="returning">Returning</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ambulance..." className="w-64" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ambulance ID</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Current Location</TableHead>
                  <TableHead>Speed</TableHead>
                  <TableHead>ETA</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTracked.map((ambulance) => (
                  <TableRow key={ambulance.id}>
                    <TableCell className="font-medium">{ambulance.id}</TableCell>
                    <TableCell>{ambulance.driver}</TableCell>
                    <TableCell>{ambulance.location}</TableCell>
                    <TableCell>{ambulance.speed}</TableCell>
                    <TableCell>{ambulance.eta}</TableCell>
                    <TableCell>
                      <Badge variant={
                        ambulance.status === "Active" ? "default" :
                        ambulance.status === "At Location" ? "secondary" : "outline"
                      }>
                        {ambulance.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            openMaps(ambulance.location);
                            toast({ title: "Opened maps", description: "Location opened in a new tab." });
                          }}
                        >
                          <MapPin className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (!dialPhone(ambulance.phone)) toast({ title: "No phone", description: "No driver phone available." });
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

        <Dialog open={mapOpen} onOpenChange={setMapOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Map View</DialogTitle>
              <DialogDescription>Minimal demo: opens Google Maps per ambulance location.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {filteredTracked.slice(0, 6).map((a) => (
                <div key={a.id} className="flex items-center justify-between border rounded-lg p-2">
                  <div className="text-sm">
                    <div className="font-medium">{a.id}</div>
                    <div className="text-muted-foreground">{a.location}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openMaps(a.location)}>
                    <MapPin className="w-4 h-4 mr-2" />
                    Open
                  </Button>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={() => setMapOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AmbulanceLayout>
  );
};

// Ambulance History Page
export const AmbulanceHistoryPage = () => {
  const { toast } = useToast();
  const [tripHistory] = useSeededLocalStorageState<TripHistoryItem[]>(STORAGE_KEYS.tripHistory, [
    { id: "TRIP001", date: "2025-12-10", patient: "John Doe", pickup: "Home", destination: "City Hospital", duration: "25 mins", status: "Completed" },
    { id: "TRIP002", date: "2025-12-09", patient: "Jane Smith", pickup: "Clinic", destination: "Medical Center", duration: "18 mins", status: "Completed" },
    { id: "TRIP003", date: "2025-12-09", patient: "Bob Johnson", pickup: "Emergency", destination: "General Hospital", duration: "32 mins", status: "Completed" },
  ]);

  const [period, setPeriod] = useState<string>("month");
  const [query, setQuery] = useState<string>("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [details, setDetails] = useState<TripHistoryItem | null>(null);

  const filteredHistory = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = new Date();

    const inPeriod = (dateStr: string) => {
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return true;
      if (period === "today") return d.toDateString() === now.toDateString();
      if (period === "week") return now.getTime() - d.getTime() <= 7 * 24 * 60 * 60 * 1000;
      if (period === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      if (period === "year") return d.getFullYear() === now.getFullYear();
      return true;
    };

    return tripHistory.filter((t) => {
      const matchesQuery = q.length === 0 ? true : [t.id, t.patient, t.pickup, t.destination, t.duration].some((v) => v.toLowerCase().includes(q));
      return matchesQuery && inPeriod(t.date);
    });
  }, [period, query, tripHistory]);

  return (
    <AmbulanceLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Trip History</h1>
            <p className="text-muted-foreground">View completed ambulance trips and performance metrics</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                downloadCsv(
                  "trip-history.csv",
                  ["Trip ID", "Date", "Patient", "Pickup", "Destination", "Duration", "Status"],
                  filteredHistory.map((t) => [t.id, t.date, t.patient, t.pickup, t.destination, t.duration, t.status])
                );
                toast({ title: "Exported", description: "Trip history CSV downloaded." });
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Export History
            </Button>
            <Button variant="outline" onClick={() => setAdvancedOpen(true)}>
              <Filter className="w-4 h-4 mr-2" />
              Advanced Filter
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Trips</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">1,247</p>
              <p className="text-xs text-muted-foreground mt-1">This month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Avg Response Time</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-blue-600">7.2 min</p>
              <p className="text-xs text-muted-foreground mt-1">This month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Success Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">96.8%</p>
              <p className="text-xs text-muted-foreground mt-1">On-time deliveries</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Patient Satisfaction</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-purple-600">4.7/5</p>
              <p className="text-xs text-muted-foreground mt-1">Average rating</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Trip History</CardTitle>
              <div className="flex gap-2">
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="year">This Year</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search trips..." className="w-64" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trip ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistory.map((trip) => (
                  <TableRow key={trip.id}>
                    <TableCell className="font-medium">{trip.id}</TableCell>
                    <TableCell>{trip.date}</TableCell>
                    <TableCell>{trip.patient}</TableCell>
                    <TableCell className="max-w-xs truncate">{trip.pickup} → {trip.destination}</TableCell>
                    <TableCell>{trip.duration}</TableCell>
                    <TableCell>
                      <Badge variant="default">{trip.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setDetails(trip)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            downloadCsv(
                              `receipt-${trip.id}.csv`,
                              ["Trip ID", "Patient", "Pickup", "Destination", "Date", "Duration"],
                              [[trip.id, trip.patient, trip.pickup, trip.destination, trip.date, trip.duration]]
                            );
                            toast({ title: "Receipt downloaded", description: "A simple CSV receipt was generated." });
                          }}
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Advanced Filter</DialogTitle>
              <DialogDescription>Minimal: filter by period and search.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label>Period</Label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="year">This Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Search</Label>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Patient / route / ID" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAdvancedOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!details} onOpenChange={(open) => !open && setDetails(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Trip Details</DialogTitle>
            </DialogHeader>
            {details && (
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Trip ID:</span> {details.id}</div>
                <div><span className="font-medium">Date:</span> {details.date}</div>
                <div><span className="font-medium">Patient:</span> {details.patient}</div>
                <div><span className="font-medium">Route:</span> {details.pickup} → {details.destination}</div>
                <div><span className="font-medium">Duration:</span> {details.duration}</div>
                <div><span className="font-medium">Status:</span> {details.status}</div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDetails(null)}>Close</Button>
              <Button onClick={() => details && openMaps(`${details.pickup} to ${details.destination}`)}>
                <MapPin className="w-4 h-4 mr-2" />
                View Route
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AmbulanceLayout>
  );
};

// Ambulance Fleet Page
export const AmbulanceFleetPage = () => {
  const { toast } = useToast();
  const [fleet, setFleet] = useSeededLocalStorageState<FleetVehicle[]>(STORAGE_KEYS.fleet, [
    { id: "AMB001", type: "ALS", model: "Ford Transit AWD", year: "2023", mileage: "45,230 km", status: "Active", lastService: "2025-11-15" },
    { id: "AMB002", type: "BLS", model: "Mercedes Sprinter", year: "2022", mileage: "67,890 km", status: "Active", lastService: "2025-11-20" },
    { id: "AMB003", type: "ALS", model: "Ford Transit AWD", year: "2024", mileage: "12,450 km", status: "Maintenance", lastService: "2025-12-01" },
  ]);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [formOpen, setFormOpen] = useState(false);
  const [details, setDetails] = useState<FleetVehicle | null>(null);
  const [editing, setEditing] = useState<FleetVehicle | null>(null);

  const [vehicleId, setVehicleId] = useState<string>("");
  const [vehicleType, setVehicleType] = useState<string>("ALS");
  const [vehicleModel, setVehicleModel] = useState<string>("");
  const [vehicleYear, setVehicleYear] = useState<string>(new Date().getFullYear().toString());
  const [vehicleMileage, setVehicleMileage] = useState<string>("");
  const [vehicleStatus, setVehicleStatus] = useState<FleetVehicle["status"]>("Active");
  const [vehicleLastService, setVehicleLastService] = useState<string>(new Date().toISOString().slice(0, 10));

  const openCreate = () => {
    setEditing(null);
    setVehicleId(createId("AMB"));
    setVehicleType("ALS");
    setVehicleModel("");
    setVehicleYear(new Date().getFullYear().toString());
    setVehicleMileage("");
    setVehicleStatus("Active");
    setVehicleLastService(new Date().toISOString().slice(0, 10));
    setFormOpen(true);
  };

  const openEdit = (v: FleetVehicle) => {
    setEditing(v);
    setVehicleId(v.id);
    setVehicleType(v.type);
    setVehicleModel(v.model);
    setVehicleYear(v.year);
    setVehicleMileage(v.mileage);
    setVehicleStatus(v.status);
    setVehicleLastService(v.lastService);
    setFormOpen(true);
  };

  const saveVehicle = () => {
    if (!vehicleId.trim() || !vehicleModel.trim()) {
      toast({ title: "Missing fields", description: "Vehicle ID and model are required.", variant: "destructive" });
      return;
    }

    const next: FleetVehicle = {
      id: vehicleId.trim(),
      type: vehicleType.trim(),
      model: vehicleModel.trim(),
      year: vehicleYear.trim(),
      mileage: vehicleMileage.trim() || "0 km",
      status: vehicleStatus,
      lastService: vehicleLastService,
    };

    setFleet((prev) => {
      const exists = prev.some((p) => p.id === next.id);
      if (editing) return prev.map((p) => (p.id === editing.id ? next : p));
      return exists ? prev.map((p) => (p.id === next.id ? next : p)) : [next, ...prev];
    });
    setFormOpen(false);
    toast({ title: editing ? "Vehicle updated" : "Vehicle added" });
  };

  const filteredFleet = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fleet.filter((v) => {
      const matchesStatus = statusFilter === "all" ? true : v.status.toLowerCase() === statusFilter;
      const matchesQuery = q.length === 0 ? true : [v.id, v.type, v.model, v.year, v.mileage, v.lastService].some((x) => x.toLowerCase().includes(q));
      return matchesStatus && matchesQuery;
    });
  }, [fleet, query, statusFilter]);

  const summary = useMemo(() => {
    const total = fleet.length;
    const active = fleet.filter((v) => v.status === "Active").length;
    const maintenance = fleet.filter((v) => v.status === "Maintenance").length;
    const avgMileage = (() => {
      const nums = fleet
        .map((v) => Number(v.mileage.replace(/[^0-9.]/g, "")))
        .filter((n) => Number.isFinite(n));
      if (nums.length === 0) return 0;
      return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
    })();
    return { total, active, maintenance, avgMileage };
  }, [fleet]);

  return (
    <AmbulanceLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Fleet Management</h1>
            <p className="text-muted-foreground">Manage ambulance vehicles and equipment</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Add Vehicle
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Fleet</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">{summary.total}</p>
              <p className="text-xs text-muted-foreground mt-1">Vehicles</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">In Service</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">{summary.active}</p>
              <p className="text-xs text-muted-foreground mt-1">Operational</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Under Maintenance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-orange-600">{summary.maintenance}</p>
              <p className="text-xs text-muted-foreground mt-1">Being serviced</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Avg Mileage</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-blue-600">{summary.avgMileage.toLocaleString()} km</p>
              <p className="text-xs text-muted-foreground mt-1">Avg mileage</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Fleet Inventory</CardTitle>
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="retired">Retired</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vehicles..." className="w-64" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Mileage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Service</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFleet.map((vehicle) => (
                  <TableRow key={vehicle.id}>
                    <TableCell className="font-medium">{vehicle.id}</TableCell>
                    <TableCell>{vehicle.type}</TableCell>
                    <TableCell>{vehicle.model}</TableCell>
                    <TableCell>{vehicle.year}</TableCell>
                    <TableCell>{vehicle.mileage}</TableCell>
                    <TableCell>
                      <Badge variant={vehicle.status === "Active" ? "default" : "secondary"}>
                        {vehicle.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{vehicle.lastService}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setDetails(vehicle)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(vehicle)}>
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

        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
              <DialogDescription>Store a vehicle in local demo storage.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label>Vehicle ID</Label>
                <Input value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={vehicleType} onValueChange={setVehicleType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALS">ALS</SelectItem>
                    <SelectItem value="BLS">BLS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Model</Label>
                <Input value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} placeholder="e.g., Ford Transit AWD" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Year</Label>
                  <Input value={vehicleYear} onChange={(e) => setVehicleYear(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Mileage</Label>
                  <Input value={vehicleMileage} onChange={(e) => setVehicleMileage(e.target.value)} placeholder="e.g., 45230 km" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select value={vehicleStatus} onValueChange={(v) => setVehicleStatus(v as FleetVehicle["status"])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Maintenance">Maintenance</SelectItem>
                      <SelectItem value="Retired">Retired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Last Service</Label>
                  <Input type="date" value={vehicleLastService} onChange={(e) => setVehicleLastService(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button onClick={saveVehicle}>{editing ? "Save" : "Add"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!details} onOpenChange={(open) => !open && setDetails(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Vehicle Details</DialogTitle>
            </DialogHeader>
            {details && (
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Vehicle ID:</span> {details.id}</div>
                <div><span className="font-medium">Type:</span> {details.type}</div>
                <div><span className="font-medium">Model:</span> {details.model}</div>
                <div><span className="font-medium">Year:</span> {details.year}</div>
                <div><span className="font-medium">Mileage:</span> {details.mileage}</div>
                <div><span className="font-medium">Status:</span> {details.status}</div>
                <div><span className="font-medium">Last Service:</span> {details.lastService}</div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDetails(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AmbulanceLayout>
  );
};

// Ambulance Staff Page
export const AmbulanceStaffPage = () => {
  const { toast } = useToast();
  const [staff, setStaff] = useSeededLocalStorageState<StaffMember[]>(STORAGE_KEYS.staff, [
    { id: "EMP001", name: "Dr. Mike Johnson", role: "Paramedic", shift: "Day", status: "On Duty", phone: "+91 9876543210" },
    { id: "EMP002", name: "Sarah Davis", role: "EMT", shift: "Night", status: "Off Duty", phone: "+91 9876543211" },
    { id: "EMP003", name: "Tom Wilson", role: "Driver", shift: "Day", status: "On Duty", phone: "+91 9876543212" },
  ]);

  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [formOpen, setFormOpen] = useState(false);
  const [details, setDetails] = useState<StaffMember | null>(null);
  const [editing, setEditing] = useState<StaffMember | null>(null);

  const [empId, setEmpId] = useState<string>("");
  const [empName, setEmpName] = useState<string>("");
  const [empRole, setEmpRole] = useState<string>("Paramedic");
  const [empShift, setEmpShift] = useState<string>("Day");
  const [empStatus, setEmpStatus] = useState<StaffMember["status"]>("On Duty");
  const [empPhone, setEmpPhone] = useState<string>("");

  const openCreate = () => {
    setEditing(null);
    setEmpId(createId("EMP"));
    setEmpName("");
    setEmpRole("Paramedic");
    setEmpShift("Day");
    setEmpStatus("On Duty");
    setEmpPhone("");
    setFormOpen(true);
  };

  const openEdit = (m: StaffMember) => {
    setEditing(m);
    setEmpId(m.id);
    setEmpName(m.name);
    setEmpRole(m.role);
    setEmpShift(m.shift);
    setEmpStatus(m.status);
    setEmpPhone(m.phone);
    setFormOpen(true);
  };

  const saveMember = () => {
    if (!empId.trim() || !empName.trim() || !empPhone.trim()) {
      toast({ title: "Missing fields", description: "ID, name, and phone are required.", variant: "destructive" });
      return;
    }

    const next: StaffMember = {
      id: empId.trim(),
      name: empName.trim(),
      role: empRole.trim(),
      shift: empShift.trim(),
      status: empStatus,
      phone: empPhone.trim(),
    };

    setStaff((prev) => {
      const exists = prev.some((p) => p.id === next.id);
      if (editing) return prev.map((p) => (p.id === editing.id ? next : p));
      return exists ? prev.map((p) => (p.id === next.id ? next : p)) : [next, ...prev];
    });
    setFormOpen(false);
    toast({ title: editing ? "Staff updated" : "Staff added" });
  };

  const filteredStaff = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff.filter((m) => {
      const matchesRole = roleFilter === "all" ? true : m.role.toLowerCase() === roleFilter;
      const matchesQuery = q.length === 0 ? true : [m.id, m.name, m.role, m.shift, m.status, m.phone].some((x) => x.toLowerCase().includes(q));
      return matchesRole && matchesQuery;
    });
  }, [query, roleFilter, staff]);

  const summary = useMemo(() => {
    const total = staff.length;
    const onDuty = staff.filter((m) => m.status === "On Duty").length;
    const paramedics = staff.filter((m) => m.role?.toLowerCase() === "paramedic").length;
    const trainingDue = staff.filter((m) => m.status === "Off Duty").length;
    return { total, onDuty, paramedics, trainingDue };
  }, [staff]);

  return (
    <AmbulanceLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Staff Management</h1>
            <p className="text-muted-foreground">Manage ambulance crew and personnel</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Add Staff
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Staff</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">{summary.total}</p>
              <p className="text-xs text-muted-foreground mt-1">Staff members</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">On Duty</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">{summary.onDuty}</p>
              <p className="text-xs text-muted-foreground mt-1">Currently working</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Paramedics</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-blue-600">{summary.paramedics}</p>
              <p className="text-xs text-muted-foreground mt-1">Certified paramedics</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Training Due</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-orange-600">{summary.trainingDue}</p>
              <p className="text-xs text-muted-foreground mt-1">Off duty (demo)</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Staff Directory</CardTitle>
              <div className="flex gap-2">
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="paramedic">Paramedic</SelectItem>
                    <SelectItem value="emt">EMT</SelectItem>
                    <SelectItem value="driver">Driver</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search staff..." className="w-64" />
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
                  <TableHead>Shift</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaff.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.id}</TableCell>
                    <TableCell>{member.name}</TableCell>
                    <TableCell>{member.role}</TableCell>
                    <TableCell>{member.shift}</TableCell>
                    <TableCell>
                      <Badge variant={member.status === "On Duty" ? "default" : "secondary"}>
                        {member.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{member.phone}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setDetails(member)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(member)}>
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

        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Staff" : "Add Staff"}</DialogTitle>
              <DialogDescription>Store a staff member in local demo storage.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label>Employee ID</Label>
                <Input value={empId} onChange={(e) => setEmpId(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Name</Label>
                <Input value={empName} onChange={(e) => setEmpName(e.target.value)} placeholder="Full name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Role</Label>
                  <Select value={empRole} onValueChange={setEmpRole}>
                    <SelectTrigger>
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Paramedic">Paramedic</SelectItem>
                      <SelectItem value="EMT">EMT</SelectItem>
                      <SelectItem value="Driver">Driver</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Shift</Label>
                  <Select value={empShift} onValueChange={setEmpShift}>
                    <SelectTrigger>
                      <SelectValue placeholder="Shift" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Day">Day</SelectItem>
                      <SelectItem value="Night">Night</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select value={empStatus} onValueChange={(v) => setEmpStatus(v as StaffMember["status"])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="On Duty">On Duty</SelectItem>
                      <SelectItem value="Off Duty">Off Duty</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Phone</Label>
                  <Input value={empPhone} onChange={(e) => setEmpPhone(e.target.value)} placeholder="+91 ..." />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button onClick={saveMember}>{editing ? "Save" : "Add"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!details} onOpenChange={(open) => !open && setDetails(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Staff Details</DialogTitle>
            </DialogHeader>
            {details && (
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Employee ID:</span> {details.id}</div>
                <div><span className="font-medium">Name:</span> {details.name}</div>
                <div><span className="font-medium">Role:</span> {details.role}</div>
                <div><span className="font-medium">Shift:</span> {details.shift}</div>
                <div><span className="font-medium">Status:</span> {details.status}</div>
                <div><span className="font-medium">Phone:</span> {details.phone}</div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDetails(null)}>Close</Button>
              <Button onClick={() => details && dialPhone(details.phone)}>
                <Phone className="w-4 h-4 mr-2" />
                Call
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AmbulanceLayout>
  );
};

// Ambulance Maintenance Page
export const AmbulanceMaintenancePage = () => {
  const { toast } = useToast();
  const [fleet] = useSeededLocalStorageState<FleetVehicle[]>(STORAGE_KEYS.fleet, []);
  const [maintenance, setMaintenance] = useSeededLocalStorageState<MaintenanceItem[]>(STORAGE_KEYS.maintenance, [
    { id: "MAINT001", vehicle: "AMB003", type: "Scheduled Service", dueDate: "2025-12-15", priority: "Medium", status: "Pending" },
    { id: "MAINT002", vehicle: "AMB007", type: "Brake Inspection", dueDate: "2025-12-10", priority: "High", status: "Overdue" },
    { id: "MAINT003", vehicle: "AMB002", type: "Tire Replacement", dueDate: "2025-12-20", priority: "Low", status: "Scheduled" },
  ]);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [formOpen, setFormOpen] = useState(false);
  const [details, setDetails] = useState<MaintenanceItem | null>(null);

  const [maintId, setMaintId] = useState<string>("");
  const [maintVehicle, setMaintVehicle] = useState<string>(fleet[0]?.id ?? "AMB001");
  const [maintType, setMaintType] = useState<string>("Scheduled Service");
  const [maintDueDate, setMaintDueDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [maintPriority, setMaintPriority] = useState<MaintenanceItem["priority"]>("Medium");
  const [maintStatus, setMaintStatus] = useState<MaintenanceItem["status"]>("Pending");

  const openCreate = () => {
    setMaintId(createId("MAINT"));
    setMaintVehicle(fleet[0]?.id ?? maintVehicle ?? "AMB001");
    setMaintType("Scheduled Service");
    setMaintDueDate(new Date().toISOString().slice(0, 10));
    setMaintPriority("Medium");
    setMaintStatus("Pending");
    setFormOpen(true);
  };

  const saveMaintenance = () => {
    if (!maintId.trim() || !maintVehicle.trim() || !maintType.trim() || !maintDueDate.trim()) {
      toast({ title: "Missing fields", description: "Vehicle, type, and due date are required.", variant: "destructive" });
      return;
    }

    const next: MaintenanceItem = {
      id: maintId.trim(),
      vehicle: maintVehicle.trim(),
      type: maintType.trim(),
      dueDate: maintDueDate,
      priority: maintPriority,
      status: maintStatus,
    };

    setMaintenance((prev) => [next, ...prev]);
    setFormOpen(false);
    toast({ title: "Scheduled", description: "Maintenance item saved." });
  };

  const filteredMaintenance = useMemo(() => {
    const q = query.trim().toLowerCase();
    return maintenance.filter((m) => {
      const matchesStatus = statusFilter === "all" ? true : m.status.toLowerCase().replace(/\s+/g, "-") === statusFilter;
      const matchesQuery = q.length === 0 ? true : [m.id, m.vehicle, m.type, m.dueDate, m.priority, m.status].some((x) => x.toLowerCase().includes(q));
      return matchesStatus && matchesQuery;
    });
  }, [maintenance, query, statusFilter]);

  const summary = useMemo(() => {
    const pending = maintenance.filter((m) => m.status === "Pending" || m.status === "Scheduled").length;
    const overdue = maintenance.filter((m) => m.status === "Overdue").length;
    const inProgress = maintenance.filter((m) => m.status === "In Progress").length;
    const now = new Date();
    const completedThisMonth = maintenance.filter((m) => {
      if (m.status !== "Completed") return false;
      const d = new Date(m.dueDate);
      if (Number.isNaN(d.getTime())) return false;
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    return { pending, overdue, inProgress, completedThisMonth };
  }, [maintenance]);

  return (
    <AmbulanceLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Maintenance</h1>
            <p className="text-muted-foreground">Schedule and track vehicle maintenance</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Schedule Maintenance
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Pending Maintenance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-orange-600">{summary.pending}</p>
              <p className="text-xs text-muted-foreground mt-1">Require attention</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Overdue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-red-600">{summary.overdue}</p>
              <p className="text-xs text-muted-foreground mt-1">Past due date</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">In Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-blue-600">{summary.inProgress}</p>
              <p className="text-xs text-muted-foreground mt-1">Currently being serviced</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Completed This Month</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">{summary.completedThisMonth}</p>
              <p className="text-xs text-muted-foreground mt-1">Maintenance tasks</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Maintenance Schedule</CardTitle>
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search maintenance..." className="w-64" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Maintenance ID</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMaintenance.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.id}</TableCell>
                    <TableCell>{item.vehicle}</TableCell>
                    <TableCell>{item.type}</TableCell>
                    <TableCell>{item.dueDate}</TableCell>
                    <TableCell>
                      <Badge variant={
                        item.priority === "High" ? "destructive" :
                        item.priority === "Medium" ? "default" : "secondary"
                      }>
                        {item.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        item.status === "Overdue" ? "destructive" :
                        item.status === "Pending" ? "secondary" :
                        item.status === "In Progress" ? "default" : "outline"
                      }>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setDetails(item)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setMaintenance((prev) =>
                              prev.map((m) => {
                                if (m.id !== item.id) return m;
                                const nextStatus: MaintenanceItem["status"] =
                                  m.status === "In Progress" ? "Completed" : "In Progress";
                                return { ...m, status: nextStatus };
                              })
                            );
                            toast({ title: "Updated", description: "Maintenance status updated." });
                          }}
                        >
                          <Wrench className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Maintenance</DialogTitle>
              <DialogDescription>Create a maintenance item (demo storage).</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label>Maintenance ID</Label>
                <Input value={maintId} onChange={(e) => setMaintId(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Vehicle</Label>
                <Select value={maintVehicle} onValueChange={setMaintVehicle}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vehicle" />
                  </SelectTrigger>
                  <SelectContent>
                    {(fleet.length ? fleet : [{ id: "AMB001" } as FleetVehicle]).map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Type</Label>
                <Input value={maintType} onChange={(e) => setMaintType(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Due Date</Label>
                  <Input type="date" value={maintDueDate} onChange={(e) => setMaintDueDate(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Priority</Label>
                  <Select value={maintPriority} onValueChange={(v) => setMaintPriority(v as MaintenanceItem["priority"])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={maintStatus} onValueChange={(v) => setMaintStatus(v as MaintenanceItem["status"])}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Overdue">Overdue</SelectItem>
                    <SelectItem value="Scheduled">Scheduled</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button onClick={saveMaintenance}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!details} onOpenChange={(open) => !open && setDetails(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Maintenance Details</DialogTitle>
            </DialogHeader>
            {details && (
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Maintenance ID:</span> {details.id}</div>
                <div><span className="font-medium">Vehicle:</span> {details.vehicle}</div>
                <div><span className="font-medium">Type:</span> {details.type}</div>
                <div><span className="font-medium">Due Date:</span> {details.dueDate}</div>
                <div><span className="font-medium">Priority:</span> {details.priority}</div>
                <div><span className="font-medium">Status:</span> {details.status}</div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDetails(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AmbulanceLayout>
  );
};

// Ambulance Schedule Page
export const AmbulanceSchedulePage = () => {
  const { toast } = useToast();
  const [staff] = useSeededLocalStorageState<StaffMember[]>(STORAGE_KEYS.staff, []);
  const [schedule, setSchedule] = useSeededLocalStorageState<ScheduleEntry[]>(STORAGE_KEYS.schedule, [
    { id: "SCH001", day: "Mon", shift: "Day", staffCount: 8 },
    { id: "SCH002", day: "Mon", shift: "Night", staffCount: 6 },
    { id: "SCH003", day: "Tue", shift: "Day", staffCount: 8 },
    { id: "SCH004", day: "Tue", shift: "Night", staffCount: 6 },
    { id: "SCH005", day: "Wed", shift: "Day", staffCount: 8 },
    { id: "SCH006", day: "Wed", shift: "Night", staffCount: 6 },
    { id: "SCH007", day: "Thu", shift: "Day", staffCount: 8 },
    { id: "SCH008", day: "Thu", shift: "Night", staffCount: 6 },
    { id: "SCH009", day: "Fri", shift: "Day", staffCount: 8 },
    { id: "SCH00a", day: "Fri", shift: "Night", staffCount: 6 },
    { id: "SCH00b", day: "Sat", shift: "Day", staffCount: 7 },
    { id: "SCH00c", day: "Sat", shift: "Night", staffCount: 5 },
    { id: "SCH00d", day: "Sun", shift: "Day", staffCount: 7 },
    { id: "SCH00e", day: "Sun", shift: "Night", staffCount: 5 },
  ]);

  const [formOpen, setFormOpen] = useState(false);
  const [day, setDay] = useState<ScheduleEntry["day"]>("Mon");
  const [shift, setShift] = useState<ScheduleEntry["shift"]>("Day");
  const [count, setCount] = useState<string>("8");

  const byDay = useMemo(() => {
    const days: Array<ScheduleEntry["day"]> = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return days.map((d) => {
      const dayCount = schedule.find((s) => s.day === d && s.shift === "Day")?.staffCount ?? 0;
      const nightCount = schedule.find((s) => s.day === d && s.shift === "Night")?.staffCount ?? 0;
      return { day: d, dayCount, nightCount };
    });
  }, [schedule]);

  const onDuty = useMemo(() => staff.filter((s) => s.status === "On Duty").length, [staff]);

  const coverage = useMemo(() => {
    const requiredSlots = 14;
    const filled = schedule.filter((s) => s.staffCount > 0).length;
    return Math.round((filled / requiredSlots) * 100);
  }, [schedule]);

  const openCreate = () => {
    setDay("Mon");
    setShift("Day");
    setCount("8");
    setFormOpen(true);
  };

  const save = () => {
    const n = Number(count);
    if (!Number.isFinite(n) || n < 0) {
      toast({ title: "Invalid staff count", description: "Enter a valid number.", variant: "destructive" });
      return;
    }
    setSchedule((prev) => {
      const existing = prev.find((p) => p.day === day && p.shift === shift);
      if (!existing) return [{ id: createId("SCH"), day, shift, staffCount: n }, ...prev];
      return prev.map((p) => (p.id === existing.id ? { ...p, staffCount: n } : p));
    });
    setFormOpen(false);
    toast({ title: "Schedule saved" });
  };

  return (
    <AmbulanceLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Schedule Management</h1>
            <p className="text-muted-foreground">Manage staff shifts and ambulance assignments</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Create Schedule
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Staff on Duty</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">{onDuty}</p>
              <p className="text-xs text-muted-foreground mt-1">Current shift</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Next Shift Change</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-blue-600">6 hours</p>
              <p className="text-xs text-muted-foreground mt-1">Until handover</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Coverage</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-purple-600">{coverage}%</p>
              <p className="text-xs text-muted-foreground mt-1">24/7 coverage</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Weekly Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {byDay.map((d) => (
                <div key={d.day} className="text-center">
                  <div className="font-medium text-sm mb-2">{d.day}</div>
                  <div className="space-y-1">
                    <div className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Day: {d.dayCount} staff</div>
                    <div className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">Night: {d.nightCount} staff</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Schedule Entry</DialogTitle>
              <DialogDescription>Minimal: set staff count per day/shift.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Day</Label>
                  <Select value={day} onValueChange={(v) => setDay(v as ScheduleEntry["day"])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Day" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mon">Mon</SelectItem>
                      <SelectItem value="Tue">Tue</SelectItem>
                      <SelectItem value="Wed">Wed</SelectItem>
                      <SelectItem value="Thu">Thu</SelectItem>
                      <SelectItem value="Fri">Fri</SelectItem>
                      <SelectItem value="Sat">Sat</SelectItem>
                      <SelectItem value="Sun">Sun</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Shift</Label>
                  <Select value={shift} onValueChange={(v) => setShift(v as ScheduleEntry["shift"])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Shift" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Day">Day</SelectItem>
                      <SelectItem value="Night">Night</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Staff Count</Label>
                <Input value={count} onChange={(e) => setCount(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button onClick={save}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AmbulanceLayout>
  );
};

// Ambulance Billing Page
export const AmbulanceBillingPage = () => {
  const { toast } = useToast();
  const [invoices, setInvoices] = useSeededLocalStorageState<Invoice[]>(STORAGE_KEYS.invoices, [
    { id: "INV001", patient: "John Doe", service: "Emergency Transport", amount: "₹2,500", date: "2025-12-10", status: "Paid" },
    { id: "INV002", patient: "Jane Smith", service: "Medical Transport", amount: "₹1,800", date: "2025-12-09", status: "Pending" },
    { id: "INV003", patient: "Bob Johnson", service: "Emergency Transport", amount: "₹3,200", date: "2025-12-08", status: "Paid" },
  ]);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [formOpen, setFormOpen] = useState(false);
  const [details, setDetails] = useState<Invoice | null>(null);

  const [invId, setInvId] = useState<string>("");
  const [invPatient, setInvPatient] = useState<string>("");
  const [invService, setInvService] = useState<string>("Emergency Transport");
  const [invAmount, setInvAmount] = useState<string>("");
  const [invDate, setInvDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [invStatus, setInvStatus] = useState<Invoice["status"]>("Pending");

  const openCreate = () => {
    setInvId(createId("INV"));
    setInvPatient("");
    setInvService("Emergency Transport");
    setInvAmount("");
    setInvDate(new Date().toISOString().slice(0, 10));
    setInvStatus("Pending");
    setFormOpen(true);
  };

  const saveInvoice = () => {
    if (!invId.trim() || !invPatient.trim() || !invService.trim() || !invAmount.trim() || !invDate.trim()) {
      toast({ title: "Missing fields", description: "Fill patient, service, amount, and date.", variant: "destructive" });
      return;
    }
    const amount = invAmount.trim().startsWith("₹") ? invAmount.trim() : `₹${invAmount.trim()}`;
    const next: Invoice = {
      id: invId.trim(),
      patient: invPatient.trim(),
      service: invService.trim(),
      amount,
      date: invDate,
      status: invStatus,
    };
    setInvoices((prev) => [next, ...prev]);
    setFormOpen(false);
    toast({ title: "Invoice created" });
  };

  const filteredInvoices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((i) => {
      const matchesStatus = statusFilter === "all" ? true : i.status.toLowerCase() === statusFilter;
      const matchesQuery = q.length === 0 ? true : [i.id, i.patient, i.service, i.amount, i.date, i.status].some((x) => x.toLowerCase().includes(q));
      return matchesStatus && matchesQuery;
    });
  }, [invoices, query, statusFilter]);

  const summary = useMemo(() => {
    const parseAmount = (a: string) => Number(a.replace(/[^0-9.]/g, "")) || 0;
    const now = new Date();
    const monthlyRevenue = invoices
      .filter((i) => i.status === "Paid")
      .filter((i) => {
        const d = new Date(i.date);
        if (Number.isNaN(d.getTime())) return false;
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((sum, i) => sum + parseAmount(i.amount), 0);
    const pendingPayments = invoices
      .filter((i) => i.status === "Pending" || i.status === "Overdue")
      .reduce((sum, i) => sum + parseAmount(i.amount), 0);
    const avgCost = invoices.length ? Math.round(invoices.reduce((sum, i) => sum + parseAmount(i.amount), 0) / invoices.length) : 0;
    return { monthlyRevenue, pendingPayments, avgCost };
  }, [invoices]);

  return (
    <AmbulanceLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Billing & Payments</h1>
            <p className="text-muted-foreground">Manage ambulance service billing and insurance claims</p>
          </div>
          <Button onClick={openCreate}>
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
              <p className="text-2xl font-semibold text-slate-900">₹{summary.monthlyRevenue.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Paid invoices this month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Pending Payments</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-orange-600">₹{summary.pendingPayments.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Outstanding invoices</p>
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
              <p className="text-2xl font-semibold text-purple-600">₹{summary.avgCost.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Avg service cost</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Billing Records</CardTitle>
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
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
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search invoices..." className="w-64" />
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
                {filteredInvoices.map((invoice) => (
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
                        <Button size="sm" variant="outline" onClick={() => setDetails(invoice)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            downloadCsv(
                              `invoice-${invoice.id}.csv`,
                              ["Invoice ID", "Patient", "Service", "Amount", "Date", "Status"],
                              [[invoice.id, invoice.patient, invoice.service, invoice.amount, invoice.date, invoice.status]]
                            );
                            toast({ title: "Downloaded", description: "Invoice CSV downloaded." });
                          }}
                        >
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

        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Invoice</DialogTitle>
              <DialogDescription>Minimal invoice creation (demo storage).</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label>Invoice ID</Label>
                <Input value={invId} onChange={(e) => setInvId(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Patient</Label>
                <Input value={invPatient} onChange={(e) => setInvPatient(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Service</Label>
                <Input value={invService} onChange={(e) => setInvService(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Amount</Label>
                  <Input value={invAmount} onChange={(e) => setInvAmount(e.target.value)} placeholder="e.g., 2500" />
                </div>
                <div className="grid gap-2">
                  <Label>Date</Label>
                  <Input type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={invStatus} onValueChange={(v) => setInvStatus(v as Invoice["status"])}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Paid">Paid</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button onClick={saveInvoice}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!details} onOpenChange={(open) => !open && setDetails(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invoice Details</DialogTitle>
            </DialogHeader>
            {details && (
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Invoice ID:</span> {details.id}</div>
                <div><span className="font-medium">Patient:</span> {details.patient}</div>
                <div><span className="font-medium">Service:</span> {details.service}</div>
                <div><span className="font-medium">Amount:</span> {details.amount}</div>
                <div><span className="font-medium">Date:</span> {details.date}</div>
                <div><span className="font-medium">Status:</span> {details.status}</div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDetails(null)}>Close</Button>
              <Button
                onClick={() => {
                  if (!details) return;
                  downloadCsv(
                    `invoice-${details.id}.csv`,
                    ["Invoice ID", "Patient", "Service", "Amount", "Date", "Status"],
                    [[details.id, details.patient, details.service, details.amount, details.date, details.status]]
                  );
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AmbulanceLayout>
  );
};

// Ambulance Reports Page
export const AmbulanceReportsPage = () => {
  const { toast } = useToast();
  const [activeTrips] = useSeededLocalStorageState<ActiveTrip[]>(STORAGE_KEYS.activeTrips, []);
  const [tripHistory] = useSeededLocalStorageState<TripHistoryItem[]>(STORAGE_KEYS.tripHistory, []);
  const [invoices] = useSeededLocalStorageState<Invoice[]>(STORAGE_KEYS.invoices, []);

  const [reportType, setReportType] = useState<string>("operational");
  const [dateRange, setDateRange] = useState<string>("month");

  const generate = () => {
    const rows: Array<Array<string | number>> = [
      ["Report Type", reportType],
      ["Date Range", dateRange],
      ["Active Trips", activeTrips.length],
      ["Completed Trips", tripHistory.length],
      ["Invoices", invoices.length],
    ];

    downloadCsv(
      `ambulance-report-${reportType}-${dateRange}.csv`,
      ["Metric", "Value"],
      rows
    );
    toast({ title: "Report generated", description: "A simple CSV report was downloaded." });
  };

  return (
    <AmbulanceLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Reports & Analytics</h1>
            <p className="text-muted-foreground">Generate comprehensive reports and performance analytics</p>
          </div>
          <Button onClick={generate}>
            <Download className="w-4 h-4 mr-2" />
            Generate Report
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Operational Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">Response times, coverage</p>
              <p className="text-xs text-muted-foreground mt-1">Service performance metrics</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Financial Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">Revenue, expenses, profitability</p>
              <p className="text-xs text-muted-foreground mt-1">Financial performance analysis</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Quality Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">Patient satisfaction, outcomes</p>
              <p className="text-xs text-muted-foreground mt-1">Service quality metrics</p>
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
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select report type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operational">Operational Report</SelectItem>
                    <SelectItem value="financial">Financial Report</SelectItem>
                    <SelectItem value="quality">Quality Report</SelectItem>
                    <SelectItem value="incident">Incident Report</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date Range</Label>
                <Select value={dateRange} onValueChange={setDateRange}>
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
              <Button onClick={generate}>Generate Report</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AmbulanceLayout>
  );
};

// Ambulance Alerts Page
export const AmbulanceAlertsPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [alerts, setAlerts] = useSeededLocalStorageState<AlertItem[]>(STORAGE_KEYS.alerts, [
    { id: "ALT001", type: "Vehicle Breakdown", message: "AMB003 engine failure - requires immediate attention", priority: "Critical", time: "5 mins ago", status: "Active" },
    { id: "ALT002", type: "Staff Shortage", message: "Night shift paramedic shortage in Zone A", priority: "High", time: "15 mins ago", status: "Active" },
    { id: "ALT003", type: "Equipment Issue", message: "Defibrillator in AMB007 needs calibration", priority: "Medium", time: "1 hour ago", status: "Active" },
  ]);

  const summary = useMemo(() => {
    const normalized = alerts.map((a) => ({ ...a, status: a.status ?? "Active" }));
    const active = normalized.filter((a) => a.status !== "Resolved");
    const activeCount = active.length;
    const criticalCount = active.filter((a) => a.priority === "Critical").length;
    const resolvedCount = normalized.filter((a) => a.status === "Resolved").length;
    return { activeCount, criticalCount, resolvedCount };
  }, [alerts]);

  return (
    <AmbulanceLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Alerts & Notifications</h1>
            <p className="text-muted-foreground">Monitor system alerts and emergency notifications</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/ambulance/settings")}>
            <Bell className="w-4 h-4 mr-2" />
            Configure Alerts
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Active Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-red-600">{summary.activeCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Require attention</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Critical Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-red-600">{summary.criticalCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Immediate action needed</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Resolved Today</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">{summary.resolvedCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Resolved (demo)</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Response Time</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-blue-600">3.2 min</p>
              <p className="text-xs text-muted-foreground mt-1">Average alert response</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Active Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className={`w-4 h-4 ${
                        alert.priority === "Critical" ? "text-red-500" :
                        alert.priority === "High" ? "text-orange-500" : "text-yellow-500"
                      }`} />
                      <span className="font-medium">{alert.type}</span>
                      <Badge variant={
                        alert.priority === "Critical" ? "destructive" :
                        alert.priority === "High" ? "default" : "secondary"
                      }>
                        {alert.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">{alert.message}</p>
                    <p className="text-xs text-muted-foreground">{alert.time}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, status: "Acknowledged" } : a)));
                        toast({ title: "Acknowledged", description: "Alert acknowledged." });
                      }}
                    >
                      Acknowledge
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, status: "Resolved" } : a)));
                        toast({ title: "Resolved", description: "Alert marked as resolved." });
                      }}
                    >
                      Resolve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AmbulanceLayout>
  );
};

// Ambulance Settings Page
export const AmbulanceSettingsPage = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useSeededLocalStorageState<SettingsState>(STORAGE_KEYS.settings, {
    gpsTracking: true,
    automaticDispatch: true,
    emergencyNotifications: true,
    serviceArea: "City Metropolitan Area",
    emergencyResponseTime: "8",
    maximumResponseRadius: "25",
    baseLocation: "Central Ambulance Station",
    criticalAlertResponseTime: "2 minutes",
    maintenanceReminderDays: "7",
    staffShiftReminderHours: "4",
    emergencyContact: "+91 9876543210",
  });

  const [draft, setDraft] = useState<SettingsState>(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const save = () => {
    setSettings(draft);
    toast({ title: "Saved", description: "Settings updated." });
  };

  const cancel = () => {
    setDraft(settings);
    toast({ title: "Cancelled", description: "Changes were discarded." });
  };

  return (
    <AmbulanceLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
            <p className="text-muted-foreground">Configure ambulance service preferences and system settings</p>
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
                <Input value={draft.serviceArea} onChange={(e) => setDraft((d) => ({ ...d, serviceArea: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Emergency Response Time (minutes)</Label>
                <Input value={draft.emergencyResponseTime} onChange={(e) => setDraft((d) => ({ ...d, emergencyResponseTime: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Maximum Response Radius (km)</Label>
                <Input value={draft.maximumResponseRadius} onChange={(e) => setDraft((d) => ({ ...d, maximumResponseRadius: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Base Location</Label>
                <Input value={draft.baseLocation} onChange={(e) => setDraft((d) => ({ ...d, baseLocation: e.target.value }))} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Alert Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Critical Alert Response Time</Label>
                <Input value={draft.criticalAlertResponseTime} onChange={(e) => setDraft((d) => ({ ...d, criticalAlertResponseTime: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Maintenance Reminder Days</Label>
                <Input value={draft.maintenanceReminderDays} onChange={(e) => setDraft((d) => ({ ...d, maintenanceReminderDays: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Staff Shift Reminder Hours</Label>
                <Input value={draft.staffShiftReminderHours} onChange={(e) => setDraft((d) => ({ ...d, staffShiftReminderHours: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Emergency Contact</Label>
                <Input value={draft.emergencyContact} onChange={(e) => setDraft((d) => ({ ...d, emergencyContact: e.target.value }))} />
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
                  <p className="font-medium">GPS Tracking</p>
                  <p className="text-sm text-muted-foreground">Enable real-time vehicle tracking</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft((d) => ({ ...d, gpsTracking: !d.gpsTracking }))}
                >
                  {draft.gpsTracking ? "Enabled" : "Disabled"}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Automatic Dispatch</p>
                  <p className="text-sm text-muted-foreground">Auto-assign nearest available ambulance</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft((d) => ({ ...d, automaticDispatch: !d.automaticDispatch }))}
                >
                  {draft.automaticDispatch ? "Enabled" : "Disabled"}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Emergency Notifications</p>
                  <p className="text-sm text-muted-foreground">Send alerts to all staff for critical emergencies</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft((d) => ({ ...d, emergencyNotifications: !d.emergencyNotifications }))}
                >
                  {draft.emergencyNotifications ? "Enabled" : "Disabled"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={cancel}>Cancel</Button>
          <Button onClick={save}>Save Changes</Button>
        </div>
      </div>
    </AmbulanceLayout>
  );
};

// Ambulance Support Page
export const AmbulanceSupportPage = () => {
  const { toast } = useToast();
  const [settings] = useSeededLocalStorageState<SettingsState>(STORAGE_KEYS.settings, {
    gpsTracking: true,
    automaticDispatch: true,
    emergencyNotifications: true,
    serviceArea: "City Metropolitan Area",
    emergencyResponseTime: "8",
    maximumResponseRadius: "25",
    baseLocation: "Central Ambulance Station",
    criticalAlertResponseTime: "2 minutes",
    maintenanceReminderDays: "7",
    staffShiftReminderHours: "4",
    emergencyContact: "+91 9876543210",
  });

  const [activeTrips] = useSeededLocalStorageState<ActiveTrip[]>(STORAGE_KEYS.activeTrips, []);
  const [pendingRequests] = useSeededLocalStorageState<PendingRequest[]>(STORAGE_KEYS.pendingRequests, []);
  const [fleet] = useSeededLocalStorageState<FleetVehicle[]>(STORAGE_KEYS.fleet, []);

  const [issueOpen, setIssueOpen] = useState(false);
  const [issueTitle, setIssueTitle] = useState<string>("");
  const [issueDescription, setIssueDescription] = useState<string>("");

  const submitIssue = () => {
    if (!issueTitle.trim() || !issueDescription.trim()) {
      toast({ title: "Missing fields", description: "Add a title and description.", variant: "destructive" });
      return;
    }
    downloadCsv(
      `ambulance-issue-${Date.now()}.csv`,
      ["Title", "Description", "Created"],
      [[issueTitle.trim(), issueDescription.trim(), new Date().toISOString()]]
    );
    setIssueOpen(false);
    setIssueTitle("");
    setIssueDescription("");
    toast({ title: "Issue exported", description: "A CSV was generated for support." });
  };

  return (
    <AmbulanceLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Support & Help</h1>
            <p className="text-muted-foreground">Get help and support for ambulance service operations</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Emergency Support</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-red-600">24/7</p>
              <p className="text-xs text-muted-foreground mt-1">Available support line</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Technical Support</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-blue-600">9 AM - 6 PM</p>
              <p className="text-xs text-muted-foreground mt-1">Business hours</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Training Resources</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">Available</p>
              <p className="text-xs text-muted-foreground mt-1">Online documentation</p>
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
                <Button className="w-full" variant="outline" onClick={() => dialPhone(settings.emergencyContact)}>
                  <Phone className="w-4 h-4 mr-2" />
                  Call Emergency Support
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => toast({ title: "User manual", description: "Manual is not bundled in this demo build." })}
                >
                  <HelpCircle className="w-4 h-4 mr-2" />
                  View User Manual
                </Button>
                <Button className="w-full" variant="outline" onClick={() => setIssueOpen(true)}>
                  <FileText className="w-4 h-4 mr-2" />
                  Report Issue
                </Button>
              </div>
              <div className="space-y-3">
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => toast({ title: "Training team", description: "Contact workflow not configured in demo." })}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Contact Training Team
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => {
                    downloadCsv(
                      "ambulance-diagnostics.csv",
                      ["Metric", "Value"],
                      [
                        ["Active Trips", activeTrips.length],
                        ["Pending Requests", pendingRequests.length],
                        ["Fleet Vehicles", fleet.length],
                        ["GPS Tracking", settings.gpsTracking ? "Enabled" : "Disabled"],
                      ]
                    );
                    toast({ title: "Diagnostics downloaded" });
                  }}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  System Diagnostics
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => {
                    downloadCsv(
                      "ambulance-resources.csv",
                      ["Resource", "Description"],
                      [
                        ["Support", "Contact emergency support for urgent issues"],
                        ["Maintenance", "Schedule and track vehicle maintenance"],
                        ["Billing", "Invoice export is available as CSV"],
                      ]
                    );
                    toast({ title: "Resources downloaded" });
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Resources
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Report Issue</DialogTitle>
              <DialogDescription>Exports a CSV you can share with support.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label>Title</Label>
                <Input value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} placeholder="Short summary" />
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Textarea value={issueDescription} onChange={(e) => setIssueDescription(e.target.value)} placeholder="What happened? Steps to reproduce?" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIssueOpen(false)}>Cancel</Button>
              <Button onClick={submitIssue}>Export</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AmbulanceLayout>
  );
};