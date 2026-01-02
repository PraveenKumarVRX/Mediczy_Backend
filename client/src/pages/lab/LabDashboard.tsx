import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  TestTube, Calendar, Users, FileText, DollarSign, Clock, 
  TrendingUp, Activity, Plus, Search, Filter, Download,
  Microscope, CheckCircle, AlertCircle, Package, ClipboardList,
  ArrowRight, Timer, Beaker, Edit, Trash2, Eye, CreditCard,
  BarChart3, UserCog, Bell, Settings, HelpCircle, Phone, Mail,
  MapPin, AlertTriangle, TrendingDown, Receipt, Star, ChevronRight,
  Zap, Sparkles, FlaskConical, Heart, Brain, Droplets, Baby, 
  Pill, Bone, Shield, Stethoscope, BookOpen, ShoppingCart, Info,
  ChevronDown, Check
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import LabLayout from '@/components/lab/LabLayout';
import { cn } from '@/lib/utils';

const LabDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [labData, setLabData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pendingFilterOpen, setPendingFilterOpen] = useState(false);
  const [pendingFilters, setPendingFilters] = useState({ query: '', priority: 'All', status: 'All' });
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  type Priority = 'Routine' | 'Normal' | 'Urgent';
  type OrderStatus = 'Pending' | 'Processing' | 'Completed';
  type SampleStatus = 'Pending' | 'Collected' | 'Processing' | 'Completed';
  type ReportStatus = 'Ready' | 'Delivered';

  type LabOrder = {
    id: string;
    patientName: string;
    tests: string;
    status: OrderStatus;
    priority: Priority;
    orderedAt: string;
  };

  type LabSample = {
    sampleId: string;
    patientName: string;
    tests: string;
    priority: Priority;
    status: SampleStatus;
    collectedAt?: string;
  };

  type ReportItem = {
    id: string;
    patientName: string;
    tests: string;
    generatedAt: string;
    status: ReportStatus;
  };

  type InventoryItem = {
    code: string;
    name: string;
    category: string;
    stock: number;
    expiry?: string;
  };

  type NotificationItem = {
    id: string;
    title: string;
    description: string;
    level: 'Critical' | 'Info';
    createdAt: string;
    read: boolean;
  };

  type BillItem = {
    id: string;
    patientName: string;
    amount: number;
    status: 'Paid' | 'Unpaid';
    date: string;
  };

  type PendingTestRow = {
    id: string;
    patient: string;
    test: string;
    priority: Priority;
    time: string;
    status: 'Processing' | 'Sample Collected' | 'Pending Collection';
  };

  function readJson<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  function writeJson<T>(key: string, value: T) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }

  const formatWhen = (value?: string) => {
    if (!value) return '—';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const priorityRank: Record<Priority, number> = { Urgent: 0, Normal: 1, Routine: 2 };

  const mapSampleStatus = (s: SampleStatus): PendingTestRow['status'] | null => {
    if (s === 'Processing') return 'Processing';
    if (s === 'Collected') return 'Sample Collected';
    if (s === 'Pending') return 'Pending Collection';
    return null;
  };

  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [samples, setSamples] = useState<LabSample[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [bills, setBills] = useState<BillItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('labToken');
    const data = localStorage.getItem('labData');

    if (!token) {
      navigate('/lab/login');
      return;
    }

    if (data) {
      try {
        setLabData(JSON.parse(data));
      } catch {
        setLabData(null);
      }
    }

    // Refresh dashboard datasets whenever route changes (so dashboard reflects actions
    // performed in orders/samples/reports pages during this session).
    setOrders(readJson<LabOrder[]>('lab.orders', []));
    setSamples(readJson<LabSample[]>('lab.samples', []));
    setReports(readJson<ReportItem[]>('lab.reports', []));
    setBills(readJson<BillItem[]>('lab.bills', []));
    setInventory(readJson<InventoryItem[]>('lab.inventory', []));
    setNotifications(readJson<NotificationItem[]>('lab.notifications', []));

    setLoading(false);
  }, [navigate, location.pathname]);

  useEffect(() => {
    writeJson('lab.notifications', notifications);
  }, [notifications]);

  // All useMemo hooks MUST be called before any early returns (React Rules of Hooks)
  const today = new Date().toISOString().slice(0, 10);
  const testsToday = orders.filter((o) => o.orderedAt === today).length;
  const pendingSamples = samples.filter((s) => s.status !== 'Completed').length;
  const reportsReady = reports.filter((r) => r.status === 'Ready').length;
  const revenueToday = bills.filter((b) => b.date === today).reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

  // Stats with modern design matching doctor dashboard
  const displayStats = [
    { 
      title: 'Tests Today', 
      value: String(testsToday || 48), 
      icon: TestTube, 
      trend: 18,
      trendLabel: 'vs last week',
      bgColor: 'bg-emerald-500/10',
      iconColor: 'text-emerald-500',
    },
    { 
      title: 'Pending Samples', 
      value: String(pendingSamples || 12), 
      icon: Beaker, 
      trend: -5,
      trendLabel: 'vs yesterday',
      bgColor: 'bg-orange-500/10',
      iconColor: 'text-orange-500',
    },
    { 
      title: 'Reports Ready', 
      value: String(reportsReady || 36), 
      icon: FileText, 
      trend: 12,
      trendLabel: 'this week',
      bgColor: 'bg-blue-500/10',
      iconColor: 'text-blue-500',
    },
    { 
      title: "Today's Revenue", 
      value: revenueToday > 0 ? `₹${(revenueToday / 1000).toFixed(1)}K` : '₹24.5K', 
      icon: DollarSign, 
      trend: 22,
      trendLabel: 'vs last week',
      bgColor: 'bg-purple-500/10',
      iconColor: 'text-purple-500',
    },
  ];

  const pendingTests = useMemo<PendingTestRow[]>(() => {
    const fromSamples: PendingTestRow[] = samples
      .map((s) => {
        const mapped = mapSampleStatus(s.status);
        if (!mapped) return null;
        return {
          id: s.sampleId,
          patient: s.patientName,
          test: s.tests,
          priority: s.priority,
          time: formatWhen(s.collectedAt),
          status: mapped,
        } satisfies PendingTestRow;
      })
      .filter(Boolean) as PendingTestRow[];

    const fromOrders: PendingTestRow[] = orders
      .filter((o) => o.status !== 'Completed')
      .map((o) => ({
        id: o.id,
        patient: o.patientName,
        test: o.tests,
        priority: o.priority,
        time: formatWhen(o.orderedAt),
        status: o.status === 'Processing' ? 'Processing' : 'Pending Collection',
      }));

    return [...fromSamples, ...fromOrders].sort((a, b) => {
      const pr = priorityRank[a.priority] - priorityRank[b.priority];
      if (pr !== 0) return pr;
      return a.id.localeCompare(b.id);
    });
  }, [orders, samples]);

  const filteredPendingTests = pendingTests.filter((t) => {
    const q = pendingFilters.query.trim().toLowerCase();
    if (q) {
      const hay = `${t.id} ${t.patient} ${t.test} ${t.priority} ${t.status}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (pendingFilters.priority !== 'All' && t.priority !== pendingFilters.priority) return false;
    if (pendingFilters.status !== 'All' && t.status !== pendingFilters.status) return false;
    return true;
  });

  const recentReports = useMemo(() => {
    return [...reports]
      .sort((a, b) => (b.generatedAt || '').localeCompare(a.generatedAt || ''))
      .slice(0, 4)
      .map((r) => ({
        id: r.id,
        patient: r.patientName,
        test: r.tests,
        status: r.status,
        time: formatWhen(r.generatedAt),
      }));
  }, [reports]);

  const inventoryAlerts = useMemo(() => {
    // The inventory model doesn't include a minimum threshold; use a small
    // reasonable default for alerting.
    const minimum = 50;
    const warnAt = 75;

    const statusRank: Record<'Low' | 'Warning' | 'OK', number> = { Low: 0, Warning: 1, OK: 2 };

    return inventory
      .map((i) => {
        const current = Number(i.stock) || 0;
        const status: 'Low' | 'Warning' | 'OK' = current < minimum ? 'Low' : current < warnAt ? 'Warning' : 'OK';
        return { item: i.name, current, minimum, status };
      })
      .filter((x) => x.status !== 'OK')
      .sort((a, b) => {
        const sr = statusRank[a.status] - statusRank[b.status];
        if (sr !== 0) return sr;
        return a.current - b.current;
      })
      .slice(0, 4);
  }, [inventory]);

  const todaysSummary = useMemo(() => {
    const total = orders.length;
    const completed = orders.filter((o) => o.status === 'Completed').length;
    const inProgress = orders.filter((o) => o.status === 'Processing').length;
    const pending = orders.filter((o) => o.status === 'Pending').length;
    return { total, completed, inProgress, pending };
  }, [orders]);

  const notificationBuckets = useMemo(() => {
    const isOrder = (n: NotificationItem) => /order/i.test(`${n.title} ${n.description}`);
    const isInventory = (n: NotificationItem) => /inventory|stock|reorder|item/i.test(`${n.title} ${n.description}`);
    return {
      all: [...notifications].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
      urgent: notifications.filter((n) => n.level === 'Critical'),
      orders: notifications.filter(isOrder),
      inventory: notifications.filter(isInventory),
    };
  }, [notifications]);

  // Quick actions with modern design matching doctor dashboard
  const quickActions = [
    { 
      title: 'New Test Order', 
      description: 'Create a new order',
      icon: Plus, 
      link: '/lab/orders/new',
      bgColor: 'bg-emerald-500/10 dark:bg-emerald-500/20',
      iconColor: 'text-emerald-500',
    },
    { 
      title: 'Sample Collection', 
      description: 'Collect patient samples',
      icon: TestTube, 
      link: '/lab/samples',
      bgColor: 'bg-blue-500/10 dark:bg-blue-500/20',
      iconColor: 'text-blue-500',
    },
    { 
      title: 'Enter Results', 
      description: 'Input test results',
      icon: ClipboardList, 
      link: '/lab/results',
      bgColor: 'bg-purple-500/10 dark:bg-purple-500/20',
      iconColor: 'text-purple-500',
    },
    { 
      title: 'View Reports', 
      description: 'Access lab reports',
      icon: FileText, 
      link: '/lab/reports',
      bgColor: 'bg-orange-500/10 dark:bg-orange-500/20',
      iconColor: 'text-orange-500',
    },
  ];

  // Loading state check - placed after all hooks per React Rules of Hooks
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Activity className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  // Route-aware content rendering
  const renderContent = () => {
    const path = location.pathname;
    
    // Dashboard - default view
    if (path === '/lab/dashboard') {
      return renderDashboardContent();
    }
    // Test Catalog - Master Tests Menu
    else if (path === '/lab/test-catalog') {
      return renderTestCatalogContent();
    }
    // Test Orders
    else if (path.startsWith('/lab/orders')) {
      return renderOrdersContent();
    }
    // Patients
    else if (path === '/lab/patients') {
      return renderPatientsContent();
    }
    // Appointments
    else if (path === '/lab/appointments') {
      return renderAppointmentsContent();
    }
    // Sample Queue
    else if (path === '/lab/queue') {
      return renderQueueContent();
    }
    // Sample Collection
    else if (path === '/lab/samples') {
      return renderSamplesContent();
    }
    // Processing
    else if (path === '/lab/processing') {
      return renderProcessingContent();
    }
    // Results Entry
    else if (path === '/lab/results') {
      return renderResultsContent();
    }
    // Reports
    else if (path === '/lab/reports') {
      return renderReportsContent();
    }
    // Inventory
    else if (path === '/lab/inventory') {
      return renderInventoryContent();
    }
    // Billing
    else if (path === '/lab/billing') {
      return renderBillingContent();
    }
    // Payments
    else if (path === '/lab/payments') {
      return renderPaymentsContent();
    }
    // Analytics
    else if (path === '/lab/analytics') {
      return renderAnalyticsContent();
    }
    // Staff
    else if (path === '/lab/staff') {
      return renderStaffContent();
    }
    // Notifications
    else if (path === '/lab/notifications') {
      return renderNotificationsContent();
    }
    // Settings
    else if (path === '/lab/settings') {
      return renderSettingsContent();
    }
    // Support
    else if (path === '/lab/support') {
      return renderSupportContent();
    }
    // Default to dashboard
    return renderDashboardContent();
  };

  const renderDashboardContent = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Hero Banner - matching doctor dashboard design */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6 md:p-8 text-white shadow-2xl">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L2c+PC9zdmc+')] opacity-30" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-emerald-500/20 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-teal-400/10 to-transparent rounded-full blur-2xl" />
        
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16 border-2 border-white/20 shadow-xl">
              <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xl">
                {labData?.name?.[0] || 'L'}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/30">
                  <FlaskConical className="w-5 h-5" />
                </div>
                <Badge className="bg-white/10 text-white/90 border-white/20 font-medium">
                  {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </Badge>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-1">
                {getGreeting()}, {labData?.name || 'Lab Admin'}!
              </h1>
              <p className="text-slate-300 text-sm md:text-base flex items-center gap-2">
                <span>Laboratory Management Portal</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span className="flex items-center gap-1">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  {displayStats[0].value} tests today
                </span>
              </p>
            </div>
          </div>
          
          <div className="flex gap-3">
            <Link to="/lab/orders">
              <Button variant="outline" className="bg-white/10 hover:bg-white/20 text-white border-white/20 hover:border-white/30">
                <ClipboardList className="w-4 h-4 mr-2" />
                Test Orders
              </Button>
            </Link>
            <Link to="/lab/samples">
              <Button className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/30 border-0">
                <TestTube className="w-4 h-4 mr-2" />
                Start Collection
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid - matching doctor dashboard design */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {displayStats.map((stat, index) => (
          <Card 
            key={index} 
            className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-emerald-200 dark:hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 overflow-hidden group"
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className={cn("p-2 rounded-xl transition-colors", stat.bgColor, "group-hover:bg-emerald-500/20")}>
                  <stat.icon className={cn("w-5 h-5 transition-colors", stat.iconColor, "group-hover:text-emerald-500")} />
                </div>
                <Badge variant="outline" className={cn(
                  "text-xs border",
                  stat.trend >= 0 
                    ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700" 
                    : "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700"
                )}>
                  {stat.trend >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                  {stat.trend >= 0 ? "+" : ""}{stat.trend}%
                </Badge>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">{stat.title}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-slate-800 dark:text-white">{stat.value}</span>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{stat.trendLabel}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions - matching doctor dashboard design */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            Quick Actions
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickActions.map((action, index) => (
            <Link key={index} to={action.link} className="group">
              <Card className="h-full bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-emerald-200 dark:hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-300">
                <CardContent className="p-4">
                  <div className={cn("p-3 rounded-xl w-fit mb-3 transition-all duration-300", action.bgColor, "group-hover:scale-110")}>
                    <action.icon className={cn("w-6 h-6", action.iconColor)} />
                  </div>
                  <h3 className="font-semibold text-slate-800 dark:text-white mb-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    {action.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{action.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Tests - styled like doctor's Today's Schedule */}
        <Card className="lg:col-span-2 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="w-5 h-5 text-emerald-500" />
                Pending Tests
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700" onClick={() => setPendingFilterOpen(true)}>
                <Filter className="w-4 h-4 mr-1" />
                Filter
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {filteredPendingTests.length > 0 ? (
              <div className="space-y-3">
                {filteredPendingTests.slice(0, 5).map((test) => (
                  <div 
                    key={test.id}
                    className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors group"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className={cn(
                        "text-white text-sm",
                        test.priority === 'Urgent' 
                          ? "bg-gradient-to-br from-red-500 to-red-600"
                          : test.priority === 'Normal'
                          ? "bg-gradient-to-br from-blue-500 to-blue-600"
                          : "bg-gradient-to-br from-slate-500 to-slate-600"
                      )}>
                        {test.patient?.split(' ').map((n: string) => n[0]).join('') || 'P'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 dark:text-white truncate">
                        {test.patient}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <TestTube className="w-3 h-3" />
                        {test.test}
                        <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                        {test.time}
                      </p>
                    </div>
                    <Badge variant={test.priority === "Urgent" ? "destructive" : "default"} className={cn(
                      test.priority === "Urgent" 
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" 
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    )}>
                      {test.priority}
                    </Badge>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <TestTube className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-slate-500 dark:text-slate-400">No pending tests</p>
                <Link to="/lab/orders/new">
                  <Button variant="outline" size="sm" className="mt-3">
                    Create New Order
                  </Button>
                </Link>
              </div>
            )}
            <Link to="/lab/orders">
              <Button variant="ghost" className="w-full mt-4 text-emerald-600 hover:text-emerald-700">
                View All Pending Tests <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Alerts & Recent Reports */}
        <div className="space-y-6">
          {/* Recent Reports */}
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="w-5 h-5 text-blue-500" />
                Recent Reports
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentReports.length > 0 ? recentReports.map((report) => (
                  <div key={report.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                        <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-slate-800 dark:text-white">{report.patient}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{report.test}</p>
                      </div>
                    </div>
                    <Badge variant={report.status === "Delivered" ? "secondary" : "default"} className="text-xs">
                      {report.status}
                    </Badge>
                  </div>
                )) : (
                  <div className="text-center py-4 text-slate-500 text-sm">No recent reports</div>
                )}
              </div>
              <Link to="/lab/reports">
                <Button variant="ghost" className="w-full mt-3 text-blue-600 hover:text-blue-700" size="sm">
                  View All Reports <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Dialog open={pendingFilterOpen} onOpenChange={setPendingFilterOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Filter Pending Tests</DialogTitle>
                <DialogDescription>Search by patient, test, ID, priority, or status.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Search</Label>
                  <Input
                    value={pendingFilters.query}
                    onChange={(e) => setPendingFilters((p) => ({ ...p, query: e.target.value }))}
                    placeholder="e.g. Rajesh, CBC, TST001"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select
                      value={pendingFilters.priority}
                      onValueChange={(v) => setPendingFilters((p) => ({ ...p, priority: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All">All</SelectItem>
                        <SelectItem value="Urgent">Urgent</SelectItem>
                        <SelectItem value="Normal">Normal</SelectItem>
                        <SelectItem value="Routine">Routine</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={pendingFilters.status}
                      onValueChange={(v) => setPendingFilters((p) => ({ ...p, status: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All">All</SelectItem>
                        <SelectItem value="Processing">Processing</SelectItem>
                        <SelectItem value="Sample Collected">Sample Collected</SelectItem>
                        <SelectItem value="Pending Collection">Pending Collection</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPendingFilters({ query: '', priority: 'All', status: 'All' });
                    toast({ title: 'Filters cleared' });
                  }}
                >
                  Clear
                </Button>
                <Button
                  onClick={() => {
                    setPendingFilterOpen(false);
                    toast({ title: 'Filters applied', description: `${filteredPendingTests.length} match(es).` });
                  }}
                >
                  Apply
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Inventory Alerts - styled consistently */}
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="h-5 w-5 text-orange-500" />
                Inventory Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {inventoryAlerts.length > 0 ? inventoryAlerts.map((item) => (
                  <div key={item.item} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-slate-800 dark:text-white">{item.item}</span>
                      <Badge
                        className={cn(
                          "text-xs",
                          item.status === 'Low' 
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' 
                            : item.status === 'Warning' 
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' 
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        )}
                      >
                        {item.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={Math.min(100, (item.current / item.minimum) * 100)} className="h-2 flex-1" />
                      <span className="text-xs text-slate-500 dark:text-slate-400 w-16 text-right">{item.current}/{item.minimum}</span>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-4 text-slate-500 text-sm">No inventory alerts</div>
                )}
              </div>
              <Link to="/lab/inventory">
                <Button variant="ghost" className="w-full mt-4 text-emerald-600 hover:text-emerald-700" size="sm">
                  Manage Inventory <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Today's Performance Summary - styled like doctor's quick stats */}
      <Card className="mt-6 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-emerald-200/50 dark:border-emerald-700/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-500" />
            Today's Performance Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-4 bg-white/80 dark:bg-slate-800/50 rounded-xl shadow-sm">
              <div className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">{todaysSummary.total}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">Total Tests</div>
            </div>
            <div className="text-center p-4 bg-white/80 dark:bg-slate-800/50 rounded-xl shadow-sm">
              <div className="text-3xl font-bold text-blue-600">{todaysSummary.completed}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">Completed</div>
            </div>
            <div className="text-center p-4 bg-white/80 dark:bg-slate-800/50 rounded-xl shadow-sm">
              <div className="text-3xl font-bold text-amber-600">{todaysSummary.inProgress}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">In Progress</div>
            </div>
            <div className="text-center p-4 bg-white/80 dark:bg-slate-800/50 rounded-xl shadow-sm">
              <div className="text-3xl font-bold text-red-600">{todaysSummary.pending}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">Pending</div>
            </div>
            <div className="text-center p-4 bg-white/80 dark:bg-slate-800/50 rounded-xl shadow-sm">
              <div className="text-3xl font-bold text-purple-600">45 min</div>
              <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">Avg TAT</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Master Test Catalog Data
  const testCategories = [
    {
      id: 'blood',
      name: 'Blood Tests',
      icon: Droplets,
      color: 'text-red-500',
      bgColor: 'bg-red-50 dark:bg-red-500/10',
      borderColor: 'border-red-200 dark:border-red-500/30',
      tests: [
        { id: 'cbc', name: 'Complete Blood Count (CBC)', price: 350, duration: '4-6 hrs', popular: true, description: 'Measures red cells, white cells, hemoglobin, hematocrit, and platelets' },
        { id: 'hb', name: 'Hemoglobin (Hb)', price: 150, duration: '2-4 hrs', popular: true, description: 'Measures the protein in red blood cells that carries oxygen' },
        { id: 'esr', name: 'ESR (Erythrocyte Sedimentation Rate)', price: 200, duration: '1-2 hrs', description: 'Measures inflammation in the body' },
        { id: 'blood-group', name: 'Blood Group & Rh Factor', price: 250, duration: '1-2 hrs', popular: true, description: 'Determines ABO blood type and Rh factor' },
        { id: 'platelet', name: 'Platelet Count', price: 200, duration: '2-4 hrs', description: 'Measures clotting cells in blood' },
        { id: 'retic', name: 'Reticulocyte Count', price: 300, duration: '4-6 hrs', description: 'Measures young red blood cells' },
        { id: 'peripheral-smear', name: 'Peripheral Blood Smear', price: 400, duration: '4-6 hrs', description: 'Examines blood cells under microscope' },
        { id: 'hba1c', name: 'HbA1c (Glycated Hemoglobin)', price: 550, duration: '4-6 hrs', popular: true, description: '3-month average blood sugar level' },
      ]
    },
    {
      id: 'diabetes',
      name: 'Diabetes Profile',
      icon: Activity,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-500/10',
      borderColor: 'border-blue-200 dark:border-blue-500/30',
      tests: [
        { id: 'fbs', name: 'Fasting Blood Sugar (FBS)', price: 100, duration: '2-4 hrs', popular: true, description: 'Blood glucose after 8-12 hours fasting' },
        { id: 'ppbs', name: 'Post Prandial Blood Sugar (PPBS)', price: 100, duration: '2-4 hrs', popular: true, description: 'Blood glucose 2 hours after meal' },
        { id: 'rbs', name: 'Random Blood Sugar (RBS)', price: 100, duration: '1-2 hrs', description: 'Blood glucose at any time' },
        { id: 'ogtt', name: 'Oral Glucose Tolerance Test (OGTT)', price: 450, duration: '3-4 hrs', description: 'Measures glucose handling ability' },
        { id: 'fasting-insulin', name: 'Fasting Insulin', price: 800, duration: '24-48 hrs', description: 'Measures insulin levels while fasting' },
        { id: 'c-peptide', name: 'C-Peptide', price: 1200, duration: '24-48 hrs', description: 'Measures insulin production' },
        { id: 'gad-antibodies', name: 'GAD Antibodies', price: 2500, duration: '3-5 days', description: 'Detects Type 1 diabetes antibodies' },
      ]
    },
    {
      id: 'thyroid',
      name: 'Thyroid Profile',
      icon: Shield,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-500/10',
      borderColor: 'border-purple-200 dark:border-purple-500/30',
      tests: [
        { id: 'tsh', name: 'TSH (Thyroid Stimulating Hormone)', price: 350, duration: '4-6 hrs', popular: true, description: 'Primary thyroid function test' },
        { id: 't3', name: 'T3 (Triiodothyronine)', price: 300, duration: '4-6 hrs', description: 'Active thyroid hormone level' },
        { id: 't4', name: 'T4 (Thyroxine)', price: 300, duration: '4-6 hrs', description: 'Main thyroid hormone' },
        { id: 'ft3', name: 'Free T3', price: 400, duration: '4-6 hrs', description: 'Unbound active thyroid hormone' },
        { id: 'ft4', name: 'Free T4', price: 400, duration: '4-6 hrs', description: 'Unbound thyroxine' },
        { id: 'thyroid-profile', name: 'Thyroid Profile (T3, T4, TSH)', price: 800, duration: '4-6 hrs', popular: true, description: 'Complete thyroid panel' },
        { id: 'anti-tpo', name: 'Anti-TPO Antibodies', price: 900, duration: '24-48 hrs', description: 'Autoimmune thyroid marker' },
        { id: 'anti-tg', name: 'Anti-Thyroglobulin Antibodies', price: 900, duration: '24-48 hrs', description: 'Thyroid autoimmune marker' },
      ]
    },
    {
      id: 'liver',
      name: 'Liver Function',
      icon: Beaker,
      color: 'text-amber-500',
      bgColor: 'bg-amber-50 dark:bg-amber-500/10',
      borderColor: 'border-amber-200 dark:border-amber-500/30',
      tests: [
        { id: 'lft', name: 'Liver Function Test (LFT)', price: 650, duration: '4-6 hrs', popular: true, description: 'Complete liver panel including enzymes and proteins' },
        { id: 'sgot', name: 'SGOT / AST', price: 200, duration: '4-6 hrs', description: 'Liver enzyme test' },
        { id: 'sgpt', name: 'SGPT / ALT', price: 200, duration: '4-6 hrs', description: 'Liver enzyme test' },
        { id: 'alp', name: 'Alkaline Phosphatase (ALP)', price: 200, duration: '4-6 hrs', description: 'Bone and liver enzyme' },
        { id: 'bilirubin-total', name: 'Bilirubin (Total)', price: 150, duration: '4-6 hrs', description: 'Measures liver processing' },
        { id: 'bilirubin-direct', name: 'Bilirubin (Direct)', price: 150, duration: '4-6 hrs', description: 'Conjugated bilirubin level' },
        { id: 'albumin', name: 'Albumin', price: 200, duration: '4-6 hrs', description: 'Major blood protein' },
        { id: 'total-protein', name: 'Total Protein', price: 200, duration: '4-6 hrs', description: 'All proteins in blood' },
        { id: 'ggt', name: 'GGT (Gamma GT)', price: 350, duration: '4-6 hrs', description: 'Liver and bile duct enzyme' },
      ]
    },
    {
      id: 'kidney',
      name: 'Kidney Function',
      icon: Droplets,
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-50 dark:bg-cyan-500/10',
      borderColor: 'border-cyan-200 dark:border-cyan-500/30',
      tests: [
        { id: 'kft', name: 'Kidney Function Test (KFT/RFT)', price: 600, duration: '4-6 hrs', popular: true, description: 'Complete kidney panel' },
        { id: 'creatinine', name: 'Serum Creatinine', price: 200, duration: '4-6 hrs', popular: true, description: 'Kidney filtration marker' },
        { id: 'bun', name: 'Blood Urea Nitrogen (BUN)', price: 200, duration: '4-6 hrs', description: 'Kidney function indicator' },
        { id: 'uric-acid', name: 'Uric Acid', price: 250, duration: '4-6 hrs', description: 'Gout and kidney marker' },
        { id: 'egfr', name: 'eGFR (Estimated GFR)', price: 300, duration: '4-6 hrs', description: 'Kidney filtration rate' },
        { id: 'electrolytes', name: 'Electrolytes (Na, K, Cl)', price: 450, duration: '4-6 hrs', description: 'Sodium, Potassium, Chloride' },
        { id: 'calcium', name: 'Serum Calcium', price: 200, duration: '4-6 hrs', description: 'Blood calcium level' },
        { id: 'phosphorus', name: 'Serum Phosphorus', price: 200, duration: '4-6 hrs', description: 'Blood phosphorus level' },
      ]
    },
    {
      id: 'lipid',
      name: 'Lipid Profile',
      icon: Heart,
      color: 'text-pink-500',
      bgColor: 'bg-pink-50 dark:bg-pink-500/10',
      borderColor: 'border-pink-200 dark:border-pink-500/30',
      tests: [
        { id: 'lipid-profile', name: 'Lipid Profile (Complete)', price: 550, duration: '4-6 hrs', popular: true, description: 'Total Cholesterol, HDL, LDL, Triglycerides, VLDL' },
        { id: 'total-cholesterol', name: 'Total Cholesterol', price: 200, duration: '4-6 hrs', description: 'All cholesterol in blood' },
        { id: 'hdl', name: 'HDL Cholesterol (Good)', price: 200, duration: '4-6 hrs', description: 'Protective cholesterol' },
        { id: 'ldl', name: 'LDL Cholesterol (Bad)', price: 200, duration: '4-6 hrs', description: 'Harmful cholesterol' },
        { id: 'triglycerides', name: 'Triglycerides', price: 200, duration: '4-6 hrs', description: 'Blood fat level' },
        { id: 'vldl', name: 'VLDL Cholesterol', price: 200, duration: '4-6 hrs', description: 'Very low density lipoprotein' },
        { id: 'apo-a1', name: 'Apolipoprotein A1', price: 800, duration: '24-48 hrs', description: 'HDL protein marker' },
        { id: 'apo-b', name: 'Apolipoprotein B', price: 800, duration: '24-48 hrs', description: 'LDL protein marker' },
        { id: 'lp-a', name: 'Lipoprotein(a)', price: 1200, duration: '24-48 hrs', description: 'Genetic heart risk marker' },
      ]
    },
    {
      id: 'vitamin',
      name: 'Vitamins & Minerals',
      icon: Pill,
      color: 'text-orange-500',
      bgColor: 'bg-orange-50 dark:bg-orange-500/10',
      borderColor: 'border-orange-200 dark:border-orange-500/30',
      tests: [
        { id: 'vitamin-d', name: 'Vitamin D (25-OH)', price: 1200, duration: '24-48 hrs', popular: true, description: 'Bone health and immunity' },
        { id: 'vitamin-b12', name: 'Vitamin B12', price: 800, duration: '24-48 hrs', popular: true, description: 'Nerve and blood cell health' },
        { id: 'folate', name: 'Folate / Folic Acid', price: 800, duration: '24-48 hrs', description: 'Cell growth vitamin' },
        { id: 'iron-studies', name: 'Iron Studies (Complete)', price: 900, duration: '4-6 hrs', popular: true, description: 'Iron, TIBC, Ferritin, Transferrin' },
        { id: 'ferritin', name: 'Ferritin', price: 500, duration: '4-6 hrs', description: 'Iron storage protein' },
        { id: 'vitamin-a', name: 'Vitamin A', price: 1500, duration: '3-5 days', description: 'Vision and skin health' },
        { id: 'vitamin-e', name: 'Vitamin E', price: 1500, duration: '3-5 days', description: 'Antioxidant vitamin' },
        { id: 'zinc', name: 'Serum Zinc', price: 600, duration: '24-48 hrs', description: 'Immunity mineral' },
        { id: 'magnesium', name: 'Serum Magnesium', price: 400, duration: '4-6 hrs', description: 'Muscle and nerve function' },
      ]
    },
    {
      id: 'hormone',
      name: 'Hormone Tests',
      icon: Brain,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-50 dark:bg-indigo-500/10',
      borderColor: 'border-indigo-200 dark:border-indigo-500/30',
      tests: [
        { id: 'testosterone', name: 'Testosterone (Total)', price: 800, duration: '24-48 hrs', description: 'Male hormone level' },
        { id: 'free-testosterone', name: 'Testosterone (Free)', price: 1200, duration: '24-48 hrs', description: 'Active testosterone' },
        { id: 'estrogen', name: 'Estrogen (E2)', price: 900, duration: '24-48 hrs', description: 'Female hormone level' },
        { id: 'progesterone', name: 'Progesterone', price: 700, duration: '24-48 hrs', description: 'Pregnancy hormone' },
        { id: 'prolactin', name: 'Prolactin', price: 600, duration: '24-48 hrs', description: 'Milk production hormone' },
        { id: 'fsh', name: 'FSH (Follicle Stimulating)', price: 600, duration: '24-48 hrs', description: 'Fertility hormone' },
        { id: 'lh', name: 'LH (Luteinizing Hormone)', price: 600, duration: '24-48 hrs', description: 'Reproductive hormone' },
        { id: 'cortisol', name: 'Cortisol (Morning)', price: 700, duration: '24-48 hrs', description: 'Stress hormone' },
        { id: 'dhea-s', name: 'DHEA-Sulfate', price: 1000, duration: '24-48 hrs', description: 'Adrenal hormone' },
      ]
    },
    {
      id: 'cardiac',
      name: 'Cardiac Markers',
      icon: Heart,
      color: 'text-rose-500',
      bgColor: 'bg-rose-50 dark:bg-rose-500/10',
      borderColor: 'border-rose-200 dark:border-rose-500/30',
      tests: [
        { id: 'troponin', name: 'Troponin I / T', price: 1200, duration: '2-4 hrs', popular: true, description: 'Heart attack marker' },
        { id: 'cpk', name: 'CPK (Creatine Phosphokinase)', price: 400, duration: '4-6 hrs', description: 'Muscle damage marker' },
        { id: 'cpk-mb', name: 'CPK-MB', price: 600, duration: '4-6 hrs', description: 'Heart muscle specific' },
        { id: 'bnp', name: 'BNP / NT-proBNP', price: 2000, duration: '4-6 hrs', popular: true, description: 'Heart failure marker' },
        { id: 'homocysteine', name: 'Homocysteine', price: 1200, duration: '24-48 hrs', description: 'Heart disease risk factor' },
        { id: 'hs-crp', name: 'hs-CRP (High Sensitivity)', price: 800, duration: '4-6 hrs', description: 'Inflammation marker' },
        { id: 'd-dimer', name: 'D-Dimer', price: 1500, duration: '4-6 hrs', description: 'Blood clot marker' },
      ]
    },
    {
      id: 'infection',
      name: 'Infection Markers',
      icon: Shield,
      color: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-500/10',
      borderColor: 'border-green-200 dark:border-green-500/30',
      tests: [
        { id: 'crp', name: 'CRP (C-Reactive Protein)', price: 450, duration: '4-6 hrs', popular: true, description: 'General infection marker' },
        { id: 'procalcitonin', name: 'Procalcitonin', price: 2000, duration: '4-6 hrs', description: 'Bacterial infection marker' },
        { id: 'widal', name: 'Widal Test (Typhoid)', price: 350, duration: '4-6 hrs', description: 'Typhoid fever test' },
        { id: 'dengue-ns1', name: 'Dengue NS1 Antigen', price: 800, duration: '2-4 hrs', popular: true, description: 'Early dengue detection' },
        { id: 'dengue-igg-igm', name: 'Dengue IgG/IgM', price: 900, duration: '2-4 hrs', description: 'Dengue antibody test' },
        { id: 'malaria', name: 'Malaria Parasite (MP)', price: 200, duration: '2-4 hrs', description: 'Malaria detection' },
        { id: 'hiv', name: 'HIV 1 & 2 Antibody', price: 600, duration: '4-6 hrs', description: 'HIV screening test' },
        { id: 'hbsag', name: 'HBsAg (Hepatitis B)', price: 400, duration: '4-6 hrs', description: 'Hepatitis B surface antigen' },
        { id: 'hcv', name: 'HCV Antibody (Hepatitis C)', price: 700, duration: '4-6 hrs', description: 'Hepatitis C screening' },
      ]
    },
    {
      id: 'urine',
      name: 'Urine Tests',
      icon: Beaker,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-50 dark:bg-yellow-500/10',
      borderColor: 'border-yellow-200 dark:border-yellow-500/30',
      tests: [
        { id: 'urine-routine', name: 'Urine Routine & Microscopy', price: 150, duration: '2-4 hrs', popular: true, description: 'Complete urine analysis' },
        { id: 'urine-culture', name: 'Urine Culture & Sensitivity', price: 600, duration: '48-72 hrs', description: 'UTI bacteria identification' },
        { id: 'microalbumin', name: 'Microalbumin (Urine)', price: 500, duration: '4-6 hrs', description: 'Early kidney damage marker' },
        { id: 'acr', name: 'Albumin Creatinine Ratio', price: 600, duration: '4-6 hrs', description: 'Kidney function marker' },
        { id: '24h-protein', name: '24-Hour Urine Protein', price: 400, duration: '24-48 hrs', description: 'Total protein in urine' },
        { id: 'urine-pregnancy', name: 'Urine Pregnancy Test', price: 150, duration: '1-2 hrs', popular: true, description: 'hCG detection in urine' },
      ]
    },
    {
      id: 'stool',
      name: 'Stool Tests',
      icon: Microscope,
      color: 'text-stone-500',
      bgColor: 'bg-stone-50 dark:bg-stone-500/10',
      borderColor: 'border-stone-200 dark:border-stone-500/30',
      tests: [
        { id: 'stool-routine', name: 'Stool Routine & Microscopy', price: 200, duration: '2-4 hrs', popular: true, description: 'Complete stool examination' },
        { id: 'stool-culture', name: 'Stool Culture', price: 700, duration: '48-72 hrs', description: 'Bacterial infection test' },
        { id: 'occult-blood', name: 'Occult Blood (FOB)', price: 300, duration: '4-6 hrs', description: 'Hidden blood detection' },
        { id: 'h-pylori-stool', name: 'H. Pylori Antigen (Stool)', price: 800, duration: '4-6 hrs', description: 'Stomach bacteria test' },
        { id: 'calprotectin', name: 'Fecal Calprotectin', price: 2500, duration: '24-48 hrs', description: 'Bowel inflammation marker' },
      ]
    },
    {
      id: 'allergy',
      name: 'Allergy Tests',
      icon: AlertTriangle,
      color: 'text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-400/10',
      borderColor: 'border-red-200 dark:border-red-400/30',
      tests: [
        { id: 'ige-total', name: 'Total IgE', price: 800, duration: '24-48 hrs', popular: true, description: 'Overall allergy indicator' },
        { id: 'food-allergy', name: 'Food Allergy Panel (Veg)', price: 4500, duration: '3-5 days', description: '30+ vegetarian food allergens' },
        { id: 'food-allergy-nv', name: 'Food Allergy Panel (Non-Veg)', price: 5000, duration: '3-5 days', description: '40+ food allergens including non-veg' },
        { id: 'respiratory-allergy', name: 'Respiratory Allergy Panel', price: 4000, duration: '3-5 days', description: 'Dust, pollen, mold allergens' },
        { id: 'drug-allergy', name: 'Drug Allergy Panel', price: 3500, duration: '3-5 days', description: 'Common drug allergens' },
      ]
    },
    {
      id: 'cancer',
      name: 'Tumor Markers',
      icon: Activity,
      color: 'text-violet-500',
      bgColor: 'bg-violet-50 dark:bg-violet-500/10',
      borderColor: 'border-violet-200 dark:border-violet-500/30',
      tests: [
        { id: 'psa', name: 'PSA (Prostate Specific Antigen)', price: 800, duration: '24-48 hrs', popular: true, description: 'Prostate cancer marker' },
        { id: 'cea', name: 'CEA (Carcinoembryonic Antigen)', price: 900, duration: '24-48 hrs', description: 'Colon cancer marker' },
        { id: 'afp', name: 'AFP (Alpha Fetoprotein)', price: 800, duration: '24-48 hrs', description: 'Liver cancer marker' },
        { id: 'ca-125', name: 'CA-125', price: 1200, duration: '24-48 hrs', description: 'Ovarian cancer marker' },
        { id: 'ca-19-9', name: 'CA 19-9', price: 1200, duration: '24-48 hrs', description: 'Pancreatic cancer marker' },
        { id: 'ca-15-3', name: 'CA 15-3', price: 1200, duration: '24-48 hrs', description: 'Breast cancer marker' },
        { id: 'beta-hcg', name: 'Beta hCG (Tumor Marker)', price: 700, duration: '4-6 hrs', description: 'Pregnancy and tumor marker' },
      ]
    },
    {
      id: 'packages',
      name: 'Health Packages',
      icon: Package,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-50 dark:bg-emerald-500/10',
      borderColor: 'border-emerald-200 dark:border-emerald-500/30',
      tests: [
        { id: 'basic-health', name: 'Basic Health Checkup', price: 999, duration: '24-48 hrs', popular: true, description: 'CBC, Sugar, Lipid, Liver, Kidney - 25 tests' },
        { id: 'comprehensive', name: 'Comprehensive Health Package', price: 2499, duration: '24-48 hrs', popular: true, description: '60+ tests including vitamins, thyroid, hormones' },
        { id: 'diabetes-care', name: 'Diabetes Care Package', price: 1299, duration: '24-48 hrs', description: 'FBS, PPBS, HbA1c, Lipid, Kidney, Urine' },
        { id: 'heart-care', name: 'Heart Care Package', price: 2999, duration: '24-48 hrs', description: 'Lipid, Cardiac markers, ECG included' },
        { id: 'women-wellness', name: 'Women Wellness Package', price: 3499, duration: '24-48 hrs', description: 'Complete female health checkup' },
        { id: 'senior-citizen', name: 'Senior Citizen Package', price: 4999, duration: '24-48 hrs', description: 'Age-specific comprehensive tests' },
        { id: 'full-body', name: 'Full Body Checkup', price: 5999, duration: '48-72 hrs', popular: true, description: '100+ tests - Complete health assessment' },
      ]
    },
  ];

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cartItems, setCartItems] = useState<Array<{id: string, name: string, price: number}>>([]);
  const [showCart, setShowCart] = useState(false);

  const filteredTests = useMemo(() => {
    let tests: Array<{id: string, name: string, price: number, duration: string, popular?: boolean, description: string, category: string, categoryColor: string}> = [];
    
    testCategories.forEach(cat => {
      cat.tests.forEach(test => {
        tests.push({
          ...test,
          category: cat.name,
          categoryColor: cat.color
        });
      });
    });

    if (selectedCategory !== 'all') {
      const category = testCategories.find(c => c.id === selectedCategory);
      if (category) {
        tests = tests.filter(t => t.category === category.name);
      }
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      tests = tests.filter(t => 
        t.name.toLowerCase().includes(query) || 
        t.description.toLowerCase().includes(query)
      );
    }

    return tests;
  }, [selectedCategory, searchQuery]);

  const addToCart = (test: {id: string, name: string, price: number}) => {
    if (!cartItems.find(item => item.id === test.id)) {
      setCartItems([...cartItems, test]);
      toast({
        title: "Added to cart",
        description: `${test.name} added to your selection`,
      });
    }
  };

  const removeFromCart = (testId: string) => {
    setCartItems(cartItems.filter(item => item.id !== testId));
  };

  const cartTotal = cartItems.reduce((sum, item) => sum + item.price, 0);

  const renderTestCatalogContent = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-6 md:p-8 text-white shadow-2xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L2c+PC9zdmc+')] opacity-30" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-white/10 to-transparent rounded-full blur-3xl" />
        
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm">
              <BookOpen className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-1">Master Test Catalog</h1>
              <p className="text-amber-100 text-sm md:text-base">
                Browse and select from {testCategories.reduce((sum, cat) => sum + cat.tests.length, 0)}+ diagnostic tests
              </p>
            </div>
          </div>
          
          {/* Cart Button */}
          <Button 
            onClick={() => setShowCart(true)}
            className="bg-white text-amber-600 hover:bg-amber-50 shadow-lg relative"
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            Cart ({cartItems.length})
            {cartItems.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {cartItems.length}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input 
            placeholder="Search tests by name or description..."
            className="pl-10 h-11 bg-white dark:bg-slate-800"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full md:w-64 h-11 bg-white dark:bg-slate-800">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {testCategories.map(cat => (
              <SelectItem key={cat.id} value={cat.id}>
                <span className="flex items-center gap-2">
                  <cat.icon className={cn("w-4 h-4", cat.color)} />
                  {cat.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Categories Grid */}
      {selectedCategory === 'all' && !searchQuery && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {testCategories.map(cat => (
            <Card 
              key={cat.id}
              className={cn(
                "cursor-pointer hover:shadow-lg transition-all duration-300 border-2",
                cat.bgColor, cat.borderColor,
                "hover:scale-105"
              )}
              onClick={() => setSelectedCategory(cat.id)}
            >
              <CardContent className="p-4 text-center">
                <div className={cn("p-3 rounded-xl w-fit mx-auto mb-2", cat.bgColor)}>
                  <cat.icon className={cn("w-6 h-6", cat.color)} />
                </div>
                <h3 className="font-semibold text-sm text-slate-800 dark:text-white">{cat.name}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{cat.tests.length} tests</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Popular Tests */}
      {selectedCategory === 'all' && !searchQuery && (
        <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
              Popular Tests
            </CardTitle>
            <CardDescription>Most frequently ordered tests</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredTests.filter(t => t.popular).slice(0, 9).map(test => (
                <div 
                  key={test.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-800 dark:text-white truncate">{test.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">₹{test.price}</span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{test.duration}</span>
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    variant={cartItems.find(i => i.id === test.id) ? "default" : "outline"}
                    className={cn(
                      "ml-2",
                      cartItems.find(i => i.id === test.id) && "bg-emerald-500 hover:bg-emerald-600"
                    )}
                    onClick={() => addToCart(test)}
                    disabled={!!cartItems.find(i => i.id === test.id)}
                  >
                    {cartItems.find(i => i.id === test.id) ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtered Tests List */}
      {(selectedCategory !== 'all' || searchQuery) && (
        <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {selectedCategory !== 'all' && (
                    <>
                      {(() => {
                        const cat = testCategories.find(c => c.id === selectedCategory);
                        return cat ? <cat.icon className={cn("w-5 h-5", cat.color)} /> : null;
                      })()}
                    </>
                  )}
                  {selectedCategory === 'all' ? 'Search Results' : testCategories.find(c => c.id === selectedCategory)?.name}
                </CardTitle>
                <CardDescription>{filteredTests.length} tests available</CardDescription>
              </div>
              {selectedCategory !== 'all' && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedCategory('all')}>
                  View All Categories
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredTests.map(test => (
                <div 
                  key={test.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors border border-slate-200/50 dark:border-slate-700/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-slate-800 dark:text-white">{test.name}</p>
                      {test.popular && (
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 text-xs">
                          Popular
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{test.description}</p>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">₹{test.price}</span>
                      <span className="text-sm text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {test.duration}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {test.category}
                      </Badge>
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    variant={cartItems.find(i => i.id === test.id) ? "default" : "outline"}
                    className={cn(
                      "ml-4",
                      cartItems.find(i => i.id === test.id) && "bg-emerald-500 hover:bg-emerald-600"
                    )}
                    onClick={() => addToCart(test)}
                    disabled={!!cartItems.find(i => i.id === test.id)}
                  >
                    {cartItems.find(i => i.id === test.id) ? (
                      <>
                        <Check className="w-4 h-4 mr-1" /> Added
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-1" /> Add
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Tests by Category */}
      {selectedCategory === 'all' && !searchQuery && (
        <div className="space-y-6">
          {testCategories.map(cat => (
            <Card key={cat.id} className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <div className={cn("p-2 rounded-lg", cat.bgColor)}>
                      <cat.icon className={cn("w-5 h-5", cat.color)} />
                    </div>
                    {cat.name}
                    <Badge variant="secondary" className="ml-2">{cat.tests.length}</Badge>
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedCategory(cat.id)}>
                    View All <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {cat.tests.slice(0, 6).map(test => (
                    <div 
                      key={test.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-slate-800 dark:text-white truncate">{test.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">₹{test.price}</span>
                          <span className="text-xs text-slate-400">•</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">{test.duration}</span>
                        </div>
                      </div>
                      <Button 
                        size="icon" 
                        variant={cartItems.find(i => i.id === test.id) ? "default" : "ghost"}
                        className={cn(
                          "h-8 w-8 ml-2",
                          cartItems.find(i => i.id === test.id) && "bg-emerald-500 hover:bg-emerald-600"
                        )}
                        onClick={() => addToCart(test)}
                        disabled={!!cartItems.find(i => i.id === test.id)}
                      >
                        {cartItems.find(i => i.id === test.id) ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Cart Dialog */}
      <Dialog open={showCart} onOpenChange={setShowCart}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-emerald-500" />
              Selected Tests
            </DialogTitle>
            <DialogDescription>
              {cartItems.length} test{cartItems.length !== 1 ? 's' : ''} selected
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {cartItems.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No tests selected</p>
                <p className="text-sm">Browse the catalog and add tests to your cart</p>
              </div>
            ) : (
              cartItems.map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <div>
                    <p className="font-medium text-sm text-slate-800 dark:text-white">{item.name}</p>
                    <p className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold">₹{item.price}</p>
                  </div>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => removeFromCart(item.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {cartItems.length > 0 && (
            <>
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-semibold text-slate-800 dark:text-white">Total Amount</span>
                  <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">₹{cartTotal}</span>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCartItems([])}>
                  Clear All
                </Button>
                <Button 
                  className="bg-emerald-500 hover:bg-emerald-600"
                  onClick={() => {
                    toast({
                      title: "Order Created",
                      description: `${cartItems.length} tests added to order. Total: ₹${cartTotal}`,
                    });
                    setShowCart(false);
                    navigate('/lab/orders/new');
                  }}
                >
                  Create Order
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );

  const renderOrdersContent = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Test Orders</h2>
          <p className="text-muted-foreground">Manage and track all lab test orders</p>
        </div>
        <Button onClick={() => navigate('/lab/orders/new')} className="gap-2">
          <Plus className="h-4 w-4" />
          New Order
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>All Orders</CardTitle>
            <div className="flex gap-2">
              <Input placeholder="Search orders..." className="w-64" />
              <Button variant="outline" size="icon"><Filter className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100">
                <div className="flex items-center gap-4">
                  <div className="bg-emerald-100 p-3 rounded-lg">
                    <TestTube className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Order #{1000 + i}</h4>
                    <p className="text-sm text-muted-foreground">Patient Name • CBC, Lipid Profile</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge>{['Pending', 'Processing', 'Completed'][i % 3]}</Badge>
                  <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderPatientsContent = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Patients</h2>
          <p className="text-muted-foreground">Patient records and test history</p>
        </div>
        <Button className="gap-2" onClick={() => toast({ title: "Register Patient", description: "Opening patient registration form..." })}>
          <Plus className="h-4 w-4" />
          Register Patient
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Patient List</CardTitle>
            <Input placeholder="Search patients..." className="w-64" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-100 p-3 rounded-full">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Patient {i + 1}</h4>
                    <p className="text-sm text-muted-foreground">ID: PAT{1000 + i} • Age: {25 + i} • Male</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => toast({ title: "View History", description: `Viewing history for Patient ${i + 1}` })}>View History</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderAppointmentsContent = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Appointments</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Today's Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="mb-4 p-3 bg-emerald-50 rounded-lg">
                <div className="flex justify-between">
                  <span className="font-semibold">{9 + i}:00 AM</span>
                  <Badge variant="outline">Sample Collection</Badge>
                </div>
                <p className="text-sm mt-1">Patient Name {i + 1}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Appointment Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-96 flex items-center justify-center text-muted-foreground">
              Calendar view coming soon...
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderQueueContent = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Sample Queue</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-600">12</div>
              <p className="text-sm text-muted-foreground">Waiting</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">8</div>
              <p className="text-sm text-muted-foreground">In Progress</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-emerald-600">45</div>
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">32 min</div>
              <p className="text-sm text-muted-foreground">Avg Wait Time</p>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Current Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="text-2xl font-bold text-emerald-600">{i + 1}</div>
                  <div>
                    <h4 className="font-semibold">Patient {i + 1}</h4>
                    <p className="text-sm text-muted-foreground">Blood Collection • Waiting: {5 + i} min</p>
                  </div>
                </div>
                <Button size="sm">Call Next</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderSamplesContent = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Sample Collection</h2>
      <Card>
        <CardHeader>
          <CardTitle>Samples to Collect</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-4">
                  <TestTube className="h-6 w-6 text-emerald-600" />
                  <div>
                    <h4 className="font-semibold">Sample #{2000 + i}</h4>
                    <p className="text-sm text-muted-foreground">Patient Name • Blood Sample • CBC</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm">Collect</Button>
                  <Button variant="outline" size="sm">Details</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderProcessingContent = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Sample Processing</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="flex justify-between">
                <CardTitle className="text-lg">Sample #{3000 + i}</CardTitle>
                <Badge>{['Processing', 'Analyzing', 'Review'][i % 3]}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Patient</p>
                  <p className="font-semibold">Patient Name {i + 1}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Test Type</p>
                  <p className="font-semibold">Complete Blood Count</p>
                </div>
                <Progress value={33 + (i * 10)} className="h-2" />
                <Button className="w-full" size="sm">Continue Processing</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderResultsContent = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Results Entry</h2>
      <Card>
        <CardHeader>
          <CardTitle>Pending Result Entry</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <h4 className="font-semibold">Test #{4000 + i}</h4>
                  <p className="text-sm text-muted-foreground">Patient Name • Thyroid Panel</p>
                </div>
                <Button size="sm">Enter Results</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderReportsContent = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Lab Reports</h2>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Generated Reports</CardTitle>
            <div className="flex gap-2">
              <Input placeholder="Search reports..." className="w-64" />
              <Button variant="outline" size="icon"><Download className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-4">
                  <FileText className="h-6 w-6 text-blue-600" />
                  <div>
                    <h4 className="font-semibold">Report #{5000 + i}</h4>
                    <p className="text-sm text-muted-foreground">Patient Name • CBC • {new Date().toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm"><Eye className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm"><Download className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderInventoryContent = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Inventory Management</h2>
        <Button className="gap-2" onClick={() => toast({ title: "Add Item", description: "Opening add inventory item form..." })}>
          <Plus className="h-4 w-4" />
          Add Item
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <Package className="h-8 w-8 text-emerald-600 mb-2" />
            <div className="text-2xl font-bold">234</div>
            <p className="text-sm text-muted-foreground">Total Items</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <AlertTriangle className="h-8 w-8 text-orange-600 mb-2" />
            <div className="text-2xl font-bold">12</div>
            <p className="text-sm text-muted-foreground">Low Stock</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <AlertCircle className="h-8 w-8 text-red-600 mb-2" />
            <div className="text-2xl font-bold">5</div>
            <p className="text-sm text-muted-foreground">Out of Stock</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <TrendingUp className="h-8 w-8 text-blue-600 mb-2" />
            <div className="text-2xl font-bold">₹2.4L</div>
            <p className="text-sm text-muted-foreground">Total Value</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Inventory Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {['Blood Collection Tubes', 'Reagent Kit A', 'Slide Glass', 'Latex Gloves', 'Test Strips', 'Syringes'].map((item, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <h4 className="font-semibold">{item}</h4>
                  <p className="text-sm text-muted-foreground">Stock: {150 + i * 50} units</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => toast({ title: "Edit Item", description: `Editing ${item}` })}><Edit className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm" onClick={() => toast({ title: "Add Stock", description: `Adding stock to ${item}` })}><Plus className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderBillingContent = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Billing Management</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <DollarSign className="h-8 w-8 text-emerald-600 mb-2" />
            <div className="text-2xl font-bold">₹1,24,560</div>
            <p className="text-sm text-muted-foreground">Today's Revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Receipt className="h-8 w-8 text-blue-600 mb-2" />
            <div className="text-2xl font-bold">45</div>
            <p className="text-sm text-muted-foreground">Invoices Generated</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Clock className="h-8 w-8 text-orange-600 mb-2" />
            <div className="text-2xl font-bold">12</div>
            <p className="text-sm text-muted-foreground">Pending Invoices</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <TrendingUp className="h-8 w-8 text-purple-600 mb-2" />
            <div className="text-2xl font-bold">+18%</div>
            <p className="text-sm text-muted-foreground">vs Last Month</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <h4 className="font-semibold">Invoice #{7000 + i}</h4>
                  <p className="text-sm text-muted-foreground">Patient Name • ₹{1200 + i * 300}</p>
                </div>
                <div className="flex gap-2">
                  <Badge>{['Paid', 'Pending', 'Overdue'][i % 3]}</Badge>
                  <Button variant="outline" size="sm"><Download className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderPaymentsContent = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Payment Management</h2>
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending Payments</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div>
                      <h4 className="font-semibold">Payment #{8000 + i}</h4>
                      <p className="text-sm text-muted-foreground">Patient Name • ₹{2500 + i * 500}</p>
                    </div>
                    <Button size="sm">Process Payment</Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="completed">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-emerald-50 rounded-lg">
                    <div>
                      <h4 className="font-semibold">Payment #{9000 + i}</h4>
                      <p className="text-sm text-muted-foreground">Completed • ₹{1500 + i * 400}</p>
                    </div>
                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="failed">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-muted-foreground py-8">
                No failed payments
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );

  const renderAnalyticsContent = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Analytics & Reports</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <TestTube className="h-8 w-8 text-emerald-600 mb-2" />
            <div className="text-2xl font-bold">1,245</div>
            <p className="text-sm text-muted-foreground">Tests This Month</p>
            <p className="text-xs text-emerald-600 mt-1">+12% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <DollarSign className="h-8 w-8 text-blue-600 mb-2" />
            <div className="text-2xl font-bold">₹18.5L</div>
            <p className="text-sm text-muted-foreground">Revenue</p>
            <p className="text-xs text-blue-600 mt-1">+22% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Users className="h-8 w-8 text-purple-600 mb-2" />
            <div className="text-2xl font-bold">845</div>
            <p className="text-sm text-muted-foreground">Patients Served</p>
            <p className="text-xs text-purple-600 mt-1">+8% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Timer className="h-8 w-8 text-orange-600 mb-2" />
            <div className="text-2xl font-bold">45 min</div>
            <p className="text-sm text-muted-foreground">Avg TAT</p>
            <p className="text-xs text-emerald-600 mt-1">-5 min improvement</p>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Test Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              Chart: Test type distribution
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              Chart: Monthly revenue trend
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderStaffContent = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Staff Management</h2>
        <Button className="gap-2" onClick={() => toast({ title: "Add Staff", description: "Opening add staff member form..." })}>
          <Plus className="h-4 w-4" />
          Add Staff Member
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Lab Staff</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {['Lab Technician', 'Phlebotomist', 'Lab Assistant', 'Pathologist', 'Receptionist'].map((role, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-100 p-3 rounded-full">
                    <UserCog className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Staff Member {i + 1}</h4>
                    <p className="text-sm text-muted-foreground">{role} • ID: EMP{1000 + i}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => toast({ title: "Edit Staff", description: `Editing staff member ${i + 1}` })}><Edit className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm" onClick={() => toast({ title: "View Details", description: `Viewing staff member ${i + 1} details` })}>View Details</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderNotificationsContent = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Notifications</h2>
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="urgent">Urgent</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {notificationBuckets.all.map((n) => (
                  <div key={n.id} className={`flex items-center gap-4 p-4 rounded-lg ${n.read ? 'bg-slate-50' : 'bg-slate-100'} hover:bg-slate-100`}>
                    {n.level === 'Critical' ? (
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    ) : (
                      <Bell className="h-5 w-5 text-blue-600" />
                    )}
                    <div className="flex-1">
                      <h4 className="font-semibold">{n.title}</h4>
                      <p className="text-sm text-muted-foreground">{n.description}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))}
                      disabled={n.read}
                    >
                      {n.read ? 'Read' : 'Mark Read'}
                    </Button>
                  </div>
                ))}
                {notificationBuckets.all.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground">No notifications yet.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="urgent">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {notificationBuckets.urgent.map((n) => (
                  <div key={n.id} className="flex items-center gap-4 p-4 bg-red-50 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-red-900">{n.title}</h4>
                      <p className="text-sm text-red-700">{n.description}</p>
                    </div>
                    <Button size="sm" variant="destructive" onClick={() => navigate('/lab/notifications')}>View</Button>
                  </div>
                ))}
                {notificationBuckets.urgent.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground">No urgent notifications.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="orders">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {notificationBuckets.orders.map((n) => (
                  <div key={n.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg hover:bg-slate-100">
                    <Bell className="h-5 w-5 text-blue-600" />
                    <div className="flex-1">
                      <h4 className="font-semibold">{n.title}</h4>
                      <p className="text-sm text-muted-foreground">{n.description}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate('/lab/orders')}>Open</Button>
                  </div>
                ))}
                {notificationBuckets.orders.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground">No order notifications.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="inventory">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {notificationBuckets.inventory.map((n) => (
                  <div key={n.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg hover:bg-slate-100">
                    <Package className="h-5 w-5 text-orange-600" />
                    <div className="flex-1">
                      <h4 className="font-semibold">{n.title}</h4>
                      <p className="text-sm text-muted-foreground">{n.description}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate('/lab/inventory')}>Open</Button>
                  </div>
                ))}
                {notificationBuckets.inventory.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground">No inventory notifications.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );

  const renderSettingsContent = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Lab Settings</h2>
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="tests">Tests</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Lab Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Lab Name</label>
                <Input placeholder="Enter lab name" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Registration Number</label>
                <Input placeholder="Enter registration number" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Address</label>
                <Textarea placeholder="Enter address" className="mt-1" />
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="tests">
          <Card>
            <CardHeader>
              <CardTitle>Test Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-muted-foreground">Test packages and pricing configuration</div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );

  const renderSupportContent = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Help & Support</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <Phone className="h-8 w-8 text-emerald-600 mb-2" />
            <CardTitle>Phone Support</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">Available 24/7</p>
            <Button className="w-full">Call Now</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Mail className="h-8 w-8 text-blue-600 mb-2" />
            <CardTitle>Email Support</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">Response within 24 hours</p>
            <Button className="w-full">Send Email</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <HelpCircle className="h-8 w-8 text-purple-600 mb-2" />
            <CardTitle>Documentation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">User guides & FAQs</p>
            <Button className="w-full">View Docs</Button>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Submit a Ticket</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Subject</label>
            <Input placeholder="Enter subject" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea placeholder="Describe your issue" className="mt-1" rows={4} />
          </div>
          <Button>Submit Ticket</Button>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <LabLayout title={location.pathname === '/lab/dashboard' ? "Dashboard" : location.pathname.split('/')[2]?.replace('-', ' ').toUpperCase() || "Lab Management"} subtitle="Lab Management Overview">
      {renderContent()}
    </LabLayout>
  );
};

export default LabDashboard;
