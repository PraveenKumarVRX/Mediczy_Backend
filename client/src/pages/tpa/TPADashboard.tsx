import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import TPASidebar from '@/components/tpa/TPASidebar';
import {
  Shield,
  Building2,
  FileText,
  Users,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  LogOut,
  Activity,
  DollarSign,
  Hospital,
  BarChart3,
  User,
  Settings,
  Bell,
  ChevronDown
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import api from '@/utils/api';

interface TPAStats {
  totalClaims: number;
  pendingClaims: number;
  approvedClaims: number;
  rejectedClaims: number;
  totalCorporates: number;
  activePolicies: number;
  avgProcessingTime: string;
  monthlyRevenue: number;
}

const TPADashboard = () => {
  const navigate = useNavigate();
  const [tpaData, setTpaData] = useState<any>(null);
  const [stats, setStats] = useState<TPAStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  console.log('🏥 TPADashboard component mounted');

  useEffect(() => {
    console.log('🔐 TPADashboard useEffect - checking authentication...');
    const token = localStorage.getItem('tpaToken');
    const userType = localStorage.getItem('userType');
    console.log('🔍 TPADashboard auth check:', { 
      tpaToken: token ? 'EXISTS' : 'MISSING',
      userType,
      allKeys: Object.keys(localStorage)
    });
    
    if (!token) {
      console.log('❌ No TPA token found, redirecting to /tpa/login');
      navigate('/tpa/login');
      return;
    }
    
    console.log('✅ TPA token found, loading dashboard...');

    // Get TPA data from localStorage
    const storedData = localStorage.getItem('tpaData');
    if (storedData) {
      setTpaData(JSON.parse(storedData));
    }

    // Fetch dashboard stats
    fetchDashboardStats();
  }, [navigate]);

  const fetchDashboardStats = async () => {
    try {
      const { data } = await api.get('/tpa/dashboard');
      setStats(data);
      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching TPA stats:', err);
      // Set default stats if API fails
      setStats({
        totalClaims: 0,
        pendingClaims: 0,
        approvedClaims: 0,
        rejectedClaims: 0,
        totalCorporates: 0,
        activePolicies: 0,
        avgProcessingTime: '0 days',
        monthlyRevenue: 0
      });
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('tpaToken');
    localStorage.removeItem('tpaData');
    navigate('/tpa/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <Activity className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Sidebar */}
      <TPASidebar />

      {/* Main Content */}
      <div className="flex-1 md:ml-64 overflow-auto">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Shield className="h-8 w-8 text-blue-600" />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">TPA Dashboard</h1>
                  <p className="text-sm text-gray-600">
                    {tpaData?.tpa_name || tpaData?.company || 'Third Party Administrator'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5 text-gray-600" />
                  <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
                </Button>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <User className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="hidden md:block text-left">
                        <p className="text-sm font-medium text-gray-900">
                          {tpaData?.contact_person_name || `${tpaData?.firstName} ${tpaData?.lastName}`}
                        </p>
                        <p className="text-xs text-gray-600">{tpaData?.email}</p>
                      </div>
                      <ChevronDown className="h-4 w-4 text-gray-600" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div>
                        <p className="font-medium">{tpaData?.tpa_name || 'TPA Account'}</p>
                        <p className="text-xs text-gray-500 font-normal">{tpaData?.email}</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate('/tpa/profile')}>
                      <User className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/tpa/settings')}>
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Logout</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <Alert className="mb-6 border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {/* Welcome Message */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back, {tpaData?.contact_person_name || tpaData?.firstName || 'Administrator'}!
          </h2>
          <p className="text-gray-600">
            Here's an overview of your TPA operations and claims management.
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Claims */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center space-x-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <span>Total Claims</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  {stats?.totalClaims || 0}
                </div>
                <p className="text-xs text-gray-600 mt-1">All time</p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Pending Claims */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border-yellow-200 bg-gradient-to-br from-yellow-50 to-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-yellow-600" />
                  <span>Pending Claims</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-yellow-600">
                  {stats?.pendingClaims || 0}
                </div>
                <p className="text-xs text-gray-600 mt-1">Awaiting review</p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Approved Claims */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="border-green-200 bg-gradient-to-br from-green-50 to-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Approved Claims</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {stats?.approvedClaims || 0}
                </div>
                <p className="text-xs text-gray-600 mt-1">This month</p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Active Corporates */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center space-x-2">
                  <Building2 className="h-4 w-4 text-purple-600" />
                  <span>Active Corporates</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-purple-600">
                  {stats?.totalCorporates || 0}
                </div>
                <p className="text-xs text-gray-600 mt-1">Onboarded companies</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Additional Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Processing Time */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="h-5 w-5 text-blue-600" />
                <span>Performance Metrics</span>
              </CardTitle>
              <CardDescription>Claims processing efficiency</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Avg. Processing Time</span>
                <span className="text-lg font-semibold text-blue-600">
                  {stats?.avgProcessingTime || 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Active Policies</span>
                <span className="text-lg font-semibold text-green-600">
                  {stats?.activePolicies || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Rejection Rate</span>
                <span className="text-lg font-semibold text-red-600">
                  {stats?.totalClaims > 0
                    ? `${((stats.rejectedClaims / stats.totalClaims) * 100).toFixed(1)}%`
                    : '0%'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5 text-purple-600" />
                <span>Quick Actions</span>
              </CardTitle>
              <CardDescription>Common tasks and operations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => navigate('/tpa/corporates')}
              >
                <Building2 className="h-4 w-4 mr-2" />
                Manage Corporates
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => navigate('/tpa/claims')}
              >
                <FileText className="h-4 w-4 mr-2" />
                Process Claims
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => navigate('/tpa/communication')}
              >
                <Users className="h-4 w-4 mr-2" />
                Communication Center
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => navigate('/tpa/reports')}
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                View Reports
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* License Information */}
        {tpaData?.irdai_license_number && (
          <Card className="border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5 text-blue-600" />
                <span>License Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600">IRDAI License</p>
                  <p className="font-semibold text-gray-900">{tpaData.irdai_license_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Location</p>
                  <p className="font-semibold text-gray-900">
                    {tpaData.city}, {tpaData.state}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <p className="font-semibold text-green-600">Active & Verified</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        </main>
      </div>
    </div>
  );
};

export default TPADashboard;
