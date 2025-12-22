import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  TestTube, Calendar, Users, FileText, DollarSign, Clock, 
  TrendingUp, Activity, Plus, Search, Filter, Download,
  Microscope, CheckCircle, AlertCircle, Package, ClipboardList,
  ArrowRight, Timer, Beaker, Edit, Trash2, Eye, CreditCard,
  BarChart3, UserCog, Bell, Settings, HelpCircle, Phone, Mail,
  MapPin, AlertTriangle, TrendingDown, Receipt
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import LabLayout from '@/components/lab/LabLayout';

const LabDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [labData, setLabData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pendingFilterOpen, setPendingFilterOpen] = useState(false);
  const [pendingFilters, setPendingFilters] = useState({ query: '', priority: 'All', status: 'All' });

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Activity className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const testsToday = orders.filter((o) => o.orderedAt === today).length;
  const pendingSamples = samples.filter((s) => s.status !== 'Completed').length;
  const reportsReady = reports.filter((r) => r.status === 'Ready').length;
  const revenueToday = bills.filter((b) => b.date === today).reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

  const stats = [
    { label: 'Tests Today', value: String(testsToday), icon: TestTube, color: 'text-emerald-600', bg: 'bg-emerald-50', trend: '+18%' },
    { label: 'Pending Samples', value: String(pendingSamples), icon: Beaker, color: 'text-orange-600', bg: 'bg-orange-50', trend: '-5%' },
    { label: 'Reports Ready', value: String(reportsReady), icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50', trend: '+12%' },
    { label: 'Today\'s Revenue', value: `₹${revenueToday.toLocaleString()}`, icon: DollarSign, color: 'text-purple-600', bg: 'bg-purple-50', trend: '+22%' },
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

  const quickActions = [
    { title: 'New Test Order', icon: Plus, color: 'from-emerald-500 to-teal-600', route: '/lab/orders/new' },
    { title: 'Sample Collection', icon: TestTube, color: 'from-blue-500 to-cyan-600', route: '/lab/samples' },
    { title: 'Enter Results', icon: ClipboardList, color: 'from-purple-500 to-pink-600', route: '/lab/results' },
    { title: 'View Reports', icon: FileText, color: 'from-orange-500 to-red-600', route: '/lab/reports' },
  ];

  // Route-aware content rendering
  const renderContent = () => {
    const path = location.pathname;
    
    // Dashboard - default view
    if (path === '/lab/dashboard') {
      return renderDashboardContent();
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
    <>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => (
          <Card key={index} className="hover:shadow-lg transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                  <p className="text-3xl font-bold">{stat.value}</p>
                  <p className={`text-sm mt-1 ${stat.trend.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                    {stat.trend} this week
                  </p>
                </div>
                <div className={`${stat.bg} p-4 rounded-xl`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {quickActions.map((action, index) => (
          <Card 
            key={index} 
            className="cursor-pointer hover:shadow-lg transition-all transform hover:-translate-y-1"
            onClick={() => navigate(action.route)}
          >
            <CardContent className="pt-6 text-center">
              <div className={`bg-gradient-to-br ${action.color} p-4 rounded-xl w-fit mx-auto mb-3`}>
                <action.icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="font-semibold">{action.title}</h3>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Tests */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Pending Tests</CardTitle>
              <CardDescription>Tests awaiting processing or sample collection</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setPendingFilterOpen(true)}>
              <Filter className="h-4 w-4" />
              Filter
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredPendingTests.map((test) => (
                <div key={test.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${
                      test.priority === 'Urgent' ? 'bg-red-100' : 
                      test.priority === 'Normal' ? 'bg-blue-100' : 'bg-gray-100'
                    }`}>
                      <TestTube className={`h-5 w-5 ${
                        test.priority === 'Urgent' ? 'text-red-600' : 
                        test.priority === 'Normal' ? 'text-blue-600' : 'text-gray-600'
                      }`} />
                    </div>
                    <div>
                      <p className="font-semibold">{test.patient}</p>
                      <p className="text-sm text-muted-foreground">{test.test}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium">{test.time}</p>
                      <Badge variant={
                        test.priority === 'Urgent' ? 'destructive' : 
                        test.priority === 'Normal' ? 'default' : 'secondary'
                      }>
                        {test.priority}
                      </Badge>
                    </div>
                    <Badge variant={
                      test.status === 'Processing' ? 'default' :
                      test.status === 'Sample Collected' ? 'secondary' : 'outline'
                    }>
                      {test.status}
                    </Badge>
                  </div>
                </div>
              ))}
              {filteredPendingTests.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">No pending tests match your filters.</div>
              )}
            </div>
            <Button variant="ghost" className="w-full mt-4 gap-2">
              View All Pending Tests <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Recent Reports & Inventory */}
        <div className="space-y-6">
          {/* Recent Reports */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-600" />
                Recent Reports
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentReports.map((report) => (
                  <div key={report.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{report.patient}</p>
                      <p className="text-xs text-muted-foreground">{report.test}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={report.status === 'Delivered' ? 'default' : 'secondary'} className="text-xs">
                        {report.status}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">{report.time}</p>
                    </div>
                  </div>
                ))}
                {recentReports.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground">No reports yet.</div>
                )}
              </div>
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

          {/* Inventory Alerts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-orange-600" />
                Inventory Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {inventoryAlerts.map((item) => (
                  <div key={item.item} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{item.item}</span>
                      <Badge
                        variant={item.status === 'Low' ? 'destructive' : item.status === 'Warning' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {item.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={Math.min(100, (item.current / item.minimum) * 100)} className="h-2" />
                      <span className="text-xs text-muted-foreground w-16">{item.current}/{item.minimum}</span>
                    </div>
                  </div>
                ))}
                {inventoryAlerts.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground">No inventory alerts.</div>
                )}
              </div>
              <Button variant="outline" className="w-full mt-4" size="sm" onClick={() => navigate('/lab/inventory')}>
                Manage Inventory
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Today's Summary */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Today's Performance Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            <div className="text-center p-4 bg-emerald-50 rounded-lg">
              <div className="text-3xl font-bold text-emerald-600">{todaysSummary.total}</div>
              <div className="text-sm text-muted-foreground">Total Tests</div>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-3xl font-bold text-blue-600">{todaysSummary.completed}</div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <div className="text-3xl font-bold text-orange-600">{todaysSummary.inProgress}</div>
              <div className="text-sm text-muted-foreground">In Progress</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-3xl font-bold text-red-600">{todaysSummary.pending}</div>
              <div className="text-sm text-muted-foreground">Pending</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-3xl font-bold text-purple-600">45 min</div>
              <div className="text-sm text-muted-foreground">Avg TAT</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
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
