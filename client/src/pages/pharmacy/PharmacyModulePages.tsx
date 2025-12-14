import PharmacyLayout from "@/components/pharmacy/PharmacyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Plus, Search, Filter, Calendar, Clock, Users, Pill, Package,
  CheckCircle, FileText, Receipt, CreditCard, TrendingUp,
  UserCog, Bell, Settings, HelpCircle, ArrowLeft, Edit, Trash2,
  Eye, AlertCircle, Download, Upload, Activity, BarChart3,
  ShoppingCart, Truck, AlertTriangle, DollarSign
} from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  helper?: string;
}

const StatGrid = ({ items }: { items: StatCardProps[] }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
    {items.map((item) => (
      <Card key={item.title}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">{item.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold text-slate-900">{item.value}</p>
          {item.helper && <p className="text-xs text-muted-foreground mt-1">{item.helper}</p>}
        </CardContent>
      </Card>
    ))}
  </div>
);

const PlaceholderList = ({
  items,
}: {
  items: { label: string; meta?: string; status?: string }[];
}) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Recent Updates</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <p className="font-medium">{item.label}</p>
              {item.meta && <p className="text-sm text-muted-foreground">{item.meta}</p>}
            </div>
            {item.status && (
              <Badge variant={item.status === "Completed" ? "default" : item.status === "Pending" ? "secondary" : "destructive"}>
                {item.status}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

// Pharmacy POS Page
export const PharmacyPOSPage = () => {
  const stats = [
    { title: "Today's Sales", value: "₹12,450", helper: "+12% from yesterday" },
    { title: "Transactions", value: "89", helper: "Active today" },
    { title: "Items Sold", value: "234", helper: "Units dispensed" },
    { title: "Pending Orders", value: "12", helper: "Awaiting pickup" },
  ];

  const recentTransactions = [
    { id: "TXN001", customer: "John Doe", amount: "₹450", status: "Completed", time: "2 mins ago" },
    { id: "TXN002", customer: "Jane Smith", amount: "₹280", status: "Completed", time: "5 mins ago" },
    { id: "TXN003", customer: "Bob Johnson", amount: "₹650", status: "Pending", time: "8 mins ago" },
  ];

  return (
    <PharmacyLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Point of Sale</h1>
            <p className="text-muted-foreground">Manage sales transactions and customer orders</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Transaction
          </Button>
        </div>

        <StatGrid items={stats} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Current Transaction</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input placeholder="Scan barcode or search medicine..." className="flex-1" />
                    <Button variant="outline">
                      <Search className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="border rounded-lg p-4">
                    <p className="text-center text-muted-foreground">No items added yet</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full" variant="outline">
                  <Users className="w-4 h-4 mr-2" />
                  Customer Lookup
                </Button>
                <Button className="w-full" variant="outline">
                  <Receipt className="w-4 h-4 mr-2" />
                  Print Receipt
                </Button>
                <Button className="w-full" variant="outline">
                  <CreditCard className="w-4 h-4 mr-2" />
                  Payment Methods
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentTransactions.map((txn) => (
                    <div key={txn.id} className="flex items-center justify-between p-2 border rounded">
                      <div>
                        <p className="font-medium text-sm">{txn.customer}</p>
                        <p className="text-xs text-muted-foreground">{txn.time}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{txn.amount}</p>
                        <Badge variant={txn.status === "Completed" ? "default" : "secondary"}>
                          {txn.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PharmacyLayout>
  );
};

// Pharmacy Prescriptions Page
export const PharmacyPrescriptionsPage = () => {
  const stats = [
    { title: "Pending Prescriptions", value: "24", helper: "Awaiting processing" },
    { title: "Processed Today", value: "156", helper: "+8% from yesterday" },
    { title: "Digital Prescriptions", value: "89", helper: "E-prescriptions" },
    { title: "Insurance Claims", value: "67", helper: "Pending approval" },
  ];

  const prescriptions = [
    { id: "RX001", patient: "Alice Johnson", doctor: "Dr. Smith", status: "Pending", date: "2025-12-10" },
    { id: "RX002", patient: "Mike Wilson", doctor: "Dr. Brown", status: "Processing", date: "2025-12-10" },
    { id: "RX003", patient: "Sarah Davis", doctor: "Dr. Lee", status: "Ready", date: "2025-12-09" },
  ];

  return (
    <PharmacyLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Prescriptions</h1>
            <p className="text-muted-foreground">Manage prescription orders and dispensing</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Prescription
          </Button>
        </div>

        <StatGrid items={stats} />

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Prescription Queue</CardTitle>
              <div className="flex gap-2">
                <Input placeholder="Search prescriptions..." className="w-64" />
                <Button variant="outline">
                  <Filter className="w-4 h-4 mr-2" />
                  Filter
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prescription ID</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prescriptions.map((rx) => (
                  <TableRow key={rx.id}>
                    <TableCell className="font-medium">{rx.id}</TableCell>
                    <TableCell>{rx.patient}</TableCell>
                    <TableCell>{rx.doctor}</TableCell>
                    <TableCell>{rx.date}</TableCell>
                    <TableCell>
                      <Badge variant={
                        rx.status === "Ready" ? "default" :
                        rx.status === "Processing" ? "secondary" : "destructive"
                      }>
                        {rx.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PharmacyLayout>
  );
};

// Pharmacy Inventory Page
export const PharmacyInventoryPage = () => {
  const stats = [
    { title: "Total Items", value: "2,847", helper: "In stock" },
    { title: "Low Stock Items", value: "23", helper: "Need restocking" },
    { title: "Expired Items", value: "5", helper: "Require disposal" },
    { title: "Categories", value: "156", helper: "Product categories" },
  ];

  const inventory = [
    { name: "Paracetamol 500mg", stock: 150, minStock: 50, category: "Pain Relief", expiry: "2026-06-15" },
    { name: "Amoxicillin 250mg", stock: 75, minStock: 100, category: "Antibiotics", expiry: "2026-03-20" },
    { name: "Vitamin D3 1000IU", stock: 200, minStock: 30, category: "Vitamins", expiry: "2026-12-01" },
  ];

  return (
    <PharmacyLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Inventory Management</h1>
            <p className="text-muted-foreground">Track stock levels and manage pharmacy inventory</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </div>
        </div>

        <StatGrid items={stats} />

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Inventory Items</CardTitle>
              <div className="flex gap-2">
                <Select>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pain">Pain Relief</SelectItem>
                    <SelectItem value="antibiotics">Antibiotics</SelectItem>
                    <SelectItem value="vitamins">Vitamins</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Search items..." className="w-64" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine Name</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Min Stock</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.stock}</TableCell>
                    <TableCell>{item.minStock}</TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>{item.expiry}</TableCell>
                    <TableCell>
                      <Badge variant={item.stock < item.minStock ? "destructive" : "default"}>
                        {item.stock < item.minStock ? "Low Stock" : "In Stock"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PharmacyLayout>
  );
};

// Pharmacy Stock Alerts Page
export const PharmacyStockAlertsPage = () => {
  const alerts = [
    { medicine: "Amoxicillin 250mg", currentStock: 75, minStock: 100, supplier: "MedCorp Ltd", priority: "High" },
    { medicine: "Ibuprofen 200mg", currentStock: 45, minStock: 80, supplier: "PharmaPlus", priority: "Medium" },
    { medicine: "Insulin 100IU", currentStock: 12, minStock: 50, supplier: "BioMed Solutions", priority: "Critical" },
  ];

  return (
    <PharmacyLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Stock Alerts</h1>
            <p className="text-muted-foreground">Monitor low stock items and reorder alerts</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Create Order
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Critical Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-red-600">3</p>
              <p className="text-xs text-muted-foreground mt-1">Immediate attention required</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Low Stock Items</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-orange-600">12</p>
              <p className="text-xs text-muted-foreground mt-1">Below minimum threshold</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Expiring Soon</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-yellow-600">8</p>
              <p className="text-xs text-muted-foreground mt-1">Within 30 days</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Stock Alert Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Current Stock</TableHead>
                  <TableHead>Min Stock</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{alert.medicine}</TableCell>
                    <TableCell>{alert.currentStock}</TableCell>
                    <TableCell>{alert.minStock}</TableCell>
                    <TableCell>{alert.supplier}</TableCell>
                    <TableCell>
                      <Badge variant={
                        alert.priority === "Critical" ? "destructive" :
                        alert.priority === "High" ? "default" : "secondary"
                      }>
                        {alert.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <ShoppingCart className="w-4 h-4 mr-1" />
                          Order
                        </Button>
                        <Button size="sm" variant="outline">
                          <Bell className="w-4 h-4 mr-1" />
                          Notify
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PharmacyLayout>
  );
};

// Pharmacy Batches Page
export const PharmacyBatchesPage = () => {
  const batches = [
    { batchId: "BAT001", medicine: "Paracetamol 500mg", quantity: 1000, expiry: "2026-06-15", supplier: "MedCorp Ltd", status: "Active" },
    { batchId: "BAT002", medicine: "Amoxicillin 250mg", quantity: 500, expiry: "2026-03-20", supplier: "PharmaPlus", status: "Active" },
    { batchId: "BAT003", medicine: "Vitamin D3 1000IU", quantity: 200, expiry: "2025-12-15", supplier: "BioMed Solutions", status: "Expiring" },
  ];

  return (
    <PharmacyLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Batch Management</h1>
            <p className="text-muted-foreground">Track medicine batches and expiry dates</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Batch
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Batches</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">156</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Active Batches</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">142</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Expiring Soon</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-orange-600">8</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Expired</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-red-600">6</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Batch Details</CardTitle>
              <div className="flex gap-2">
                <Select>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expiring">Expiring</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Search batches..." className="w-64" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch ID</TableHead>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.batchId}>
                    <TableCell className="font-medium">{batch.batchId}</TableCell>
                    <TableCell>{batch.medicine}</TableCell>
                    <TableCell>{batch.quantity}</TableCell>
                    <TableCell>{batch.expiry}</TableCell>
                    <TableCell>{batch.supplier}</TableCell>
                    <TableCell>
                      <Badge variant={
                        batch.status === "Active" ? "default" :
                        batch.status === "Expiring" ? "secondary" : "destructive"
                      }>
                        {batch.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PharmacyLayout>
  );
};

// Pharmacy Purchase Orders Page
export const PharmacyPurchaseOrdersPage = () => {
  const orders = [
    { id: "PO001", supplier: "MedCorp Ltd", items: 25, total: "₹45,000", status: "Delivered", date: "2025-12-08" },
    { id: "PO002", supplier: "PharmaPlus", items: 18, total: "₹32,500", status: "In Transit", date: "2025-12-09" },
    { id: "PO003", supplier: "BioMed Solutions", items: 12, total: "₹28,000", status: "Pending", date: "2025-12-10" },
  ];

  return (
    <PharmacyLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Purchase Orders</h1>
            <p className="text-muted-foreground">Manage supplier orders and procurement</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Order
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">89</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-orange-600">12</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">In Transit</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-blue-600">8</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Delivered</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">69</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Purchase Orders</CardTitle>
              <div className="flex gap-2">
                <Select>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="transit">In Transit</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Search orders..." className="w-64" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.id}</TableCell>
                    <TableCell>{order.supplier}</TableCell>
                    <TableCell>{order.items}</TableCell>
                    <TableCell>{order.total}</TableCell>
                    <TableCell>
                      <Badge variant={
                        order.status === "Delivered" ? "default" :
                        order.status === "In Transit" ? "secondary" : "destructive"
                      }>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{order.date}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Truck className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PharmacyLayout>
  );
};

// Pharmacy Customers Page
export const PharmacyCustomersPage = () => {
  const customers = [
    { id: "C001", name: "John Doe", phone: "+91 9876543210", prescriptions: 12, lastVisit: "2025-12-09", status: "Active" },
    { id: "C002", name: "Jane Smith", phone: "+91 9876543211", prescriptions: 8, lastVisit: "2025-12-08", status: "Active" },
    { id: "C003", name: "Bob Johnson", phone: "+91 9876543212", prescriptions: 15, lastVisit: "2025-12-07", status: "Active" },
  ];

  return (
    <PharmacyLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Customer Management</h1>
            <p className="text-muted-foreground">Manage customer profiles and prescription history</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Customer
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">1,247</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Active Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">1,189</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">New This Month</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-blue-600">23</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">VIP Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-purple-600">45</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Customer Directory</CardTitle>
              <div className="flex gap-2">
                <Input placeholder="Search customers..." className="w-64" />
                <Button variant="outline">
                  <Filter className="w-4 h-4 mr-2" />
                  Filter
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Prescriptions</TableHead>
                  <TableHead>Last Visit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.id}</TableCell>
                    <TableCell>{customer.name}</TableCell>
                    <TableCell>{customer.phone}</TableCell>
                    <TableCell>{customer.prescriptions}</TableCell>
                    <TableCell>{customer.lastVisit}</TableCell>
                    <TableCell>
                      <Badge variant="default">{customer.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PharmacyLayout>
  );
};

// Pharmacy Reports Page
export const PharmacyReportsPage = () => {
  return (
    <PharmacyLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Reports & Analytics</h1>
            <p className="text-muted-foreground">Generate reports and analyze pharmacy performance</p>
          </div>
          <Button>
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Sales Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">Daily, Weekly, Monthly</p>
              <p className="text-xs text-muted-foreground mt-1">Revenue and transaction analysis</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Inventory Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">Stock levels, expiry tracking</p>
              <p className="text-xs text-muted-foreground mt-1">Inventory management insights</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Customer Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">Purchase history, preferences</p>
              <p className="text-xs text-muted-foreground mt-1">Customer behavior analysis</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Generate Report</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Report Type</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select report type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales">Sales Report</SelectItem>
                    <SelectItem value="inventory">Inventory Report</SelectItem>
                    <SelectItem value="customer">Customer Report</SelectItem>
                    <SelectItem value="prescription">Prescription Report</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date Range</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select date range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="quarter">This Quarter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4">
              <Button>Generate Report</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PharmacyLayout>
  );
};

// Pharmacy Invoices Page
export const PharmacyInvoicesPage = () => {
  const invoices = [
    { id: "INV001", customer: "John Doe", amount: "₹450", date: "2025-12-10", status: "Paid", payment: "Cash" },
    { id: "INV002", customer: "Jane Smith", amount: "₹280", date: "2025-12-09", status: "Paid", payment: "Card" },
    { id: "INV003", customer: "Bob Johnson", amount: "₹650", date: "2025-12-08", status: "Pending", payment: "UPI" },
  ];

  return (
    <PharmacyLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
            <p className="text-muted-foreground">Manage billing and payment records</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Create Invoice
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">1,234</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Paid</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">1,189</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-orange-600">35</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Overdue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-red-600">10</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Invoice Management</CardTitle>
              <div className="flex gap-2">
                <Select>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Search invoices..." className="w-64" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.id}</TableCell>
                    <TableCell>{invoice.customer}</TableCell>
                    <TableCell>{invoice.amount}</TableCell>
                    <TableCell>{invoice.date}</TableCell>
                    <TableCell>{invoice.payment}</TableCell>
                    <TableCell>
                      <Badge variant={invoice.status === "Paid" ? "default" : "secondary"}>
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PharmacyLayout>
  );
};

// Pharmacy Expiry Page
export const PharmacyExpiryPage = () => {
  const expiringItems = [
    { medicine: "Vitamin D3 1000IU", batch: "BAT003", expiry: "2025-12-15", quantity: 200, daysLeft: 5, status: "Critical" },
    { medicine: "Ibuprofen 200mg", batch: "BAT007", expiry: "2025-12-20", quantity: 150, daysLeft: 10, status: "Warning" },
    { medicine: "Paracetamol 500mg", batch: "BAT012", expiry: "2026-01-15", quantity: 300, daysLeft: 36, status: "Normal" },
  ];

  return (
    <PharmacyLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Expiry Management</h1>
            <p className="text-muted-foreground">Track medicine expiry dates and manage disposal</p>
          </div>
          <Button variant="outline">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Generate Alert
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Expiring This Month</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-red-600">23</p>
              <p className="text-xs text-muted-foreground mt-1">Items need attention</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Expired Items</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-red-600">5</p>
              <p className="text-xs text-muted-foreground mt-1">Require disposal</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Expiring Soon (30 days)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-orange-600">12</p>
              <p className="text-xs text-muted-foreground mt-1">Monitor closely</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Safe Stock</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-green-600">2,807</p>
              <p className="text-xs text-muted-foreground mt-1">Valid expiry dates</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Expiry Tracking</CardTitle>
              <div className="flex gap-2">
                <Select>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Filter by days" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Next 7 days</SelectItem>
                    <SelectItem value="30">Next 30 days</SelectItem>
                    <SelectItem value="90">Next 90 days</SelectItem>
                    <SelectItem value="expired">Already expired</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Search medicines..." className="w-64" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Days Left</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiringItems.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.medicine}</TableCell>
                    <TableCell>{item.batch}</TableCell>
                    <TableCell>{item.expiry}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{item.daysLeft}</TableCell>
                    <TableCell>
                      <Badge variant={
                        item.status === "Critical" ? "destructive" :
                        item.status === "Warning" ? "secondary" : "default"
                      }>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PharmacyLayout>
  );
};

// Pharmacy Analytics Page
export const PharmacyAnalyticsPage = () => {
  return (
    <PharmacyLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Analytics Dashboard</h1>
            <p className="text-muted-foreground">Performance metrics and business insights</p>
          </div>
          <div className="flex gap-2">
            <Select>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 Days</SelectItem>
                <SelectItem value="30d">30 Days</SelectItem>
                <SelectItem value="90d">90 Days</SelectItem>
                <SelectItem value="1y">1 Year</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">₹2,45,000</p>
              <p className="text-xs text-green-600 mt-1">+12% from last month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">1,234</p>
              <p className="text-xs text-green-600 mt-1">+8% from last month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Avg Order Value</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">₹198</p>
              <p className="text-xs text-green-600 mt-1">+5% from last month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Customer Retention</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">87%</p>
              <p className="text-xs text-green-600 mt-1">+2% from last month</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Sales Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 rounded">
                <p className="text-muted-foreground">Sales chart will be displayed here</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Selling Medicines</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { name: "Paracetamol 500mg", sales: 245, percentage: 85 },
                  { name: "Amoxicillin 250mg", sales: 189, percentage: 65 },
                  { name: "Vitamin D3 1000IU", sales: 156, percentage: 54 },
                  { name: "Ibuprofen 200mg", sales: 134, percentage: 46 },
                  { name: "Aspirin 75mg", sales: 98, percentage: 34 },
                ].map((item, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.sales} units sold</p>
                    </div>
                    <div className="w-20">
                      <Progress value={item.percentage} className="h-2" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PharmacyLayout>
  );
};

// Pharmacy Settings Page
export const PharmacySettingsPage = () => {
  return (
    <PharmacyLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
            <p className="text-muted-foreground">Configure pharmacy preferences and system settings</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Pharmacy Name</Label>
                <Input defaultValue="Mediczy Pharmacy" />
              </div>
              <div className="space-y-2">
                <Label>License Number</Label>
                <Input defaultValue="PHARM123456" />
              </div>
              <div className="space-y-2">
                <Label>Contact Number</Label>
                <Input defaultValue="+91 9876543210" />
              </div>
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input defaultValue="pharmacy@mediczzy.com" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Operational Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Business Hours</Label>
                <Input defaultValue="9:00 AM - 9:00 PM" />
              </div>
              <div className="space-y-2">
                <Label>Expiry Alert Days</Label>
                <Input defaultValue="30" />
              </div>
              <div className="space-y-2">
                <Label>Low Stock Threshold</Label>
                <Input defaultValue="50" />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select defaultValue="inr">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inr">Indian Rupee (₹)</SelectItem>
                    <SelectItem value="usd">US Dollar ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>System Preferences</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Auto-print receipts</p>
                  <p className="text-sm text-muted-foreground">Automatically print receipts after transactions</p>
                </div>
                <Button variant="outline" size="sm">Enabled</Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Email notifications</p>
                  <p className="text-sm text-muted-foreground">Send email alerts for low stock and expiry</p>
                </div>
                <Button variant="outline" size="sm">Enabled</Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">SMS alerts</p>
                  <p className="text-sm text-muted-foreground">Send SMS notifications to customers</p>
                </div>
                <Button variant="outline" size="sm">Disabled</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline">Cancel</Button>
          <Button>Save Changes</Button>
        </div>
      </div>
    </PharmacyLayout>
  );
};

export const PharmacySupportPage = () => {
  return (
    <PharmacyLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Help & Support</h1>
            <p className="text-muted-foreground">Get help with pharmacy operations and system usage</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5" />
                Contact Support
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>+91 90000 00000</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a className="text-primary hover:underline" href="mailto:support@mediczy.com">support@mediczy.com</a>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <span>Support hours: 9:00 AM – 9:00 PM</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Raise a Ticket</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input placeholder="e.g. POS receipt printing issue" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea placeholder="Describe the issue and steps to reproduce" rows={4} />
              </div>
              <Button className="gap-2" variant="outline">
                <Upload className="h-4 w-4" /> Attach Screenshot (optional)
              </Button>
              <div className="flex justify-end">
                <Button>Submit</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PharmacyLayout>
  );
};