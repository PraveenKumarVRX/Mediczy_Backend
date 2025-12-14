import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, UserCog, Stethoscope, Building2, Pill, FlaskConical, 
  TrendingUp, Activity, MessageSquare, DollarSign, FileText, 
  Settings, LogOut, RefreshCw, Plus, Edit, Trash2, Eye, 
  CheckCircle, XCircle, Clock, Send, Download, Upload,
  Search, Filter, MoreVertical, ShieldCheck, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import axios from 'axios';

const API_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
    : (typeof window !== 'undefined' ? window.location.origin : ''));

const ComprehensiveAdminDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Bulk upload states
  const [doctorsJson, setDoctorsJson] = useState('');
  const [labsJson, setLabsJson] = useState('');
  const [pharmaciesJson, setPharmaciesJson] = useState('');
  
  // Dialog states
  const [openDialog, setOpenDialog] = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const token = localStorage.getItem('adminToken') || localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      navigate('/admin/login');
      return;
    }
    if (activeTab === 'dashboard') fetchDashboardStats();
    else if (activeTab === 'users') fetchUsers();
    else if (activeTab === 'doctors') fetchDoctors();
  }, [activeTab, token]);

  const apiCall = async (method: string, endpoint: string, data?: any) => {
    try {
      const config = {
        headers: { Authorization: `Bearer ${token}` }
      };
      const url = `${API_URL}${endpoint}`;
      
      if (method === 'GET') {
        return await axios.get(url, config);
      } else if (method === 'POST') {
        return await axios.post(url, data, config);
      } else if (method === 'PUT') {
        return await axios.put(url, data, config);
      } else if (method === 'DELETE') {
        return await axios.delete(url, config);
      } else if (method === 'PATCH') {
        return await axios.patch(url, data, config);
      }
    } catch (error: any) {
      console.error('API Error:', error);
      throw error;
    }
  };

  // Fetch Dashboard Stats
  const fetchDashboardStats = async () => {
    setLoading(true);
    try {
      const { data } = await apiCall('GET', '/api/admin/dashboard/stats');
      setStats(data);
      toast.success('Dashboard stats loaded');
    } catch (error: any) {
      toast.error('Failed to load stats: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Fetch Users
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await apiCall('GET', '/api/admin/users');
      setUsers(data.users || data);
      toast.success(`Loaded ${data.users?.length || data.length} users`);
    } catch (error: any) {
      toast.error('Failed to load users: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Fetch Doctors
  const fetchDoctors = async () => {
    setLoading(true);
    try {
      const { data } = await apiCall('GET', '/api/doctors/admin/all');
      setDoctors(data.doctors || data);
      toast.success(`Loaded ${data.doctors?.length || data.length} doctors`);
    } catch (error: any) {
      toast.error('Failed to load doctors: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Bulk Upload Doctors
  const handleBulkUploadDoctors = async () => {
    setLoading(true);
    try {
      const doctors = JSON.parse(doctorsJson);
      const { data } = await apiCall('POST', '/api/admin/masters/doctors', { doctors });
      toast.success(data.message || 'Doctors uploaded successfully');
      setDoctorsJson('');
      setOpenDialog('');
      if (activeTab === 'doctors') fetchDoctors();
    } catch (error: any) {
      toast.error('Upload failed: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Bulk Upload Labs
  const handleBulkUploadLabs = async () => {
    setLoading(true);
    try {
      const labs = JSON.parse(labsJson);
      const { data } = await apiCall('POST', '/api/admin/masters/labs', { labs });
      toast.success(data.message || 'Labs uploaded successfully');
      setLabsJson('');
      setOpenDialog('');
    } catch (error: any) {
      toast.error('Upload failed: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Bulk Upload Pharmacies
  const handleBulkUploadPharmacies = async () => {
    setLoading(true);
    try {
      const pharmacies = JSON.parse(pharmaciesJson);
      const { data } = await apiCall('POST', '/api/admin/masters/pharmacies', { pharmacies });
      toast.success(data.message || 'Pharmacies uploaded successfully');
      setPharmaciesJson('');
      setOpenDialog('');
    } catch (error: any) {
      toast.error('Upload failed: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Verify Doctor
  const handleVerifyDoctor = async (doctorId: string, isVerified: boolean) => {
    setLoading(true);
    try {
      const { data } = await apiCall('PUT', `/api/doctors/admin/${doctorId}/verification`, { isVerified });
      toast.success(data.message || 'Doctor verification updated');
      fetchDoctors();
    } catch (error: any) {
      toast.error('Verification failed: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Logout
  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('token');
    navigate('/admin/login');
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <Card className="w-[400px] border-slate-700 bg-slate-800/50 backdrop-blur-xl text-white">
          <CardHeader>
            <CardTitle className="text-red-400 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              Unauthorized Access
            </CardTitle>
            <CardDescription className="text-slate-400">Please login as admin to access this dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/admin/login')} className="w-full bg-blue-600 hover:bg-blue-700">
              Go to Admin Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
  };

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.3 } }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans">
      {/* Sticky Header with Glassmorphism */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/60">
        <div className="container mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl shadow-lg shadow-blue-600/20 flex items-center justify-center transform transition-transform hover:scale-105">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Mediczy Admin</h1>
                <p className="text-xs text-slate-500 font-medium">Enterprise Management Suite</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center px-3 py-1.5 bg-slate-100 rounded-full text-xs font-medium text-slate-600 mr-2">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                System Operational
              </div>
              <Button variant="ghost" size="sm" onClick={() => window.location.reload()} className="text-slate-600 hover:text-blue-600 hover:bg-blue-50">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              <Button variant="destructive" size="sm" onClick={handleLogout} className="shadow-sm hover:shadow-md transition-all">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <div className="sticky top-[73px] z-40 bg-slate-50/95 backdrop-blur-sm py-2 -mx-6 px-6 border-b border-slate-200/50">
            <TabsList className="w-full justify-start h-auto p-1 bg-slate-200/50 rounded-xl overflow-x-auto flex-nowrap">
              {[
                { id: 'dashboard', icon: TrendingUp, label: 'Dashboard' },
                { id: 'users', icon: Users, label: 'Users' },
                { id: 'doctors', icon: Stethoscope, label: 'Doctors' },
                { id: 'corporates', icon: Building2, label: 'Corporate Plans' },
                { id: 'bulk-upload', icon: Upload, label: 'Bulk Upload' },
                { id: 'analytics', icon: Activity, label: 'Analytics' },
                { id: 'messaging', icon: MessageSquare, label: 'Messaging' },
                { id: 'settings', icon: Settings, label: 'Settings' },
              ].map((tab) => (
                <TabsTrigger 
                  key={tab.id} 
                  value={tab.id} 
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm transition-all duration-200"
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={containerVariants}
            >
              {/* Dashboard Tab */}
              <TabsContent value="dashboard" className="space-y-8 mt-0">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-32">
                    <div className="relative">
                      <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Activity className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                    <p className="mt-4 text-slate-500 font-medium">Loading dashboard metrics...</p>
                  </div>
                ) : (
                  <>
                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      {[
                        { title: 'Total Users', value: stats?.totalUsers || 0, change: '+12%', icon: Users, color: 'blue', bg: 'bg-blue-50', text: 'text-blue-600' },
                        { title: 'Active Doctors', value: stats?.totalDoctors || 0, change: '+8%', icon: Stethoscope, color: 'emerald', bg: 'bg-emerald-50', text: 'text-emerald-600' },
                        { title: 'Appointments', value: stats?.totalAppointments || 0, change: '+23%', icon: FileText, color: 'violet', bg: 'bg-violet-50', text: 'text-violet-600' },
                        { title: 'Revenue', value: `₹${stats?.totalRevenue?.toLocaleString() || 0}`, change: '+15%', icon: DollarSign, color: 'amber', bg: 'bg-amber-50', text: 'text-amber-600' },
                      ].map((stat, index) => (
                        <motion.div key={index} variants={cardVariants} custom={index}>
                          <Card className="border-none shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden group cursor-pointer bg-white">
                            <CardContent className="p-6">
                              <div className="flex items-center justify-between mb-4">
                                <div className={`w-12 h-12 ${stat.bg} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                                  <stat.icon className={`w-6 h-6 ${stat.text}`} />
                                </div>
                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${stat.bg} ${stat.text}`}>
                                  {stat.change}
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-slate-500">{stat.title}</p>
                                <h3 className="text-3xl font-bold text-slate-900 mt-1 tracking-tight">{stat.value}</h3>
                              </div>
                              <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </div>

                    {/* Quick Actions */}
                    <Card className="border-none shadow-md bg-white overflow-hidden">
                      <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                        <CardTitle className="text-lg font-semibold text-slate-800">Quick Actions</CardTitle>
                        <CardDescription>Common administrative tasks and shortcuts</CardDescription>
                      </CardHeader>
                      <CardContent className="p-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {[
                            { label: 'Bulk Upload', icon: Upload, tab: 'bulk-upload', color: 'text-blue-600', bg: 'hover:bg-blue-50' },
                            { label: 'Manage Users', icon: Users, tab: 'users', color: 'text-emerald-600', bg: 'hover:bg-emerald-50' },
                            { label: 'Verify Doctors', icon: Stethoscope, tab: 'doctors', color: 'text-violet-600', bg: 'hover:bg-violet-50' },
                            { label: 'View Analytics', icon: Activity, tab: 'analytics', color: 'text-amber-600', bg: 'hover:bg-amber-50' },
                          ].map((action, idx) => (
                            <Button 
                              key={idx}
                              variant="outline" 
                              className={`h-auto py-6 flex flex-col gap-3 border-slate-200 hover:border-transparent hover:shadow-md transition-all duration-300 ${action.bg}`}
                              onClick={() => setActiveTab(action.tab)}
                            >
                              <div className={`p-3 rounded-full bg-white shadow-sm ${action.color}`}>
                                <action.icon className="w-6 h-6" />
                              </div>
                              <span className="font-medium text-slate-700">{action.label}</span>
                            </Button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>

              {/* Users Tab */}
              <TabsContent value="users" className="space-y-6 mt-0">
                <Card className="border-none shadow-md overflow-hidden">
                  <CardHeader className="border-b border-slate-100 bg-white sticky top-0 z-10">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <CardTitle className="text-xl font-bold text-slate-800">User Management</CardTitle>
                        <CardDescription>Manage and monitor all registered users</CardDescription>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input placeholder="Search users..." className="pl-9 w-[250px] bg-slate-50 border-slate-200 focus:bg-white transition-colors" />
                        </div>
                        <Button onClick={fetchUsers} disabled={loading} variant="outline" className="border-slate-200 hover:bg-slate-50">
                          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                          Refresh
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {loading ? (
                      <div className="flex items-center justify-center py-20">
                        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                      </div>
                    ) : (
                      <div className="overflow-hidden">
                        <Table>
                          <TableHeader className="bg-slate-50/80">
                            <TableRow className="hover:bg-transparent border-b border-slate-100">
                              <TableHead className="w-[80px] font-semibold text-slate-600">ID</TableHead>
                              <TableHead className="font-semibold text-slate-600">User Details</TableHead>
                              <TableHead className="font-semibold text-slate-600">Contact Info</TableHead>
                              <TableHead className="font-semibold text-slate-600">Role</TableHead>
                              <TableHead className="font-semibold text-slate-600">Status</TableHead>
                              <TableHead className="text-right font-semibold text-slate-600">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {users.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center py-16 text-slate-500">
                                  <div className="flex flex-col items-center gap-2">
                                    <Users className="w-10 h-10 text-slate-300" />
                                    <p>No users found in the database</p>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ) : (
                              users.slice(0, 10).map((user) => (
                                <TableRow key={user.id} className="hover:bg-slate-50/80 transition-colors border-b border-slate-50">
                                  <TableCell className="font-mono text-xs text-slate-500">#{user.id}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs">
                                        {user.firstName?.[0]}{user.lastName?.[0]}
                                      </div>
                                      <div>
                                        <p className="font-medium text-slate-900">{user.firstName} {user.lastName}</p>
                                        <p className="text-xs text-slate-500">Joined {new Date().toLocaleDateString()}</p>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex flex-col text-sm">
                                      <span className="text-slate-700">{user.email}</span>
                                      <span className="text-slate-400 text-xs">{user.phoneNumber || 'No phone'}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="capitalize bg-slate-100 text-slate-600 border-slate-200">
                                      {user.role || 'user'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {user.isActive ? (
                                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200 shadow-none">
                                        <CheckCircle className="w-3 h-3 mr-1" />Active
                                      </Badge>
                                    ) : (
                                      <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-200 border-red-200 shadow-none">
                                        <XCircle className="w-3 h-3 mr-1" />Inactive
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                                        <Eye className="w-4 h-4" />
                                      </Button>
                                      <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-amber-600 hover:bg-amber-50">
                                        <Edit className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Doctors Tab */}
              <TabsContent value="doctors" className="space-y-6 mt-0">
                <Card className="border-none shadow-md overflow-hidden">
                  <CardHeader className="border-b border-slate-100 bg-white sticky top-0 z-10">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <CardTitle className="text-xl font-bold text-slate-800">Doctor Management</CardTitle>
                        <CardDescription>Verify credentials and manage doctor profiles</CardDescription>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input placeholder="Search doctors..." className="pl-9 w-[250px] bg-slate-50 border-slate-200 focus:bg-white transition-colors" />
                        </div>
                        <Button onClick={fetchDoctors} disabled={loading} variant="outline" className="border-slate-200 hover:bg-slate-50">
                          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                          Refresh
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {loading ? (
                      <div className="flex items-center justify-center py-20">
                        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                      </div>
                    ) : (
                      <div className="overflow-hidden">
                        <Table>
                          <TableHeader className="bg-slate-50/80">
                            <TableRow className="hover:bg-transparent border-b border-slate-100">
                              <TableHead className="w-[80px] font-semibold text-slate-600">ID</TableHead>
                              <TableHead className="font-semibold text-slate-600">Doctor Profile</TableHead>
                              <TableHead className="font-semibold text-slate-600">Specialization</TableHead>
                              <TableHead className="font-semibold text-slate-600">Experience</TableHead>
                              <TableHead className="font-semibold text-slate-600">Status</TableHead>
                              <TableHead className="text-right font-semibold text-slate-600">Verification</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {doctors.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center py-16 text-slate-500">
                                  <div className="flex flex-col items-center gap-2">
                                    <Stethoscope className="w-10 h-10 text-slate-300" />
                                    <p>No doctors found in the database</p>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ) : (
                              doctors.map((doctor) => (
                                <TableRow key={doctor.id} className="hover:bg-slate-50/80 transition-colors border-b border-slate-50">
                                  <TableCell className="font-mono text-xs text-slate-500">#{doctor.id}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                                        Dr
                                      </div>
                                      <div>
                                        <p className="font-medium text-slate-900">Dr. {doctor.firstName} {doctor.lastName}</p>
                                        <p className="text-xs text-slate-500">{doctor.email}</p>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100">
                                      {doctor.specialization || 'General'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-slate-600">{doctor.experience || 0} years</TableCell>
                                  <TableCell>
                                    {doctor.isVerified ? (
                                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200 shadow-none">
                                        <CheckCircle className="w-3 h-3 mr-1" />Verified
                                      </Badge>
                                    ) : (
                                      <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200 shadow-none">
                                        <Clock className="w-3 h-3 mr-1" />Pending
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      {!doctor.isVerified && (
                                        <Button 
                                          size="sm" 
                                          className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                                          onClick={() => handleVerifyDoctor(doctor.id, true)}
                                          disabled={loading}
                                        >
                                          <CheckCircle className="w-4 h-4 mr-1" />
                                          Verify
                                        </Button>
                                      )}
                                      {doctor.isVerified && (
                                        <Button 
                                          size="sm" 
                                          variant="destructive"
                                          className="bg-red-50 text-red-600 hover:bg-red-100 border-red-200 shadow-none"
                                          onClick={() => handleVerifyDoctor(doctor.id, false)}
                                          disabled={loading}
                                        >
                                          <XCircle className="w-4 h-4 mr-1" />
                                          Revoke
                                        </Button>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Corporate Plans Tab */}
              <TabsContent value="corporates" className="space-y-6 mt-0">
                <Card className="border-none shadow-md">
                  <CardHeader className="bg-gradient-to-br from-indigo-50 to-white border-b border-indigo-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-indigo-700">
                          <Building2 className="w-5 h-5" />
                          Corporate Plans Management
                        </CardTitle>
                        <CardDescription>Manage corporate health plans and benefits</CardDescription>
                      </div>
                      <Button 
                        className="bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200"
                        onClick={() => navigate('/admin/corporate-plans')}
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Open Full Manager
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <Card className="border border-indigo-100 hover:shadow-lg transition-all duration-300 cursor-pointer" onClick={() => navigate('/admin/corporate-plans')}>
                        <CardContent className="p-6 text-center">
                          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Building2 className="w-8 h-8 text-indigo-600" />
                          </div>
                          <h3 className="font-semibold text-lg text-slate-900">View All Plans</h3>
                          <p className="text-sm text-slate-500 mt-2">Browse and manage all corporate health plans</p>
                        </CardContent>
                      </Card>
                      <Card className="border border-emerald-100 hover:shadow-lg transition-all duration-300 cursor-pointer" onClick={() => navigate('/admin/corporates')}>
                        <CardContent className="p-6 text-center">
                          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Users className="w-8 h-8 text-emerald-600" />
                          </div>
                          <h3 className="font-semibold text-lg text-slate-900">Manage Corporates</h3>
                          <p className="text-sm text-slate-500 mt-2">View and manage corporate organizations</p>
                        </CardContent>
                      </Card>
                      <Card className="border border-amber-100 hover:shadow-lg transition-all duration-300 cursor-pointer" onClick={() => navigate('/admin/corporate-employees')}>
                        <CardContent className="p-6 text-center">
                          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <UserCog className="w-8 h-8 text-amber-600" />
                          </div>
                          <h3 className="font-semibold text-lg text-slate-900">Employee Management</h3>
                          <p className="text-sm text-slate-500 mt-2">Manage corporate employees and enrollments</p>
                        </CardContent>
                      </Card>
                    </div>
                    <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="flex items-start gap-3">
                        <ShieldCheck className="w-5 h-5 text-blue-600 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-blue-900">Corporate Benefits Portal</h4>
                          <p className="text-sm text-blue-700 mt-1">
                            Corporate users can access their benefits at <code className="bg-blue-100 px-2 py-0.5 rounded">/corporate/login</code>
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Bulk Upload Tab */}
              <TabsContent value="bulk-upload" className="space-y-6 mt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Doctors Upload */}
                  <Card className="border-none shadow-md hover:shadow-xl transition-all duration-300">
                    <CardHeader className="bg-gradient-to-br from-blue-50 to-white border-b border-blue-100">
                      <CardTitle className="flex items-center gap-2 text-blue-700">
                        <Stethoscope className="w-5 h-5" />
                        Bulk Upload Doctors
                      </CardTitle>
                      <CardDescription>Upload multiple doctors via JSON</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 p-6">
                      <Textarea
                        placeholder='[{"firstName":"John","lastName":"Doe","email":"john@example.com","specialization":"Cardiology","experience":10}]'
                        value={doctorsJson}
                        onChange={(e) => setDoctorsJson(e.target.value)}
                        className="h-48 font-mono text-xs bg-slate-50 border-slate-200 focus:border-blue-300 focus:ring-blue-100"
                      />
                      <Button 
                        className="w-full bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200" 
                        onClick={handleBulkUploadDoctors}
                        disabled={loading || !doctorsJson.trim()}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Doctors
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Labs Upload */}
                  <Card className="border-none shadow-md hover:shadow-xl transition-all duration-300">
                    <CardHeader className="bg-gradient-to-br from-purple-50 to-white border-b border-purple-100">
                      <CardTitle className="flex items-center gap-2 text-purple-700">
                        <FlaskConical className="w-5 h-5" />
                        Bulk Upload Labs
                      </CardTitle>
                      <CardDescription>Upload multiple labs via JSON</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 p-6">
                      <Textarea
                        placeholder='[{"name":"City Lab","email":"lab@example.com","address":"123 Main St","city":"Mumbai"}]'
                        value={labsJson}
                        onChange={(e) => setLabsJson(e.target.value)}
                        className="h-48 font-mono text-xs bg-slate-50 border-slate-200 focus:border-purple-300 focus:ring-purple-100"
                      />
                      <Button 
                        className="w-full bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-200" 
                        onClick={handleBulkUploadLabs}
                        disabled={loading || !labsJson.trim()}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Labs
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Pharmacies Upload */}
                  <Card className="border-none shadow-md hover:shadow-xl transition-all duration-300">
                    <CardHeader className="bg-gradient-to-br from-amber-50 to-white border-b border-amber-100">
                      <CardTitle className="flex items-center gap-2 text-amber-700">
                        <Pill className="w-5 h-5" />
                        Bulk Upload Pharmacies
                      </CardTitle>
                      <CardDescription>Upload multiple pharmacies via JSON</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 p-6">
                      <Textarea
                        placeholder='[{"name":"Main Pharmacy","email":"pharm@example.com","address":"456 Market St","city":"Delhi"}]'
                        value={pharmaciesJson}
                        onChange={(e) => setPharmaciesJson(e.target.value)}
                        className="h-48 font-mono text-xs bg-slate-50 border-slate-200 focus:border-amber-300 focus:ring-amber-100"
                      />
                      <Button 
                        className="w-full bg-amber-600 hover:bg-amber-700 shadow-md shadow-amber-200" 
                        onClick={handleBulkUploadPharmacies}
                        disabled={loading || !pharmaciesJson.trim()}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Pharmacies
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Analytics Tab */}
              <TabsContent value="analytics" className="space-y-6 mt-0">
                <Card className="border-none shadow-md">
                  <CardHeader>
                    <CardTitle>Analytics Dashboard</CardTitle>
                    <CardDescription>Comprehensive platform analytics</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-32 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <div className="w-20 h-20 bg-white rounded-full shadow-sm flex items-center justify-center mx-auto mb-6">
                        <Activity className="w-10 h-10 text-blue-400" />
                      </div>
                      <h3 className="text-xl font-semibold text-slate-800 mb-2">Analytics Engine</h3>
                      <p className="text-slate-500 max-w-md mx-auto">Advanced reporting and data visualization features are currently being implemented.</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Messaging Tab */}
              <TabsContent value="messaging" className="space-y-6 mt-0">
                <Card className="border-none shadow-md">
                  <CardHeader>
                    <CardTitle>Messaging & Notifications</CardTitle>
                    <CardDescription>Send messages and manage notifications</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-32 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <div className="w-20 h-20 bg-white rounded-full shadow-sm flex items-center justify-center mx-auto mb-6">
                        <MessageSquare className="w-10 h-10 text-violet-400" />
                      </div>
                      <h3 className="text-xl font-semibold text-slate-800 mb-2">Communication Hub</h3>
                      <p className="text-slate-500 max-w-md mx-auto">Broadcast messaging and notification management system coming soon.</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings" className="space-y-6 mt-0">
                <Card className="border-none shadow-md">
                  <CardHeader>
                    <CardTitle>System Settings</CardTitle>
                    <CardDescription>Configure platform settings</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-32 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <div className="w-20 h-20 bg-white rounded-full shadow-sm flex items-center justify-center mx-auto mb-6">
                        <Settings className="w-10 h-10 text-slate-400" />
                      </div>
                      <h3 className="text-xl font-semibold text-slate-800 mb-2">Platform Configuration</h3>
                      <p className="text-slate-500 max-w-md mx-auto">Global system settings and configuration options will be available here.</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Tabs>
      </div>
    </div>
  );
};

export default ComprehensiveAdminDashboard;
