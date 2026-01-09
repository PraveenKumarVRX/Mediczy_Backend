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
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import {
  Building2, MapPin, Phone, Mail, Users, Clock, Activity, Plus, Search, Filter,
  Edit, Trash2, Eye, Settings, MoreVertical, ChevronRight, AlertTriangle,
  CheckCircle, XCircle, MapPinned, Calendar, Bed, Stethoscope, Ambulance,
  FileText, TrendingUp, Download, RefreshCw, Zap, Heart, Navigation,
  DollarSign, User, PhoneCall, Globe, Home, Network, Link2, Copy,
  QrCode, Facebook, Twitter, Instagram, Hospital
} from 'lucide-react';

// Types
interface HospitalBranch {
  id: string;
  name: string;
  type: 'main' | 'branch';
  status: 'active' | 'inactive' | 'opening_soon' | 'closed';
  address: string;
  city: string;
  state: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
  phone: string;
  email: string;
  manager: {
    name: string;
    phone: string;
  };
  establishedDate: string;
  totalBeds?: number;
  departments: string[];
  facilities: string[];
  operatingHours: {
    open: string;
    close: string;
  };
  emergencyServices: boolean;
  ambulances: number;
  doctors: number;
  nurses: number;
  website?: string;
  socialMedia?: {
    facebook?: string;
    twitter?: string;
    instagram?: string;
  };
}

interface OutreachClinic {
  id: string;
  name: string;
  type: 'daily' | 'weekly' | 'monthly' | 'mobile';
  status: 'active' | 'inactive' | 'opening_soon';
  parentBranch: string;
  location: {
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    latitude?: number;
    longitude?: number;
  };
  schedule: {
    days: string[];
    startTime: string;
    endTime: string;
  };
  doctor: {
    name: string;
    phone: string;
    specialization: string;
  };
  services: string[];
  capacity: number;
  contactPerson: {
    name: string;
    phone: string;
    designation: string;
  };
  launchDate: string;
  targetPopulation?: string;
}

