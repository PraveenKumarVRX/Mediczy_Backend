import { useState, useEffect } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import MainLayoutdoctor from '@/components/layout/MainLayoutdoctor';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DollarSign,
  Receipt,
  FileText,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
  Download,
  Eye,
  Search,
  RefreshCw,
  Calendar,
  CreditCard,
  Wallet,
  IndianRupee,
  Trash2,
  Loader2,
  Send,
} from 'lucide-react';
import api from "@/utils/api";
import { toast } from 'sonner';

interface Payment {
  id: number;
  paymentId: string;
  amount: number;
  status: string;
  gateway: string;
  method: string;
  createdAt: string;
  patient?: {
    id: number;
    firstName: string;
    lastName: string;
  };
}

interface Invoice {
  id: number;
  invoiceNumber: string;
  total: number;
  status: string;
  dueDate: string;
  createdAt: string;
  patient?: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
  };
  items?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
}

interface BillingStats {
  earnings: {
    monthly: string;
    total: string;
    pending: string;
  };
  payments: {
    successful: number;
  };
  invoices: {
    paid: number;
    pending: number;
    overdue: number;
  };
  recentPayments: Payment[];
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

const DoctorBilling = () => {
  const { currentDoctor } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('overview');

  // Create Invoice Modal
  const [isCreateInvoiceOpen, setIsCreateInvoiceOpen] = useState(false);
  const [invoicePatientId, setInvoicePatientId] = useState('');
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([
    { description: 'Consultation Fee', quantity: 1, unitPrice: 500 }
  ]);
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [patients, setPatients] = useState<Array<{id: number; firstName: string; lastName: string}>>([]);

  useEffect(() => {
    fetchBillingData();
    fetchPatients();
  }, []);

  const fetchBillingData = async () => {
    try {
      setLoading(true);
      const [statsRes, paymentsRes, invoicesRes] = await Promise.all([
        api.get('/billing/doctor/stats'),
        api.get('/billing/doctor/payments'),
        api.get('/billing/doctor/invoices')
      ]);

      setStats(statsRes.data.data);
      setPayments(paymentsRes.data.data.payments || []);
      setInvoices(invoicesRes.data.data.invoices || []);
    } catch (err: any) {
      console.error('Fetch billing error:', err);
      toast.error('Failed to load billing data');
    } finally {
      setLoading(false);
    }
  };

  const fetchPatients = async () => {
    try {
      const response = await api.get('/doctors/my-patients');
      setPatients(response.data.patients || []);
    } catch (err) {
      console.error('Fetch patients error:', err);
    }
  };

  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
      success: { variant: 'default', className: 'bg-green-100 text-green-700 hover:bg-green-100' },
      paid: { variant: 'default', className: 'bg-green-100 text-green-700 hover:bg-green-100' },
      pending: { variant: 'secondary', className: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100' },
      sent: { variant: 'secondary', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
      failed: { variant: 'destructive', className: '' },
      overdue: { variant: 'destructive', className: '' },
      cancelled: { variant: 'outline', className: '' },
      draft: { variant: 'outline', className: '' },
    };
    
    const config = statusConfig[status] || { variant: 'secondary' as const, className: '' };
    return (
      <Badge variant={config.variant} className={config.className}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const addInvoiceItem = () => {
    setInvoiceItems([...invoiceItems, { description: '', quantity: 1, unitPrice: 0 }]);
  };

  const removeInvoiceItem = (index: number) => {
    if (invoiceItems.length > 1) {
      setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
    }
  };

  const updateInvoiceItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const updated = [...invoiceItems];
    updated[index] = { ...updated[index], [field]: value };
    setInvoiceItems(updated);
  };

  const calculateInvoiceTotal = () => {
    const subtotal = invoiceItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    return subtotal - invoiceDiscount;
  };

  const handleCreateInvoice = async () => {
    if (!invoicePatientId) {
      toast.error('Please select a patient');
      return;
    }

    if (invoiceItems.some(item => !item.description || item.unitPrice <= 0)) {
      toast.error('Please fill in all item details');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await api.post('/billing/doctor/invoices/create', {
        patientId: parseInt(invoicePatientId),
        items: invoiceItems,
        notes: invoiceNotes,
        discount: invoiceDiscount
      });

      if (response.data.success) {
        toast.success('Invoice created successfully!');
        setIsCreateInvoiceOpen(false);
        setInvoicePatientId('');
        setInvoiceItems([{ description: 'Consultation Fee', quantity: 1, unitPrice: 500 }]);
        setInvoiceNotes('');
        setInvoiceDiscount(0);
        fetchBillingData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create invoice');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = searchTerm === '' || 
      payment.patient?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.patient?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.paymentId?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = searchTerm === '' || 
      invoice.patient?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.patient?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <MainLayoutdoctor>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading billing data...</p>
          </div>
        </div>
      </MainLayoutdoctor>
    );
  }

  return (
    <MainLayoutdoctor>
      <div className="min-h-screen">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                <Wallet className="h-8 w-8 text-teal-500" />
                Billing & Payments
              </h1>
              <p className="text-muted-foreground mt-1">Manage your earnings, invoices, and payment receipts</p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={fetchBillingData} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button onClick={() => setIsCreateInvoiceOpen(true)} className="bg-teal-600 hover:bg-teal-700">
                <Plus className="h-4 w-4 mr-2" />
                Create Invoice
              </Button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">This Month</CardTitle>
                <IndianRupee className="h-4 w-4 text-teal-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-teal-600">
                  {formatCurrency(stats?.earnings.monthly || 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.payments.successful || 0} consultations
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(stats?.earnings.total || 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">All time</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                <Clock className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {formatCurrency(stats?.earnings.pending || 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.invoices.pending || 0} invoices
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Invoices</CardTitle>
                <FileText className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-lg font-bold text-green-600">{stats?.invoices.paid || 0}</span>
                    <span className="text-xs text-muted-foreground ml-1">paid</span>
                  </div>
                  <div>
                    <span className="text-lg font-bold text-red-600">{stats?.invoices.overdue || 0}</span>
                    <span className="text-xs text-muted-foreground ml-1">overdue</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="payments">Payment Receipts</TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Payments */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Receipt className="h-5 w-5 text-teal-500" />
                      Recent Payments
                    </CardTitle>
                    <CardDescription>Latest payment receipts</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {stats?.recentPayments && stats.recentPayments.length > 0 ? (
                      <div className="space-y-3">
                        {stats.recentPayments.map((payment) => (
                          <div key={payment.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                            <div>
                              <p className="font-medium">
                                {payment.patient?.firstName} {payment.patient?.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(payment.createdAt)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-green-600">
                                {formatCurrency(payment.amount)}
                              </p>
                              {getStatusBadge(payment.status)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Receipt className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No recent payments</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Quick Actions</CardTitle>
                    <CardDescription>Common billing tasks</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button 
                      className="w-full justify-start" 
                      variant="outline"
                      onClick={() => setIsCreateInvoiceOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create New Invoice
                    </Button>
                    <Button 
                      className="w-full justify-start" 
                      variant="outline"
                      onClick={() => setActiveTab('payments')}
                    >
                      <Receipt className="h-4 w-4 mr-2" />
                      View All Payments
                    </Button>
                    <Button 
                      className="w-full justify-start" 
                      variant="outline"
                      onClick={() => setActiveTab('invoices')}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Manage Invoices
                    </Button>
                    <Button className="w-full justify-start" variant="outline">
                      <Download className="h-4 w-4 mr-2" />
                      Download Reports
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Payments Tab */}
            <TabsContent value="payments" className="space-y-4">
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by patient name or payment ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Payments Table */}
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payment ID</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPayments.length > 0 ? (
                        filteredPayments.map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell className="font-mono text-sm">
                              {payment.paymentId?.slice(0, 12)}...
                            </TableCell>
                            <TableCell>
                              {payment.patient?.firstName} {payment.patient?.lastName}
                            </TableCell>
                            <TableCell className="font-semibold">
                              {formatCurrency(payment.amount)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <CreditCard className="h-4 w-4 text-muted-foreground" />
                                {payment.method || payment.gateway || 'Online'}
                              </div>
                            </TableCell>
                            <TableCell>{getStatusBadge(payment.status)}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDateTime(payment.createdAt)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="ghost">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost">
                                <Download className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-12">
                            <Receipt className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                            <p className="text-muted-foreground">No payments found</p>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Invoices Tab */}
            <TabsContent value="invoices" className="space-y-4">
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by patient name or invoice number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
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
              </div>

              {/* Invoices Table */}
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInvoices.length > 0 ? (
                        filteredInvoices.map((invoice) => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-mono text-sm">
                              {invoice.invoiceNumber}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">
                                  {invoice.patient?.firstName} {invoice.patient?.lastName}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {invoice.patient?.email}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="font-semibold">
                              {formatCurrency(invoice.total)}
                            </TableCell>
                            <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(invoice.dueDate)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(invoice.createdAt)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="ghost">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost">
                                <Send className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost">
                                <Download className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-12">
                            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                            <p className="text-muted-foreground">No invoices found</p>
                            <Button 
                              className="mt-4" 
                              variant="outline"
                              onClick={() => setIsCreateInvoiceOpen(true)}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Create Your First Invoice
                            </Button>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Create Invoice Dialog */}
      <Dialog open={isCreateInvoiceOpen} onOpenChange={setIsCreateInvoiceOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-teal-600" />
              Create New Invoice
            </DialogTitle>
            <DialogDescription>
              Generate an invoice for your patient consultation
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Patient Selection */}
            <div className="space-y-2">
              <Label>Select Patient *</Label>
              <Select value={invoicePatientId} onValueChange={setInvoicePatientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a patient" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.id.toString()}>
                      {patient.firstName} {patient.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Invoice Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Invoice Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addInvoiceItem}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>
              
              <div className="space-y-3">
                {invoiceItems.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateInvoiceItem(index, 'description', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => updateInvoiceItem(index, 'quantity', parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        placeholder="Price"
                        value={item.unitPrice}
                        onChange={(e) => updateInvoiceItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-2 flex items-center gap-1">
                      <span className="text-sm font-medium">
                        {formatCurrency(item.quantity * item.unitPrice)}
                      </span>
                      {invoiceItems.length > 1 && (
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          onClick={() => removeInvoiceItem(index)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Discount */}
            <div className="space-y-2">
              <Label>Discount (₹)</Label>
              <Input
                type="number"
                value={invoiceDiscount}
                onChange={(e) => setInvoiceDiscount(parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Textarea
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                placeholder="Add any notes for the patient..."
                rows={2}
              />
            </div>

            {/* Total */}
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <span className="text-lg font-medium">Total Amount:</span>
              <span className="text-2xl font-bold text-teal-600">
                {formatCurrency(calculateInvoiceTotal())}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateInvoiceOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateInvoice} 
              disabled={isSubmitting}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Create Invoice
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayoutdoctor>
  );
};

export default DoctorBilling;
