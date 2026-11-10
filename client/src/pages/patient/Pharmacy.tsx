import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Pill, ShoppingCart, MapPin, Clock, Plus, Search, Package,
  RefreshCw, Eye, Truck, CheckCircle, XCircle,
  FileText, CreditCard, Calendar, IndianRupee, Activity, BoxIcon,
  Minus, Trash2, Loader2, AlertCircle, SearchX
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineError } from '@/components/ui/inline-error';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle, DialogTrigger, DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import api from '@/utils/api';

// ──────────────────── Types ────────────────────

interface PharmacyOrder {
  id: string;
  orderNumber?: string;
  orderDate: string;
  status: 'pending' | 'confirmed' | 'processing' | 'out_for_delivery' | 'delivered' | 'completed' | 'cancelled';
  items: { name: string; quantity: number; price: number; unit?: string; packSize?: string; packPrice?: number }[];
  totalAmount: number;
  deliveryAddress: string;
  estimatedDelivery?: string;
  prescriptionRequired: boolean;
  prescriptionUrl?: string;
  trackingNumber?: string;
  canReorder?: boolean;
}

interface OrderStats {
  totalOrders: number;
  activeOrders: number;
  deliveredOrders: number;
  totalSpent: number;
}

interface DetailedOrder extends PharmacyOrder {
  subtotal?: number;
  tax?: number;
  discount?: number;
  currency?: string;
  billingAddress?: string;
  trackingUrl?: string;
  actualDelivery?: string;
  payments?: {
    id: number;
    paymentId: string;
    amount: number;
    status: string;
    method: string;
    createdAt: string;
  }[];
  invoice?: {
    id: number;
    invoiceNumber: string;
    status: string;
    pdfUrl?: string;
  };
  statusTimeline?: { status: string; timestamp: string }[];
  notes?: string;
}

interface MedicineResult {
  id: string;
  name: string;
  genericName?: string;
  category?: string;
  manufacturer?: string;
  strength?: string;
  form?: string;
  price: number;
  packSize?: string;
  schedule?: string;
  prescriptionRequired?: boolean;
}

interface CartItem extends MedicineResult {
  quantity: number;
}

