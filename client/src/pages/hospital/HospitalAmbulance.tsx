import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import {
  Ambulance, MapPin, Phone, Clock, Users, AlertTriangle, CheckCircle,
  XCircle, Navigation, Activity, Plus, Search, Filter, Edit, Trash2,
  Eye, RefreshCw, PhoneCall, Siren, Heart, Stethoscope, User,
  Calendar, Timer, TrendingUp, Car, Fuel, Settings, MoreVertical,
  MapPinned, Route, Radio, Bell, FileText, Download, PlayCircle,
  PauseCircle, CircleDot, Loader2, ChevronRight, ArrowRight,
  Building2, UserCheck, Zap
} from 'lucide-react';

// Types
interface AmbulanceVehicle {
  id: string;
  vehicleNumber: string;
  type: 'BLS' | 'ALS' | 'PICU' | 'NICU' | 'Mortuary';
  status: 'available' | 'on_duty' | 'maintenance' | 'offline';
  driver: {
    name: string;
    phone: string;
  };
  paramedic?: {
    name: string;
    phone: string;
  };
  currentLocation?: string;
  lastUpdated: string;
  equipment: string[];
  fuelLevel: number;
}

interface EmergencyRequest {
  id: string;
  patientName: string;
  phone: string;
  pickupLocation: string;
  destination?: string;
  emergencyType: string;
  priority: 'critical' | 'urgent' | 'normal';
  status: 'pending' | 'dispatched' | 'en_route' | 'at_scene' | 'transporting' | 'completed' | 'cancelled';
  assignedAmbulance?: string;
  requestTime: string;
  dispatchTime?: string;
  arrivalTime?: string;
  completionTime?: string;
  notes?: string;
}

interface TripLog {
  id: string;
  ambulanceId: string;
  vehicleNumber: string;
  patientName: string;
  pickupLocation: string;
  destination: string;
  emergencyType: string;
  startTime: string;
  endTime: string;
  distance: string;
  driver: string;
  status: 'completed' | 'cancelled';
}

