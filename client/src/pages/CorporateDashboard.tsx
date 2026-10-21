import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Building2, 
  Users, 
  Activity, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  Heart,
  Shield,
  CheckCircle,
  Clock,
  UserX,
  Calendar,
  CalendarCheck,
  MapPin,
  Phone,
  Mail,
  Stethoscope,
  FileText,
  Download,
  RefreshCw,
  Filter,
  Search,
  Eye,
  BarChart3,
  PieChart,
  Bell,
  MessageSquare,
  Settings,
  HelpCircle,
  ArrowRight,
  Sparkles,
  Zap,
  Star,
  ChevronRight,
  Briefcase,
  UserCog,
} from "lucide-react";
import { getUserType } from "@/hooks/auth";
import api from "@/utils/api";
import ExcelJS from "exceljs";
import { downloadArrayBuffer } from "@/utils/downloadFile";
import { PieChart as RechartsPieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import CorporateLayout from "@/components/corporate/CorporateLayout";
import { cn } from "@/lib/utils";

interface EmployeeHealth {
  id: string;
  employeeId: string;
  name: string;
  businessUnit: string;
  department: string;
  designation: string;
  age: number;
  gender: string;
  phone: string;
  email: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  healthConditions: string[];
  lastCheckup: string;
  nextCheckup?: string;
  bmi: number;
  bloodPressure: string;
  bloodSugar: number;
  cholesterol: number;
  smokingStatus: string;
  alcoholConsumption: string;
  exerciseFrequency: string;
  stressLevel: string;
  sleepHours: number;
  chronicDiseases: string[];
  medications: string[];
  absenteeismDays: number;
  lastConsultation?: string;
  planEnrolled: string;
  deviceConnected: boolean;
}

interface HealthRiskAnalytics {
  totalEmployees: number;
  monitoredEmployees: number;
  healthyEmployees: number;
  atRiskEmployees: number;
  criticalCases: number;
  averageRiskScore: number;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  departmentRisks: Array<{
    department: string;
    totalEmployees: number;
    highRisk: number;
    avgRiskScore: number;
  }>;
  commonConditions: Array<{
    condition: string;
    count: number;
    percentage: number;
  }>;
  trendData: Array<{
    month: string;
    avgRiskScore: number;
    healthyCount: number;
    atRiskCount: number;
  }>;
}

interface CorporateAppointment {
  id: string;
  appointmentId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  phone: string;
  email: string;
  appointmentType: 'Annual Checkup' | 'Preventive Screening' | 'Specialist Consultation' | 'Follow-up' | 'Diagnostic Test';
  doctor: string;
  specialty: string;
  hospitalName: string;
  appointmentDate: string;
  appointmentTime: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no-show';
  benefitType: string;
  claimAmount: number;
  notes?: string;
  bookedOn: string;
}

const CorporateDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [appointments, setAppointments] = useState<CorporateAppointment[]>([]);
  const [filteredAppointments, setFilteredAppointments] = useState<CorporateAppointment[]>([]);
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState('all');
  const [appointmentTypeFilter, setAppointmentTypeFilter] = useState('all');
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Corporate profile — read from summary API or fall back to localStorage (set on login).
  // Login stores: { name, email, id, type } — 'name' is companyName.
  const [corporateProfile, setCorporateProfile] = useState(() => {
    try {
      const stored = localStorage.getItem('corporateData');
      const parsed = stored ? JSON.parse(stored) : null;
      return {
        companyName: parsed?.name || parsed?.companyName || "Corporate Portal",
        logo: parsed?.logo || null,
        adminName: parsed?.contactPerson || "Admin",
        plan: "Loading plan…",
      };
    } catch {
      return { companyName: "Corporate Portal", logo: null, adminName: "Admin", plan: "Loading plan…" };
    }
  });
  
  // Time-based greeting like DoctorDashboard
  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };
  
  const [summary, setSummary] = useState<{
    KPIs: {
      activeEmployees: number;
      totalConsultationsThisMonth: number;
      averageSatisfactionScore: number;
      emergencyCasesHandled: number;
    };
    recentActivities: Array<{
      id: string;
      type: string;
      employeeName: string;
      department: string;
      date: string;
      notes: string;
    }>;
  } | null>(null);

  const [healthAnalytics, setHealthAnalytics] = useState<HealthRiskAnalytics | null>(null);
  const [employees, setEmployees] = useState<EmployeeHealth[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<EmployeeHealth[]>([]);
  const [participation, setParticipation] = useState<any>(null);
  const [ageDistribution, setAgeDistribution] = useState<any[]>([]);
  const [monthlyUtilization, setMonthlyUtilization] = useState<{ month: string; appointments: number; ahcCompletions: number }[]>([]);

  useEffect(() => {
    fetchDashboardData(true);
    
    // Auto-refresh every 5 minutes (300000ms) instead of every minute
    const interval = setInterval(() => fetchDashboardData(false), 300000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    filterEmployees();
  }, [employees, searchQuery, riskFilter, departmentFilter]);

  useEffect(() => {
    filterAppointments();
  }, [appointments, searchQuery, appointmentStatusFilter, appointmentTypeFilter, departmentFilter]);

  const fetchDashboardData = async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);
      
      const [summaryRes, healthRes, employeesRes, appointmentsRes, participationRes, ageDistRes, utilizationRes, benefitsRes] = await Promise.all([
        api.get("/corporate/dashboard/summary").catch(() => ({ data: null })),
        api.get("/corporate/dashboard/health-analytics").catch(() => ({ data: null })),
        api.get("/corporate/dashboard/employees-health").catch(() => ({ data: null })),
        api.get("/corporate/dashboard/appointments").catch(() => ({ data: null })),
        api.get("/corporate/analytics/participation").catch(() => ({ data: null })),
        api.get("/corporate/dashboard/age-distribution").catch(() => ({ data: null })),
        api.get("/corporate/analytics/monthly-utilization").catch(() => ({ data: null })),
        api.get("/corporate/my-benefits").catch(() => ({ data: null }))
      ]);

      setSummary(summaryRes.data?.data || null);
      setHealthAnalytics(healthRes.data?.data || null);
      setEmployees(employeesRes.data?.data?.employees || []);
      setAppointments(appointmentsRes.data?.data?.appointments || []);
      setParticipation(participationRes.data?.data || null);
      setAgeDistribution(ageDistRes.data?.data?.ageGroups || []);
      setMonthlyUtilization(utilizationRes.data?.data?.chart || []);

      // Update corporate profile from summary API response
      const cp = summaryRes.data?.data?.corporateProfile;
      if (cp) {
        setCorporateProfile(prev => ({
          ...prev,
          companyName: cp.organization || prev.companyName,
          adminName: cp.contactPerson || prev.adminName,
          plan: benefitsRes.data?.data?.plan?.planName || 'No plan configured',
        }));
      }
    } catch (err: any) {
      console.error("Failed to load corporate dashboard", err);
      setError("Unable to load dashboard data. Please try again.");
      setSummary(null);
      setHealthAnalytics(null);
      setEmployees([]);
      setAppointments([]);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const filterEmployees = () => {
    let filtered = employees;

    if (searchQuery) {
      filtered = filtered.filter(emp =>
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.department.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (riskFilter !== 'all') {
      filtered = filtered.filter(emp => emp.riskLevel === riskFilter);
    }

    if (departmentFilter !== 'all') {
      filtered = filtered.filter(emp => emp.department === departmentFilter);
    }

    setFilteredEmployees(filtered);
  };

  const filterAppointments = () => {
    let filtered = appointments;

    if (searchQuery) {
      filtered = filtered.filter(apt =>
        apt.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        apt.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        apt.appointmentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        apt.doctor.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (appointmentStatusFilter !== 'all') {
      filtered = filtered.filter(apt => apt.status === appointmentStatusFilter);
    }

    if (appointmentTypeFilter !== 'all') {
      filtered = filtered.filter(apt => apt.appointmentType === appointmentTypeFilter);
    }

    if (departmentFilter !== 'all') {
      filtered = filtered.filter(apt => apt.department === departmentFilter);
    }

    setFilteredAppointments(filtered);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-info/10 text-info border-info/20';
      case 'completed': return 'bg-success/10 text-success border-success/20';
      case 'cancelled': return 'bg-muted/10 text-muted-foreground border-muted/20';
      case 'no-show': return 'bg-destructive/10 text-destructive border-destructive/20';
      default: return 'bg-muted/10 text-muted-foreground border-muted/20';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'bg-success/10 text-success border-success/20';
      case 'medium': return 'bg-warning/10 text-warning border-warning/20';
      case 'high': return 'bg-warning/10 text-warning border-warning/20';
      case 'critical': return 'bg-destructive/10 text-destructive border-destructive/20';
      default: return 'bg-muted/10 text-muted-foreground border-muted/20';
    }
  };

  const getRiskScoreColor = (score: number) => {
    if (score < 30) return 'text-green-600';
    if (score < 50) return 'text-yellow-600';
    if (score < 70) return 'text-orange-600';
    return 'text-red-600';
  };

  const COLORS = {
    low: '#10b981',
    medium: '#f59e0b',
    high: '#ef4444',
    critical: '#6b7280'
  };

  // Placeholder ghost data shown before real assessments come in
  const PLACEHOLDER_RISK = [
    { name: 'Low Risk',    value: 4, fill: '#334155' },
    { name: 'Medium Risk', value: 3, fill: '#475569' },
    { name: 'High Risk',   value: 2, fill: '#64748b' },
    { name: 'Critical',    value: 1, fill: '#94a3b8' },
  ];
  const PLACEHOLDER_CONDITIONS = [
    { condition: '—', count: 12 }, { condition: '—', count: 8 },
    { condition: '—', count: 15 }, { condition: '—', count: 6 },
    { condition: '—', count: 10 }, { condition: '—', count: 4 },
  ];
  const PLACEHOLDER_TRENDS = [
    { month: 'Month 1', healthyCount: 16, atRiskCount: 5 },
    { month: 'Month 2', healthyCount: 19, atRiskCount: 6 },
    { month: 'Month 3', healthyCount: 14, atRiskCount: 4 },
    { month: 'Month 4', healthyCount: 21, atRiskCount: 7 },
    { month: 'Month 5', healthyCount: 17, atRiskCount: 5 },
    { month: 'Month 6', healthyCount: 23, atRiskCount: 8 },
  ];

  const handleExportReport = () => {
    const rows: string[][] = [
      ["Metric", "Value"],
      ["Company", corporateProfile.companyName],
      ["Report Date", new Date().toLocaleDateString()],
      ["Total Employees", String(healthAnalytics?.totalEmployees ?? "—")],
      ["Monitored Employees", String(healthAnalytics?.monitoredEmployees ?? "—")],
      ["Healthy Employees", String(healthAnalytics?.healthyEmployees ?? "—")],
      ["At-Risk Employees", String(healthAnalytics?.atRiskEmployees ?? "—")],
      ["Critical Cases", String(healthAnalytics?.criticalCases ?? "—")],
      ["Average Risk Score", healthAnalytics?.averageRiskScore != null ? healthAnalytics.averageRiskScore.toFixed(1) : "—"],
      ["Risk: Low", String(healthAnalytics?.riskDistribution?.low ?? 0)],
      ["Risk: Medium", String(healthAnalytics?.riskDistribution?.medium ?? 0)],
      ["Risk: High", String(healthAnalytics?.riskDistribution?.high ?? 0)],
      ["Risk: Critical", String(healthAnalytics?.riskDistribution?.critical ?? 0)],
    ];
    if (healthAnalytics?.departmentRisks?.length) {
      rows.push([], ["Department", "Employees", "Avg Risk", "High Risk"]);
      for (const d of healthAnalytics.departmentRisks) {
        rows.push([d.department, String(d.totalEmployees), String(d.averageRisk ?? "—"), String(d.highRiskCount ?? "—")]);
      }
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `health-report-${corporateProfile.companyName.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportReportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Health Report");
    sheet.columns = [{ header: "Metric", key: "metric", width: 28 }, { header: "Value", key: "value", width: 20 }];
    sheet.addRow({ metric: "Company", value: corporateProfile.companyName });
    sheet.addRow({ metric: "Report Date", value: new Date().toLocaleDateString() });
    sheet.addRow({ metric: "Total Employees", value: healthAnalytics?.totalEmployees ?? "—" });
    sheet.addRow({ metric: "Monitored Employees", value: healthAnalytics?.monitoredEmployees ?? "—" });
    sheet.addRow({ metric: "Healthy Employees", value: healthAnalytics?.healthyEmployees ?? "—" });
    sheet.addRow({ metric: "At-Risk Employees", value: healthAnalytics?.atRiskEmployees ?? "—" });
    sheet.addRow({ metric: "Critical Cases", value: healthAnalytics?.criticalCases ?? "—" });
    sheet.addRow({ metric: "Average Risk Score", value: healthAnalytics?.averageRiskScore != null ? healthAnalytics.averageRiskScore.toFixed(1) : "—" });
    sheet.addRow({ metric: "Risk: Low", value: healthAnalytics?.riskDistribution?.low ?? 0 });
    sheet.addRow({ metric: "Risk: Medium", value: healthAnalytics?.riskDistribution?.medium ?? 0 });
    sheet.addRow({ metric: "Risk: High", value: healthAnalytics?.riskDistribution?.high ?? 0 });
    sheet.addRow({ metric: "Risk: Critical", value: healthAnalytics?.riskDistribution?.critical ?? 0 });

    if (healthAnalytics?.departmentRisks?.length) {
      sheet.addRow({});
      const deptSheet = workbook.addWorksheet("By Department");
      deptSheet.columns = [
        { header: "Department", key: "department", width: 24 },
        { header: "Employees", key: "employees", width: 14 },
        { header: "Avg Risk", key: "avgRisk", width: 14 },
        { header: "High Risk", key: "highRisk", width: 14 },
      ];
      for (const d of healthAnalytics.departmentRisks) {
        deptSheet.addRow({ department: d.department, employees: d.totalEmployees, avgRisk: d.averageRisk ?? "—", highRisk: d.highRiskCount ?? "—" });
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    downloadArrayBuffer(
      buffer as ArrayBuffer,
      `health-report-${corporateProfile.companyName.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  };

  const hasRiskData = healthAnalytics &&
    ((healthAnalytics.riskDistribution?.low ?? 0) +
     (healthAnalytics.riskDistribution?.medium ?? 0) +
     (healthAnalytics.riskDistribution?.high ?? 0) +
     (healthAnalytics.riskDistribution?.critical ?? 0)) > 0;
  const hasConditionsData = (healthAnalytics?.commonConditions?.length ?? 0) > 0;
  const hasTrendData     = (healthAnalytics?.trendData?.length ?? 0) > 0;

  // Quick actions for corporate modules
  const quickActions = [
    {
      title: "Notifications",
      description: "View system notifications and alerts",
      icon: Bell,
      color: "info-gradient border-info/20",
      iconColor: "text-info",
      link: "/corporate/notifications",
      pattern: "radial-gradient(circle at 100% 100%, hsl(var(--info) / 0.05) 0%, transparent 50%)",
    },
    {
      title: "Employees",
      description: "Manage employee profiles and data",
      icon: Users,
      color: "success-gradient border-success/20",
      iconColor: "text-success",
      link: "/corporate/employees",
      pattern: "radial-gradient(circle at 0% 0%, hsl(var(--success) / 0.05) 0%, transparent 50%)",
    },
    {
      title: "User Management",
      description: "Manage app accounts and access",
      icon: UserCog,
      color: "bg-gradient-to-br from-violet-500/10 to-purple-500/10 border-violet-500/20",
      iconColor: "text-violet-600",
      link: "/corporate/user-management",
      pattern: "radial-gradient(circle at 0% 0%, rgba(139, 92, 246, 0.05) 0%, transparent 50%)",
    },
    {
      title: "Appointments",
      description: "Schedule and manage health appointments",
      icon: Calendar,
      color: "secondary-gradient border-secondary/20",
      iconColor: "text-secondary",
      link: "/corporate/appointments",
      pattern: "radial-gradient(circle at 100% 0%, hsl(var(--secondary) / 0.05) 0%, transparent 50%)",
    },
    {
      title: "Health Analysis",
      description: "Comprehensive health analytics and insights",
      icon: Heart,
      color: "primary-gradient border-primary/20",
      iconColor: "text-primary",
      link: "/corporate/health-analysis",
      pattern: "radial-gradient(circle at 0% 100%, hsl(var(--primary) / 0.05) 0%, transparent 50%)",
    },
    {
      title: "Risk Monitor",
      description: "Monitor employee health risks",
      icon: AlertTriangle,
      color: "warning-gradient border-warning/20",
      iconColor: "text-warning",
      link: "/corporate/health-risk-assessment",
      pattern: "radial-gradient(circle at 50% 50%, hsl(var(--warning) / 0.05) 0%, transparent 50%)",
    },
    {
      title: "Org Structure",
      description: "Manage departments & business units",
      icon: Building2,
      color: "info-gradient border-info/20",
      iconColor: "text-info",
      link: "/corporate/org-structure",
      pattern: "radial-gradient(circle at 100% 50%, rgba(99, 102, 241, 0.05) 0%, transparent 50%)",
    },
    {
      title: "Claims",
      description: "Process and manage insurance claims",
      icon: FileText,
      color: "bg-gradient-to-br from-teal-500/10 to-cyan-500/10 border-teal-500/20",
      iconColor: "text-teal-500",
      link: "/corporate/claims",
      pattern: "radial-gradient(circle at 50% 0%, rgba(20, 184, 166, 0.05) 0%, transparent 50%)",
    },
    {
      title: "Reports",
      description: "Generate and view detailed reports",
      icon: BarChart3,
      color: "bg-gradient-to-br from-slate-500/10 to-gray-500/10 border-slate-500/20",
      iconColor: "text-slate-500",
      link: "/corporate/reports",
      pattern: "radial-gradient(circle at 0% 50%, rgba(100, 116, 139, 0.05) 0%, transparent 50%)",
    },
    {
      title: "Complaints",
      description: "Handle employee complaints and feedback",
      icon: MessageSquare,
      color: "bg-gradient-to-br from-pink-500/10 to-rose-500/10 border-pink-500/20",
      iconColor: "text-pink-500",
      link: "/corporate/complaints",
      pattern: "radial-gradient(circle at 100% 100%, rgba(236, 72, 153, 0.05) 0%, transparent 50%)",
    },
    {
      title: "Settings",
      description: "Configure system preferences",
      icon: Settings,
      color: "bg-gradient-to-br from-gray-500/10 to-slate-500/10 border-gray-500/20",
      iconColor: "text-gray-500",
      link: "/corporate/settings",
      pattern: "radial-gradient(circle at 50% 100%, rgba(107, 114, 128, 0.05) 0%, transparent 50%)",
    },
    {
      title: "Help & Support",
      description: "Get help and support resources",
      icon: HelpCircle,
      color: "bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/20",
      iconColor: "text-amber-500",
      link: "/corporate/help",
      pattern: "radial-gradient(circle at 0% 0%, rgba(245, 158, 11, 0.05) 0%, transparent 50%)",
    }
  ];

  if (loading) {
    return (
      <CorporateLayout title="Dashboard" subtitle="Loading...">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-t-emerald-500 border-slate-200 dark:border-slate-700 rounded-full animate-spin mx-auto"></div>
            <p className="mt-4 text-slate-600 dark:text-slate-400">Loading corporate dashboard...</p>
          </div>
        </div>
      </CorporateLayout>
    );
  }

  return (
    <CorporateLayout title="Health Dashboard" subtitle="Real-time employee health monitoring and risk analysis">
      <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
        {/* Welcome Section - Hero Banner (DoctorDashboard Style) */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6 md:p-8 text-white shadow-2xl">
          {/* Background Pattern */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L2c+PC9zdmc+')] opacity-30" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-emerald-500/20 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-blue-400/10 to-transparent rounded-full blur-2xl" />
          
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-4">
              <Avatar className="h-16 w-16 border-2 border-white/20 shadow-xl">
                <AvatarImage src={corporateProfile.logo || undefined} />
                <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-xl">
                  <Building2 className="w-8 h-8" />
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30">
                    <Briefcase className="w-5 h-5" />
                  </div>
                  <Badge className="bg-white/10 text-white/90 border-white/20 font-medium">
                    {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </Badge>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Live
                  </Badge>
                </div>
                <h1 className="text-2xl md:text-3xl font-bold mb-1">
                  {getGreeting()}, {corporateProfile.adminName}!
                </h1>
                <p className="text-slate-300 text-sm md:text-base flex items-center gap-2">
                  <span>{corporateProfile.companyName}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                    {corporateProfile.plan}
                  </span>
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <Button onClick={fetchDashboardData} variant="outline" className="bg-white/10 hover:bg-white/20 text-white border-white/20 hover:border-white/30">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              <Button onClick={handleExportReport} variant="outline" className="bg-white/10 hover:bg-white/20 text-white border-white/20 hover:border-white/30">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button onClick={handleExportReportExcel} className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/30 border-0">
                <Download className="w-4 h-4 mr-2" />
                Export Excel
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Grid (Below Hero - Like DoctorDashboard) */}
        {healthAnalytics && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-emerald-200 dark:hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 overflow-hidden group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className={cn("p-2 rounded-xl transition-colors bg-blue-500/10 group-hover:bg-emerald-500/20")}>
                    <Users className={cn("w-5 h-5 transition-colors text-blue-500 group-hover:text-emerald-500")} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Total Employees</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-slate-800 dark:text-white">{healthAnalytics.totalEmployees}</span>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">All departments</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-emerald-200 dark:hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 overflow-hidden group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className={cn("p-2 rounded-xl transition-colors bg-emerald-500/10 group-hover:bg-emerald-500/20")}>
                    <Activity className={cn("w-5 h-5 transition-colors text-emerald-500")} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Monitored</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-slate-800 dark:text-white">{healthAnalytics.monitoredEmployees}</span>
                  </div>
                  <p className="text-xs text-emerald-500 mt-1">{healthAnalytics.totalEmployees > 0 ? ((healthAnalytics.monitoredEmployees / healthAnalytics.totalEmployees) * 100).toFixed(0) : '0'}% Coverage</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-emerald-200 dark:hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 overflow-hidden group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className={cn("p-2 rounded-xl transition-colors bg-green-500/10 group-hover:bg-emerald-500/20")}>
                    <CheckCircle className={cn("w-5 h-5 transition-colors text-green-500 group-hover:text-emerald-500")} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Healthy</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-green-600 dark:text-green-400">{healthAnalytics.healthyEmployees}</span>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Low risk score</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-amber-200 dark:hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/5 transition-all duration-300 overflow-hidden group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className={cn("p-2 rounded-xl transition-colors bg-amber-500/10 group-hover:bg-amber-500/20")}>
                    <AlertTriangle className={cn("w-5 h-5 transition-colors text-amber-500")} />
                  </div>
                  <Badge variant="outline" className="text-xs border bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700">
                    <TrendingDown className="w-3 h-3 mr-1" />
                    -3%
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">At Risk</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">{healthAnalytics.atRiskEmployees}</span>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Needs attention</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-red-200 dark:hover:border-red-500/50 hover:shadow-lg hover:shadow-red-500/5 transition-all duration-300 overflow-hidden group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className={cn("p-2 rounded-xl transition-colors bg-red-500/10 group-hover:bg-red-500/20")}>
                    <Shield className={cn("w-5 h-5 transition-colors text-red-500")} />
                  </div>
                  <Badge variant="outline" className="text-xs border bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700">
                    <TrendingDown className="w-3 h-3 mr-1" />
                    -2
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Critical</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-red-600 dark:text-red-400">{healthAnalytics.criticalCases}</span>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Immediate action</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-emerald-200 dark:hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 overflow-hidden group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className={cn("p-2 rounded-xl transition-colors bg-slate-500/10 group-hover:bg-emerald-500/20")}>
                    <BarChart3 className={cn("w-5 h-5 transition-colors text-slate-500 group-hover:text-emerald-500")} />
                  </div>
                  <Badge variant="outline" className="text-xs border bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700">
                    <TrendingDown className="w-3 h-3 mr-1" />
                    -2.5
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Avg Risk Score</p>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-2xl font-bold ${getRiskScoreColor(healthAnalytics.averageRiskScore ?? 0)}`}>
                      {healthAnalytics.averageRiskScore != null ? healthAnalytics.averageRiskScore.toFixed(1) : '—'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Company avg</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Participation KPI Cards */}
        {participation && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Teleconsultations this month */}
            <Card className="bg-slate-800/60 border-slate-700/50 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 overflow-hidden group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-xl bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors">
                    <Phone className="w-5 h-5 text-blue-400" />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-1">Teleconsultations</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-slate-200">{participation.teleconsultationsThisMonth ?? 0}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">This month</p>
                </div>
              </CardContent>
            </Card>

            {/* Pending Checkups */}
            <Card className="bg-slate-800/60 border-slate-700/50 hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/5 transition-all duration-300 overflow-hidden group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-xl bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors">
                    <Clock className="w-5 h-5 text-amber-400" />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-1">Pending Checkups</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-slate-200">{participation.pendingCheckups ?? 0}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Awaiting completion</p>
                </div>
              </CardContent>
            </Card>

            {/* Participation Rate */}
            <Card className="bg-slate-800/60 border-slate-700/50 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 overflow-hidden group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-xl bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-1">Participation Rate</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-emerald-400">{participation.participationRate ?? 0}%</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{participation.totalParticipating ?? 0} of {participation.totalEligible ?? 0} employees</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Age Distribution Section */}
        {ageDistribution.length > 0 && (
          <Card className="bg-slate-800/60 border-slate-700/50">
            <CardContent className="p-5">
              <h3 className="text-base font-semibold text-slate-200 mb-1">Age Distribution</h3>
              <p className="text-xs text-slate-400 mb-4">Employee breakdown by age group</p>
              <div className="space-y-3">
                {ageDistribution.map((group: any) => (
                  <div key={group.range} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-20 shrink-0">{group.range}</span>
                    <div className="flex-1 bg-slate-700/50 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${group.percentage ?? 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400 w-8 text-right">{group.percentage ?? 0}%</span>
                    <span className="text-xs text-slate-500 w-10 text-right">({group.count})</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions Section (DoctorDashboard Style) */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Quick Actions
            </h2>
            <Link to="/corporate/settings">
              <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700">
                Settings <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {quickActions.slice(0, 6).map((action, index) => (
              <Link key={index} to={action.link} className="group">
                <Card className="h-full bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-emerald-200 dark:hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-300">
                  <CardContent className="p-4">
                    <div className={cn("p-3 rounded-xl w-fit mb-3 transition-all duration-300", action.color, "group-hover:scale-110")}>
                      <action.icon className={cn("w-6 h-6", action.iconColor)} />
                    </div>
                    <h3 className="font-semibold text-slate-800 dark:text-white mb-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors text-sm">
                      {action.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{action.description}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* More Actions Grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-500" />
              Management Modules
            </h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickActions.slice(6).map((action, index) => (
              <Link key={index} to={action.link} className="group">
                <Card className="relative h-full bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-emerald-200 dark:hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-300 overflow-hidden">
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ background: action.pattern }} />
                  <CardContent className="p-5 relative flex items-center gap-4">
                    <div className={cn("p-3 rounded-xl transition-all duration-300", action.color, "group-hover:scale-110 group-hover:rotate-3")}>
                      <action.icon className={cn("w-6 h-6", action.iconColor)} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-800 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {action.title}
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{action.description}</p>
                    </div>
                    <ArrowRight className={cn("w-5 h-5 text-slate-400 transition-all duration-300 group-hover:translate-x-2", action.iconColor)} />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
            <p className="text-amber-800 dark:text-amber-200 text-sm">{error}</p>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid bg-white dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/50 p-1 rounded-xl">
            <TabsTrigger value="overview" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white rounded-lg">
              <BarChart3 className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="employees" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white rounded-lg">
              <Users className="w-4 h-4 mr-2" />
              Employees
            </TabsTrigger>
            <TabsTrigger value="appointments" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white rounded-lg">
              <CalendarCheck className="w-4 h-4 mr-2" />
              Appointments
            </TabsTrigger>
            <TabsTrigger value="departments" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white rounded-lg">
              <Activity className="w-4 h-4 mr-2" />
              Departments
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Charts Row — always visible; shows ghost placeholder until real data arrives */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Risk Distribution */}
              <Card className="p-6 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
                <h3 className="text-lg font-semibold mb-1 text-slate-800 dark:text-white">Risk Distribution</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Employee health risk breakdown across all tiers</p>

                {/* Risk tier legend cards */}
                {(() => {
                  const total = hasRiskData
                    ? (healthAnalytics!.riskDistribution.low + healthAnalytics!.riskDistribution.medium +
                       healthAnalytics!.riskDistribution.high + healthAnalytics!.riskDistribution.critical) || 1
                    : 1;
                  const tiers = [
                    {
                      key: 'low', label: 'Low Risk', color: COLORS.low,
                      bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-700',
                      text: 'text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500',
                      desc: 'Healthy, no immediate concern',
                      icon: '🟢',
                      value: hasRiskData ? healthAnalytics!.riskDistribution.low : null,
                    },
                    {
                      key: 'medium', label: 'Medium Risk', color: COLORS.medium,
                      bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-700',
                      text: 'text-amber-700 dark:text-amber-300', bar: 'bg-amber-500',
                      desc: 'Needs monitoring & preventive care',
                      icon: '🟡',
                      value: hasRiskData ? healthAnalytics!.riskDistribution.medium : null,
                    },
                    {
                      key: 'high', label: 'High Risk', color: COLORS.high,
                      bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-700',
                      text: 'text-red-700 dark:text-red-300', bar: 'bg-red-500',
                      desc: 'Requires prompt medical attention',
                      icon: '🔴',
                      value: hasRiskData ? healthAnalytics!.riskDistribution.high : null,
                    },
                    {
                      key: 'critical', label: 'Critical', color: COLORS.critical,
                      bg: 'bg-slate-100 dark:bg-slate-700/40', border: 'border-slate-300 dark:border-slate-600',
                      text: 'text-slate-700 dark:text-slate-300', bar: 'bg-slate-500',
                      desc: 'Urgent intervention needed',
                      icon: '⚫',
                      value: hasRiskData ? healthAnalytics!.riskDistribution.critical : null,
                    },
                  ];
                  return (
                    <div className="space-y-2 mb-4">
                      {tiers.map((t) => {
                        const pct = t.value !== null ? Math.round((t.value / total) * 100) : null;
                        return (
                          <div key={t.key} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${t.bg} ${t.border}`}>
                            <span className="text-base leading-none">{t.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className={`text-xs font-semibold ${t.text}`}>{t.label}</span>
                                <span className={`text-xs font-bold ${t.text}`}>
                                  {pct !== null ? `${t.value} (${pct}%)` : '—'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{t.desc}</p>
                              <div className="mt-1 h-1.5 w-full bg-white/60 dark:bg-slate-700/60 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${t.bar}`}
                                  style={{ width: pct !== null ? `${pct}%` : '0%', opacity: pct !== null ? 1 : 0 }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Donut chart */}
                <div className="relative">
                  <ResponsiveContainer width="100%" height={220}>
                    <RechartsPieChart>
                      <Pie
                        data={
                          hasRiskData
                            ? [
                                { name: 'Low Risk',    value: healthAnalytics!.riskDistribution.low,      fill: COLORS.low },
                                { name: 'Medium Risk', value: healthAnalytics!.riskDistribution.medium,   fill: COLORS.medium },
                                { name: 'High Risk',   value: healthAnalytics!.riskDistribution.high,     fill: COLORS.high },
                                { name: 'Critical',    value: healthAnalytics!.riskDistribution.critical, fill: COLORS.critical },
                              ]
                            : PLACEHOLDER_RISK
                        }
                        cx="50%" cy="50%"
                        innerRadius={55} outerRadius={90}
                        paddingAngle={hasRiskData ? 3 : 1}
                        dataKey="value"
                        stroke="none"
                        label={hasRiskData ? ({ name, percent }) => `${(percent * 100).toFixed(0)}%` : undefined}
                        labelLine={hasRiskData}
                      >
                        {(hasRiskData
                          ? [COLORS.low, COLORS.medium, COLORS.high, COLORS.critical]
                          : PLACEHOLDER_RISK.map(d => d.fill)
                        ).map((color, index) => (
                          <Cell key={`cell-${index}`} fill={color} opacity={hasRiskData ? 1 : 0.45} />
                        ))}
                      </Pie>
                      {hasRiskData && <Tooltip formatter={(value: any, name: any) => [`${value} employees`, name]} />}
                    </RechartsPieChart>
                  </ResponsiveContainer>
                  {!hasRiskData && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 dark:bg-slate-800/60 backdrop-blur-[2px] rounded-lg gap-1">
                      <PieChart className="w-7 h-7 text-slate-400" />
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No assessments yet</p>
                      <p className="text-xs text-slate-400 text-center px-8">Chart will populate once employees complete health assessments</p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Common Health Conditions */}
              <Card className="p-6 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
                <h3 className="text-lg font-semibold mb-4 text-slate-800 dark:text-white">Common Health Conditions</h3>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={hasConditionsData ? healthAnalytics!.commonConditions : PLACEHOLDER_CONDITIONS}>
                      <CartesianGrid strokeDasharray="3 3" stroke={hasConditionsData ? undefined : '#e2e8f030'} />
                      <XAxis dataKey="condition" angle={-45} textAnchor="end" height={100}
                        tick={{ fill: hasConditionsData ? undefined : '#64748b' }} />
                      <YAxis tick={{ fill: hasConditionsData ? undefined : '#64748b' }} />
                      {hasConditionsData && <Tooltip />}
                      <Bar dataKey="count" fill={hasConditionsData ? '#10b981' : '#475569'}
                        opacity={hasConditionsData ? 1 : 0.5} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  {!hasConditionsData && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 dark:bg-slate-800/60 backdrop-blur-[2px] rounded-lg gap-2">
                      <BarChart3 className="w-8 h-8 text-slate-400" />
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 text-center">No conditions data yet</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 text-center px-6">
                        Common health conditions will surface after employee health records are collected
                      </p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Health Risk Trends */}
              <Card className="p-6 lg:col-span-2 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
                <h3 className="text-lg font-semibold mb-4 text-slate-800 dark:text-white">Health Risk Trends (Last 6 Months)</h3>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={hasTrendData ? healthAnalytics!.trendData : PLACEHOLDER_TRENDS}>
                      <CartesianGrid strokeDasharray="3 3" stroke={hasTrendData ? undefined : '#e2e8f030'} />
                      <XAxis dataKey="month" tick={{ fill: hasTrendData ? undefined : '#64748b' }} />
                      <YAxis tick={{ fill: hasTrendData ? undefined : '#64748b' }} />
                      {hasTrendData && <Tooltip />}
                      <Legend
                        formatter={(value) =>
                          hasTrendData ? value : <span className="text-slate-400 dark:text-slate-600">{value}</span>
                        }
                      />
                      <Bar dataKey="healthyCount" fill={hasTrendData ? '#10b981' : '#334155'}
                        opacity={hasTrendData ? 1 : 0.5} name="Healthy" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="atRiskCount"  fill={hasTrendData ? '#f59e0b' : '#475569'}
                        opacity={hasTrendData ? 1 : 0.5} name="At Risk"  radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  {!hasTrendData && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 dark:bg-slate-800/60 backdrop-blur-[2px] rounded-lg gap-2">
                      <TrendingUp className="w-8 h-8 text-slate-400" />
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 text-center">Trends not available yet</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 text-center px-6">
                        Monthly risk trends will build up as health assessments are recorded over time
                      </p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Monthly Teleconsultation & Checkup Trend */}
              <Card className="p-6 lg:col-span-2 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
                <h3 className="text-lg font-semibold mb-4 text-slate-800 dark:text-white">Monthly Utilization (Last 12 Months)</h3>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={monthlyUtilization.length > 0 ? monthlyUtilization : PLACEHOLDER_TRENDS}>
                      <CartesianGrid strokeDasharray="3 3" stroke={monthlyUtilization.length > 0 ? undefined : '#e2e8f030'} />
                      <XAxis dataKey="month" tick={{ fill: monthlyUtilization.length > 0 ? undefined : '#64748b' }} />
                      <YAxis tick={{ fill: monthlyUtilization.length > 0 ? undefined : '#64748b' }} />
                      {monthlyUtilization.length > 0 && <Tooltip />}
                      <Legend
                        formatter={(value) =>
                          monthlyUtilization.length > 0 ? value : <span className="text-slate-400 dark:text-slate-600">{value}</span>
                        }
                      />
                      <Bar dataKey="appointments" fill={monthlyUtilization.length > 0 ? '#10b981' : '#334155'}
                        opacity={monthlyUtilization.length > 0 ? 1 : 0.5} name="Teleconsultations" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="ahcCompletions" fill={monthlyUtilization.length > 0 ? '#3b82f6' : '#475569'}
                        opacity={monthlyUtilization.length > 0 ? 1 : 0.5} name="Checkups Completed" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  {monthlyUtilization.length === 0 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 dark:bg-slate-800/60 backdrop-blur-[2px] rounded-lg gap-2">
                      <TrendingUp className="w-8 h-8 text-slate-400" />
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 text-center">No utilization data yet</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 text-center px-6">
                        Monthly teleconsultation and checkup trends will build up as appointments are booked
                      </p>
                    </div>
                  )}
                </div>
              </Card>

            </div>
          </TabsContent>

          {/* Employees Tab */}
          <TabsContent value="employees" className="space-y-4">
            {/* Filters */}
            <Card className="p-4 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search employees..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-700 rounded-lg bg-slate-800 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                <select
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value)}
                  className="px-4 py-2 border border-slate-700 rounded-lg bg-slate-800 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="all">All Risk Levels</option>
                  <option value="low">Low Risk</option>
                  <option value="medium">Medium Risk</option>
                  <option value="high">High Risk</option>
                  <option value="critical">Critical</option>
                </select>

                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="px-4 py-2 border border-slate-700 rounded-lg bg-slate-800 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="all">All Departments</option>
                  {healthAnalytics?.departmentRisks.map(dept => (
                    <option key={dept.department} value={dept.department}>{dept.department}</option>
                  ))}
                </select>

                <Button variant="outline" className="border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => {
                  setSearchQuery('');
                  setRiskFilter('all');
                  setDepartmentFilter('all');
                }}>
                  <Filter className="w-4 h-4 mr-2" />
                  Clear Filters
                </Button>
              </div>
            </Card>

            {/* Employee List */}
            <div className="grid grid-cols-1 gap-4">
              {filteredEmployees.map(employee => (
                <Card key={employee.id} className="p-6 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:shadow-lg hover:border-emerald-200 dark:hover:border-emerald-500/30 transition-all">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">{employee.name}</h3>
                        <Badge className={`${getRiskColor(employee.riskLevel)} border`}>
                          {(employee.riskLevel || 'unknown').toUpperCase()}
                        </Badge>
                        {employee.deviceConnected && (
                          <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700">
                            <Activity className="w-3 h-3 mr-1" />
                            Device Active
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">Employee ID</p>
                          <p className="font-medium text-slate-800 dark:text-white">{employee.employeeId}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">Business Unit</p>
                          <p className="font-medium text-slate-800 dark:text-white">{employee.businessUnit || '—'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">Department</p>
                          <p className="font-medium text-slate-800 dark:text-white">{employee.department}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">Designation</p>
                          <p className="font-medium text-slate-800 dark:text-white">{employee.designation}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">Risk Score</p>
                          <p className={`font-bold ${getRiskScoreColor(employee.riskScore)}`}>
                            {employee.riskScore}/100
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                          <p className="text-xs text-slate-500 dark:text-slate-400">BMI</p>
                          <p className="font-semibold text-slate-800 dark:text-white">{employee.bmi}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                          <p className="text-xs text-slate-500 dark:text-slate-400">BP</p>
                          <p className="font-semibold text-slate-800 dark:text-white">{employee.bloodPressure}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Blood Sugar</p>
                          <p className="font-semibold text-slate-800 dark:text-white">{employee.bloodSugar} mg/dL</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Cholesterol</p>
                          <p className="font-semibold text-slate-800 dark:text-white">{employee.cholesterol} mg/dL</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Absenteeism</p>
                          <p className="font-semibold text-slate-800 dark:text-white">{employee.absenteeismDays} days</p>
                        </div>
                      </div>

                      {employee.healthConditions.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Health Conditions:</p>
                          <div className="flex flex-wrap gap-1">
                            {employee.healthConditions.map((condition, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                                {condition}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <Link to="/corporate/employees">
                      <Button variant="outline" size="sm" className="border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-600">
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>

            {filteredEmployees.length === 0 && (
              <Card className="p-8 text-center bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
                <UserX className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
                <p className="text-slate-600 dark:text-slate-400">No employees found matching your filters</p>
              </Card>
            )}
          </TabsContent>

          {/* Appointments Tab */}
          <TabsContent value="appointments" className="space-y-4">
            {/* Appointment Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-4 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Total Appointments</p>
                    <p className="text-2xl font-bold mt-1 text-slate-800 dark:text-white">{appointments.length}</p>
                  </div>
                  <CalendarCheck className="w-8 h-8 text-emerald-500" />
                </div>
              </Card>

              <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-blue-600 dark:text-blue-400">Scheduled</p>
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">
                      {appointments.filter(a => a.status === 'scheduled').length}
                    </p>
                  </div>
                  <Clock className="w-8 h-8 text-blue-500" />
                </div>
              </Card>

              <Card className="p-4 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-green-600 dark:text-green-400">Completed</p>
                    <p className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">
                      {appointments.filter(a => a.status === 'completed').length}
                    </p>
                  </div>
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
              </Card>

              <Card className="p-4 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Total Claims</p>
                    <p className="text-2xl font-bold mt-1 text-slate-800 dark:text-white">
                      ₹{appointments.reduce((sum, a) => sum + a.claimAmount, 0).toLocaleString()}
                    </p>
                  </div>
                  <FileText className="w-8 h-8 text-slate-500 dark:text-slate-400" />
                </div>
              </Card>
            </div>

            {/* Filters */}
            <Card className="p-4 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search appointments..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-700 rounded-lg bg-slate-800 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                <select
                  value={appointmentStatusFilter}
                  onChange={(e) => setAppointmentStatusFilter(e.target.value)}
                  className="px-4 py-2 border border-slate-700 rounded-lg bg-slate-800 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="all">All Statuses</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="no-show">No Show</option>
                </select>

                <select
                  value={appointmentTypeFilter}
                  onChange={(e) => setAppointmentTypeFilter(e.target.value)}
                  className="px-4 py-2 border border-slate-700 rounded-lg bg-slate-800 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="all">All Types</option>
                  <option value="Annual Checkup">Annual Checkup</option>
                  <option value="Preventive Screening">Preventive Screening</option>
                  <option value="Specialist Consultation">Specialist Consultation</option>
                  <option value="Follow-up">Follow-up</option>
                  <option value="Diagnostic Test">Diagnostic Test</option>
                </select>

                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="px-4 py-2 border border-slate-700 rounded-lg bg-slate-800 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="all">All Departments</option>
                  {healthAnalytics?.departmentRisks.map(dept => (
                    <option key={dept.department} value={dept.department}>{dept.department}</option>
                  ))}
                </select>
              </div>
            </Card>

            {/* Appointments List */}
            <div className="grid grid-cols-1 gap-4">
              {filteredAppointments.map(appointment => (
                <Card key={appointment.id} className="p-6 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:shadow-lg hover:border-emerald-200 dark:hover:border-emerald-500/30 transition-all">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <Badge className={`${getStatusColor(appointment.status)} border`}>
                          {(appointment.status || 'scheduled').toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700">
                          {appointment.appointmentType}
                        </Badge>
                        <span className="text-sm text-slate-500 dark:text-slate-400">#{appointment.appointmentId}</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                        <div>
                          <h3 className="text-lg font-semibold mb-1 text-slate-800 dark:text-white">{appointment.employeeName}</h3>
                          <div className="space-y-1 text-sm text-slate-500 dark:text-slate-400">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              <span>{appointment.employeeId} • {appointment.department}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="w-4 h-4" />
                              <span>{appointment.phone}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4" />
                              <span>{appointment.email}</span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h4 className="font-semibold text-slate-800 dark:text-white mb-1">Appointment Details</h4>
                          <div className="space-y-1 text-sm text-slate-500 dark:text-slate-400">
                            <div className="flex items-center gap-2">
                              <Stethoscope className="w-4 h-4" />
                              <span>{appointment.doctor} ({appointment.specialty})</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              <span>{appointment.hospitalName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              <span>{new Date(appointment.appointmentDate).toLocaleDateString('en-IN', { 
                                day: 'numeric', 
                                month: 'short', 
                                year: 'numeric' 
                              })} at {appointment.appointmentTime}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-4 text-sm">
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">Benefit Type: </span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">{appointment.benefitType}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">Claim Amount: </span>
                            <span className="font-bold text-green-600 dark:text-green-400">₹{appointment.claimAmount.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">Booked On: </span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">{new Date(appointment.bookedOn).toLocaleDateString('en-IN')}</span>
                          </div>
                        </div>

                        <Button variant="outline" size="sm" className="border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-600">
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </Button>
                      </div>

                      {appointment.notes && (
                        <div className="mt-3 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-700">
                          <span className="font-medium">Notes: </span>{appointment.notes}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {filteredAppointments.length === 0 && (
              <Card className="p-8 text-center bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
                <CalendarCheck className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
                <p className="text-slate-600 dark:text-slate-400">No appointments found matching your filters</p>
              </Card>
            )}
          </TabsContent>

          {/* Departments Tab */}
          <TabsContent value="departments" className="space-y-4">
            {healthAnalytics?.departmentRisks.map(dept => (
              <Card key={dept.department} className="p-6 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:shadow-lg hover:border-emerald-200 dark:hover:border-emerald-500/30 transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-800 dark:text-white">{dept.department}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {dept.totalEmployees} employees • {dept.highRisk} at high risk
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Avg Risk Score</p>
                    <p className={`text-2xl font-bold ${getRiskScoreColor(dept.avgRiskScore ?? 0)}`}>
                      {dept.avgRiskScore != null ? dept.avgRiskScore.toFixed(1) : '—'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-100 dark:border-green-800">
                    <p className="text-sm text-green-600 dark:text-green-400">Low Risk</p>
                    <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                      {dept.totalEmployees - dept.highRisk}
                    </p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-100 dark:border-orange-800">
                    <p className="text-sm text-orange-600 dark:text-orange-400">High Risk</p>
                    <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{dept.highRisk}</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                    <p className="text-sm text-blue-600 dark:text-blue-400">Coverage</p>
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                      {((dept.totalEmployees / (healthAnalytics?.totalEmployees || 1)) * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </CorporateLayout>
  );
};

export default CorporateDashboard;
