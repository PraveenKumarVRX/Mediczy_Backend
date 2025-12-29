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
import { useToast } from '../../hooks/use-toast';
import api from '../../utils/api';
import {
  Calculator,
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  Download,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  FileText,
  PieChart,
  BarChart3,
  Building,
  Users,
  CreditCard
} from 'lucide-react';

interface AccountEntry {
  id: string;
  date: string;
  description: string;
  category: string;
  type: 'income' | 'expense' | 'asset' | 'liability';
  amount: number;
  reference?: string;
  clientId?: string;
  clientName?: string;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;
}

interface AccountCategory {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'asset' | 'liability';
  code: string;
  isActive: boolean;
}

interface FinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  totalAssets: number;
  totalLiabilities: number;
  currentRatio: number;
  monthlyIncome: number;
  monthlyExpenses: number;
}

const sampleCategories: AccountCategory[] = [
  { id: 'cat_001', name: 'Subscription Revenue', type: 'income', code: 'REV001', isActive: true },
  { id: 'cat_002', name: 'Consultation Fees', type: 'income', code: 'REV002', isActive: true },
  { id: 'cat_003', name: 'Commission Income', type: 'income', code: 'REV003', isActive: true },
  { id: 'cat_004', name: 'Server Costs', type: 'expense', code: 'EXP001', isActive: true },
  { id: 'cat_005', name: 'Marketing Expenses', type: 'expense', code: 'EXP002', isActive: true },
  { id: 'cat_006', name: 'Staff Salaries', type: 'expense', code: 'EXP003', isActive: true },
  { id: 'cat_007', name: 'Office Rent', type: 'expense', code: 'EXP004', isActive: true },
  { id: 'cat_008', name: 'Cash & Bank', type: 'asset', code: 'AST001', isActive: true },
  { id: 'cat_009', name: 'Accounts Receivable', type: 'asset', code: 'AST002', isActive: true },
  { id: 'cat_010', name: 'Accounts Payable', type: 'liability', code: 'LIA001', isActive: true }
];

const sampleEntries: AccountEntry[] = [
  {
    id: 'acc_001',
    date: '2024-11-15',
    description: 'Apollo Hospital Monthly Subscription',
    category: 'Subscription Revenue',
    type: 'income',
    amount: 50000,
    reference: 'INV-2024-001',
    clientId: 'hosp_001',
    clientName: 'Apollo Hospital',
    status: 'completed',
    createdAt: '2024-11-15T10:00:00Z'
  },
  {
    id: 'acc_002',
    date: '2024-11-14',
    description: 'AWS Server Hosting',
    category: 'Server Costs',
    type: 'expense',
    amount: 15000,
    reference: 'AWS-NOV-2024',
    status: 'completed',
    createdAt: '2024-11-14T14:30:00Z'
  },
  {
    id: 'acc_003',
    date: '2024-11-13',
    description: 'Google Ads Campaign',
    category: 'Marketing Expenses',
    type: 'expense',
    amount: 25000,
    reference: 'GAD-NOV-2024',
    status: 'completed',
    createdAt: '2024-11-13T09:15:00Z'
  },
  {
    id: 'acc_004',
    date: '2024-11-12',
    description: 'Consultation Commission - Dr. Sharma',
    category: 'Commission Income',
    type: 'income',
    amount: 8000,
    reference: 'COM-NOV-001',
    clientId: 'doc_001',
    clientName: 'Dr. Rajesh Sharma',
    status: 'completed',
    createdAt: '2024-11-12T16:45:00Z'
  },
  {
    id: 'acc_005',
    date: '2024-11-11',
    description: 'Office Rent - November',
    category: 'Office Rent',
    type: 'expense',
    amount: 45000,
    reference: 'RENT-NOV-2024',
    status: 'pending',
    createdAt: '2024-11-11T11:20:00Z'
  },
  {
    id: 'acc_006',
    date: '2024-11-10',
    description: 'Staff Salary - October',
    category: 'Staff Salaries',
    type: 'expense',
    amount: 180000,
    reference: 'SAL-OCT-2024',
    status: 'completed',
    createdAt: '2024-11-10T18:00:00Z'
  }
];

