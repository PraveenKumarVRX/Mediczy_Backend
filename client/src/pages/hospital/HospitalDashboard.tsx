import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2, Calendar, Users, FileText, DollarSign,
  TrendingUp, Activity, UserCheck, Pill, Settings,
  LogOut, Plus, BarChart3, Bed,
  Stethoscope, ClipboardList, Shield, FileHeart, FolderOpen,
  AlertCircle, CheckCircle, ArrowRight, BriefcaseMedical,
  HeartPulse, Receipt, CreditCard, UserCog, Building, FlaskConical, Scan,
  MessageSquare, RefreshCw
} from 'lucide-react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { useHospitalAuth } from '@/hooks/useHospitalAuth';
import api from '@/utils/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface StatCard {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  trend?: string;
}

interface Admission {
  id: string;
  patient: string;
  age?: number;
  department: string;
  doctor: string;
  status: string;
  bed: string;
}

interface Claim {
  id: string;
  patient: string;
  amount: string;
  insurer: string;
  status: string;
  days: number;
}

interface BedOccupancy {
  department: string;
  total: number;
  occupied: number;
  color: string;
}

interface DashboardStats {
  totalPatients?: number | string;
  todayAdmissions?: number | string;
  activeClaims?: number | string;
  todayRevenue?: number | string;
  todayOPD?: number | string;
  activeDoctors?: number | string;
  recordsUpdated?: number | string;
  invoicesGenerated?: number | string;
}

// ─── Static navigation modules (plan-agnostic for now) ────────────────────────
const quickModules = [
  { title: 'Practice Management', description: 'Appointments, OPD/IPD, Staff scheduling', icon: BriefcaseMedical, color: 'from-blue-500 to-blue-600', route: '/hospital/practice-management' },
  { title: 'Corporate Management', description: 'Manage corporate tie-ups and employee benefits', icon: Building, color: 'from-teal-500 to-teal-600', route: '/hospital/corporate-management' },
  { title: 'Insurance Payer Management', description: 'TPA, Insurance companies, MoU, Schedule of charges', icon: Shield, color: 'from-blue-500 to-blue-600', route: '/hospital/insurance-payer-management' },
  { title: 'Insurance Billing', description: 'Claims, pre-auth, settlements', icon: CreditCard, color: 'from-amber-500 to-amber-600', route: '/hospital/insurance-billing' },
  { title: 'Medical Records (MRD)', description: 'File management, retrieval, audit', icon: FolderOpen, color: 'from-purple-500 to-purple-600', route: '/hospital/mrd' },
  { title: 'Electronic Health Records', description: 'Patient charts, clinical docs', icon: FileHeart, color: 'from-emerald-500 to-emerald-600', route: '/hospital/ehr' },
  { title: 'Discharge Summary', description: 'Generate and manage discharge summaries', icon: FileText, color: 'from-rose-500 to-rose-600', route: '/hospital/discharge-summary' },
  { title: 'IP Sheets', description: 'Inpatient monitoring and charts', icon: ClipboardList, color: 'from-violet-500 to-violet-600', route: '/hospital/ip-sheets' },
  { title: 'Lab Test Orders', description: 'Order lab tests, manage results', icon: FlaskConical, color: 'from-cyan-500 to-cyan-600', route: '/hospital/lab-order' },
  { title: 'Imaging Orders', description: 'Order imaging tests, radiology', icon: Scan, color: 'from-indigo-500 to-indigo-600', route: '/hospital/imaging-order' },
  { title: 'Prescription Creator', description: 'Create and manage prescriptions', icon: Pill, color: 'from-orange-500 to-orange-600', route: '/hospital/prescription-creator' },
  { title: 'Procedure Scheduler', description: 'Schedule medical procedures', icon: Stethoscope, color: 'from-pink-500 to-pink-600', route: '/hospital/procedure-adder' },
  { title: 'Team Chat', description: 'Internal messaging for staff & partners (RocketChat)', icon: MessageSquare, color: 'from-purple-500 to-purple-600', route: '/hospital/team-chat' },
];

// ─── Skeleton helpers ─────────────────────────────────────────────────────────
const StatSkeleton = () => (
  <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
    <CardContent className="pt-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-14 w-14 rounded-xl" />
      </div>
    </CardContent>
  </Card>
);

