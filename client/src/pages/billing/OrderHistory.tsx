import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { format } from 'date-fns';
import {
  Package, ShoppingBag, Search, RefreshCw, Download, Receipt,
  ChevronRight, TrendingUp, Clock, CheckCircle2, XCircle, AlertCircle,
  CreditCard, Loader2, ShoppingCart, Pill, Stethoscope,
  Shield, Smartphone, Calendar, IndianRupee
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [.25,.46,.45,.94] } } };

interface Order {
  id: string;
  orderNumber: string;
  orderType: string;
  status: string;
  total: number;
  currency: string;
  createdAt: string;
  invoice?: { id: string; invoiceNumber: string; pdfUrl: string; status: string };
  payments?: any[];
}

const statusCfg: Record<string, { color: string; bg: string; dark: string; icon: any }> = {
  completed: { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dark: 'dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300', icon: CheckCircle2 },
  processing: { color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', dark: 'dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300', icon: Clock },
  pending: { color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dark: 'dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-300', icon: AlertCircle },
  failed: { color: 'text-red-700', bg: 'bg-red-50 border-red-200', dark: 'dark:bg-red-900/30 dark:border-red-800 dark:text-red-300', icon: XCircle },
  cancelled: { color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', dark: 'dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-400', icon: XCircle },
};

const typeCfg: Record<string, { icon: any; gradient: string }> = {
  membership: { icon: CreditCard, gradient: 'from-violet-500 to-purple-600' },
  appointment: { icon: Stethoscope, gradient: 'from-blue-500 to-cyan-600' },
  prescription: { icon: Pill, gradient: 'from-emerald-500 to-teal-600' },
  pharmacy: { icon: Pill, gradient: 'from-green-500 to-emerald-600' },
  device: { icon: Smartphone, gradient: 'from-orange-500 to-amber-600' },
  insurance: { icon: Shield, gradient: 'from-indigo-500 to-blue-600' },
  lab: { icon: Package, gradient: 'from-teal-500 to-cyan-600' },
  other: { icon: ShoppingBag, gradient: 'from-slate-500 to-gray-600' },
};

const OrderHistory = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage] = useState(10);
  const [totalOrders, setTotalOrders] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [orderTypeFilter, setOrderTypeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetchOrders();
    fetchStats();
    if (location.state?.paymentSuccess) {
      toast({ title: 'Payment successful!', description: 'Your order has been placed.' });
      window.history.replaceState({}, document.title);
    }
  }, [page, rowsPerPage, statusFilter, orderTypeFilter]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params: any = { page: page + 1, limit: rowsPerPage };
      if (statusFilter) params.status = statusFilter;
      if (orderTypeFilter) params.orderType = orderTypeFilter;
      const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/billing/orders`, { headers: { Authorization: `Bearer ${token}` }, params });
      if (response.data.success) { setOrders(response.data.data.orders); setTotalOrders(response.data.data.pagination.total); }
    } catch (error: any) {
      const is500 = error?.response?.status === 500;
      toast({
        title: is500 ? 'Order history temporarily unavailable' : 'Error',
        description: is500
          ? 'Order history is being set up. Please check back soon.'
          : 'Failed to load orders',
        variant: 'destructive',
      });
    } finally { setLoading(false); }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/billing/stats`, { headers: { Authorization: `Bearer ${token}` } });
      if (response.data.success) setStats(response.data.data);
    } catch {}
  };

  const handleDownloadInvoice = async (invoiceId: string, invoiceNumber: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/billing/invoices/${invoiceId}/download`, { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a'); a.href = url; a.setAttribute('download', `invoice_${invoiceNumber}.pdf`); document.body.appendChild(a); a.click(); a.remove();
      toast({ title: 'Downloaded', description: 'Invoice saved' });
    } catch { toast({ title: 'Error', description: 'Failed to download invoice', variant: 'destructive' }); }
  };

  const filteredOrders = useMemo(() => orders.filter(o => o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) || o.orderType.toLowerCase().includes(searchTerm.toLowerCase())), [orders, searchTerm]);
  const totalPages = Math.ceil(totalOrders / rowsPerPage);
  const getType = (t: string) => typeCfg[t] || typeCfg.other;
  const getStatus = (s: string) => statusCfg[s] || statusCfg.pending;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Hero Header */}
        <motion.div variants={item} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-700 via-blue-700 to-cyan-700 p-8 text-white shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-white/5 blur-3xl" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-sm"><ShoppingBag className="w-6 h-6" /></div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Order History</h1>
              </div>
              <p className="text-blue-100 text-sm md:text-base max-w-lg">Track all your orders, download invoices, and manage your purchase history.</p>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => navigate('/billing/invoices')} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20 backdrop-blur-sm">
                <Receipt className="w-4 h-4 mr-2" /> Invoices
              </Button>
              <Button onClick={fetchOrders} disabled={loading} className="bg-white text-indigo-700 hover:bg-white/90 shadow-lg">
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        {stats && (
          <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Spent', value: `₹${parseFloat(stats.totalSpent || 0).toLocaleString('en-IN')}`, icon: IndianRupee, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
              { label: 'Total Orders', value: totalOrders, icon: Package, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
              { label: 'Pending Invoices', value: stats.pendingInvoices || 0, icon: AlertCircle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
              { label: 'Recent Payments', value: stats.recentPayments?.length || 0, icon: TrendingUp, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/30' },
            ].map((s) => (
              <motion.div key={s.label} whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
                <Card className="border-0 shadow-md dark:bg-slate-800/60 dark:border-slate-700/50 hover:shadow-lg transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
                      <div>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400 font-medium uppercase tracking-wider">{s.label}</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">{s.value}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Filters */}
        <motion.div variants={item}>
          <Card className="border-0 shadow-md dark:bg-slate-800/60 dark:border-slate-700/50">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input placeholder="Search by order number or type..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 bg-white dark:bg-slate-900 dark:border-slate-700" />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <div className="flex gap-1 items-center bg-gray-100 dark:bg-slate-800 rounded-lg p-1">
                    {[{ val: '', label: 'All' },{ val: 'pending', label: 'Pending' },{ val: 'processing', label: 'Active' },{ val: 'completed', label: 'Done' },{ val: 'failed', label: 'Failed' }].map(f => (
                      <button key={f.val} onClick={() => { setStatusFilter(f.val); setPage(0); }} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${statusFilter === f.val ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700'}`}>{f.label}</button>
                    ))}
                  </div>
                  <select value={orderTypeFilter} onChange={(e) => { setOrderTypeFilter(e.target.value); setPage(0); }} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500">
                    <option value="">All Types</option>
                    {['membership','appointment','prescription','pharmacy','device','insurance','lab'].map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Orders */}
        <motion.div variants={item} className="space-y-3">
          {loading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => (
              <Card key={i} className="border-0 shadow-sm dark:bg-slate-800/40"><CardContent className="p-5"><div className="flex items-center gap-4"><Skeleton className="w-12 h-12 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-24" /></div><Skeleton className="h-6 w-20 rounded-full" /><Skeleton className="h-5 w-16" /></div></CardContent></Card>
            ))}</div>
          ) : filteredOrders.length === 0 ? (
            <Card className="border-0 shadow-md dark:bg-slate-800/60"><CardContent className="flex flex-col items-center justify-center py-16">
              <div className="p-4 rounded-2xl bg-gray-100 dark:bg-slate-800 mb-4"><ShoppingCart className="w-10 h-10 text-gray-400 dark:text-slate-500" /></div>
              <p className="text-lg font-semibold text-gray-700 dark:text-slate-300 mb-1">No orders found</p>
              <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">You haven't placed any orders yet.</p>
              <Button onClick={() => navigate('/patient/pharmacy')} className="bg-indigo-600 hover:bg-indigo-700 text-white"><ShoppingBag className="w-4 h-4 mr-2" /> Start Shopping</Button>
            </CardContent></Card>
          ) : (
            <AnimatePresence>
              {filteredOrders.map((order, idx) => {
                const ti = getType(order.orderType); const si = getStatus(order.status); const SI = si.icon; const TI = ti.icon;
                return (
                  <motion.div key={order.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ delay: idx * 0.04, duration: 0.35 }} whileHover={{ y: -2 }}>
                    <Card className="group border-0 shadow-sm hover:shadow-xl dark:bg-slate-800/60 dark:hover:bg-slate-800/80 dark:border-slate-700/50 transition-all duration-300 cursor-pointer overflow-hidden" onClick={() => navigate(`/billing/orders/${order.id}`)}>
                      <CardContent className="p-0">
                        <div className="flex items-stretch">
                          <div className={`w-1.5 bg-gradient-to-b ${ti.gradient} rounded-l-xl shrink-0`} />
                          <div className="flex-1 p-5">
                            <div className="flex flex-col md:flex-row md:items-center gap-4">
                              <div className="flex items-center gap-4 flex-1 min-w-0">
                                <div className={`p-3 rounded-xl bg-gradient-to-br ${ti.gradient} text-white shadow-lg shrink-0`}><TI className="w-5 h-5" /></div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-semibold text-gray-900 dark:text-white truncate">{order.orderNumber}</p>
                                    <Badge variant="outline" className="text-[10px] capitalize font-medium shrink-0">{order.orderType}</Badge>
                                  </div>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(order.createdAt), 'dd MMM yyyy, hh:mm a')}</span>
                                    {order.invoice && <span className="text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-1"><Receipt className="w-3 h-3" />{order.invoice.invoiceNumber}</span>}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 md:gap-6">
                                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${si.bg} ${si.color} ${si.dark}`}><SI className="w-3.5 h-3.5" /><span className="capitalize">{order.status}</span></div>
                                <p className="text-lg font-bold text-gray-900 dark:text-white whitespace-nowrap">{order.currency === 'INR' ? '₹' : order.currency} {order.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                <div className="flex items-center gap-1 shrink-0">
                                  {order.invoice && <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400" onClick={(e) => { e.stopPropagation(); handleDownloadInvoice(order.invoice!.id, order.invoice!.invoiceNumber); }} aria-label="Download invoice"><Download className="w-4 h-4" /></Button>}
                                  <ChevronRight className="w-5 h-5 text-gray-300 dark:text-slate-600 group-hover:text-indigo-500 transition-colors" />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </motion.div>

        {/* Pagination */}
        {totalPages > 1 && (
          <motion.div variants={item} className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-slate-400">Showing {page * rowsPerPage + 1}–{Math.min((page + 1) * rowsPerPage, totalOrders)} of {totalOrders}</p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="dark:border-slate-700 dark:text-slate-300">Previous</Button>
              {[...Array(Math.min(totalPages, 5))].map((_, i) => { const pn = page < 3 ? i : page - 2 + i; if (pn >= totalPages) return null; return (
                <Button key={pn} variant={page === pn ? 'default' : 'outline'} size="sm" onClick={() => setPage(pn)} className={`w-9 ${page === pn ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'dark:border-slate-700 dark:text-slate-300'}`}>{pn + 1}</Button>
              ); })}
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="dark:border-slate-700 dark:text-slate-300">Next</Button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default OrderHistory;
