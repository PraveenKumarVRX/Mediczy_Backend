import { useState } from 'react';
import { Pill, ShoppingCart, MapPin, Clock, Plus, Search, Package } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface PharmacyOrder {
  id: string;
  orderDate: string;
  status: 'pending' | 'confirmed' | 'out_for_delivery' | 'delivered' | 'cancelled';
  items: {
    name: string;
    quantity: number;
    price: number;
  }[];
  totalAmount: number;
  deliveryAddress: string;
  estimatedDelivery?: string;
  prescriptionRequired: boolean;
}

const Pharmacy = () => {
  const [orders, setOrders] = useState<PharmacyOrder[]>([
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
      prescriptionRequired: true
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
      prescriptionRequired: false
    }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [showOrderDialog, setShowOrderDialog] = useState(false);

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
                <div className="text-3xl font-bold text-gray-900">{orders.length}</div>
                <div className="text-sm text-gray-600">Total Orders</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {orders.filter(o => o.status === 'confirmed' || o.status === 'out_for_delivery').length}
                </div>
                <div className="text-sm text-gray-600">Active</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">
                  {orders.filter(o => o.status === 'delivered').length}
                </div>
                <div className="text-sm text-gray-600">Delivered</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">
                  ₹{orders.reduce((sum, o) => sum + o.totalAmount, 0)}
                </div>
                <div className="text-sm text-gray-600">Total Spent</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
                      {order.status !== 'delivered' && (
                        <Button variant="outline" size="sm">
                          Track Order
                        </Button>
                      )}
                      <Button variant="outline" size="sm">
                        View Details
                      </Button>
                      {order.status === 'delivered' && (
                        <Button variant="outline" size="sm">
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
      </div>
    </div>
  );
};

export default Pharmacy;
