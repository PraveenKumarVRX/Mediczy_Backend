import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Building, Plus, Search, Edit, Trash2, Users, Shield,
  Calendar, DollarSign, FileText, CheckCircle, XCircle,
  Activity, TrendingUp, Phone, Mail, MapPin, Briefcase
} from 'lucide-react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';

const HospitalCorporateManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedCorporate, setSelectedCorporate] = useState<any>(null);
  
  const hospitalHeaders = () => {
    const token = localStorage.getItem('hospitalToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  
  // Corporate tie-ups data (with mock fallback)
  const [corporates, setCorporates] = useState([
    {
      id: 1,
      name: 'TCS - Tata Consultancy Services',
      contactPerson: 'Rajesh Kumar',
      email: 'rajesh.kumar@tcs.com',
      phone: '+91 98765 43210',
      employeeCount: 25000,
      status: 'active',
      contractStart: '2024-01-01',
      contractEnd: '2025-12-31',
      discountType: 'percentage',
      discount: 15,
      totalClaims: 145,
      pendingClaims: 12,
      settledAmount: '₹45,67,890',
      category: 'IT Services'
    },
    {
      id: 2,
      name: 'Infosys Limited',
      contactPerson: 'Priya Sharma',
      email: 'priya.sharma@infosys.com',
      phone: '+91 99876 54321',
      employeeCount: 18000,
      status: 'active',
      contractStart: '2024-03-01',
      contractEnd: '2026-02-28',
      discountType: 'percentage',
      discount: 12,
      totalClaims: 98,
      pendingClaims: 8,
      settledAmount: '₹32,45,670',
      category: 'IT Services'
    },
    {
      id: 3,
      name: 'HDFC Bank',
      contactPerson: 'Amit Patel',
      email: 'amit.patel@hdfcbank.com',
      phone: '+91 97654 32109',
      employeeCount: 12000,
      status: 'active',
      contractStart: '2024-06-01',
      contractEnd: '2025-05-31',
      discountType: 'flat',
      discount: 500,
      totalClaims: 67,
      pendingClaims: 5,
      settledAmount: '₹28,90,450',
      category: 'Banking'
    },
    {
      id: 4,
      name: 'Reliance Industries',
      contactPerson: 'Sneha Joshi',
      email: 'sneha.joshi@ril.com',
      phone: '+91 96543 21098',
      employeeCount: 30000,
      status: 'pending',
      contractStart: '2025-01-01',
      contractEnd: '2026-12-31',
      discountType: 'percentage',
      discount: 18,
      totalClaims: 0,
      pendingClaims: 0,
      settledAmount: '₹0',
      category: 'Manufacturing'
    }
  ]);

  const [formData, setFormData] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    employeeCount: '',
    contractStart: '',
    contractEnd: '',
    discountType: 'percentage',
    discount: '',
    category: ''
  });

  const stats = [
    { label: 'Total Corporates', value: corporates.length.toString(), icon: Building, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Active Tie-ups', value: corporates.filter(c => c.status === 'active').length.toString(), icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
    { label: 'Total Employees', value: corporates.reduce((sum, c) => sum + c.employeeCount, 0).toLocaleString(), icon: Users, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { label: 'Pending Claims', value: corporates.reduce((sum, c) => sum + c.pendingClaims, 0).toString(), icon: Shield, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  ];

  const filteredCorporates = corporates.filter(corp =>
    corp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    corp.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()) ||
    corp.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddCorporate = async () => {
    try {
      setLoading(true);
      
      // Map form data to API expected format
      const payload = {
        companyName: formData.name,
        hrContactName: formData.contactPerson,
        hrContactEmail: formData.email,
        hrContactPhone: formData.phone,
        employeeCount: parseInt(formData.employeeCount) || 0,
        industry: formData.category
      };

      const response = await api.post('/hospital/auth/corporates', payload, {
        headers: hospitalHeaders()
      });

      if (response.data.success) {
        // Add the new corporate to state with local format
        const newCorporate = {
          id: response.data.corporate.id,
          name: formData.name,
          contactPerson: formData.contactPerson,
          email: formData.email,
          phone: formData.phone,
          employeeCount: parseInt(formData.employeeCount) || 0,
          status: 'active',
          contractStart: formData.contractStart,
          contractEnd: formData.contractEnd,
          discountType: formData.discountType,
          discount: parseFloat(formData.discount) || 0,
          totalClaims: 0,
          pendingClaims: 0,
          settledAmount: '₹0',
          category: formData.category
        };
        
        setCorporates(prev => [newCorporate, ...prev]);
        toast({
          title: 'Success',
          description: 'Corporate tie-up added successfully'
        });
      }

      setIsAddDialogOpen(false);
      // Reset form
      setFormData({
        name: '',
        contactPerson: '',
        email: '',
        phone: '',
        employeeCount: '',
        contractStart: '',
        contractEnd: '',
        discountType: 'percentage',
        discount: '',
        category: ''
      });
    } catch (error: any) {
      console.error('Error adding corporate:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to add corporate tie-up',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch corporates on mount
  useEffect(() => {
    const fetchCorporates = async () => {
      try {
        const response = await api.get('/hospital/auth/corporates', {
          headers: hospitalHeaders()
        });
        if (response.data.success && response.data.corporates) {
          // Map API response to component format
          const mappedCorporates = response.data.corporates.map((corp: any) => ({
            id: corp.id,
            name: corp.companyName,
            contactPerson: corp.hrContactName || '',
            email: corp.hrContactEmail || '',
            phone: corp.hrContactPhone || '',
            employeeCount: corp.employeeCount || 0,
            status: corp.status || 'active',
            contractStart: corp.createdAt?.split('T')[0] || '',
            contractEnd: '',
            discountType: 'percentage',
            discount: 0,
            totalClaims: 0,
            pendingClaims: 0,
            settledAmount: '₹0',
            category: corp.industry || 'General'
          }));
          setCorporates(mappedCorporates);
        }
      } catch (error) {
        console.error('Error fetching corporates:', error);
        // Keep mock data on error
      }
    };
    fetchCorporates();
  }, []);

  return (
    <HospitalLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <Building className="h-8 w-8 text-teal-600" />
              Corporate Management
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Manage corporate tie-ups and employee health benefits
            </p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-teal-600 hover:bg-teal-700">
                <Plus className="h-4 w-4 mr-2" />
                Add Corporate Tie-up
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Corporate Tie-up</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="name">Company Name *</Label>
                    <Input
                      id="name"
                      placeholder="Enter company name"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactPerson">Contact Person *</Label>
                    <Input
                      id="contactPerson"
                      placeholder="Enter contact person name"
                      value={formData.contactPerson}
                      onChange={(e) => setFormData({...formData, contactPerson: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category *</Label>
                    <Input
                      id="category"
                      placeholder="e.g., IT Services, Banking"
                      value={formData.category}
                      onChange={(e) => setFormData({...formData, category: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="contact@company.com"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone *</Label>
                    <Input
                      id="phone"
                      placeholder="+91 98765 43210"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="employeeCount">Employee Count *</Label>
                    <Input
                      id="employeeCount"
                      type="number"
                      placeholder="Enter employee count"
                      value={formData.employeeCount}
                      onChange={(e) => setFormData({...formData, employeeCount: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contractStart">Contract Start Date *</Label>
                    <Input
                      id="contractStart"
                      type="date"
                      value={formData.contractStart}
                      onChange={(e) => setFormData({...formData, contractStart: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contractEnd">Contract End Date *</Label>
                    <Input
                      id="contractEnd"
                      type="date"
                      value={formData.contractEnd}
                      onChange={(e) => setFormData({...formData, contractEnd: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="discountType">Discount Type *</Label>
                    <Select 
                      value={formData.discountType} 
                      onValueChange={(value) => setFormData({...formData, discountType: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select discount type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="flat">Flat Amount</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="discount">
                      Discount Value * {formData.discountType === 'percentage' ? '(%)' : '(₹)'}
                    </Label>
                    <Input
                      id="discount"
                      type="number"
                      placeholder={formData.discountType === 'percentage' ? 'e.g., 15' : 'e.g., 500'}
                      value={formData.discount}
                      onChange={(e) => setFormData({...formData, discount: e.target.value})}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddCorporate} className="bg-teal-600 hover:bg-teal-700">
                    Add Corporate
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</p>
                    <p className="text-2xl font-bold mt-2">{stat.value}</p>
                  </div>
                  <div className={`${stat.bg} p-3 rounded-lg`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search and Filter */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search corporates by name, contact, or category..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Corporates Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredCorporates.map((corporate) => (
            <Card key={corporate.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Building className="h-5 w-5 text-teal-600" />
                      {corporate.name}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Briefcase className="h-3 w-3" />
                      {corporate.category}
                    </CardDescription>
                  </div>
                  <Badge 
                    variant={corporate.status === 'active' ? 'default' : 'secondary'}
                    className={corporate.status === 'active' ? 'bg-green-500' : 'bg-amber-500'}
                  >
                    {corporate.status === 'active' ? <CheckCircle className="h-3 w-3 mr-1" /> : <Activity className="h-3 w-3 mr-1" />}
                    {corporate.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Contact Info */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users className="h-4 w-4" />
                    <span className="font-medium">{corporate.contactPerson}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="h-4 w-4" />
                    <span>{corporate.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="h-4 w-4" />
                    <span>{corporate.phone}</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-xs text-gray-500">Total Employees</p>
                    <p className="text-lg font-semibold">{corporate.employeeCount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Total Claims</p>
                    <p className="text-lg font-semibold">{corporate.totalClaims}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Pending Claims</p>
                    <p className="text-lg font-semibold text-amber-600">{corporate.pendingClaims}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Settled Amount</p>
                    <p className="text-lg font-semibold text-green-600">{corporate.settledAmount}</p>
                  </div>
                </div>

                {/* Contract & Discount Info */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-xs text-gray-500">Contract Period</p>
                    <p className="text-sm font-medium">{new Date(corporate.contractStart).toLocaleDateString()} - {new Date(corporate.contractEnd).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Discount</p>
                    <p className="text-sm font-medium">
                      {corporate.discountType === 'percentage' ? `${corporate.discount}%` : `₹${corporate.discount}`}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4">
                  <Button variant="outline" size="sm" className="flex-1">
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    <FileText className="h-4 w-4 mr-1" />
                    View Claims
                  </Button>
                  <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </HospitalLayout>
  );
};

export default HospitalCorporateManagement;
