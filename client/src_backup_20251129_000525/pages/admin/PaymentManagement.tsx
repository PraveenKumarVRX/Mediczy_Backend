import { useState, useRef, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Switch } from '../../components/ui/switch';
import { useToast } from '../../hooks/use-toast';
import {
  getTransactions,
  getGateways,
  getPaymentStats,
  createRefund,
  updateGateway,
  openRazorpayCheckout,
  createPaymentOrder
} from '../../utils/razorpay';
import {
  Wallet,
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  CreditCard,
  Smartphone,
  Building,
  CheckCircle,
  XCircle,
  Clock,
  ArrowUpDown,
  DollarSign,
  TrendingUp,
  Users,
  Settings,
  Key,
  Shield,
  AlertTriangle,
  Loader2
} from 'lucide-react';

interface PaymentGateway {
  id: string;
  name: string;
  provider: string;
  type: 'credit_card' | 'upi' | 'net_banking' | 'wallet' | 'crypto';
  isEnabled: boolean;
  processingFee: number;
  currency: string;
  merchantId?: string;
  apiKey?: string;
  webhookUrl?: string;
  testMode: boolean;
  dailyLimit?: number;
  monthlyLimit?: number;
  countries: string[];
  createdAt: string;
}

interface PaymentTransaction {
  id: string;
  transactionId: string;
  gatewayId: string;
  gatewayName: string;
  clientType: 'user' | 'doctor' | 'hospital' | 'pharmacy' | 'corporate';
  clientId: string;
  clientName: string;
  amount: number;
  currency: string;
  fees: number;
  netAmount: number;
  status: 'pending' | 'completed' | 'failed' | 'cancelled' | 'refunded';
  paymentMethod: string;
  description: string;
  invoiceId?: string;
  refundId?: string;
  createdAt: string;
  completedAt?: string;
  failureReason?: string;
}

interface PaymentStats {
  totalTransactions: number;
  totalAmount: number;
  totalFees: number;
  successRate: number;
  todayTransactions: number;
  todayAmount: number;
  pendingAmount: number;
  refundedAmount: number;
}

const sampleGateways: PaymentGateway[] = [
  {
    id: 'gw_001',
    name: 'Razorpay',
    provider: 'Razorpay',
    type: 'credit_card',
    isEnabled: true,
    processingFee: 2.36,
    currency: 'INR',
    merchantId: 'rzp_test_12345',
    testMode: false,
    dailyLimit: 1000000,
    monthlyLimit: 30000000,
    countries: ['IN'],
    createdAt: '2024-01-15T10:00:00Z'
  },
  {
    id: 'gw_002',
    name: 'UPI Gateway',
    provider: 'PhonePe',
    type: 'upi',
    isEnabled: true,
    processingFee: 0.99,
    currency: 'INR',
    merchantId: 'pp_merchant_001',
    testMode: false,
    dailyLimit: 500000,
    monthlyLimit: 15000000,
    countries: ['IN'],
    createdAt: '2024-01-20T14:30:00Z'
  },
  {
    id: 'gw_003',
    name: 'Net Banking',
    provider: 'Payu',
    type: 'net_banking',
    isEnabled: true,
    processingFee: 1.99,
    currency: 'INR',
    merchantId: 'payu_merchant_001',
    testMode: true,
    dailyLimit: 2000000,
    monthlyLimit: 60000000,
    countries: ['IN'],
    createdAt: '2024-02-01T09:15:00Z'
  },
  {
    id: 'gw_004',
    name: 'Paytm Wallet',
    provider: 'Paytm',
    type: 'wallet',
    isEnabled: false,
    processingFee: 1.75,
    currency: 'INR',
    merchantId: 'paytm_merchant_001',
    testMode: true,
    dailyLimit: 100000,
    monthlyLimit: 3000000,
    countries: ['IN'],
    createdAt: '2024-02-10T16:45:00Z'
  }
];