/** Parse packSize like "10 tablets" → { qty: 10, unit: 'tablet' } */
// Mirrors server/utils/pharmacy-pricing.js. `qty` is how many separately
// priceable items a pack holds, so a measured pack is 1.
//
// The previous version matched an unanchored /(\d+)\s*(.*)/, so "bottle of
// 100 ml Syrup" became 100 units and a 16.22 bottle was offered at 0.16 per ml.
// Nothing dispenses 1 ml of syrup, and the figure shown no longer matched the
// price the order was billed at.
const MEASURE_UNITS = new Set(['ml', 'l', 'litre', 'liter', 'g', 'gm', 'gms', 'gram', 'mg', 'mcg', 'kg', 'iu', '%']);
const COUNTABLE_UNITS = new Set([
  'tablet', 'capsule', 'injection', 'sachet', 'suppository', 'pessary', 'lozenge',
  'chewable', 'patch', 'ampoule', 'vial', 'piece', 'pen', 'applicator', 'suspension',
  'wafer', 'granule', 'strip', 'kit', 'unit',
]);
const singularUnit = (word: string) => {
  const w = (word || '').trim().toLowerCase();
  if (w.length > 2 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 2 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};
const parsePackSize = (packSize?: string): { qty: number; unit: string; countable: boolean } => {
  const raw = (packSize || '').trim();
  const whole = { qty: 1, unit: 'pack', countable: false };
  if (!raw) return whole;
  const match = raw.match(/(?:^|\bof\s+)(\d+(?:\.\d+)?)\s+([^\d]+)$/i) || raw.match(/^(\d+(?:\.\d+)?)\s+([^\d]+)$/i);
  if (!match) return whole;
  const count = Number(match[1]);
  if (!Number.isFinite(count) || count <= 0) return whole;
  const firstWord = singularUnit((match[2] || '').trim().split(/\s+/)[0] || '');
  if (MEASURE_UNITS.has(firstWord)) {
    const container = singularUnit(raw.split(/\s+of\s+/i)[0] || 'pack');
    return { qty: 1, unit: container || 'pack', countable: false };
  }
  if (COUNTABLE_UNITS.has(firstWord)) return { qty: Math.floor(count), unit: firstWord, countable: true };
  return whole;
};

// ──────────────────── Helpers ────────────────────

const statusConfig: Record<string, { bg: string; text: string; icon: React.ComponentType<any>; dot: string }> = {
  pending:          { bg: 'bg-amber-50 dark:bg-amber-950/40',   text: 'text-amber-700 dark:text-amber-300',   icon: Clock,        dot: 'bg-amber-500' },
  confirmed:        { bg: 'bg-blue-50 dark:bg-blue-950/40',     text: 'text-blue-700 dark:text-blue-300',     icon: CheckCircle,  dot: 'bg-blue-500' },
  processing:       { bg: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-700 dark:text-indigo-300', icon: Activity,      dot: 'bg-indigo-500' },
  out_for_delivery: { bg: 'bg-purple-50 dark:bg-purple-950/40', text: 'text-purple-700 dark:text-purple-300', icon: Truck,         dot: 'bg-purple-500' },
  delivered:        { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', icon: CheckCircle, dot: 'bg-emerald-500' },
  completed:        { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', icon: CheckCircle, dot: 'bg-emerald-500' },
  cancelled:        { bg: 'bg-red-50 dark:bg-red-950/40',       text: 'text-red-700 dark:text-red-300',       icon: XCircle,       dot: 'bg-red-500' },
};

const getStatusBadge = (status: string) => {
  const cfg = statusConfig[status] || statusConfig.pending;
  return `${cfg.bg} ${cfg.text} border-0`;
};

const StatusIcon = ({ status }: { status: string }) => {
  const cfg = statusConfig[status] || statusConfig.pending;
  const Icon = cfg.icon;
  return <Icon className="h-3.5 w-3.5 mr-1" />;
};

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease: [0.25, 0.46, 0.45, 0.94] },
});

// ──────────────────── Component ────────────────────

const Pharmacy = () => {
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [stats, setStats] = useState<OrderStats>({ totalOrders: 0, activeOrders: 0, deliveredOrders: 0, totalSpent: 0 });
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [reorderLoading, setReorderLoading] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<DetailedOrder | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // ── Medicine search state ──
  const [medQuery, setMedQuery] = useState('');
  const [medResults, setMedResults] = useState<MedicineResult[]>([]);
  const [medSearching, setMedSearching] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [deliveryAddr, setDeliveryAddr] = useState('');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [prescriptionFile, setPrescriptionFile] = useState<File | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { fetchPharmacyOrders(); }, []);

  // ── Filtered orders ──
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesSearch = !searchTerm ||
        o.items.some(i => i.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (o.orderNumber || o.id).toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter]);

  // ── API calls ──

  const fetchPharmacyOrders = async () => {
    try {
      setLoading(true);
      setFetchError(false);
      const { data } = await api.get('/billing/orders/pharmacy/history');

      if (data.success) {
        setOrders(data.data.orders.map((order: any) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          orderDate: order.orderDate,
          status: order.status === 'completed' ? 'delivered' : order.status,
          items: order.items || [],
          totalAmount: order.totalAmount,
          deliveryAddress: order.deliveryAddress || 'Not specified',
          estimatedDelivery: order.estimatedDelivery,
          prescriptionRequired: order.prescriptionRequired,
          prescriptionUrl: order.prescriptionUrl,
          trackingNumber: order.trackingNumber,
          canReorder: order.canReorder,
        })));
        setStats(data.data.stats);
      }
    } catch {
      setFetchError(true);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderDetails = async (orderId: string) => {
    try {
      setDetailsLoading(true);
      const { data } = await api.get(`/billing/orders/${orderId}/detailed`);

      if (data.success) {
        const order = data.data.order;
        setSelectedOrder({
          id: order.id, orderNumber: order.orderNumber, orderDate: order.createdAt,
          status: order.status === 'completed' ? 'delivered' : order.status,
          items: order.items || [], totalAmount: order.total,
          subtotal: order.subtotal, tax: order.tax, discount: order.discount,
          currency: order.currency,
          deliveryAddress: order.deliveryAddress || order.shippingAddress || 'Not specified',
          billingAddress: order.billingAddress,
          estimatedDelivery: order.estimatedDelivery, actualDelivery: order.actualDelivery,
          prescriptionRequired: order.prescriptionRequired, prescriptionUrl: order.prescriptionUrl,
          trackingNumber: order.trackingNumber, trackingUrl: order.trackingUrl,
          payments: order.payments, invoice: order.invoice,
          statusTimeline: order.statusTimeline, notes: order.notes,
        });
        setShowDetailsDialog(true);
      }
    } catch {
      const order = orders.find(o => o.id === orderId);
      if (order) { setSelectedOrder(order as DetailedOrder); setShowDetailsDialog(true); }
      else toast.error('Failed to load order details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleReorder = async (orderId: string) => {
    try {
      setReorderLoading(orderId);
      const { data } = await api.post(`/billing/orders/${orderId}/reorder`);

      if (data.success) {
        toast.success('Reorder created successfully!', { description: `Order #${data.data.order.orderNumber} has been created.` });
        fetchPharmacyOrders();
      }
    } catch (error: any) {
      toast.error('Failed to reorder', { description: error.response?.data?.message || 'Please try again later' });
    } finally {
      setReorderLoading(null);
    }
  };

  // ── Medicine search (debounced) ──
  const searchMedicines = useCallback(async (query: string) => {
    if (query.trim().length < 2) { setMedResults([]); setMedSearching(false); return; }
    try {
      setMedSearching(true);
      const { data } = await api.get(`/billing/orders/pharmacy/medicine-search?q=${encodeURIComponent(query.trim())}&limit=10`);
      if (data.success) setMedResults(data.data || []);
      else setMedResults([]);
    } catch {
      setMedResults([]);
    } finally {
      setMedSearching(false);
    }
  }, []);

  const onMedQueryChange = (value: string) => {
    setMedQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setMedResults([]); setMedSearching(false); return; }
    setMedSearching(true);
    debounceRef.current = setTimeout(() => searchMedicines(value), 350);
  };

  const addToCart = (med: MedicineResult) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === med.id);
      if (existing) return prev.map(c => c.id === med.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { ...med, quantity: 1 }];
    });
    setMedQuery('');
    setMedResults([]);
  };

  const updateCartQty = (id: string, delta: number) => {
    setCart(prev => prev.map(c => c.id === id ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(c => c.id !== id));
  };

  const prescriptionNeeded = useMemo(() => cart.some(c => c.prescriptionRequired), [cart]);

  // Mirrors server/utils/pharmacy-pricing.js: 15% off above 2,000 (strictly
  // above), plus a flat 40 delivery fee on every order. The discount never
  // applies to the delivery fee, and the fee never counts towards the threshold.
  const DELIVERY_FEE = 40;
  const DISCOUNT_THRESHOLD = 2000;
  const DISCOUNT_PCT = 15;

  const money = (n: number) => Number(n.toFixed(2));

  const cartSubtotal = useMemo(() => money(cart.reduce((sum, c) => {
    const { qty: packQty } = parsePackSize(c.packSize);
    return sum + (c.price / packQty) * c.quantity;
  }, 0)), [cart]);

  const cartDiscount = useMemo(
    () => (cartSubtotal > DISCOUNT_THRESHOLD ? money((cartSubtotal * DISCOUNT_PCT) / 100) : 0),
    [cartSubtotal],
  );
  const cartDelivery = cart.length ? DELIVERY_FEE : 0;
  const cartTotal = useMemo(
    () => money(cartSubtotal - cartDiscount + cartDelivery),
    [cartSubtotal, cartDiscount, cartDelivery],
  );

  const handlePlaceOrder = async () => {
    if (cart.length === 0) { toast.error('Add at least one medicine'); return; }
    if (deliveryAddr.trim().length < 15 || !/\b[1-9]\d{5}\b/.test(deliveryAddr) || !/[a-zA-Z]{3}/.test(deliveryAddr)) { toast.error('Enter your full street address, city and six-digit pincode'); return; }
    if (prescriptionNeeded && !prescriptionFile) {
      toast.error('A prescription is required', { description: 'Some items in your cart are prescription-only. Please attach a prescription.' });
      return;
    }
    try {
      setPlacingOrder(true);
      const orderItems = cart.map(c => {
        const { qty: packQty, unit } = parsePackSize(c.packSize);
        const unitPrice = +(c.price / packQty).toFixed(2);
        // unitMode tells the server how to read `quantity`; the amount itself is
        // always taken from the catalogue, never from these figures.
        return { name: c.name, quantity: c.quantity, price: unitPrice, medicineId: c.id, unit, unitMode: packQty > 1 ? 'unit' : 'pack', packPrice: c.price, packSize: c.packSize };
      });

      // Multipart only when there is a file, so the plain JSON path is untouched.
      let data;
      if (prescriptionFile) {
        const fd = new FormData();
        fd.append('orderType', 'medicine');
        fd.append('items', JSON.stringify(orderItems));
        fd.append('deliveryAddress', deliveryAddr.trim());
        fd.append('prescriptionRequired', String(prescriptionNeeded));
        fd.append('prescription', prescriptionFile);
        ({ data } = await api.post('/billing/orders', fd, { headers: { 'Content-Type': 'multipart/form-data' } }));
      } else {
        ({ data } = await api.post('/billing/orders', {
          orderType: 'medicine',
          items: orderItems,
          deliveryAddress: deliveryAddr.trim(),
          prescriptionRequired: prescriptionNeeded,
        }));
      }
      if (data.success) {
        toast.success('Order placed!', { description: `Order #${data.data?.order?.orderNumber || data.data?.order?.id || ''} created.` });
        setShowOrderDialog(false);
        setCart([]);
        setPrescriptionFile(null);
        setMedQuery('');
        setMedResults([]);
        setDeliveryAddr('');
        fetchPharmacyOrders();
      }
    } catch (error: any) {
      toast.error('Failed to place order', { description: error.response?.data?.message || 'Please try again.' });
    } finally {
      setPlacingOrder(false);
    }
  };

  // ──────────────────── Render ────────────────────

  return (
    <div className="max-w-7xl mx-auto space-y-6 px-4 md:px-6 py-6">

      {/* ━━━ Premium Header ━━━ */}
      <motion.div {...fadeUp(0)}>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-6 md:p-8 text-white shadow-2xl">
          {/* Decorative orbs */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.18),transparent_60%)]" />
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-emerald-400/20 blur-2xl" />

          <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 rounded-2xl bg-white/15 backdrop-blur-sm ring-1 ring-white/20 shadow-lg">
                  <Pill className="w-6 h-6" />
                </div>
                <Badge className="bg-white/15 hover:bg-white/20 text-white border-white/20 text-xs font-semibold tracking-wide">
                  Medicine Hub
                </Badge>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">Pharmacy</h1>
              <p className="text-emerald-100/90 text-sm md:text-base max-w-md">
                Order medicines, track deliveries, and manage your prescriptions — all in one place.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20 backdrop-blur-sm"
                onClick={() => fetchPharmacyOrders()}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Dialog open={showOrderDialog} onOpenChange={setShowOrderDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-white text-emerald-700 hover:bg-white/90 shadow-lg font-semibold">
                    <Plus className="h-4 w-4 mr-2" />
                    New Order
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg dark:bg-slate-900 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 dark:text-white">
                      <ShoppingCart className="h-5 w-5 text-emerald-600" />
                      Order Medicines
                    </DialogTitle>
                    <DialogDescription className="dark:text-slate-400">
                      Search for medicines, add to cart, and place your order.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">

                    {/* ── Search ── */}
                    <div className="space-y-2">
                      <Label className="dark:text-slate-300">Search Medicine</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          placeholder="Type at least 2 characters, e.g. Paracetamol..."
                          className="pl-9 dark:bg-slate-800 dark:border-slate-600"
                          value={medQuery}
                          onChange={(e) => onMedQueryChange(e.target.value)}
                          autoFocus
                        />
                        {medSearching && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 animate-spin" />
                        )}
                      </div>

                      {/* Search results dropdown */}
                      {medQuery.trim().length >= 2 && (
                        <div className="border rounded-xl dark:border-slate-700 dark:bg-slate-800/80 bg-white shadow-lg max-h-52 overflow-y-auto">
                          {medSearching && medResults.length === 0 ? (
                            <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
                              <Loader2 className="h-4 w-4 animate-spin" /> Searching...
                            </div>
                          ) : medResults.length === 0 ? (
                            <EmptyState
                              icon={SearchX}
                              title="No results found"
                              description="Try a shorter name, generic name, or check the spelling."
                              size="sm"
                            />
                          ) : (
                            medResults.map(med => (
                              <button
                                key={med.id}
                                type="button"
                                className="w-full text-left px-4 py-3 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors border-b last:border-b-0 dark:border-slate-700/50"
                                onClick={() => addToCart(med)}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold dark:text-white truncate">{med.name}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                      {[med.genericName, med.manufacturer, med.form, med.strength, med.packSize].filter(Boolean).join(' · ')}
                                    </p>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="text-sm font-bold text-emerald-600">₹{(med.price / parsePackSize(med.packSize).qty).toFixed(2)}<span className="text-[10px] font-normal text-slate-400">/{parsePackSize(med.packSize).unit}</span></p>
                                    {med.packSize && (
                                      <p className="text-[10px] text-slate-400 dark:text-slate-500">MRP ₹{med.price} / {med.packSize}</p>
                                    )}
                                    {med.prescriptionRequired && (
                                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Rx</span>
                                    )}
                                  </div>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── Cart ── */}
                    {cart.length > 0 && (
                      <div className="space-y-2">
                        <Label className="dark:text-slate-300 flex items-center gap-2">
                          Cart
                          <Badge variant="secondary" className="text-xs">{cart.length} item{cart.length > 1 ? 's' : ''}</Badge>
                        </Label>
                        <div className="border rounded-xl dark:border-slate-700 divide-y dark:divide-slate-700">
                          {cart.map(item => (
                            <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium dark:text-white truncate">{item.name}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Pack: ₹{item.price.toFixed(2)} ({item.packSize || "pack size not specified"}) · ₹{(item.price / parsePackSize(item.packSize).qty).toFixed(2)} / {parsePackSize(item.packSize).unit}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Button
                                  type="button" variant="outline" size="icon"
                                  className="h-7 w-7 dark:border-slate-600"
                                  onClick={() => updateCartQty(item.id, -1)}
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="text-sm font-semibold w-6 text-center dark:text-white">{item.quantity}</span>
                                <Button
                                  type="button" variant="outline" size="icon"
                                  className="h-7 w-7 dark:border-slate-600"
                                  onClick={() => updateCartQty(item.id, 1)}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                              <span className="text-sm font-bold text-emerald-600 w-16 text-right">₹{((item.price / parsePackSize(item.packSize).qty) * item.quantity).toFixed(2)}</span>
                              <Button
                                type="button" variant="ghost" size="icon"
                                className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                onClick={() => removeFromCart(item.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                          <div className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-b-xl space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-500 dark:text-slate-400">Subtotal</span>
                              <span className="text-xs dark:text-slate-300">₹{cartSubtotal.toFixed(2)}</span>
                            </div>
                            {cartDiscount > 0 ? (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-emerald-600">Discount ({DISCOUNT_PCT}% over ₹{DISCOUNT_THRESHOLD.toLocaleString('en-IN')})</span>
                                <span className="text-xs font-medium text-emerald-600">−₹{cartDiscount.toFixed(2)}</span>
                              </div>
                            ) : (
                              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                Add ₹{(DISCOUNT_THRESHOLD - cartSubtotal + 0.01).toFixed(2)} more to get {DISCOUNT_PCT}% off
                              </p>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-500 dark:text-slate-400">Delivery</span>
                              <span className="text-xs dark:text-slate-300">₹{cartDelivery.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-1.5">
                              <span className="text-sm font-semibold dark:text-slate-300">Total</span>
                              <span className="text-lg font-bold text-emerald-600">₹{cartTotal.toFixed(2)}</span>
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-1 px-2">This is the amount you will be charged.</p>
                        </div>
                        {cart.some(c => c.prescriptionRequired) && (
                          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                            <p className="text-xs text-amber-700 dark:text-amber-300">Some items require a prescription. You may be asked to upload one.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Upload Prescription ──
                        This input previously had no onChange and no state, so a file
                        the patient chose here was discarded and never sent. */}
                    <div className="space-y-2">
                      <Label className="dark:text-slate-300">
                        Upload Prescription {prescriptionNeeded ? <span className="text-amber-600">*</span> : '(optional)'}
                      </Label>
                      <div className="border-2 border-dashed rounded-xl p-4 text-center hover:border-emerald-400 transition-colors dark:border-slate-600 dark:hover:border-emerald-500">
                        <FileText className="h-6 w-6 mx-auto text-slate-400 mb-1" />
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                          {prescriptionFile ? prescriptionFile.name : 'PDF or image, up to 10 MB'}
                        </p>
                        <Input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,.pdf"
                          className="max-w-[180px] mx-auto text-xs"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            if (file && file.size > 10 * 1024 * 1024) {
                              toast.error('That prescription is larger than 10 MB');
                              e.target.value = '';
                              return;
                            }
                            setPrescriptionFile(file);
                          }}
                        />
                      </div>
                    </div>

                    {/* ── Delivery Address ── */}
                    <div className="space-y-2">
                      <Label className="dark:text-slate-300">Delivery Address (including city and pincode) *</Label>
                      <Input
                        placeholder="House, street, city, six-digit pincode"
                        className="dark:bg-slate-800 dark:border-slate-600"
                        value={deliveryAddr}
                        onChange={(e) => setDeliveryAddr(e.target.value)}
                      />
                    </div>

                    {/* ── Place Order ── */}
                    <Button
                      className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg font-semibold h-11"
                      onClick={handlePlaceOrder}
                      disabled={cart.length === 0 || placingOrder}
                    >
                      {placingOrder ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Placing Order...</>
                      ) : (
                        <><ShoppingCart className="h-4 w-4 mr-2" /> Place Order {cart.length > 0 && `· ₹${cartTotal.toFixed(2)}`}</>
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div {...fadeUp(0.04)} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-emerald-200/70 dark:border-emerald-900/40 bg-emerald-50/70 dark:bg-emerald-950/20">
          <CardContent className="p-4">
            <p className="text-xs text-emerald-700 dark:text-emerald-300">Network pharmacies</p>
            <p className="text-lg font-semibold text-emerald-800 dark:text-emerald-200">Verified supply partners</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200/70 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-950/20">
          <CardContent className="p-4">
            <p className="text-xs text-blue-700 dark:text-blue-300">Delivery tracking</p>
            <p className="text-lg font-semibold text-blue-800 dark:text-blue-200">Real-time status updates</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200/70 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-950/20">
          <CardContent className="p-4">
            <p className="text-xs text-amber-700 dark:text-amber-300">Prescription safety</p>
            <p className="text-lg font-semibold text-amber-800 dark:text-amber-200">Rx checks for restricted meds</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* ━━━ Stats Grid ━━━ */}
      <motion.div {...fadeUp(0.08)} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Orders', value: stats.totalOrders, icon: BoxIcon, color: '#475569', iconBg: 'bg-slate-100 dark:bg-slate-700', gradient: 'from-slate-600 to-slate-800' },
          { label: 'Active', value: stats.activeOrders, icon: Truck, color: '#3b82f6', iconBg: 'bg-blue-100 dark:bg-blue-900/40', gradient: 'from-blue-500 to-indigo-600' },
          { label: 'Delivered', value: stats.deliveredOrders, icon: CheckCircle, color: '#10b981', iconBg: 'bg-emerald-100 dark:bg-emerald-900/40', gradient: 'from-emerald-500 to-teal-600' },
          { label: 'Paid for medicines', value: `₹${stats.totalSpent.toFixed(0)}`, icon: IndianRupee, color: '#a855f7', iconBg: 'bg-purple-100 dark:bg-purple-900/40', gradient: 'from-purple-500 to-pink-500' },
        ].map((stat) => (
          <motion.div key={stat.label} whileHover={{ scale: 1.03, y: -3 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
            <Card className="dark:bg-slate-800/60 dark:border-slate-700/60 border-slate-200/80 hover:shadow-xl transition-all duration-300 h-full">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl ${stat.iconBg} flex items-center justify-center shrink-0`}>
                    <stat.icon className="h-5 w-5" style={{ color: stat.color }} />
                  </div>
                  <div className="min-w-0">
                    <div className={`text-2xl font-bold bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent leading-tight`}>
                      {stat.value}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">{stat.label}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* ━━━ Search & Filter Bar ━━━ */}
      <motion.div {...fadeUp(0.14)}>
        <Card className="dark:bg-slate-800/60 dark:border-slate-700/60">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search orders by medicine name or order ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 dark:bg-slate-900/50 dark:border-slate-600 h-10"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {['all', 'pending', 'out_for_delivery', 'delivered', 'cancelled'].map(s => (
                  <Button
                    key={s}
                    variant={statusFilter === s ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter(s)}
                    className={statusFilter === s
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                      : 'dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700'}
                  >
                    {s === 'all' ? 'All' : s === 'out_for_delivery' ? 'In Transit' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ━━━ Orders List ━━━ */}
      <motion.div {...fadeUp(0.2)}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold dark:text-white flex items-center gap-2">
            <Package className="h-5 w-5 text-emerald-600" />
            Order History
            {filteredOrders.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs dark:bg-slate-700">{filteredOrders.length}</Badge>
            )}
          </h2>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Card key={i} className="dark:bg-slate-800/60 dark:border-slate-700/60 animate-pulse">
                <CardContent className="p-6">
                  <div className="flex justify-between mb-4">
                    <div className="space-y-2">
                      <div className="h-5 w-40 bg-slate-200 dark:bg-slate-700 rounded" />
                      <div className="h-4 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
                    </div>
                    <div className="h-8 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                  </div>
                  <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                  <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : fetchError ? (
          <InlineError message="Couldn't load orders." onRetry={() => fetchPharmacyOrders()} />
        ) : filteredOrders.length === 0 ? (
          searchTerm || statusFilter !== 'all' ? (
            <EmptyState
              icon={SearchX}
              title="No results found"
              description="Try a shorter name, generic name, or check the spelling."
              size="sm"
            />
          ) : (
            <EmptyState
              icon={Pill}
              title="No orders yet"
              description="Search for medicines and place your first order."
              action={{ label: 'Browse medicines', onClick: () => setShowOrderDialog(true) }}
            />
          )
        ) : (
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {filteredOrders.map((order, idx) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ delay: idx * 0.04, duration: 0.35 }}
                  layout
                >
                  <Card className="group dark:bg-slate-800/60 dark:border-slate-700/60 hover:shadow-xl hover:border-emerald-200 dark:hover:border-emerald-800/60 hover:-translate-y-0.5 transition-all duration-300">
                    <CardContent className="p-5 md:p-6">
                      {/* Top row: Order ID + Status + Amount */}
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <h3 className="font-semibold text-base dark:text-white">
                              Order #{order.orderNumber || order.id}
                            </h3>
                            <Badge className={`${getStatusBadge(order.status)} text-xs font-medium flex items-center`}>
                              <StatusIcon status={order.status} />
                              {order.status.replace(/_/g, ' ')}
                            </Badge>
                            {order.prescriptionRequired && (
                              <Badge variant="outline" className="text-xs bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800">
                                <Pill className="h-3 w-3 mr-1" />
                                Rx
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(order.orderDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            {order.trackingNumber && (
                              <span className="flex items-center gap-1">
                                <Truck className="h-3 w-3" />
                                {order.trackingNumber}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xl md:text-2xl font-bold text-emerald-600 dark:text-emerald-400 leading-tight">
                            ₹{order.totalAmount.toLocaleString('en-IN')}
                          </div>
                          <div className="text-xs text-slate-400">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</div>
                        </div>
                      </div>

                      {/* Items chips */}
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {order.items.slice(0, 3).map((item, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300">
                            <Pill className="h-3 w-3 text-emerald-500" />
                            {item.name} × {item.quantity} {item.unit || "units"}
                          </span>
                        ))}
                        {order.items.length > 3 && (
                          <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400">
                            +{order.items.length - 3} more
                          </span>
                        )}
                      </div>

                      {/* Delivery info */}
                      <div className="flex items-start gap-2 mb-4 p-3 rounded-xl bg-slate-50/80 dark:bg-slate-700/30 text-sm">
                        <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                        <span className="text-slate-600 dark:text-slate-300 line-clamp-1">{order.deliveryAddress}</span>
                      </div>

                      {/* Estimated delivery */}
                      {order.estimatedDelivery && order.status !== 'delivered' && order.status !== 'completed' && (
                        <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 mb-4 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                          <Clock className="h-3.5 w-3.5" />
                          Expected delivery: {new Date(order.estimatedDelivery).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </div>
                      )}

                      {/* Actions */}
                      <Separator className="mb-4 dark:bg-slate-700/50" />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fetchOrderDetails(order.id)}
                          disabled={detailsLoading}
                          className="dark:border-slate-600 dark:hover:bg-slate-700 text-xs h-8"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1.5" />
                          View Details
                        </Button>
                        {order.status !== 'delivered' && order.status !== 'completed' && order.status !== 'cancelled' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (order.trackingNumber) {
                                toast.info(`Tracking: ${order.trackingNumber}`, { description: `Status: ${order.status.replace(/_/g, ' ')}` });
                              } else {
                                toast.info('Tracking not available yet', { description: 'A tracking number will be assigned once your order ships.' });
                              }
                            }}
                            className="dark:border-slate-600 dark:hover:bg-slate-700 text-xs h-8"
                          >
                            <Truck className="h-3.5 w-3.5 mr-1.5" />
                            Track
                          </Button>
                        )}
                        {(order.status === 'delivered' || order.status === 'completed' || order.canReorder) && (
                          <Button
                            size="sm"
                            onClick={() => handleReorder(order.id)}
                            disabled={reorderLoading === order.id}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 shadow-sm"
                          >
                            {reorderLoading === order.id
                              ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                            Reorder
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* ━━━ Order Details Dialog ━━━ */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-slate-900 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 dark:text-white">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                <Package className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <span>Order Details</span>
                {selectedOrder && (
                  <p className="text-sm font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                    #{selectedOrder.orderNumber || selectedOrder.id}
                  </p>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-5 mt-2">
              {/* Status + Date bar */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Status</p>
                  <Badge className={`${getStatusBadge(selectedOrder.status)} text-xs font-medium flex items-center w-fit`}>
                    <StatusIcon status={selectedOrder.status} />
                    {selectedOrder.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Order Date</p>
                  <p className="font-medium text-sm dark:text-white">
                    {new Date(selectedOrder.orderDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 dark:text-white">
                  <Pill className="h-4 w-4 text-emerald-600" />
                  Items Ordered
                </h4>
                <div className="border dark:border-slate-700 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-800/60">
                      <tr>
                        <th className="text-left p-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Item</th>
                        <th className="text-center p-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Qty</th>
                        <th className="text-right p-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Price</th>
                        <th className="text-right p-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-slate-700">
                      {selectedOrder.items.map((item, index) => (
                        <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="p-3 text-sm dark:text-slate-200">{item.name}</td>
                          <td className="p-3 text-center text-sm dark:text-slate-300">{item.quantity}</td>
                          <td className="p-3 text-right text-sm dark:text-slate-300">₹{item.price.toFixed(2)}</td>
                          <td className="p-3 text-right text-sm font-medium dark:text-white">₹{(item.price * item.quantity).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payment Summary */}
              <div className="border dark:border-slate-700 rounded-xl p-4 space-y-2.5">
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 dark:text-white">
                  <CreditCard className="h-4 w-4 text-emerald-600" />
                  Payment Summary
                </h4>
                {selectedOrder.subtotal != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                    <span className="dark:text-slate-200">₹{selectedOrder.subtotal.toFixed(2)}</span>
                  </div>
                )}
                {selectedOrder.tax != null && selectedOrder.tax > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Tax</span>
                    <span className="dark:text-slate-200">₹{selectedOrder.tax.toFixed(2)}</span>
                  </div>
                )}
                {selectedOrder.discount != null && selectedOrder.discount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                    <span>Discount</span>
                    <span>-₹{selectedOrder.discount.toFixed(2)}</span>
                  </div>
                )}
                <Separator className="dark:bg-slate-700" />
                <div className="flex justify-between font-bold text-lg pt-1">
                  <span className="dark:text-white">Total</span>
                  <span className="text-emerald-600 dark:text-emerald-400">₹{selectedOrder.totalAmount.toFixed(2)}</span>
                </div>
              </div>

              {/* Delivery Information */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2 dark:text-white">
                  <MapPin className="h-4 w-4 text-emerald-600" />
                  Delivery Information
                </h4>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Delivery Address</p>
                  <p className="text-sm font-medium dark:text-white">{selectedOrder.deliveryAddress}</p>
                </div>
                {selectedOrder.estimatedDelivery && (
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40">
                      <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs text-blue-600 dark:text-blue-400">Estimated Delivery</p>
                      <p className="text-sm font-medium dark:text-white">{new Date(selectedOrder.estimatedDelivery).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>
                )}
                {selectedOrder.trackingNumber && (
                  <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/30">
                    <p className="text-xs text-purple-600 dark:text-purple-400 mb-1">Tracking Number</p>
                    <p className="text-sm font-medium font-mono dark:text-white">{selectedOrder.trackingNumber}</p>
                  </div>
                )}
              </div>

              {/* Prescription */}
              {selectedOrder.prescriptionRequired && (
                <div className="p-4 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/40">
                  <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
                    <Pill className="h-4 w-4" />
                    <span className="font-medium text-sm">Prescription Required</span>
                  </div>
                  {selectedOrder.prescriptionUrl && (
                    <a
                      href={selectedOrder.prescriptionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline mt-2 inline-flex items-center gap-1"
                    >
                      <FileText className="h-3 w-3" />
                      View uploaded prescription
                    </a>
                  )}
                </div>
              )}

              {/* Status Timeline */}
              {selectedOrder.statusTimeline && selectedOrder.statusTimeline.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 dark:text-white">
                    <Activity className="h-4 w-4 text-emerald-600" />
                    Order Timeline
                  </h4>
                  <div className="relative ml-4">
                    <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-emerald-200 dark:bg-emerald-800" />
                    <div className="space-y-4">
                      {selectedOrder.statusTimeline.map((event, idx) => {
                        const cfg = statusConfig[event.status] || statusConfig.pending;
                        return (
                          <div key={idx} className="flex items-start gap-3 relative">
                            <div className={`w-3 h-3 rounded-full ${cfg.dot} ring-4 ring-white dark:ring-slate-900 -ml-[5px] mt-1.5 shrink-0`} />
                            <div>
                              <p className="font-medium text-sm capitalize dark:text-white">{event.status.replace(/_/g, ' ')}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{new Date(event.timestamp).toLocaleString('en-IN')}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Payment History */}
              {selectedOrder.payments && selectedOrder.payments.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 dark:text-white">
                    <CreditCard className="h-4 w-4 text-emerald-600" />
                    Payment History
                  </h4>
                  <div className="space-y-2">
                    {selectedOrder.payments.map(payment => (
                      <div key={payment.id} className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                        <div>
                          <p className="font-medium text-sm dark:text-white">{payment.method || 'Payment'}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{new Date(payment.createdAt).toLocaleString('en-IN')}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-sm dark:text-white">₹{payment.amount.toFixed(2)}</p>
                          <Badge variant={payment.status === 'success' ? 'default' : 'secondary'} className="text-xs mt-0.5">
                            {payment.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedOrder.notes && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40">
                  <p className="text-xs text-amber-700 dark:text-amber-300 font-semibold mb-1">Notes</p>
                  <p className="text-sm text-amber-800 dark:text-amber-200">{selectedOrder.notes}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="mt-4 gap-2">
            {(selectedOrder?.status === 'delivered' || selectedOrder?.status === 'completed') && (
              <Button
                onClick={() => { if (selectedOrder) { handleReorder(selectedOrder.id); setShowDetailsDialog(false); } }}
                disabled={reorderLoading === selectedOrder?.id}
                className="bg-emerald-600 hover:bg-emerald-700 shadow-sm"
              >
                {reorderLoading === selectedOrder?.id
                  ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  : <RefreshCw className="h-4 w-4 mr-2" />}
                Reorder
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)} className="dark:border-slate-600">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Pharmacy;
