import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  CreditCard, 
  Search, 
  Download, 
  Eye,
  Calendar,
  User,
  Loader2,
  Filter,
  Printer,
  IndianRupee,
  Receipt,
  CheckCircle,
  Clock,
  XCircle
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import api from '@/utils/api';

interface Invoice {
  id: string;
  invoiceNumber: string;
  patientName: string;
  patientId: string;
  doctorName: string;
  doctorId: string;
  date: string;
  dueDate: string;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  status: 'paid' | 'pending' | 'overdue' | 'cancelled';
  paymentMethod?: string;
  paidDate?: string;
}

const AssistantBilling = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('assistantToken');
    if (!token) {
      navigate('/assistant/login');
      return;
    }
    fetchInvoices();
  }, [navigate]);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/assistant/billing');
      if (data.success) {
        setInvoices(data.invoices);
      }
    } catch (error) {
      console.error('Error fetching invoices:', error);
      // Mock data
      setInvoices([
        {
          id: 'INV001',
          invoiceNumber: 'MED-2025-0001',
          patientName: 'Amit Sharma',
          patientId: 'PAT001',
          doctorName: 'Dr. Michael Roberts',
          doctorId: 'doc_001',
          date: '2025-12-28',
          dueDate: '2025-01-05',
          items: [
            { description: 'Consultation Fee', quantity: 1, unitPrice: 500, total: 500 },
            { description: 'Blood Test', quantity: 1, unitPrice: 800, total: 800 },
          ],
          subtotal: 1300,
          tax: 234,
          discount: 0,
          total: 1534,
          status: 'paid',
          paymentMethod: 'UPI',
          paidDate: '2025-12-28'
        },
        {
          id: 'INV002',
          invoiceNumber: 'MED-2025-0002',
          patientName: 'Priya Patel',
          patientId: 'PAT002',
          doctorName: 'Dr. Michael Roberts',
          doctorId: 'doc_001',
          date: '2025-12-27',
          dueDate: '2025-01-03',
          items: [
            { description: 'Video Consultation', quantity: 1, unitPrice: 400, total: 400 },
          ],
          subtotal: 400,
          tax: 72,
          discount: 50,
          total: 422,
          status: 'pending'
        },
        {
          id: 'INV003',
          invoiceNumber: 'MED-2025-0003',
          patientName: 'Rajesh Kumar',
          patientId: 'PAT003',
          doctorName: 'Dr. Michael Roberts',
          doctorId: 'doc_001',
          date: '2025-12-20',
          dueDate: '2025-12-27',
          items: [
            { description: 'Follow-up Consultation', quantity: 1, unitPrice: 300, total: 300 },
            { description: 'ECG', quantity: 1, unitPrice: 500, total: 500 },
            { description: 'Chest X-Ray', quantity: 1, unitPrice: 600, total: 600 },
          ],
          subtotal: 1400,
          tax: 252,
          discount: 100,
          total: 1552,
          status: 'overdue'
        },
        {
          id: 'INV004',
          invoiceNumber: 'MED-2025-0004',
          patientName: 'Sunita Devi',
          patientId: 'PAT004',
          doctorName: 'Dr. Michael Roberts',
          doctorId: 'doc_001',
          date: '2025-12-25',
          dueDate: '2025-01-02',
          items: [
            { description: 'Consultation Fee', quantity: 1, unitPrice: 500, total: 500 },
          ],
          subtotal: 500,
          tax: 90,
          discount: 0,
          total: 590,
          status: 'paid',
          paymentMethod: 'Card',
          paidDate: '2025-12-25'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = inv.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleViewInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setViewDialogOpen(true);
  };

  const handlePrint = (invoice: Invoice) => {
    toast.success(`Printing invoice ${invoice.invoiceNumber}`);
    window.print();
  };

  const handleDownload = (invoice: Invoice) => {
    toast.success(`Downloading invoice ${invoice.invoiceNumber} as PDF`);
  };

  const handleSendReminder = (invoice: Invoice) => {
    toast.success(`Payment reminder sent to ${invoice.patientName}`);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending': return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'overdue': return <XCircle className="h-4 w-4 text-red-600" />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-700 border-green-200';
      case 'pending': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'overdue': return 'bg-red-100 text-red-700 border-red-200';
      case 'cancelled': return 'bg-gray-100 text-gray-700 border-gray-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.total, 0);
  const pendingAmount = invoices.filter(i => i.status === 'pending' || i.status === 'overdue').reduce((sum, i) => sum + i.total, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4 md:p-6">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-purple-600" />
              Billing & Invoices
            </h1>
            <p className="text-muted-foreground mt-1">
              View and manage patient invoices and payments
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-purple-600">{invoices.length}</p>
                <p className="text-sm text-muted-foreground">Total Invoices</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600 flex items-center justify-center gap-1">
                  <IndianRupee className="h-6 w-6" />
                  {totalRevenue.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">Collected</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-yellow-600 flex items-center justify-center gap-1">
                  <IndianRupee className="h-6 w-6" />
                  {pendingAmount.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </CardContent>
          </Card>
          <Card className={invoices.filter(i => i.status === 'overdue').length > 0 ? 'border-red-200 bg-red-50' : ''}>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-red-600">
                  {invoices.filter(i => i.status === 'overdue').length}
                </p>
                <p className="text-sm text-muted-foreground">Overdue</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by patient name or invoice number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Invoices List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invoice Records</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="text-center py-12">
                <Receipt className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-3" />
                <p className="text-muted-foreground">No invoices found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredInvoices.map((inv) => (
                  <Card key={inv.id} className={`hover:shadow-md transition-shadow border-l-4 ${
                    inv.status === 'paid' ? 'border-l-green-500' :
                    inv.status === 'pending' ? 'border-l-yellow-500' :
                    inv.status === 'overdue' ? 'border-l-red-500' : 'border-l-gray-300'
                  }`}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-full ${
                            inv.status === 'paid' ? 'bg-green-100' :
                            inv.status === 'pending' ? 'bg-yellow-100' :
                            'bg-red-100'
                          }`}>
                            {getStatusIcon(inv.status)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-lg">{inv.patientName}</p>
                              <Badge className={getStatusColor(inv.status)}>
                                {inv.status}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {inv.invoiceNumber}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-2">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(inv.date).toLocaleDateString()}
                              </span>
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {inv.doctorName}
                              </span>
                              <span className="flex items-center gap-1">
                                <Receipt className="h-3 w-3" />
                                {inv.items.length} items
                              </span>
                            </div>
                            {inv.status !== 'paid' && (
                              <p className="text-sm mt-2 text-orange-600">
                                Due: {new Date(inv.dueDate).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <p className="text-xl font-bold text-purple-600 flex items-center">
                            <IndianRupee className="h-5 w-5" />
                            {inv.total.toLocaleString()}
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewInvoice(inv)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                            {(inv.status === 'pending' || inv.status === 'overdue') && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-orange-600 border-orange-200"
                                onClick={() => handleSendReminder(inv)}
                              >
                                Send Reminder
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* View Invoice Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-purple-600" />
                Invoice - {selectedInvoice?.invoiceNumber}
              </DialogTitle>
            </DialogHeader>
            
            {selectedInvoice && (
              <div className="space-y-6">
                {/* Header Info */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">Patient</p>
                    <p className="font-semibold">{selectedInvoice.patientName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Doctor</p>
                    <p className="font-semibold">{selectedInvoice.doctorName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Invoice Date</p>
                    <p className="font-semibold">{new Date(selectedInvoice.date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge className={getStatusColor(selectedInvoice.status)}>
                      {selectedInvoice.status}
                    </Badge>
                  </div>
                </div>

                {/* Line Items */}
                <div>
                  <h4 className="font-semibold mb-2">Items</h4>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left p-3 text-sm font-medium">Description</th>
                          <th className="text-center p-3 text-sm font-medium">Qty</th>
                          <th className="text-right p-3 text-sm font-medium">Price</th>
                          <th className="text-right p-3 text-sm font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedInvoice.items.map((item, index) => (
                          <tr key={index} className="border-t">
                            <td className="p-3">{item.description}</td>
                            <td className="p-3 text-center">{item.quantity}</td>
                            <td className="p-3 text-right">₹{item.unitPrice}</td>
                            <td className="p-3 text-right">₹{item.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Totals */}
                <div className="space-y-2 text-right">
                  <p className="text-sm">
                    Subtotal: <span className="font-medium">₹{selectedInvoice.subtotal}</span>
                  </p>
                  <p className="text-sm">
                    Tax (18%): <span className="font-medium">₹{selectedInvoice.tax}</span>
                  </p>
                  {selectedInvoice.discount > 0 && (
                    <p className="text-sm text-green-600">
                      Discount: <span className="font-medium">-₹{selectedInvoice.discount}</span>
                    </p>
                  )}
                  <p className="text-xl font-bold pt-2 border-t">
                    Total: <span className="text-purple-600">₹{selectedInvoice.total}</span>
                  </p>
                </div>

                {/* Payment Info */}
                {selectedInvoice.status === 'paid' && selectedInvoice.paidDate && (
                  <div className="p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-800">
                      <strong>Paid on:</strong> {new Date(selectedInvoice.paidDate).toLocaleDateString()}
                      {selectedInvoice.paymentMethod && ` via ${selectedInvoice.paymentMethod}`}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => handlePrint(selectedInvoice)}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print
                  </Button>
                  <Button onClick={() => handleDownload(selectedInvoice)}>
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default AssistantBilling;
