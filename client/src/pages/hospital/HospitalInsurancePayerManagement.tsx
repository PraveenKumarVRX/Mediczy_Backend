import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, Plus, Search, Edit, Trash2, FileText, Users,
  Calendar, DollarSign, CheckCircle, Activity, TrendingUp,
  Phone, Mail, MapPin, Building2, FileSignature, ClipboardList,
  IndianRupee, Percent, Eye, Download, Upload, AlertCircle
} from 'lucide-react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';

type ScheduleCharge = {
  id: number;
  procedure: string;
  department: string;
  hospitalRate: number;
  cghs: number;
  nabh: number;
  starHealth: number;
  hdfcErgo: number;
  custom: number;
};

const HospitalInsurancePayerManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedPayer, setSelectedPayer] = useState<any>(null);
  const [viewMoUDialog, setViewMoUDialog] = useState(false);
  const [viewChargesDialog, setViewChargesDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  
  const hospitalHeaders = () => {
    const token = localStorage.getItem('hospitalToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  
  // Insurance payers data (with mock fallback)
  const [payers, setPayers] = useState([
    {
      id: 1,
      name: 'Star Health Insurance',
      type: 'insurance',
      contactPerson: 'Ramesh Kumar',
      email: 'ramesh.kumar@starhealth.in',
      phone: '+91 98765 43210',
      address: 'Chennai, Tamil Nadu',
      status: 'active',
      mouStart: '2024-01-01',
      mouEnd: '2025-12-31',
      creditDays: 45,
      claimSettlementRatio: 92,
      totalClaims: 345,
      pendingClaims: 28,
      settledAmount: '₹1,24,56,890',
      mouDocument: 'star_health_mou_2024.pdf',
      tariffType: 'percentage',
      discount: 12,
      packageDeals: true
    },
    {
      id: 2,
      name: 'Medi Assist (TPA)',
      type: 'tpa',
      contactPerson: 'Priya Sharma',
      email: 'priya.sharma@mediassist.in',
      phone: '+91 99876 54321',
      address: 'Bangalore, Karnataka',
      status: 'active',
      mouStart: '2024-03-01',
      mouEnd: '2026-02-28',
      creditDays: 30,
      claimSettlementRatio: 88,
      totalClaims: 567,
      pendingClaims: 45,
      settledAmount: '₹2,45,67,890',
      mouDocument: 'mediassist_mou_2024.pdf',
      tariffType: 'cghs',
      discount: 0,
      packageDeals: true
    },
    {
      id: 3,
      name: 'HDFC Ergo Health',
      type: 'insurance',
      contactPerson: 'Amit Patel',
      email: 'amit.patel@hdfcergo.com',
      phone: '+91 97654 32109',
      address: 'Mumbai, Maharashtra',
      status: 'active',
      mouStart: '2024-06-01',
      mouEnd: '2025-05-31',
      creditDays: 60,
      claimSettlementRatio: 95,
      totalClaims: 289,
      pendingClaims: 15,
      settledAmount: '₹98,45,670',
      mouDocument: 'hdfc_ergo_mou_2024.pdf',
      tariffType: 'custom',
      discount: 15,
      packageDeals: false
    },
    {
      id: 4,
      name: 'Paramount TPA',
      type: 'tpa',
      contactPerson: 'Sneha Joshi',
      email: 'sneha.joshi@paramounttpa.com',
      phone: '+91 96543 21098',
      address: 'Pune, Maharashtra',
      status: 'active',
      mouStart: '2024-02-01',
      mouEnd: '2025-01-31',
      creditDays: 45,
      claimSettlementRatio: 90,
      totalClaims: 423,
      pendingClaims: 32,
      settledAmount: '₹1,78,90,450',
      mouDocument: 'paramount_mou_2024.pdf',
      tariffType: 'nabh',
      discount: 0,
      packageDeals: true
    },
    {
      id: 5,
      name: 'ICICI Lombard',
      type: 'insurance',
      contactPerson: 'Rajiv Menon',
      email: 'rajiv.menon@icicilombard.com',
      phone: '+91 95432 10987',
      address: 'Delhi',
      status: 'pending',
      mouStart: '2025-02-01',
      mouEnd: '2026-01-31',
      creditDays: 30,
      claimSettlementRatio: 0,
      totalClaims: 0,
      pendingClaims: 0,
      settledAmount: '₹0',
      mouDocument: 'icici_draft_mou_2025.pdf',
      tariffType: 'percentage',
      discount: 10,
      packageDeals: false
    }
  ]);

  // Sample Schedule of Charges (fallback)
  const defaultScheduleOfCharges: ScheduleCharge[] = [
    { 
      id: 1, 
      procedure: 'General Consultation', 
      department: 'OPD',
      hospitalRate: 500,
      cghs: 350,
      nabh: 400,
      starHealth: 450,
      hdfcErgo: 425,
      custom: 400
    },
    { 
      id: 2, 
      procedure: 'Appendectomy', 
      department: 'Surgery',
      hospitalRate: 45000,
      cghs: 35000,
      nabh: 38000,
      starHealth: 40000,
      hdfcErgo: 38250,
      custom: 39000
    },
    { 
      id: 3, 
      procedure: 'Cesarean Section', 
      department: 'Gynecology',
      hospitalRate: 55000,
      cghs: 42000,
      nabh: 46000,
      starHealth: 49500,
      hdfcErgo: 46750,
      custom: 48000
    },
    { 
      id: 4, 
      procedure: 'Angioplasty', 
      department: 'Cardiology',
      hospitalRate: 185000,
      cghs: 145000,
      nabh: 160000,
      starHealth: 162800,
      hdfcErgo: 157250,
      custom: 165000
    },
    { 
      id: 5, 
      procedure: 'ICU Per Day', 
      department: 'Critical Care',
      hospitalRate: 8500,
      cghs: 6500,
      nabh: 7200,
      starHealth: 7480,
      hdfcErgo: 7225,
      custom: 7400
    },
    { 
      id: 6, 
      procedure: 'MRI Scan', 
      department: 'Radiology',
      hospitalRate: 8000,
      cghs: 6000,
      nabh: 6800,
      starHealth: 7040,
      hdfcErgo: 6800,
      custom: 7000
    },
    { 
      id: 7, 
      procedure: 'Total Knee Replacement', 
      department: 'Orthopedics',
      hospitalRate: 225000,
      cghs: 175000,
      nabh: 190000,
      starHealth: 198000,
      hdfcErgo: 191250,
      custom: 200000
    },
    { 
      id: 8, 
      procedure: 'Dialysis Session', 
      department: 'Nephrology',
      hospitalRate: 3500,
      cghs: 2800,
      nabh: 3000,
      starHealth: 3080,
      hdfcErgo: 2975,
      custom: 3100
    }
  ];

  const [scheduleOfCharges, setScheduleOfCharges] = useState<ScheduleCharge[]>(defaultScheduleOfCharges);
  const [resourceVersionCount, setResourceVersionCount] = useState(0);

  const [formData, setFormData] = useState({
    name: '',
    type: 'insurance',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    mouStart: '',
    mouEnd: '',
    creditDays: '',
    tariffType: 'percentage',
    discount: ''
  });

  const stats = [
    { label: 'Total Payers', value: payers.length.toString(), icon: Shield, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Active Contracts', value: payers.filter(p => p.status === 'active').length.toString(), icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
    { label: 'TPAs', value: payers.filter(p => p.type === 'tpa').length.toString(), icon: Building2, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { label: 'Insurance Companies', value: payers.filter(p => p.type === 'insurance').length.toString(), icon: Shield, color: 'text-teal-500', bg: 'bg-teal-500/10' },
  ];

  const filteredPayers = payers.filter(payer => {
    const matchesSearch = payer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payer.contactPerson.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (activeTab === 'all') return matchesSearch;
    if (activeTab === 'tpa') return matchesSearch && payer.type === 'tpa';
    if (activeTab === 'insurance') return matchesSearch && payer.type === 'insurance';
    return matchesSearch;
  });

  const handleAddPayer = async () => {
    try {
      setLoading(true);
      
      const payload = {
        name: formData.name,
        code: formData.name.toUpperCase().replace(/\s+/g, '_').slice(0, 10),
        type: formData.type,
        contactPerson: formData.contactPerson,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        mouStart: formData.mouStart,
        mouEnd: formData.mouEnd,
        creditDays: parseInt(formData.creditDays) || 30,
        tariffType: formData.tariffType,
        discount: parseFloat(formData.discount) || 0,
        packageDeals: false
      };

      const response = await api.post('/insurance/admin/providers', payload, {
        headers: hospitalHeaders()
      });

      if (response.data.provider) {
        const newPayer = {
          id: response.data.provider.id,
          name: formData.name,
          type: formData.type,
          contactPerson: formData.contactPerson,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          status: 'active',
          mouStart: response.data.provider.mouStart || formData.mouStart,
          mouEnd: response.data.provider.mouEnd || formData.mouEnd,
          creditDays: response.data.provider.creditDays || parseInt(formData.creditDays) || 30,
          claimSettlementRatio: 0,
          totalClaims: 0,
          pendingClaims: 0,
          settledAmount: '₹0',
          mouDocument: response.data.provider.mouDocument || '',
          tariffType: response.data.provider.tariffType || formData.tariffType,
          discount: response.data.provider.discount ?? (parseFloat(formData.discount) || 0),
          packageDeals: false
        };
        
        setPayers(prev => [newPayer, ...prev]);
        toast({
          title: 'Success',
          description: 'Insurance payer added successfully'
        });
      }

      setIsAddDialogOpen(false);
      setFormData({
        name: '',
        type: 'insurance',
        contactPerson: '',
        email: '',
        phone: '',
        address: '',
        mouStart: '',
        mouEnd: '',
        creditDays: '',
        tariffType: 'percentage',
        discount: ''
      });
    } catch (error: any) {
      console.error('Error adding payer:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to add insurance payer',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch insurance providers on mount
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const response = await api.get('/insurance/admin/providers', {
          headers: hospitalHeaders()
        });
        if (response.data.providers) {
          const mappedPayers = response.data.providers.map((provider: any) => ({
            id: provider.id,
            name: provider.name,
            type: provider.type === 'tpa' || provider.supportedServices?.includes('TPA') ? 'tpa' : 'insurance',
            contactPerson: provider.contactPerson || '',
            email: provider.email || '',
            phone: provider.phone || '',
            address: typeof provider.address === 'string' ? provider.address : provider.address?.line1 || provider.address?.street || '',
            status: provider.isActive ? 'active' : 'inactive',
            mouStart: provider.mouStart || '',
            mouEnd: provider.mouEnd || '',
            creditDays: provider.creditDays || 30,
            claimSettlementRatio: provider.claimSettlementRatio || 0,
            totalClaims: provider.totalClaims || 0,
            pendingClaims: provider.pendingClaims || 0,
            settledAmount: provider.settledAmount || '₹0',
            mouDocument: provider.mouDocument || '',
            tariffType: provider.tariffType || 'percentage',
            discount: provider.discount || 0,
            packageDeals: !!provider.packageDeals
          }));
          if (mappedPayers.length > 0) {
            setPayers(mappedPayers);
          }
        }
      } catch (error) {
        console.error('Error fetching providers:', error);
        // Keep mock data on error
      }
    };
    fetchProviders();
  }, []);

  const loadPayerResources = async (payer: any) => {
    try {
      const response = await api.get(`/insurance/admin/providers/${payer.id}/resources`, {
        headers: hospitalHeaders()
      });

      const resources = response.data?.resources || {};
      const mou = resources.mou || {};
      const soc = Array.isArray(resources.soc) && resources.soc.length > 0 ? resources.soc : defaultScheduleOfCharges;
      const versionHistory = Array.isArray(resources.versionHistory) ? resources.versionHistory : [];

      const mergedPayer = {
        ...payer,
        mouStart: mou.startDate || payer.mouStart,
        mouEnd: mou.endDate || payer.mouEnd,
        creditDays: mou.creditDays || payer.creditDays,
        tariffType: mou.tariffType || payer.tariffType,
        discount: typeof mou.discount === 'number' ? mou.discount : payer.discount,
        packageDeals: typeof mou.packageDeals === 'boolean' ? mou.packageDeals : payer.packageDeals,
        mouDocument: mou.documentName || payer.mouDocument
      };

      setSelectedPayer(mergedPayer);
      setScheduleOfCharges(soc);
      setResourceVersionCount(versionHistory.length);
    } catch (error) {
      console.error('Failed to load payer resources:', error);
      setSelectedPayer(payer);
      setScheduleOfCharges(defaultScheduleOfCharges);
      setResourceVersionCount(0);
    }
  };

  const savePayerResources = async () => {
    if (!selectedPayer) return;

    try {
      setLoading(true);
      await api.put(
        `/insurance/admin/providers/${selectedPayer.id}/resources`,
        {
          mou: {
            startDate: selectedPayer.mouStart,
            endDate: selectedPayer.mouEnd,
            creditDays: selectedPayer.creditDays,
            tariffType: selectedPayer.tariffType,
            discount: selectedPayer.discount,
            packageDeals: selectedPayer.packageDeals,
            documentName: selectedPayer.mouDocument,
            claimSettlementRatio: selectedPayer.claimSettlementRatio,
            totalClaims: selectedPayer.totalClaims,
            pendingClaims: selectedPayer.pendingClaims,
            settledAmount: selectedPayer.settledAmount
          },
          soc: scheduleOfCharges
        },
        { headers: hospitalHeaders() }
      );

      setPayers((prev) =>
        prev.map((payer) => (payer.id === selectedPayer.id ? { ...payer, ...selectedPayer } : payer))
      );

      setResourceVersionCount((prev) => prev + 1);
      toast({ title: 'Saved', description: 'MoU and SOC resources updated successfully' });
    } catch (error: any) {
      console.error('Failed to save payer resources:', error);
      toast({
        title: 'Save failed',
        description: error.response?.data?.message || 'Unable to save payer resources',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const getTariffLabel = (tariffType: string) => {
    const labels: Record<string, string> = {
      'percentage': 'Hospital Rate - Discount %',
      'cghs': 'CGHS Rates',
      'nabh': 'NABH Rates',
      'custom': 'Custom Schedule'
    };
    return labels[tariffType] || tariffType;
  };

  return (
    <HospitalLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <Shield className="h-8 w-8 text-blue-600" />
              Insurance Payer Management
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Manage TPAs, Insurance Companies, MoUs and Schedule of Charges
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="border-blue-600 text-blue-600 hover:bg-blue-50">
              <Download className="h-4 w-4 mr-2" />
              Export Schedule
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Payer
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Insurance Payer</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="name">Payer Name *</Label>
                      <Input
                        id="name"
                        placeholder="Enter payer name"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="type">Payer Type *</Label>
                      <Select 
                        value={formData.type} 
                        onValueChange={(value) => setFormData({...formData, type: value})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select payer type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tpa">TPA (Third Party Administrator)</SelectItem>
                          <SelectItem value="insurance">Insurance Company</SelectItem>
                        </SelectContent>
                      </Select>
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
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="contact@payer.com"
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
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="address">Address</Label>
                      <Input
                        id="address"
                        placeholder="Enter address"
                        value={formData.address}
                        onChange={(e) => setFormData({...formData, address: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mouStart">MoU Start Date *</Label>
                      <Input
                        id="mouStart"
                        type="date"
                        value={formData.mouStart}
                        onChange={(e) => setFormData({...formData, mouStart: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mouEnd">MoU End Date *</Label>
                      <Input
                        id="mouEnd"
                        type="date"
                        value={formData.mouEnd}
                        onChange={(e) => setFormData({...formData, mouEnd: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="creditDays">Credit Days *</Label>
                      <Input
                        id="creditDays"
                        type="number"
                        placeholder="e.g., 30"
                        value={formData.creditDays}
                        onChange={(e) => setFormData({...formData, creditDays: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tariffType">Tariff Type *</Label>
                      <Select 
                        value={formData.tariffType} 
                        onValueChange={(value) => setFormData({...formData, tariffType: value})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select tariff type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">Hospital Rate - Discount %</SelectItem>
                          <SelectItem value="cghs">CGHS Rates</SelectItem>
                          <SelectItem value="nabh">NABH Rates</SelectItem>
                          <SelectItem value="custom">Custom Schedule</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {formData.tariffType === 'percentage' && (
                      <div className="space-y-2">
                        <Label htmlFor="discount">Discount % *</Label>
                        <Input
                          id="discount"
                          type="number"
                          placeholder="e.g., 15"
                          value={formData.discount}
                          onChange={(e) => setFormData({...formData, discount: e.target.value})}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddPayer} className="bg-blue-600 hover:bg-blue-700">
                      Add Payer
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
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

        {/* Tabs and Search */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
                <TabsList>
                  <TabsTrigger value="all">All Payers</TabsTrigger>
                  <TabsTrigger value="tpa">TPAs</TabsTrigger>
                  <TabsTrigger value="insurance">Insurance Companies</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search payers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payers Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredPayers.map((payer) => (
            <Card key={payer.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {payer.type === 'tpa' ? <Building2 className="h-5 w-5 text-purple-600" /> : <Shield className="h-5 w-5 text-blue-600" />}
                      {payer.name}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      {payer.type === 'tpa' ? 'Third Party Administrator' : 'Insurance Company'}
                    </CardDescription>
                  </div>
                  <Badge 
                    variant={payer.status === 'active' ? 'default' : 'secondary'}
                    className={payer.status === 'active' ? 'bg-green-500' : 'bg-amber-500'}
                  >
                    {payer.status === 'active' ? <CheckCircle className="h-3 w-3 mr-1" /> : <Activity className="h-3 w-3 mr-1" />}
                    {payer.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Contact Info */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users className="h-4 w-4" />
                    <span className="font-medium">{payer.contactPerson}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="h-4 w-4" />
                    <span>{payer.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="h-4 w-4" />
                    <span>{payer.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="h-4 w-4" />
                    <span>{payer.address}</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-xs text-gray-500">Total Claims</p>
                    <p className="text-lg font-semibold">{payer.totalClaims}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Pending Claims</p>
                    <p className="text-lg font-semibold text-amber-600">{payer.pendingClaims}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Settlement Ratio</p>
                    <p className="text-lg font-semibold text-green-600">{payer.claimSettlementRatio}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Settled Amount</p>
                    <p className="text-lg font-semibold text-green-600">{payer.settledAmount}</p>
                  </div>
                </div>

                {/* MoU & Tariff Info */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-xs text-gray-500">MoU Period</p>
                    <p className="text-sm font-medium">{new Date(payer.mouStart).toLocaleDateString()} - {new Date(payer.mouEnd).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Credit Days</p>
                    <p className="text-sm font-medium">{payer.creditDays} days</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500">Tariff Type</p>
                    <p className="text-sm font-medium">{getTariffLabel(payer.tariffType)}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={() => {
                      loadPayerResources(payer);
                      setViewMoUDialog(true);
                    }}
                  >
                    <FileSignature className="h-4 w-4 mr-1" />
                    View MoU
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={() => {
                      loadPayerResources(payer);
                      setViewChargesDialog(true);
                    }}
                  >
                    <ClipboardList className="h-4 w-4 mr-1" />
                    View Charges
                  </Button>
                  <Button variant="outline" size="sm">
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* MoU Dialog */}
        <Dialog open={viewMoUDialog} onOpenChange={setViewMoUDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Memorandum of Understanding - {selectedPayer?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-500">Payer Type</Label>
                  <p className="mt-1 text-sm font-semibold capitalize">{selectedPayer?.type}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Status</Label>
                  <Badge className="mt-1" variant={selectedPayer?.status === 'active' ? 'default' : 'secondary'}>
                    {selectedPayer?.status}
                  </Badge>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">MoU Start Date</Label>
                  <p className="mt-1 text-sm font-semibold">{selectedPayer && new Date(selectedPayer.mouStart).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">MoU End Date</Label>
                  <p className="mt-1 text-sm font-semibold">{selectedPayer && new Date(selectedPayer.mouEnd).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Credit Period</Label>
                  <p className="mt-1 text-sm font-semibold">{selectedPayer?.creditDays} days</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Settlement Ratio</Label>
                  <p className="mt-1 text-sm font-semibold text-green-600">{selectedPayer?.claimSettlementRatio}%</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Tariff Type</Label>
                  <p className="mt-1 text-sm font-semibold">{selectedPayer && getTariffLabel(selectedPayer.tariffType)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Package Deals</Label>
                  <p className="mt-1 text-sm font-semibold">{selectedPayer?.packageDeals ? 'Yes' : 'No'}</p>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <Label className="text-sm font-medium text-gray-500">Contact Person</Label>
                <div className="mt-2 space-y-2">
                  <p className="text-sm"><span className="font-medium">Name:</span> {selectedPayer?.contactPerson}</p>
                  <p className="text-sm"><span className="font-medium">Email:</span> {selectedPayer?.email}</p>
                  <p className="text-sm"><span className="font-medium">Phone:</span> {selectedPayer?.phone}</p>
                  <p className="text-sm"><span className="font-medium">Address:</span> {selectedPayer?.address}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <Label className="text-sm font-medium text-gray-500">MoU Document</Label>
                <div className="mt-2 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <span className="text-sm">{selectedPayer?.mouDocument}</span>
                  <Button variant="outline" size="sm" className="ml-auto">
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                </div>
              </div>

              <div className="text-xs text-gray-500">Resource versions tracked: {resourceVersionCount}</div>

              <div className="flex justify-end gap-3 pt-4">
                <Button onClick={savePayerResources} className="bg-blue-600 hover:bg-blue-700" disabled={loading}>
                  {loading ? 'Saving...' : 'Save MoU & SOC'}
                </Button>
                <Button variant="outline" onClick={() => setViewMoUDialog(false)}>
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Schedule of Charges Dialog */}
        <Dialog open={viewChargesDialog} onOpenChange={setViewChargesDialog}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Schedule of Charges - {selectedPayer?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[250px]">Procedure / Service</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead className="text-right">Hospital Rate</TableHead>
                      <TableHead className="text-right bg-blue-50">Agreed Rate</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scheduleOfCharges.map((charge) => {
                      const agreedRate = selectedPayer?.tariffType === 'cghs' ? charge.cghs :
                                        selectedPayer?.tariffType === 'nabh' ? charge.nabh :
                                        selectedPayer?.tariffType === 'custom' ? charge.custom :
                                        selectedPayer?.name.includes('Star') ? charge.starHealth :
                                        selectedPayer?.name.includes('HDFC') ? charge.hdfcErgo :
                                        charge.hospitalRate;
                      
                      const discount = ((charge.hospitalRate - agreedRate) / charge.hospitalRate * 100).toFixed(1);
                      
                      return (
                        <TableRow key={charge.id}>
                          <TableCell className="font-medium">{charge.procedure}</TableCell>
                          <TableCell>{charge.department}</TableCell>
                          <TableCell className="text-right">₹{charge.hospitalRate.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-semibold bg-blue-50">₹{agreedRate.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-green-600">{discount}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              
              <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <AlertCircle className="h-4 w-4" />
                  <span>Tariff Type: <strong>{selectedPayer && getTariffLabel(selectedPayer.tariffType)}</strong></span>
                </div>
                <Button variant="outline" size="sm" onClick={savePayerResources} disabled={loading}>
                  <Download className="h-4 w-4 mr-1" />
                  Save Schedule
                </Button>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setViewChargesDialog(false)}>
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </HospitalLayout>
  );
};

export default HospitalInsurancePayerManagement;
