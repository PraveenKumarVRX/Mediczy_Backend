import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Pill,
  Package,
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
  Users,
  DollarSign,
  Clock,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  RefreshCw,
  Plus,
  Search,
  Filter,
  Download,
  Edit,
  Trash2,
  Eye,
  CheckCircle,
  AlertCircle,
  BarChart3,
  Settings,
  Phone,
  Mail,
  MapPin,
  TrendingDown,
  CreditCard,
  ClipboardList,
  Box,
} from 'lucide-react';
import PharmacyLayout from '@/components/pharmacy/PharmacyLayout';

const PharmacyDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [pharmacyData, setPharmacyData] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('pharmacyToken');
    const data = localStorage.getItem('pharmacyData');
    
    if (!token) {
      navigate('/pharmacy/login');
      return;
    }
    
    if (data) {
      setPharmacyData(JSON.parse(data));
    }
  }, [navigate]);

  const stats = [
    {
      title: 'Total Medicines',
      value: '2,847',
      change: '+12%',
      trend: 'up',
      icon: Pill,
      color: 'bg-teal-500',
    },
    {
      title: "Today's Sales",
      value: '₹45,280',
      change: '+8%',
      trend: 'up',
      icon: DollarSign,
      color: 'bg-green-500',
    },
    {
      title: 'Pending Orders',
      value: '23',
      change: '-5%',
      trend: 'down',
      icon: ShoppingCart,
      color: 'bg-blue-500',
    },
    {
      title: 'Low Stock Items',
      value: '18',
      change: '+3',
      trend: 'up',
      icon: AlertTriangle,
      color: 'bg-amber-500',
    },
  ];

  const recentSales = [
    { id: 'INV-001', customer: 'Rahul Sharma', items: 3, amount: '₹1,250', time: '10 mins ago' },
    { id: 'INV-002', customer: 'Priya Patel', items: 5, amount: '₹2,480', time: '25 mins ago' },
    { id: 'INV-003', customer: 'Amit Kumar', items: 2, amount: '₹680', time: '45 mins ago' },
    { id: 'INV-004', customer: 'Sunita Devi', items: 8, amount: '₹4,120', time: '1 hour ago' },
  ];

  const expiringMedicines = [
    { name: 'Paracetamol 500mg', batch: 'B001', expiry: '15 Jan 2025', qty: 150 },
    { name: 'Amoxicillin 250mg', batch: 'B045', expiry: '20 Jan 2025', qty: 80 },
    { name: 'Cetirizine 10mg', batch: 'B089', expiry: '28 Jan 2025', qty: 200 },
  ];

  const lowStockItems = [
    { name: 'Metformin 500mg', current: 25, minimum: 100, status: 'critical' },
    { name: 'Atorvastatin 10mg', current: 45, minimum: 80, status: 'warning' },
    { name: 'Omeprazole 20mg', current: 30, minimum: 75, status: 'warning' },
  ];

  // Route-aware content rendering
  const renderContent = () => {
    const path = location.pathname;
    
    if (path === '/pharmacy/dashboard') return renderDashboardContent();
    else if (path === '/pharmacy/pos') return renderPOSContent();
    else if (path === '/pharmacy/prescriptions') return renderPrescriptionsContent();
    else if (path === '/pharmacy/inventory') return renderInventoryContent();
    else if (path === '/pharmacy/stock-alerts') return renderStockAlertsContent();
    else if (path === '/pharmacy/batches') return renderBatchesContent();
    else if (path === '/pharmacy/purchase-orders') return renderPurchaseOrdersContent();
    else if (path === '/pharmacy/customers') return renderCustomersContent();
    else if (path === '/pharmacy/reports') return renderReportsContent();
    else if (path === '/pharmacy/invoices') return renderInvoicesContent();
    else if (path === '/pharmacy/expiry') return renderExpiryContent();
    else if (path === '/pharmacy/analytics') return renderAnalyticsContent();
    else if (path === '/pharmacy/settings') return renderSettingsContent();
    
    return renderDashboardContent();
  };

  const renderDashboardContent = () => (
    <div className="p-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome, {pharmacyData?.name || 'Pharmacy'}
            </h1>
            <p className="text-gray-500 mt-1">
              Manage your pharmacy operations efficiently
            </p>
          </div>
          <Button 
            className="bg-teal-600 hover:bg-teal-700"
            onClick={() => navigate('/pharmacy/pos')}
          >
            <ShoppingCart className="mr-2 h-4 w-4" />
            New Sale
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title} className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className={`${stat.color} p-3 rounded-xl`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <div className={`flex items-center gap-1 text-sm ${
                      stat.trend === 'up' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {stat.trend === 'up' ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4" />
                      )}
                      {stat.change}
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="text-sm text-gray-500">{stat.title}</p>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Recent Sales */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">Recent Sales</CardTitle>
                <CardDescription>Today's latest transactions</CardDescription>
              </div>
              <Button variant="ghost" size="sm">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="bg-teal-100 p-2 rounded-lg">
                        <FileText className="h-4 w-4 text-teal-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{sale.customer}</p>
                        <p className="text-sm text-gray-500">{sale.items} items • {sale.time}</p>
                      </div>
                    </div>
                    <span className="font-semibold text-green-600">{sale.amount}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Low Stock Alerts */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <CardTitle className="text-lg font-semibold">Low Stock Alerts</CardTitle>
              </div>
              <CardDescription>Items that need immediate attention</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {lowStockItems.map((item, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-900">{item.name}</span>
                      <span className={`text-sm px-2 py-1 rounded-full ${
                        item.status === 'critical' 
                          ? 'bg-red-100 text-red-700' 
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {item.current}/{item.minimum}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          item.status === 'critical' ? 'bg-red-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${(item.current / item.minimum) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4">
                View All Stock Alerts
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Expiring Medicines */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-red-500" />
              <CardTitle className="text-lg font-semibold">Expiring Soon</CardTitle>
            </div>
            <CardDescription>Medicines expiring within 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Medicine Name</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Batch No.</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Expiry Date</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Quantity</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringMedicines.map((med, idx) => (
                    <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Pill className="h-4 w-4 text-teal-500" />
                          <span className="font-medium">{med.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-600">{med.batch}</td>
                      <td className="py-3 px-4">
                        <span className="text-red-600 font-medium">{med.expiry}</span>
                      </td>
                      <td className="py-3 px-4 text-gray-600">{med.qty} units</td>
                      <td className="py-3 px-4">
                        <Button variant="outline" size="sm">
                          Take Action
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
          <Button variant="outline" className="h-24 flex-col gap-2" onClick={() => navigate('/pharmacy/inventory')}>
            <Package className="h-6 w-6 text-teal-600" />
            <span>Add Stock</span>
          </Button>
          <Button variant="outline" className="h-24 flex-col gap-2" onClick={() => navigate('/pharmacy/prescriptions')}>
            <FileText className="h-6 w-6 text-blue-600" />
            <span>New Prescription</span>
          </Button>
          <Button variant="outline" className="h-24 flex-col gap-2" onClick={() => navigate('/pharmacy/customers')}>
            <Users className="h-6 w-6 text-purple-600" />
            <span>Customers</span>
          </Button>
          <Button variant="outline" className="h-24 flex-col gap-2" onClick={() => navigate('/pharmacy/reports')}>
            <TrendingUp className="h-6 w-6 text-green-600" />
            <span>Reports</span>
          </Button>
        </div>
      </div>
  );

  const renderPOSContent = () => (
    <div className="space-y-6 p-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Point of Sale</h2>
          <p className="text-muted-foreground">Quick billing and sales</p>
        </div>
        <Button 
          className="gap-2"
          onClick={() => {
            alert('New Sale functionality coming soon! This will open a new sales transaction.');
          }}
        >
          <ShoppingCart className="h-4 w-4" />
          New Sale
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Add Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input placeholder="Search medicine by name or barcode..." />
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-4">
                    <Pill className="h-6 w-6 text-teal-600" />
                    <div>
                      <h4 className="font-semibold">Medicine {i + 1}</h4>
                      <p className="text-sm text-muted-foreground">₹{(i + 1) * 100} • Stock: {50 + i * 10}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Input type="number" defaultValue="1" className="w-20" />
                    <Button size="sm">Add</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bill Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-center py-8 text-muted-foreground">
                No items added
              </div>
              <div className="pt-4 border-t space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-semibold">₹0</span>
                </div>
                <div className="flex justify-between">
                  <span>Discount:</span>
                  <span className="font-semibold">₹0</span>
                </div>
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span>₹0</span>
                </div>
              </div>
              <Button className="w-full" size="lg">Complete Sale</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderPrescriptionsContent = () => (
    <div className="space-y-6 p-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Prescriptions</h2>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Upload Prescription
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>All Prescriptions</CardTitle>
            <div className="flex gap-2">
              <Input placeholder="Search prescriptions..." className="w-64" />
              <Button variant="outline" size="icon"><Filter className="h-4 w-4" /></Button>
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
                    <h4 className="font-semibold">Prescription #{1000 + i}</h4>
                    <p className="text-sm text-muted-foreground">Patient Name • Dr. {['Smith', 'Patel', 'Kumar'][i % 3]}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge>{['Pending', 'Filled', 'Partial'][i % 3]}</Badge>
                  <Button variant="outline" size="sm"><Eye className="h-4 w-4" /></Button>
                  <Button size="sm">Fill</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderInventoryContent = () => (
    <div className="space-y-6 p-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Inventory Management</h2>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add Medicine
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <Package className="h-8 w-8 text-teal-600 mb-2" />
            <div className="text-2xl font-bold">2,847</div>
            <p className="text-sm text-muted-foreground">Total Items</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <AlertTriangle className="h-8 w-8 text-orange-600 mb-2" />
            <div className="text-2xl font-bold">18</div>
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
            <DollarSign className="h-8 w-8 text-green-600 mb-2" />
            <div className="text-2xl font-bold">₹12.5L</div>
            <p className="text-sm text-muted-foreground">Total Value</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Medicine Stock</CardTitle>
            <Input placeholder="Search medicines..." className="w-64" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-4">
                  <Pill className="h-6 w-6 text-teal-600" />
                  <div>
                    <h4 className="font-semibold">Medicine {i + 1}</h4>
                    <p className="text-sm text-muted-foreground">Stock: {100 + i * 50} • Price: ₹{(i + 1) * 50}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm"><Edit className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm"><Plus className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderStockAlertsContent = () => (
    <div className="space-y-6 p-8">
      <h2 className="text-2xl font-bold">Stock Alerts</h2>
      
      <Tabs defaultValue="low">
        <TabsList>
          <TabsTrigger value="low">Low Stock</TabsTrigger>
          <TabsTrigger value="out">Out of Stock</TabsTrigger>
          <TabsTrigger value="expiring">Expiring Soon</TabsTrigger>
        </TabsList>
        <TabsContent value="low">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="p-4 bg-amber-50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="font-semibold">Medicine {i + 1}</h4>
                        <p className="text-sm text-muted-foreground">Current: {25 + i * 5} • Min: {100 + i * 10}</p>
                      </div>
                      <Button size="sm">Reorder</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="out">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="p-4 bg-red-50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="font-semibold text-red-900">Medicine {i + 1}</h4>
                        <p className="text-sm text-red-700">Out of stock - Urgent reorder required</p>
                      </div>
                      <Button size="sm" variant="destructive">Order Now</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="expiring">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {expiringMedicines.map((med, i) => (
                  <div key={i} className="p-4 bg-orange-50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="font-semibold">{med.name}</h4>
                        <p className="text-sm text-muted-foreground">Batch: {med.batch} • Expires: {med.expiry} • Qty: {med.qty}</p>
                      </div>
                      <Button size="sm">Take Action</Button>
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

  const renderBatchesContent = () => (
    <div className="space-y-6 p-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Batch Management</h2>
        <Button 
          className="gap-2"
          onClick={() => {
            alert('Add Batch functionality coming soon! This will open a form to add a new medicine batch.');
          }}
        >
          <Plus className="h-4 w-4" />
          Add Batch
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Batches</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Medicine</th>
                  <th className="text-left py-3 px-4">Batch No.</th>
                  <th className="text-left py-3 px-4">MFG Date</th>
                  <th className="text-left py-3 px-4">Expiry Date</th>
                  <th className="text-left py-3 px-4">Quantity</th>
                  <th className="text-left py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...Array(10)].map((_, i) => (
                  <tr key={i} className="border-b hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold">Medicine {i + 1}</td>
                    <td className="py-3 px-4">B{100 + i}</td>
                    <td className="py-3 px-4">Jan {i + 1}, 2024</td>
                    <td className="py-3 px-4">Jan {i + 1}, 2026</td>
                    <td className="py-3 px-4">{500 + i * 100}</td>
                    <td className="py-3 px-4">
                      <Badge variant={i % 3 === 0 ? 'default' : 'secondary'}>
                        {i % 3 === 0 ? 'Active' : 'Low'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderPurchaseOrdersContent = () => (
    <div className="space-y-6 p-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Purchase Orders</h2>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          New Purchase Order
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <h4 className="font-semibold">PO #{2000 + i}</h4>
                  <p className="text-sm text-muted-foreground">Supplier {i + 1} • Items: {5 + i} • Amount: ₹{(i + 1) * 10000}</p>
                </div>
                <div className="flex gap-2">
                  <Badge>{['Pending', 'Approved', 'Received'][i % 3]}</Badge>
                  <Button variant="outline" size="sm"><Eye className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderCustomersContent = () => (
    <div className="space-y-6 p-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Customer Management</h2>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add Customer
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Customer List</CardTitle>
            <Input placeholder="Search customers..." className="w-64" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-4">
                  <Users className="h-6 w-6 text-purple-600" />
                  <div>
                    <h4 className="font-semibold">Customer {i + 1}</h4>
                    <p className="text-sm text-muted-foreground">ID: CUST{1000 + i} • Phone: +91-98765{i}4321</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">View History</Button>
                  <Button variant="outline" size="sm"><Edit className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderReportsContent = () => (
    <div className="space-y-6 p-8">
      <h2 className="text-2xl font-bold">Reports & Analytics</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {['Sales Report', 'Inventory Report', 'Purchase Report', 'Expiry Report', 'GST Report', 'Profit/Loss Report'].map((report, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle className="text-lg">{report}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button className="w-full gap-2">
                <Download className="h-4 w-4" />
                Generate Report
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderInvoicesContent = () => (
    <div className="space-y-6 p-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Invoices</h2>
        <Button 
          className="gap-2"
          onClick={() => {
            alert('Create Invoice functionality coming soon! This will open a form to create a new invoice.');
          }}
        >
          <Plus className="h-4 w-4" />
          New Invoice
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <h4 className="font-semibold">Invoice #{3000 + i}</h4>
                  <p className="text-sm text-muted-foreground">Customer {i + 1} • ₹{1000 + i * 500} • {new Date().toLocaleDateString()}</p>
                </div>
                <div className="flex gap-2">
                  <Badge>{['Paid', 'Pending', 'Overdue'][i % 3]}</Badge>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      alert(`Viewing invoice #${3000 + i} details...`);
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      alert(`Editing invoice #${3000 + i}...`);
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      alert(`Downloading invoice #${3000 + i} as PDF...`);
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderExpiryContent = () => (
    <div className="space-y-6 p-8">
      <h2 className="text-2xl font-bold">Expiry Management</h2>
      
      <Card>
        <CardHeader>
          <CardTitle>Medicines Expiring Soon</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Medicine</th>
                  <th className="text-left py-3 px-4">Batch</th>
                  <th className="text-left py-3 px-4">Expiry Date</th>
                  <th className="text-left py-3 px-4">Quantity</th>
                  <th className="text-left py-3 px-4">Days Left</th>
                  <th className="text-left py-3 px-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {expiringMedicines.map((med, i) => (
                  <tr key={i} className="border-b hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold">{med.name}</td>
                    <td className="py-3 px-4">{med.batch}</td>
                    <td className="py-3 px-4 text-red-600">{med.expiry}</td>
                    <td className="py-3 px-4">{med.qty}</td>
                    <td className="py-3 px-4">
                      <Badge variant="destructive">{10 + i * 5} days</Badge>
                    </td>
                    <td className="py-3 px-4">
                      <Button size="sm" variant="outline">Discount</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderAnalyticsContent = () => (
    <div className="space-y-6 p-8">
      <h2 className="text-2xl font-bold">Business Analytics</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <DollarSign className="h-8 w-8 text-green-600 mb-2" />
            <div className="text-2xl font-bold">₹12.5L</div>
            <p className="text-sm text-muted-foreground">Monthly Revenue</p>
            <p className="text-xs text-green-600 mt-1">+18% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <ShoppingCart className="h-8 w-8 text-blue-600 mb-2" />
            <div className="text-2xl font-bold">1,245</div>
            <p className="text-sm text-muted-foreground">Total Sales</p>
            <p className="text-xs text-blue-600 mt-1">+12% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Users className="h-8 w-8 text-purple-600 mb-2" />
            <div className="text-2xl font-bold">845</div>
            <p className="text-sm text-muted-foreground">Customers</p>
            <p className="text-xs text-purple-600 mt-1">+8% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <TrendingUp className="h-8 w-8 text-teal-600 mb-2" />
            <div className="text-2xl font-bold">₹425</div>
            <p className="text-sm text-muted-foreground">Avg Order Value</p>
            <p className="text-xs text-teal-600 mt-1">+5% from last month</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Sales Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              Chart: Monthly sales trend
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top Selling Medicines</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              Chart: Product sales distribution
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderSettingsContent = () => (
    <div className="space-y-6 p-8">
      <h2 className="text-2xl font-bold">Pharmacy Settings</h2>
      
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="tax">Tax Settings</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Pharmacy Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Pharmacy Name</label>
                <Input placeholder="Enter pharmacy name" className="mt-1" defaultValue={pharmacyData?.name} />
              </div>
              <div>
                <label className="text-sm font-medium">License Number</label>
                <Input placeholder="Enter license number" className="mt-1" />
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
              <Button>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <CardTitle>Billing Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-muted-foreground">Billing settings and invoice templates</div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );

  return (
    <PharmacyLayout>
      {renderContent()}
    </PharmacyLayout>
  );
};

export default PharmacyDashboard;