const HospitalBranchesClinic = () => {
  const { toast } = useToast();
  
  const hospitalHeaders = () => {
    const token = localStorage.getItem('hospitalToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  
  const [activeTab, setActiveTab] = useState('branches');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddBranchDialog, setShowAddBranchDialog] = useState(false);
  const [showAddClinicDialog, setShowAddClinicDialog] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<HospitalBranch | null>(null);
  const [showViewDialog, setShowViewDialog] = useState(false);

  // Mock branches data
  const [branches, setBranches] = useState<HospitalBranch[]>([
    {
      id: 'HB001',
      name: 'City Hospital - Main Campus',
      type: 'main',
      status: 'active',
      address: '123, Hospital Lane, Medical Park',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560001',
      latitude: 12.9716,
      longitude: 77.5946,
      phone: '+91 80 1234 5678',
      email: 'main@cityhospital.com',
      manager: { name: 'Dr. Rajesh Kumar', phone: '+91 98765 43210' },
      establishedDate: '2005-01-15',
      totalBeds: 500,
      departments: ['Emergency', 'Cardiology', 'Neurology', 'Orthopedics', 'General Surgery'],
      facilities: ['ICU', 'NICU', 'PICU', 'CT Scan', 'MRI', 'Lab', 'Pharmacy'],
      operatingHours: { open: '24/7', close: '24/7' },
      emergencyServices: true,
      ambulances: 12,
      doctors: 45,
      nurses: 120,
      website: 'www.cityhospital.com',
      socialMedia: {
        facebook: 'cityhospital',
        twitter: '@cityhospital',
        instagram: 'cityhospital_official'
      }
    },
    {
      id: 'HB002',
      name: 'City Hospital - Whitefield Branch',
      type: 'branch',
      status: 'active',
      address: '456, Tech Park Road',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560066',
      latitude: 12.9698,
      longitude: 77.6783,
      phone: '+91 80 9876 5432',
      email: 'whitefield@cityhospital.com',
      manager: { name: 'Dr. Priya Sharma', phone: '+91 98765 54321' },
      establishedDate: '2015-06-20',
      totalBeds: 250,
      departments: ['General Medicine', 'Cardiology', 'Orthopedics', 'ENT', 'Pediatrics'],
      facilities: ['ICU', 'Ultrasound', 'Lab', 'Pharmacy', 'Physiotherapy'],
      operatingHours: { open: '06:00 AM', close: '10:00 PM' },
      emergencyServices: true,
      ambulances: 6,
      doctors: 25,
      nurses: 65,
      website: 'www.cityhospital.com/whitefield'
    },
    {
      id: 'HB003',
      name: 'City Hospital - Indiranagar Branch',
      type: 'branch',
      status: 'opening_soon',
      address: '789, Indiranagar Main Road',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560038',
      latitude: 12.9716,
      longitude: 77.6412,
      phone: '+91 80 5432 1098',
      email: 'indiranagar@cityhospital.com',
      manager: { name: 'Dr. Anil Kumar', phone: '+91 98765 65432' },
      establishedDate: '2026-04-15',
      totalBeds: 150,
      departments: ['General Medicine', 'Pediatrics', 'Gynecology', 'Dermatology'],
      facilities: ['Clinic', 'Lab', 'Ultrasound', 'Pharmacy'],
      operatingHours: { open: '08:00 AM', close: '08:00 PM' },
      emergencyServices: false,
      ambulances: 2,
      doctors: 12,
      nurses: 30
    }
  ]);

  // Mock clinics data
  const [clinics, setClinics] = useState<OutreachClinic[]>([
    {
      id: 'OC001',
      name: 'Mobile Health Camp - Slums',
      type: 'mobile',
      status: 'active',
      parentBranch: 'HB001',
      location: {
        name: 'Banashankari Layout Community Center',
        address: 'Community Hall, Banashankari 4th Stage',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560085',
        latitude: 12.9345,
        longitude: 77.5890
      },
      schedule: {
        days: ['Monday', 'Wednesday', 'Friday'],
        startTime: '09:00 AM',
        endTime: '01:00 PM'
      },
      doctor: {
        name: 'Dr. Meena Devi',
        phone: '+91 98765 11111',
        specialization: 'General Medicine'
      },
      services: ['General Consultation', 'Health Screening', 'Vaccination', 'Health Education'],
      capacity: 50,
      contactPerson: {
        name: 'Ravi Kumar',
        phone: '+91 98765 22222',
        designation: 'Community Health Worker'
      },
      launchDate: '2024-06-01',
      targetPopulation: 'Lower Income Communities'
    },
    {
      id: 'OC002',
      name: 'Corporate Wellness Clinic',
      type: 'weekly',
      status: 'active',
      parentBranch: 'HB002',
      location: {
        name: 'Tech Park Office Complex',
        address: '100, Tech Park Avenue',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560066',
        latitude: 12.9698,
        longitude: 77.6783
      },
      schedule: {
        days: ['Tuesday', 'Thursday'],
        startTime: '12:00 PM',
        endTime: '02:00 PM'
      },
      doctor: {
        name: 'Dr. Vikram Singh',
        phone: '+91 98765 33333',
        specialization: 'Occupational Medicine'
      },
      services: ['Health Checkup', 'Vaccination', 'Fitness Assessment', 'Stress Management'],
      capacity: 100,
      contactPerson: {
        name: 'Anjali Patel',
        phone: '+91 98765 44444',
        designation: 'Wellness Coordinator'
      },
      launchDate: '2025-01-10',
      targetPopulation: 'Corporate Employees'
    },
    {
      id: 'OC003',
      name: 'School Health Program',
      type: 'weekly',
      status: 'active',
      parentBranch: 'HB001',
      location: {
        name: 'Central Public School',
        address: 'School Campus, MG Road',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560001',
        latitude: 12.9720,
        longitude: 77.5946
      },
      schedule: {
        days: ['Saturday'],
        startTime: '09:00 AM',
        endTime: '12:00 PM'
      },
      doctor: {
        name: 'Dr. Neha Gupta',
        phone: '+91 98765 55555',
        specialization: 'Pediatrics'
      },
      services: ['School Checkup', 'Vision & Hearing Test', 'Dental Screening', 'Health Talk'],
      capacity: 80,
      contactPerson: {
        name: 'Principal, Central Public School',
        phone: '+91 98765 66666',
        designation: 'School Principal'
      },
      launchDate: '2025-02-15'
    }
  ]);

  const getStatusBadge = (status: string) => {
    const config: Record<string, { color: string; label: string }> = {
      active: { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', label: 'Active' },
      inactive: { color: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300', label: 'Inactive' },
      opening_soon: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', label: 'Opening Soon' },
      closed: { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', label: 'Closed' }
    };
    const { color, label } = config[status] || config.inactive;
    return <Badge className={color}>{label}</Badge>;
  };

  const getTypeBadge = (type: string) => {
    const config: Record<string, { color: string; icon: any }> = {
      main: { color: 'bg-blue-500/10 text-blue-600', icon: Hospital },
      branch: { color: 'bg-purple-500/10 text-purple-600', icon: Building2 },
      daily: { color: 'bg-green-500/10 text-green-600', icon: Calendar },
      weekly: { color: 'bg-orange-500/10 text-orange-600', icon: Calendar },
      monthly: { color: 'bg-pink-500/10 text-pink-600', icon: Calendar },
      mobile: { color: 'bg-indigo-500/10 text-indigo-600', icon: Navigation }
    };
    const { color, label } = { color: config[type]?.color || 'bg-slate-500/10 text-slate-600', label: type };
    return <Badge className={color}>{type.charAt(0).toUpperCase() + type.slice(1)}</Badge>;
  };

  const filteredBranches = branches.filter(branch => {
    const matchesSearch = branch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         branch.city.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' || branch.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const filteredClinics = clinics.filter(clinic =>
    clinic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    clinic.location.city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeBranches = branches.filter(b => b.status === 'active').length;
  const activeClinicCount = clinics.filter(c => c.status === 'active').length;
  const totalDoctors = branches.reduce((sum, b) => sum + b.doctors, 0);
  const totalBeds = branches.reduce((sum, b) => sum + (b.totalBeds || 0), 0);

  return (
    <HospitalLayout title="Branches & Outreach Clinics" subtitle="Manage hospital branches and community outreach clinics">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <TabsList className="bg-slate-100 dark:bg-slate-800">
            <TabsTrigger value="branches" className="gap-2">
              <Building2 className="h-4 w-4" /> Branches
            </TabsTrigger>
            <TabsTrigger value="clinics" className="gap-2">
              <Heart className="h-4 w-4" /> Outreach Clinics
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <TrendingUp className="h-4 w-4" /> Analytics
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3">
            {activeTab === 'branches' && (
              <Dialog open={showAddBranchDialog} onOpenChange={setShowAddBranchDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white gap-2">
                    <Plus className="h-4 w-4" /> Add Branch
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Hospital Branch</DialogTitle>
                    <DialogDescription>Create a new hospital branch or location</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Branch Name *</Label>
                        <Input placeholder="e.g., City Hospital - Indiranagar" />
                      </div>
                      <div className="space-y-2">
                        <Label>Branch Type *</Label>
                        <Select defaultValue="branch">
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="main">Main Campus</SelectItem>
                            <SelectItem value="branch">Branch</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-4 border-t pt-4">
                      <h3 className="font-semibold text-slate-700 dark:text-slate-300">Location Details</h3>
                      <div className="space-y-2">
                        <Label>Address *</Label>
                        <Textarea placeholder="Full street address" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>City *</Label>
                          <Input placeholder="City" />
                        </div>
                        <div className="space-y-2">
                          <Label>State *</Label>
                          <Input placeholder="State" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>PIN Code *</Label>
                          <Input placeholder="560001" />
                        </div>
                        <div className="space-y-2">
                          <Label>Latitude (Optional)</Label>
                          <Input type="number" placeholder="12.9716" step="0.0001" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 border-t pt-4">
                      <h3 className="font-semibold text-slate-700 dark:text-slate-300">Contact Information</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Phone *</Label>
                          <Input placeholder="+91 80 1234 5678" />
                        </div>
                        <div className="space-y-2">
                          <Label>Email *</Label>
                          <Input type="email" placeholder="branch@hospital.com" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Website (Optional)</Label>
                        <Input placeholder="www.hospital.com/branch" />
                      </div>
                    </div>

                    <div className="space-y-4 border-t pt-4">
                      <h3 className="font-semibold text-slate-700 dark:text-slate-300">Branch Manager</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Manager Name *</Label>
                          <Input placeholder="Manager name" />
                        </div>
                        <div className="space-y-2">
                          <Label>Manager Phone *</Label>
                          <Input placeholder="+91 98765 43210" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 border-t pt-4">
                      <h3 className="font-semibold text-slate-700 dark:text-slate-300">Resources</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Total Beds</Label>
                          <Input type="number" placeholder="250" />
                        </div>
                        <div className="space-y-2">
                          <Label>Doctors</Label>
                          <Input type="number" placeholder="25" />
                        </div>
                        <div className="space-y-2">
                          <Label>Nurses</Label>
                          <Input type="number" placeholder="65" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Ambulances</Label>
                        <Input type="number" placeholder="6" />
                      </div>
                    </div>

                    <div className="space-y-4 border-t pt-4">
                      <div className="flex items-center justify-between">
                        <Label>Emergency Services Available?</Label>
                        <Switch defaultChecked />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowAddBranchDialog(false)}>Cancel</Button>
                    <Button className="bg-teal-600 hover:bg-teal-700" onClick={async () => {
                      try {
                        const branchData = {
                          name: '',
                          type: 'branch',
                          address: '',
                          city: '',
                          state: '',
                          pincode: '',
                          phone: '',
                          email: '',
                          manager: { name: '', phone: '' }
                        };

                        const { data } = await api.post(
                          '/hospital/branches',
                          branchData,
                          { headers: hospitalHeaders() }
                        );

                        setBranches(prev => [...prev, data]);
                        toast({ title: 'Branch Added', description: 'New hospital branch created successfully' });
                        setShowAddBranchDialog(false);
                      } catch (error: any) {
                        toast({ 
                          title: 'Failed to add branch', 
                          description: error.response?.data?.message || 'An error occurred',
                          variant: 'destructive'
                        });
                      }
                    }}>
                      <Plus className="h-4 w-4 mr-2" /> Add Branch
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {activeTab === 'clinics' && (
              <Dialog open={showAddClinicDialog} onOpenChange={setShowAddClinicDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white gap-2">
                    <Plus className="h-4 w-4" /> Add Clinic
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add Outreach Clinic</DialogTitle>
                    <DialogDescription>Create a new community outreach clinic</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Clinic Name *</Label>
                        <Input placeholder="e.g., Mobile Health Camp" />
                      </div>
                      <div className="space-y-2">
                        <Label>Clinic Type *</Label>
                        <Select defaultValue="weekly">
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="mobile">Mobile Camp</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Parent Branch *</Label>
                      <Select defaultValue={branches[0]?.id}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {branches.map(b => (
                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-4 border-t pt-4">
                      <h3 className="font-semibold text-slate-700 dark:text-slate-300">Location</h3>
                      <div className="space-y-2">
                        <Label>Location Name *</Label>
                        <Input placeholder="e.g., Community Center, School, Corporate Office" />
                      </div>
                      <div className="space-y-2">
                        <Label>Address *</Label>
                        <Textarea placeholder="Full address" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>City *</Label>
                          <Input placeholder="City" />
                        </div>
                        <div className="space-y-2">
                          <Label>PIN Code *</Label>
                          <Input placeholder="560085" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 border-t pt-4">
                      <h3 className="font-semibold text-slate-700 dark:text-slate-300">Schedule</h3>
                      <div className="space-y-2">
                        <Label>Operating Days *</Label>
                        <Input placeholder="e.g., Monday, Wednesday, Friday" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Start Time *</Label>
                          <Input type="time" defaultValue="09:00" />
                        </div>
                        <div className="space-y-2">
                          <Label>End Time *</Label>
                          <Input type="time" defaultValue="13:00" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 border-t pt-4">
                      <h3 className="font-semibold text-slate-700 dark:text-slate-300">Doctor Details</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Doctor Name *</Label>
                          <Input placeholder="Doctor name" />
                        </div>
                        <div className="space-y-2">
                          <Label>Doctor Phone *</Label>
                          <Input placeholder="+91 98765 11111" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Specialization *</Label>
                        <Input placeholder="e.g., General Medicine, Pediatrics" />
                      </div>
                    </div>

                    <div className="space-y-4 border-t pt-4">
                      <h3 className="font-semibold text-slate-700 dark:text-slate-300">Services & Capacity</h3>
                      <div className="space-y-2">
                        <Label>Services Offered *</Label>
                        <Input placeholder="e.g., General Consultation, Vaccination, Health Screening" />
                      </div>
                      <div className="space-y-2">
                        <Label>Daily Capacity *</Label>
                        <Input type="number" placeholder="50" />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowAddClinicDialog(false)}>Cancel</Button>
                    <Button className="bg-teal-600 hover:bg-teal-700" onClick={async () => {
                      try {
                        const clinicData = {
                          name: '',
                          type: 'daily',
                          parentBranch: '',
                          location: { name: '', address: '', city: '', state: '', pincode: '' },
                          schedule: { days: [], startTime: '', endTime: '' },
                          doctor: { name: '', phone: '', specialization: '' },
                          services: [],
                          capacity: 0
                        };

                        const { data } = await api.post(
                          '/hospital/clinics',
                          clinicData,
                          { headers: hospitalHeaders() }
                        );

                        setClinics(prev => [...prev, data]);
                        toast({ title: 'Clinic Added', description: 'New outreach clinic created successfully' });
                        setShowAddClinicDialog(false);
                      } catch (error: any) {
                        toast({ 
                          title: 'Failed to add clinic', 
                          description: error.response?.data?.message || 'An error occurred',
                          variant: 'destructive'
                        });
                      }
                    }}>
                      <Plus className="h-4 w-4 mr-2" /> Add Clinic
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        </div>

        {/* Branches Tab */}
        <TabsContent value="branches" className="space-y-4">
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-slate-800 dark:text-white">Hospital Branches</CardTitle>
                  <CardDescription className="text-slate-500 dark:text-slate-400">Manage all hospital locations and branches</CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search branches..."
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
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="opening_soon">Opening Soon</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-700/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-blue-600 dark:text-blue-300">Total Branches</p>
                        <p className="text-3xl font-bold text-blue-700 dark:text-blue-400">{branches.length}</p>
                        <p className="text-xs text-blue-500 mt-1">{activeBranches} active</p>
                      </div>
                      <Building2 className="h-12 w-12 text-blue-300" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200 dark:border-purple-700/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-purple-600 dark:text-purple-300">Total Resources</p>
                        <p className="text-3xl font-bold text-purple-700 dark:text-purple-400">{totalBeds}</p>
                        <p className="text-xs text-purple-500 mt-1">Beds • {totalDoctors} Doctors</p>
                      </div>
                      <Bed className="h-12 w-12 text-purple-300" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                {filteredBranches.map((branch) => (
                  <Card key={branch.id} className="bg-slate-50 dark:bg-slate-800/50 hover:shadow-md transition-shadow">
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-4">
                        <div>
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-bold text-slate-800 dark:text-white">{branch.name}</h3>
                                {getTypeBadge(branch.type)}
                              </div>
                              <p className="text-sm text-slate-600 dark:text-slate-300">{branch.id}</p>
                            </div>
                          </div>
                          {getStatusBadge(branch.status)}
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">LOCATION</p>
                          <p className="text-sm text-slate-700 dark:text-slate-200">{branch.address}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300">{branch.city}, {branch.state} {branch.pincode}</p>
                          {branch.latitude && (
                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                              <MapPin className="h-3 w-3" /> {branch.latitude}, {branch.longitude}
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">CONTACT</p>
                          <p className="text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2">
                            <Phone className="h-4 w-4" /> {branch.phone}
                          </p>
                          <p className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
                            <Mail className="h-4 w-4" /> {branch.email}
                          </p>
                          {branch.website && (
                            <p className="text-sm text-slate-500 flex items-center gap-2">
                              <Globe className="h-4 w-4" /> {branch.website}
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">MANAGER</p>
                          <p className="text-sm font-medium text-slate-800 dark:text-white">{branch.manager.name}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1">
                            <PhoneCall className="h-3 w-3" /> {branch.manager.phone}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-white dark:bg-slate-800 rounded-lg mb-4">
                        {branch.totalBeds && (
                          <div className="text-center">
                            <p className="text-lg font-bold text-teal-600">{branch.totalBeds}</p>
                            <p className="text-xs text-slate-500">Beds</p>
                          </div>
                        )}
                        <div className="text-center">
                          <p className="text-lg font-bold text-blue-600">{branch.doctors}</p>
                          <p className="text-xs text-slate-500">Doctors</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-green-600">{branch.nurses}</p>
                          <p className="text-xs text-slate-500">Nurses</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-amber-600">{branch.ambulances}</p>
                          <p className="text-xs text-slate-500">Ambulances</p>
                        </div>
                        <div className="text-center">
                          {branch.emergencyServices ? (
                            <>
                              <p className="text-lg font-bold text-red-600">24/7</p>
                              <p className="text-xs text-slate-500">Emergency</p>
                            </>
                          ) : (
                            <>
                              <p className="text-lg font-bold text-slate-400">—</p>
                              <p className="text-xs text-slate-500">Limited</p>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-4">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Departments:</span>
                        {branch.departments.slice(0, 3).map((dept, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{dept}</Badge>
                        ))}
                        {branch.departments.length > 3 && (
                          <Badge variant="outline" className="text-xs">+{branch.departments.length - 3}</Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => {
                          setSelectedBranch(branch);
                          setShowViewDialog(true);
                        }}>
                          <Eye className="h-4 w-4 mr-1" /> View Details
                        </Button>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4 mr-1" /> Edit
                        </Button>
                        <Button variant="outline" size="sm">
                          <Settings className="h-4 w-4 mr-1" /> Manage
                        </Button>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Clinics Tab */}
        <TabsContent value="clinics" className="space-y-4">
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-slate-800 dark:text-white">Outreach Clinics</CardTitle>
                  <CardDescription className="text-slate-500 dark:text-slate-400">Community clinics and mobile health camps</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-700/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-green-600 dark:text-green-300">Total Clinics</p>
                        <p className="text-3xl font-bold text-green-700 dark:text-green-400">{clinics.length}</p>
                        <p className="text-xs text-green-500 mt-1">{activeClinicCount} active</p>
                      </div>
                      <Heart className="h-12 w-12 text-green-300" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-900/20 dark:to-orange-800/20 border-orange-200 dark:border-orange-700/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-orange-600 dark:text-orange-300">Total Capacity</p>
                        <p className="text-3xl font-bold text-orange-700 dark:text-orange-400">{clinics.reduce((sum, c) => sum + c.capacity, 0)}</p>
                        <p className="text-xs text-orange-500 mt-1">patients/day</p>
                      </div>
                      <Users className="h-12 w-12 text-orange-300" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 dark:from-indigo-900/20 dark:to-indigo-800/20 border-indigo-200 dark:border-indigo-700/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-indigo-600 dark:text-indigo-300">Active Doctors</p>
                        <p className="text-3xl font-bold text-indigo-700 dark:text-indigo-400">{clinics.length}</p>
                        <p className="text-xs text-indigo-500 mt-1">Assigned</p>
                      </div>
                      <Stethoscope className="h-12 w-12 text-indigo-300" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                {filteredClinics.map((clinic) => (
                  <Card key={clinic.id} className="bg-slate-50 dark:bg-slate-800/50">
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                        <div>
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-bold text-slate-800 dark:text-white">{clinic.name}</h3>
                                {getTypeBadge(clinic.type)}
                              </div>
                              <p className="text-sm text-slate-600 dark:text-slate-300">{clinic.id}</p>
                            </div>
                          </div>
                          {getStatusBadge(clinic.status)}
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">LOCATION</p>
                          <p className="text-sm font-medium text-slate-800 dark:text-white">{clinic.location.name}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300">{clinic.location.address}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300">{clinic.location.city}, {clinic.location.state}</p>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">DOCTOR & SCHEDULE</p>
                          <p className="text-sm font-medium text-slate-800 dark:text-white">{clinic.doctor.name}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300">{clinic.doctor.specialization}</p>
                          <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3" /> {clinic.schedule.days.join(', ')}
                          </p>
                          <p className="text-sm text-slate-500 flex items-center gap-1">
                            {clinic.schedule.startTime} - {clinic.schedule.endTime}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 p-4 bg-white dark:bg-slate-800 rounded-lg mb-4">
                        <div className="text-center">
                          <p className="text-lg font-bold text-teal-600">{clinic.capacity}</p>
                          <p className="text-xs text-slate-500">Daily Capacity</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-bold text-blue-600">{clinic.services.length}</p>
                          <p className="text-xs text-slate-500">Services</p>
                        </div>
                        <div className="text-center">
                          <Badge variant="outline" className="justify-center">{clinic.type}</Badge>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-4">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Services:</span>
                        {clinic.services.map((service, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{service}</Badge>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <Button variant="outline" size="sm" className="flex-1">
                          <Eye className="h-4 w-4 mr-1" /> View Details
                        </Button>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4 mr-1" /> Edit
                        </Button>
                        <Button variant="outline" size="sm">
                          <Calendar className="h-4 w-4 mr-1" /> Schedule
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-slate-800 dark:text-white">Network Analytics</CardTitle>
              <CardDescription>Hospital network overview and performance metrics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Branches', value: branches.length, icon: Building2, color: 'text-blue-600' },
                  { label: 'Total Clinics', value: clinics.length, icon: Heart, color: 'text-red-600' },
                  { label: 'Total Doctors', value: totalDoctors, icon: Stethoscope, color: 'text-green-600' },
                  { label: 'Total Beds', value: totalBeds, icon: Bed, color: 'text-purple-600' },
                ].map((stat, i) => (
                  <Card key={i} className="bg-slate-50 dark:bg-slate-800">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
                          <p className={`text-3xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
                        </div>
                        <stat.icon className={`h-8 w-8 ${stat.color} opacity-20`} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="bg-slate-50 dark:bg-slate-800">
                <CardHeader>
                  <CardTitle className="text-base">Branch Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {branches.map((branch) => (
                      <div key={branch.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <Building2 className="h-4 w-4 text-slate-400" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-800 dark:text-white">{branch.name}</p>
                            <p className="text-xs text-slate-500">{branch.city}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-800 dark:text-white">{branch.doctors} Docs</p>
                          <p className="text-xs text-slate-500">{branch.totalBeds || 0} Beds</p>
                        </div>
                        {getStatusBadge(branch.status)}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-50 dark:bg-slate-800">
                <CardHeader>
                  <CardTitle className="text-base">Clinic Utilization</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {clinics.map((clinic) => {
                      const parentBranch = branches.find(b => b.id === clinic.parentBranch);
                      return (
                        <div key={clinic.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            <Heart className="h-4 w-4 text-slate-400" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-slate-800 dark:text-white">{clinic.name}</p>
                              <p className="text-xs text-slate-500">{parentBranch?.name}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-slate-800 dark:text-white">{clinic.capacity}/day</p>
                            <p className="text-xs text-slate-500">{clinic.type}</p>
                          </div>
                          {getStatusBadge(clinic.status)}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* View Details Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedBranch?.name}</DialogTitle>
            <DialogDescription>Complete branch information</DialogDescription>
          </DialogHeader>
          {selectedBranch && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-3">Location</h4>
                  <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <p>{selectedBranch.address}</p>
                    <p>{selectedBranch.city}, {selectedBranch.state} {selectedBranch.pincode}</p>
                    {selectedBranch.latitude && (
                      <p className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" /> {selectedBranch.latitude}, {selectedBranch.longitude}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-3">Contact</h4>
                  <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <p className="flex items-center gap-2"><Phone className="h-4 w-4" /> {selectedBranch.phone}</p>
                    <p className="flex items-center gap-2"><Mail className="h-4 w-4" /> {selectedBranch.email}</p>
                    {selectedBranch.website && (
                      <p className="flex items-center gap-2"><Globe className="h-4 w-4" /> {selectedBranch.website}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-3">Resources</h4>
                <div className="grid grid-cols-4 gap-4">
                  {selectedBranch.totalBeds && (
                    <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded text-center">
                      <p className="text-lg font-bold text-slate-800 dark:text-white">{selectedBranch.totalBeds}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">Beds</p>
                    </div>
                  )}
                  <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded text-center">
                    <p className="text-lg font-bold text-slate-800 dark:text-white">{selectedBranch.doctors}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">Doctors</p>
                  </div>
                  <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded text-center">
                    <p className="text-lg font-bold text-slate-800 dark:text-white">{selectedBranch.nurses}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">Nurses</p>
                  </div>
                  <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded text-center">
                    <p className="text-lg font-bold text-slate-800 dark:text-white">{selectedBranch.ambulances}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">Ambulances</p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-3">Departments</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedBranch.departments.map((dept, i) => (
                    <Badge key={i} variant="outline">{dept}</Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowViewDialog(false)}>Close</Button>
            <Button className="bg-teal-600 hover:bg-teal-700">Edit Branch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HospitalLayout>
  );
};

export default HospitalBranchesClinic;
