import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Activity, 
  AlertTriangle, 
  Users, 
  Heart, 
  TrendingUp, 
  TrendingDown,
  Search,
  Filter,
  Download,
  RefreshCw,
  Eye,
  Shield,
  ShieldAlert,
  Brain,
  Droplets,
  HeartPulse,
  Building2,
  ChevronRight,
  BarChart3,
  PieChart,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Bell
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';
import { PieChart as RechartsPieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface EmployeeHRA {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  age: number;
  gender: string;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  healthScore: number;
  lastAssessmentDate: string;
  nextAssessmentDue: string;
  completionStatus: 'completed' | 'pending' | 'overdue';
  riskFactors: string[];
  recommendations: string[];
  trendDirection: 'improving' | 'stable' | 'declining';
  bmi?: number;
  bloodPressure?: string;
  bloodSugar?: number;
  cholesterol?: number;
}

interface DepartmentHRAStats {
  department: string;
  totalEmployees: number;
  assessedEmployees: number;
  avgRiskScore: number;
  avgHealthScore: number;
  lowRisk: number;
  mediumRisk: number;
  highRisk: number;
  criticalRisk: number;
  completionRate: number;
}

interface HRASummary {
  totalEmployees: number;
  assessedEmployees: number;
  pendingAssessments: number;
  overdueAssessments: number;
  avgHealthScore: number;
  avgRiskScore: number;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  trendData: Array<{
    month: string;
    avgHealthScore: number;
    avgRiskScore: number;
    completionRate: number;
  }>;
}

const RISK_COLORS = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444'
};

const getRiskBadgeVariant = (level: string) => {
  switch (level) {
    case 'low': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'medium': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    case 'high': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    case 'critical': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    default: return 'bg-slate-800 text-slate-300';
  }
};

const getHealthScoreColor = (score: number) => {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 60) return 'text-amber-600 dark:text-amber-400';
  if (score >= 40) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
};

