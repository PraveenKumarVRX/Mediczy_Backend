import type { Variants } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/utils/api';
import { format } from 'date-fns';
import {
  FileText, Download, Eye, RefreshCw, Search, Receipt, ChevronRight,
  CheckCircle2, Clock, AlertCircle, XCircle, Filter, ShoppingBag,
  Calendar, IndianRupee, FileDown, Loader2
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [.25,.46,.45,.94] } } };

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: 'paid' | 'pending' | 'overdue' | 'cancelled' | 'draft' | string;
  totalAmount: number;
  total?: string | number;
  taxAmount?: number;
  amount?: number;
  currency?: string;
  issueDate: string;
  dueDate?: string;
  pdfUrl?: string;
  order?: { id: string; orderNumber: string; orderType?: string; status?: string };
}

const statusCfg: Record<string, { color: string; bg: string; dark: string; icon: any }> = {
  paid: { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dark: 'dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300', icon: CheckCircle2 },
  pending: { color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dark: 'dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-300', icon: Clock },
  overdue: { color: 'text-red-700', bg: 'bg-red-50 border-red-200', dark: 'dark:bg-red-900/30 dark:border-red-800 dark:text-red-300', icon: AlertCircle },
  cancelled: { color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', dark: 'dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-400', icon: XCircle },
  draft: { color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200', dark: 'dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-400', icon: FileText },
};

const MyInvoices = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => { fetchInvoices(); }, [page, rowsPerPage, statusFilter]);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params: any = { page: page + 1, limit: rowsPerPage };
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await api.get('/billing/invoices', { params });
      if (data?.success) { setInvoices(data.data.invoices); setTotal(data.data.pagination.total); }
    } catch {
      toast({ title: 'Unable to load invoices', description: 'Please try again.', variant: 'destructive' });
    } finally { setLoading(false); }
  };

  const filtered = useMemo(() => invoices.filter(inv => {
    if (!search) return true;
    const t = search.toLowerCase();
    return inv.invoiceNumber?.toLowerCase().includes(t) || inv.order?.orderNumber?.toLowerCase().includes(t);
  }), [invoices, search]);

  const handleDownload = async (invoice: Invoice) => {
    try {
      setDownloadingId(invoice.id);
      const token = localStorage.getItem('token');
      const response = await api.get(`/billing/invoices/${invoice.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a'); a.href = url; a.setAttribute('download', `invoice_${invoice.invoiceNumber}.pdf`); document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
      toast({ title: 'Downloaded', description: invoice.invoiceNumber });
    } catch { toast({ title: 'Download failed', variant: 'destructive' }); } finally { setDownloadingId(null); }
  };

  const paidAmount = (inv: Invoice) => Number(inv.total ?? inv.totalAmount ?? inv.amount ?? 0);
  const totalPages = Math.ceil(total / rowsPerPage);
  const gs = (s: string) => statusCfg[s] || statusCfg.draft;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <motion.div variants={container as unknown as Variants} initial="hidden" animate="show" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Hero Header */}
        <motion.div variants={item as unknown as Variants} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-700 via-purple-700 to-fuchsia-700 p-8 text-white shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-white/5 blur-3xl" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-sm"><FileText className="w-6 h-6" /></div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">My Invoices</h1>
              </div>
              <p className="text-purple-100 text-sm md:text-base max-w-lg">Download invoices and review your billing history across all orders.</p>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => navigate('/billing/orders')} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20 backdrop-blur-sm">
                <ShoppingBag className="w-4 h-4 mr-2" /> Order History
              </Button>
              <Button onClick={fetchInvoices} disabled={loading} className="bg-white text-violet-700 hover:bg-white/90 shadow-lg">
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div variants={item as unknown as Variants}>
          <Card className="border-0 shadow-md dark:bg-slate-800/60 dark:border-slate-700/50">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input placeholder="Search invoice or order number..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-white dark:bg-slate-900 dark:border-slate-700" />
                </div>
                <div className="flex gap-1 items-center bg-gray-100 dark:bg-slate-800 rounded-lg p-1">
                  {[{ val: 'all', label: 'All' },{ val: 'paid', label: 'Paid' },{ val: 'pending', label: 'Pending' },{ val: 'overdue', label: 'Overdue' },{ val: 'cancelled', label: 'Cancelled' },{ val: 'draft', label: 'Draft' }].map(f => (
                    <button key={f.val} onClick={() => { setStatusFilter(f.val); setPage(0); }} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${statusFilter === f.val ? 'bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-300 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700'}`}>{f.label}</button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Invoice List */}
        <motion.div variants={item as unknown as Variants} className="space-y-3">
          {loading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => (
              <Card key={i} className="border-0 shadow-sm dark:bg-slate-800/40"><CardContent className="p-5"><div className="flex items-center gap-4"><Skeleton className="w-12 h-12 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-28" /></div><Skeleton className="h-6 w-20 rounded-full" /><Skeleton className="h-5 w-24" /></div></CardContent></Card>
            ))}</div>
          ) : filtered.length === 0 ? (
            <Card className="border-0 shadow-md dark:bg-slate-800/60"><CardContent className="flex flex-col items-center justify-center py-16">
              <div className="p-4 rounded-2xl bg-gray-100 dark:bg-slate-800 mb-4"><Receipt className="w-10 h-10 text-gray-400 dark:text-slate-500" /></div>
              <p className="text-lg font-semibold text-gray-700 dark:text-slate-300 mb-1">No invoices found</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">Completed payments will generate invoices automatically.</p>
            </CardContent></Card>
          ) : (
            <AnimatePresence>
              {filtered.map((inv, idx) => {
                const si = gs(inv.status);
                const SI = si.icon;
                return (
                  <motion.div key={inv.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ delay: idx * 0.04, duration: 0.35 }} whileHover={{ y: -2 }}>
                    <Card className="group border-0 shadow-sm hover:shadow-xl dark:bg-slate-800/60 dark:hover:bg-slate-800/80 dark:border-slate-700/50 transition-all duration-300 overflow-hidden">
                      <CardContent className="p-0">
                        <div className="flex items-stretch">
                          <div className={`w-1.5 shrink-0 rounded-l-xl ${inv.status === 'paid' ? 'bg-gradient-to-b from-emerald-400 to-emerald-600' : inv.status === 'overdue' ? 'bg-gradient-to-b from-red-400 to-red-600' : inv.status === 'pending' ? 'bg-gradient-to-b from-amber-400 to-amber-600' : 'bg-gradient-to-b from-gray-300 to-gray-400'}`} />
                          <div className="flex-1 p-5">
                            <div className="flex flex-col md:flex-row md:items-center gap-4">
                              {/* Invoice info */}
                              <div className="flex items-center gap-4 flex-1 min-w-0">
                                <div className={`p-3 rounded-xl ${si.bg} border ${si.dark} shrink-0`}><SI className="w-5 h-5" /></div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-semibold text-gray-900 dark:text-white">{inv.invoiceNumber}</p>
                                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase ${si.bg} ${si.color} ${si.dark}`}>{inv.status}</div>
                                  </div>
                                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                                    {inv.order && <span className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1"><ShoppingBag className="w-3 h-3" />{inv.order.orderNumber} <Badge variant="outline" className="text-[9px] ml-0.5">{inv.order.orderType || 'Order'}</Badge></span>}
                                    {inv.issueDate && <span className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(inv.issueDate), 'dd MMM yyyy')}</span>}
                                    {inv.dueDate && <span className="text-xs text-gray-500 dark:text-slate-400">Due: {format(new Date(inv.dueDate), 'dd MMM yyyy')}</span>}
                                  </div>
                                </div>
                              </div>

                              {/* Amount & Actions */}
                              <div className="flex items-center gap-4 md:gap-6">
                                <p className="text-lg font-bold text-gray-900 dark:text-white whitespace-nowrap">₹{paidAmount(inv).toLocaleString('en-IN')}</p>
                                <div className="flex items-center gap-1 shrink-0">
                                  {inv.order?.id && (
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-violet-600 dark:hover:text-violet-400" onClick={() => navigate(`/billing/orders/${inv.order!.id}`)} aria-label="View order">
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-violet-600 dark:hover:text-violet-400" onClick={() => handleDownload(inv)} disabled={!inv.pdfUrl || downloadingId === inv.id} aria-label="Download invoice">
                                    {downloadingId === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                  </Button>
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
          <motion.div variants={item as unknown as Variants} className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-slate-400">Showing {page * rowsPerPage + 1}–{Math.min((page + 1) * rowsPerPage, total)} of {total}</p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="dark:border-slate-700 dark:text-slate-300">Previous</Button>
              {[...Array(Math.min(totalPages, 5))].map((_, i) => { const pn = page < 3 ? i : page - 2 + i; if (pn >= totalPages) return null; return (
                <Button key={pn} variant={page === pn ? 'default' : 'outline'} size="sm" onClick={() => setPage(pn)} className={`w-9 ${page === pn ? 'bg-violet-600 text-white hover:bg-violet-700' : 'dark:border-slate-700 dark:text-slate-300'}`}>{pn + 1}</Button>
              ); })}
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="dark:border-slate-700 dark:text-slate-300">Next</Button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default MyInvoices;
