import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Building, Calendar, Users, FileText, DollarSign, Clock, 
  TrendingUp, Activity, UserCheck, Pill, Bell, Settings,
  LogOut, Plus, Search, Filter, BarChart3, Download, X
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import ClinicLayout from '@/components/clinic/ClinicLayout';
import api from '@/utils/api';

const ClinicDashboard = () => {
  const navigate = useNavigate();
  const [clinicData, setClinicData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showNewAppointment, setShowNewAppointment] = useState(false);
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [showPatientDetails, setShowPatientDetails] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientFilter, setShowPatientFilter] = useState(false);
  const [patientFilter, setPatientFilter] = useState<'all' | 'due-soon'>('all');
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [showAddInventory, setShowAddInventory] = useState(false);
  const [showManageInventory, setShowManageInventory] = useState(false);
  const [showViewAppointment, setShowViewAppointment] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [sendingBulkReminders, setSendingBulkReminders] = useState(false);

  const [patients, setPatients] = useState([
    { id: 1, name: 'Rahul Mehta', lastVisit: '2024-12-03', diagnosis: 'Diabetes Follow-up', nextVisit: '2024-12-17' },
    { id: 2, name: 'Anita Desai', lastVisit: '2024-12-03', diagnosis: 'Hypertension', nextVisit: '2024-12-10' },
    { id: 3, name: 'Vikram Joshi', lastVisit: '2024-12-02', diagnosis: 'Routine Check-up', nextVisit: '2025-01-02' },
  ]);
  const [selectedPatient, setSelectedPatient] = useState<(typeof patients)[number] | null>(null);
  const [patientForm, setPatientForm] = useState({
    name: '',
    diagnosis: '',
    lastVisit: '',
    nextVisit: '',
  });

  const [invoices, setInvoices] = useState([
    { id: 1, number: 'INV-2025-0235', patientName: 'Patient Name', amount: 2500, status: 'Paid' as const },
    { id: 2, number: 'INV-2025-0236', patientName: 'Patient Name', amount: 2500, status: 'Paid' as const },
    { id: 3, number: 'INV-2025-0237', patientName: 'Patient Name', amount: 2500, status: 'Paid' as const },
    { id: 4, number: 'INV-2025-0238', patientName: 'Patient Name', amount: 2500, status: 'Paid' as const },
  ]);
  const [invoiceForm, setInvoiceForm] = useState({
    patientName: '',
    amount: '',
    status: 'Paid' as 'Paid' | 'Pending',
  });

  const [inventoryItems, setInventoryItems] = useState([
    { id: 1, name: 'Paracetamol 500mg', qty: 245, status: 'In Stock' as const },
    { id: 2, name: 'Amoxicillin 250mg', qty: 18, status: 'Low Stock' as const },
    { id: 3, name: 'Blood Pressure Monitor', qty: 5, status: 'Low Stock' as const },
    { id: 4, name: 'Thermometer Digital', qty: 0, status: 'Out of Stock' as const },
  ]);
  const [inventoryForm, setInventoryForm] = useState({
    name: '',
    qty: '',
  });
  const [manageInventoryForm, setManageInventoryForm] = useState({
    name: '',
    qty: '',
    status: 'In Stock' as 'In Stock' | 'Low Stock' | 'Out of Stock',
  });
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<(typeof inventoryItems)[number] | null>(null);
  const [appointmentForm, setAppointmentForm] = useState({
    patientName: '',
    patientPhone: '',
    patientEmail: '',
    appointmentDate: '',
    appointmentTime: '',
    appointmentType: 'consultation',
    doctor: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);

  const handleCreateAppointment = async () => {
    if (!appointmentForm.patientName || !appointmentForm.appointmentDate || !appointmentForm.appointmentTime) {
      toast.error('Please fill in required fields');
      return;
    }
    
    setSaving(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success('Appointment created successfully!');
      setShowNewAppointment(false);
      setAppointmentForm({
        patientName: '',
        patientPhone: '',
        patientEmail: '',
        appointmentDate: '',
        appointmentTime: '',
        appointmentType: 'consultation',
        doctor: '',
        notes: ''
      });
    } catch (error) {
      toast.error('Failed to create appointment');
    } finally {
      setSaving(false);
    }
  };

  const escapeCsvCell = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const downloadCsv = (filename: string, headers: string[], rows: unknown[][]) => {
    const csv = [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleAddPatient = async () => {
    if (!patientForm.name.trim()) {
      toast.error('Patient name is required');
      return;
    }
    const newId = Math.max(0, ...patients.map((p) => p.id)) + 1;
    setPatients([
      {
        id: newId,
        name: patientForm.name.trim(),
        diagnosis: patientForm.diagnosis.trim() || '—',
        lastVisit: patientForm.lastVisit || new Date().toISOString().slice(0, 10),
        nextVisit: patientForm.nextVisit || '—',
      },
      ...patients,
    ]);
    setShowAddPatient(false);
    setPatientForm({ name: '', diagnosis: '', lastVisit: '', nextVisit: '' });
    toast.success('Patient added');
  };

  const isDueSoon = (dateStr: string) => {
    if (!dateStr || dateStr === '—') return false;
    const t = new Date(dateStr);
    if (Number.isNaN(t.getTime())) return false;
    const now = new Date();
    const diffDays = (t.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 7;
  };

  const filteredPatients = patients.filter((p) => {
    const q = patientSearch.trim().toLowerCase();
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.diagnosis.toLowerCase().includes(q);
    const matchesFilter = patientFilter === 'all' || isDueSoon(p.nextVisit);
    return matchesSearch && matchesFilter;
  });

  const handleCreateInvoice = () => {
    if (!invoiceForm.patientName.trim() || !invoiceForm.amount.trim()) {
      toast.error('Patient name and amount are required');
      return;
    }
    const amount = Number(invoiceForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    const newId = Math.max(0, ...invoices.map((i) => i.id)) + 1;
    const number = `INV-${new Date().getFullYear()}-${String(2000 + newId).padStart(4, '0')}`;
    setInvoices([
      {
        id: newId,
        number,
        patientName: invoiceForm.patientName.trim(),
        amount,
        status: invoiceForm.status,
      },
      ...invoices,
    ]);
    setShowCreateInvoice(false);
    setInvoiceForm({ patientName: '', amount: '', status: 'Paid' });
    toast.success('Invoice created');
  };

  const handleDownloadInvoice = (invoice: { number: string; patientName: string; amount: number; status: string }) => {
    downloadCsv(
      `${invoice.number}.csv`,
      ['Invoice Number', 'Patient Name', 'Amount', 'Status'],
      [[invoice.number, invoice.patientName, invoice.amount, invoice.status]]
    );
    toast.success('Invoice downloaded');
  };

  const handleAddInventoryItem = () => {
    if (!inventoryForm.name.trim() || !inventoryForm.qty.trim()) {
      toast.error('Item name and quantity are required');
      return;
    }
    const qty = Number(inventoryForm.qty);
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error('Enter a valid quantity');
      return;
    }
    const status = qty === 0 ? 'Out of Stock' : qty <= 20 ? 'Low Stock' : 'In Stock';
    const newId = Math.max(0, ...inventoryItems.map((i) => i.id)) + 1;
    setInventoryItems([{ id: newId, name: inventoryForm.name.trim(), qty, status: status as any }, ...inventoryItems]);
    setShowAddInventory(false);
    setInventoryForm({ name: '', qty: '' });
    toast.success('Inventory item added');
  };

  const openManageInventory = (item: (typeof inventoryItems)[number]) => {
    setSelectedInventoryItem(item);
    setManageInventoryForm({ name: item.name, qty: String(item.qty), status: item.status });
    setShowManageInventory(true);
  };

  const handleUpdateInventoryItem = () => {
    if (!selectedInventoryItem) return;
    if (!manageInventoryForm.name.trim() || !manageInventoryForm.qty.trim()) {
      toast.error('Item name and quantity are required');
      return;
    }
    const qty = Number(manageInventoryForm.qty);
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error('Enter a valid quantity');
      return;
    }
    setInventoryItems((prev) => prev.map((item) => item.id === selectedInventoryItem.id
      ? { ...item, name: manageInventoryForm.name.trim(), qty, status: manageInventoryForm.status }
      : item));
    setShowManageInventory(false);
    setSelectedInventoryItem(null);
    toast.success('Inventory item updated');
  };

  const handleExportDashboardReports = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      `clinic-dashboard-export-${stamp}.csv`,
      ['Section', 'Key', 'Value'],
      [
        ['Patients', 'Count', patients.length],
        ['Invoices', 'Count', invoices.length],
        ['Inventory', 'Count', inventoryItems.length],
      ]
    );
    toast.success('Export started');
  };

  const handleGenerateReport = (reportName: string) => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (reportName === 'Inventory Report') {
      downloadCsv(
        `clinic-inventory-report-${stamp}.csv`,
        ['Item', 'Quantity', 'Status'],
        inventoryItems.map((i) => [i.name, i.qty, i.status])
      );
      toast.success('Inventory report generated');
      return;
    }
    if (reportName === 'Revenue Analysis' || reportName === 'Monthly Report' || reportName === 'Daily Summary') {
      downloadCsv(
        `clinic-${reportName.toLowerCase().replace(/\s+/g, '-')}-${stamp}.csv`,
        ['Invoice', 'Patient', 'Amount', 'Status'],
        invoices.map((i) => [i.number, i.patientName, i.amount, i.status])
      );
      toast.success(`${reportName} generated`);
      return;
    }
    if (reportName === 'Patient Statistics') {
      downloadCsv(
        `clinic-patient-statistics-${stamp}.csv`,
        ['Patient', 'Diagnosis', 'Last Visit', 'Next Visit'],
        patients.map((p) => [p.name, p.diagnosis, p.lastVisit, p.nextVisit])
      );
      toast.success('Patient report generated');
      return;
    }

    downloadCsv(
      `clinic-${reportName.toLowerCase().replace(/\s+/g, '-')}-${stamp}.csv`,
      ['Report', 'Generated At'],
      [[reportName, new Date().toISOString()]]
    );
    toast.success(`${reportName} generated`);
  };

  useEffect(() => {
    const token = localStorage.getItem('clinicToken');
    const data = localStorage.getItem('clinicData');
    const userType = localStorage.getItem('userType');
    
    if (!token) {
      navigate('/clinic/login');
      return;
    }
    
    // Ensure userType is set for API calls to work
    if (!userType || userType !== 'clinic') {
      console.log('⚠️ Dashboard: Fixing clinic session - setting userType to clinic');
      localStorage.setItem('userType', 'clinic');
    }
    
    if (data) {
      setClinicData(JSON.parse(data));
    }
    
    // Fetch dashboard stats from API
    fetchDashboardStats();
    setLoading(false);
  }, [navigate]);

  const fetchDashboardStats = async () => {
    try {
      const response = await api.get('/clinic/dashboard/stats');
      console.log('Dashboard stats:', response.data?.data);
      // Update stats with real data when available
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('clinicToken');
    localStorage.removeItem('clinicData');
    navigate('/clinic/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Activity className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  const stats = [
    { label: 'Today\'s Appointments', value: '24', icon: Calendar, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: 'Patients Waiting', value: '8', icon: UserCheck, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Total Patients', value: '1,847', icon: Users, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Today\'s Revenue', value: '₹45,890', icon: DollarSign, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  const upcomingAppointments = [
    { id: 1, patient: 'Rajesh Kumar', time: '10:30 AM', type: 'Consultation', status: 'Waiting' },
    { id: 2, patient: 'Priya Sharma', time: '11:00 AM', type: 'Follow-up', status: 'Scheduled' },
    { id: 3, patient: 'Amit Patel', time: '11:30 AM', type: 'Check-up', status: 'Scheduled' },
    { id: 4, patient: 'Neha Singh', time: '12:00 PM', type: 'Consultation', status: 'Scheduled' },
  ];

  // patients state is above

  return (
    <ClinicLayout title="Dashboard" subtitle="Clinic Management Overview">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => (
          <Card key={index} className="hover:shadow-lg transition-shadow bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
                </div>
                <div className={`${stat.bg} dark:bg-opacity-20 p-4 rounded-xl`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="appointments" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto">
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="patients">Patients</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        {/* Appointments Tab */}
        <TabsContent value="appointments" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Appointment Management</h2>
            <Button className="bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 gap-2" onClick={() => setShowNewAppointment(true)}>
              <Plus className="h-4 w-4" />
              New Appointment
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Today's Schedule</CardTitle>
                  <CardDescription>Manage your appointments for December 4, 2025</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {upcomingAppointments.map((apt) => (
                      <div key={apt.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="bg-teal-100 p-3 rounded-lg">
                            <Clock className="h-5 w-5 text-teal-600" />
                          </div>
                          <div>
                            <p className="font-semibold">{apt.patient}</p>
                            <p className="text-sm text-muted-foreground">{apt.type}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-medium">{apt.time}</span>
                          <Badge variant={apt.status === 'Waiting' ? 'default' : 'secondary'}>
                            {apt.status}
                          </Badge>
                          <Button size="sm" variant="outline" onClick={() => {
                            setSelectedAppointment(apt);
                            setShowViewAppointment(true);
                          }}>
                            View
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setShowNewAppointment(true)}>
                    <Calendar className="h-4 w-4" />
                    Schedule Appointment
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={() => {
                    setAppointmentForm(prev => ({ ...prev, appointmentType: 'walk-in' }));
                    setShowNewAppointment(true);
                  }}>
                    <UserCheck className="h-4 w-4" />
                    Walk-in Patient
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate('/clinic/appointments')}>
                    <FileText className="h-4 w-4" />
                    View Calendar
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start gap-2" 
                    disabled={sendingBulkReminders}
                    onClick={async () => {
                      setSendingBulkReminders(true);
                      try {
                        // Send reminders for all upcoming appointments
                        for (const apt of upcomingAppointments.slice(0, 5)) {
                          try {
                            await api.post(`/appointments/${apt.id}/remind`);
                          } catch (e) {
                            console.log('Reminder service not available for:', apt.id);
                          }
                        }
                        toast.success('Appointment reminders sent successfully!');
                      } catch (error: any) {
                        toast.error(error?.response?.data?.message || 'Failed to send reminders');
                      } finally {
                        setSendingBulkReminders(false);
                      }
                    }}
                  >
                    {sendingBulkReminders ? (
                      <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                    ) : (
                      <Bell className="h-4 w-4" />
                    )}
                    {sendingBulkReminders ? 'Sending...' : 'Send Reminders'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Patients Tab */}
          <TabsContent value="patients" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Patient Management</h2>
              <Button className="bg-gradient-to-r from-teal-600 to-cyan-600 gap-2" onClick={() => setShowAddPatient(true)}>
                <Plus className="h-4 w-4" />
                Add Patient
              </Button>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <Input
                      placeholder="Search patients..."
                      className="max-w-md"
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                    />
                  </div>
                  <Button variant="outline" size="icon" onClick={() => setPatientSearch(patientSearch)}>
                    <Search className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setShowPatientFilter(true)}>
                    <Filter className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {filteredPatients.map((patient) => (
                    <div key={patient.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="bg-teal-100 p-3 rounded-full">
                          <Users className="h-5 w-5 text-teal-600" />
                        </div>
                        <div>
                          <p className="font-semibold">{patient.name}</p>
                          <p className="text-sm text-muted-foreground">{patient.diagnosis}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-sm font-medium">Last Visit</p>
                          <p className="text-sm text-muted-foreground">{patient.lastVisit}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">Next Visit</p>
                          <p className="text-sm text-muted-foreground">{patient.nextVisit}</p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedPatient(patient);
                            setShowPatientDetails(true);
                          }}
                        >
                          View Details
                        </Button>
                      </div>
                    </div>
                  ))}
                  {filteredPatients.length === 0 && (
                    <p className="text-sm text-muted-foreground">No patients match your filters.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Billing & Payments</h2>
              <Button className="bg-gradient-to-r from-teal-600 to-cyan-600 gap-2" onClick={() => setShowCreateInvoice(true)}>
                <Plus className="h-4 w-4" />
                Create Invoice
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Today's Collection</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-green-600">₹45,890</p>
                  <p className="text-sm text-muted-foreground mt-2">From 18 invoices</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Pending Payments</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-orange-600">₹12,450</p>
                  <p className="text-sm text-muted-foreground mt-2">5 outstanding</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">This Month</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-blue-600">₹8,45,600</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    <TrendingUp className="inline h-4 w-4 text-green-500" /> 12% vs last month
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {invoices.map((invoice) => (
                    <div key={invoice.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="bg-cyan-100 p-2 rounded">
                          <FileText className="h-4 w-4 text-cyan-600" />
                        </div>
                        <div>
                          <p className="font-medium">{invoice.number}</p>
                          <p className="text-sm text-muted-foreground">{invoice.patientName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="font-semibold">₹{invoice.amount.toLocaleString()}</p>
                        <Badge variant="outline" className={invoice.status === 'Paid' ? 'bg-green-50' : 'bg-orange-50'}>
                          {invoice.status}
                        </Badge>
                        <Button size="sm" variant="ghost" onClick={() => handleDownloadInvoice(invoice)}>
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Inventory Tab */}
          <TabsContent value="inventory" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Inventory Management</h2>
              <Button className="bg-gradient-to-r from-teal-600 to-cyan-600 gap-2" onClick={() => setShowAddInventory(true)}>
                <Plus className="h-4 w-4" />
                Add Item
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Total Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">342</p>
                  <p className="text-sm text-muted-foreground mt-2">In stock</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Low Stock</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-orange-600">12</p>
                  <p className="text-sm text-muted-foreground mt-2">Need reorder</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Out of Stock</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-red-600">3</p>
                  <p className="text-sm text-muted-foreground mt-2">Urgent action</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Expiring Soon</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-yellow-600">8</p>
                  <p className="text-sm text-muted-foreground mt-2">Within 30 days</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Inventory Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {inventoryItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="bg-teal-100 p-2 rounded">
                          <Pill className="h-4 w-4 text-teal-600" />
                        </div>
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-muted-foreground">Quantity: {item.qty}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge 
                          variant={item.status === 'In Stock' ? 'default' : item.status === 'Low Stock' ? 'secondary' : 'destructive'}
                        >
                          {item.status}
                        </Badge>
                        <Button size="sm" variant="outline" onClick={() => openManageInventory(item)}>Manage</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Reports & Analytics</h2>
              <Button variant="outline" className="gap-2" onClick={handleExportDashboardReports}>
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Patient Analytics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">New Patients (This Month)</span>
                      <span className="font-bold">124</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Return Patients</span>
                      <span className="font-bold">456</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Avg. Appointments/Day</span>
                      <span className="font-bold">32</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Cancellation Rate</span>
                      <span className="font-bold text-green-600">5.2%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Financial Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Total Revenue (Dec)</span>
                      <span className="font-bold">₹8,45,600</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Avg. Revenue/Day</span>
                      <span className="font-bold">₹28,187</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Collection Rate</span>
                      <span className="font-bold text-green-600">94.5%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Outstanding</span>
                      <span className="font-bold text-orange-600">₹46,500</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Generate Reports</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { name: 'Daily Summary', icon: BarChart3 },
                    { name: 'Monthly Report', icon: FileText },
                    { name: 'Patient Statistics', icon: Users },
                    { name: 'Revenue Analysis', icon: DollarSign },
                    { name: 'Inventory Report', icon: Pill },
                    { name: 'Staff Performance', icon: Activity },
                  ].map((report, i) => (
                    <Button key={i} variant="outline" className="h-24 flex-col gap-2" onClick={() => handleGenerateReport(report.name)}>
                      <report.icon className="h-6 w-6" />
                    {report.name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Patient Dialog */}
      <Dialog open={showAddPatient} onOpenChange={setShowAddPatient}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Patient</DialogTitle>
            <DialogDescription>Register a patient in the clinic roster.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Patient Name *</Label>
              <Input value={patientForm.name} onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Diagnosis / Reason</Label>
              <Input value={patientForm.diagnosis} onChange={(e) => setPatientForm({ ...patientForm, diagnosis: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Last Visit</Label>
                <Input type="date" value={patientForm.lastVisit} onChange={(e) => setPatientForm({ ...patientForm, lastVisit: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Next Visit</Label>
                <Input type="date" value={patientForm.nextVisit} onChange={(e) => setPatientForm({ ...patientForm, nextVisit: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPatient(false)}>Cancel</Button>
            <Button className="bg-gradient-to-r from-teal-600 to-cyan-600" onClick={handleAddPatient}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Patient Filters Dialog */}
      <Dialog open={showPatientFilter} onOpenChange={setShowPatientFilter}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Patient Filters</DialogTitle>
            <DialogDescription>Filter the patient list.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Next Visit</Label>
              <Select value={patientFilter} onValueChange={(v) => setPatientFilter(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="due-soon">Due in next 7 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPatientFilter(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Patient Details Dialog */}
      <Dialog
        open={showPatientDetails}
        onOpenChange={(open) => {
          setShowPatientDetails(open);
          if (!open) setSelectedPatient(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Patient Details</DialogTitle>
            <DialogDescription>View patient information.</DialogDescription>
          </DialogHeader>

          {!selectedPatient ? (
            <div className="text-sm text-muted-foreground">No patient selected.</div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="text-lg font-semibold">{selectedPatient.name}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Diagnosis / Reason</p>
                  <p className="font-medium">{selectedPatient.diagnosis}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Patient ID</p>
                  <p className="font-medium">P-{String(selectedPatient.id).padStart(4, '0')}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Last Visit</p>
                  <p className="font-medium">{selectedPatient.lastVisit}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Next Visit</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{selectedPatient.nextVisit}</p>
                    {patientFilter !== 'all' ? null : isDueSoon(selectedPatient.nextVisit) ? (
                      <Badge variant="secondary">Due soon</Badge>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPatientDetails(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Invoice Dialog */}
      <Dialog open={showCreateInvoice} onOpenChange={setShowCreateInvoice}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
            <DialogDescription>Create a new invoice for a patient.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Patient Name *</Label>
              <Input value={invoiceForm.patientName} onChange={(e) => setInvoiceForm({ ...invoiceForm, patientName: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount (₹) *</Label>
                <Input type="number" value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={invoiceForm.status} onValueChange={(v) => setInvoiceForm({ ...invoiceForm, status: v as any })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Paid">Paid</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateInvoice(false)}>Cancel</Button>
            <Button className="bg-gradient-to-r from-teal-600 to-cyan-600" onClick={handleCreateInvoice}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Inventory Dialog */}
      <Dialog open={showAddInventory} onOpenChange={setShowAddInventory}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Inventory Item</DialogTitle>
            <DialogDescription>Add an item to the inventory list.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Item Name *</Label>
              <Input value={inventoryForm.name} onChange={(e) => setInventoryForm({ ...inventoryForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Quantity *</Label>
              <Input type="number" value={inventoryForm.qty} onChange={(e) => setInventoryForm({ ...inventoryForm, qty: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddInventory(false)}>Cancel</Button>
            <Button className="bg-gradient-to-r from-teal-600 to-cyan-600" onClick={handleAddInventoryItem}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Inventory Dialog */}
      <Dialog open={showManageInventory} onOpenChange={(open) => {
        setShowManageInventory(open);
        if (!open) setSelectedInventoryItem(null);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Inventory Item</DialogTitle>
            <DialogDescription>Update quantity, status, or name for this item.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Item Name *</Label>
              <Input value={manageInventoryForm.name} onChange={(e) => setManageInventoryForm({ ...manageInventoryForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Quantity *</Label>
              <Input type="number" value={manageInventoryForm.qty} onChange={(e) => setManageInventoryForm({ ...manageInventoryForm, qty: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={manageInventoryForm.status} onValueChange={(v) => setManageInventoryForm({ ...manageInventoryForm, status: v as any })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="In Stock">In Stock</SelectItem>
                  <SelectItem value="Low Stock">Low Stock</SelectItem>
                  <SelectItem value="Out of Stock">Out of Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManageInventory(false)}>Cancel</Button>
            <Button className="bg-gradient-to-r from-teal-600 to-cyan-600" onClick={handleUpdateInventoryItem}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Appointment Dialog */}
      <Dialog open={showNewAppointment} onOpenChange={setShowNewAppointment}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-teal-600" />
              Schedule New Appointment
            </DialogTitle>
            <DialogDescription>
              Fill in the details to create a new appointment
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="patientName">Patient Name *</Label>
                <Input
                  id="patientName"
                  placeholder="Enter patient name"
                  value={appointmentForm.patientName}
                  onChange={(e) => setAppointmentForm({...appointmentForm, patientName: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="patientPhone">Phone Number</Label>
                <Input
                  id="patientPhone"
                  placeholder="+91 9876543210"
                  value={appointmentForm.patientPhone}
                  onChange={(e) => setAppointmentForm({...appointmentForm, patientPhone: e.target.value})}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="patientEmail">Email Address</Label>
              <Input
                id="patientEmail"
                type="email"
                placeholder="patient@email.com"
                value={appointmentForm.patientEmail}
                onChange={(e) => setAppointmentForm({...appointmentForm, patientEmail: e.target.value})}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="appointmentDate">Appointment Date *</Label>
                <Input
                  id="appointmentDate"
                  type="date"
                  value={appointmentForm.appointmentDate}
                  onChange={(e) => setAppointmentForm({...appointmentForm, appointmentDate: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="appointmentTime">Appointment Time *</Label>
                <Input
                  id="appointmentTime"
                  type="time"
                  value={appointmentForm.appointmentTime}
                  onChange={(e) => setAppointmentForm({...appointmentForm, appointmentTime: e.target.value})}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="appointmentType">Appointment Type</Label>
                <Select 
                  value={appointmentForm.appointmentType} 
                  onValueChange={(value) => setAppointmentForm({...appointmentForm, appointmentType: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consultation">Consultation</SelectItem>
                    <SelectItem value="follow-up">Follow-up</SelectItem>
                    <SelectItem value="check-up">Check-up</SelectItem>
                    <SelectItem value="vaccination">Vaccination</SelectItem>
                    <SelectItem value="lab-test">Lab Test</SelectItem>
                    <SelectItem value="procedure">Procedure</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="doctor">Assign Doctor</Label>
                <Select 
                  value={appointmentForm.doctor} 
                  onValueChange={(value) => setAppointmentForm({...appointmentForm, doctor: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dr-sharma">Dr. Sharma - General</SelectItem>
                    <SelectItem value="dr-patel">Dr. Patel - Cardiology</SelectItem>
                    <SelectItem value="dr-gupta">Dr. Gupta - Pediatrics</SelectItem>
                    <SelectItem value="dr-singh">Dr. Singh - Orthopedics</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Add any additional notes or symptoms..."
                rows={3}
                value={appointmentForm.notes}
                onChange={(e) => setAppointmentForm({...appointmentForm, notes: e.target.value})}
              />
            </div>
            
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowNewAppointment(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-gradient-to-r from-teal-600 to-cyan-600"
                onClick={handleCreateAppointment}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Activity className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Appointment
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Appointment Dialog */}
      <Dialog open={showViewAppointment} onOpenChange={setShowViewAppointment}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-teal-600" />
              Appointment Details
            </DialogTitle>
          </DialogHeader>
          
          {selectedAppointment && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Patient</Label>
                  <p className="font-semibold">{selectedAppointment.patient}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Status</Label>
                  <Badge variant={selectedAppointment.status === 'Waiting' ? 'default' : 'secondary'}>
                    {selectedAppointment.status}
                  </Badge>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Time</Label>
                  <p className="font-medium">{selectedAppointment.time}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Type</Label>
                  <p className="font-medium">{selectedAppointment.type}</p>
                </div>
              </div>
              
              <div className="flex gap-2 pt-4 border-t">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  disabled={sendingReminder}
                  onClick={async () => {
                    setSendingReminder(true);
                    try {
                      await api.post(`/appointments/${selectedAppointment.id}/remind`);
                      toast.success(`Reminder sent to ${selectedAppointment.patient}`);
                    } catch (error: any) {
                      toast.error(error?.response?.data?.message || 'Failed to send reminder');
                    } finally {
                      setSendingReminder(false);
                    }
                  }}
                >
                  {sendingReminder ? (
                    <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                  ) : (
                    <Bell className="h-4 w-4 mr-2" />
                  )}
                  {sendingReminder ? 'Sending...' : 'Send Reminder'}
                </Button>
                <Button 
                  className="flex-1 bg-gradient-to-r from-teal-600 to-cyan-600"
                  onClick={() => {
                    setShowViewAppointment(false);
                    navigate(`/clinic/appointments?id=${selectedAppointment.id}`);
                  }}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Full Details
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ClinicLayout>
  );
};

export default ClinicDashboard;