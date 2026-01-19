import { useState, useEffect } from 'react';
import api from '@/utils/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { BRAND } from '@/config/brand';
import { 
  Users, 
  Stethoscope, 
  Calendar, 
  FileText, 
  TrendingUp,
  Activity,
  Building2,
  UserPlus,
  CalendarPlus,
  FlaskConical,
  Pill,
  HeartPulse,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardStats {
  totalUsers: number;
  totalDoctors: number;
  totalAppointments: number;
  todayAppointments: number;
  activeUsers: number;
  pendingApprovals: number;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalDoctors: 0,
    totalAppointments: 0,
    todayAppointments: 0,
    activeUsers: 0,
    pendingApprovals: 0
  });
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem('adminToken');

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      // Mock stats for now - replace with actual API calls
      setTimeout(() => {
        setStats({
          totalUsers: 1248,
          totalDoctors: 156,
          totalAppointments: 3456,
          todayAppointments: 42,
          activeUsers: 892,
          pendingApprovals: 8
        });
        setLoading(false);
      }, 500);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="container mx-auto py-10">
        <Card>
          <CardHeader><CardTitle>Unauthorized</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-4">You must login as admin.</p>
            <Button onClick={()=>navigate('/admin/login')}>Go to Admin Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statsConfig = [
    {
      title: 'Total Users',
      value: stats.totalUsers,
      icon: Users,
      gradient: 'from-teal-500 to-teal-600',
      bgGradient: 'from-teal-500/10 to-teal-600/5',
      iconBg: 'bg-teal-500/10',
      textColor: 'text-teal-600 dark:text-teal-400',
      change: '+12.5%',
      changeType: 'increase' as const
    },
    {
      title: 'Doctors',
      value: stats.totalDoctors,
      icon: Stethoscope,
      gradient: 'from-blue-500 to-blue-600',
      bgGradient: 'from-blue-500/10 to-blue-600/5',
      iconBg: 'bg-blue-500/10',
      textColor: 'text-blue-600 dark:text-blue-400',
      change: '+8.3%',
      changeType: 'increase' as const
    },
    {
      title: 'Appointments',
      value: stats.totalAppointments,
      icon: Calendar,
      gradient: 'from-amber-500 to-amber-600',
      bgGradient: 'from-amber-500/10 to-amber-600/5',
      iconBg: 'bg-amber-500/10',
      textColor: 'text-amber-600 dark:text-amber-400',
      change: '+18.2%',
      changeType: 'increase' as const
    },
    {
      title: 'Today',
      value: stats.todayAppointments,
      icon: Clock,
      gradient: 'from-emerald-500 to-emerald-600',
      bgGradient: 'from-emerald-500/10 to-emerald-600/5',
      iconBg: 'bg-emerald-500/10',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      change: '+5',
      changeType: 'increase' as const
    },
    {
      title: 'Active Users',
      value: stats.activeUsers,
      icon: Activity,
      gradient: 'from-purple-500 to-purple-600',
      bgGradient: 'from-purple-500/10 to-purple-600/5',
      iconBg: 'bg-purple-500/10',
      textColor: 'text-purple-600 dark:text-purple-400',
      change: '71.5%',
      changeType: 'neutral' as const
    },
    {
      title: 'Pending',
      value: stats.pendingApprovals,
      icon: AlertCircle,
      gradient: 'from-red-500 to-red-600',
      bgGradient: 'from-red-500/10 to-red-600/5',
      iconBg: 'bg-red-500/10',
      textColor: 'text-red-600 dark:text-red-400',
      change: '-2',
      changeType: 'decrease' as const
    }
  ];

  const quickActions = [
    {
      title: 'Add New User',
      icon: UserPlus,
      path: '/admin/users',
      color: 'teal'
    },
    {
      title: 'Add Doctor',
      icon: Stethoscope,
      path: '/admin/doctors',
      color: 'blue'
    },
    {
      title: 'Schedule Appointment',
      icon: CalendarPlus,
      path: '/admin/appointments',
      color: 'amber'
    },
    {
      title: 'Add Lab',
      icon: FlaskConical,
      path: '/admin/labs',
      color: 'emerald'
    },
    {
      title: 'Add Pharmacy',
      icon: Pill,
      path: '/admin/pharmacies',
      color: 'purple'
    },
    {
      title: 'Add Corporate',
      icon: Building2,
      path: '/admin/corporates',
      color: 'indigo'
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section with Gradient */}
      <div className="relative bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 text-white overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:60px_60px]" />
        <div className="relative container mx-auto px-4 py-8 lg:py-12">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            {/* Welcome Text */}
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 mb-4">
                <HeartPulse className="h-4 w-4 text-teal-400" />
                <span className="text-sm text-teal-400 font-medium">{BRAND.name} Admin Console</span>
              </div>
              <h1 className="text-3xl lg:text-4xl font-bold mb-2">
                Welcome back, <span className="text-teal-400">Administrator</span>
              </h1>
              <p className="text-slate-300 text-base lg:text-lg">
                Manage your healthcare platform with powerful tools and insights
              </p>
            </div>

            {/* Quick Stats */}
            <div className="flex gap-4">
              <div className="text-center p-4 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
                <div className="text-2xl font-bold text-teal-400">{stats.todayAppointments}</div>
                <div className="text-xs text-slate-300">Today</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
                <div className="text-2xl font-bold text-blue-400">{stats.activeUsers}</div>
                <div className="text-xs text-slate-300">Active</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
                <div className="text-2xl font-bold text-amber-400">{stats.pendingApprovals}</div>
                <div className="text-xs text-slate-300">Pending</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6 lg:py-8 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {statsConfig.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card
                key={index}
                className={cn(
                  "group relative overflow-hidden transition-all duration-300 hover:shadow-lg border-border/50",
                  `hover:border-${stat.color}-500/30`
                )}
              >
                <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br", stat.bgGradient)} />
                <CardContent className="relative p-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                      <p className="text-3xl font-bold text-foreground">
                        {loading ? '...' : stat.value.toLocaleString()}
                      </p>
                      <div className="flex items-center gap-1 text-xs">
                        {stat.changeType === 'increase' && <TrendingUp className="h-3 w-3 text-emerald-500" />}
                        {stat.changeType === 'decrease' && <TrendingUp className="h-3 w-3 text-red-500 rotate-180" />}
                        <span className={cn(
                          stat.changeType === 'increase' && 'text-emerald-600',
                          stat.changeType === 'decrease' && 'text-red-600',
                          stat.changeType === 'neutral' && 'text-muted-foreground'
                        )}>
                          {stat.change}
                        </span>
                        <span className="text-muted-foreground">vs last month</span>
                      </div>
                    </div>
                    <div className={cn(
                      "p-3 rounded-xl transition-transform group-hover:scale-110 duration-300",
                      stat.iconBg
                    )}>
                      <Icon className={cn("h-6 w-6", stat.textColor)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-teal-500" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {quickActions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={index}
                    variant="outline"
                    className="h-auto flex-col gap-2 p-4 hover:border-teal-500/30 hover:bg-teal-500/5 transition-all group"
                    onClick={() => navigate(action.path)}
                  >
                    <div className="p-2 rounded-lg bg-teal-500/10 group-hover:bg-teal-500/20 transition-colors">
                      <Icon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <span className="text-xs font-medium text-center">{action.title}</span>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity & System Health */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { action: 'New user registered', user: 'John Doe', time: '2 min ago', icon: Users, color: 'teal' },
                  { action: 'Doctor verified', user: 'Dr. Sarah Wilson', time: '15 min ago', icon: CheckCircle2, color: 'emerald' },
                  { action: 'Appointment scheduled', user: 'Patient #1234', time: '1 hour ago', icon: Calendar, color: 'blue' },
                  { action: 'Lab added', user: 'City Diagnostics', time: '2 hours ago', icon: FlaskConical, color: 'purple' },
                ].map((item, i) => {
                  const ItemIcon = item.icon;
                  return (
                    <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors">
                      <div className={`p-2 rounded-lg bg-${item.color}-500/10`}>
                        <ItemIcon className={`h-4 w-4 text-${item.color}-600`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{item.action}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.user}</p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{item.time}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HeartPulse className="h-5 w-5 text-teal-500" />
                System Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { name: 'API Server', status: 'Operational', uptime: '99.9%', color: 'emerald' },
                  { name: 'Database', status: 'Operational', uptime: '99.8%', color: 'emerald' },
                  { name: 'Email Service', status: 'Operational', uptime: '100%', color: 'emerald' },
                  { name: 'Storage', status: 'Healthy', uptime: '85% used', color: 'amber' },
                ].map((system, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full bg-${system.color}-500 animate-pulse`} />
                      <div>
                        <p className="text-sm font-medium text-foreground">{system.name}</p>
                        <p className="text-xs text-muted-foreground">{system.status}</p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">{system.uptime}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