const AccountingManagement = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('transactions');
  const [entries, setEntries] = useState<AccountEntry[]>(sampleEntries);
  const [categories, setCategories] = useState<AccountCategory[]>(sampleCategories);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | AccountEntry['type']>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AccountEntry['status']>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');
  const token = typeof window !== 'undefined' ? (localStorage.getItem('adminToken') || localStorage.getItem('token') || '') : '';

  const filteredEntries = entries.filter(entry => {
    const matchesSearch = searchTerm
      ? entry.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.clientName?.toLowerCase().includes(searchTerm.toLowerCase())
      : true;

    const matchesType = typeFilter === 'all' ? true : entry.type === typeFilter;
    const matchesStatus = statusFilter === 'all' ? true : entry.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' ? true : entry.category === categoryFilter;

    return matchesSearch && matchesType && matchesStatus && matchesCategory;
  });

  const financialSummary: FinancialSummary = {
    totalIncome: entries.filter(e => e.type === 'income' && e.status === 'completed').reduce((sum, e) => sum + e.amount, 0),
    totalExpenses: entries.filter(e => e.type === 'expense' && e.status === 'completed').reduce((sum, e) => sum + e.amount, 0),
    netProfit: 0,
    totalAssets: entries.filter(e => e.type === 'asset' && e.status === 'completed').reduce((sum, e) => sum + e.amount, 0),
    totalLiabilities: entries.filter(e => e.type === 'liability' && e.status === 'completed').reduce((sum, e) => sum + e.amount, 0),
    currentRatio: 0,
    monthlyIncome: entries.filter(e => {
      const entryDate = new Date(e.date);
      const currentMonth = new Date().getMonth();
      return e.type === 'income' && e.status === 'completed' && entryDate.getMonth() === currentMonth;
    }).reduce((sum, e) => sum + e.amount, 0),
    monthlyExpenses: entries.filter(e => {
      const entryDate = new Date(e.date);
      const currentMonth = new Date().getMonth();
      return e.type === 'expense' && e.status === 'completed' && entryDate.getMonth() === currentMonth;
    }).reduce((sum, e) => sum + e.amount, 0)
  };

  financialSummary.netProfit = financialSummary.totalIncome - financialSummary.totalExpenses;
  financialSummary.currentRatio = financialSummary.totalLiabilities > 0 ? financialSummary.totalAssets / financialSummary.totalLiabilities : 0;

  const getTypeIcon = (type: AccountEntry['type']) => {
    const icons = {
      income: { icon: TrendingUp, color: 'text-green-500' },
      expense: { icon: TrendingDown, color: 'text-red-500' },
      asset: { icon: Building, color: 'text-blue-500' },
      liability: { icon: CreditCard, color: 'text-orange-500' }
    };
    return icons[type];
  };

  const getStatusBadge = (status: AccountEntry['status']) => {
    const badges = {
      pending: { className: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Pending' },
      completed: { className: 'bg-green-100 text-green-700 border-green-200', label: 'Completed' },
      cancelled: { className: 'bg-red-100 text-red-700 border-red-200', label: 'Cancelled' }
    };
    return badges[status];
  };

  const startBankReconciliation = async () => {
    try {
      await api.post('/admin/accounting/reconciliation', { mode: 'bank' }, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
      toast({ title: 'Reconciliation started', description: 'Matching bank statements with ledger entries.' });
    } catch (error: any) {
      console.warn('Bank reconciliation fallback', error);
      toast({ title: 'Offline reconciliation', description: 'Could not reach the server; please retry later.', variant: 'destructive' });
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <Calculator className="h-8 w-8 text-blue-600" />
              Accounting Management
            </h2>
            <p className="text-muted-foreground">Track finances, manage accounts and generate reports</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" />
            New Entry
          </Button>
        </div>

        {/* Financial Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total Income</p>
                  <p className="text-2xl font-bold text-green-600">₹{financialSummary.totalIncome.toLocaleString()}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total Expenses</p>
                  <p className="text-2xl font-bold text-red-600">₹{financialSummary.totalExpenses.toLocaleString()}</p>
                </div>
                <TrendingDown className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Net Profit</p>
                  <p className={`text-2xl font-bold ${financialSummary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ₹{financialSummary.netProfit.toLocaleString()}
                  </p>
                </div>
                <DollarSign className={`h-8 w-8 ${financialSummary.netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Monthly Income</p>
                  <p className="text-2xl font-bold">₹{financialSummary.monthlyIncome.toLocaleString()}</p>
                </div>
                <Calendar className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Monthly Expenses</p>
                  <p className="text-2xl font-bold">₹{financialSummary.monthlyExpenses.toLocaleString()}</p>
                </div>
                <Calendar className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Current Ratio</p>
                  <p className="text-2xl font-bold">{financialSummary.currentRatio.toFixed(2)}</p>
                </div>
                <BarChart3 className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="budget">Budget</TabsTrigger>
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
          </TabsList>

          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Transaction History ({filteredEntries.length})
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
                  <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
                    <SelectTrigger className="w-full lg:w-[150px]">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="income">Income</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                      <SelectItem value="asset">Asset</SelectItem>
                      <SelectItem value="liability">Liability</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                    <SelectTrigger className="w-full lg:w-[150px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as any)}>
                    <SelectTrigger className="w-full lg:w-[200px]">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Transactions Table */}
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEntries.map((entry) => {
                        const typeInfo = getTypeIcon(entry.type);
                        const TypeIcon = typeInfo.icon;
                        const statusBadge = getStatusBadge(entry.status);
                        
                        return (
                          <TableRow key={entry.id}>
                            <TableCell>
                              <div className="text-sm">
                                {new Date(entry.date).toLocaleDateString()}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{entry.description}</div>
                                {entry.reference && (
                                  <div className="text-sm text-muted-foreground">
                                    Ref: {entry.reference}
                                  </div>
                                )}
                                {entry.clientName && (
                                  <div className="text-sm text-muted-foreground">
                                    Client: {entry.clientName}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{entry.category}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <TypeIcon className={`h-4 w-4 ${typeInfo.color}`} />
                                <span className="capitalize text-sm">{entry.type}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className={`font-medium ${
                                entry.type === 'income' ? 'text-green-600' : 
                                entry.type === 'expense' ? 'text-red-600' : 'text-blue-600'
                              }`}>
                                {entry.type === 'expense' ? '-' : '+'}₹{entry.amount.toLocaleString()}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={statusBadge.className}>
                                {statusBadge.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => toast({ title: "Transaction Details", description: `Viewing transaction ${entry.id}` })}>
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => toast({ title: "Edit Transaction", description: `Opening editor for transaction ${entry.id}` })}>
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-red-600" onClick={() => {
                                  if (confirm('Delete this transaction?')) {
                                    toast({ title: "Transaction Deleted", description: `Transaction ${entry.id} has been deleted`, variant: "destructive" });
                                  }
                                }}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
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

          <TabsContent value="categories">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Account Categories ({categories.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {categories.map(category => {
                    const typeInfo = getTypeIcon(category.type);
                    const TypeIcon = typeInfo.icon;
                    const totalAmount = entries
                      .filter(entry => entry.category === category.name && entry.status === 'completed')
                      .reduce((sum, entry) => sum + entry.amount, 0);
                    
                    return (
                      <Card key={category.id} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${
                              category.type === 'income' ? 'bg-green-500/10' :
                              category.type === 'expense' ? 'bg-red-500/10' :
                              category.type === 'asset' ? 'bg-blue-500/10' : 'bg-orange-500/10'
                            }`}>
                              <TypeIcon className={`h-4 w-4 ${typeInfo.color}`} />
                            </div>
                            <div>
                              <div className="font-medium text-sm">{category.name}</div>
                              <div className="text-xs text-muted-foreground">{category.code}</div>
                            </div>
                          </div>
                          <Badge variant="outline" className={category.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                            {category.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <div className="mt-3">
                          <div className={`text-lg font-bold ${
                            category.type === 'income' ? 'text-green-600' : 
                            category.type === 'expense' ? 'text-red-600' : 'text-blue-600'
                          }`}>
                            ₹{totalAmount.toLocaleString()}
                          </div>
                          <div className="text-xs text-muted-foreground capitalize">{category.type}</div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Profit & Loss</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Total Income</span>
                      <span className="font-medium text-green-600">₹{financialSummary.totalIncome.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Total Expenses</span>
                      <span className="font-medium text-red-600">₹{financialSummary.totalExpenses.toLocaleString()}</span>
                    </div>
                    <div className="border-t pt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Net Profit/Loss</span>
                        <span className={`font-bold ${financialSummary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ₹{financialSummary.netProfit.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Balance Sheet</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Total Assets</span>
                      <span className="font-medium text-blue-600">₹{financialSummary.totalAssets.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Total Liabilities</span>
                      <span className="font-medium text-orange-600">₹{financialSummary.totalLiabilities.toLocaleString()}</span>
                    </div>
                    <div className="border-t pt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Current Ratio</span>
                        <span className="font-bold">{financialSummary.currentRatio.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="budget">
            <Card>
              <CardHeader>
                <CardTitle>Budget Management</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <Calculator className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Budget Planning</h3>
                  <p className="text-muted-foreground mb-4">
                    Set up budgets and monitor spending across categories
                  </p>
                  <Button onClick={() => toast({ title: "Coming Soon", description: "Budget creation feature coming soon!" })}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Budget
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reconciliation">
            <Card>
              <CardHeader>
                <CardTitle>Bank Reconciliation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Account Reconciliation</h3>
                  <p className="text-muted-foreground mb-4">
                    Reconcile bank statements with accounting records
                  </p>
                  <Button onClick={startBankReconciliation}>
                    <Download className="mr-2 h-4 w-4" />
                    Import Bank Statement
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AccountingManagement;