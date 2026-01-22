import { useState, useEffect } from 'react';
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { 
  Activity, 
  Heart, 
  Droplets, 
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
  RefreshCw,
  Eye,
  Phone,
  Calendar,
  Users,
  Loader2
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/utils/api';
import { cn } from '@/lib/utils';

interface PatientVitals {
  id: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  heartRate: number;
  bloodPressure: string;
  oxygenSaturation: number;
  temperature: number;
  lastUpdated: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  alerts: string[];
}

const HealthMonitoringDashboardWrapper = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');

  const { data: patientsData, isLoading, refetch } = useQuery({
    queryKey: ['health-monitoring-patients'],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/health-monitoring/patients');
        const rawPatients = response.data.patients || [];
        return rawPatients.map((patient: any) => {
          const name =
            patient.patientName ||
            patient.name ||
            `${patient.firstName || ''} ${patient.lastName || ''}`.trim() ||
            'Patient';
          const riskLevel =
            patient.riskLevel ||
            (patient.healthStatus === 'critical' ? 'critical' : null) ||
            (patient.healthStatus === 'high' ? 'high' : null) ||
            (patient.healthStatus === 'medium' ? 'medium' : null) ||
            'low';

          return {
            id: patient.id,
            patientName: name,
            patientAge: patient.patientAge ?? patient.age ?? null,
            patientGender: patient.patientGender ?? patient.gender ?? 'Unknown',
            heartRate: patient.heartRate ?? patient.vitals?.heartRate ?? 0,
            bloodPressure: patient.bloodPressure ?? patient.vitals?.bloodPressure ?? '-',
            oxygenSaturation: patient.oxygenSaturation ?? patient.vitals?.oxygenSaturation ?? 0,
            temperature: patient.temperature ?? patient.vitals?.temperature ?? 0,
            lastUpdated: patient.lastUpdated ?? patient.lastReading ?? patient.updatedAt ?? new Date().toISOString(),
            riskLevel,
            alerts: patient.alerts ?? []
          };
        });
      } catch (err) {
        // Return sample data for demonstration
        return generateSamplePatients();
      }
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const patients = patientsData || [];

  const filteredPatients = patients.filter((p: PatientVitals) => {
    const matchesSearch = p.patientName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRisk = riskFilter === 'all' || p.riskLevel === riskFilter;
    return matchesSearch && matchesRisk;
  });

  const stats = {
    total: patients.length,
    critical: patients.filter((p: PatientVitals) => p.riskLevel === 'critical').length,
    high: patients.filter((p: PatientVitals) => p.riskLevel === 'high').length,
    normal: patients.filter((p: PatientVitals) => p.riskLevel === 'low' || p.riskLevel === 'medium').length,
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800';
      case 'high': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800';
      default: return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800';
    }
  };

  const getVitalStatus = (type: string, value: number) => {
    switch (type) {
      case 'heartRate':
        if (value < 60 || value > 100) return 'text-red-500';
        return 'text-green-500';
      case 'oxygen':
        if (value < 95) return 'text-red-500';
        return 'text-green-500';
      case 'temperature':
        if (value < 36 || value > 37.5) return 'text-orange-500';
        return 'text-green-500';
      default:
        return 'text-foreground';
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Activity className="h-8 w-8 text-teal-500" />
              Health Monitoring
            </h1>
            <p className="text-muted-foreground mt-1">Real-time patient vitals & health tracking</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-xl bg-blue-500/10">
                  <Users className="h-5 w-5 text-blue-500" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Monitored</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-xl bg-red-500/10">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.critical}</p>
                <p className="text-xs text-muted-foreground">Critical</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-xl bg-orange-500/10">
                  <Activity className="h-5 w-5 text-orange-500" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.high}</p>
                <p className="text-xs text-muted-foreground">High Risk</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-xl bg-green-500/10">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.normal}</p>
                <p className="text-xs text-muted-foreground">Normal</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search patients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            {['all', 'critical', 'high', 'medium', 'low'].map((filter) => (
              <Button
                key={filter}
                variant={riskFilter === filter ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRiskFilter(filter)}
                className="capitalize"
              >
                {filter === 'all' ? 'All' : filter}
              </Button>
            ))}
          </div>
        </div>

        {/* Patients Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
          </div>
        ) : filteredPatients.length === 0 ? (
          <Card className="bg-white dark:bg-slate-800/50">
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center">
                <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No patients found</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPatients.map((patient: PatientVitals) => (
              <Card 
                key={patient.id} 
                className={cn(
                  "bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:shadow-lg transition-all duration-300",
                  patient.riskLevel === 'critical' && "border-red-300 dark:border-red-700"
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-gradient-to-br from-teal-500 to-teal-600 text-white">
                          {patient.patientName.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-base">{patient.patientName}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {patient.patientAge} yrs • {patient.patientGender}
                        </p>
                      </div>
                    </div>
                    <Badge className={cn("border", getRiskColor(patient.riskLevel))}>
                      {patient.riskLevel}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Vitals Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                      <div className="flex items-center gap-2 mb-1">
                        <Heart className="h-4 w-4 text-red-500" />
                        <span className="text-xs text-muted-foreground">Heart Rate</span>
                      </div>
                      <p className={cn("text-lg font-semibold", getVitalStatus('heartRate', patient.heartRate))}>
                        {patient.heartRate} <span className="text-xs font-normal">bpm</span>
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                      <div className="flex items-center gap-2 mb-1">
                        <Activity className="h-4 w-4 text-blue-500" />
                        <span className="text-xs text-muted-foreground">BP</span>
                      </div>
                      <p className="text-lg font-semibold text-foreground">
                        {patient.bloodPressure}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                      <div className="flex items-center gap-2 mb-1">
                        <Droplets className="h-4 w-4 text-cyan-500" />
                        <span className="text-xs text-muted-foreground">SpO2</span>
                      </div>
                      <p className={cn("text-lg font-semibold", getVitalStatus('oxygen', patient.oxygenSaturation))}>
                        {patient.oxygenSaturation}%
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                      <div className="flex items-center gap-2 mb-1">
                        <Thermometer className="h-4 w-4 text-orange-500" />
                        <span className="text-xs text-muted-foreground">Temp</span>
                      </div>
                      <p className={cn("text-lg font-semibold", getVitalStatus('temperature', patient.temperature))}>
                        {patient.temperature}°C
                      </p>
                    </div>
                  </div>

                  {/* Alerts */}
                  {patient.alerts && patient.alerts.length > 0 && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5" />
                        <div className="text-xs text-red-700 dark:text-red-400">
                          {patient.alerts.join(', ')}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {patient.lastUpdated}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Phone className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
};

// Generate sample patients for demonstration
function generateSamplePatients(): PatientVitals[] {
  return [
    {
      id: '1',
      patientName: 'Rahul Sharma',
      patientAge: 45,
      patientGender: 'Male',
      heartRate: 110,
      bloodPressure: '150/95',
      oxygenSaturation: 94,
      temperature: 37.8,
      lastUpdated: '2 min ago',
      riskLevel: 'critical',
      alerts: ['High BP', 'Elevated HR']
    },
    {
      id: '2',
      patientName: 'Priya Patel',
      patientAge: 32,
      patientGender: 'Female',
      heartRate: 75,
      bloodPressure: '120/80',
      oxygenSaturation: 98,
      temperature: 36.6,
      lastUpdated: '5 min ago',
      riskLevel: 'low',
      alerts: []
    },
    {
      id: '3',
      patientName: 'Amit Kumar',
      patientAge: 58,
      patientGender: 'Male',
      heartRate: 88,
      bloodPressure: '140/90',
      oxygenSaturation: 96,
      temperature: 37.2,
      lastUpdated: '1 min ago',
      riskLevel: 'high',
      alerts: ['Borderline BP']
    },
    {
      id: '4',
      patientName: 'Sneha Reddy',
      patientAge: 28,
      patientGender: 'Female',
      heartRate: 72,
      bloodPressure: '115/75',
      oxygenSaturation: 99,
      temperature: 36.4,
      lastUpdated: '3 min ago',
      riskLevel: 'low',
      alerts: []
    },
    {
      id: '5',
      patientName: 'Vijay Singh',
      patientAge: 62,
      patientGender: 'Male',
      heartRate: 92,
      bloodPressure: '145/92',
      oxygenSaturation: 93,
      temperature: 37.5,
      lastUpdated: '1 min ago',
      riskLevel: 'critical',
      alerts: ['Low SpO2', 'High BP']
    },
    {
      id: '6',
      patientName: 'Meera Joshi',
      patientAge: 40,
      patientGender: 'Female',
      heartRate: 80,
      bloodPressure: '130/85',
      oxygenSaturation: 97,
      temperature: 36.8,
      lastUpdated: '8 min ago',
      riskLevel: 'medium',
      alerts: []
    }
  ];
}

export default HealthMonitoringDashboardWrapper;
