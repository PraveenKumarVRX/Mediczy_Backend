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
    const escaped = asString.replace(/\"/g, '""');
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
    availableVehicles: 8,
    totalVehicles: 12,
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

  const ambulanceFleet = [
    { id: "AMB-001", type: "ALS", status: "Available", driver: "Ravi Singh", paramedic: "Dr. Neha Gupta", location: "Base Station", lastService: "2 days ago" },
    { id: "AMB-002", type: "BLS", status: "On Trip", driver: "Suresh Kumar", paramedic: "Nurse Pooja", location: "En Route to AIIMS", eta: "12 mins" },
    { id: "AMB-003", type: "ALS", status: "On Trip", driver: "Vikram Joshi", paramedic: "Dr. Arjun Nair", location: "MG Road", eta: "8 mins" },
    { id: "AMB-004", type: "BLS", status: "Available", driver: "Rahul Verma", paramedic: "Nurse Kavita", location: "Base Station", lastService: "5 days ago" },
    { id: "AMB-005", type: "ALS", status: "Maintenance", driver: "-", paramedic: "-", location: "Workshop", expectedReady: "Tomorrow" },
    { id: "AMB-006", type: "BLS", status: "Available", driver: "Manoj Tiwari", paramedic: "Nurse Anjali", location: "Sector 15", lastService: "1 week ago" },
  ];

  const completedTrips = [
    { id: "T-1234", patient: "Mohan Das", pickup: "Janakpuri", dropoff: "Max Hospital", duration: "25 mins", distance: "12 km", amount: "₹2,500", status: "Completed", time: "1 hour ago" },
    { id: "T-1235", patient: "Geeta Malhotra", pickup: "Rohini", dropoff: "Fortis Hospital", duration: "18 mins", distance: "8 km", amount: "₹1,800", status: "Completed", time: "2 hours ago" },
    { id: "T-1236", patient: "Sanjay Gupta", pickup: "Dwarka", dropoff: "Apollo Hospital", duration: "32 mins", distance: "15 km", amount: "₹3,200", status: "Completed", time: "3 hours ago" },
  ];

  const filteredCompletedTrips = useMemo(() => {
    const q = completedTripsQuery.trim().toLowerCase();
    if (!q) return completedTrips;
    return completedTrips.filter((t) =>
      [t.id, t.patient, t.pickup, t.dropoff, t.duration, t.distance, t.amount].some((v) => v.toLowerCase().includes(q))
    );
  }, [completedTripsQuery, completedTrips]);

  const createEmergency = () => {
    if (!emergencyPatient.trim() || !emergencyLocation.trim()) {
      toast({
        title: "Missing details",
        description: "Patient name and location are required.",
        variant: "destructive",
      });
      return;
    }

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

    setNewEmergencyOpen(false);
    setEmergencyPatient("");
    setEmergencyLocation("");
    setEmergencyType("Accident");
    setEmergencyUrgency("High");
    setEmergencyPhone("");
    toast({ title: "Emergency created", description: "Request added to Dispatch." });
    navigate("/ambulance/dispatch");
  };

  const downloadTripReceipt = (trip: (typeof completedTrips)[number]) => {
    downloadCsv(
      `receipt-${trip.id}.csv`,
      ["Trip ID", "Patient", "Pickup", "Dropoff", "Duration", "Distance", "Amount", "Status"],
      [[trip.id, trip.patient, trip.pickup, trip.dropoff, trip.duration, trip.distance, trip.amount, trip.status]]
    );
    toast({ title: "Receipt downloaded", description: "A simple CSV receipt was generated." });
  };

  const downloadFinancialReport = () => {
    const invoices = safeParseJson<Invoice[]>(localStorage.getItem(STORAGE_KEYS.invoices)) ?? [];
    const parseAmount = (a: string) => Number(a.replace(/[^0-9.]/g, "")) || 0;
    const paid = invoices.filter((i) => i.status === "Paid");
    const pending = invoices.filter((i) => i.status !== "Paid");
    const paidTotal = paid.reduce((s, i) => s + parseAmount(i.amount), 0);
    const pendingTotal = pending.reduce((s, i) => s + parseAmount(i.amount), 0);
    downloadCsv(
      "ambulance-financial-report.csv",
      ["Metric", "Value"],
      [
        ["Paid invoices", paid.length],
        ["Pending/Overdue invoices", pending.length],
        ["Paid total", `₹${paidTotal.toLocaleString()}`],
        ["Pending total", `₹${pendingTotal.toLocaleString()}`],
      ]
    );
    toast({ title: "Report generated", description: "Financial report CSV downloaded." });
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
                {emergencyRequests.map((request) => (
                  <div key={request.id} className="p-4 border rounded-lg bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{request.patient}</h3>
                          <Badge className={getPriorityColor(request.priority)}>
                            {request.priority}
                          </Badge>
                          <Badge variant="outline">{request.status}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-red-500" />
                            {request.location}
                          </div>
                          <div className="flex items-center gap-2">
                            <Heart className="h-4 w-4 text-pink-500" />
                            {request.type}
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-blue-500" />
                            {request.time}
                          </div>
                          <div className="flex items-center gap-2">
                            <Navigation className="h-4 w-4 text-green-500" />
                            {request.distance} away
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
                            if (settings.emergencyContact) {
                              dialPhone(settings.emergencyContact);
                            } else {
                              toast({ title: "No number", description: "Emergency contact not configured." });
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
                  <Button
                    variant="outline"
                    onClick={() => {
                      toast({ title: "Fleet", description: "Opening fleet filters." });
                      navigate("/ambulance/fleet");
                    }}
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Filter
                  </Button>
                  <Button
                    className="bg-orange-600 hover:bg-orange-700"
                    onClick={() => {
                      toast({ title: "Add Vehicle", description: "Use Fleet Management to add vehicles." });
                      navigate("/ambulance/fleet");
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Vehicle
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {ambulanceFleet.map((vehicle) => (
                  <div key={vehicle.id} className="p-4 border rounded-lg bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-orange-600 rounded-lg flex items-center justify-center">
                          <Ambulance className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{vehicle.id}</h3>
                            <Badge variant="outline">{vehicle.type}</Badge>
                            <Badge className={getStatusColor(vehicle.status)}>
                              {vehicle.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              Driver: {vehicle.driver}
                            </div>
                            <div className="flex items-center gap-2">
                              <Stethoscope className="h-4 w-4" />
                              Paramedic: {vehicle.paramedic}
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4" />
                              {vehicle.location}
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              {vehicle.eta || vehicle.lastService || vehicle.expectedReady}
                            </div>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          toast({ title: "Vehicle details", description: "Opening Fleet Management." });
                          navigate("/ambulance/fleet");
                        }}
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                ))}
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
                {filteredCompletedTrips.map((trip) => (
                  <div key={trip.id} className="p-4 border rounded-lg bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{trip.id}</h3>
                          <Badge className="bg-green-500 text-white">{trip.status}</Badge>
                          <span className="text-sm text-muted-foreground">{trip.time}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
                          <div>
                            <p className="font-medium text-foreground mb-1">Patient</p>
                            <p>{trip.patient}</p>
                          </div>
                          <div>
                            <p className="font-medium text-foreground mb-1">Route</p>
                            <p>{trip.pickup} → {trip.dropoff}</p>
                          </div>
                          <div>
                            <p className="font-medium text-foreground mb-1">Details</p>
                            <p>{trip.duration} • {trip.distance}</p>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-green-600 mb-1">{trip.amount}</div>
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
          <CardTitle>Active Emergency Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {emergencyRequests.map((request) => (
              <div key={request.id} className="p-4 bg-slate-50 rounded-lg border-l-4 border-l-red-500">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold">{request.patient}</h4>
                    <p className="text-sm text-muted-foreground">{request.location}</p>
                    <p className="text-sm font-medium text-red-600">{request.type}</p>
                  </div>
                  <div className="text-right">
                    <Badge className={getPriorityColor(request.priority)}>{request.priority}</Badge>
                    <p className="text-xs text-muted-foreground mt-1">{request.time}</p>
                    <p className="text-xs font-medium">{request.distance}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      setNewEmergencyOpen(true);
                      setEmergencyPatient(request.patient);
                      setEmergencyLocation(request.location);
                      setEmergencyType(request.type);
                      setEmergencyUrgency(request.priority as PendingRequest["urgency"]);
                      toast({ title: "Ready to dispatch", description: "Confirm details and create dispatch." });
                    }}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      openMaps(request.location);
                      toast({ title: "Maps", description: "Opening pickup location." });
                    }}
                  >
                    View Details
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
            <CardTitle>Available Ambulances</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ambulanceFleet.filter(a => a.status === 'Available').map((amb) => (
                <div key={amb.id} className="p-4 bg-green-50 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-semibold">{amb.id} - {amb.type}</h4>
                      <p className="text-sm text-muted-foreground">Driver: {amb.driver}</p>
                      <p className="text-sm text-muted-foreground">Paramedic: {amb.paramedic}</p>
                    </div>
                    <Button size="sm" className="bg-red-600 hover:bg-red-700">Dispatch</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Dispatch Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold">Request #{1000 + i}</p>
                      <p className="text-sm text-muted-foreground">{['Cardiac', 'Accident', 'Stroke'][i % 3]} Emergency</p>
                    </div>
                    <Badge>{['Pending', 'Dispatched', 'Completed'][i % 3]}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderTrackingContent = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Live Tracking</h2>

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
        {ambulanceFleet.filter(a => a.status === 'On Trip').map((amb) => (
          <Card key={amb.id}>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">{amb.id}</CardTitle>
                <Badge className="bg-blue-600">On Trip</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm"><strong>Driver:</strong> {amb.driver}</p>
                <p className="text-sm"><strong>Paramedic:</strong> {amb.paramedic}</p>
                <p className="text-sm"><strong>Location:</strong> {amb.location}</p>
                <p className="text-sm"><strong>ETA:</strong> {amb.eta}</p>
                <Progress value={65} className="mt-3" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

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
            {completedTrips.map((trip) => (
              <div key={trip.id} className="p-4 bg-slate-50 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold">{trip.id} - {trip.patient}</h4>
                    <p className="text-sm text-muted-foreground">{trip.pickup} → {trip.dropoff}</p>
                    <p className="text-sm">Duration: {trip.duration} • Distance: {trip.distance}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-600">{trip.amount}</p>
                    <Badge className="mt-1">{trip.status}</Badge>
                    <p className="text-xs text-muted-foreground mt-1">{trip.time}</p>
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
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add Vehicle
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <Ambulance className="h-8 w-8 text-green-600 mb-2" />
            <div className="text-2xl font-bold">{stats.availableVehicles}</div>
            <p className="text-sm text-muted-foreground">Available</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Activity className="h-8 w-8 text-blue-600 mb-2" />
            <div className="text-2xl font-bold">{stats.activeTrips}</div>
            <p className="text-sm text-muted-foreground">On Trip</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Wrench className="h-8 w-8 text-orange-600 mb-2" />
            <div className="text-2xl font-bold">{ambulanceFleet.filter(a => a.status === 'Maintenance').length}</div>
            <p className="text-sm text-muted-foreground">Maintenance</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Vehicles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {ambulanceFleet.map((amb) => (
              <div key={amb.id} className="p-4 bg-slate-50 rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-semibold">{amb.id} - {amb.type} Ambulance</h4>
                    <p className="text-sm text-muted-foreground">Driver: {amb.driver} • Paramedic: {amb.paramedic}</p>
                    <p className="text-sm">Location: {amb.location}</p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Badge className={getStatusColor(amb.status)}>{amb.status}</Badge>
                    <Button size="sm" variant="outline"><Edit className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderStaffContent = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Staff Management</h2>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add Staff
        </Button>
      </div>

      <Tabs defaultValue="drivers">
        <TabsList>
          <TabsTrigger value="drivers">Drivers</TabsTrigger>
          <TabsTrigger value="paramedics">Paramedics</TabsTrigger>
          <TabsTrigger value="support">Support Staff</TabsTrigger>
        </TabsList>
        <TabsContent value="drivers">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {['Ravi Singh', 'Suresh Kumar', 'Vikram Joshi', 'Rahul Verma', 'Manoj Tiwari'].map((driver, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div>
                      <h4 className="font-semibold">{driver}</h4>
                      <p className="text-sm text-muted-foreground">License: DL-{1000 + i} • Experience: {3 + i} years</p>
                    </div>
                    <div className="flex gap-2">
                      <Badge>{i % 2 === 0 ? 'On Duty' : 'Off Duty'}</Badge>
                      <Button size="sm" variant="outline"><Edit className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="paramedics">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {['Dr. Neha Gupta', 'Nurse Pooja', 'Dr. Arjun Nair', 'Nurse Kavita', 'Nurse Anjali'].map((medic, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div>
                      <h4 className="font-semibold">{medic}</h4>
                      <p className="text-sm text-muted-foreground">License: MED-{2000 + i} • Specialization: Emergency Care</p>
                    </div>
                    <div className="flex gap-2">
                      <Badge>{i % 2 === 0 ? 'On Duty' : 'Off Duty'}</Badge>
                      <Button size="sm" variant="outline"><Edit className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );

  const renderMaintenanceContent = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Maintenance Schedule</h2>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Schedule Maintenance
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Due for Service</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ambulanceFleet.filter(a => a.lastService).map((amb) => (
                <div key={amb.id} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-semibold">{amb.id}</h4>
                      <p className="text-sm text-muted-foreground">Last service: {amb.lastService}</p>
                    </div>
                    <Button size="sm">Schedule</Button>
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
              {ambulanceFleet.filter(a => a.status === 'Maintenance').map((amb) => (
                <div key={amb.id} className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-semibold">{amb.id}</h4>
                      <p className="text-sm text-muted-foreground">Expected ready: {amb.expectedReady}</p>
                    </div>
                    <Badge className="bg-orange-600">In Progress</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderScheduleContent = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Staff Schedule</h2>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Weekly Schedule</CardTitle>
            <Button>Edit Schedule</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-96 bg-slate-100 rounded-lg flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-2" />
              <p>Schedule Calendar View</p>
              <p className="text-sm">Shift management and duty roster</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

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
            <div className="text-2xl font-bold">₹{stats.revenue.toLocaleString()}</div>
            <p className="text-sm text-muted-foreground">Today's Revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <FileText className="h-8 w-8 text-blue-600 mb-2" />
            <div className="text-2xl font-bold">24</div>
            <p className="text-sm text-muted-foreground">Pending Invoices</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <CheckCircle className="h-8 w-8 text-teal-600 mb-2" />
            <div className="text-2xl font-bold">156</div>
            <p className="text-sm text-muted-foreground">Paid This Month</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <XCircle className="h-8 w-8 text-red-600 mb-2" />
            <div className="text-2xl font-bold">3</div>
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
            {completedTrips.map((trip) => (
              <div key={trip.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-lg">
                <div>
                  <h4 className="font-semibold">{trip.id}</h4>
                  <p className="text-sm text-muted-foreground">{trip.patient} • {trip.time}</p>
                </div>
                <div className="text-right flex gap-3 items-center">
                  <span className="font-semibold text-green-600">{trip.amount}</span>
                  <Badge>{trip.status}</Badge>
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
        <TabsContent value="all">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="p-4 bg-slate-50 rounded-lg border-l-4 border-l-red-500">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold">Alert {i + 1}</h4>
                        <p className="text-sm text-muted-foreground">{['Emergency request received', 'Maintenance due', 'Payment overdue'][i % 3]}</p>
                        <p className="text-xs text-muted-foreground mt-1">{i + 1} mins ago</p>
                      </div>
                      <Badge variant={i % 3 === 0 ? 'destructive' : 'default'}>
                        {['Critical', 'Warning', 'Info'][i % 3]}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
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
    </AmbulanceLayout>
  );
};

export default AmbulanceDashboard;