const sampleTransactions: PaymentTransaction[] = [
  {
    id: 'txn_001',
    transactionId: 'pay_MN123456789',
    gatewayId: 'gw_001',
    gatewayName: 'Razorpay',
    clientType: 'hospital',
    clientId: 'hosp_001',
    clientName: 'Apollo Hospital',
    amount: 59000,
    currency: 'INR',
    fees: 1393.24,
    netAmount: 57606.76,
    status: 'completed',
    paymentMethod: 'Credit Card',
    description: 'Monthly subscription payment',
    invoiceId: 'INV-2024-001',
    createdAt: '2024-11-15T10:30:00Z',
    completedAt: '2024-11-15T10:31:00Z'
  },
  {
    id: 'txn_002',
    transactionId: 'upi_XY987654321',
    gatewayId: 'gw_002',
    gatewayName: 'UPI Gateway',
    clientType: 'user',
    clientId: 'usr_001',
    clientName: 'Rajesh Kumar',
    amount: 500,
    currency: 'INR',
    fees: 4.95,
    netAmount: 495.05,
    status: 'completed',
    paymentMethod: 'UPI',
    description: 'Consultation fee payment',
    createdAt: '2024-11-16T14:20:00Z',
    completedAt: '2024-11-16T14:20:30Z'
  },
  {
    id: 'txn_003',
    transactionId: 'nb_AB123789456',
    gatewayId: 'gw_003',
    gatewayName: 'Net Banking',
    clientType: 'corporate',
    clientId: 'corp_001',
    clientName: 'TCS Corporate Health',
    amount: 118000,
    currency: 'INR',
    fees: 2348.20,
    netAmount: 115651.80,
    status: 'pending',
    paymentMethod: 'Net Banking',
    description: 'Corporate health package payment',
    invoiceId: 'INV-2024-003',
    createdAt: '2024-11-16T16:00:00Z'
  },
  {
    id: 'txn_004',
    transactionId: 'cc_QW456123789',
    gatewayId: 'gw_001',
    gatewayName: 'Razorpay',
    clientType: 'pharmacy',
    clientId: 'pharm_001',
    clientName: 'MedPlus Pharmacy',
    amount: 29500,
    currency: 'INR',
    fees: 696.20,
    netAmount: 28803.80,
    status: 'failed',
    paymentMethod: 'Credit Card',
    description: 'Platform usage fee payment',
    invoiceId: 'INV-2024-002',
    createdAt: '2024-11-16T12:15:00Z',
    failureReason: 'Insufficient funds'
  }
];

