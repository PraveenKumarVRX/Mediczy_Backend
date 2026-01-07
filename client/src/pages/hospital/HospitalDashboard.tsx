import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Building2, Calendar, Users, FileText, DollarSign, Clock, 
  TrendingUp, Activity, UserCheck, Pill, Bell, Settings,
  LogOut, Plus, Search, Filter, BarChart3, Download, Bed,
  Stethoscope, ClipboardList, Shield, FileHeart, FolderOpen,
  AlertCircle, CheckCircle, ArrowRight, BriefcaseMedical,
  HeartPulse, Receipt, CreditCard, UserCog, Building, FlaskConical, Scan
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import HospitalLayout from '@/components/hospital/HospitalLayout';

const HospitalDashboard = () => {
  const navigate = useNavigate();
  const [hospitalData, setHospitalData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const token = localStorage.getItem('hospitalToken');
    const data = localStorage.getItem('hospitalData');
    
    if (!token) {
      navigate('/hospital/login');
      return;
    }
    
    if (data) {
      setHospitalData(JSON.parse(data));
    }
    
    setLoading(false);
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('hospitalToken');
    localStorage.removeItem('hospitalData');
    navigate('/hospital/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Activity className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  const stats = [
    { label: 'Total Patients', value: '12,847', icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10', trend: '+12%' },
    { label: 'Today\'s Admissions', value: '47', icon: Bed, color: 'text-teal-500', bg: 'bg-teal-500/10', trend: '+8%' },
    { label: 'Active Insurance Claims', value: '234', icon: Shield, color: 'text-amber-500', bg: 'bg-amber-500/10', trend: '+15%' },
    { label: 'Today\'s Revenue', value: '₹8,45,890', icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10', trend: '+22%' },
  ];

  const quickModules = [
    { 
      title: 'Practice Management', 
      description: 'Appointments, OPD/IPD, Staff scheduling', 
      icon: BriefcaseMedical, 
      color: 'from-blue-500 to-blue-600',
      route: '/hospital/practice-management'
    },
    { 
      title: 'Insurance Billing', 
      description: 'Claims, pre-auth, settlements', 
      icon: Shield, 
      color: 'from-teal-500 to-teal-600',
      route: '/hospital/insurance-billing'
    },
    { 
      title: 'Medical Records (MRD)', 
      description: 'File management, retrieval, audit', 
      icon: FolderOpen, 
      color: 'from-purple-500 to-purple-600',
      route: '/hospital/mrd'
    },
    { 
      title: 'Electronic Health Records', 
      description: 'Patient charts, clinical docs', 
      icon: FileHeart, 
      color: 'from-emerald-500 to-emerald-600',
      route: '/hospital/ehr'
    },
    { 
      title: 'Lab Test Orders', 
      description: 'Order lab tests, manage results', 
      icon: FlaskConical, 
      color: 'from-cyan-500 to-cyan-600',
      route: '/hospital/lab-order'
    },
    { 
      title: 'Imaging Orders', 
      description: 'Order imaging tests, radiology', 
      icon: Scan, 
      color: 'from-indigo-500 to-indigo-600',
      route: '/hospital/imaging-order'
    },
    { 
      title: 'Prescription Creator', 
      description: 'Create and manage prescriptions', 
      icon: Pill, 
      color: 'from-orange-500 to-orange-600',
      route: '/hospital/prescription-creator'
    },
    { 
      title: 'Procedure Scheduler', 
      description: 'Schedule medical procedures', 
      icon: Stethoscope, 
      color: 'from-pink-500 to-pink-600',
      route: '/hospital/procedure-adder'
    },
  ];

  const recentAdmissions = [
    { id: 'ADM001', patient: 'Rajesh Kumar', age: 45, department: 'Cardiology', doctor: 'Dr. Sharma', status: 'Admitted', bed: 'ICU-05' },
    { id: 'ADM002', patient: 'Priya Singh', age: 32, department: 'Gynecology', doctor: 'Dr. Patel', status: 'Under Observation', bed: 'GYN-12' },
    { id: 'ADM003', patient: 'Amit Verma', age: 58, department: 'Neurology', doctor: 'Dr. Mehta', status: 'Surgery Scheduled', bed: 'NEURO-03' },
    { id: 'ADM004', patient: 'Neha Gupta', age: 28, department: 'Orthopedics', doctor: 'Dr. Joshi', status: 'Admitted', bed: 'ORTHO-08' },
  ];

  const pendingClaims = [
    { id: 'CLM001', patient: 'Vijay Sharma', amount: '₹1,25,000', insurer: 'Star Health', status: 'Pending Auth', days: 2 },
    { id: 'CLM002', patient: 'Meena Devi', amount: '₹85,000', insurer: 'HDFC Ergo', status: 'Documents Required', days: 5 },
    { id: 'CLM003', patient: 'Suresh Patel', amount: '₹2,50,000', insurer: 'ICICI Lombard', status: 'Under Review', days: 3 },
  ];

  const bedOccupancy = [
    { department: 'General Ward', total: 100, occupied: 78, color: 'bg-blue-500' },
    { department: 'ICU', total: 20, occupied: 18, color: 'bg-red-500' },
    { department: 'Private Rooms', total: 50, occupied: 35, color: 'bg-teal-500' },
    { department: 'Pediatric', total: 30, occupied: 22, color: 'bg-amber-500' },
  ];

  return (
    <HospitalLayout title="Dashboard" subtitle="Hospital Management Overview">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => (
          <Card key={index} className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-teal-200 dark:hover:border-teal-500/50 hover:shadow-lg hover:shadow-teal-500/5 transition-all duration-300 group">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{stat.label}</p>
                  <p className="text-3xl font-bold text-slate-800 dark:text-white">{stat.value}</p>
                  <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">{stat.trend} this month</p>
                </div>
                <div className={`${stat.bg} p-4 rounded-xl transition-all duration-300 group-hover:scale-110`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Access Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {quickModules.map((module, index) => (
          <Card 
            key={index} 
            className="cursor-pointer bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-teal-200 dark:hover:border-teal-500/50 hover:shadow-xl hover:shadow-teal-500/10 transition-all transform hover:-translate-y-1 group"
            onClick={() => navigate(module.route)}
          >
            <CardContent className="pt-6">
              <div className={`bg-gradient-to-br ${module.color} p-4 rounded-xl w-fit mb-4 shadow-lg transition-transform duration-300 group-hover:scale-110`}>
                <module.icon className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-lg font-bold mb-2 text-slate-800 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{module.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{module.description}</p>
              <Button variant="ghost" className="p-0 h-auto gap-2 text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300">
                Open Module <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Admissions */}
        <Card className="lg:col-span-2 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-slate-800 dark:text-white">Recent Admissions</CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">Latest patient admissions and bed assignments</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="gap-2 border-slate-200 dark:border-slate-700 hover:border-teal-500 dark:hover:border-teal-500" onClick={() => navigate('/hospital/patients')}>
              <Plus className="h-4 w-4" /> New Admission
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentAdmissions.map((admission) => (
                <div key={admission.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="bg-teal-500/10 dark:bg-teal-500/20 p-3 rounded-xl">
                      <Bed className="h-5 w-5 text-teal-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-white">{admission.patient}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{admission.department} • {admission.doctor}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Bed: {admission.bed}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Age: {admission.age}</p>
                    </div>
                    <Badge variant={admission.status === 'Admitted' ? 'default' : admission.status === 'Surgery Scheduled' ? 'destructive' : 'secondary'}>
                      {admission.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Bed Occupancy */}
        <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-slate-800 dark:text-white">Bed Occupancy</CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">Real-time bed availability</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {bedOccupancy.map((ward, index) => (
              <div key={index}>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{ward.department}</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">{ward.occupied}/{ward.total}</span>
                </div>
                <Progress value={(ward.occupied / ward.total) * 100} className={`h-2`} />
              </div>
            ))}
            <Button variant="outline" className="w-full gap-2 mt-4 border-slate-200 dark:border-slate-700 hover:border-teal-500 dark:hover:border-teal-500" onClick={() => navigate('/hospital/beds')}>
              <Bed className="h-4 w-4" />
              Manage Beds
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Insurance Claims Section */}
      <Card className="mt-6 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-slate-800 dark:text-white">Pending Insurance Claims</CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">Claims requiring attention</CardDescription>
          </div>
          <Button onClick={() => navigate('/hospital/insurance-billing')} className="gap-2 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg shadow-teal-500/30 border-0">
            <Shield className="h-4 w-4" /> View All Claims
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {pendingClaims.map((claim) => (
              <div key={claim.id} className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl hover:shadow-md hover:border-teal-200 dark:hover:border-teal-500/50 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <Badge variant="outline" className="border-slate-300 dark:border-slate-600">{claim.id}</Badge>
                  <Badge variant={claim.status === 'Pending Auth' ? 'destructive' : 'secondary'}>
                    {claim.status}
                  </Badge>
                </div>
                <p className="font-semibold text-slate-800 dark:text-white">{claim.patient}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{claim.insurer}</p>
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{claim.amount}</span>
                  <span className="text-sm text-amber-600 dark:text-amber-400">{claim.days} days pending</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg shadow-blue-500/30">
          <CardContent className="pt-6 text-center">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-80" />
            <p className="text-2xl font-bold">156</p>
            <p className="text-sm opacity-80">Today's OPD</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-teal-500 to-teal-600 text-white border-0 shadow-lg shadow-teal-500/30">
          <CardContent className="pt-6 text-center">
            <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-80" />
            <p className="text-2xl font-bold">42</p>
            <p className="text-sm opacity-80">Active Doctors</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg shadow-purple-500/30">
          <CardContent className="pt-6 text-center">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-80" />
            <p className="text-2xl font-bold">89</p>
            <p className="text-sm opacity-80">Records Updated</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0 shadow-lg shadow-emerald-500/30">
          <CardContent className="pt-6 text-center">
            <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-80" />
            <p className="text-2xl font-bold">234</p>
            <p className="text-sm opacity-80">Invoices Generated</p>
          </CardContent>
        </Card>
      </div>
    </HospitalLayout>
  );
};

export default HospitalDashboard;
