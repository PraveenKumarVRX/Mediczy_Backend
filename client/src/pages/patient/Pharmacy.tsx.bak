import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Pill, ShoppingCart, MapPin, Clock, Plus, Search, Package, RefreshCw, Eye, X, Truck, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import api from '@/utils/api';
import MainLayout from '@/components/layout/MainLayout';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const itemVar = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [.25,.46,.45,.94] } } };

interface PharmacyOrder {
  id: string;
  orderNumber?: string;
  orderDate: string;
  status: 'pending' | 'confirmed' | 'processing' | 'out_for_delivery' | 'delivered' | 'completed' | 'cancelled';
  items: {
    name: string;
    quantity: number;
    price: number;
  }[];
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

const Pharmacy = () => {
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [stats, setStats] = useState<OrderStats>({
    totalOrders: 0,
    activeOrders: 0,
    deliveredOrders: 0,
    totalSpent: 0
  });
  const [loading, setLoading] = useState(true);
  const [reorderLoading, setReorderLoading] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<DetailedOrder | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Fetch pharmacy orders on mount
  useEffect(() => {
    fetchPharmacyOrders();
  }, []);

  const fetchPharmacyOrders = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const { data } = await api.get('/billing/orders/pharmacy/history', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
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
          canReorder: order.canReorder
        })));
        setStats(data.data.stats);
      }
    } catch (error: any) {
      console.error('Failed to fetch pharmacy orders:', error);
      // Use fallback demo data if API fails
      setOrders([
        {
          id: 'ORD001',
          orderDate: '2024-01-15',
          status: 'delivered',
          items: [
            { name: 'Amoxicillin 500mg', quantity: 20, price: 150 },
            { name: 'Paracetamol 650mg', quantity: 10, price: 50 }
          ],
          totalAmount: 200,
          deliveryAddress: '123 Main Street, Mumbai',
          prescriptionRequired: true,
          canReorder: true
        },
        {
          id: 'ORD002',
          orderDate: '2024-01-20',
          status: 'out_for_delivery',
          items: [
            { name: 'Vitamin D3 Supplement', quantity: 1, price: 350 }
          ],
          totalAmount: 350,
          deliveryAddress: '123 Main Street, Mumbai',
          estimatedDelivery: '2024-01-21',
          prescriptionRequired: false,
          canReorder: false
        }
      ]);
      setStats({
        totalOrders: 2,
        activeOrders: 1,
        deliveredOrders: 1,
        totalSpent: 550
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderDetails = async (orderId: string) => {
    try {
      setDetailsLoading(true);
      const token = localStorage.getItem('token');
      const { data } = await api.get(`/billing/orders/${orderId}/detailed`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (data.success) {
        const order = data.data.order;
        setSelectedOrder({
          id: order.id,
          orderNumber: order.orderNumber,
          orderDate: order.createdAt,
          status: order.status === 'completed' ? 'delivered' : order.status,
          items: order.items || [],
          totalAmount: order.total,
          subtotal: order.subtotal,
          tax: order.tax,
          discount: order.discount,
          currency: order.currency,
          deliveryAddress: order.deliveryAddress || order.shippingAddress || 'Not specified',
          billingAddress: order.billingAddress,
          estimatedDelivery: order.estimatedDelivery,
          actualDelivery: order.actualDelivery,
          prescriptionRequired: order.prescriptionRequired,
          prescriptionUrl: order.prescriptionUrl,
          trackingNumber: order.trackingNumber,
          trackingUrl: order.trackingUrl,
          payments: order.payments,
          invoice: order.invoice,
          statusTimeline: order.statusTimeline,
          notes: order.notes
        });
        setShowDetailsDialog(true);
      }
    } catch (error) {
      console.error('Failed to fetch order details:', error);
      // Find order from local state as fallback
      const order = orders.find(o => o.id === orderId);
      if (order) {
        setSelectedOrder(order as DetailedOrder);
        setShowDetailsDialog(true);
      } else {
        toast.error('Failed to load order details');
      }
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleReorder = async (orderId: string) => {
    try {
      setReorderLoading(orderId);
      const token = localStorage.getItem('token');
      const { data } = await api.post(`/billing/orders/${orderId}/reorder`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (data.success) {
        toast.success('Reorder created successfully!', {
          description: `Order #${data.data.order.orderNumber} has been created.`
        });
        // Refresh orders list
        fetchPharmacyOrders();
      }
    } catch (error: any) {
      console.error('Reorder failed:', error);
      toast.error('Failed to reorder', {
        description: error.response?.data?.message || 'Please try again later'
      });
    } finally {
      setReorderLoading(null);
    }
  };

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
      confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
      out_for_delivery: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
      delivered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
      cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    };
    return colors[status as keyof typeof colors];
  };

  return (
    <MainLayout>
    <motion.div initial="hidden" animate="show" variants={container} className="max-w-7xl mx-auto space-y-6 px-4 md:px-6 py-6">
        {/* Premium Header */}
        <motion.div variants={itemVar} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-700 via-green-700 to-emerald-800 p-6 md:p-8 text-white shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
          <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-white/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
          <div className="relative flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-sm shadow-lg"><Pill className="w-6 h-6" /></div>
                <Badge className="bg-white/15 text-white/90 border-white/20 font-medium">Medicine Hub</Badge>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-1">Pharmacy</h1>
              <p className="text-emerald-200 text-sm md:text-base">Order medicines and track your pharmacy orders</p>
            </div>
            <Dialog open={showOrderDialog} onOpenChange={setShowOrderDialog}>
              <DialogTrigger asChild>
                <Button className="bg-white text-emerald-700 hover:bg-white/90 shadow-lg font-semibold" aria-label="New order">
                  <Plus className="h-4 w-4 mr-2" />
                  New Order
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md dark:bg-slate-900">
                <DialogHeader>
                  <DialogTitle>Order Medicines</DialogTitle>
                  <DialogDescription>
                    Upload prescription or search for medicines
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Search Medicine</Label>
                    <Input placeholder="Search by medicine name..." />
                  </div>
                  <div>
                    <Label>Upload Prescription (Optional)</Label>
                    <Input type="file" accept="image/*,.pdf" />
                  </div>
                  <div>
                    <Label>Delivery Address</Label>
                    <Input placeholder="Enter delivery address" />
                  </div>
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700">
                    Place Order
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div variants={itemVar} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Orders', value: stats.totalOrders, gradient: 'from-slate-600 to-slate-800' },
            { label: 'Active', value: stats.activeOrders, gradient: 'from-blue-500 to-indigo-500' },
            { label: 'Delivered', value: stats.deliveredOrders, gradient: 'from-emerald-500 to-teal-500' },
            { label: 'Total Spent', value: `₹${stats.totalSpent.toFixed(2)}`, gradient: 'from-purple-500 to-pink-500' },
          ].map((stat) => (
            <motion.div key={stat.label} whileHover={{ scale: 1.03, y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
              <Card className="dark:bg-slate-800/50 dark:border-slate-700/60 border-slate-200/80 hover:shadow-xl transition-all duration-300">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className={`text-3xl font-bold bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent`}>{stat.value}</div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">{stat.label}</div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Quick Actions */}
        <motion.div variants={itemVar} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <motion.div whileHover={{ scale: 1.03, y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
          <Card className="cursor-pointer hover:shadow-xl transition-all duration-300 dark:bg-slate-800/50 dark:border-slate-700/60">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
                  <ShoppingCart className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="font-semibold mb-1 dark:text-white">Browse Medicines</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">Search and order medicines</p>
              </div>
            </CardContent>
          </Card>
          </motion.div>
          <motion.div whileHover={{ scale: 1.03, y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
          <Card className="cursor-pointer hover:shadow-xl transition-all duration-300 dark:bg-slate-800/50 dark:border-slate-700/60">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-3">
                  <Package className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-semibold mb-1 dark:text-white">Track Order</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">Check delivery status</p>
              </div>
            </CardContent>
          </Card>
          </motion.div>
          <motion.div whileHover={{ scale: 1.03, y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
          <Card className="cursor-pointer hover:shadow-xl transition-all duration-300 dark:bg-slate-800/50 dark:border-slate-700/60">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto mb-3">
                  <Clock className="h-7 w-7 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="font-semibold mb-1 dark:text-white">Reorder</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">Reorder previous medicines</p>
              </div>
            </CardContent>
          </Card>
          </motion.div>
          <motion.div whileHover={{ scale: 1.03, y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
          <Card 
            className="cursor-pointer hover:shadow-xl transition-all duration-300 dark:bg-slate-800/50 dark:border-slate-700/60"
            onClick={() => fetchPharmacyOrders()}
          >
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mx-auto mb-3">
                  <RefreshCw className={`h-7 w-7 text-orange-600 dark:text-orange-400 ${loading ? 'animate-spin' : ''}`} />
                </div>
                <h3 className="font-semibold mb-1 dark:text-white">Refresh</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">Update order status</p>
              </div>
            </CardContent>
          </Card>
          </motion.div>
        </motion.div>

        {/* Orders List */}
        <motion.div variants={itemVar}>
        <Card className="dark:bg-slate-800/50 dark:border-slate-700/60">
          <CardHeader>
            <CardTitle className="dark:text-white">Order History</CardTitle>
            <CardDescription className="dark:text-slate-400">View and manage your pharmacy orders</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {orders.map((order, orderIdx) => (
                <motion.div key={order.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: orderIdx * 0.05, duration: 0.3 }}>
                <Card className="hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 dark:bg-slate-800/30 dark:border-slate-700">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold dark:text-white">Order #{order.id}</h3>
                          <Badge className={getStatusColor(order.status)}>
                            {order.status.replace('_', ' ')}
                          </Badge>
                          {order.prescriptionRequired && (
                            <Badge variant="outline" className="bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                              Prescription Required
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Ordered on {new Date(order.orderDate).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                          ₹{order.totalAmount}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <h4 className="font-medium text-sm">Items:</h4>
                      {order.items.map((item, index) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span>{item.name} x {item.quantity}</span>
                          <span className="text-slate-600 dark:text-slate-400">₹{item.price}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-start gap-2 mb-4 p-3 bg-slate-50 dark:bg-slate-700/30 rounded-xl">
                      <MapPin className="h-4 w-4 text-slate-600 dark:text-slate-400 mt-0.5" />
                      <div className="text-sm text-slate-700 dark:text-slate-300">
                        <span className="font-medium">Delivery Address:</span>
                        <p>{order.deliveryAddress}</p>
                      </div>
                    </div>

                    {order.estimatedDelivery && (
                      <div className="flex items-center gap-2 text-sm text-blue-600 mb-4">
                        <Clock className="h-4 w-4" />
                        <span>Estimated delivery: {new Date(order.estimatedDelivery).toLocaleDateString()}</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      {order.status !== 'delivered' && order.status !== 'completed' && (
                        <Button variant="outline" size="sm">
                          <Truck className="h-4 w-4 mr-1" />
                          Track Order
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => fetchOrderDetails(order.id)}
                        disabled={detailsLoading}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                      {(order.status === 'delivered' || order.status === 'completed' || order.canReorder) && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleReorder(order.id)}
                          disabled={reorderLoading === order.id}
                        >
                          {reorderLoading === order.id ? (
                            <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-1" />
                          )}
                          Reorder
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
        </motion.div>

        {/* Order Details Dialog */}
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-slate-900">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-green-600" />
                Order Details
              </DialogTitle>
              <DialogDescription>
                {selectedOrder?.orderNumber ? `Order #${selectedOrder.orderNumber}` : `Order #${selectedOrder?.id}`}
              </DialogDescription>
            </DialogHeader>
            
            {selectedOrder && (
              <div className="space-y-6">
                {/* Order Status */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-600">Status</p>
                    <Badge className={getStatusColor(selectedOrder.status)}>
                      {selectedOrder.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Order Date</p>
                    <p className="font-medium">{new Date(selectedOrder.orderDate).toLocaleDateString()}</p>
                  </div>
                </div>

                {/* Items List */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Pill className="h-4 w-4" />
                    Items Ordered
                  </h4>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left p-3 text-sm font-medium">Item</th>
                          <th className="text-center p-3 text-sm font-medium">Qty</th>
                          <th className="text-right p-3 text-sm font-medium">Price</th>
                          <th className="text-right p-3 text-sm font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrder.items.map((item, index) => (
                          <tr key={index} className="border-t">
                            <td className="p-3">{item.name}</td>
                            <td className="p-3 text-center">{item.quantity}</td>
                            <td className="p-3 text-right">₹{item.price.toFixed(2)}</td>
                            <td className="p-3 text-right">₹{(item.price * item.quantity).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="border rounded-lg p-4 space-y-2">
                  <h4 className="font-semibold mb-2">Payment Summary</h4>
                  {selectedOrder.subtotal && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal</span>
                      <span>₹{selectedOrder.subtotal.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedOrder.tax !== undefined && selectedOrder.tax > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Tax</span>
                      <span>₹{selectedOrder.tax.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedOrder.discount !== undefined && selectedOrder.discount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount</span>
                      <span>-₹{selectedOrder.discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg pt-2 border-t">
                    <span>Total</span>
                    <span className="text-green-600">₹{selectedOrder.totalAmount.toFixed(2)}</span>
                  </div>
                </div>

                {/* Delivery Information */}
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Delivery Information
                  </h4>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Delivery Address</p>
                    <p className="font-medium">{selectedOrder.deliveryAddress}</p>
                  </div>
                  {selectedOrder.estimatedDelivery && (
                    <div className="p-3 bg-blue-50 rounded-lg flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-600" />
                      <div>
                        <p className="text-sm text-blue-600">Estimated Delivery</p>
                        <p className="font-medium">{new Date(selectedOrder.estimatedDelivery).toLocaleDateString()}</p>
                      </div>
                    </div>
                  )}
                  {selectedOrder.trackingNumber && (
                    <div className="p-3 bg-purple-50 rounded-lg">
                      <p className="text-sm text-purple-600">Tracking Number</p>
                      <p className="font-medium">{selectedOrder.trackingNumber}</p>
                    </div>
                  )}
                </div>

                {/* Prescription Info */}
                {selectedOrder.prescriptionRequired && (
                  <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                    <div className="flex items-center gap-2 text-orange-700">
                      <Pill className="h-4 w-4" />
                      <span className="font-medium">Prescription Required</span>
                    </div>
                    {selectedOrder.prescriptionUrl && (
                      <a 
                        href={selectedOrder.prescriptionUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline mt-1 block"
                      >
                        View uploaded prescription
                      </a>
                    )}
                  </div>
                )}

                {/* Status Timeline */}
                {selectedOrder.statusTimeline && selectedOrder.statusTimeline.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3">Order Timeline</h4>
                    <div className="space-y-3">
                      {selectedOrder.statusTimeline.map((event, index) => (
                        <div key={index} className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </div>
                          <div>
                            <p className="font-medium capitalize">{event.status.replace('_', ' ')}</p>
                            <p className="text-sm text-gray-500">{new Date(event.timestamp).toLocaleString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Payment History */}
                {selectedOrder.payments && selectedOrder.payments.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3">Payment History</h4>
                    <div className="space-y-2">
                      {selectedOrder.payments.map((payment) => (
                        <div key={payment.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">{payment.method || 'Payment'}</p>
                            <p className="text-xs text-gray-500">{new Date(payment.createdAt).toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">₹{payment.amount.toFixed(2)}</p>
                            <Badge variant={payment.status === 'success' ? 'default' : 'secondary'}>
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
                  <div className="p-3 bg-yellow-50 rounded-lg">
                    <p className="text-sm text-yellow-700 font-medium">Notes</p>
                    <p className="text-sm">{selectedOrder.notes}</p>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="mt-4">
              {(selectedOrder?.status === 'delivered' || selectedOrder?.status === 'completed') && (
                <Button 
                  onClick={() => {
                    if (selectedOrder) {
                      handleReorder(selectedOrder.id);
                      setShowDetailsDialog(false);
                    }
                  }}
                  disabled={reorderLoading === selectedOrder?.id}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {reorderLoading === selectedOrder?.id ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Reorder This Order
                </Button>
              )}
              <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </motion.div>
    </MainLayout>
  );
};

export default Pharmacy;
