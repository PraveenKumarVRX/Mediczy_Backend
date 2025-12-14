import { useState, useRef, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Switch } from '../../components/ui/switch';
import {
  Banknote,
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  Download,
  Send,
  DollarSign,
  CreditCard,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  Calendar,
  User,
  Building,
  Receipt,
  Calculator
} from 'lucide-react';

interface Invoice {
  id: string;
  invoiceNumber: string;
  clientType: 'user' | 'doctor' | 'hospital' | 'pharmacy' | 'corporate';
  clientId: string;
  clientName: string;
  clientEmail: string;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  issueDate: string;
  dueDate: string;
  paidDate?: string;
  description: string;
  services: InvoiceService[];
  paymentMethod?: string;
  createdAt: string;
}

interface InvoiceService {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface BillingStats {
  totalRevenue: number;
  pendingAmount: number;
  paidInvoices: number;
  overdueInvoices: number;
  monthlyRevenue: number;
  avgInvoiceValue: number;
}

interface HSNSACCode {
  id: string;
  code: string;
  type: 'HSN' | 'SAC';
  description: string;
  gstRate: number;
  category: 'goods' | 'services';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface GSTRate {
  id: string;
  rate: number;
  description: string;
  applicableFrom: string;
  isActive: boolean;
}

const sampleInvoices: Invoice[] = [
  {
    id: 'inv_001',
    invoiceNumber: 'INV-2024-001',
    clientType: 'hospital',
    clientId: 'hosp_001',
    clientName: 'Apollo Hospital',
    clientEmail: 'billing@apollo.com',
    amount: 50000,
    taxAmount: 9000,
    totalAmount: 59000,
    currency: 'INR',
    status: 'paid',
    issueDate: '2024-11-01',
    dueDate: '2024-11-30',
    paidDate: '2024-11-15',
    description: 'Monthly subscription and consultation fees',
    services: [
      { id: 'srv_001', description: 'Platform Subscription', quantity: 1, unitPrice: 30000, totalPrice: 30000 },
      { id: 'srv_002', description: 'Consultation Commission', quantity: 100, unitPrice: 200, totalPrice: 20000 }
    ],
    paymentMethod: 'bank_transfer',
    createdAt: '2024-11-01T10:00:00Z'
  },
  {
    id: 'inv_002',
    invoiceNumber: 'INV-2024-002',
    clientType: 'pharmacy',
    clientId: 'pharm_001',
    clientName: 'MedPlus Pharmacy',
    clientEmail: 'accounts@medplus.com',
    amount: 25000,
    taxAmount: 4500,
    totalAmount: 29500,
    currency: 'INR',
    status: 'sent',
    issueDate: '2024-11-10',
    dueDate: '2024-12-10',
    description: 'Platform usage and order processing fees',
    services: [
      { id: 'srv_003', description: 'Order Processing', quantity: 250, unitPrice: 100, totalPrice: 25000 }
    ],
    createdAt: '2024-11-10T14:30:00Z'
  },
  {
    id: 'inv_003',
    invoiceNumber: 'INV-2024-003',
    clientType: 'corporate',
    clientId: 'corp_001',
    clientName: 'TCS Corporate Health',
    clientEmail: 'health@tcs.com',
    amount: 100000,
    taxAmount: 18000,
    totalAmount: 118000,
    currency: 'INR',
    status: 'overdue',
    issueDate: '2024-10-15',
    dueDate: '2024-11-15',
    description: 'Corporate health package for employees',
    services: [
      { id: 'srv_004', description: 'Employee Health Package', quantity: 500, unitPrice: 200, totalPrice: 100000 }
    ],
    createdAt: '2024-10-15T09:00:00Z'
  },
  {
    id: 'inv_004',
    invoiceNumber: 'INV-2024-004',
    clientType: 'doctor',
    clientId: 'doc_001',
    clientName: 'Dr. Rajesh Sharma',
    clientEmail: 'dr.sharma@email.com',
    amount: 15000,
    taxAmount: 2700,
    totalAmount: 17700,
    currency: 'INR',
    status: 'draft',
    issueDate: '2024-11-16',
    dueDate: '2024-12-16',
    description: 'Platform commission for consultations',
    services: [
      { id: 'srv_005', description: 'Consultation Commission', quantity: 75, unitPrice: 200, totalPrice: 15000 }
    ],
    createdAt: '2024-11-16T16:00:00Z'
  }
];

const sampleHSNSACCodes: HSNSACCode[] = [
  {
    id: 'hsn_001',
    code: '9021',
    type: 'HSN',
    description: 'Medical equipment and devices',
    gstRate: 12,
    category: 'goods',
    isActive: true,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z'
  },
  {
    id: 'sac_001',
    code: '99613',
    type: 'SAC',
    description: 'Healthcare and medical consultation services',
    gstRate: 18,
    category: 'services',
    isActive: true,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z'
  },
  {
    id: 'hsn_002',
    code: '3004',
    type: 'HSN',
    description: 'Medicines and pharmaceutical products',
    gstRate: 5,
    category: 'goods',
    isActive: true,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z'
  },
  {
    id: 'sac_002',
    code: '99619',
    type: 'SAC',
    description: 'Other healthcare and wellness services',
    gstRate: 18,
    category: 'services',
    isActive: true,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z'
  },
  {
    id: 'hsn_003',
    code: '9018',
    type: 'HSN',
    description: 'Surgical instruments and medical devices',
    gstRate: 18,
    category: 'goods',
    isActive: true,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z'
  },
  {
    id: 'hsn_004',
    code: '9402',
    type: 'HSN',
    description: 'Hospital furniture and medical fittings',
    gstRate: 18,
    category: 'goods',
    isActive: true,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z'
  }
];

const gstRates: GSTRate[] = [
  { id: 'gst_001', rate: 0, description: 'Exempted', applicableFrom: '2017-07-01', isActive: true },
  { id: 'gst_002', rate: 3, description: 'Essential goods', applicableFrom: '2017-07-01', isActive: true },
  { id: 'gst_003', rate: 5, description: 'Essential items', applicableFrom: '2017-07-01', isActive: true },
  { id: 'gst_004', rate: 12, description: 'Standard rate for goods', applicableFrom: '2017-07-01', isActive: true },
  { id: 'gst_005', rate: 18, description: 'Standard rate for services', applicableFrom: '2017-07-01', isActive: true },
  { id: 'gst_006', rate: 28, description: 'Luxury goods', applicableFrom: '2017-07-01', isActive: true }
];

const BillingManagement = () => {
  const [activeTab, setActiveTab] = useState('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>(sampleInvoices);
  const [hsnSacCodes, setHsnSacCodes] = useState<HSNSACCode[]>(sampleHSNSACCodes);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Invoice['status']>('all');
  const [clientTypeFilter, setClientTypeFilter] = useState<'all' | Invoice['clientType']>('all');
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editingHsnSac, setEditingHsnSac] = useState<HSNSACCode | null>(null);
  const [hsnSacSearchTerm, setHsnSacSearchTerm] = useState('');
  const [hsnSacTypeFilter, setHsnSacTypeFilter] = useState<'all' | 'HSN' | 'SAC'>('all');
  
  const [newInvoice, setNewInvoice] = useState<Partial<Invoice>>({
    clientType: 'user',
    amount: 0,
    taxAmount: 0,
    totalAmount: 0,
    currency: 'INR',
    status: 'draft',
    description: '',
    services: []
  });

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = searchTerm
      ? invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        invoice.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        invoice.description.toLowerCase().includes(searchTerm.toLowerCase())
      : true;

    const matchesStatus = statusFilter === 'all' ? true : invoice.status === statusFilter;
    const matchesClientType = clientTypeFilter === 'all' ? true : invoice.clientType === clientTypeFilter;

    return matchesSearch && matchesStatus && matchesClientType;
  });