const PaymentManagement = () => {
  const [activeTab, setActiveTab] = useState('transactions');
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PaymentTransaction['status']>('all');
  const [gatewayFilter, setGatewayFilter] = useState<'all' | string>('all');
  const [clientTypeFilter, setClientTypeFilter] = useState<'all' | PaymentTransaction['clientType']>('all');
  const [viewingTransaction, setViewingTransaction] = useState<PaymentTransaction | null>(null);
  const [editingGateway, setEditingGateway] = useState<PaymentGateway | null>(null);
  const [loading, setLoading] = useState(false);
  const [statsData, setStatsData] = useState<PaymentStats | null>(null);
  const { toast } = useToast();

  // Get token from localStorage
  const getToken = () => {
    return localStorage.getItem('token') || '';
  };

  // Fetch transactions
  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const token = getToken();
      const response = await getTransactions({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        clientType: clientTypeFilter !== 'all' ? clientTypeFilter : undefined,
        gatewayId: gatewayFilter !== 'all' ? gatewayFilter : undefined
      }, token);

      setTransactions(response.transactions || []);
      if (response.stats) {
        setStatsData(response.stats);
      }
    } catch (error: any) {
      console.error('Failed to fetch transactions:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch transactions',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch gateways
  const fetchGateways = async () => {
    try {
      const token = getToken();
      const response = await getGateways(token);
      setGateways(response.gateways || []);
    } catch (error: any) {
      console.error('Failed to fetch gateways:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch gateways',
        variant: 'destructive'
      });
    }
  };

  // Fetch payment stats
  const fetchStats = async () => {
    try {
      const token = getToken();
      const response = await getPaymentStats({}, token);
      setStatsData(response.stats);
    } catch (error: any) {
      console.error('Failed to fetch stats:', error);
    }
  };

  // Load data on mount
  useEffect(() => {
    fetchTransactions();
    fetchGateways();
    fetchStats();
  }, []);

  // Reload transactions when filters change
  useEffect(() => {
    fetchTransactions();
  }, [statusFilter, clientTypeFilter, gatewayFilter]);

  // Handle refund
  const handleRefund = async (transactionId: string, amount?: number) => {
    try {
      const token = getToken();
      await createRefund(transactionId, { amount, reason: 'Admin initiated refund' }, token);
      toast({
        title: 'Success',
        description: 'Refund initiated successfully'
      });
      fetchTransactions();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create refund',
        variant: 'destructive'
      });
    }
  };

  const filteredTransactions = transactions.filter(txn => {
    const matchesSearch = searchTerm
      ? txn.transactionId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        txn.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        txn.description.toLowerCase().includes(searchTerm.toLowerCase())
      : true;

    const matchesStatus = statusFilter === 'all' ? true : txn.status === statusFilter;
    const matchesGateway = gatewayFilter === 'all' ? true : txn.gatewayId === gatewayFilter;
    const matchesClientType = clientTypeFilter === 'all' ? true : txn.clientType === clientTypeFilter;

    return matchesSearch && matchesStatus && matchesGateway && matchesClientType;
  });

  const stats: PaymentStats = statsData || {
    totalTransactions: transactions.length,
    totalAmount: transactions.filter(t => t.status === 'completed').reduce((sum, t) => sum + t.amount, 0),
    totalFees: transactions.filter(t => t.status === 'completed').reduce((sum, t) => sum + t.fees, 0),
    successRate: transactions.length > 0 ? (transactions.filter(t => t.status === 'completed').length / transactions.length) * 100 : 0,
    todayTransactions: transactions.filter(t => new Date(t.createdAt).toDateString() === new Date().toDateString()).length,
    todayAmount: transactions.filter(t => 
      new Date(t.createdAt).toDateString() === new Date().toDateString() && t.status === 'completed'
    ).reduce((sum, t) => sum + t.amount, 0),
    pendingAmount: transactions.filter(t => t.status === 'pending').reduce((sum, t) => sum + t.amount, 0),
    refundedAmount: transactions.filter(t => t.status === 'refunded').reduce((sum, t) => sum + t.amount, 0)
  };

  const getStatusBadge = (status: PaymentTransaction['status']) => {
    const badges = {
      pending: { className: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Pending', icon: Clock },
      completed: { className: 'bg-green-100 text-green-700 border-green-200', label: 'Completed', icon: CheckCircle },
      failed: { className: 'bg-red-100 text-red-700 border-red-200', label: 'Failed', icon: XCircle },
      cancelled: { className: 'bg-gray-100 text-gray-700 border-gray-200', label: 'Cancelled', icon: XCircle },
      refunded: { className: 'bg-purple-100 text-purple-700 border-purple-200', label: 'Refunded', icon: ArrowUpDown }
    };
    return badges[status];
  };

  const getGatewayTypeIcon = (type: PaymentGateway['type']) => {
    const icons = {
      credit_card: CreditCard,
      upi: Smartphone,
      net_banking: Building,
      wallet: Wallet,
      crypto: DollarSign
    };
    return icons[type];
  };

  const getClientTypeIcon = (type: PaymentTransaction['clientType']) => {
    return type === 'user' ? Users : Building;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <Wallet className="h-8 w-8 text-green-600" />
              Payment Management
            </h2>
            <p className="text-muted-foreground">Manage payment gateways, transactions and processing</p>
          </div>
          <Button className="bg-green-600 hover:bg-green-700">
            <Plus className="mr-2 h-4 w-4" />
            Add Gateway
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total Amount</p>
                  <p className="text-2xl font-bold">₹{stats.totalAmount.toLocaleString()}</p>
                </div>
                <DollarSign className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total Fees</p>
                  <p className="text-2xl font-bold">₹{stats.totalFees.toLocaleString()}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Success Rate</p>
                  <p className="text-2xl font-bold">{stats.successRate.toFixed(1)}%</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Today's Amount</p>
                  <p className="text-2xl font-bold">₹{stats.todayAmount.toLocaleString()}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold">₹{stats.pendingAmount.toLocaleString()}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Refunded</p>
                  <p className="text-2xl font-bold">₹{stats.refundedAmount.toLocaleString()}</p>
                </div>
                <ArrowUpDown className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="gateways">Gateways</TabsTrigger>
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowUpDown className="h-5 w-5" />
                  Payment Transactions ({filteredTransactions.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Filters */}
                <div className="flex flex-col lg:flex-row gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search transactions..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                    <SelectTrigger className="w-full lg:w-[150px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="refunded">Refunded</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={gatewayFilter} onValueChange={(v) => setGatewayFilter(v as any)}>
                    <SelectTrigger className="w-full lg:w-[180px]">
                      <SelectValue placeholder="Gateway" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Gateways</SelectItem>
                      {gateways.map(gw => (
                        <SelectItem key={gw.id} value={gw.id}>{gw.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={clientTypeFilter} onValueChange={(v) => setClientTypeFilter(v as any)}>
                    <SelectTrigger className="w-full lg:w-[150px]">
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

                {/* Loading State */}
                {loading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-green-600" />
                    <span className="ml-2">Loading transactions...</span>
                  </div>
                )}

                {/* Empty State */}
                {!loading && filteredTransactions.length === 0 && (
                  <div className="text-center py-12">
                    <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No transactions found</h3>
                    <p className="text-muted-foreground">
                      {searchTerm || statusFilter !== 'all' || gatewayFilter !== 'all' || clientTypeFilter !== 'all'
                        ? 'Try adjusting your filters'
                        : 'Transactions will appear here once payments are made'}
                    </p>
                  </div>
                )}

                {/* Transactions Table */}
                {!loading && filteredTransactions.length > 0 && (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Transaction</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Gateway</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransactions.map((txn) => {
                        const statusBadge = getStatusBadge(txn.status);
                        const StatusIcon = statusBadge.icon;
                        const ClientIcon = getClientTypeIcon(txn.clientType);
                        
                        return (
                          <TableRow key={txn.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium text-sm">{txn.transactionId}</div>
                                <div className="text-xs text-muted-foreground">{txn.description}</div>
                                {txn.invoiceId && (
                                  <div className="text-xs text-muted-foreground">
                                    Invoice: {txn.invoiceId}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="p-1 rounded-full bg-blue-500/10">
                                  <ClientIcon className="h-3 w-3 text-blue-600" />
                                </div>
                                <div>
                                  <div className="font-medium text-sm">{txn.clientName}</div>
                                  <div className="text-xs text-muted-foreground capitalize">
                                    {txn.clientType}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">₹{txn.amount.toLocaleString()}</div>
                                <div className="text-xs text-muted-foreground">
                                  Fee: ₹{txn.fees.toLocaleString()}
                                </div>
                                <div className="text-xs text-green-600">
                                  Net: ₹{txn.netAmount.toLocaleString()}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <div className="font-medium">{txn.gatewayName}</div>
                                <div className="text-xs text-muted-foreground">{txn.paymentMethod}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`${statusBadge.className} flex items-center gap-1 w-fit`}>
                                <StatusIcon className="h-3 w-3" />
                                {statusBadge.label}
                              </Badge>
                              {txn.failureReason && (
                                <div className="text-xs text-red-600 mt-1">
                                  {txn.failureReason}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {new Date(txn.createdAt).toLocaleDateString()}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(txn.createdAt).toLocaleTimeString()}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => setViewingTransaction(txn)}>
                                      <Eye className="h-3 w-3" />
                                    </Button>
                                  </DialogTrigger>
                                </Dialog>
                                {txn.status === 'completed' && (
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-8 w-8 p-0 text-purple-600"
                                    onClick={() => handleRefund(txn.id)}
                                    title="Initiate Refund"
                                  >
                                    <ArrowUpDown className="h-3 w-3" />
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
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gateways">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment Gateways ({gateways.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {gateways.map(gateway => {
                    const TypeIcon = getGatewayTypeIcon(gateway.type);
                    const gatewayTransactions = transactions.filter(t => t.gatewayId === gateway.id);
                    const totalAmount = gatewayTransactions
                      .filter(t => t.status === 'completed')
                      .reduce((sum, t) => sum + t.amount, 0);
                    const successRate = gatewayTransactions.length > 0 
                      ? (gatewayTransactions.filter(t => t.status === 'completed').length / gatewayTransactions.length) * 100 
                      : 0;
                    
                    return (
                      <Card key={gateway.id} className="relative">
                        <CardContent className="p-6">
                          <div className="space-y-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`p-3 rounded-full ${
                                  gateway.type === 'credit_card' ? 'bg-blue-500/10' :
                                  gateway.type === 'upi' ? 'bg-purple-500/10' :
                                  gateway.type === 'net_banking' ? 'bg-green-500/10' :
                                  gateway.type === 'wallet' ? 'bg-orange-500/10' : 'bg-yellow-500/10'
                                }`}>
                                  <TypeIcon className={`h-5 w-5 ${
                                    gateway.type === 'credit_card' ? 'text-blue-600' :
                                    gateway.type === 'upi' ? 'text-purple-600' :
                                    gateway.type === 'net_banking' ? 'text-green-600' :
                                    gateway.type === 'wallet' ? 'text-orange-600' : 'text-yellow-600'
                                  }`} />
                                </div>
                                <div>
                                  <div className="font-semibold">{gateway.name}</div>
                                  <div className="text-sm text-muted-foreground">{gateway.provider}</div>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <Badge variant="outline" className={gateway.isEnabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                                  {gateway.isEnabled ? 'Enabled' : 'Disabled'}
                                </Badge>
                                {gateway.testMode && (
                                  <Badge variant="outline" className="bg-yellow-100 text-yellow-700">
                                    Test Mode
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">Processing Fee</span>
                                <span className="font-medium">{gateway.processingFee}%</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">Total Processed</span>
                                <span className="font-medium">₹{totalAmount.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">Success Rate</span>
                                <span className="font-medium">{successRate.toFixed(1)}%</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">Daily Limit</span>
                                <span className="font-medium">₹{gateway.dailyLimit?.toLocaleString() || '∞'}</span>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditingGateway(gateway)}>
                                <Settings className="mr-2 h-3 w-3" />
                                Configure
                              </Button>
                              <Button size="sm" variant="outline" className="flex-1">
                                <Eye className="mr-2 h-3 w-3" />
                                View
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reconciliation">
            <Card>
              <CardHeader>
                <CardTitle>Payment Reconciliation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Reconciliation Dashboard</h3>
                  <p className="text-muted-foreground mb-4">
                    Match payment records with gateway settlements
                  </p>
                  <Button>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Start Reconciliation
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Gateway Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {gateways.filter(gw => gw.isEnabled).map(gateway => {
                      const gatewayTxns = transactions.filter(t => t.gatewayId === gateway.id);
                      const successRate = gatewayTxns.length > 0 
                        ? (gatewayTxns.filter(t => t.status === 'completed').length / gatewayTxns.length) * 100 
                        : 0;
                      
                      return (
                        <div key={gateway.id} className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${
                              successRate > 95 ? 'bg-green-500' : 
                              successRate > 85 ? 'bg-yellow-500' : 'bg-red-500'
                            }`} />
                            <span className="font-medium">{gateway.name}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">{successRate.toFixed(1)}%</div>
                            <div className="text-xs text-muted-foreground">{gatewayTxns.length} txns</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Payment Methods</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {['Credit Card', 'UPI', 'Net Banking', 'Wallet'].map(method => {
                      const methodTxns = transactions.filter(t => 
                        t.paymentMethod === method && t.status === 'completed'
                      );
                      const amount = methodTxns.reduce((sum, t) => sum + t.amount, 0);
                      const percentage = stats.totalAmount > 0 ? (amount / stats.totalAmount) * 100 : 0;
                      
                      return (
                        <div key={method} className="flex justify-between items-center">
                          <span className="font-medium">{method}</span>
                          <div className="text-right">
                            <div className="font-medium">₹{amount.toLocaleString()}</div>
                            <div className="text-xs text-muted-foreground">{percentage.toFixed(1)}%</div>
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
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Payment Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <Label>Default Currency</Label>
                      <Select defaultValue="INR">
                        <SelectTrigger>
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
                      <Label>Payment Timeout (seconds)</Label>
                      <Input type="number" defaultValue="300" />
                    </div>
                    <div>
                      <Label>Auto-retry Failed Payments</Label>
                      <div className="flex items-center space-x-2 mt-2">
                        <Switch defaultChecked />
                        <Label className="text-sm">Enable automatic retry for failed payments</Label>
                      </div>
                    </div>
                    <div>
                      <Label>Webhook URL</Label>
                      <Input defaultValue="https://api.mediczy.com/webhooks/payments" />
                    </div>
                  </div>
                  <Button>Save Settings</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Security Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">PCI DSS Compliance</div>
                        <div className="text-sm text-muted-foreground">Payment card industry compliance</div>
                      </div>
                      <Badge className="bg-green-100 text-green-700">Certified</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">SSL Encryption</div>
                        <div className="text-sm text-muted-foreground">Secure data transmission</div>
                      </div>
                      <Badge className="bg-green-100 text-green-700">Active</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Fraud Detection</div>
                        <div className="text-sm text-muted-foreground">Real-time fraud monitoring</div>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Two-Factor Authentication</div>
                        <div className="text-sm text-muted-foreground">Additional security layer</div>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </div>
                  <Button variant="outline" className="w-full">
                    <Key className="mr-2 h-4 w-4" />
                    Regenerate API Keys
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* View Transaction Dialog */}
        {viewingTransaction && (
          <Dialog open={!!viewingTransaction} onOpenChange={() => setViewingTransaction(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Transaction Details - {viewingTransaction.transactionId}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label className="font-semibold">Client Information</Label>
                    <div className="space-y-1 text-sm">
                      <div><strong>Name:</strong> {viewingTransaction.clientName}</div>
                      <div><strong>Type:</strong> {viewingTransaction.clientType}</div>
                      <div><strong>ID:</strong> {viewingTransaction.clientId}</div>
                    </div>
                  </div>
                  <div>
                    <Label className="font-semibold">Payment Information</Label>
                    <div className="space-y-1 text-sm">
                      <div><strong>Gateway:</strong> {viewingTransaction.gatewayName}</div>
                      <div><strong>Method:</strong> {viewingTransaction.paymentMethod}</div>
                      <div><strong>Currency:</strong> {viewingTransaction.currency}</div>
                    </div>
                  </div>
                </div>
                
                <div>
                  <Label className="font-semibold">Amount Breakdown</Label>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Amount:</span>
                      <span>₹{viewingTransaction.amount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Processing Fee:</span>
                      <span>₹{viewingTransaction.fees.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-medium border-t pt-1">
                      <span>Net Amount:</span>
                      <span>₹{viewingTransaction.netAmount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="font-semibold">Timeline</Label>
                  <div className="space-y-1 text-sm">
                    <div><strong>Created:</strong> {new Date(viewingTransaction.createdAt).toLocaleString()}</div>
                    {viewingTransaction.completedAt && (
                      <div><strong>Completed:</strong> {new Date(viewingTransaction.completedAt).toLocaleString()}</div>
                    )}
                    {viewingTransaction.failureReason && (
                      <div><strong>Failure Reason:</strong> {viewingTransaction.failureReason}</div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  {viewingTransaction.status === 'completed' && (
                    <Button variant="outline">
                      <ArrowUpDown className="mr-2 h-4 w-4" />
                      Initiate Refund
                    </Button>
                  )}
                  {viewingTransaction.status === 'failed' && (
                    <Button variant="outline">
                      <ArrowUpDown className="mr-2 h-4 w-4" />
                      Retry Payment
                    </Button>
                  )}
                  <Button variant="outline">
                    <Eye className="mr-2 h-4 w-4" />
                    View in Gateway
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </AdminLayout>
  );
};

export default PaymentManagement;