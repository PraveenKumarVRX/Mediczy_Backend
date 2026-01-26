import { useState, useEffect } from 'react';
import { Pill, ShoppingCart, MapPin, Clock, Plus, Search, Package, RefreshCw, Eye, X, Truck, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import api from '@/utils/api';

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
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      out_for_delivery: 'bg-purple-100 text-purple-800',
      delivered: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800'
    };
    return colors[status as keyof typeof colors];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Pill className="h-8 w-8 text-green-600" />
                <h1 className="text-3xl font-bold text-gray-900">Pharmacy</h1>
              </div>
              <p className="text-gray-600">Order medicines and track your pharmacy orders</p>
            </div>
            <Dialog open={showOrderDialog} onOpenChange={setShowOrderDialog}>
              <DialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700">
                  <Plus className="h-4 w-4 mr-2" />
                  New Order
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
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
                  <Button className="w-full bg-green-600 hover:bg-green-700">
                    Place Order
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">{stats.totalOrders}</div>
                <div className="text-sm text-gray-600">Total Orders</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {stats.activeOrders}
                </div>
                <div className="text-sm text-gray-600">Active</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">
                  {stats.deliveredOrders}
                </div>
                <div className="text-sm text-gray-600">Delivered</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">
                  ₹{stats.totalSpent.toFixed(2)}
                </div>
                <div className="text-sm text-gray-600">Total Spent</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardContent className="pt-6">
              <div className="text-center">
                <ShoppingCart className="h-12 w-12 text-green-600 mx-auto mb-3" />
                <h3 className="font-semibold mb-1">Browse Medicines</h3>
                <p className="text-sm text-gray-600">Search and order medicines</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardContent className="pt-6">
              <div className="text-center">
                <Package className="h-12 w-12 text-blue-600 mx-auto mb-3" />
                <h3 className="font-semibold mb-1">Track Order</h3>
                <p className="text-sm text-gray-600">Check delivery status</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardContent className="pt-6">
              <div className="text-center">
                <Clock className="h-12 w-12 text-purple-600 mx-auto mb-3" />
                <h3 className="font-semibold mb-1">Reorder</h3>
                <p className="text-sm text-gray-600">Reorder previous medicines</p>
              </div>
            </CardContent>
          </Card>
          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => fetchPharmacyOrders()}
          >
            <CardContent className="pt-6">
              <div className="text-center">
                <RefreshCw className={`h-12 w-12 text-orange-600 mx-auto mb-3 ${loading ? 'animate-spin' : ''}`} />
                <h3 className="font-semibold mb-1">Refresh</h3>
                <p className="text-sm text-gray-600">Update order status</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Orders List */}
        <Card>
          <CardHeader>
            <CardTitle>Order History</CardTitle>
            <CardDescription>View and manage your pharmacy orders</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {orders.map((order) => (
                <Card key={order.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold">Order #{order.id}</h3>
                          <Badge className={getStatusColor(order.status)}>
                            {order.status.replace('_', ' ')}
                          </Badge>
                          {order.prescriptionRequired && (
                            <Badge variant="outline" className="bg-orange-50 text-orange-700">
                              Prescription Required
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          Ordered on {new Date(order.orderDate).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-green-600">
                          ₹{order.totalAmount}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <h4 className="font-medium text-sm">Items:</h4>
                      {order.items.map((item, index) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span>{item.name} x {item.quantity}</span>
                          <span className="text-gray-600">₹{item.price}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-start gap-2 mb-4 p-3 bg-gray-50 rounded-md">
                      <MapPin className="h-4 w-4 text-gray-600 mt-0.5" />
                      <div className="text-sm text-gray-700">
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
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Order Details Dialog */}
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                  className="bg-green-600 hover:bg-green-700"
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
      </div>
    </div>
  );
};

export default Pharmacy;
