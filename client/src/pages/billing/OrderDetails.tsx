import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { format } from 'date-fns';
import {
  ArrowLeft, Download, Receipt, CheckCircle2, Clock, XCircle, AlertCircle,
  CreditCard, MapPin, StickyNote, Package, RefreshCw, Loader2, Copy,
  Wallet, FileText, Shield, Calendar, IndianRupee, Truck, ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [.25,.46,.45,.94] } } };

const statusStyle: Record<string, { color: string; bg: string; dark: string; icon: any }> = {
  completed: { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dark: 'dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300', icon: CheckCircle2 },
  success: { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dark: 'dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300', icon: CheckCircle2 },
  processing: { color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', dark: 'dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300', icon: Clock },
  pending: { color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dark: 'dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-300', icon: AlertCircle },
  failed: { color: 'text-red-700', bg: 'bg-red-50 border-red-200', dark: 'dark:bg-red-900/30 dark:border-red-800 dark:text-red-300', icon: XCircle },
  cancelled: { color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', dark: 'dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-400', icon: XCircle },
};

const OrderDetails = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);

  useEffect(() => { fetchOrderDetails(); }, [orderId]);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/billing/orders/${orderId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (response.data.success) setOrder(response.data.data.order);
    } catch (error: any) {
      toast({ title: 'Error', description: 'Failed to load order details', variant: 'destructive' });
      navigate('/billing/orders');
    } finally { setLoading(false); }
  };

  const handleDownloadInvoice = async () => {
    if (!order?.invoice) return;
    try {
      setDownloadingInvoice(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/billing/invoices/${order.invoice.id}/download`, { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a'); a.href = url; a.setAttribute('download', `invoice_${order.invoice.invoiceNumber}.pdf`); document.body.appendChild(a); a.click(); a.remove();
      toast({ title: 'Downloaded', description: 'Invoice saved' });
    } catch { toast({ title: 'Error', description: 'Failed to download invoice', variant: 'destructive' }); } finally { setDownloadingInvoice(false); }
  };

  const handleReorder = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/billing/orders/${orderId}/reorder`, {}, { headers: { Authorization: `Bearer ${token}` } });
      if (response.data.success) {
        toast({ title: 'Reorder created!', description: 'Redirecting to checkout...' });
        navigate('/billing/checkout', { state: response.data.data });
      }
    } catch { toast({ title: 'Error', description: 'Failed to reorder', variant: 'destructive' }); }
  };

  const gs = (s: string) => statusStyle[s] || statusStyle.pending;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2"><Skeleton className="h-64 w-full rounded-xl" /></div>
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-slate-950">
        <Card className="border-0 shadow-lg dark:bg-slate-800/60 p-8 text-center">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-lg font-semibold text-gray-800 dark:text-white">Order not found</p>
          <Button onClick={() => navigate('/billing/orders')} className="mt-4">Back to Orders</Button>
        </Card>
      </div>
    );
  }

  const st = gs(order.status);
  const StIcon = st.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Back nav */}
        <motion.div variants={item} className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/billing/orders')} className="rounded-full h-10 w-10 dark:text-slate-300 dark:hover:bg-slate-800">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <p className="text-sm text-gray-500 dark:text-slate-400">Back to orders</p>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Order #{order.orderNumber}</h1>
          </div>
        </motion.div>

        {/* Status Banner */}
        <motion.div variants={item} className={`relative overflow-hidden rounded-2xl border p-6 ${st.bg} ${st.dark}`}>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.3),transparent_60%)]" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${st.bg} border ${st.dark}`}><StIcon className="w-6 h-6" /></div>
              <div>
                <p className="text-sm font-medium opacity-75">Order Status</p>
                <p className="text-xl font-bold capitalize">{order.status}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="text-center px-4">
                <p className="text-xs font-medium opacity-60">Order Type</p>
                <p className="font-semibold capitalize">{order.orderType}</p>
              </div>
              <Separator orientation="vertical" className="h-10 hidden md:block" />
              <div className="text-center px-4">
                <p className="text-xs font-medium opacity-60">Date</p>
                <p className="font-semibold">{format(new Date(order.createdAt), 'dd MMM yyyy')}</p>
              </div>
              <Separator orientation="vertical" className="h-10 hidden md:block" />
              <div className="text-center px-4">
                <p className="text-xs font-medium opacity-60">Total</p>
                <p className="text-xl font-bold">{order.currency === 'INR' ? '₹' : order.currency} {order.total?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left: Main info */}
          <div className="md:col-span-2 space-y-6">
            {/* Pricing */}
            <motion.div variants={item}>
              <Card className="border-0 shadow-md dark:bg-slate-800/60 dark:border-slate-700/50 overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-800 dark:to-slate-800/80 border-b dark:border-slate-700/50 pb-4">
                  <CardTitle className="flex items-center gap-2 text-base"><IndianRupee className="w-4 h-4 text-emerald-600" /> Pricing Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-3">
                  <div className="flex justify-between"><span className="text-gray-500 dark:text-slate-400">Subtotal</span><span className="font-medium text-gray-900 dark:text-white">{order.currency === 'INR' ? '₹' : order.currency} {order.subtotal?.toFixed(2)}</span></div>
                  {order.tax > 0 && <div className="flex justify-between"><span className="text-gray-500 dark:text-slate-400">Tax (GST)</span><span className="font-medium text-gray-900 dark:text-white">{order.currency === 'INR' ? '₹' : order.currency} {order.tax?.toFixed(2)}</span></div>}
                  {order.discount > 0 && <div className="flex justify-between"><span className="text-emerald-600 dark:text-emerald-400">Discount</span><span className="font-medium text-emerald-600 dark:text-emerald-400">-{order.currency === 'INR' ? '₹' : order.currency} {order.discount?.toFixed(2)}</span></div>}
                  <Separator />
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-lg font-bold text-gray-900 dark:text-white">Total</span>
                    <span className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">{order.currency === 'INR' ? '₹' : order.currency} {order.total?.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Address */}
            {order.billingAddress && (
              <motion.div variants={item}>
                <Card className="border-0 shadow-md dark:bg-slate-800/60 dark:border-slate-700/50">
                  <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-800 dark:to-slate-800/80 border-b dark:border-slate-700/50 pb-4">
                    <CardTitle className="flex items-center gap-2 text-base"><MapPin className="w-4 h-4 text-blue-600" /> Billing Address</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <p className="text-gray-700 dark:text-slate-300">
                      {[order.billingAddress.street, order.billingAddress.city, order.billingAddress.state, order.billingAddress.pincode].filter(Boolean).join(', ')}
                    </p>
                    {order.billingAddress.country && <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{order.billingAddress.country}</p>}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Notes */}
            {order.notes && (
              <motion.div variants={item}>
                <Card className="border-0 shadow-md dark:bg-slate-800/60 dark:border-slate-700/50">
                  <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-800 dark:to-slate-800/80 border-b dark:border-slate-700/50 pb-4">
                    <CardTitle className="flex items-center gap-2 text-base"><StickyNote className="w-4 h-4 text-amber-600" /> Notes</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <p className="text-gray-600 dark:text-slate-400">{order.notes}</p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>

          {/* Right sidebar */}
          <div className="space-y-6">
            {/* Actions */}
            <motion.div variants={item}>
              <Card className="border-0 shadow-md dark:bg-slate-800/60 dark:border-slate-700/50">
                <CardContent className="p-5 space-y-3">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Quick Actions</p>
                  {order.invoice && (
                    <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleDownloadInvoice} disabled={downloadingInvoice}>
                      {downloadingInvoice ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                      Download Invoice
                    </Button>
                  )}
                  <Button variant="outline" className="w-full dark:border-slate-700 dark:text-slate-300" onClick={handleReorder}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Reorder
                  </Button>
                  <Button variant="outline" className="w-full dark:border-slate-700 dark:text-slate-300" onClick={() => navigate('/billing/invoices')}>
                    <FileText className="w-4 h-4 mr-2" /> All Invoices
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            {/* Invoice Card */}
            {order.invoice && (
              <motion.div variants={item}>
                <Card className="border-0 shadow-md dark:bg-slate-800/60 dark:border-slate-700/50 overflow-hidden">
                  <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-blue-500" />
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Receipt className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Invoice</p>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-slate-400">Number</span>
                      <span className="font-medium text-gray-900 dark:text-white">{order.invoice.invoiceNumber}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-slate-400">Status</span>
                      <Badge variant="outline" className="text-xs capitalize">{order.invoice.status}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Payment info */}
            {order.payments && order.payments.length > 0 && (
              <motion.div variants={item}>
                <Card className="border-0 shadow-md dark:bg-slate-800/60 dark:border-slate-700/50 overflow-hidden">
                  <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center gap-2 mb-1"><Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /><p className="text-sm font-semibold text-gray-900 dark:text-white">Payments</p></div>
                    {order.payments.map((p: any, i: number) => {
                      const ps = gs(p.status);
                      return (
                        <div key={p.id} className="p-3 rounded-lg bg-gray-50 dark:bg-slate-800/80 border border-gray-100 dark:border-slate-700/50 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-medium text-gray-500 dark:text-slate-400">Payment #{i + 1}</span>
                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${ps.bg} ${ps.color} ${ps.dark}`}>
                              <span className="capitalize">{p.status}</span>
                            </div>
                          </div>
                          {p.gateway && <div className="flex justify-between text-xs"><span className="text-gray-400">Gateway</span><span className="text-gray-700 dark:text-slate-300 capitalize">{p.gateway}</span></div>}
                          {p.method && <div className="flex justify-between text-xs"><span className="text-gray-400">Method</span><span className="text-gray-700 dark:text-slate-300">{p.method}</span></div>}
                          <div className="flex justify-between text-xs"><span className="text-gray-400">Amount</span><span className="font-semibold text-gray-900 dark:text-white">{p.currency} {p.amount?.toFixed(2)}</span></div>
                          <div className="flex justify-between text-xs"><span className="text-gray-400">Date</span><span className="text-gray-600 dark:text-slate-400">{format(new Date(p.createdAt), 'dd MMM yyyy, hh:mm a')}</span></div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default OrderDetails;