  const filteredHsnSacCodes = hsnSacCodes.filter(code => {
    const matchesSearch = hsnSacSearchTerm
      ? code.code.toLowerCase().includes(hsnSacSearchTerm.toLowerCase()) ||
        code.description.toLowerCase().includes(hsnSacSearchTerm.toLowerCase())
      : true;

    const matchesType = hsnSacTypeFilter === 'all' ? true : code.type === hsnSacTypeFilter;

    return matchesSearch && matchesType;
  });

  const stats: BillingStats = {
    totalRevenue: invoices.reduce((sum, inv) => sum + (inv.status === 'paid' ? inv.totalAmount : 0), 0),
    pendingAmount: invoices.reduce((sum, inv) => sum + (inv.status === 'sent' || inv.status === 'overdue' ? inv.totalAmount : 0), 0),
    paidInvoices: invoices.filter(inv => inv.status === 'paid').length,
    overdueInvoices: invoices.filter(inv => inv.status === 'overdue').length,
    monthlyRevenue: invoices.filter(inv => 
      inv.status === 'paid' && 
      new Date(inv.paidDate || '').getMonth() === new Date().getMonth()
    ).reduce((sum, inv) => sum + inv.totalAmount, 0),
    avgInvoiceValue: invoices.length > 0 ? invoices.reduce((sum, inv) => sum + inv.totalAmount, 0) / invoices.length : 0
  };

