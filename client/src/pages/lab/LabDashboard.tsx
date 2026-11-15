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
  ChevronDown, Check, ScanLine, Waves, Upload, Image, Monitor
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import LabLayout from '@/components/lab/LabLayout';
import LabTestPrices from '@/components/lab/LabTestPrices';
import { cn } from '@/lib/utils';
import api from '@/utils/api';

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
  const [criticalSummary, setCriticalSummary] = useState({
    open_count: 0,
    escalated_count: 0,
    acknowledged_count: 0,
    overdue_open_count: 0,
  });
  
  const [pathologyImage, setPathologyImage] = useState<File | null>(null);
  const [pathologyResult, setPathologyResult] = useState<any>(null);
  const [pathologyLoading, setPathologyLoading] = useState(false);

  const analyzePathologyImage = async () => {
    if (!pathologyImage) return;
    try {
      setPathologyLoading(true);
      const form = new FormData();
      form.append('image', pathologyImage);
      form.append('sourceType', 'pathology');
      const { data } = await api.post('/ai/vision/analyze', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPathologyResult(data?.analysis ?? null);
    } finally { setPathologyLoading(false); }
  };

  useEffect(() => {
    let mounted = true;
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

    const loadState = async () => {
      const keys = [
        'lab.orders',
        'lab.samples',
        'lab.reports',
        'lab.bills',
        'lab.inventory',
        'lab.notifications',
      ] as const;

      try {
        const responses = await Promise.all(
          keys.map((k) => api.get(`/lab/state/${encodeURIComponent(k)}`).catch(() => null))
        );

        if (!mounted) return;

        const getRemote = <T,>(idx: number): T | null => {
          const payload = responses[idx]?.data;
          if (payload?.success && payload?.data !== null) return payload.data as T;
          return null;
        };

        setOrders(getRemote<LabOrder[]>(0) ?? []);
        setSamples(getRemote<LabSample[]>(1) ?? []);
        setReports(getRemote<ReportItem[]>(2) ?? []);
        setBills(getRemote<BillItem[]>(3) ?? []);
        setInventory(getRemote<InventoryItem[]>(4) ?? []);
        setNotifications(getRemote<NotificationItem[]>(5) ?? []);
      } catch {
        if (!mounted) return;
        setOrders([]);
        setSamples([]);
        setReports([]);
        setBills([]);
        setInventory([]);
        setNotifications([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadState();
    return () => {
      mounted = false;
    };
  }, [navigate, location.pathname]);

  useEffect(() => {
    const token = localStorage.getItem('labToken');
    if (!token) return;

    const timer = setTimeout(() => {
      api.put(`/lab/state/${encodeURIComponent('lab.notifications')}`, { data: notifications }).catch(() => {});
    }, 250);

    return () => clearTimeout(timer);
  }, [notifications]);

  useEffect(() => {
    let mounted = true;

    const loadCriticalSummary = async () => {
      try {
        const res = await api.get('/lab/ris/critical-alerts/summary');
        if (!mounted) return;
        const summary = res?.data?.summary || {};
        setCriticalSummary({
          open_count: Number(summary.open_count) || 0,
          escalated_count: Number(summary.escalated_count) || 0,
          acknowledged_count: Number(summary.acknowledged_count) || 0,
          overdue_open_count: Number(summary.overdue_open_count) || 0,
        });
      } catch {
        if (!mounted) return;
        setCriticalSummary({
          open_count: 0,
          escalated_count: 0,
          acknowledged_count: 0,
          overdue_open_count: 0,
        });
      }
    };

    loadCriticalSummary();
    const timer = setInterval(loadCriticalSummary, 60_000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

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

  const canAccessBillingOps = useMemo(() => {
    const billingHints = ['billing', 'finance', 'accounts', 'revenue', 'payment'];
    const hasHint = (value: unknown) => {
      if (typeof value !== 'string') return false;
      const normalized = value.toLowerCase();
      return billingHints.some((hint) => normalized.includes(hint));
    };

    const token = localStorage.getItem('labToken');
    let tokenClaims: any = null;
    try {
      if (token) tokenClaims = JSON.parse(atob(token.split('.')[1]));
    } catch {
      tokenClaims = null;
    }

    const roles = [
      ...(Array.isArray(labData?.roles) ? labData.roles : []),
      ...(Array.isArray(tokenClaims?.roles) ? tokenClaims.roles : []),
      labData?.role,
      tokenClaims?.role,
      labData?.department,
      tokenClaims?.department,
    ].filter(Boolean);

    const scopes = [
      ...(Array.isArray(labData?.permissions) ? labData.permissions : []),
      ...(Array.isArray(labData?.scopes) ? labData.scopes : []),
      ...(Array.isArray(tokenClaims?.permissions) ? tokenClaims.permissions : []),
      ...(Array.isArray(tokenClaims?.scopes) ? tokenClaims.scopes : []),
      tokenClaims?.scope,
    ]
      .filter(Boolean)
      .flatMap((entry: unknown) =>
        typeof entry === 'string' ? entry.split(/[\s,]+/) : [entry]
      )
      .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);

    const hasRoleSignal = roles.some((value) => hasHint(String(value)) || String(value).toLowerCase().includes('admin'));
    const hasScopeSignal = scopes.some((value) => hasHint(value) || value.toLowerCase().includes('lab:billing'));

    // Backward compatibility: when no role/scope metadata is present, keep Billing Ops visible.
    if (roles.length === 0 && scopes.length === 0) return true;

    return hasRoleSignal || hasScopeSignal;
  }, [labData]);

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
    {
      title: 'Billing Ops',
      description: 'Open billing operations console',
      icon: Receipt,
      link: '/lab/billing-ops',
      bgColor: 'bg-cyan-500/10 dark:bg-cyan-500/20',
      iconColor: 'text-cyan-500',
    },
  ].filter((action) => action.link !== '/lab/billing-ops' || canAccessBillingOps);

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
      // The lab's own test list and prices (lab_test_prices): what patients
      // are offered and charged when they book this lab.
      return <LabTestPrices />;
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

  const renderDashboardContent = () => {
    const dept = labData?.department || 'pathology';
    const getDeptConfig = (d: string) => {
      switch (d) {
        case 'radiology': return { label: 'Radiology', icon: ScanLine,    gradient: 'from-indigo-500 to-blue-600',  glow: 'shadow-indigo-500/30', accent: 'bg-indigo-500', ring: 'from-indigo-500/20 to-transparent', portal: 'Radiology Information System' };
        case 'sonology':  return { label: 'Sonology',  icon: Waves,       gradient: 'from-teal-500 to-cyan-600',    glow: 'shadow-teal-500/30',   accent: 'bg-teal-500',  ring: 'from-teal-500/20 to-transparent',  portal: 'Sonology Management Portal' };
        case 'combined':  return { label: 'Combined',  icon: Activity,    gradient: 'from-purple-500 to-pink-600',  glow: 'shadow-purple-500/30', accent: 'bg-purple-500',ring: 'from-purple-500/20 to-transparent',portal: 'Combined Diagnostics Portal' };
        default:          return { label: 'Pathology', icon: FlaskConical, gradient: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-500/30',accent: 'bg-emerald-500',ring: 'from-emerald-500/20 to-transparent',portal: 'Laboratory Management Portal' };
      }
    };
    const deptCfg  = getDeptConfig(dept);
    const DeptIcon = deptCfg.icon;
    const isRadiology = dept === 'radiology' || dept === 'combined';
    const isSonology  = dept === 'sonology'  || dept === 'combined';
    const isPathology = dept === 'pathology' || dept === 'combined';

    const triggerOverdueEscalation = async () => {
      try {
        const res = await api.post('/lab/ris/critical-alerts/escalate-overdue');
        const escalatedCount = Number(res?.data?.escalatedCount) || 0;
        toast({
          title: 'Escalation run complete',
          description: escalatedCount > 0
            ? `${escalatedCount} overdue alert(s) escalated.`
            : 'No overdue critical alerts found.',
        });

        const summaryRes = await api.get('/lab/ris/critical-alerts/summary');
        const summary = summaryRes?.data?.summary || {};
        setCriticalSummary({
          open_count: Number(summary.open_count) || 0,
          escalated_count: Number(summary.escalated_count) || 0,
          acknowledged_count: Number(summary.acknowledged_count) || 0,
          overdue_open_count: Number(summary.overdue_open_count) || 0,
        });
      } catch {
        toast({
          title: 'Escalation failed',
          description: 'Unable to run overdue critical alert escalation.',
          variant: 'destructive',
        });
      }
    };

    return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6 md:p-8 text-white shadow-2xl">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L2c+PC9zdmc+')] opacity-30" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br to-transparent rounded-full blur-3xl opacity-40" style={{backgroundImage: `linear-gradient(to bottom right, ${dept === 'radiology' ? '#6366f1' : dept === 'sonology' ? '#14b8a6' : dept === 'combined' ? '#a855f7' : '#10b981'}, transparent)`}} />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr to-transparent rounded-full blur-2xl opacity-20" />
        
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16 border-2 border-white/20 shadow-xl">
              <AvatarFallback className={cn("bg-gradient-to-br text-white text-xl", deptCfg.gradient)}>
                {labData?.name?.[0] || 'L'}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className={cn("p-2 rounded-xl bg-gradient-to-br shadow-lg", deptCfg.gradient, deptCfg.glow)}>
                  <DeptIcon className="w-5 h-5" />
                </div>
                <Badge className="bg-white/10 text-white/90 border-white/20 font-medium">
                  {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </Badge>
                <Badge className="bg-white/20 text-white border-white/30 font-semibold uppercase tracking-wide text-xs">
                  {deptCfg.label}
                </Badge>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-1">
                {getGreeting()}, {labData?.name || 'Lab Admin'}!
              </h1>
              <p className="text-slate-300 text-sm md:text-base flex items-center gap-2">
                <span>{deptCfg.portal}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span className="flex items-center gap-1">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  {displayStats[0].value} studies today
                </span>
              </p>
            </div>
          </div>
          
          <div className="flex gap-3 flex-wrap">
            {isRadiology && (
              <Link to="/lab/ris">
                <Button className={cn("bg-gradient-to-r text-white shadow-lg border-0", deptCfg.gradient)}>
                  <ScanLine className="w-4 h-4 mr-2" />RIS Worklist
                </Button>
              </Link>
            )}
            {isSonology && (
              <Link to="/lab/ris">
                <Button className={cn("bg-gradient-to-r text-white shadow-lg border-0", deptCfg.gradient)}>
                  <Waves className="w-4 h-4 mr-2" />Sonology
                </Button>
              </Link>
            )}
            {isPathology && (
              <>
                <Link to="/lab/orders">
                  <Button variant="outline" className="bg-white/10 hover:bg-white/20 text-white border-white/20 hover:border-white/30">
                    <ClipboardList className="w-4 h-4 mr-2" />Test Orders
                  </Button>
                </Link>
                <Link to="/lab/samples">
                  <Button className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/30 border-0">
                    <TestTube className="w-4 h-4 mr-2" />Start Collection
                  </Button>
                </Link>
              </>
            )}
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

      <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            Critical Value Monitor
          </CardTitle>
          <CardDescription>Live counters from RIS critical-value workflow</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-red-200/80 dark:border-red-800/40 bg-red-50/60 dark:bg-red-950/20 p-3">
              <div className="text-xs text-slate-600 dark:text-slate-300">Open</div>
              <div className="text-xl font-semibold text-red-600 dark:text-red-400">{criticalSummary.open_count}</div>
            </div>
            <div className="rounded-xl border border-amber-200/80 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-950/20 p-3">
              <div className="text-xs text-slate-600 dark:text-slate-300">Overdue Open</div>
              <div className="text-xl font-semibold text-amber-600 dark:text-amber-400">{criticalSummary.overdue_open_count}</div>
            </div>
            <div className="rounded-xl border border-orange-200/80 dark:border-orange-800/40 bg-orange-50/60 dark:bg-orange-950/20 p-3">
              <div className="text-xs text-slate-600 dark:text-slate-300">Escalated</div>
              <div className="text-xl font-semibold text-orange-600 dark:text-orange-400">{criticalSummary.escalated_count}</div>
            </div>
            <div className="rounded-xl border border-emerald-200/80 dark:border-emerald-800/40 bg-emerald-50/60 dark:bg-emerald-950/20 p-3">
              <div className="text-xs text-slate-600 dark:text-slate-300">Acknowledged</div>
              <div className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">{criticalSummary.acknowledged_count}</div>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="outline" onClick={triggerOverdueEscalation}>
              Run Overdue Escalation
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Department-specific panel */}
      {isRadiology && (
        <div>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
            <ScanLine className="w-5 h-5 text-indigo-500" />
            Radiology Worklist
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[{title:'CT Scan Orders', icon:Monitor, link:'/lab/ris', bg:'bg-indigo-500/10', ic:'text-indigo-500', desc:'Computed Tomography'},
              {title:'MRI Studies', icon:Brain, link:'/lab/ris', bg:'bg-purple-500/10', ic:'text-purple-500', desc:'Magnetic Resonance'},
              {title:'X-Ray Queue', icon:ScanLine, link:'/lab/ris', bg:'bg-blue-500/10', ic:'text-blue-500', desc:'Plain Radiography'},
              {title:'Upload Images', icon:Upload, link:'/lab/ris', bg:'bg-teal-500/10', ic:'text-teal-500', desc:'DICOM / JPEG / PDF'},
            ].map((a, i) => (
              <Link key={i} to={a.link} className="group">
                <Card className="h-full bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-indigo-200 dark:hover:border-indigo-500/50 hover:shadow-lg transition-all">
                  <CardContent className="p-4">
                    <div className={cn('p-3 rounded-xl w-fit mb-3 transition-all group-hover:scale-110', a.bg)}><a.icon className={cn('w-6 h-6', a.ic)} /></div>
                    <h3 className="font-semibold text-slate-800 dark:text-white mb-1 text-sm">{a.title}</h3>
                    <p className="text-xs text-slate-500">{a.desc}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {isSonology && (
        <div>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
            <Waves className="w-5 h-5 text-teal-500" />
            Sonology Worklist
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[{title:'USG Abdomen', icon:Waves, link:'/lab/ris', bg:'bg-teal-500/10', ic:'text-teal-500', desc:'Abdominal Ultrasound'},
              {title:'Echo Studies', icon:Heart, link:'/lab/ris', bg:'bg-rose-500/10', ic:'text-rose-500', desc:'Echocardiography'},
              {title:'Obstetric USG', icon:Baby, link:'/lab/ris', bg:'bg-pink-500/10', ic:'text-pink-500', desc:'OB/GYN Ultrasound'},
              {title:'Upload Study', icon:Image, link:'/lab/ris', bg:'bg-cyan-500/10', ic:'text-cyan-500', desc:'Images & Reports'},
            ].map((a, i) => (
              <Link key={i} to={a.link} className="group">
                <Card className="h-full bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-teal-200 dark:hover:border-teal-500/50 hover:shadow-lg transition-all">
                  <CardContent className="p-4">
                    <div className={cn('p-3 rounded-xl w-fit mb-3 transition-all group-hover:scale-110', a.bg)}><a.icon className={cn('w-6 h-6', a.ic)} /></div>
                    <h3 className="font-semibold text-slate-800 dark:text-white mb-1 text-sm">{a.title}</h3>
                    <p className="text-xs text-slate-500">{a.desc}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {isPathology && (
        <Card className="border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10">
          <CardHeader><CardTitle className="text-base">Digital Pathology Review</CardTitle><CardDescription>Upload a slide or microscopy image for clinician review support.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 md:flex-row"><Input type="file" accept="image/*" onChange={(e) => setPathologyImage(e.target.files?.[0] || null)} /><Button onClick={analyzePathologyImage} disabled={!pathologyImage || pathologyLoading}>{pathologyLoading ? 'Analyzing...' : 'Analyze Image'}</Button></div>
            {pathologyResult && <div className="rounded-lg border bg-white p-3 text-sm dark:bg-slate-900"><p className="font-medium">{pathologyResult.assessment || 'Pathology assessment available'}</p><p className="mt-1 text-muted-foreground">{pathologyResult.findings}</p>{pathologyResult.grade && <Badge className="mt-2">Grade: {pathologyResult.grade}</Badge>}</div>}
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
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
  };

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