const HospitalAmbulance = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddVehicleDialog, setShowAddVehicleDialog] = useState(false);
  const [showNewRequestDialog, setShowNewRequestDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<EmergencyRequest | null>(null);

  // Mock ambulance fleet data
  const [ambulances, setAmbulances] = useState<AmbulanceVehicle[]>([
    {
      id: 'AMB001',
      vehicleNumber: 'KA-01-AB-1234',
      type: 'ALS',
      status: 'available',
      driver: { name: 'Ramesh Kumar', phone: '+91 98765 43210' },
      paramedic: { name: 'Dr. Priya Sharma', phone: '+91 87654 32109' },
      currentLocation: 'Hospital Parking - Bay 1',
      lastUpdated: '2026-01-07T12:30:00',
      equipment: ['Defibrillator', 'Ventilator', 'Cardiac Monitor', 'Oxygen'],
      fuelLevel: 85
    },
    {
      id: 'AMB002',
      vehicleNumber: 'KA-01-CD-5678',
      type: 'BLS',
      status: 'on_duty',
      driver: { name: 'Suresh Reddy', phone: '+91 76543 21098' },
      currentLocation: 'En route - MG Road',
      lastUpdated: '2026-01-07T12:25:00',
      equipment: ['First Aid Kit', 'Stretcher', 'Oxygen', 'Splints'],
      fuelLevel: 60
    },
    {
      id: 'AMB003',
      vehicleNumber: 'KA-01-EF-9012',
      type: 'PICU',
      status: 'available',
      driver: { name: 'Venkat Rao', phone: '+91 65432 10987' },
      paramedic: { name: 'Dr. Anil Kumar', phone: '+91 54321 09876' },
      currentLocation: 'Hospital Parking - Bay 2',
      lastUpdated: '2026-01-07T12:28:00',
      equipment: ['Pediatric Ventilator', 'Incubator', 'Pediatric Defibrillator', 'Monitors'],
      fuelLevel: 92
    },
    {
      id: 'AMB004',
      vehicleNumber: 'KA-01-GH-3456',
      type: 'ALS',
      status: 'maintenance',
      driver: { name: 'Mahesh Singh', phone: '+91 43210 98765' },
      currentLocation: 'Service Center',
      lastUpdated: '2026-01-07T10:00:00',
      equipment: ['Defibrillator', 'Ventilator', 'Cardiac Monitor', 'Oxygen'],
      fuelLevel: 45
    },
    {
      id: 'AMB005',
      vehicleNumber: 'KA-01-IJ-7890',
      type: 'NICU',
      status: 'on_duty',
      driver: { name: 'Kiran Patel', phone: '+91 32109 87654' },
      paramedic: { name: 'Dr. Meena Devi', phone: '+91 21098 76543' },
      currentLocation: 'Transporting to Hospital',
      lastUpdated: '2026-01-07T12:20:00',
      equipment: ['Neonatal Ventilator', 'Transport Incubator', 'Monitors', 'Resuscitation Kit'],
      fuelLevel: 70
    }
  ]);

  // Mock emergency requests
  const [emergencyRequests, setEmergencyRequests] = useState<EmergencyRequest[]>([
    {
      id: 'ER001',
      patientName: 'Rajesh Gupta',
      phone: '+91 98765 11111',
      pickupLocation: '123, MG Road, Near Metro Station',
      destination: 'City Hospital',
      emergencyType: 'Cardiac Emergency',
      priority: 'critical',
      status: 'dispatched',
      assignedAmbulance: 'AMB002',
      requestTime: '2026-01-07T12:15:00',
      dispatchTime: '2026-01-07T12:18:00',
      notes: 'Patient complaining of severe chest pain'
    },
    {
      id: 'ER002',
      patientName: 'Sunita Devi',
      phone: '+91 87654 22222',
      pickupLocation: '45, Jayanagar 4th Block',
      emergencyType: 'Road Accident',
      priority: 'urgent',
      status: 'pending',
      requestTime: '2026-01-07T12:28:00',
      notes: 'Multiple injuries reported'
    },
    {
      id: 'ER003',
      patientName: 'Baby of Meera',
      phone: '+91 76543 33333',
      pickupLocation: 'Rainbow Hospital, Whitefield',
      destination: 'City Hospital NICU',
      emergencyType: 'NICU Transfer',
      priority: 'critical',
      status: 'transporting',
      assignedAmbulance: 'AMB005',
      requestTime: '2026-01-07T11:45:00',
      dispatchTime: '2026-01-07T11:50:00',
      arrivalTime: '2026-01-07T12:10:00',
      notes: 'Premature baby requiring NICU care'
    },
    {
      id: 'ER004',
      patientName: 'Anand Sharma',
      phone: '+91 65432 44444',
      pickupLocation: '78, Koramangala 5th Block',
      emergencyType: 'Medical Emergency',
      priority: 'normal',
      status: 'completed',
      assignedAmbulance: 'AMB001',
      requestTime: '2026-01-07T10:00:00',
      dispatchTime: '2026-01-07T10:05:00',
      arrivalTime: '2026-01-07T10:20:00',
      completionTime: '2026-01-07T10:45:00'
    }
  ]);

  // Mock trip logs
  const [tripLogs] = useState<TripLog[]>([
    {
      id: 'TL001',
      ambulanceId: 'AMB001',
      vehicleNumber: 'KA-01-AB-1234',
      patientName: 'Anand Sharma',
      pickupLocation: 'Koramangala 5th Block',
      destination: 'City Hospital',
      emergencyType: 'Medical Emergency',
      startTime: '2026-01-07T10:05:00',
      endTime: '2026-01-07T10:45:00',
      distance: '8.5 km',
      driver: 'Ramesh Kumar',
      status: 'completed'
    },
    {
      id: 'TL002',
      ambulanceId: 'AMB002',
      vehicleNumber: 'KA-01-CD-5678',
      patientName: 'Lakshmi Rao',
      pickupLocation: 'HSR Layout',
      destination: 'City Hospital',
      emergencyType: 'Pregnancy Emergency',
      startTime: '2026-01-07T08:30:00',
      endTime: '2026-01-07T09:15:00',
      distance: '12.3 km',
      driver: 'Suresh Reddy',
      status: 'completed'
    },
    {
      id: 'TL003',
      ambulanceId: 'AMB003',
      vehicleNumber: 'KA-01-EF-9012',
      patientName: 'Child of Kumar',
      pickupLocation: 'Indiranagar',
      destination: 'City Hospital PICU',
      emergencyType: 'Pediatric Emergency',
      startTime: '2026-01-06T22:00:00',
      endTime: '2026-01-06T22:35:00',
      distance: '6.2 km',
      driver: 'Venkat Rao',
      status: 'completed'
    }
  ]);

  const getStatusBadge = (status: string) => {
    const config: Record<string, { color: string; label: string }> = {
      available: { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', label: 'Available' },
      on_duty: { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: 'On Duty' },
      maintenance: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', label: 'Maintenance' },
      offline: { color: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300', label: 'Offline' },
      pending: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', label: 'Pending' },
      dispatched: { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: 'Dispatched' },
      en_route: { color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400', label: 'En Route' },
      at_scene: { color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', label: 'At Scene' },
      transporting: { color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400', label: 'Transporting' },
      completed: { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', label: 'Completed' },
      cancelled: { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', label: 'Cancelled' }
    };
    const { color, label } = config[status] || config.offline;
    return <Badge className={color}>{label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const config: Record<string, { color: string; icon: any }> = {
      critical: { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: Siren },
      urgent: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: AlertTriangle },
      normal: { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Activity }
    };
    const { color, icon: Icon } = config[priority] || config.normal;
    return (
      <Badge className={`${color} gap-1`}>
        <Icon className="h-3 w-3" />
        {priority.charAt(0).toUpperCase() + priority.slice(1)}
      </Badge>
    );
  };

  const getAmbulanceTypeBadge = (type: string) => {
    const config: Record<string, { color: string; label: string }> = {
      BLS: { color: 'bg-blue-500/10 text-blue-600', label: 'BLS - Basic Life Support' },
      ALS: { color: 'bg-red-500/10 text-red-600', label: 'ALS - Advanced Life Support' },
      PICU: { color: 'bg-purple-500/10 text-purple-600', label: 'PICU - Pediatric ICU' },
      NICU: { color: 'bg-pink-500/10 text-pink-600', label: 'NICU - Neonatal ICU' },
      Mortuary: { color: 'bg-slate-500/10 text-slate-600', label: 'Mortuary Van' }
    };
    const { color, label } = config[type] || { color: 'bg-slate-500/10 text-slate-600', label: type };
    return <Badge className={color}>{type}</Badge>;
  };

  const handleDispatchAmbulance = (requestId: string, ambulanceId: string) => {
    setEmergencyRequests(prev => prev.map(req =>
      req.id === requestId
        ? { ...req, status: 'dispatched', assignedAmbulance: ambulanceId, dispatchTime: new Date().toISOString() }
        : req
    ));
    setAmbulances(prev => prev.map(amb =>
      amb.id === ambulanceId ? { ...amb, status: 'on_duty' } : amb
    ));
    toast({ title: 'Ambulance Dispatched', description: `Ambulance ${ambulanceId} dispatched for request ${requestId}` });
  };

  const filteredAmbulances = ambulances.filter(amb => {
    const matchesSearch = amb.vehicleNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         amb.driver.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' || amb.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const availableAmbulances = ambulances.filter(a => a.status === 'available');
  const onDutyCount = ambulances.filter(a => a.status === 'on_duty').length;
  const pendingRequests = emergencyRequests.filter(r => r.status === 'pending').length;

  return (
    <HospitalLayout title="Ambulance Management" subtitle="Fleet management, emergency dispatch & trip tracking">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <TabsList className="bg-slate-100 dark:bg-slate-800">
            <TabsTrigger value="dashboard" className="gap-2">
              <Activity className="h-4 w-4" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="fleet" className="gap-2">
              <Ambulance className="h-4 w-4" /> Fleet
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-2">
              <Siren className="h-4 w-4" /> Requests
              {pendingRequests > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">{pendingRequests}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="trips" className="gap-2">
              <Route className="h-4 w-4" /> Trip Logs
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" /> Settings
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3">
            <Dialog open={showNewRequestDialog} onOpenChange={setShowNewRequestDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 border-red-500 text-red-600 hover:bg-red-50">
                  <Siren className="h-4 w-4" /> New Emergency
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-red-600">
                    <Siren className="h-5 w-5" /> New Emergency Request
                  </DialogTitle>
                  <DialogDescription>Enter emergency details to dispatch an ambulance</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Patient Name *</Label>
                      <Input placeholder="Patient name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Contact Number *</Label>
                      <Input placeholder="+91 98765 43210" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Pickup Location *</Label>
                    <Textarea placeholder="Full address with landmarks" className="min-h-16" />
                  </div>
                  <div className="space-y-2">
                    <Label>Destination (Optional)</Label>
                    <Input placeholder="Hospital or destination address" defaultValue="City Hospital" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Emergency Type *</Label>
                      <Select defaultValue="medical">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cardiac">Cardiac Emergency</SelectItem>
                          <SelectItem value="accident">Road Accident</SelectItem>
                          <SelectItem value="stroke">Stroke</SelectItem>
                          <SelectItem value="pregnancy">Pregnancy Emergency</SelectItem>
                          <SelectItem value="pediatric">Pediatric Emergency</SelectItem>
                          <SelectItem value="trauma">Trauma</SelectItem>
                          <SelectItem value="medical">Medical Emergency</SelectItem>
                          <SelectItem value="transfer">Patient Transfer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Priority *</Label>
                      <Select defaultValue="urgent">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="critical">🔴 Critical</SelectItem>
                          <SelectItem value="urgent">🟠 Urgent</SelectItem>
                          <SelectItem value="normal">🔵 Normal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea placeholder="Additional information about the emergency" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowNewRequestDialog(false)}>Cancel</Button>
                  <Button className="bg-red-600 hover:bg-red-700" onClick={() => {
                    toast({ title: 'Emergency Logged', description: 'Request created and dispatching ambulance...' });
                    setShowNewRequestDialog(false);
                  }}>
                    <Siren className="h-4 w-4 mr-2" /> Create & Dispatch
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white gap-2" onClick={() => setShowAddVehicleDialog(true)}>
              <Plus className="h-4 w-4" /> Add Vehicle
            </Button>
          </div>
        </div>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Total Fleet</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">{ambulances.length}</p>
                  </div>
                  <div className="p-3 bg-blue-500/10 rounded-xl">
                    <Ambulance className="h-6 w-6 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Available</p>
                    <p className="text-2xl font-bold text-emerald-600">{availableAmbulances.length}</p>
                  </div>
                  <div className="p-3 bg-emerald-500/10 rounded-xl">
                    <CheckCircle className="h-6 w-6 text-emerald-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">On Duty</p>
                    <p className="text-2xl font-bold text-blue-600">{onDutyCount}</p>
                  </div>
                  <div className="p-3 bg-blue-500/10 rounded-xl">
                    <Navigation className="h-6 w-6 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Pending Requests</p>
                    <p className="text-2xl font-bold text-amber-600">{pendingRequests}</p>
                  </div>
                  <div className="p-3 bg-amber-500/10 rounded-xl">
                    <Clock className="h-6 w-6 text-amber-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Today's Trips</p>
                    <p className="text-2xl font-bold text-purple-600">12</p>
                  </div>
                  <div className="p-3 bg-purple-500/10 rounded-xl">
                    <Route className="h-6 w-6 text-purple-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Active Requests & Fleet Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Emergency Requests */}
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                      <Siren className="h-5 w-5 text-red-500" /> Active Emergencies
                    </CardTitle>
                    <CardDescription className="text-slate-500 dark:text-slate-400">Current emergency requests</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('requests')}>
                    View All <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {emergencyRequests.filter(r => !['completed', 'cancelled'].includes(r.status)).slice(0, 4).map((request) => (
                    <div key={request.id} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border-l-4 border-l-red-500">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-slate-800 dark:text-white">{request.patientName}</span>
                            {getPriorityBadge(request.priority)}
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-300">{request.emergencyType}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3" /> {request.pickupLocation}
                          </p>
                        </div>
                        <div className="text-right">
                          {getStatusBadge(request.status)}
                          {request.assignedAmbulance && (
                            <p className="text-xs text-slate-500 mt-1">{request.assignedAmbulance}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {emergencyRequests.filter(r => !['completed', 'cancelled'].includes(r.status)).length === 0 && (
                    <div className="text-center py-8 text-slate-500">
                      <CheckCircle className="h-12 w-12 mx-auto mb-2 text-emerald-500" />
                      <p>No active emergencies</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Fleet Quick View */}
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                      <Ambulance className="h-5 w-5 text-teal-500" /> Fleet Status
                    </CardTitle>
                    <CardDescription className="text-slate-500 dark:text-slate-400">Real-time ambulance status</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('fleet')}>
                    View All <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {ambulances.slice(0, 5).map((amb) => (
                    <div key={amb.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          amb.status === 'available' ? 'bg-emerald-500/10' :
                          amb.status === 'on_duty' ? 'bg-blue-500/10' :
                          amb.status === 'maintenance' ? 'bg-amber-500/10' : 'bg-slate-500/10'
                        }`}>
                          <Ambulance className={`h-5 w-5 ${
                            amb.status === 'available' ? 'text-emerald-500' :
                            amb.status === 'on_duty' ? 'text-blue-500' :
                            amb.status === 'maintenance' ? 'text-amber-500' : 'text-slate-500'
                          }`} />
                        </div>
                        <div>
                          <p className="font-medium text-slate-800 dark:text-white">{amb.vehicleNumber}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{amb.type} • {amb.driver.name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {getStatusBadge(amb.status)}
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 justify-end">
                          <Fuel className="h-3 w-3" /> {amb.fuelLevel}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Stats */}
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-slate-800 dark:text-white">Today's Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <p className="text-3xl font-bold text-teal-600">12</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Total Trips</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-emerald-600">8 min</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Avg Response Time</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-blue-600">156 km</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Total Distance</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-purple-600">98%</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Success Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fleet Tab */}
        <TabsContent value="fleet" className="space-y-4">
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-slate-800 dark:text-white">Ambulance Fleet</CardTitle>
                  <CardDescription className="text-slate-500 dark:text-slate-400">Manage all ambulance vehicles</CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search vehicles..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 w-64"
                    />
                  </div>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="on_duty">On Duty</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="offline">Offline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAmbulances.map((amb) => (
                  <Card key={amb.id} className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-3 rounded-xl ${
                            amb.status === 'available' ? 'bg-emerald-500/10' :
                            amb.status === 'on_duty' ? 'bg-blue-500/10' :
                            amb.status === 'maintenance' ? 'bg-amber-500/10' : 'bg-slate-500/10'
                          }`}>
                            <Ambulance className={`h-6 w-6 ${
                              amb.status === 'available' ? 'text-emerald-500' :
                              amb.status === 'on_duty' ? 'text-blue-500' :
                              amb.status === 'maintenance' ? 'text-amber-500' : 'text-slate-500'
                            }`} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 dark:text-white">{amb.vehicleNumber}</p>
                            <p className="text-xs text-slate-500">{amb.id}</p>
                          </div>
                        </div>
                        {getStatusBadge(amb.status)}
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Type</span>
                          {getAmbulanceTypeBadge(amb.type)}
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Driver</span>
                          <span className="text-sm font-medium text-slate-800 dark:text-white">{amb.driver.name}</span>
                        </div>

                        {amb.paramedic && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Paramedic</span>
                            <span className="text-sm font-medium text-slate-800 dark:text-white">{amb.paramedic.name}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Fuel Level</span>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  amb.fuelLevel > 50 ? 'bg-emerald-500' :
                                  amb.fuelLevel > 25 ? 'bg-amber-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${amb.fuelLevel}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium">{amb.fuelLevel}%</span>
                          </div>
                        </div>

                        <div className="pt-2">
                          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {amb.currentLocation}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-1 pt-2">
                          {amb.equipment.slice(0, 3).map((eq, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{eq}</Badge>
                          ))}
                          {amb.equipment.length > 3 && (
                            <Badge variant="outline" className="text-xs">+{amb.equipment.length - 3}</Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <Button variant="outline" size="sm" className="flex-1">
                          <Phone className="h-4 w-4 mr-1" /> Call
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1">
                          <MapPinned className="h-4 w-4 mr-1" /> Track
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Requests Tab */}
        <TabsContent value="requests" className="space-y-4">
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-slate-800 dark:text-white">Emergency Requests</CardTitle>
                  <CardDescription className="text-slate-500 dark:text-slate-400">All ambulance requests and dispatch status</CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <Select defaultValue="all">
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Requests</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline">
                    <Download className="h-4 w-4 mr-2" /> Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request ID</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Emergency Type</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ambulance</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emergencyRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">{request.id}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-800 dark:text-white">{request.patientName}</p>
                          <p className="text-xs text-slate-500">{request.phone}</p>
                        </div>
                      </TableCell>
                      <TableCell>{request.emergencyType}</TableCell>
                      <TableCell>{getPriorityBadge(request.priority)}</TableCell>
                      <TableCell className="max-w-xs truncate">{request.pickupLocation}</TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                      <TableCell>
                        {request.assignedAmbulance ? (
                          <Badge variant="outline">{request.assignedAmbulance}</Badge>
                        ) : request.status === 'pending' ? (
                          <Select onValueChange={(v) => handleDispatchAmbulance(request.id, v)}>
                            <SelectTrigger className="w-32 h-8">
                              <SelectValue placeholder="Dispatch" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableAmbulances.map(amb => (
                                <SelectItem key={amb.id} value={amb.id}>
                                  {amb.vehicleNumber} ({amb.type})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {new Date(request.requestTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trip Logs Tab */}
        <TabsContent value="trips" className="space-y-4">
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-slate-800 dark:text-white">Trip Logs</CardTitle>
                  <CardDescription className="text-slate-500 dark:text-slate-400">Complete history of ambulance trips</CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <Input type="date" className="w-40" />
                  <Button variant="outline">
                    <Download className="h-4 w-4 mr-2" /> Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trip ID</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Emergency Type</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Distance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tripLogs.map((trip) => (
                    <TableRow key={trip.id}>
                      <TableCell className="font-medium">{trip.id}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{trip.vehicleNumber}</p>
                          <p className="text-xs text-slate-500">{trip.driver}</p>
                        </div>
                      </TableCell>
                      <TableCell>{trip.patientName}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="text-slate-600 dark:text-slate-300">{trip.pickupLocation}</p>
                          <p className="text-slate-400">→ {trip.destination}</p>
                        </div>
                      </TableCell>
                      <TableCell>{trip.emergencyType}</TableCell>
                      <TableCell>
                        {Math.round((new Date(trip.endTime).getTime() - new Date(trip.startTime).getTime()) / 60000)} min
                      </TableCell>
                      <TableCell>{trip.distance}</TableCell>
                      <TableCell>{getStatusBadge(trip.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                  <Bell className="h-5 w-5 text-amber-500" /> Alert Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: 'New Emergency Alerts', desc: 'Notify when new emergency request comes in' },
                  { label: 'Low Fuel Alerts', desc: 'Alert when fuel level drops below 25%' },
                  { label: 'Maintenance Due', desc: 'Remind about scheduled maintenance' },
                  { label: 'Driver SOS', desc: 'Emergency alerts from drivers' },
                ].map((setting, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <div>
                      <p className="font-medium text-slate-800 dark:text-white">{setting.label}</p>
                      <p className="text-xs text-slate-500">{setting.desc}</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                  <Radio className="h-5 w-5 text-blue-500" /> Dispatch Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Auto-dispatch Mode</Label>
                  <Select defaultValue="manual">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual Dispatch</SelectItem>
                      <SelectItem value="auto_nearest">Auto - Nearest Available</SelectItem>
                      <SelectItem value="auto_type">Auto - Match Ambulance Type</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Default Response Radius</Label>
                  <Select defaultValue="10">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 km</SelectItem>
                      <SelectItem value="10">10 km</SelectItem>
                      <SelectItem value="15">15 km</SelectItem>
                      <SelectItem value="20">20 km</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Emergency Hotline Number</Label>
                  <Input placeholder="+91 98765 43210" defaultValue="+91 80 1234 5678" />
                </div>
                <Button className="w-full">Save Settings</Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                  <Zap className="h-5 w-5 text-purple-500" /> Integration Settings
                </CardTitle>
                <CardDescription>Connect with external emergency services</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { name: 'GPS Tracking', provider: 'Google Maps', status: 'connected', icon: MapPinned },
                    { name: '108 Emergency', provider: 'State EMS', status: 'pending', icon: Phone },
                    { name: 'Traffic Updates', provider: 'Google Traffic', status: 'connected', icon: Route },
                  ].map((integration, idx) => (
                    <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-purple-500/10 rounded-lg">
                          <integration.icon className="h-5 w-5 text-purple-500" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-800 dark:text-white">{integration.name}</p>
                          <p className="text-xs text-slate-500">{integration.provider}</p>
                        </div>
                      </div>
                      <Badge className={integration.status === 'connected' 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : 'bg-amber-100 text-amber-700'
                      }>
                        {integration.status === 'connected' ? 'Connected' : 'Pending Setup'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Vehicle Dialog */}
      <Dialog open={showAddVehicleDialog} onOpenChange={setShowAddVehicleDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Ambulance</DialogTitle>
            <DialogDescription>Register a new ambulance to the fleet</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vehicle Number *</Label>
                <Input placeholder="KA-01-XX-1234" />
              </div>
              <div className="space-y-2">
                <Label>Ambulance Type *</Label>
                <Select defaultValue="BLS">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BLS">BLS - Basic Life Support</SelectItem>
                    <SelectItem value="ALS">ALS - Advanced Life Support</SelectItem>
                    <SelectItem value="PICU">PICU - Pediatric ICU</SelectItem>
                    <SelectItem value="NICU">NICU - Neonatal ICU</SelectItem>
                    <SelectItem value="Mortuary">Mortuary Van</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Driver Name *</Label>
                <Input placeholder="Driver name" />
              </div>
              <div className="space-y-2">
                <Label>Driver Phone *</Label>
                <Input placeholder="+91 98765 43210" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Paramedic Name</Label>
                <Input placeholder="Paramedic name (optional)" />
              </div>
              <div className="space-y-2">
                <Label>Paramedic Phone</Label>
                <Input placeholder="+91 98765 43210" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Equipment</Label>
              <Textarea placeholder="List equipment (comma separated)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddVehicleDialog(false)}>Cancel</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => {
              toast({ title: 'Vehicle Added', description: 'New ambulance added to fleet' });
              setShowAddVehicleDialog(false);
            }}>
              <Plus className="h-4 w-4 mr-2" /> Add Vehicle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HospitalLayout>
  );
};

export default HospitalAmbulance;
