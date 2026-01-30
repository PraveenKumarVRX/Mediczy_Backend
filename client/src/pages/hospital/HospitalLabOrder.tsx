import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import { loadHospitalStore, saveHospitalStore } from '@/utils/hospitalStorage';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import {
  FlaskConical, Plus, Search, ArrowLeft, Calendar, Clock,
  User, FileText, CheckCircle, XCircle, AlertCircle,
  Stethoscope, Activity, Filter, Download, Printer
} from 'lucide-react';

interface LabTest {
  id: string;
  name: string;
  category: string;
  price: number;
  normalRange?: string;
  unit?: string;
  preparation?: string;
  turnaroundTime: string;
}

interface TestOrder {
  id: string;
  orderNumber: string;
  patientId: string;
  patientName: string;
  uhid: string;
  doctorName: string;
  department: string;
  tests: LabTest[];
  priority: 'Routine' | 'Urgent' | 'Emergency';
  status: 'Ordered' | 'Sample Collected' | 'Processing' | 'Completed' | 'Cancelled';
  orderDate: string;
  requiredDate: string;
  notes?: string;
  totalAmount: number;
}

const HospitalLabOrder = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const hospitalHeaders = () => {
    const token = localStorage.getItem('hospitalToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const [activeTab, setActiveTab] = useState('order');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTests, setSelectedTests] = useState<LabTest[]>([]);
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [priority, setPriority] = useState<'Routine' | 'Urgent' | 'Emergency'>('Routine');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('hospitalToken');
    if (!token) {
      navigate('/hospital/login');
      return;
    }
  }, [navigate]);

  // Sample lab tests data
  const labTests: LabTest[] = [
    {
      id: 'LT001',
      name: 'Complete Blood Count (CBC)',
      category: 'Hematology',
      price: 450,
      normalRange: 'See report',
      unit: 'Various',
      preparation: 'Fasting not required',
      turnaroundTime: '4-6 hours'
    },
    {
      id: 'LT002',
      name: 'Blood Glucose (Fasting)',
      category: 'Biochemistry',
      price: 150,
      normalRange: '70-100 mg/dL',
      unit: 'mg/dL',
      preparation: '8-12 hours fasting required',
      turnaroundTime: '2-4 hours'
    },
    {
      id: 'LT003',
      name: 'Lipid Profile',
      category: 'Biochemistry',
      price: 800,
      normalRange: 'See report',
      unit: 'mg/dL',
      preparation: '8-12 hours fasting required',
      turnaroundTime: '4-6 hours'
    },
    {
      id: 'LT004',
      name: 'Thyroid Function Test (TFT)',
      category: 'Endocrinology',
      price: 600,
      normalRange: 'See report',
      unit: 'Various',
      preparation: 'No special preparation',
      turnaroundTime: '24 hours'
    },
    {
      id: 'LT005',
      name: 'Urine Routine Examination',
      category: 'Urinalysis',
      price: 200,
      normalRange: 'See report',
      unit: 'Various',
      preparation: 'Clean catch midstream urine',
      turnaroundTime: '2-4 hours'
    },
    {
      id: 'LT006',
      name: 'Chest X-Ray',
      category: 'Radiology',
      price: 350,
      normalRange: 'N/A',
      unit: 'N/A',
      preparation: 'Remove metal objects',
      turnaroundTime: '1-2 hours'
    },
    {
      id: 'LT007',
      name: 'ECG',
      category: 'Cardiology',
      price: 250,
      normalRange: 'N/A',
      unit: 'N/A',
      preparation: 'No special preparation',
      turnaroundTime: '30 minutes'
    },
    {
      id: 'LT008',
      name: 'Ultrasound Abdomen',
      category: 'Radiology',
      price: 1200,
      normalRange: 'N/A',
      unit: 'N/A',
      preparation: '4-6 hours fasting required',
      turnaroundTime: '2-4 hours'
    }
  ];

  const initialOrders: TestOrder[] = [
    {
      id: 'ORD001',
      orderNumber: 'LAB-2024-001234',
      patientId: 'P001',
      patientName: 'Rajesh Kumar',
      uhid: 'UHID001234',
      doctorName: 'Dr. Sharma',
      department: 'Cardiology',
      tests: [labTests[0], labTests[1]],
      priority: 'Urgent',
      status: 'Sample Collected',
      orderDate: '2024-12-10',
      requiredDate: '2024-12-10',
      notes: 'Patient complaining of chest pain',
      totalAmount: 600
    },
    {
      id: 'ORD002',
      orderNumber: 'LAB-2024-001235',
      patientId: 'P002',
      patientName: 'Priya Singh',
      uhid: 'UHID001235',
      doctorName: 'Dr. Patel',
      department: 'Gynecology',
      tests: [labTests[4]],
      priority: 'Routine',
      status: 'Completed',
      orderDate: '2024-12-09',
      requiredDate: '2024-12-11',
      totalAmount: 200
    }
  ];

  // Sample patients data
  const patients = [
    { id: 'P001', name: 'Rajesh Kumar', uhid: 'UHID001234', age: 45, gender: 'Male' },
    { id: 'P002', name: 'Priya Singh', uhid: 'UHID001235', age: 32, gender: 'Female' },
    { id: 'P003', name: 'Amit Verma', uhid: 'UHID001236', age: 28, gender: 'Male' },
    { id: 'P004', name: 'Sunita Devi', uhid: 'UHID001237', age: 55, gender: 'Female' }
  ];

  const categories = ['all', 'Hematology', 'Biochemistry', 'Endocrinology', 'Urinalysis', 'Radiology', 'Cardiology'];

  const filteredTests = labTests.filter(test => {
    const matchesSearch = test.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         test.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || test.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredPatients = patients.filter(patient =>
    patient.name.toLowerCase().includes(patientSearch.toLowerCase()) ||
    patient.uhid.toLowerCase().includes(patientSearch.toLowerCase())
  );

  const handleTestSelection = (test: LabTest, checked: boolean) => {
    if (checked) {
      setSelectedTests([...selectedTests, test]);
    } else {
      setSelectedTests(selectedTests.filter(t => t.id !== test.id));
    }
  };

  const handleOrderSubmit = async () => {
    if (!selectedPatient || selectedTests.length === 0) {
      toast({
        title: "Incomplete Order",
        description: "Please select a patient and at least one test.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const totalAmount = selectedTests.reduce((sum, test) => sum + test.price, 0);
      const orderData = {
        patientId: selectedPatient.id,
        tests: selectedTests.map(test => test.id),
        priority,
        notes: clinicalNotes,
        totalAmount
      };

      try {
        await api.post(
          '/hospital/practice/lab-orders',
          orderData,
          { headers: hospitalHeaders() }
        );
      } catch {
        // Allow local persistence if API is unavailable
      }

      const createdOrder: TestOrder = {
        id: `ORD-${Date.now()}`,
        orderNumber: `LAB-${Date.now().toString().slice(-6)}`,
        patientId: selectedPatient.id,
        patientName: selectedPatient.name,
        uhid: selectedPatient.uhid,
        doctorName: 'On Call',
        department: 'General',
        tests: selectedTests,
        priority,
        status: 'Ordered',
        orderDate: new Date().toISOString().slice(0, 10),
        requiredDate: new Date().toISOString().slice(0, 10),
        notes: clinicalNotes,
        totalAmount
      };

      setOrders(prev => {
        const updated = [createdOrder, ...prev];
        saveHospitalStore('lab-orders', updated);
        return updated;
      });

      toast({
        title: "Lab Test Ordered",
        description: `Order placed for ${selectedPatient.name} - ${selectedTests.length} test(s)`,
      });

      // Reset form
      setSelectedTests([]);
      setSelectedPatient(null);
      setPriority('Routine');
      setClinicalNotes('');
      setShowOrderDialog(false);

    } catch (error: any) {
      toast({
        title: "Order Failed",
        description: error.response?.data?.message || "Failed to place lab test order. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Ordered': return 'bg-teal-100 text-teal-800';
      case 'Sample Collected': return 'bg-yellow-100 text-yellow-800';
      case 'Processing': return 'bg-purple-100 text-purple-800';
      case 'Completed': return 'bg-green-100 text-green-800';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Emergency': return 'bg-red-100 text-red-800';
      case 'Urgent': return 'bg-orange-100 text-orange-800';
      case 'Routine': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <HospitalLayout title="Lab Test Orders" subtitle="Order laboratory tests and manage test requests">
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-end">
          <Dialog open={showOrderDialog} onOpenChange={setShowOrderDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-gradient-to-r from-teal-500 to-teal-600">
                <Plus className="h-4 w-4" />
                Order Lab Test
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Order Lab Tests</DialogTitle>
              </DialogHeader>

              <div className="space-y-6">
                {/* Patient Selection */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Select Patient</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="relative">
                      <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search patient by name or UHID..."
                        className="pl-9"
                        value={patientSearch}
                        onChange={(e) => setPatientSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto border rounded-md">
                      {filteredPatients.map((patient) => (
                        <div
                          key={patient.id}
                          className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${
                            selectedPatient?.id === patient.id ? 'bg-teal-50 border-teal-200' : ''
                          }`}
                          onClick={() => setSelectedPatient(patient)}
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-medium">{patient.name}</p>
                              <p className="text-sm text-muted-foreground">{patient.uhid}</p>
                            </div>
                            <div className="text-right text-sm text-muted-foreground">
                              <p>{patient.age} years</p>
                              <p>{patient.gender}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {selectedPatient && (
                      <div className="p-3 bg-teal-50 border border-teal-200 rounded-md">
                        <p className="font-medium text-teal-900">Selected: {selectedPatient.name}</p>
                        <p className="text-sm text-teal-700">{selectedPatient.uhid}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Test Selection */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Select Tests</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {labTests.map((test) => (
                        <div key={test.id} className="border rounded-lg p-4 space-y-2">
                          <div className="flex items-start gap-2">
                            <Checkbox
                              checked={selectedTests.some(t => t.id === test.id)}
                              onCheckedChange={(checked) => handleTestSelection(test, checked as boolean)}
                            />
                            <div className="flex-1">
                              <h4 className="font-medium">{test.name}</h4>
                              <p className="text-sm text-muted-foreground">{test.category}</p>
                              <p className="text-sm font-medium text-green-600">₹{test.price}</p>
                              <p className="text-xs text-muted-foreground">TAT: {test.turnaroundTime}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Order Details */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Order Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Priority</Label>
                        <Select value={priority} onValueChange={(value: any) => setPriority(value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Routine">Routine</SelectItem>
                            <SelectItem value="Urgent">Urgent</SelectItem>
                            <SelectItem value="Emergency">Emergency</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Clinical Notes</Label>
                        <Textarea
                          placeholder="Enter clinical indications..."
                          value={clinicalNotes}
                          onChange={(e) => setClinicalNotes(e.target.value)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Order Summary */}
                {selectedTests.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Order Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {selectedTests.map((test) => (
                          <div key={test.id} className="flex justify-between">
                            <span>{test.name}</span>
                            <span>₹{test.price}</span>
                          </div>
                        ))}
                        <div className="border-t pt-2 flex justify-between font-bold">
                          <span>Total Amount</span>
                          <span>₹{selectedTests.reduce((sum, test) => sum + test.price, 0)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowOrderDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleOrderSubmit} disabled={loading}>
                  {loading ? 'Placing Order...' : 'Place Order'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Today's Orders</p>
                  <p className="text-2xl font-bold">24</p>
                </div>
                <FlaskConical className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending Results</p>
                  <p className="text-2xl font-bold">18</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completed Today</p>
                  <p className="text-2xl font-bold">32</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Revenue Today</p>
                  <p className="text-2xl font-bold">₹12,450</p>
                </div>
                <Activity className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Lab Test Management</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button variant="outline" size="sm">
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-6">
              <div className="relative flex-1 min-w-64">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search tests..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category === 'all' ? 'All Categories' : category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Test Catalog */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {filteredTests.map((test) => (
                <Card key={test.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium">{test.name}</h4>
                      <Badge variant="outline">{test.category}</Badge>
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>Price: ₹{test.price}</p>
                      <p>TAT: {test.turnaroundTime}</p>
                      {test.preparation && <p>Prep: {test.preparation}</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Recent Orders */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Recent Orders</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Tests</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.orderNumber}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{order.patientName}</p>
                          <p className="text-sm text-muted-foreground">{order.uhid}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {order.tests.slice(0, 2).map((test) => (
                            <Badge key={test.id} variant="outline" className="text-xs">
                              {test.name}
                            </Badge>
                          ))}
                          {order.tests.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{order.tests.length - 2} more
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getPriorityColor(order.priority)}>
                          {order.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(order.status)}>
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell>₹{order.totalAmount}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm">
                          <FileText className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </HospitalLayout>
  );
};

export default HospitalLabOrder;