// ─── Component ────────────────────────────────────────────────────────────────
const HospitalDashboard = () => {
  const navigate = useNavigate();
  const { hospitalData } = useHospitalAuth();

  // KPI stats
  const {
    data: rawStats,
    isLoading: statsLoading,
    error: statsError,
    dataUpdatedAt: statsUpdatedAt,
    refetch: refetchStats,
  } = useQuery<DashboardStats>({
    queryKey: ['hospital-dashboard-stats'],
    queryFn: () => api.get('/hospital/analytics/stats').then((r) => r.data?.data ?? r.data ?? {}),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  // Recent admissions
  const {
    data: admissions = [],
    isLoading: admissionsLoading,
  } = useQuery<Admission[]>({
    queryKey: ['hospital-recent-admissions'],
    queryFn: () => api.get('/hospital/patients/recent-admissions').then((r) => r.data?.admissions ?? r.data ?? []),
    staleTime: 2 * 60_000,
    retry: 1,
  });

  // Bed occupancy
  const {
    data: bedOccupancy = [],
    isLoading: bedsLoading,
  } = useQuery<BedOccupancy[]>({
    queryKey: ['hospital-beds-occupancy'],
    queryFn: () => api.get('/hospital/beds/occupancy').then((r) => r.data?.wards ?? r.data ?? []),
    staleTime: 2 * 60_000,
    retry: 1,
  });

  // Pending claims
  const {
    data: claims = [],
    isLoading: claimsLoading,
  } = useQuery<Claim[]>({
    queryKey: ['hospital-pending-claims'],
    queryFn: () => api.get('/hospital/claims/pending').then((r) => r.data?.claims ?? r.data ?? []),
    staleTime: 3 * 60_000,
    retry: 1,
  });

  // Build stat cards from live data (with label fallbacks while loading)
  const stats: StatCard[] = rawStats
    ? [
        { label: 'Total Patients', value: String(rawStats.totalPatients ?? '—'), icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10', trend: undefined },
        { label: "Today's Admissions", value: String(rawStats.todayAdmissions ?? '—'), icon: Bed, color: 'text-teal-500', bg: 'bg-teal-500/10', trend: undefined },
        { label: 'Active Insurance Claims', value: String(rawStats.activeClaims ?? '—'), icon: Shield, color: 'text-amber-500', bg: 'bg-amber-500/10', trend: undefined },
        { label: "Today's Revenue", value: String(rawStats.todayRevenue ?? '—'), icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10', trend: undefined },
      ]
    : [];

  const lastUpdated = statsUpdatedAt ? new Date(statsUpdatedAt).toLocaleTimeString() : null;

  return (
    <HospitalLayout title="Dashboard" subtitle="Hospital Management Overview">
      {/* Stats Cards */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {lastUpdated ? `Last updated: ${lastUpdated}` : 'Loading stats…'}
        </h2>
        <Button variant="ghost" size="sm" className="gap-1 text-slate-500" onClick={() => refetchStats()}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statsLoading
          ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
          : statsError
          ? (
            <div className="lg:col-span-4">
              <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/10">
                <CardContent className="pt-4 flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  Could not load stats. The analytics endpoint may not be available yet.
                </CardContent>
              </Card>
            </div>
          )
          : stats.map((stat, index) => (
            <Card key={index} className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-teal-200 dark:hover:border-teal-500/50 hover:shadow-lg hover:shadow-teal-500/5 transition-all duration-300 group">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{stat.label}</p>
                    <p className="text-3xl font-bold text-slate-800 dark:text-white">{stat.value}</p>
                    {stat.trend && <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">{stat.trend} this month</p>}
                  </div>
                  <div className={`${stat.bg} p-4 rounded-xl transition-all duration-300 group-hover:scale-110`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* Quick Access Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {quickModules.map((module, index) => (
          <Card
            key={index}
            className="cursor-pointer bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-teal-200 dark:hover:border-teal-500/50 hover:shadow-xl hover:shadow-teal-500/10 transition-all transform hover:-translate-y-1 group"
            onClick={() => navigate(module.route)}
          >
            <CardContent className="pt-6">
              <div className={`bg-gradient-to-br ${module.color} p-4 rounded-xl w-fit mb-4 shadow-lg transition-transform duration-300 group-hover:scale-110`}>
                <module.icon className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-lg font-bold mb-2 text-slate-800 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{module.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{module.description}</p>
              <Button variant="ghost" className="p-0 h-auto gap-2 text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300">
                Open Module <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Admissions */}
        <Card className="lg:col-span-2 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-slate-800 dark:text-white">Recent Admissions</CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">Latest patient admissions and bed assignments</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="gap-2 border-slate-200 dark:border-slate-700 hover:border-teal-500 dark:hover:border-teal-500" onClick={() => navigate('/hospital/patients')}>
              <Plus className="h-4 w-4" /> New Admission
            </Button>
          </CardHeader>
          <CardContent>
            {admissionsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
              </div>
            ) : admissions.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No recent admissions data available.</p>
            ) : (
              <div className="space-y-4">
                {admissions.map((admission) => (
                  <div key={admission.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="bg-teal-500/10 dark:bg-teal-500/20 p-3 rounded-xl">
                        <Bed className="h-5 w-5 text-teal-500" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-white">{admission.patient}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{admission.department} • {admission.doctor}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Bed: {admission.bed}</p>
                        {admission.age && <p className="text-sm text-slate-500 dark:text-slate-400">Age: {admission.age}</p>}
                      </div>
                      <Badge variant={admission.status === 'Admitted' ? 'default' : admission.status === 'Surgery Scheduled' ? 'destructive' : 'secondary'}>
                        {admission.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bed Occupancy */}
        <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-slate-800 dark:text-white">Bed Occupancy</CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">Real-time bed availability</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {bedsLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
            ) : bedOccupancy.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No bed data available.</p>
            ) : (
              bedOccupancy.map((ward, index) => (
                <div key={index}>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{ward.department}</span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">{ward.occupied}/{ward.total}</span>
                  </div>
                  <Progress value={(ward.occupied / ward.total) * 100} className="h-2" />
                </div>
              ))
            )}
            <Button variant="outline" className="w-full gap-2 mt-4 border-slate-200 dark:border-slate-700 hover:border-teal-500 dark:hover:border-teal-500" onClick={() => navigate('/hospital/beds')}>
              <Bed className="h-4 w-4" />
              Manage Beds
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Insurance Claims */}
      <Card className="mt-6 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-slate-800 dark:text-white">Pending Insurance Claims</CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">Claims requiring attention</CardDescription>
          </div>
          <Button onClick={() => navigate('/hospital/insurance-billing')} className="gap-2 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg shadow-teal-500/30 border-0">
            <Shield className="h-4 w-4" /> View All Claims
          </Button>
        </CardHeader>
        <CardContent>
          {claimsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
            </div>
          ) : claims.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No pending claims data available.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {claims.map((claim) => (
                <div key={claim.id} className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl hover:shadow-md hover:border-teal-200 dark:hover:border-teal-500/50 transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="outline" className="border-slate-300 dark:border-slate-600">{claim.id}</Badge>
                    <Badge variant={claim.status === 'Pending Auth' ? 'destructive' : 'secondary'}>{claim.status}</Badge>
                  </div>
                  <p className="font-semibold text-slate-800 dark:text-white">{claim.patient}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{claim.insurer}</p>
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{claim.amount}</span>
                    <span className="text-sm text-amber-600 dark:text-amber-400">{claim.days} days pending</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats from rawStats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg shadow-blue-500/30">
          <CardContent className="pt-6 text-center">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-80" />
            <p className="text-2xl font-bold">{statsLoading ? '—' : (rawStats?.todayOPD ?? '—')}</p>
            <p className="text-sm opacity-80">Today's OPD</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-teal-500 to-teal-600 text-white border-0 shadow-lg shadow-teal-500/30">
          <CardContent className="pt-6 text-center">
            <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-80" />
            <p className="text-2xl font-bold">{statsLoading ? '—' : (rawStats?.activeDoctors ?? '—')}</p>
            <p className="text-sm opacity-80">Active Doctors</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg shadow-purple-500/30">
          <CardContent className="pt-6 text-center">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-80" />
            <p className="text-2xl font-bold">{statsLoading ? '—' : (rawStats?.recordsUpdated ?? '—')}</p>
            <p className="text-sm opacity-80">Records Updated</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0 shadow-lg shadow-emerald-500/30">
          <CardContent className="pt-6 text-center">
            <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-80" />
            <p className="text-2xl font-bold">{statsLoading ? '—' : (rawStats?.invoicesGenerated ?? '—')}</p>
            <p className="text-sm opacity-80">Invoices Generated</p>
          </CardContent>
        </Card>
      </div>
    </HospitalLayout>
  );
};

export default HospitalDashboard;
