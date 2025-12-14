import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import MainLayout from '@/components/layout/MainLayoutdoctor';
import { 
  Activity, 
  Heart, 
  Droplet, 
  Wind, 
  Thermometer, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  Search,
  Filter,
  Download,
  Bell,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Watch,
  Radio,
  Battery,
  Wifi,
  AlertCircle,
  Eye,
  BarChart3,
  LineChart,
  RefreshCw
} from 'lucide-react';
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import api from '@/utils/api';

interface VitalReading {
  timestamp: string;
  heartRate: number;
  bloodPressureSystolic: number;
  bloodPressureDiastolic: number;
  oxygenSaturation: number;
  temperature: number;
  steps: number;
  sleepHours: number;
  glucoseLevel?: number;
}

interface HealthDevice {
  id: string;
  type: 'watch' | 'band' | 'ring' | 'bp_monitor' | 'glucometer' | 'oximeter';
  name: string;
  batteryLevel: number;
  lastSync: string;
  status: 'connected' | 'disconnected' | 'low_battery';
}

interface MonitoredPatient {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  email: string;
  location: string;
  membershipPlan: string;
  devices: HealthDevice[];
  latestVitals: VitalReading;
  vitalsHistory: VitalReading[];
  alerts: Alert[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  lastCheckIn: string;
  nextAppointment?: string;
}

interface Alert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

const HealthMonitoringDashboard = () => {
  const [patients, setPatients] = useState<MonitoredPatient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<MonitoredPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<MonitoredPatient | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [loading, setLoading] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  useEffect(() => {
    fetchMonitoredPatients();
    // Set up auto-refresh every 30 seconds
    const interval = setInterval(fetchMonitoredPatients, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    filterPatients();
  }, [patients, searchQuery, riskFilter]);

  const fetchMonitoredPatients = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('doctorToken');
      const { data } = await api.get('/doctor/health-monitoring/patients', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPatients(data.patients || []);
    } catch (error) {
      // Fallback to sample data
      setPatients(generateSamplePatients());
    } finally {
      setLoading(false);
    }
  };

  const filterPatients = () => {
    let filtered = patients;

    if (searchQuery) {
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.phone.includes(searchQuery) ||
        p.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (riskFilter !== 'all') {
      filtered = filtered.filter(p => p.riskLevel === riskFilter);
    }

    setFilteredPatients(filtered);
  };

  const generateSamplePatients = (): MonitoredPatient[] => {
    return [
      {
        id: 'p1',
        name: 'Rajesh Kumar',
        age: 58,
        gender: 'Male',
        phone: '+91 98765 43210',
        email: 'rajesh.k@email.com',
        location: 'Mumbai, Maharashtra',
        membershipPlan: 'Corporate Wellness Plan',
        devices: [
          { id: 'd1', type: 'watch', name: 'Health Watch Pro', batteryLevel: 78, lastSync: '2 min ago', status: 'connected' },
          { id: 'd2', type: 'bp_monitor', name: 'BP Monitor', batteryLevel: 45, lastSync: '5 min ago', status: 'low_battery' },
          { id: 'd3', type: 'glucometer', name: 'Glucometer', batteryLevel: 92, lastSync: '1 hour ago', status: 'connected' }
        ],
        latestVitals: {
          timestamp: new Date().toISOString(),
          heartRate: 88,
          bloodPressureSystolic: 145,
          bloodPressureDiastolic: 92,
          oxygenSaturation: 96,
          temperature: 98.4,
          steps: 4523,
          sleepHours: 6.5,
          glucoseLevel: 142
        },
        vitalsHistory: generateVitalsHistory(24),
        alerts: [
          { id: 'a1', type: 'warning', message: 'Blood pressure elevated - 145/92 mmHg', timestamp: '15 min ago', acknowledged: false },
          { id: 'a2', type: 'warning', message: 'Glucose level slightly high - 142 mg/dL', timestamp: '2 hours ago', acknowledged: false }
        ],
        riskLevel: 'medium',
        lastCheckIn: '2 minutes ago',
        nextAppointment: '2024-11-28 10:00 AM'
      },
      {
        id: 'p2',
        name: 'Priya Sharma',
        age: 34,
        gender: 'Female',
        phone: '+91 87654 32109',
        email: 'priya.s@email.com',
        location: 'Delhi, NCR',
        membershipPlan: 'Premium Family Plan',
        devices: [
          { id: 'd4', type: 'band', name: 'Health Band', batteryLevel: 65, lastSync: '10 min ago', status: 'connected' },
          { id: 'd5', type: 'oximeter', name: 'Pulse Oximeter', batteryLevel: 88, lastSync: '1 hour ago', status: 'connected' }
        ],
        latestVitals: {
          timestamp: new Date().toISOString(),
          heartRate: 72,
          bloodPressureSystolic: 118,
          bloodPressureDiastolic: 78,
          oxygenSaturation: 98,
          temperature: 98.1,
          steps: 7842,
          sleepHours: 7.8
        },
        vitalsHistory: generateVitalsHistory(24),
        alerts: [],
        riskLevel: 'low',
        lastCheckIn: '10 minutes ago',
        nextAppointment: '2024-12-01 03:00 PM'
      },
      {
        id: 'p3',
        name: 'Amit Patel',
        age: 67,
        gender: 'Male',
        phone: '+91 76543 21098',
        email: 'amit.p@email.com',
        location: 'Bangalore, Karnataka',
        membershipPlan: 'Senior Citizen Care',
        devices: [
          { id: 'd6', type: 'watch', name: 'Health Watch', batteryLevel: 15, lastSync: '45 min ago', status: 'low_battery' },
          { id: 'd7', type: 'bp_monitor', name: 'BP Monitor Pro', batteryLevel: 72, lastSync: '30 min ago', status: 'connected' }
        ],
        latestVitals: {
          timestamp: new Date().toISOString(),
          heartRate: 102,
          bloodPressureSystolic: 168,
          bloodPressureDiastolic: 105,
          oxygenSaturation: 92,
          temperature: 99.2,
          steps: 1234,
          sleepHours: 5.2
        },
        vitalsHistory: generateVitalsHistory(24),
        alerts: [
          { id: 'a3', type: 'critical', message: 'Heart rate elevated - 102 bpm', timestamp: '5 min ago', acknowledged: false },
          { id: 'a4', type: 'critical', message: 'Blood pressure critically high - 168/105 mmHg', timestamp: '5 min ago', acknowledged: false },
          { id: 'a5', type: 'warning', message: 'Low oxygen saturation - 92%', timestamp: '10 min ago', acknowledged: false },
          { id: 'a6', type: 'info', message: 'Device battery low - Health Watch', timestamp: '45 min ago', acknowledged: true }
        ],
        riskLevel: 'critical',
        lastCheckIn: '5 minutes ago'
      },
      {
        id: 'p4',
        name: 'Sneha Reddy',
        age: 45,
        gender: 'Female',
        phone: '+91 65432 10987',
        email: 'sneha.r@email.com',
        location: 'Hyderabad, Telangana',
        membershipPlan: 'Premium Family Plan',
        devices: [
          { id: 'd8', type: 'ring', name: 'Health Ring', batteryLevel: 85, lastSync: '20 min ago', status: 'connected' },
          { id: 'd9', type: 'bp_monitor', name: 'BP Monitor', batteryLevel: 56, lastSync: '25 min ago', status: 'connected' }
        ],
        latestVitals: {
          timestamp: new Date().toISOString(),
          heartRate: 78,
          bloodPressureSystolic: 132,
          bloodPressureDiastolic: 85,
          oxygenSaturation: 97,
          temperature: 98.3,
          steps: 5621,
          sleepHours: 7.2
        },
        vitalsHistory: generateVitalsHistory(24),
        alerts: [
          { id: 'a7', type: 'warning', message: 'Blood pressure slightly elevated - 132/85 mmHg', timestamp: '25 min ago', acknowledged: false }
        ],
        riskLevel: 'medium',
        lastCheckIn: '20 minutes ago',
        nextAppointment: '2024-11-30 11:30 AM'
      }
    ];
  };

  const generateVitalsHistory = (hours: number): VitalReading[] => {
    const history: VitalReading[] = [];
    const now = new Date();
    
    for (let i = hours; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
      history.push({
        timestamp: timestamp.toISOString(),
        heartRate: 70 + Math.random() * 20,
        bloodPressureSystolic: 115 + Math.random() * 20,
        bloodPressureDiastolic: 75 + Math.random() * 15,
        oxygenSaturation: 95 + Math.random() * 4,
        temperature: 97.5 + Math.random() * 1.5,
        steps: Math.floor(Math.random() * 1000),
        sleepHours: i > 18 ? 7 + Math.random() * 2 : 0
      });
    }
    
    return history;
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'bg-green-500/10 text-green-700 border-green-500/20';
      case 'medium': return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20';
      case 'high': return 'bg-orange-500/10 text-orange-700 border-orange-500/20';
      case 'critical': return 'bg-red-500/10 text-red-700 border-red-500/20';
      default: return 'bg-gray-500/10 text-gray-700 border-gray-500/20';
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'watch': return <Watch className="h-4 w-4" />;
      case 'band': return <Radio className="h-4 w-4" />;
      case 'ring': return <Radio className="h-4 w-4" />;
      case 'bp_monitor': return <Activity className="h-4 w-4" />;
      case 'glucometer': return <Droplet className="h-4 w-4" />;
      case 'oximeter': return <Wind className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const getVitalStatus = (vital: string, value: number) => {
    switch (vital) {
      case 'heartRate':
        if (value < 60 || value > 100) return { status: 'warning', color: 'text-orange-600' };
        if (value < 50 || value > 110) return { status: 'critical', color: 'text-red-600' };
        return { status: 'normal', color: 'text-green-600' };
      case 'bloodPressure':
        if (value > 140 || value < 90) return { status: 'warning', color: 'text-orange-600' };
        if (value > 160 || value < 80) return { status: 'critical', color: 'text-red-600' };
        return { status: 'normal', color: 'text-green-600' };
      case 'oxygenSaturation':
        if (value < 95) return { status: 'warning', color: 'text-orange-600' };
        if (value < 90) return { status: 'critical', color: 'text-red-600' };
        return { status: 'normal', color: 'text-green-600' };
      case 'temperature':
        if (value > 99 || value < 97) return { status: 'warning', color: 'text-orange-600' };
        if (value > 100.4 || value < 95) return { status: 'critical', color: 'text-red-600' };
        return { status: 'normal', color: 'text-green-600' };
      default:
        return { status: 'normal', color: 'text-green-600' };
    }
  };

  const viewPatientDetails = (patient: MonitoredPatient) => {
    setSelectedPatient(patient);
    setShowDetailDialog(true);
  };

  const acknowledgeAlert = async (alertId: string) => {
    if (selectedPatient) {
      const updatedAlerts = selectedPatient.alerts.map(alert =>
        alert.id === alertId ? { ...alert, acknowledged: true } : alert
      );
      setSelectedPatient({ ...selectedPatient, alerts: updatedAlerts });
    }
  };

  const formatChartData = (history: VitalReading[]) => {
    return history.map(reading => ({
      time: new Date(reading.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      hr: Math.round(reading.heartRate),
      bp: Math.round(reading.bloodPressureSystolic),
      spo2: Math.round(reading.oxygenSaturation),
      temp: reading.temperature.toFixed(1)
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Activity className="h-8 w-8 text-blue-600" />
                Remote Health Monitoring
              </h1>
              <p className="text-muted-foreground">Real-time patient vitals and health tracking</p>
            </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={fetchMonitoredPatients} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
            <Button>
              <Bell className="h-4 w-4 mr-2" />
              Alerts ({patients.reduce((sum, p) => sum + p.alerts.filter(a => !a.acknowledged).length, 0)})
            </Button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Monitored</p>
                  <p className="text-3xl font-bold">{patients.length}</p>
                </div>
                <User className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Critical Alerts</p>
                  <p className="text-3xl font-bold text-red-600">
                    {patients.reduce((sum, p) => sum + p.alerts.filter(a => a.type === 'critical' && !a.acknowledged).length, 0)}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">High Risk</p>
                  <p className="text-3xl font-bold text-orange-600">
                    {patients.filter(p => p.riskLevel === 'high' || p.riskLevel === 'critical').length}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Devices</p>
                  <p className="text-3xl font-bold text-green-600">
                    {patients.reduce((sum, p) => sum + p.devices.filter(d => d.status === 'connected').length, 0)}
                  </p>
                </div>
                <Wifi className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search patients by name, phone, or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger className="w-full lg:w-[200px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Risk Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Risk Levels</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Select value={timeRange} onValueChange={(v) => setTimeRange(v as '24h' | '7d' | '30d')}>
                <SelectTrigger className="w-full lg:w-[150px]">
                  <Clock className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24 Hours</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Patients Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredPatients.map((patient) => (
            <Card key={patient.id} className={`border-2 ${patient.riskLevel === 'critical' ? 'border-red-300' : patient.riskLevel === 'high' ? 'border-orange-300' : 'border-border'}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                      {patient.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{patient.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{patient.age} years • {patient.gender}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={getRiskColor(patient.riskLevel)}>
                    {patient.riskLevel.toUpperCase()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Contact Info */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">{patient.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground truncate">{patient.location}</span>
                  </div>
                </div>

                {/* Devices */}
                <div className="flex flex-wrap gap-2">
                  {patient.devices.map((device) => (
                    <Badge key={device.id} variant="outline" className="text-xs">
                      {getDeviceIcon(device.type)}
                      <span className="ml-1">{device.name}</span>
                      <Battery className={`h-3 w-3 ml-1 ${device.batteryLevel < 20 ? 'text-red-500' : 'text-green-500'}`} />
                      <span className="ml-0.5">{device.batteryLevel}%</span>
                    </Badge>
                  ))}
                </div>

                {/* Latest Vitals */}
                <div className="grid grid-cols-4 gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="text-center">
                    <Heart className={`h-5 w-5 mx-auto mb-1 ${getVitalStatus('heartRate', patient.latestVitals.heartRate).color}`} />
                    <p className="text-xs text-muted-foreground">Heart Rate</p>
                    <p className="text-sm font-bold">{Math.round(patient.latestVitals.heartRate)}</p>
                    <p className="text-xs text-muted-foreground">bpm</p>
                  </div>
                  <div className="text-center">
                    <Activity className={`h-5 w-5 mx-auto mb-1 ${getVitalStatus('bloodPressure', patient.latestVitals.bloodPressureSystolic).color}`} />
                    <p className="text-xs text-muted-foreground">BP</p>
                    <p className="text-sm font-bold">{Math.round(patient.latestVitals.bloodPressureSystolic)}/{Math.round(patient.latestVitals.bloodPressureDiastolic)}</p>
                    <p className="text-xs text-muted-foreground">mmHg</p>
                  </div>
                  <div className="text-center">
                    <Wind className={`h-5 w-5 mx-auto mb-1 ${getVitalStatus('oxygenSaturation', patient.latestVitals.oxygenSaturation).color}`} />
                    <p className="text-xs text-muted-foreground">SpO2</p>
                    <p className="text-sm font-bold">{Math.round(patient.latestVitals.oxygenSaturation)}</p>
                    <p className="text-xs text-muted-foreground">%</p>
                  </div>
                  <div className="text-center">
                    <Thermometer className={`h-5 w-5 mx-auto mb-1 ${getVitalStatus('temperature', patient.latestVitals.temperature).color}`} />
                    <p className="text-xs text-muted-foreground">Temp</p>
                    <p className="text-sm font-bold">{patient.latestVitals.temperature.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">°F</p>
                  </div>
                </div>

                {/* Alerts */}
                {patient.alerts.filter(a => !a.acknowledged).length > 0 && (
                  <div className="space-y-1">
                    {patient.alerts.filter(a => !a.acknowledged).slice(0, 2).map((alert) => (
                      <div key={alert.id} className={`flex items-start gap-2 p-2 rounded text-xs ${alert.type === 'critical' ? 'bg-red-50 text-red-800' : alert.type === 'warning' ? 'bg-yellow-50 text-yellow-800' : 'bg-blue-50 text-blue-800'}`}>
                        <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span className="flex-1">{alert.message}</span>
                      </div>
                    ))}
                    {patient.alerts.filter(a => !a.acknowledged).length > 2 && (
                      <p className="text-xs text-muted-foreground text-center">
                        +{patient.alerts.filter(a => !a.acknowledged).length - 2} more alerts
                      </p>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => viewPatientDetails(patient)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </Button>
                  <Button className="flex-1">
                    <Phone className="h-4 w-4 mr-2" />
                    Contact
                  </Button>
                </div>

                {/* Last Check-in */}
                <p className="text-xs text-center text-muted-foreground">
                  Last check-in: {patient.lastCheckIn}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredPatients.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No patients found</h3>
              <p className="text-muted-foreground">
                {searchQuery || riskFilter !== 'all' 
                  ? 'No patients match your search criteria.' 
                  : 'No patients are currently being monitored.'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Patient Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                {selectedPatient?.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <div>{selectedPatient?.name}</div>
                <p className="text-sm font-normal text-muted-foreground">
                  {selectedPatient?.age} years • {selectedPatient?.gender} • {selectedPatient?.membershipPlan}
                </p>
              </div>
              <Badge variant="outline" className={`ml-auto ${getRiskColor(selectedPatient?.riskLevel || 'low')}`}>
                {selectedPatient?.riskLevel.toUpperCase()}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {selectedPatient && (
            <Tabs defaultValue="vitals" className="mt-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="vitals">Vitals</TabsTrigger>
                <TabsTrigger value="trends">Trends</TabsTrigger>
                <TabsTrigger value="devices">Devices</TabsTrigger>
                <TabsTrigger value="alerts">Alerts</TabsTrigger>
              </TabsList>

              <TabsContent value="vitals" className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <Heart className={`h-8 w-8 mx-auto mb-2 ${getVitalStatus('heartRate', selectedPatient.latestVitals.heartRate).color}`} />
                      <p className="text-sm text-muted-foreground">Heart Rate</p>
                      <p className="text-2xl font-bold">{Math.round(selectedPatient.latestVitals.heartRate)}</p>
                      <p className="text-xs text-muted-foreground">bpm</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <Activity className={`h-8 w-8 mx-auto mb-2 ${getVitalStatus('bloodPressure', selectedPatient.latestVitals.bloodPressureSystolic).color}`} />
                      <p className="text-sm text-muted-foreground">Blood Pressure</p>
                      <p className="text-2xl font-bold">{Math.round(selectedPatient.latestVitals.bloodPressureSystolic)}/{Math.round(selectedPatient.latestVitals.bloodPressureDiastolic)}</p>
                      <p className="text-xs text-muted-foreground">mmHg</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <Wind className={`h-8 w-8 mx-auto mb-2 ${getVitalStatus('oxygenSaturation', selectedPatient.latestVitals.oxygenSaturation).color}`} />
                      <p className="text-sm text-muted-foreground">SpO2</p>
                      <p className="text-2xl font-bold">{Math.round(selectedPatient.latestVitals.oxygenSaturation)}</p>
                      <p className="text-xs text-muted-foreground">%</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <Thermometer className={`h-8 w-8 mx-auto mb-2 ${getVitalStatus('temperature', selectedPatient.latestVitals.temperature).color}`} />
                      <p className="text-sm text-muted-foreground">Temperature</p>
                      <p className="text-2xl font-bold">{selectedPatient.latestVitals.temperature.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">°F</p>
                    </CardContent>
                  </Card>
                </div>

                {selectedPatient.latestVitals.glucoseLevel && (
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Droplet className="h-6 w-6 text-blue-600" />
                          <div>
                            <p className="text-sm text-muted-foreground">Glucose Level</p>
                            <p className="text-2xl font-bold">{selectedPatient.latestVitals.glucoseLevel}</p>
                            <p className="text-xs text-muted-foreground">mg/dL</p>
                          </div>
                        </div>
                        <Badge variant="outline" className={selectedPatient.latestVitals.glucoseLevel > 140 ? 'bg-orange-500/10 text-orange-700' : 'bg-green-500/10 text-green-700'}>
                          {selectedPatient.latestVitals.glucoseLevel > 140 ? 'Elevated' : 'Normal'}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Activity className="h-5 w-5 text-purple-600" />
                        <p className="font-semibold">Activity</p>
                      </div>
                      <p className="text-3xl font-bold">{selectedPatient.latestVitals.steps.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">steps today</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-5 w-5 text-indigo-600" />
                        <p className="font-semibold">Sleep</p>
                      </div>
                      <p className="text-3xl font-bold">{selectedPatient.latestVitals.sleepHours.toFixed(1)}</p>
                      <p className="text-sm text-muted-foreground">hours last night</p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="trends" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Heart Rate Trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={formatChartData(selectedPatient.vitalsHistory)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                        <YAxis domain={[50, 120]} />
                        <Tooltip />
                        <Area type="monotone" dataKey="hr" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Blood Pressure Trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <RechartsLineChart data={formatChartData(selectedPatient.vitalsHistory)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                        <YAxis domain={[60, 180]} />
                        <Tooltip />
                        <Line type="monotone" dataKey="bp" stroke="#ef4444" strokeWidth={2} dot={false} />
                      </RechartsLineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Oxygen Saturation Trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={formatChartData(selectedPatient.vitalsHistory)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                        <YAxis domain={[85, 100]} />
                        <Tooltip />
                        <Area type="monotone" dataKey="spo2" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="devices" className="space-y-4">
                {selectedPatient.devices.map((device) => (
                  <Card key={device.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-blue-500/10">
                            {getDeviceIcon(device.type)}
                          </div>
                          <div>
                            <p className="font-semibold">{device.name}</p>
                            <p className="text-sm text-muted-foreground">{device.type.replace('_', ' ').toUpperCase()}</p>
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <Badge variant="outline" className={device.status === 'connected' ? 'bg-green-500/10 text-green-700' : device.status === 'low_battery' ? 'bg-orange-500/10 text-orange-700' : 'bg-red-500/10 text-red-700'}>
                            {device.status.replace('_', ' ')}
                          </Badge>
                          <div className="flex items-center gap-1 text-sm">
                            <Battery className={`h-4 w-4 ${device.batteryLevel < 20 ? 'text-red-500' : 'text-green-500'}`} />
                            <span>{device.batteryLevel}%</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Synced: {device.lastSync}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="alerts" className="space-y-2">
                {selectedPatient.alerts.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                      <h3 className="text-lg font-semibold mb-2">No Active Alerts</h3>
                      <p className="text-muted-foreground">All vitals are within normal range</p>
                    </CardContent>
                  </Card>
                ) : (
                  selectedPatient.alerts.map((alert) => (
                    <Card key={alert.id} className={alert.acknowledged ? 'opacity-50' : ''}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <div className={`p-2 rounded-lg ${alert.type === 'critical' ? 'bg-red-500/10' : alert.type === 'warning' ? 'bg-yellow-500/10' : 'bg-blue-500/10'}`}>
                              <AlertCircle className={`h-5 w-5 ${alert.type === 'critical' ? 'text-red-600' : alert.type === 'warning' ? 'text-yellow-600' : 'text-blue-600'}`} />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className={alert.type === 'critical' ? 'bg-red-500/10 text-red-700' : alert.type === 'warning' ? 'bg-yellow-500/10 text-yellow-700' : 'bg-blue-500/10 text-blue-700'}>
                                  {alert.type.toUpperCase()}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{alert.timestamp}</span>
                                {alert.acknowledged && (
                                  <Badge variant="outline" className="bg-gray-500/10 text-gray-700">
                                    Acknowledged
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm">{alert.message}</p>
                            </div>
                          </div>
                          {!alert.acknowledged && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => acknowledgeAlert(alert.id)}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Acknowledge
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default HealthMonitoringDashboard;
