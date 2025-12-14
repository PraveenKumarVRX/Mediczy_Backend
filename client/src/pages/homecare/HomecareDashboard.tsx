import { useState, useEffect, useMemo } from "react";
import type { ComponentType } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Home, User, Clock, Heart, Activity, TrendingUp, Users, Calendar,
  LogOut, Search, Filter, Plus, CheckCircle, Phone, MapPin,
  Thermometer, Pill, ClipboardList, Star, DollarSign, FileText,
  Sun, Moon, Edit, Trash2, Eye, Download, Settings, AlertCircle,
  BarChart3, Bell, Package, Mail
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/utils/theme.provider";

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

type IconType = ComponentType<{ className?: string }>;

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

function ensureSeed<T>(key: string, seed: T) {
  if (typeof window === "undefined") return;
  const existing = window.localStorage.getItem(key);
  if (existing == null) {
    window.localStorage.setItem(key, JSON.stringify(seed));
  }
}

function formatVisitLabel(dateStr: string, timeStr: string) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const dateLabel = dateStr === todayStr ? "Today" : dateStr === tomorrowStr ? "Tomorrow" : dateStr;
  const timeLabel = timeStr && timeStr !== "—" ? timeStr : "";
  return timeLabel ? `${dateLabel}, ${timeLabel}` : dateLabel;
}

const HomecareDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [homecareData, setHomecareData] = useState<any>(null);
  const [patientsStore, setPatientsStore] = useState<HomecarePatient[]>([]);
  const [staffStore, setStaffStore] = useState<HomecareStaff[]>([]);
  const [servicesStore, setServicesStore] = useState<HomecareService[]>([]);
  const [appointmentsStore, setAppointmentsStore] = useState<HomecareAppointment[]>([]);
  const [stats, setStats] = useState({
    activePatients: 18,
    todayVisits: 8,
    totalPatients: 342,
    revenue: 125000,
    availableNurses: 12,
    totalStaff: 20,
    avgRating: 4.8,
    completionRate: "96%"
  });

  const loadHomecareEntities = () => {
    const patients = readStorage<HomecarePatient[]>(HOMECARE_STORAGE_KEYS.patients, []);
    const staff = readStorage<HomecareStaff[]>(HOMECARE_STORAGE_KEYS.staff, []);
    const services = readStorage<HomecareService[]>(HOMECARE_STORAGE_KEYS.services, []);
    const appointments = readStorage<HomecareAppointment[]>(HOMECARE_STORAGE_KEYS.appointments, []);

    setPatientsStore(patients);
    setStaffStore(staff);
    setServicesStore(services);
    setAppointmentsStore(appointments);

    const activePatientsCount = patients.filter((p) => p.status === "Active" || p.status === "Critical").length;
    const totalPatientsCount = patients.length;

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayVisitsCount = appointments.filter(
      (a) => a.date === todayStr && a.status !== "Cancelled"
    ).length;

    const availableStaffCount = staff.filter((s) => s.status === "Active" || s.status === "On Duty").length;
    const totalStaffCount = staff.length;

    const avgRating = staff.length
      ? Number(
          (
            staff.reduce((sum, s) => sum + (Number.isFinite(s.rating) ? s.rating : 0), 0) /
            staff.length
          ).toFixed(1)
        )
      : 0;

    const completed = appointments.filter((a) => a.status === "Completed").length;
    const completionRate = appointments.length
      ? `${Math.round((completed / appointments.length) * 100)}%`
      : "0%";

    setStats((prev) => ({
      ...prev,
      activePatients: activePatientsCount,
      totalPatients: totalPatientsCount,
      todayVisits: todayVisitsCount,
      availableNurses: availableStaffCount,
      totalStaff: totalStaffCount,
      avgRating,
      completionRate,
    }));
  };

  useEffect(() => {
    const data = localStorage.getItem("homecareData");
    if (data) {
      setHomecareData(JSON.parse(data));
    } else {
      navigate("/homecare/login");
    }

    // Ensure demo seeds exist even if user lands on dashboard first.
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

    ensureSeed<HomecareStaff[]>(HOMECARE_STORAGE_KEYS.staff, [
      { id: "EMP001", name: "Sarah Davis", role: "Registered Nurse", phone: "+1 555 0201", patients: 12, rating: 4.8, status: "On Duty" },
      { id: "EMP002", name: "Mike Chen", role: "Care Assistant", phone: "+1 555 0202", patients: 8, rating: 4.6, status: "Active" },
      { id: "EMP003", name: "Emma Taylor", role: "Physical Therapist", phone: "+1 555 0203", patients: 6, rating: 4.9, status: "Active" },
    ]);

    ensureSeed<HomecareService[]>(HOMECARE_STORAGE_KEYS.services, [
      { id: "SVC001", name: "Nursing Care", category: "Medical", price: "₹800/visit", duration: "1 hour", status: "Active" },
      { id: "SVC002", name: "Personal Care", category: "Assistance", price: "₹500/visit", duration: "45 mins", status: "Active" },
      { id: "SVC003", name: "Physical Therapy", category: "Rehabilitation", price: "₹1,200/session", duration: "1.5 hours", status: "Active" },
    ]);

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

    loadHomecareEntities();

    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (
        e.key === HOMECARE_STORAGE_KEYS.patients ||
        e.key === HOMECARE_STORAGE_KEYS.staff ||
        e.key === HOMECARE_STORAGE_KEYS.services ||
        e.key === HOMECARE_STORAGE_KEYS.appointments
      ) {
        loadHomecareEntities();
      }
    };

    const onFocus = () => loadHomecareEntities();

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [navigate]);

  const { theme, setTheme } = useTheme();

  const handleLogout = () => {
    localStorage.removeItem("homecareToken");
    localStorage.removeItem("homecareData");
      const toggleTheme = () => {
        setTheme(theme === "dark" ? "light" : "dark");
      };

    toast({
      title: "Logged Out",
      description: "You have been successfully logged out.",
    });
    navigate("/homecare/login");
  };

  const activePatients = useMemo(() => {
    const appointmentsSorted = [...appointmentsStore].sort((a, b) => {
      const ad = `${a.date} ${a.time}`;
      const bd = `${b.date} ${b.time}`;
      return ad.localeCompare(bd);
    });

    const getNextAppointment = (patientName: string) => {
      const today = new Date();
      const todayIso = today.toISOString().slice(0, 10);
      const upcoming = appointmentsSorted
        .filter((a) => a.patient === patientName && a.status !== "Cancelled")
        .filter((a) => a.date >= todayIso)
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
      return upcoming[0] || null;
    };

    return patientsStore
      .filter((p) => p.status !== "Discharged")
      .slice(0, 8)
      .map((p) => {
        const next = getNextAppointment(p.name);
        return {
          id: p.id,
          name: p.name,
          age: p.age,
          service: p.condition || "—",
          nurse: p.caregiver || "—",
          nextVisit: next ? formatVisitLabel(next.date, next.time) : "—",
          status: next?.status || p.status,
          condition: p.status === "Critical" ? "Critical" : p.condition || "—",
          location: p.address || "—",
          phone: p.phone,
        };
      });
  }, [appointmentsStore, patientsStore]);

  const caregivers = useMemo(() => {
    return staffStore.map((s) => ({
      id: s.id,
      name: s.name,
      specialization: s.role,
      experience: "—",
      rating: s.rating,
      patients: s.patients,
      status: s.status,
      availability: "—",
      location: "—",
      phone: s.phone,
    }));
  }, [staffStore]);

  const services = useMemo(() => {
    const categoryIcon = (category: string): IconType => {
      const c = category.toLowerCase();
      if (c.includes("medical")) return Heart;
      if (c.includes("assist")) return User;
      if (c.includes("rehab")) return Activity;
      return ClipboardList;
    };

    return servicesStore.map((s) => {
      const appointmentCount = appointmentsStore.filter((a) => a.service === s.name).length;
      return {
        id: s.id,
        name: s.name,
        patients: appointmentCount,
        revenue: "—",
        growth: "—",
        icon: categoryIcon(s.category),
      };
    });
  }, [appointmentsStore, servicesStore]);

  const recentBookings = useMemo(() => {
    const labelStatus = (status: HomecareAppointmentStatus) => {
      if (status === "Scheduled") return "Confirmed";
      return status;
    };

    return [...appointmentsStore]
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
      .slice(0, 8)
      .map((a) => ({
        id: a.id,
        patient: a.patient,
        service: a.service,
        duration: "—",
        amount: "—",
        status: labelStatus(a.status),
        startDate: a.date,
      }));
  }, [appointmentsStore]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Available": return "bg-green-500 text-white";
      case "On Duty": return "bg-blue-500 text-white";
      case "On Visit": return "bg-orange-500 text-white";
      case "Off Duty": return "bg-gray-500 text-white";
      case "Active": return "bg-green-600 text-white";
      default: return "bg-gray-400 text-white";
    }
  };

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case "Stable": return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
      case "Recovering": return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
      case "Monitored": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300";
      case "Improving": return "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300";
      case "Critical": return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
      default: return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  const location = useLocation();

  // Route-aware content rendering
  const renderContent = () => {
    const path = location.pathname;
    
    if (path === '/homecare/dashboard') return renderDashboardContent();
    else if (path === '/homecare/services') return renderServicesContent();
    else if (path === '/homecare/bookings') return renderBookingsContent();
    else if (path === '/homecare/providers') return renderProvidersContent();
    else if (path === '/homecare/schedules') return renderSchedulesContent();
    else if (path === '/homecare/patients') return renderPatientsContent();
    else if (path === '/homecare/billing') return renderBillingContent();
    else if (path === '/homecare/reports') return renderReportsContent();
    else if (path === '/homecare/settings') return renderSettingsContent();
    
    return renderDashboardContent();
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const renderDashboardContent = () => (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 dark:from-gray-900 dark:to-gray-800 p-6">
      {/* Header */}
      <div className="mb-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-purple-100 dark:border-purple-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
              <Home className="h-10 w-10 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                Homecare Management
              </h1>
              <p className="text-muted-foreground mt-1">
                {homecareData?.name || "Home Healthcare Services"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="border border-transparent hover:border-purple-200"
            >
              {theme === "light" ? (
                <Sun className="h-5 w-5 text-purple-600" />
              ) : (
                <Moon className="h-5 w-5 text-purple-200" />
              )}
            </Button>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="border-purple-300 text-purple-600 hover:bg-purple-50"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="border-purple-200 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Patients
              </CardTitle>
              <Users className="h-5 w-5 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">{stats.activePatients}</div>
            <p className="text-xs text-muted-foreground mt-1">Under care now</p>
          </CardContent>
        </Card>

        <Card className="border-pink-200 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Today's Visits
              </CardTitle>
              <Calendar className="h-5 w-5 text-pink-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-pink-600">{stats.todayVisits}</div>
            <p className="text-xs text-muted-foreground mt-1">Scheduled today</p>
          </CardContent>
        </Card>

        <Card className="border-green-200 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Available Staff
              </CardTitle>
              <Heart className="h-5 w-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {stats.availableNurses}/{stats.totalStaff}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Ready for assignment</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Average Rating
              </CardTitle>
              <Star className="h-5 w-5 text-yellow-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{stats.avgRating}</div>
            <p className="text-xs text-muted-foreground mt-1">Patient satisfaction</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white dark:bg-gray-800 p-1 shadow-md">
          <TabsTrigger value="overview" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
            <Users className="h-4 w-4 mr-2" />
            Active Patients
          </TabsTrigger>
          <TabsTrigger value="caregivers" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
            <Heart className="h-4 w-4 mr-2" />
            Caregivers
          </TabsTrigger>
          <TabsTrigger value="services" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
            <ClipboardList className="h-4 w-4 mr-2" />
            Services
          </TabsTrigger>
          <TabsTrigger value="bookings" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
            <FileText className="h-4 w-4 mr-2" />
            Bookings
          </TabsTrigger>
        </TabsList>

        {/* Active Patients Tab */}
        <TabsContent value="overview" className="space-y-6">
          <Card className="border-purple-200 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl text-purple-600">Active Patients</CardTitle>
                  <CardDescription>Current patients under homecare</CardDescription>
                </div>
                <Button
                  className="bg-purple-600 hover:bg-purple-700"
                  onClick={() => {
                    toast({ title: "Patients", description: "Opening patient management..." });
                    navigate("/homecare/patients");
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Patient
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activePatients.map((patient) => (
                  <div key={patient.id} className="p-4 border rounded-lg bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{patient.name}</h3>
                          <Badge variant="outline">{patient.age} years</Badge>
                          <Badge className={getConditionColor(patient.condition)}>
                            {patient.condition}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Heart className="h-4 w-4 text-purple-500" />
                            {patient.service}
                          </div>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-pink-500" />
                            {patient.nurse}
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-blue-500" />
                            Next: {patient.nextVisit}
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-green-500" />
                            {patient.location}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-purple-500 text-purple-600 hover:bg-purple-50"
                          onClick={() => {
                            toast({ title: "Care Plans", description: "Opening care plan management..." });
                            navigate("/homecare/care-plans");
                          }}
                        >
                          <ClipboardList className="h-4 w-4 mr-1" />
                          Care Plan
                        </Button>
                        <Button
                          size="sm"
                          className="bg-purple-600 hover:bg-purple-700"
                          onClick={() => {
                            const phone = (patient as any).phone as string | undefined;
                            if (!phone) {
                              toast({ title: "No phone number", description: "Add a phone number for this patient." });
                              return;
                            }
                            toast({ title: "Call", description: "Dialing patient..." });
                            window.location.href = `tel:${phone}`;
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

        {/* Caregivers Tab */}
        <TabsContent value="caregivers" className="space-y-6">
          <Card className="border-pink-200 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl text-pink-600">Care Team</CardTitle>
                  <CardDescription>Nurses and healthcare professionals</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      toast({ title: "Staff", description: "Opening staff management..." });
                      navigate("/homecare/staff");
                    }}
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Filter
                  </Button>
                  <Button
                    className="bg-pink-600 hover:bg-pink-700"
                    onClick={() => {
                      toast({ title: "Staff", description: "Opening add staff form..." });
                      navigate("/homecare/staff");
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Staff
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {caregivers.map((caregiver) => (
                  <div key={caregiver.id} className="p-4 border rounded-lg bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
                          <User className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{caregiver.name}</h3>
                            <Badge variant="outline">{caregiver.specialization}</Badge>
                            <Badge className={getStatusColor(caregiver.status)}>
                              {caregiver.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-3 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              {caregiver.experience} experience
                            </div>
                            <div className="flex items-center gap-2">
                              <Star className="h-4 w-4 text-yellow-500" />
                              {caregiver.rating} rating
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              {caregiver.patients} active patients
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            toast({ title: "Appointments", description: "Opening appointment schedule..." });
                            navigate("/homecare/appointments");
                          }}
                        >
                          Schedule
                        </Button>
                        <Button
                          size="sm"
                          className="bg-purple-600 hover:bg-purple-700"
                          onClick={() => {
                            const phone = (caregiver as any).phone as string | undefined;
                            if (!phone) {
                              toast({ title: "No phone number", description: "Add a phone number for this caregiver." });
                              return;
                            }
                            toast({ title: "Call", description: "Dialing caregiver..." });
                            window.location.href = `tel:${phone}`;
                          }}
                        >
                          <Phone className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Services Tab */}
        <TabsContent value="services" className="space-y-6">
          <Card className="border-blue-200 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl text-blue-600">Service Categories</CardTitle>
              <CardDescription>Performance by service type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {services.map((service) => {
                  const IconComponent = service.icon;
                  return (
                    <div key={service.id} className="p-4 border rounded-lg bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                            <IconComponent className="h-6 w-6 text-white" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg mb-1">{service.name}</h3>
                            <p className="text-sm text-muted-foreground">{service.patients} patients</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-purple-600">{service.revenue}</div>
                          <div className="text-sm text-green-600 font-medium">{service.growth}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bookings Tab */}
        <TabsContent value="bookings" className="space-y-6">
          <Card className="border-green-200 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl text-green-600">Recent Bookings</CardTitle>
                  <CardDescription>Latest service requests</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Input placeholder="Search bookings..." className="w-64" />
                  <Button variant="outline" onClick={() => toast({ title: "Search", description: "Searching bookings..." })}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentBookings.map((booking) => (
                  <div key={booking.id} className="p-4 border rounded-lg bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{booking.id}</h3>
                          <Badge className={booking.status === "Confirmed" ? "bg-green-500 text-white" : "bg-blue-500 text-white"}>
                            {booking.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                          <div>
                            <p className="font-medium text-foreground mb-1">Patient</p>
                            <p>{booking.patient}</p>
                          </div>
                          <div>
                            <p className="font-medium text-foreground mb-1">Service</p>
                            <p>{booking.service}</p>
                          </div>
                          <div>
                            <p className="font-medium text-foreground mb-1">Duration</p>
                            <p>{booking.duration}</p>
                          </div>
                          <div>
                            <p className="font-medium text-foreground mb-1">Start Date</p>
                            <p>{booking.startDate}</p>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-purple-600 mb-2">{booking.amount}</div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            toast({ title: "Bookings", description: "Opening booking details..." });
                            navigate("/homecare/appointments");
                          }}
                        >
                          View Details
                        </Button>
                      </div>
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

  const renderServicesContent = () => (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Service Management</h2>
            <p className="text-muted-foreground mt-1">Manage homecare services offered</p>
          </div>
          <Button
            className="gap-2 bg-gradient-to-r from-purple-600 to-pink-600"
            onClick={() => navigate("/homecare/services")}
          >
            <Plus className="h-4 w-4" />
            Add New Service
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {services.map((service) => (
          <Card key={service.id} className="hover:shadow-xl transition-shadow border-purple-100">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <service.icon className="h-5 w-5 text-purple-600" />
                  {service.name}
                </CardTitle>
                <Badge className="bg-green-100 text-green-700">{service.growth}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Active Patients:</span>
                  <span className="font-semibold">{service.patients}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Monthly Revenue:</span>
                  <span className="font-semibold text-green-600">{service.revenue}</span>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" className="flex-1"><Edit className="h-4 w-4 mr-1" />Edit</Button>
                <Button size="sm" variant="outline" className="flex-1"><Eye className="h-4 w-4 mr-1" />View</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderBookingsContent = () => (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Bookings</h2>
          <Button
            className="gap-2 bg-gradient-to-r from-purple-600 to-pink-600"
            onClick={() => navigate("/homecare/appointments")}
          >
            <Plus className="h-4 w-4" />
            New Booking
          </Button>
        </div>
      </div>

      <Card className="border-purple-100">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>All Bookings</CardTitle>
            <div className="flex gap-2">
              <Input placeholder="Search bookings..." className="w-64" />
              <Button variant="outline" size="icon"><Filter className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentBookings.map((booking) => (
              <div key={booking.id} className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-gray-800 dark:to-gray-700 rounded-lg border border-purple-100">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold">{booking.id} - {booking.patient}</h4>
                    <p className="text-sm text-muted-foreground">{booking.service}</p>
                    <p className="text-sm">Duration: {booking.duration} • Start: {booking.startDate}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-600">{booking.amount}</p>
                    <Badge className="mt-1">{booking.status}</Badge>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline"><Eye className="h-4 w-4 mr-1" />View</Button>
                  <Button size="sm" variant="outline"><Edit className="h-4 w-4 mr-1" />Edit</Button>
                  <Button size="sm" variant="outline"><Download className="h-4 w-4 mr-1" />Invoice</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderProvidersContent = () => (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Care Providers</h2>
          <Button className="gap-2 bg-gradient-to-r from-purple-600 to-pink-600">
            <Plus className="h-4 w-4" />
            Add Provider
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {caregivers.map((provider) => (
          <Card key={provider.id} className="hover:shadow-xl transition-shadow border-purple-100">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-lg">{provider.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{provider.specialization}</p>
                </div>
                <Badge className={getStatusColor(provider.status)}>{provider.status}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Experience:</span>
                  <span className="font-semibold">{provider.experience}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Active Patients:</span>
                  <span className="font-semibold">{provider.patients}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rating:</span>
                  <span className="font-semibold flex items-center gap-1">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    {provider.rating}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Availability:</span>
                  <span className="font-semibold">{provider.availability}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Location:</span>
                  <span className="font-semibold">{provider.location}</span>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" className="flex-1"><Edit className="h-4 w-4 mr-1" />Edit</Button>
                <Button size="sm" variant="outline" className="flex-1"><Phone className="h-4 w-4 mr-1" />Call</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderSchedulesContent = () => (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Staff Schedules</h2>
        <p className="text-muted-foreground mt-1">Manage caregiver schedules and assignments</p>
      </div>

      <Card className="border-purple-100">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Today's Schedule</CardTitle>
            <div className="flex gap-2">
              <Select>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Select Date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="tomorrow">Tomorrow</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon"><Calendar className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {activePatients.map((patient) => (
              <div key={patient.id} className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-gray-800 dark:to-gray-700 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold">{patient.name} ({patient.age})</h4>
                    <p className="text-sm text-muted-foreground">{patient.service}</p>
                    <p className="text-sm font-medium text-purple-600">{patient.nextVisit}</p>
                    <p className="text-sm text-muted-foreground">Assigned: {patient.nurse}</p>
                  </div>
                  <div className="text-right">
                    <Badge className={getConditionColor(patient.condition)}>{patient.condition}</Badge>
                    <p className="text-xs text-muted-foreground mt-1">{patient.location}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline"><MapPin className="h-4 w-4 mr-1" />Navigate</Button>
                  <Button size="sm" variant="outline"><Phone className="h-4 w-4 mr-1" />Call</Button>
                  <Button size="sm" variant="outline"><Eye className="h-4 w-4 mr-1" />Details</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderPatientsContent = () => (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Patient Management</h2>
          <Button className="gap-2 bg-gradient-to-r from-purple-600 to-pink-600">
            <Plus className="h-4 w-4" />
            Add Patient
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="border-purple-100">
          <CardContent className="pt-6">
            <Users className="h-8 w-8 text-purple-600 mb-2" />
            <div className="text-2xl font-bold">{stats.activePatients}</div>
            <p className="text-sm text-muted-foreground">Active Patients</p>
          </CardContent>
        </Card>
        <Card className="border-purple-100">
          <CardContent className="pt-6">
            <Activity className="h-8 w-8 text-pink-600 mb-2" />
            <div className="text-2xl font-bold">{stats.todayVisits}</div>
            <p className="text-sm text-muted-foreground">Today's Visits</p>
          </CardContent>
        </Card>
        <Card className="border-purple-100">
          <CardContent className="pt-6">
            <User className="h-8 w-8 text-rose-600 mb-2" />
            <div className="text-2xl font-bold">{stats.totalPatients}</div>
            <p className="text-sm text-muted-foreground">Total Registered</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-purple-100">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>All Patients</CardTitle>
            <Input placeholder="Search patients..." className="w-64" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {activePatients.map((patient) => (
              <div key={patient.id} className="p-4 bg-slate-50 dark:bg-gray-800 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold">{patient.name}, {patient.age} years</h4>
                    <p className="text-sm text-muted-foreground">{patient.service}</p>
                    <p className="text-sm">Care Provider: {patient.nurse}</p>
                    <p className="text-sm">Location: {patient.location}</p>
                  </div>
                  <Badge className={getConditionColor(patient.condition)}>{patient.condition}</Badge>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline"><Eye className="h-4 w-4 mr-1" />View</Button>
                  <Button size="sm" variant="outline"><Edit className="h-4 w-4 mr-1" />Edit</Button>
                  <Button size="sm" variant="outline"><FileText className="h-4 w-4 mr-1" />Records</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderBillingContent = () => (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Billing & Payments</h2>
          <Button className="gap-2 bg-gradient-to-r from-purple-600 to-pink-600">
            <Plus className="h-4 w-4" />
            Generate Invoice
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="border-purple-100">
          <CardContent className="pt-6">
            <DollarSign className="h-8 w-8 text-green-600 mb-2" />
            <div className="text-2xl font-bold">₹{stats.revenue.toLocaleString()}</div>
            <p className="text-sm text-muted-foreground">Monthly Revenue</p>
          </CardContent>
        </Card>
        <Card className="border-purple-100">
          <CardContent className="pt-6">
            <FileText className="h-8 w-8 text-blue-600 mb-2" />
            <div className="text-2xl font-bold">45</div>
            <p className="text-sm text-muted-foreground">Pending Invoices</p>
          </CardContent>
        </Card>
        <Card className="border-purple-100">
          <CardContent className="pt-6">
            <CheckCircle className="h-8 w-8 text-teal-600 mb-2" />
            <div className="text-2xl font-bold">234</div>
            <p className="text-sm text-muted-foreground">Paid This Month</p>
          </CardContent>
        </Card>
        <Card className="border-purple-100">
          <CardContent className="pt-6">
            <AlertCircle className="h-8 w-8 text-red-600 mb-2" />
            <div className="text-2xl font-bold">8</div>
            <p className="text-sm text-muted-foreground">Overdue</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-purple-100">
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentBookings.map((booking) => (
              <div key={booking.id} className="flex justify-between items-center p-4 bg-slate-50 dark:bg-gray-800 rounded-lg">
                <div>
                  <h4 className="font-semibold">{booking.id}</h4>
                  <p className="text-sm text-muted-foreground">{booking.patient} • {booking.service}</p>
                </div>
                <div className="text-right flex gap-3 items-center">
                  <span className="font-semibold text-green-600">{booking.amount}</span>
                  <Badge>{booking.status}</Badge>
                  <Button size="sm" variant="outline"><Download className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderReportsContent = () => (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Reports & Analytics</h2>
        <p className="text-muted-foreground mt-1">Generate detailed reports and insights</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {['Service Performance Report', 'Financial Report', 'Provider Performance', 'Patient Satisfaction', 'Operational Analytics', 'Revenue Analysis'].map((report, i) => (
          <Card key={i} className="border-purple-100 hover:shadow-xl transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg">{report}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button className="w-full gap-2 bg-gradient-to-r from-purple-600 to-pink-600">
                <Download className="h-4 w-4" />
                Generate Report
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderSettingsContent = () => (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Settings</h2>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <Card className="border-purple-100">
            <CardHeader>
              <CardTitle>Organization Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Organization Name</label>
                <Input placeholder="Enter organization name" className="mt-1" defaultValue={homecareData?.name} />
              </div>
              <div>
                <label className="text-sm font-medium">Registration Number</label>
                <Input placeholder="Enter registration number" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Address</label>
                <Textarea placeholder="Enter address" className="mt-1" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Phone</label>
                  <Input placeholder="Enter phone" className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <Input placeholder="Enter email" className="mt-1" />
                </div>
              </div>
              <Button className="bg-gradient-to-r from-purple-600 to-pink-600">Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="services">
          <Card className="border-purple-100">
            <CardHeader>
              <CardTitle>Service Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-muted-foreground">Configure service offerings and pricing</div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );

  return renderContent();
};

export default HomecareDashboard;
