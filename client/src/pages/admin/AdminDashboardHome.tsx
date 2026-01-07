import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AdminLayout from '@/components/layout/AdminLayout';
import api from '@/utils/api';
import { 
  Users, 
  Stethoscope, 
  FlaskConical, 
  Pill, 
  Building2, 
  TrendingUp, 
  ArrowRight, 
  Crown,
  CheckCircle2,
  Plus,
  Activity,
  HeartPulse,
  IndianRupee,
  CreditCard,
  Receipt,
  DollarSign,
  TrendingDown,
  Calendar,
  AlertCircle,
  Clock,
  Loader2
} from 'lucide-react';
import axios from 'axios';

interface DashboardStats {
  users: number;
  doctors: number;
  labs: number;
  clinics: number;
  pharmacies: number;
  hospitals: number;
  corporates: number;
}

interface RecentUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
}

interface PaymentAnalytics {
  totalRevenue: number;
  monthlyRevenue: number;
  pendingPayments: number;
  overduePayments: number;
  collectionRate: number;
  avgPaymentTime: number;
  revenueGrowth: number;
  totalInvoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  partiallyPaid: number;
}

interface ARAnalytics {
  totalAR: number;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  over90: number;
  dso: number;
  arTurnover: number;
}

const AdminDashboardHome = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [crm, setCrm] = useState<{ counts: Record<string, number>; openValue: number; conversionRate: number }|null>(null);
  const [paymentAnalytics, setPaymentAnalytics] = useState<PaymentAnalytics | null>(null);
  const [arAnalytics, setArAnalytics] = useState<ARAnalytics | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      // Check localStorage immediately
      const token = localStorage.getItem('adminToken');
      
      if (!token) {
        setTimeout(() => {
          window.location.href = '/admin/login';
        }, 1000);
        return;
      }
      
      setIsCheckingAuth(false);
      await fetchDashboardData();
    };

    checkAuthAndLoadData();
  }, []);

  const fetchDashboardData = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Use environment variable for API base URL  
      const apiBaseUrl = import.meta.env.VITE_API_URL || '/api';
      
      // Add timeout for API calls
      const timeoutMs = 5000; // 5 second timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const { data } = await axios.get(`${apiBaseUrl}/admin/dashboard/stats`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
        timeout: timeoutMs
      });
      
      clearTimeout(timeoutId);
      setStats(data.stats);
      setRecentUsers(data.recentUsers || []);
      
      // Try to get CRM stats (optional)
      try {
        const crmController = new AbortController();
        const crmTimeoutId = setTimeout(() => crmController.abort(), 3000); // 3 sec for optional data
        
        const crmRes = await axios.get(`${apiBaseUrl}/crm/stats`, { 
          headers: { Authorization: `Bearer ${token}` },
          signal: crmController.signal,
          timeout: 3000
        });
        
        clearTimeout(crmTimeoutId);
        setCrm(crmRes.data);
      } catch (crmError) {
        console.log('CRM stats unavailable (optional), using empty data');
        setCrm({ counts: { leads: 0, qualified: 0, proposal: 0, won: 0 }, openValue: 0, conversionRate: 0 });
      }
      
      // Try to get payment analytics (optional)
      try {
        const paymentController = new AbortController();
        const paymentTimeoutId = setTimeout(() => paymentController.abort(), 3000);
        
        const paymentRes = await axios.get(`${apiBaseUrl}/admin/analytics/payments`, { 
          headers: { Authorization: `Bearer ${token}` },
          signal: paymentController.signal,
          timeout: 3000
        });
        
        clearTimeout(paymentTimeoutId);
        setPaymentAnalytics(paymentRes.data);
      } catch (paymentError) {
        console.log('Payment analytics unavailable, using empty data');
        setPaymentAnalytics({
          totalRevenue: 0,
          monthlyRevenue: 0,
          pendingPayments: 0,
          overduePayments: 0,
          collectionRate: 0,
          avgPaymentTime: 0,
          revenueGrowth: 0,
          totalInvoices: 0,
          paidInvoices: 0,
          unpaidInvoices: 0,
          partiallyPaid: 0
        });
      }
      
      // Try to get AR analytics (optional)
      try {
        const arController = new AbortController();
        const arTimeoutId = setTimeout(() => arController.abort(), 3000);
        
        const arRes = await axios.get(`${apiBaseUrl}/admin/analytics/accounts-receivable`, { 
          headers: { Authorization: `Bearer ${token}` },
          signal: arController.signal,
          timeout: 3000
        });
        
        clearTimeout(arTimeoutId);
        setArAnalytics(arRes.data);
      } catch (arError) {
        console.log('AR analytics unavailable, using empty data');
        setArAnalytics({
          totalAR: 0,
          current: 0,
          days30: 0,
          days60: 0,
          days90: 0,
          over90: 0,
          dso: 0,
          arTurnover: 0
        });
      }
    } catch (error: any) {
      console.error('Failed to fetch dashboard data', error);
      
      // Handle specific error types for better user experience
      if (error.response?.status === 401) {
        console.warn('Admin session expired, redirecting to login');
        localStorage.removeItem('adminToken');
        window.location.href = '/admin/login';
        return;
      }
      
      if (error.response?.status === 403) {
        console.warn('Admin access forbidden');
        setError('Access denied. Please check your admin permissions.');
        setLoading(false);
        return;
      }
      
      // For any other error, show dashboard with empty data
      console.log('Using empty data due to API error');
      setStats({
        users: 0,
        doctors: 0,
        labs: 0,
        clinics: 0,
        pharmacies: 0,
        hospitals: 0,
        corporates: 0
      });
      setRecentUsers([]);
      setCrm({ counts: { leads: 0, qualified: 0, proposal: 0, won: 0 }, openValue: 0, conversionRate: 0 });
      setPaymentAnalytics({
        totalRevenue: 0, monthlyRevenue: 0, pendingPayments: 0, overduePayments: 0,
        collectionRate: 0, avgPaymentTime: 0, revenueGrowth: 0, totalInvoices: 0,
        paidInvoices: 0, unpaidInvoices: 0, partiallyPaid: 0
      });
      setArAnalytics({
        totalAR: 0, current: 0, days30: 0, days60: 0, days90: 0, over90: 0, dso: 0, arTurnover: 0
      });
      
      // Set error state for UI display
      setError('Unable to load dashboard data. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { 
      icon: Users, 
      label: 'Total Users', 
      value: stats?.users || 0, 
      color: 'text-blue-500', 
      bg: 'bg-gradient-to-br from-blue-500/10 to-cyan-500/10',
      border: 'border-blue-500/20',
      pattern: 'radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.05) 0%, transparent 50%)'
    },
    { 
      icon: Stethoscope, 
      label: 'Doctors', 
      value: stats?.doctors || 0, 
      color: 'text-green-500', 
      bg: 'bg-gradient-to-br from-green-500/10 to-emerald-500/10',
      border: 'border-green-500/20',
      pattern: 'radial-gradient(circle at 0% 0%, rgba(34, 197, 94, 0.05) 0%, transparent 50%)'
    },
    { 
      icon: Building2, 
      label: 'Hospitals', 
      value: stats?.hospitals || 0, 
      color: 'text-red-500', 
      bg: 'bg-gradient-to-br from-red-500/10 to-pink-500/10',
      border: 'border-red-500/20',
      pattern: 'radial-gradient(circle at 100% 0%, rgba(239, 68, 68, 0.05) 0%, transparent 50%)'
    },
    { 
      icon: FlaskConical, 
      label: 'Labs', 
      value: stats?.labs || 0, 
      color: 'text-purple-500', 
      bg: 'bg-gradient-to-br from-purple-500/10 to-violet-500/10',
      border: 'border-purple-500/20',
      pattern: 'radial-gradient(circle at 100% 0%, rgba(147, 51, 234, 0.05) 0%, transparent 50%)'
    },
    { 
      icon: Building2, 
      label: 'Clinics', 
      value: stats?.clinics || 0, 
      color: 'text-pink-500', 
      bg: 'bg-gradient-to-br from-pink-500/10 to-rose-500/10',
      border: 'border-pink-500/20',
      pattern: 'radial-gradient(circle at 0% 0%, rgba(236, 72, 153, 0.05) 0%, transparent 50%)'
    },
    { 
      icon: Pill, 
      label: 'Pharmacies', 
      value: stats?.pharmacies || 0, 
      color: 'text-orange-500', 
      bg: 'bg-gradient-to-br from-orange-500/10 to-red-500/10',
      border: 'border-orange-500/20',
      pattern: 'radial-gradient(circle at 0% 100%, rgba(249, 115, 22, 0.05) 0%, transparent 50%)'
    },
    { 
      icon: Building2, 
      label: 'Corporates', 
      value: stats?.corporates || 0, 
      color: 'text-indigo-500', 
      bg: 'bg-gradient-to-br from-indigo-500/10 to-blue-500/10',
      border: 'border-indigo-500/20',
      pattern: 'radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.05) 0%, transparent 50%)'
    },
  ];

  if (loading || isCheckingAuth) {
    return (
      <AdminLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">
              {isCheckingAuth ? 'Authenticating...' : 'Loading dashboard...'}
            </p>
            {/* Development: Skip loading button */}
            {import.meta.env.DEV && loading && !isCheckingAuth && (
              <button
                onClick={() => {
                  console.log('🚀 Skipping dashboard loading (dev mode)');
                  setStats({
                    users: 1250,
                    doctors: 89,
                    labs: 45,
                    clinics: 120,
                    pharmacies: 67,
                    hospitals: 125,
                    corporates: 23
                  });
                  setRecentUsers([
                    { id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com', createdAt: new Date().toISOString() }
                  ]);
                  setCrm({ counts: { leads: 45, qualified: 23, proposal: 12, won: 8 }, openValue: 125000, conversionRate: 18.2 });
                  setPaymentAnalytics({
                    totalRevenue: 8750000, monthlyRevenue: 1250000, pendingPayments: 425000, overduePayments: 145000,
                    collectionRate: 87.5, avgPaymentTime: 18, revenueGrowth: 12.3, totalInvoices: 342,
                    paidInvoices: 268, unpaidInvoices: 58, partiallyPaid: 16
                  });
                  setArAnalytics({
                    totalAR: 1450000, current: 680000, days30: 420000, days60: 230000, days90: 85000,
                    over90: 35000, dso: 42, arTurnover: 8.5
                  });
                  setLoading(false);
                }}
                className="mt-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm"
              >
                🚀 Skip Loading (Dev)
              </button>
            )}
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center max-w-md mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-red-800 mb-2">Dashboard Error</h3>
              <p className="text-red-600 mb-4">{error}</p>
              <button 
                onClick={() => { setError(null); setLoading(true); fetchDashboardData(); }}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto animate-in fade-in duration-700">
        {/* Welcome Section with gradient */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-500/5 to-purple-500/5 border border-blue-500/20 p-8 mb-8 backdrop-blur-xl">
          {/* Subtle background pattern */}
          <div className="absolute inset-0">
            <div className="absolute inset-0" style={{
              backgroundImage: `radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.03) 0%, transparent 25%)`,
              backgroundSize: '40px 40px',
              backgroundPosition: '0 0, 20px 20px'
            }} />
          </div>

          <div className="relative">
            <div className="flex items-center gap-4 mb-6">
              <div className="relative">
                <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20">
                  <Crown className="w-8 h-8 text-amber-500" />
                </div>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-1 flex items-center gap-2">
                  Admin Dashboard Overview
                  <Activity className="w-7 h-7 text-blue-500" />
                </h1>
                <p className="text-muted-foreground text-lg">
                  Healthcare Management System Control Center
                </p>
              </div>
            </div>
          </div>

          {/* Subtle decorative elements */}
          <div className="absolute -right-16 -top-16 opacity-[0.02] pointer-events-none">
            <Plus className="w-48 h-48 text-blue-500 rotate-12" />
          </div>
          <div className="absolute -left-16 -bottom-16 opacity-[0.02] pointer-events-none">
            <Plus className="w-48 h-48 text-purple-500 -rotate-12" />
          </div>
        </div>

        {/* Stats Grid with gradient cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className={`
                h-full transition-all duration-500 group
                hover:shadow-xl ${stat.bg} border ${stat.border}
                backdrop-blur-xl relative overflow-hidden
                transform hover:-translate-y-1
              `}>
                <div className="absolute inset-0" style={{ background: stat.pattern }} />
                <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                  <div className={`
                    p-3 rounded-xl ${stat.bg} ${stat.border}
                    transform transition-transform duration-300
                    group-hover:scale-110 group-hover:rotate-3
                  `}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent className="relative">
                  <div className="text-3xl font-bold mb-2">{stat.value.toLocaleString()}</div>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <CheckCircle2 className={`w-3 h-3 mr-1 ${stat.color}`} />
                    System Active
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* CRM Snapshot with gradient */}
        {crm && (
          <Card className="group transition-all duration-500 hover:shadow-xl bg-gradient-to-br from-cyan-500/5 to-blue-500/5 border border-cyan-500/20 backdrop-blur-xl relative overflow-hidden transform hover:-translate-y-1 mb-8">
            <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 100% 100%, rgba(6, 182, 212, 0.05) 0%, transparent 50%)' }} />
            <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-cyan-500" />
                CRM Performance
              </CardTitle>
              <a href="/admin/crm" className="text-xs text-cyan-600 hover:text-cyan-700 hover:underline flex items-center group/link">
                Open CRM 
                <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover/link:translate-x-1" />
              </a>
            </CardHeader>
            <CardContent className="relative">
              <div className="grid gap-6 sm:grid-cols-3">
                <div className="text-center sm:text-left">
                  <div className="text-xs text-muted-foreground mb-1">Open Pipeline Value</div>
                  <div className="text-2xl font-bold text-cyan-600">₹{(crm.openValue || 0).toLocaleString()}</div>
                </div>
                <div className="text-center sm:text-left">
                  <div className="text-xs text-muted-foreground mb-1">Conversion Rate</div>
                  <div className="text-2xl font-bold text-green-600">{(crm.conversionRate || 0)}%</div>
                </div>
                <div className="text-center sm:text-left">
                  <div className="text-xs text-muted-foreground mb-1">Open Leads</div>
                  <div className="text-2xl font-bold text-purple-600">{(crm.counts?.New||0)+(crm.counts?.Qualified||0)+(crm.counts?.Proposal||0)+(crm.counts?.Negotiation||0)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payment & Billing Analytics */}
        {paymentAnalytics && (
          <Card className="group transition-all duration-500 hover:shadow-xl bg-gradient-to-br from-emerald-500/5 to-green-500/5 border border-emerald-500/20 backdrop-blur-xl relative overflow-hidden transform hover:-translate-y-1 mb-8">
            <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 0% 100%, rgba(16, 185, 129, 0.05) 0%, transparent 50%)' }} />
            <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <IndianRupee className="h-5 w-5 text-emerald-500" />
                Payment & Billing Analytics
              </CardTitle>
              <a href="/admin/billing" className="text-xs text-emerald-600 hover:text-emerald-700 hover:underline flex items-center group/link">
                View Details
                <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover/link:translate-x-1" />
              </a>
            </CardHeader>
            <CardContent className="relative space-y-6">
              {/* Revenue Overview */}
              <div className="grid gap-4 md:grid-cols-4">
                <div className="p-4 rounded-lg bg-gradient-to-br from-emerald-500/10 to-green-500/10 border border-emerald-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Total Revenue</span>
                    <DollarSign className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="text-2xl font-bold text-emerald-600">₹{(paymentAnalytics.totalRevenue / 100000).toFixed(1)}L</div>
                  <div className="flex items-center text-xs text-emerald-600 mt-1">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    +{paymentAnalytics.revenueGrowth}% growth
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Monthly Revenue</span>
                    <Calendar className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="text-2xl font-bold text-blue-600">₹{(paymentAnalytics.monthlyRevenue / 100000).toFixed(1)}L</div>
                  <div className="text-xs text-muted-foreground mt-1">Current month</div>
                </div>

                <div className="p-4 rounded-lg bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Pending</span>
                    <Clock className="h-4 w-4 text-yellow-500" />
                  </div>
                  <div className="text-2xl font-bold text-yellow-600">₹{(paymentAnalytics.pendingPayments / 1000).toFixed(0)}K</div>
                  <div className="text-xs text-muted-foreground mt-1">{paymentAnalytics.unpaidInvoices} invoices</div>
                </div>

                <div className="p-4 rounded-lg bg-gradient-to-br from-red-500/10 to-pink-500/10 border border-red-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Overdue</span>
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  </div>
                  <div className="text-2xl font-bold text-red-600">₹{(paymentAnalytics.overduePayments / 1000).toFixed(0)}K</div>
                  <div className="text-xs text-red-600 mt-1">Requires attention</div>
                </div>
              </div>

              {/* Payment Metrics */}
              <div className="grid gap-4 md:grid-cols-3 border-t border-border/50 pt-4">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">Collection Rate</div>
                  <div className="text-3xl font-bold text-green-600">{paymentAnalytics.collectionRate}%</div>
                  <div className="text-xs text-muted-foreground mt-1">{paymentAnalytics.paidInvoices}/{paymentAnalytics.totalInvoices} paid</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">Avg Payment Time</div>
                  <div className="text-3xl font-bold text-blue-600">{paymentAnalytics.avgPaymentTime}</div>
                  <div className="text-xs text-muted-foreground mt-1">days</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">Partially Paid</div>
                  <div className="text-3xl font-bold text-orange-600">{paymentAnalytics.partiallyPaid}</div>
                  <div className="text-xs text-muted-foreground mt-1">invoices</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Accounts Receivable (AR) Analytics */}
        {arAnalytics && (
          <Card className="group transition-all duration-500 hover:shadow-xl bg-gradient-to-br from-purple-500/5 to-indigo-500/5 border border-purple-500/20 backdrop-blur-xl relative overflow-hidden transform hover:-translate-y-1 mb-8">
            <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 100% 0%, rgba(147, 51, 234, 0.05) 0%, transparent 50%)' }} />
            <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Receipt className="h-5 w-5 text-purple-500" />
                Accounts Receivable (AR) Aging
              </CardTitle>
              <a href="/admin/accounting" className="text-xs text-purple-600 hover:text-purple-700 hover:underline flex items-center group/link">
                View Reports
                <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover/link:translate-x-1" />
              </a>
            </CardHeader>
            <CardContent className="relative space-y-6">
              {/* AR Overview */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 rounded-lg bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border border-purple-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Total AR</span>
                    <CreditCard className="h-4 w-4 text-purple-500" />
                  </div>
                  <div className="text-3xl font-bold text-purple-600">₹{(arAnalytics.totalAR / 100000).toFixed(2)}L</div>
                  <div className="text-xs text-muted-foreground mt-1">Outstanding receivables</div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
                    <div className="text-xs text-muted-foreground mb-1">DSO</div>
                    <div className="text-2xl font-bold text-blue-600">{arAnalytics.dso}</div>
                    <div className="text-xs text-muted-foreground">days</div>
                  </div>
                  <div className="p-3 rounded-lg bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20">
                    <div className="text-xs text-muted-foreground mb-1">AR Turnover</div>
                    <div className="text-2xl font-bold text-green-600">{arAnalytics.arTurnover}x</div>
                    <div className="text-xs text-muted-foreground">annually</div>
                  </div>
                </div>
              </div>

              {/* AR Aging Breakdown */}
              <div className="border-t border-border/50 pt-4">
                <h4 className="text-sm font-semibold mb-4">Aging Breakdown</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span className="text-sm font-medium">Current (0-30 days)</span>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-green-600">₹{(arAnalytics.current / 1000).toFixed(0)}K</div>
                      <div className="text-xs text-muted-foreground">{((arAnalytics.current / arAnalytics.totalAR) * 100).toFixed(1)}%</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                      <span className="text-sm font-medium">31-60 days</span>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-yellow-600">₹{(arAnalytics.days30 / 1000).toFixed(0)}K</div>
                      <div className="text-xs text-muted-foreground">{((arAnalytics.days30 / arAnalytics.totalAR) * 100).toFixed(1)}%</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                      <span className="text-sm font-medium">61-90 days</span>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-orange-600">₹{(arAnalytics.days60 / 1000).toFixed(0)}K</div>
                      <div className="text-xs text-muted-foreground">{((arAnalytics.days60 / arAnalytics.totalAR) * 100).toFixed(1)}%</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-red-500"></div>
                      <span className="text-sm font-medium">Over 90 days</span>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-red-600">₹{(arAnalytics.over90 / 1000).toFixed(0)}K</div>
                      <div className="text-xs text-red-600">{((arAnalytics.over90 / arAnalytics.totalAR) * 100).toFixed(1)}% - Critical</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Users with gradient */}
        <Card className="group transition-all duration-500 hover:shadow-xl bg-gradient-to-br from-green-500/5 to-emerald-500/5 border border-green-500/20 backdrop-blur-xl relative overflow-hidden transform hover:-translate-y-1 mb-8">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 0% 0%, rgba(34, 197, 94, 0.05) 0%, transparent 50%)' }} />
          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-green-500" />
              Recent Users
            </CardTitle>
          </CardHeader>
          <CardContent className="relative">
            {recentUsers.length === 0 ? (
              <div className="text-center py-8">
                <HeartPulse className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <p className="text-sm text-muted-foreground">No recent users</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-background/50 to-background/30 border border-border/50 hover:bg-accent/50 transition-all duration-300 group/user">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 flex items-center justify-center">
                        <Users className="h-4 w-4 text-green-500" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{user.firstName} {user.lastName}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </span>
                      <div className="flex items-center text-xs text-green-500 mt-1">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Active
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions with gradient cards */}
        <Card className="group transition-all duration-500 hover:shadow-xl bg-gradient-to-br from-purple-500/5 to-pink-500/5 border border-purple-500/20 backdrop-blur-xl relative overflow-hidden transform hover:-translate-y-1">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 100% 0%, rgba(147, 51, 234, 0.05) 0%, transparent 50%)' }} />
          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-purple-500" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="relative">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <button
                onClick={() => window.location.href = '/admin/doctors'}
                className="group/action flex flex-col items-center gap-3 rounded-xl p-6 hover:bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 hover:border-green-500/30 transition-all duration-300 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-500/5 to-transparent opacity-0 group-hover/action:opacity-100 transition-opacity duration-300" />
                <div className="p-3 rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 relative transform transition-transform duration-300 group-hover/action:scale-110 group-hover/action:rotate-3">
                  <Stethoscope className="h-8 w-8 text-green-500" />
                </div>
                <span className="text-sm font-medium relative">Manage Doctors</span>
              </button>
              <button
                onClick={() => window.location.href = '/admin/labs'}
                className="group/action flex flex-col items-center gap-3 rounded-xl p-6 hover:bg-gradient-to-br from-purple-500/10 to-violet-500/10 border border-purple-500/20 hover:border-purple-500/30 transition-all duration-300 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/5 to-transparent opacity-0 group-hover/action:opacity-100 transition-opacity duration-300" />
                <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/10 to-violet-500/10 border border-purple-500/20 relative transform transition-transform duration-300 group-hover/action:scale-110 group-hover/action:rotate-3">
                  <FlaskConical className="h-8 w-8 text-purple-500" />
                </div>
                <span className="text-sm font-medium relative">Manage Labs</span>
              </button>
              <button
                onClick={() => window.location.href = '/admin/pharmacies'}
                className="group/action flex flex-col items-center gap-3 rounded-xl p-6 hover:bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20 hover:border-orange-500/30 transition-all duration-300 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-500/5 to-transparent opacity-0 group-hover/action:opacity-100 transition-opacity duration-300" />
                <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20 relative transform transition-transform duration-300 group-hover/action:scale-110 group-hover/action:rotate-3">
                  <Pill className="h-8 w-8 text-orange-500" />
                </div>
                <span className="text-sm font-medium relative">Manage Pharmacies</span>
              </button>
              <button
                onClick={() => window.location.href = '/admin/corporates'}
                className="group/action flex flex-col items-center gap-3 rounded-xl p-6 hover:bg-gradient-to-br from-indigo-500/10 to-blue-500/10 border border-indigo-500/20 hover:border-indigo-500/30 transition-all duration-300 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/5 to-transparent opacity-0 group-hover/action:opacity-100 transition-opacity duration-300" />
                <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500/10 to-blue-500/10 border border-indigo-500/20 relative transform transition-transform duration-300 group-hover/action:scale-110 group-hover/action:rotate-3">
                  <Building2 className="h-8 w-8 text-indigo-500" />
                </div>
                <span className="text-sm font-medium relative">Manage Corporates</span>
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboardHome;
