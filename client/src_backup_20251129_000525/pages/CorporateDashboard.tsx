import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  PieChart
} from "lucide-react";
import { getUserType } from "@/hooks/auth";
import api from "@/utils/api";
import { PieChart as RechartsPieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface EmployeeHealth {
  id: string;
  employeeId: string;
  name: string;
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
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [appointments, setAppointments] = useState<CorporateAppointment[]>([]);
  const [filteredAppointments, setFilteredAppointments] = useState<CorporateAppointment[]>([]);
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState('all');
  const [appointmentTypeFilter, setAppointmentTypeFilter] = useState('all');
  
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

  useEffect(() => {
    const type = getUserType();
    if (type !== "corporate") {
      navigate("/login");
      return;
    }
    fetchDashboardData();
    
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchDashboardData, 60000);
    return () => clearInterval(interval);
  }, [navigate]);

  useEffect(() => {
    filterEmployees();
  }, [employees, searchQuery, riskFilter, departmentFilter]);

  useEffect(() => {
    filterAppointments();
  }, [appointments, searchQuery, appointmentStatusFilter, appointmentTypeFilter, departmentFilter]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [summaryRes, healthRes, employeesRes, appointmentsRes] = await Promise.all([
        api.get("/admin/corporate/summary").catch(() => ({ data: null })),
        api.get("/admin/corporate/health-analytics").catch(() => ({ data: null })),
        api.get("/admin/corporate/employees-health").catch(() => ({ data: null })),
        api.get("/admin/corporate/appointments").catch(() => ({ data: null }))
      ]);

      setSummary(summaryRes.data || generateSampleSummary());
      setHealthAnalytics(healthRes.data || generateSampleHealthAnalytics());
      setEmployees(employeesRes.data?.employees || generateSampleEmployees());
      setAppointments(appointmentsRes.data?.appointments || generateSampleAppointments());
    } catch (err: any) {
      console.error("Failed to load corporate dashboard", err);
      setError("Unable to load dashboard data. Showing sample data.");
      setSummary(generateSampleSummary());
      setHealthAnalytics(generateSampleHealthAnalytics());
      setEmployees(generateSampleEmployees());
      setAppointments(generateSampleAppointments());
    } finally {
      setLoading(false);
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

  const generateSampleSummary = () => ({
    KPIs: {
      activeEmployees: 245,
      totalConsultationsThisMonth: 89,
      averageSatisfactionScore: 4.6,
      emergencyCasesHandled: 12
    },
    recentActivities: [
      {
        id: '1',
        type: 'Health Checkup',
        employeeName: 'Rajesh Kumar',
        department: 'Engineering',
        date: new Date().toISOString(),
        notes: 'Annual health checkup completed - All vitals normal'
      },
      {
        id: '2',
        type: 'Emergency',
        employeeName: 'Priya Sharma',
        department: 'HR',
        date: new Date(Date.now() - 3600000).toISOString(),
        notes: 'Severe headache - Referred to neurologist'
      }
    ]
  });

  const generateSampleHealthAnalytics = (): HealthRiskAnalytics => ({
    totalEmployees: 245,
    monitoredEmployees: 198,
    healthyEmployees: 142,
    atRiskEmployees: 56,
    criticalCases: 8,
    averageRiskScore: 32.5,
    riskDistribution: {
      low: 142,
      medium: 45,
      high: 11,
      critical: 8
    },
    departmentRisks: [
      { department: 'Engineering', totalEmployees: 85, highRisk: 12, avgRiskScore: 34.2 },
      { department: 'Sales', totalEmployees: 62, highRisk: 18, avgRiskScore: 42.1 },
      { department: 'HR', totalEmployees: 28, highRisk: 4, avgRiskScore: 28.5 },
      { department: 'Finance', totalEmployees: 35, highRisk: 7, avgRiskScore: 31.8 },
      { department: 'Operations', totalEmployees: 35, highRisk: 5, avgRiskScore: 29.3 }
    ],
    commonConditions: [
      { condition: 'Hypertension', count: 42, percentage: 17.1 },
      { condition: 'Diabetes', count: 28, percentage: 11.4 },
      { condition: 'High Cholesterol', count: 35, percentage: 14.3 },
      { condition: 'Obesity', count: 51, percentage: 20.8 },
      { condition: 'Stress/Anxiety', count: 67, percentage: 27.3 }
    ],
    trendData: [
      { month: 'Jun', avgRiskScore: 35.2, healthyCount: 128, atRiskCount: 72 },
      { month: 'Jul', avgRiskScore: 34.8, healthyCount: 132, atRiskCount: 68 },
      { month: 'Aug', avgRiskScore: 33.5, healthyCount: 138, atRiskCount: 62 },
      { month: 'Sep', avgRiskScore: 32.9, healthyCount: 140, atRiskCount: 60 },
      { month: 'Oct', avgRiskScore: 32.5, healthyCount: 142, atRiskCount: 58 },
      { month: 'Nov', avgRiskScore: 32.5, healthyCount: 142, atRiskCount: 56 }
    ]
  });

  const generateSampleEmployees = (): EmployeeHealth[] => [
    {
      id: 'e1',
      employeeId: 'EMP001',
      name: 'Rajesh Kumar',
      department: 'Engineering',
      designation: 'Senior Developer',
      age: 42,
      gender: 'Male',
      phone: '+91 98765 43210',
      email: 'rajesh.k@company.com',
      riskLevel: 'high',
      riskScore: 68,
      healthConditions: ['Hypertension', 'High Cholesterol'],
      lastCheckup: '2024-11-15',
      nextCheckup: '2024-12-15',
      bmi: 28.5,
      bloodPressure: '145/92',
      bloodSugar: 128,
      cholesterol: 245,
      smokingStatus: 'Former smoker',
      alcoholConsumption: 'Occasional',
      exerciseFrequency: 'Rarely',
      stressLevel: 'High',
      sleepHours: 5.5,
      chronicDiseases: ['Hypertension'],
      medications: ['Amlodipine 5mg'],
      absenteeismDays: 8,
      lastConsultation: '2024-11-20',
      planEnrolled: 'Corporate Wellness Plan',
      deviceConnected: true
    },
    {
      id: 'e2',
      employeeId: 'EMP002',
      name: 'Priya Sharma',
      department: 'HR',
      designation: 'HR Manager',
      age: 35,
      gender: 'Female',
      phone: '+91 87654 32109',
      email: 'priya.s@company.com',
      riskLevel: 'low',
      riskScore: 22,
      healthConditions: [],
      lastCheckup: '2024-11-10',
      nextCheckup: '2025-02-10',
      bmi: 22.3,
      bloodPressure: '118/75',
      bloodSugar: 92,
      cholesterol: 178,
      smokingStatus: 'Never',
      alcoholConsumption: 'Never',
      exerciseFrequency: 'Daily',
      stressLevel: 'Low',
      sleepHours: 7.5,
      chronicDiseases: [],
      medications: [],
      absenteeismDays: 2,
      lastConsultation: '2024-11-10',
      planEnrolled: 'Premium Family Plan',
      deviceConnected: true
    },
    {
      id: 'e3',
      employeeId: 'EMP003',
      name: 'Amit Patel',
      department: 'Sales',
      designation: 'Sales Executive',
      age: 48,
      gender: 'Male',
      phone: '+91 76543 21098',
      email: 'amit.p@company.com',
      riskLevel: 'critical',
      riskScore: 85,
      healthConditions: ['Diabetes', 'Obesity', 'Sleep Apnea'],
      lastCheckup: '2024-11-18',
      nextCheckup: '2024-11-28',
      bmi: 32.8,
      bloodPressure: '158/98',
      bloodSugar: 185,
      cholesterol: 265,
      smokingStatus: 'Current smoker',
      alcoholConsumption: 'Regular',
      exerciseFrequency: 'Never',
      stressLevel: 'Very High',
      sleepHours: 4.5,
      chronicDiseases: ['Type 2 Diabetes', 'Hypertension'],
      medications: ['Metformin 500mg', 'Losartan 50mg'],
      absenteeismDays: 15,
      lastConsultation: '2024-11-21',
      planEnrolled: 'Corporate Wellness Plan',
      deviceConnected: false
    }
  ];

  const generateSampleAppointments = (): CorporateAppointment[] => [
    {
      id: 'apt1',
      appointmentId: 'APT2024001',
      employeeId: 'EMP001',
      employeeName: 'Rajesh Kumar',
      department: 'Engineering',
      phone: '+91 98765 43210',
      email: 'rajesh.k@company.com',
      appointmentType: 'Annual Checkup',
      doctor: 'Dr. Sharma',
      specialty: 'General Physician',
      hospitalName: 'Apollo Hospital',
      appointmentDate: '2024-11-28',
      appointmentTime: '10:00 AM',
      status: 'scheduled',
      benefitType: 'Annual Health Checkup',
      claimAmount: 3500,
      notes: 'Comprehensive health screening package',
      bookedOn: '2024-11-20'
    },
    {
      id: 'apt2',
      appointmentId: 'APT2024002',
      employeeId: 'EMP002',
      employeeName: 'Priya Sharma',
      department: 'HR',
      phone: '+91 87654 32109',
      email: 'priya.s@company.com',
      appointmentType: 'Preventive Screening',
      doctor: 'Dr. Mehta',
      specialty: 'Preventive Medicine',
      hospitalName: 'Fortis Hospital',
      appointmentDate: '2024-11-25',
      appointmentTime: '2:30 PM',
      status: 'completed',
      benefitType: 'Preventive Health Screening',
      claimAmount: 2500,
      notes: 'Blood tests, ECG, and vitals check completed',
      bookedOn: '2024-11-15'
    },
    {
      id: 'apt3',
      appointmentId: 'APT2024003',
      employeeId: 'EMP003',
      employeeName: 'Amit Patel',
      department: 'Sales',
      phone: '+91 76543 21098',
      email: 'amit.p@company.com',
      appointmentType: 'Specialist Consultation',
      doctor: 'Dr. Reddy',
      specialty: 'Endocrinologist',
      hospitalName: 'Max Healthcare',
      appointmentDate: '2024-11-26',
      appointmentTime: '11:30 AM',
      status: 'completed',
      benefitType: 'Specialist Consultation',
      claimAmount: 1500,
      notes: 'Diabetes management consultation',
      bookedOn: '2024-11-18'
    },
    {
      id: 'apt4',
      appointmentId: 'APT2024004',
      employeeId: 'EMP005',
      employeeName: 'Neha Gupta',
      department: 'Finance',
      phone: '+91 65432 10987',
      email: 'neha.g@company.com',
      appointmentType: 'Diagnostic Test',
      doctor: 'Dr. Kapoor',
      specialty: 'Radiology',
      hospitalName: 'Apollo Hospital',
      appointmentDate: '2024-11-27',
      appointmentTime: '9:00 AM',
      status: 'scheduled',
      benefitType: 'Diagnostic Services',
      claimAmount: 4200,
      notes: 'Full body MRI scan',
      bookedOn: '2024-11-21'
    },
    {
      id: 'apt5',
      appointmentId: 'APT2024005',
      employeeId: 'EMP008',
      employeeName: 'Vikram Singh',
      department: 'Operations',
      phone: '+91 54321 09876',
      email: 'vikram.s@company.com',
      appointmentType: 'Follow-up',
      doctor: 'Dr. Verma',
      specialty: 'Cardiologist',
      hospitalName: 'Fortis Hospital',
      appointmentDate: '2024-11-29',
      appointmentTime: '3:00 PM',
      status: 'scheduled',
      benefitType: 'Follow-up Consultation',
      claimAmount: 1000,
      notes: 'Blood pressure monitoring follow-up',
      bookedOn: '2024-11-22'
    },
    {
      id: 'apt6',
      appointmentId: 'APT2024006',
      employeeId: 'EMP010',
      employeeName: 'Sneha Reddy',
      department: 'Engineering',
      phone: '+91 43210 98765',
      email: 'sneha.r@company.com',
      appointmentType: 'Annual Checkup',
      appointmentDate: '2024-11-24',
      appointmentTime: '10:30 AM',
      status: 'no-show',
      doctor: 'Dr. Joshi',
      specialty: 'General Physician',
      hospitalName: 'Max Healthcare',
      benefitType: 'Annual Health Checkup',
      claimAmount: 0,
      notes: 'Employee did not attend scheduled appointment',
      bookedOn: '2024-11-17'
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
      case 'completed': return 'bg-green-500/10 text-green-700 border-green-500/20';
      case 'cancelled': return 'bg-gray-500/10 text-gray-700 border-gray-500/20';
      case 'no-show': return 'bg-red-500/10 text-red-700 border-red-500/20';
      default: return 'bg-gray-500/10 text-gray-700 border-gray-500/20';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'bg-green-500/10 text-green-700 border-green-500/20';
      case 'medium': return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20';
      case 'high': return 'bg-orange-500/10 text-orange-700 border-orange-500/20';
      case 'critical': return 'bg-red-500/10 text-red-700 border-red-500/20';
      default: return 'bg-gray-500/10 text-gray-700 border-gray-500/20';
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
    high: '#f97316',
    critical: '#ef4444'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-t-blue-600 border-gray-300 rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading corporate dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Corporate Health Dashboard</h1>
            <p className="text-gray-600 mt-1">
              Real-time employee health monitoring and risk analysis
            </p>
          </div>
          <Button onClick={fetchDashboardData} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800 text-sm">{error}</p>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="overview">
              <BarChart3 className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="employees">
              <Users className="w-4 h-4 mr-2" />
              Employees
            </TabsTrigger>
            <TabsTrigger value="appointments">
              <CalendarCheck className="w-4 h-4 mr-2" />
              Appointments
            </TabsTrigger>
            <TabsTrigger value="departments">
              <Activity className="w-4 h-4 mr-2" />
              Departments
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Key Stats */}
            {healthAnalytics && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-600">Total Employees</p>
                      <p className="text-2xl font-bold mt-1">{healthAnalytics.totalEmployees}</p>
                    </div>
                    <Users className="w-8 h-8 text-blue-500" />
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-600">Monitored</p>
                      <p className="text-2xl font-bold mt-1">{healthAnalytics.monitoredEmployees}</p>
                      <p className="text-xs text-green-600">
                        {((healthAnalytics.monitoredEmployees / healthAnalytics.totalEmployees) * 100).toFixed(0)}% Coverage
                      </p>
                    </div>
                    <Activity className="w-8 h-8 text-green-500" />
                  </div>
                </Card>

                <Card className="p-4 bg-green-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-green-700">Healthy</p>
                      <p className="text-2xl font-bold text-green-700 mt-1">{healthAnalytics.healthyEmployees}</p>
                    </div>
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                </Card>

                <Card className="p-4 bg-yellow-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-yellow-700">At Risk</p>
                      <p className="text-2xl font-bold text-yellow-700 mt-1">{healthAnalytics.atRiskEmployees}</p>
                    </div>
                    <AlertTriangle className="w-8 h-8 text-yellow-600" />
                  </div>
                </Card>

                <Card className="p-4 bg-red-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-red-700">Critical Cases</p>
                      <p className="text-2xl font-bold text-red-700 mt-1">{healthAnalytics.criticalCases}</p>
                    </div>
                    <Shield className="w-8 h-8 text-red-600" />
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-600">Avg Risk Score</p>
                      <p className={`text-2xl font-bold mt-1 ${getRiskScoreColor(healthAnalytics.averageRiskScore)}`}>
                        {healthAnalytics.averageRiskScore.toFixed(1)}
                      </p>
                    </div>
                    <TrendingDown className="w-8 h-8 text-gray-500" />
                  </div>
                </Card>
              </div>
            )}

            {/* Charts Row */}
            {healthAnalytics && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Risk Distribution */}
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Risk Distribution</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPieChart>
                      <Pie
                        data={[
                          { name: 'Low Risk', value: healthAnalytics.riskDistribution.low, fill: COLORS.low },
                          { name: 'Medium Risk', value: healthAnalytics.riskDistribution.medium, fill: COLORS.medium },
                          { name: 'High Risk', value: healthAnalytics.riskDistribution.high, fill: COLORS.high },
                          { name: 'Critical', value: healthAnalytics.riskDistribution.critical, fill: COLORS.critical }
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        dataKey="value"
                      >
                        {[COLORS.low, COLORS.medium, COLORS.high, COLORS.critical].map((color, index) => (
                          <Cell key={`cell-${index}`} fill={color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </Card>

                {/* Common Health Conditions */}
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Common Health Conditions</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={healthAnalytics.commonConditions}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="condition" angle={-45} textAnchor="end" height={100} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                {/* Health Trend */}
                <Card className="p-6 lg:col-span-2">
                  <h3 className="text-lg font-semibold mb-4">Health Risk Trends (Last 6 Months)</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={healthAnalytics.trendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="healthyCount" fill="#10b981" name="Healthy" />
                      <Bar dataKey="atRiskCount" fill="#f59e0b" name="At Risk" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Employees Tab */}
          <TabsContent value="employees" className="space-y-4">
            {/* Filters */}
            <Card className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search employees..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <select
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Departments</option>
                  {healthAnalytics?.departmentRisks.map(dept => (
                    <option key={dept.department} value={dept.department}>{dept.department}</option>
                  ))}
                </select>

                <Button variant="outline" onClick={() => {
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
                <Card key={employee.id} className="p-6 hover:shadow-lg transition-shadow">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold">{employee.name}</h3>
                        <Badge className={`${getRiskColor(employee.riskLevel)} border`}>
                          {employee.riskLevel.toUpperCase()}
                        </Badge>
                        {employee.deviceConnected && (
                          <Badge variant="outline" className="bg-blue-50">
                            <Activity className="w-3 h-3 mr-1" />
                            Device Active
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Employee ID</p>
                          <p className="font-medium">{employee.employeeId}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Department</p>
                          <p className="font-medium">{employee.department}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Designation</p>
                          <p className="font-medium">{employee.designation}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Risk Score</p>
                          <p className={`font-bold ${getRiskScoreColor(employee.riskScore)}`}>
                            {employee.riskScore}/100
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="bg-gray-50 p-2 rounded">
                          <p className="text-xs text-gray-600">BMI</p>
                          <p className="font-semibold">{employee.bmi}</p>
                        </div>
                        <div className="bg-gray-50 p-2 rounded">
                          <p className="text-xs text-gray-600">BP</p>
                          <p className="font-semibold">{employee.bloodPressure}</p>
                        </div>
                        <div className="bg-gray-50 p-2 rounded">
                          <p className="text-xs text-gray-600">Blood Sugar</p>
                          <p className="font-semibold">{employee.bloodSugar} mg/dL</p>
                        </div>
                        <div className="bg-gray-50 p-2 rounded">
                          <p className="text-xs text-gray-600">Cholesterol</p>
                          <p className="font-semibold">{employee.cholesterol} mg/dL</p>
                        </div>
                        <div className="bg-gray-50 p-2 rounded">
                          <p className="text-xs text-gray-600">Absenteeism</p>
                          <p className="font-semibold">{employee.absenteeismDays} days</p>
                        </div>
                      </div>

                      {employee.healthConditions.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-gray-600 mb-1">Health Conditions:</p>
                          <div className="flex flex-wrap gap-1">
                            {employee.healthConditions.map((condition, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {condition}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <Link to={`/corporate/employee/${employee.id}/health`}>
                      <Button variant="outline" size="sm">
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>

            {filteredEmployees.length === 0 && (
              <Card className="p-8 text-center">
                <UserX className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">No employees found matching your filters</p>
              </Card>
            )}
          </TabsContent>

          {/* Appointments Tab */}
          <TabsContent value="appointments" className="space-y-4">
            {/* Appointment Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600">Total Appointments</p>
                    <p className="text-2xl font-bold mt-1">{appointments.length}</p>
                  </div>
                  <CalendarCheck className="w-8 h-8 text-blue-500" />
                </div>
              </Card>

              <Card className="p-4 bg-blue-50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-blue-700">Scheduled</p>
                    <p className="text-2xl font-bold text-blue-700 mt-1">
                      {appointments.filter(a => a.status === 'scheduled').length}
                    </p>
                  </div>
                  <Clock className="w-8 h-8 text-blue-600" />
                </div>
              </Card>

              <Card className="p-4 bg-green-50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-green-700">Completed</p>
                    <p className="text-2xl font-bold text-green-700 mt-1">
                      {appointments.filter(a => a.status === 'completed').length}
                    </p>
                  </div>
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600">Total Claims</p>
                    <p className="text-2xl font-bold mt-1">
                      ₹{appointments.reduce((sum, a) => sum + a.claimAmount, 0).toLocaleString()}
                    </p>
                  </div>
                  <FileText className="w-8 h-8 text-gray-500" />
                </div>
              </Card>
            </div>

            {/* Filters */}
            <Card className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search appointments..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <select
                  value={appointmentStatusFilter}
                  onChange={(e) => setAppointmentStatusFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                <Card key={appointment.id} className="p-6 hover:shadow-lg transition-shadow">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <Badge className={`${getStatusColor(appointment.status)} border`}>
                          {appointment.status.toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className="bg-blue-50">
                          {appointment.appointmentType}
                        </Badge>
                        <span className="text-sm text-gray-600">#{appointment.appointmentId}</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                        <div>
                          <h3 className="text-lg font-semibold mb-1">{appointment.employeeName}</h3>
                          <div className="space-y-1 text-sm text-gray-600">
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
                          <h4 className="font-semibold text-gray-900 mb-1">Appointment Details</h4>
                          <div className="space-y-1 text-sm text-gray-600">
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

                      <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                        <div className="flex items-center gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Benefit Type: </span>
                            <span className="font-medium">{appointment.benefitType}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Claim Amount: </span>
                            <span className="font-bold text-green-600">₹{appointment.claimAmount.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Booked On: </span>
                            <span className="font-medium">{new Date(appointment.bookedOn).toLocaleDateString('en-IN')}</span>
                          </div>
                        </div>

                        <Button variant="outline" size="sm">
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </Button>
                      </div>

                      {appointment.notes && (
                        <div className="mt-3 p-2 bg-gray-50 rounded text-sm text-gray-700">
                          <span className="font-medium">Notes: </span>{appointment.notes}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {filteredAppointments.length === 0 && (
              <Card className="p-8 text-center">
                <CalendarCheck className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">No appointments found matching your filters</p>
              </Card>
            )}
          </TabsContent>

          {/* Departments Tab */}
          <TabsContent value="departments" className="space-y-4">
            {healthAnalytics?.departmentRisks.map(dept => (
              <Card key={dept.department} className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-semibold">{dept.department}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {dept.totalEmployees} employees • {dept.highRisk} at high risk
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Avg Risk Score</p>
                    <p className={`text-2xl font-bold ${getRiskScoreColor(dept.avgRiskScore)}`}>
                      {dept.avgRiskScore.toFixed(1)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-50 p-3 rounded-lg">
                    <p className="text-sm text-green-700">Low Risk</p>
                    <p className="text-2xl font-bold text-green-700">
                      {dept.totalEmployees - dept.highRisk}
                    </p>
                  </div>
                  <div className="bg-orange-50 p-3 rounded-lg">
                    <p className="text-sm text-orange-700">High Risk</p>
                    <p className="text-2xl font-bold text-orange-700">{dept.highRisk}</p>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-sm text-blue-700">Coverage</p>
                    <p className="text-2xl font-bold text-blue-700">
                      {((dept.totalEmployees / (healthAnalytics?.totalEmployees || 1)) * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CorporateDashboard;