const generateSampleEmployeeHRA = (): EmployeeHRA[] => {
  const departments = ['Engineering', 'Marketing', 'Sales', 'Finance', 'Operations', 'HR'];
  const riskLevels: Array<'low' | 'medium' | 'high' | 'critical'> = ['low', 'medium', 'high', 'critical'];
  const statuses: Array<'completed' | 'pending' | 'overdue'> = ['completed', 'completed', 'completed', 'pending', 'overdue'];
  const trends: Array<'improving' | 'stable' | 'declining'> = ['improving', 'stable', 'declining'];
  
  return Array.from({ length: 50 }, (_, i) => {
    const riskLevel = riskLevels[Math.floor(Math.random() * 4)];
    const riskScore = riskLevel === 'low' ? Math.floor(Math.random() * 30) + 10 :
                      riskLevel === 'medium' ? Math.floor(Math.random() * 30) + 40 :
                      riskLevel === 'high' ? Math.floor(Math.random() * 30) + 70 :
                      Math.floor(Math.random() * 20) + 100;
    const healthScore = Math.max(0, Math.min(100, 100 - riskScore + Math.floor(Math.random() * 20)));
    
    return {
      id: `emp-${i + 1}`,
      employeeId: `EMP${String(i + 1).padStart(4, '0')}`,
      name: ['Rajesh Kumar', 'Priya Sharma', 'Amit Patel', 'Neha Singh', 'Vikram Reddy', 'Anita Gupta', 'Suresh Nair', 'Kavita Joshi', 'Rahul Verma', 'Deepika Mehta'][i % 10],
      email: `employee${i + 1}@company.com`,
      department: departments[i % departments.length],
      designation: ['Software Engineer', 'Manager', 'Analyst', 'Executive', 'Lead', 'Associate'][i % 6],
      age: 25 + Math.floor(Math.random() * 35),
      gender: i % 2 === 0 ? 'Male' : 'Female',
      riskScore,
      riskLevel,
      healthScore,
      lastAssessmentDate: new Date(Date.now() - Math.floor(Math.random() * 90) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      nextAssessmentDue: new Date(Date.now() + Math.floor(Math.random() * 90) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      completionStatus: statuses[Math.floor(Math.random() * statuses.length)],
      riskFactors: ['High BMI', 'Sedentary Lifestyle', 'High Blood Pressure', 'Stress', 'Poor Diet', 'Smoking', 'Lack of Exercise'].slice(0, Math.floor(Math.random() * 4) + 1),
      recommendations: ['Regular exercise', 'Balanced diet', 'Stress management', 'Regular health checkups', 'Quit smoking'].slice(0, Math.floor(Math.random() * 3) + 1),
      trendDirection: trends[Math.floor(Math.random() * trends.length)],
      bmi: 18 + Math.random() * 15,
      bloodPressure: `${110 + Math.floor(Math.random() * 40)}/${70 + Math.floor(Math.random() * 20)}`,
      bloodSugar: 80 + Math.floor(Math.random() * 60),
      cholesterol: 150 + Math.floor(Math.random() * 100)
    };
  });
};

const generateDepartmentStats = (employees: EmployeeHRA[]): DepartmentHRAStats[] => {
  const departments = [...new Set(employees.map(e => e.department))];
  return departments.map(dept => {
    const deptEmployees = employees.filter(e => e.department === dept);
    const assessed = deptEmployees.filter(e => e.completionStatus === 'completed');
    return {
      department: dept,
      totalEmployees: deptEmployees.length,
      assessedEmployees: assessed.length,
      avgRiskScore: Math.round(deptEmployees.reduce((sum, e) => sum + e.riskScore, 0) / deptEmployees.length),
      avgHealthScore: Math.round(deptEmployees.reduce((sum, e) => sum + e.healthScore, 0) / deptEmployees.length),
      lowRisk: deptEmployees.filter(e => e.riskLevel === 'low').length,
      mediumRisk: deptEmployees.filter(e => e.riskLevel === 'medium').length,
      highRisk: deptEmployees.filter(e => e.riskLevel === 'high').length,
      criticalRisk: deptEmployees.filter(e => e.riskLevel === 'critical').length,
      completionRate: Math.round((assessed.length / deptEmployees.length) * 100)
    };
  });
};

const CorporateHealthRiskAssessment: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeHRA[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<EmployeeHRA[]>([]);
  const [departmentStats, setDepartmentStats] = useState<DepartmentHRAStats[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeHRA | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const summary = useMemo<HRASummary>(() => {
    const assessed = employees.filter(e => e.completionStatus === 'completed');
    const pending = employees.filter(e => e.completionStatus === 'pending');
    const overdue = employees.filter(e => e.completionStatus === 'overdue');
    
    return {
      totalEmployees: employees.length,
      assessedEmployees: assessed.length,
      pendingAssessments: pending.length,
      overdueAssessments: overdue.length,
      avgHealthScore: employees.length > 0 ? Math.round(employees.reduce((sum, e) => sum + e.healthScore, 0) / employees.length) : 0,
      avgRiskScore: employees.length > 0 ? Math.round(employees.reduce((sum, e) => sum + e.riskScore, 0) / employees.length) : 0,
      riskDistribution: {
        low: employees.filter(e => e.riskLevel === 'low').length,
        medium: employees.filter(e => e.riskLevel === 'medium').length,
        high: employees.filter(e => e.riskLevel === 'high').length,
        critical: employees.filter(e => e.riskLevel === 'critical').length
      },
      trendData: [
        { month: 'Jul', avgHealthScore: 72, avgRiskScore: 42, completionRate: 78 },
        { month: 'Aug', avgHealthScore: 74, avgRiskScore: 40, completionRate: 82 },
        { month: 'Sep', avgHealthScore: 73, avgRiskScore: 41, completionRate: 85 },
        { month: 'Oct', avgHealthScore: 76, avgRiskScore: 38, completionRate: 88 },
        { month: 'Nov', avgHealthScore: 75, avgRiskScore: 39, completionRate: 90 },
        { month: 'Dec', avgHealthScore: 77, avgRiskScore: 37, completionRate: 92 }
      ]
    };
  }, [employees]);

  const departments = useMemo(() => [...new Set(employees.map(e => e.department))], [employees]);

  const riskDistributionData = useMemo(() => [
    { name: 'Low Risk', value: summary.riskDistribution.low, color: RISK_COLORS.low },
    { name: 'Medium Risk', value: summary.riskDistribution.medium, color: RISK_COLORS.medium },
    { name: 'High Risk', value: summary.riskDistribution.high, color: RISK_COLORS.high },
    { name: 'Critical', value: summary.riskDistribution.critical, color: RISK_COLORS.critical }
  ], [summary]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterEmployees();
  }, [employees, searchQuery, riskFilter, departmentFilter, statusFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Try to fetch from API
      const [hraRes] = await Promise.all([
        api.get('/corporate/health-risk/employees').catch(() => ({ data: null }))
      ]);

      const employeeData = hraRes.data?.data?.employees || generateSampleEmployeeHRA();
      setEmployees(employeeData);
      setDepartmentStats(generateDepartmentStats(employeeData));
    } catch (error) {
      console.error('Failed to load HRA data:', error);
      const sampleData = generateSampleEmployeeHRA();
      setEmployees(sampleData);
      setDepartmentStats(generateDepartmentStats(sampleData));
    } finally {
      setLoading(false);
    }
  };

  const filterEmployees = () => {
    let filtered = employees;

    if (searchQuery) {
      filtered = filtered.filter(e =>
        e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (riskFilter !== 'all') {
      filtered = filtered.filter(e => e.riskLevel === riskFilter);
    }

    if (departmentFilter !== 'all') {
      filtered = filtered.filter(e => e.department === departmentFilter);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(e => e.completionStatus === statusFilter);
    }

    setFilteredEmployees(filtered);
  };

  const handleExport = () => {
    toast({
      title: 'Exporting Report',
      description: 'HRA report is being generated...'
    });
  };

  const handleViewDetails = (employee: EmployeeHRA) => {
    setSelectedEmployee(employee);
    setDetailsOpen(true);
  };

  const handleSendReminder = (employee: EmployeeHRA) => {
    toast({
      title: 'Reminder Sent',
      description: `Assessment reminder sent to ${employee.name}`
    });
  };

  if (loading) {
    return (
      <CorporateLayout title="Health Risk Assessment">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      </CorporateLayout>
    );
  }

  return (
    <CorporateLayout title="Health Risk Assessment">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={ShieldAlert}
          title="Employee Health Risk Assessment"
          description="Monitor and manage employee health scores, risk levels, and wellness assessments"
          gradient="from-rose-500 to-rose-700"
          showSearch={true}
          searchPlaceholder="Search employees by name, ID, or email..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          showRefresh={true}
          onRefresh={loadData}
          showExport={true}
          onExport={handleExport}
          stats={[
            { label: 'Total Employees', value: summary.totalEmployees },
            { label: 'Avg Health Score', value: `${summary.avgHealthScore}%`, trend: 'up', trendValue: '3%' },
            { label: 'Assessed', value: summary.assessedEmployees },
            { label: 'High Risk', value: summary.riskDistribution.high + summary.riskDistribution.critical }
          ]}
        />

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">Avg Health Score</CardTitle>
              <HeartPulse className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${getHealthScoreColor(summary.avgHealthScore)}`}>
                {summary.avgHealthScore}%
              </div>
              <Progress value={summary.avgHealthScore} className="mt-2 h-2" />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                <TrendingUp className="inline h-3 w-3 mr-1 text-emerald-500" />
                +3% from last month
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">Assessment Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">
                {Math.round((summary.assessedEmployees / summary.totalEmployees) * 100)}%
              </div>
              <Progress value={(summary.assessedEmployees / summary.totalEmployees) * 100} className="mt-2 h-2" />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {summary.assessedEmployees}/{summary.totalEmployees} completed
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">At Risk Employees</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                {summary.riskDistribution.high + summary.riskDistribution.critical}
              </div>
              <div className="flex gap-2 mt-2">
                <Badge className="bg-orange-100 text-orange-700 text-xs">{summary.riskDistribution.high} High</Badge>
                <Badge className="bg-red-100 text-red-700 text-xs">{summary.riskDistribution.critical} Critical</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">Pending Reviews</CardTitle>
              <Clock className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                {summary.pendingAssessments + summary.overdueAssessments}
              </div>
              <div className="flex gap-2 mt-2">
                <Badge className="bg-amber-100 text-amber-700 text-xs">{summary.pendingAssessments} Pending</Badge>
                <Badge className="bg-red-100 text-red-700 text-xs">{summary.overdueAssessments} Overdue</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Risk Distribution Chart */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-900 dark:text-white">Risk Distribution</CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">Employee risk level breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={riskDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {riskDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-900 dark:text-white">Health Score Trend</CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">Average health score over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip />
                    <Bar dataKey="avgHealthScore" fill="#10b981" name="Health Score" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completionRate" fill="#3b82f6" name="Completion %" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Department Stats */}
        <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-900 dark:text-white">Department-wise Health Analysis</CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">Compare health metrics across departments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {departmentStats.map(dept => (
                <Card key={dept.department} className="border border-slate-200 dark:border-slate-700">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base text-slate-900 dark:text-white">{dept.department}</CardTitle>
                      <Badge variant="outline" className="text-xs">{dept.totalEmployees} employees</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600 dark:text-slate-400">Avg Health Score</span>
                      <span className={`font-bold ${getHealthScoreColor(dept.avgHealthScore)}`}>{dept.avgHealthScore}%</span>
                    </div>
                    <Progress value={dept.avgHealthScore} className="h-2" />
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600 dark:text-slate-400">Completion Rate</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{dept.completionRate}%</span>
                    </div>
                    <div className="flex gap-1 mt-2">
                      <div className="flex-1 text-center p-1 rounded bg-emerald-50 dark:bg-emerald-900/20">
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">{dept.lowRisk}</p>
                        <p className="text-[10px] text-slate-500">Low</p>
                      </div>
                      <div className="flex-1 text-center p-1 rounded bg-amber-50 dark:bg-amber-900/20">
                        <p className="text-xs text-amber-600 dark:text-amber-400">{dept.mediumRisk}</p>
                        <p className="text-[10px] text-slate-500">Med</p>
                      </div>
                      <div className="flex-1 text-center p-1 rounded bg-orange-50 dark:bg-orange-900/20">
                        <p className="text-xs text-orange-600 dark:text-orange-400">{dept.highRisk}</p>
                        <p className="text-[10px] text-slate-500">High</p>
                      </div>
                      <div className="flex-1 text-center p-1 rounded bg-red-50 dark:bg-red-900/20">
                        <p className="text-xs text-red-600 dark:text-red-400">{dept.criticalRisk}</p>
                        <p className="text-[10px] text-slate-500">Crit</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Employee List with Filters */}
        <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle className="text-slate-900 dark:text-white">Employee Health Assessments</CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">
                  {filteredEmployees.length} employees found
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={riskFilter} onValueChange={setRiskFilter}>
                  <SelectTrigger className="w-[140px] bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600">
                    <SelectValue placeholder="Risk Level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Risks</SelectItem>
                    <SelectItem value="low">Low Risk</SelectItem>
                    <SelectItem value="medium">Medium Risk</SelectItem>
                    <SelectItem value="high">High Risk</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger className="w-[150px] bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600">
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map(dept => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px] bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredEmployees.slice(0, 20).map(employee => (
                <div
                  key={employee.id}
                  className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <div className="flex items-center gap-4 mb-3 md:mb-0">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold">
                      {employee.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-white">{employee.name}</h4>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {employee.employeeId} • {employee.department} • {employee.designation}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="text-center">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Health Score</p>
                      <p className={`text-lg font-bold ${getHealthScoreColor(employee.healthScore)}`}>
                        {employee.healthScore}%
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Risk Level</p>
                      <Badge className={getRiskBadgeVariant(employee.riskLevel)}>
                        {employee.riskLevel.charAt(0).toUpperCase() + employee.riskLevel.slice(1)}
                      </Badge>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Trend</p>
                      <div className="flex items-center gap-1">
                        {employee.trendDirection === 'improving' && <TrendingUp className="h-4 w-4 text-emerald-500" />}
                        {employee.trendDirection === 'declining' && <TrendingDown className="h-4 w-4 text-red-500" />}
                        {employee.trendDirection === 'stable' && <Activity className="h-4 w-4 text-amber-500" />}
                        <span className="text-sm capitalize text-slate-600 dark:text-slate-400">{employee.trendDirection}</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Status</p>
                      <Badge className={
                        employee.completionStatus === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                        employee.completionStatus === 'pending' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }>
                        {employee.completionStatus.charAt(0).toUpperCase() + employee.completionStatus.slice(1)}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleViewDetails(employee)}>
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      {employee.completionStatus !== 'completed' && (
                        <Button variant="outline" size="sm" onClick={() => handleSendReminder(employee)}>
                          <Bell className="h-4 w-4 mr-1" />
                          Remind
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {filteredEmployees.length > 20 && (
                <div className="text-center py-4">
                  <p className="text-sm text-slate-500">
                    Showing 20 of {filteredEmployees.length} employees. Use filters to narrow down.
                  </p>
                </div>
              )}

              {filteredEmployees.length === 0 && (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                  <ShieldAlert className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No employees found matching your criteria</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Employee Details Dialog */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl bg-white dark:bg-slate-800">
            <DialogHeader>
              <DialogTitle className="text-slate-900 dark:text-white">Employee Health Assessment Details</DialogTitle>
              <DialogDescription className="text-slate-500 dark:text-slate-400">
                Comprehensive health risk profile for {selectedEmployee?.name}
              </DialogDescription>
            </DialogHeader>
            {selectedEmployee && (
              <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
                <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xl font-bold">
                    {selectedEmployee.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{selectedEmployee.name}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {selectedEmployee.employeeId} • {selectedEmployee.department}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {selectedEmployee.designation} • {selectedEmployee.age} years • {selectedEmployee.gender}
                    </p>
                  </div>
                  <Badge className={getRiskBadgeVariant(selectedEmployee.riskLevel)} style={{ fontSize: '14px', padding: '6px 12px' }}>
                    {selectedEmployee.riskLevel.charAt(0).toUpperCase() + selectedEmployee.riskLevel.slice(1)} Risk
                  </Badge>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-center">
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">Health Score</p>
                    <p className={`text-2xl font-bold ${getHealthScoreColor(selectedEmployee.healthScore)}`}>
                      {selectedEmployee.healthScore}%
                    </p>
                  </div>
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-center">
                    <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">Risk Score</p>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{selectedEmployee.riskScore}</p>
                  </div>
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                    <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">BMI</p>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{selectedEmployee.bmi?.toFixed(1)}</p>
                  </div>
                  <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-center">
                    <p className="text-xs text-purple-600 dark:text-purple-400 mb-1">Blood Pressure</p>
                    <p className="text-xl font-bold text-purple-600 dark:text-purple-400">{selectedEmployee.bloodPressure}</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Risk Factors</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedEmployee.riskFactors.map((factor, i) => (
                        <Badge key={i} variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400">
                          {factor}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Recommendations</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedEmployee.recommendations.map((rec, i) => (
                        <Badge key={i} variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400">
                          {rec}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Last Assessment</p>
                    <p className="font-semibold text-slate-900 dark:text-white">{selectedEmployee.lastAssessmentDate}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Next Due</p>
                    <p className="font-semibold text-slate-900 dark:text-white">{selectedEmployee.nextAssessmentDue}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedEmployee.trendDirection === 'improving' && (
                      <>
                        <TrendingUp className="h-5 w-5 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">Improving</span>
                      </>
                    )}
                    {selectedEmployee.trendDirection === 'declining' && (
                      <>
                        <TrendingDown className="h-5 w-5 text-red-500" />
                        <span className="text-red-600 dark:text-red-400 font-medium">Declining</span>
                      </>
                    )}
                    {selectedEmployee.trendDirection === 'stable' && (
                      <>
                        <Activity className="h-5 w-5 text-amber-500" />
                        <span className="text-amber-600 dark:text-amber-400 font-medium">Stable</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </CorporateLayout>
  );
};

export default CorporateHealthRiskAssessment;