  const getStatusBadge = (status: Invoice['status']) => {
    const badges = {
      draft: { className: 'bg-gray-100 text-gray-700 border-gray-200', label: 'Draft' },
      sent: { className: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Sent' },
      paid: { className: 'bg-green-100 text-green-700 border-green-200', label: 'Paid' },
      overdue: { className: 'bg-red-100 text-red-700 border-red-200', label: 'Overdue' },
      cancelled: { className: 'bg-gray-100 text-gray-700 border-gray-200', label: 'Cancelled' }
    };
    return badges[status];
  };

  const getClientTypeIcon = (type: Invoice['clientType']) => {
    const icons = {
      user: User,
      doctor: User,
      hospital: Building,
      pharmacy: Building,
      corporate: Building
    };
    return icons[type];
  };

  const calculateTotals = (services: InvoiceService[]) => {
    const amount = services.reduce((sum, service) => sum + service.totalPrice, 0);
    const taxAmount = amount * 0.18; // 18% GST
    const totalAmount = amount + taxAmount;
    return { amount, taxAmount, totalAmount };
  };

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20">
        <div className="space-y-6 lg:space-y-8">
          {/* Enhanced Header */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-green-700 p-6 lg:p-8 text-white shadow-2xl">
            <div className="absolute inset-0 bg-black/10" />
            <div className="absolute -top-4 -right-4 opacity-10">
              <Banknote className="h-32 w-32" />
            </div>
            <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex-1">
                <h2 className="text-3xl lg:text-4xl font-bold mb-2 flex items-center gap-3">
                  <Banknote className="h-8 w-8 lg:h-10 lg:w-10" />
                  Billing Management
                </h2>
                <p className="text-emerald-100 text-base lg:text-lg opacity-90">
                  Comprehensive invoice and financial management system
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 hidden lg:block">
                  <div className="text-center">
                    <div className="text-2xl font-bold">₹{stats.totalRevenue.toLocaleString()}</div>
                    <div className="text-xs text-emerald-200">Total Revenue</div>
                  </div>
                </div>
                <Button 
                  onClick={() => setEditingInvoice({} as Invoice)} 
                  className="bg-white/20 hover:bg-white/30 border border-white/30 backdrop-blur-sm text-white shadow-lg transition-all duration-200 hover:scale-105"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Invoice
                </Button>
              </div>
            </div>
          </div>

          {/* Enhanced Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 lg:gap-6">
            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-green-500/10 via-green-500/5 to-background shadow-lg hover:shadow-xl transition-all duration-300 group admin-card">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-xs lg:text-sm font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">Total Revenue</p>
                    <p className="text-xl lg:text-2xl font-bold text-foreground group-hover:scale-105 transition-transform duration-200">
                      ₹{stats.totalRevenue.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-green-500/15 group-hover:bg-green-500/20 transition-colors duration-200">
                    <DollarSign className="h-6 w-6 lg:h-7 lg:w-7 text-green-600" />
                  </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-background shadow-lg hover:shadow-xl transition-all duration-300 group admin-card">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-xs lg:text-sm font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">Pending Amount</p>
                    <p className="text-xl lg:text-2xl font-bold text-foreground group-hover:scale-105 transition-transform duration-200">
                      ₹{stats.pendingAmount.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-500/15 group-hover:bg-amber-500/20 transition-colors duration-200">
                    <Clock className="h-6 w-6 lg:h-7 lg:w-7 text-amber-600" />
                  </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-background shadow-lg hover:shadow-xl transition-all duration-300 group admin-card">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-xs lg:text-sm font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Paid Invoices</p>
                    <p className="text-xl lg:text-2xl font-bold text-foreground group-hover:scale-105 transition-transform duration-200">
                      {stats.paidInvoices}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-500/15 group-hover:bg-emerald-500/20 transition-colors duration-200">
                    <CheckCircle className="h-6 w-6 lg:h-7 lg:w-7 text-emerald-600" />
                  </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-red-500/10 via-red-500/5 to-background shadow-lg hover:shadow-xl transition-all duration-300 group admin-card">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-xs lg:text-sm font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">Overdue</p>
                    <p className="text-xl lg:text-2xl font-bold text-foreground group-hover:scale-105 transition-transform duration-200">
                      {stats.overdueInvoices}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-red-500/15 group-hover:bg-red-500/20 transition-colors duration-200">
                    <XCircle className="h-6 w-6 lg:h-7 lg:w-7 text-red-600" />
                  </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-background shadow-lg hover:shadow-xl transition-all duration-300 group admin-card">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-xs lg:text-sm font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">Monthly Revenue</p>
                    <p className="text-xl lg:text-2xl font-bold text-foreground group-hover:scale-105 transition-transform duration-200">
                      ₹{stats.monthlyRevenue.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-500/15 group-hover:bg-blue-500/20 transition-colors duration-200">
                    <Calendar className="h-6 w-6 lg:h-7 lg:w-7 text-blue-600" />
                  </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-background shadow-lg hover:shadow-xl transition-all duration-300 group admin-card">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-xs lg:text-sm font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">Avg. Invoice</p>
                    <p className="text-xl lg:text-2xl font-bold text-foreground group-hover:scale-105 transition-transform duration-200">
                      ₹{stats.avgInvoiceValue.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-purple-500/15 group-hover:bg-purple-500/20 transition-colors duration-200">
                    <Receipt className="h-6 w-6 lg:h-7 lg:w-7 text-purple-600" />
                  </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </CardContent>
            </Card>
          </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">${''}
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="recurring">Recurring</TabsTrigger>
            <TabsTrigger value="hsn-sac">HSN/SAC</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="invoices">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Invoice Management ({filteredInvoices.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Filters */}
                <div className="flex flex-col lg:flex-row gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search invoices..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                    <SelectTrigger className="w-full lg:w-[180px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={clientTypeFilter} onValueChange={(v) => setClientTypeFilter(v as any)}>
                    <SelectTrigger className="w-full lg:w-[180px]">
                      <SelectValue placeholder="Client Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Clients</SelectItem>
                      <SelectItem value="user">Users</SelectItem>
                      <SelectItem value="doctor">Doctors</SelectItem>
                      <SelectItem value="hospital">Hospitals</SelectItem>
                      <SelectItem value="pharmacy">Pharmacies</SelectItem>
                      <SelectItem value="corporate">Corporate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Invoices Table */}
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInvoices.map((invoice) => {
                        const ClientIcon = getClientTypeIcon(invoice.clientType);
                        const statusBadge = getStatusBadge(invoice.status);
                        
                        return (
                          <TableRow key={invoice.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{invoice.invoiceNumber}</div>
                                <div className="text-sm text-muted-foreground">
                                  {new Date(invoice.issueDate).toLocaleDateString()}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-blue-500/10">
                                  <ClientIcon className="h-4 w-4 text-blue-600" />
                                </div>
                                <div>
                                  <div className="font-medium">{invoice.clientName}</div>
                                  <div className="text-sm text-muted-foreground capitalize">
                                    {invoice.clientType}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">₹{invoice.totalAmount.toLocaleString()}</div>
                                <div className="text-sm text-muted-foreground">
                                  +₹{invoice.taxAmount.toLocaleString()} tax
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={statusBadge.className}>
                                {statusBadge.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className={`text-sm ${
                                invoice.status === 'overdue' ? 'text-red-600 font-medium' : 'text-muted-foreground'
                              }`}>
                                {new Date(invoice.dueDate).toLocaleDateString()}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => setViewingInvoice(invoice)}>
                                      <Eye className="h-3 w-3" />
                                    </Button>
                                  </DialogTrigger>
                                </Dialog>
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => setEditingInvoice(invoice)}>
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                                  <Download className="h-3 w-3" />
                                </Button>
                                {invoice.status === 'draft' && (
                                  <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-blue-600">
                                    <Send className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recurring">
            <Card>
              <CardHeader>
                <CardTitle>Recurring Billing</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <Calculator className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Recurring Billing Setup</h3>
                  <p className="text-muted-foreground mb-4">
                    Set up recurring billing for subscriptions and regular services
                  </p>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Recurring Plan
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hsn-sac">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  HSN/SAC Code Management ({filteredHsnSacCodes.length})
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  Manage HSN (Harmonized System of Nomenclature) codes for goods and SAC (Service Accounting Code) for services with their respective GST rates
                </p>
              </CardHeader>
              <CardContent>
                {/* HSN/SAC Filters */}
                <div className="flex flex-col lg:flex-row gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search HSN/SAC codes or descriptions..."
                      value={hsnSacSearchTerm}
                      onChange={(e) => setHsnSacSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={hsnSacTypeFilter} onValueChange={(v) => setHsnSacTypeFilter(v as any)}>
                    <SelectTrigger className="w-full lg:w-[150px]">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="HSN">HSN (Goods)</SelectItem>
                      <SelectItem value="SAC">SAC (Services)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button className="bg-green-600 hover:bg-green-700">
                    <Plus className="mr-2 h-4 w-4" />
                    Add HSN/SAC Code
                  </Button>
                </div>

                {/* GST Rates Summary */}
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
                  {gstRates.map(rate => {
                    const codesWithRate = filteredHsnSacCodes.filter(code => code.gstRate === rate.rate);
                    return (
                      <Card key={rate.id}>
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-green-600">{rate.rate}%</div>
                          <div className="text-xs text-muted-foreground">{rate.description}</div>
                          <div className="text-sm font-medium">{codesWithRate.length} codes</div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* HSN/SAC Codes Table */}
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>GST Rate</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHsnSacCodes.map((code) => (
                        <TableRow key={code.id}>
                          <TableCell>
                            <div className="font-mono font-medium">{code.code}</div>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline" 
                              className={code.type === 'HSN' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}
                            >
                              {code.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-xs">
                              <div className="font-medium text-sm">{code.description}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline"
                              className={code.category === 'goods' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}
                            >
                              {code.category === 'goods' ? 'Goods' : 'Services'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-lg">{code.gstRate}%</span>
                              {code.gstRate === 0 && (
                                <Badge variant="outline" className="bg-gray-100 text-gray-700">Exempt</Badge>
                              )}
                              {code.gstRate === 5 && (
                                <Badge variant="outline" className="bg-green-100 text-green-700">Essential</Badge>
                              )}
                              {code.gstRate === 28 && (
                                <Badge variant="outline" className="bg-red-100 text-red-700">Luxury</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline" 
                              className={code.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}
                            >
                              {code.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-8 w-8 p-0"
                                onClick={() => setEditingHsnSac(code)}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-8 w-8 p-0 text-red-600"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {filteredHsnSacCodes.length === 0 && (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No HSN/SAC codes found</h3>
                    <p className="text-muted-foreground mb-4">
                      {hsnSacSearchTerm || hsnSacTypeFilter !== 'all' 
                        ? 'Try adjusting your search or filter criteria'
                        : 'Add HSN/SAC codes to manage GST rates for different products and services'
                      }
                    </p>
                    <Button className="bg-green-600 hover:bg-green-700">
                      <Plus className="mr-2 h-4 w-4" />
                      Add First HSN/SAC Code
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Revenue Analytics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">This Month</span>
                      <span className="font-medium">₹{stats.monthlyRevenue.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Revenue</span>
                      <span className="font-medium">₹{stats.totalRevenue.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Outstanding</span>
                      <span className="font-medium text-amber-600">₹{stats.pendingAmount.toLocaleString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Client Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {['hospital', 'corporate', 'pharmacy', 'doctor', 'user'].map(type => {
                      const count = invoices.filter(inv => inv.clientType === type).length;
                      const revenue = invoices
                        .filter(inv => inv.clientType === type && inv.status === 'paid')
                        .reduce((sum, inv) => sum + inv.totalAmount, 0);
                      
                      return (
                        <div key={type} className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground capitalize">{type}s</span>
                          <div className="text-right">
                            <div className="font-medium">{count} invoices</div>
                            <div className="text-xs text-muted-foreground">₹{revenue.toLocaleString()}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Billing Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label>Default Currency</Label>
                    <Select defaultValue="INR">
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INR">Indian Rupee (₹)</SelectItem>
                        <SelectItem value="USD">US Dollar ($)</SelectItem>
                        <SelectItem value="EUR">Euro (€)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Tax Rate (%)</Label>
                    <Input type="number" defaultValue="18" placeholder="Enter tax percentage" />
                  </div>
                  <div>
                    <Label>Invoice Prefix</Label>
                    <Input defaultValue="INV" placeholder="Enter invoice prefix" />
                  </div>
                  <div>
                    <Label>Payment Terms (Days)</Label>
                    <Input type="number" defaultValue="30" placeholder="Payment due days" />
                  </div>
                </div>
                <Button>Save Settings</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* View Invoice Dialog */}
        {viewingInvoice && (
          <Dialog open={!!viewingInvoice} onOpenChange={() => setViewingInvoice(null)}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Invoice Details - {viewingInvoice.invoiceNumber}</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-semibold mb-2">Client Information</h3>
                    <div className="space-y-2 text-sm">
                      <div><strong>Name:</strong> {viewingInvoice.clientName}</div>
                      <div><strong>Email:</strong> {viewingInvoice.clientEmail}</div>
                      <div><strong>Type:</strong> {viewingInvoice.clientType}</div>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Invoice Information</h3>
                    <div className="space-y-2 text-sm">
                      <div><strong>Issue Date:</strong> {new Date(viewingInvoice.issueDate).toLocaleDateString()}</div>
                      <div><strong>Due Date:</strong> {new Date(viewingInvoice.dueDate).toLocaleDateString()}</div>
                      <div><strong>Status:</strong> <Badge variant="outline" className={getStatusBadge(viewingInvoice.status).className}>{getStatusBadge(viewingInvoice.status).label}</Badge></div>
                      {viewingInvoice.paidDate && <div><strong>Paid Date:</strong> {new Date(viewingInvoice.paidDate).toLocaleDateString()}</div>}
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-semibold mb-2">Services</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Unit Price</TableHead>
                        <TableHead>Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewingInvoice.services.map(service => (
                        <TableRow key={service.id}>
                          <TableCell>{service.description}</TableCell>
                          <TableCell>{service.quantity}</TableCell>
                          <TableCell>₹{service.unitPrice.toLocaleString()}</TableCell>
                          <TableCell>₹{service.totalPrice.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                
                <div className="border-t pt-4">
                  <div className="flex justify-end">
                    <div className="space-y-2 text-right">
                      <div className="flex justify-between gap-8">
                        <span>Subtotal:</span>
                        <span>₹{viewingInvoice.amount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-8">
                        <span>Tax:</span>
                        <span>₹{viewingInvoice.taxAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-8 font-semibold text-lg border-t pt-2">
                        <span>Total:</span>
                        <span>₹{viewingInvoice.totalAmount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button><Download className="mr-2 h-4 w-4" />Download PDF</Button>
                  <Button variant="outline"><Send className="mr-2 h-4 w-4" />Send Email</Button>
                  <Button variant="outline" onClick={() => setEditingInvoice(viewingInvoice)}>
                    <Edit className="mr-2 h-4 w-4" />Edit
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Edit HSN/SAC Dialog */}
        {editingHsnSac && (
          <Dialog open={!!editingHsnSac} onOpenChange={() => setEditingHsnSac(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingHsnSac.id ? 'Edit' : 'Add'} HSN/SAC Code</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Code Type</Label>
                  <Select defaultValue={editingHsnSac.type}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HSN">HSN (Harmonized System of Nomenclature)</SelectItem>
                      <SelectItem value="SAC">SAC (Service Accounting Code)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    HSN for goods/products, SAC for services
                  </p>
                </div>
                
                <div>
                  <Label>Code</Label>
                  <Input 
                    defaultValue={editingHsnSac.code} 
                    placeholder={editingHsnSac.type === 'HSN' ? "e.g., 9021" : "e.g., 99613"}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {editingHsnSac.type === 'HSN' 
                      ? '4-digit HSN classification code for goods'
                      : '5-digit SAC classification code for services (99613, 99619)'
                    }
                  </p>
                </div>
                
                <div>
                  <Label>Description</Label>
                  <Input defaultValue={editingHsnSac.description} placeholder="Enter detailed description" />
                </div>
                
                <div>
                  <Label>Category</Label>
                  <Select defaultValue={editingHsnSac.category}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="goods">Goods</SelectItem>
                      <SelectItem value="services">Services</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>GST Rate (%)</Label>
                  <Select defaultValue={editingHsnSac.gstRate.toString()}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0% (Exempted)</SelectItem>
                      <SelectItem value="3">3% (Essential goods)</SelectItem>
                      <SelectItem value="5">5% (Essential items)</SelectItem>
                      <SelectItem value="12">12% (Standard goods)</SelectItem>
                      <SelectItem value="18">18% (Standard services)</SelectItem>
                      <SelectItem value="28">28% (Luxury items)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Current GST rates as per Indian tax structure
                  </p>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch defaultChecked={editingHsnSac.isActive} />
                  <Label>Active</Label>
                  <p className="text-xs text-muted-foreground ml-2">
                    Only active codes will be available for billing
                  </p>
                </div>
                
                <div className="flex gap-2 pt-4">
                  <Button className="flex-1 bg-green-600 hover:bg-green-700">
                    {editingHsnSac.id ? 'Update' : 'Create'} Code
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => setEditingHsnSac(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default BillingManagement;