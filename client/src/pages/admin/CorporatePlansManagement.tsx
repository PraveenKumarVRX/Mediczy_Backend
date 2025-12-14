import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { 
  Plus, 
  Search,
  Eye,
  Edit,
  Trash2,
  Building,
  Package,
  Star,
  Check,
  X,
  Gift,
  Shield,
  Heart,
  Stethoscope,
  Pill,
  Activity,
  Calendar,
  DollarSign,
  Users
} from 'lucide-react';
import api from '@/utils/api';

interface BenefitItem {
  id: string;
  name: string;
  category: string;
  description: string;
  isIncluded: boolean;
  limit?: string;
  coverage?: string;
}

interface CorporatePlan {
  id: string;
  corporateId: string;
  corporateName?: string;
  planName: string;
  planType: string;
  description: string;
  validFrom: string;
  validTo: string;
  totalEmployees: number;
  enrolledEmployees: number;
  premiumPerEmployee: number;
  totalPremium: number;
  status: string;
  benefits: BenefitItem[];
  features: {
    opd: boolean;
    ipd: boolean;
    maternity: boolean;
    dental: boolean;
    pharmacy: boolean;
    diagnostics: boolean;
    homecare: boolean;
    ambulance: boolean;
    wellness: boolean;
    mentalHealth: boolean;
  };
  coverage: {
    sumInsured: number;
    roomRent: string;
    icuRent: string;
    prePolicyMedical: string;
    postPolicyMedical: string;
  };
  createdAt: string;
}

interface Corporate {
  id: string;
  companyName: string;
}

const planTypes = ['Basic', 'Standard', 'Premium', 'Elite', 'Custom'];
const statusOptions = ['Active', 'Inactive', 'Pending', 'Expired', 'Suspended'];

const defaultBenefits: BenefitItem[] = [
  { id: 'b1', name: 'Hospitalization', category: 'IPD', description: 'Inpatient treatment coverage', isIncluded: true, coverage: '100%' },
  { id: 'b2', name: 'Pre-Hospitalization', category: 'IPD', description: 'Pre-admission expenses', isIncluded: true, limit: '30 days' },
  { id: 'b3', name: 'Post-Hospitalization', category: 'IPD', description: 'Post-discharge expenses', isIncluded: true, limit: '60 days' },
  { id: 'b4', name: 'OPD Consultation', category: 'OPD', description: 'Doctor consultation fees', isIncluded: true, limit: '₹500 per visit' },
  { id: 'b5', name: 'Diagnostic Tests', category: 'Diagnostics', description: 'Lab tests and scans', isIncluded: true, limit: '₹5000 per year' },
  { id: 'b6', name: 'Pharmacy Benefits', category: 'Pharmacy', description: 'Medicine reimbursement', isIncluded: true, limit: '₹10000 per year' },
  { id: 'b7', name: 'Maternity Coverage', category: 'Maternity', description: 'Pregnancy and delivery', isIncluded: false, coverage: '₹50000' },
  { id: 'b8', name: 'Dental Care', category: 'Dental', description: 'Dental treatments', isIncluded: false, limit: '₹15000 per year' },
  { id: 'b9', name: 'Annual Health Checkup', category: 'Wellness', description: 'Preventive health screening', isIncluded: true, limit: 'Once per year' },
  { id: 'b10', name: 'Ambulance Services', category: 'Emergency', description: 'Emergency transportation', isIncluded: true, limit: '₹2000 per incident' },
  { id: 'b11', name: 'Homecare Services', category: 'Homecare', description: 'At-home medical care', isIncluded: false, limit: '10 visits per year' },
  { id: 'b12', name: 'Mental Health', category: 'Mental Health', description: 'Counseling and therapy', isIncluded: false, limit: '5 sessions per year' },
  { id: 'b13', name: 'Ayush Treatment', category: 'Alternative', description: 'Ayurveda/Homeopathy', isIncluded: false, limit: '₹5000 per year' },
  { id: 'b14', name: 'Physiotherapy', category: 'Therapy', description: 'Physical rehabilitation', isIncluded: false, limit: '10 sessions per year' },
  { id: 'b15', name: 'Vision Care', category: 'Vision', description: 'Eye exams and glasses', isIncluded: false, limit: '₹5000 per year' },
];

const CorporatePlansManagement = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = localStorage.getItem('adminToken');

  // Plans state
  const [plans, setPlans] = useState<CorporatePlan[]>([]);
  const [filteredPlans, setFilteredPlans] = useState<CorporatePlan[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCorporate, setSelectedCorporate] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedPlanType, setSelectedPlanType] = useState('all');

  // Corporates list
  const [corporates, setCorporates] = useState<Corporate[]>([]);

  // Dialog states
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewingPlan, setViewingPlan] = useState<CorporatePlan | null>(null);
  const [editingPlan, setEditingPlan] = useState<CorporatePlan | null>(null);
  const [activeTab, setActiveTab] = useState('list');

  const [newPlan, setNewPlan] = useState({
    corporateId: '',
    planName: '',
    planType: 'Standard',
    description: '',
    validFrom: '',
    validTo: '',
    totalEmployees: '',
    premiumPerEmployee: '',
    status: 'Active',
    benefits: [...defaultBenefits],
    features: {
      opd: true,
      ipd: true,
      maternity: false,
      dental: false,
      pharmacy: true,
      diagnostics: true,
      homecare: false,
      ambulance: true,
      wellness: true,
      mentalHealth: false,
    },
    coverage: {
      sumInsured: '',
      roomRent: 'Single Room',
      icuRent: '2% of Sum Insured',
      prePolicyMedical: '30 days',
      postPolicyMedical: '60 days',
    }
  });

  useEffect(() => {
    fetchCorporates();
    fetchPlans();
  }, []);

  useEffect(() => {
    filterPlans();
  }, [searchTerm, selectedCorporate, selectedStatus, selectedPlanType, plans]);

  const fetchCorporates = async () => {
    try {
      const { data } = await api.get('/admin/corporates', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const corporateList = (data.data || []).map((corp: any) => ({
        id: corp.id,
        companyName: corp.companyName
      }));
      setCorporates(corporateList);
    } catch (err) {
      setCorporates([
        { id: 'corp_001', companyName: 'TechCorp Solutions' },
        { id: 'corp_002', companyName: 'Global Manufacturing Ltd' },
        { id: 'corp_003', companyName: 'StartupHub Inc' },
        { id: 'corp_004', companyName: 'HealthFirst Corporation' }
      ]);
    }
  };

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/corporate-plans', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      setPlans(data.data || []);
    } catch (err) {
      // Sample data
      const samplePlans: CorporatePlan[] = [
        {
          id: 'plan_001',
          corporateId: 'corp_001',
          corporateName: 'TechCorp Solutions',
          planName: 'TechCorp Premium Health Plan',
          planType: 'Premium',
          description: 'Comprehensive health insurance plan covering all employees with extensive benefits including OPD, IPD, maternity, and wellness programs.',
          validFrom: '2024-01-01',
          validTo: '2024-12-31',
          totalEmployees: 250,
          enrolledEmployees: 232,
          premiumPerEmployee: 15000,
          totalPremium: 3750000,
          status: 'Active',
          benefits: defaultBenefits.map(b => ({ ...b, isIncluded: b.category !== 'Alternative' })),
          features: {
            opd: true,
            ipd: true,
            maternity: true,
            dental: true,
            pharmacy: true,
            diagnostics: true,
            homecare: true,
            ambulance: true,
            wellness: true,
            mentalHealth: true,
          },
          coverage: {
            sumInsured: 500000,
            roomRent: 'Single AC Room',
            icuRent: '2% of Sum Insured',
            prePolicyMedical: '30 days',
            postPolicyMedical: '60 days',
          },
          createdAt: '2024-01-01T00:00:00Z'
        },
        {
          id: 'plan_002',
          corporateId: 'corp_002',
          corporateName: 'Global Manufacturing Ltd',
          planName: 'Manufacturing Workforce Plan',
          planType: 'Standard',
          description: 'Tailored health plan for manufacturing employees with focus on occupational health and emergency care.',
          validFrom: '2024-04-01',
          validTo: '2025-03-31',
          totalEmployees: 500,
          enrolledEmployees: 478,
          premiumPerEmployee: 8000,
          totalPremium: 4000000,
          status: 'Active',
          benefits: defaultBenefits.map(b => ({ ...b, isIncluded: ['IPD', 'OPD', 'Emergency', 'Diagnostics'].includes(b.category) })),
          features: {
            opd: true,
            ipd: true,
            maternity: false,
            dental: false,
            pharmacy: true,
            diagnostics: true,
            homecare: false,
            ambulance: true,
            wellness: true,
            mentalHealth: false,
          },
          coverage: {
            sumInsured: 300000,
            roomRent: 'Twin Sharing',
            icuRent: '1.5% of Sum Insured',
            prePolicyMedical: '15 days',
            postPolicyMedical: '30 days',
          },
          createdAt: '2024-04-01T00:00:00Z'
        },
        {
          id: 'plan_003',
          corporateId: 'corp_003',
          corporateName: 'StartupHub Inc',
          planName: 'Startup Essential Health Plan',
          planType: 'Basic',
          description: 'Cost-effective health plan for startups covering essential medical needs and preventive care.',
          validFrom: '2024-06-01',
          validTo: '2025-05-31',
          totalEmployees: 50,
          enrolledEmployees: 45,
          premiumPerEmployee: 5000,
          totalPremium: 250000,
          status: 'Active',
          benefits: defaultBenefits.map(b => ({ ...b, isIncluded: ['IPD', 'OPD', 'Wellness'].includes(b.category) })),
          features: {
            opd: true,
            ipd: true,
            maternity: false,
            dental: false,
            pharmacy: false,
            diagnostics: true,
            homecare: false,
            ambulance: true,
            wellness: true,
            mentalHealth: false,
          },
          coverage: {
            sumInsured: 200000,
            roomRent: 'General Ward',
            icuRent: '1% of Sum Insured',
            prePolicyMedical: '15 days',
            postPolicyMedical: '30 days',
          },
          createdAt: '2024-06-01T00:00:00Z'
        },
        {
          id: 'plan_004',
          corporateId: 'corp_004',
          corporateName: 'HealthFirst Corporation',
          planName: 'Elite Executive Health Plan',
          planType: 'Elite',
          description: 'Premium executive health plan with unlimited benefits, concierge services, and global coverage.',
          validFrom: '2024-01-01',
          validTo: '2024-12-31',
          totalEmployees: 150,
          enrolledEmployees: 150,
          premiumPerEmployee: 25000,
          totalPremium: 3750000,
          status: 'Active',
          benefits: defaultBenefits.map(b => ({ ...b, isIncluded: true })),
          features: {
            opd: true,
            ipd: true,
            maternity: true,
            dental: true,
            pharmacy: true,
            diagnostics: true,
            homecare: true,
            ambulance: true,
            wellness: true,
            mentalHealth: true,
          },
          coverage: {
            sumInsured: 1000000,
            roomRent: 'Suite/Deluxe Room',
            icuRent: '3% of Sum Insured',
            prePolicyMedical: '60 days',
            postPolicyMedical: '90 days',
          },
          createdAt: '2024-01-01T00:00:00Z'
        }
      ];
      setPlans(samplePlans);
    } finally {
      setLoading(false);
    }
  };

  const filterPlans = () => {
    let filtered = plans;

    if (searchTerm) {
      filtered = filtered.filter(plan =>
        plan.planName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        plan.corporateName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        plan.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedCorporate !== 'all') {
      filtered = filtered.filter(plan => plan.corporateId === selectedCorporate);
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(plan => plan.status === selectedStatus);
    }

    if (selectedPlanType !== 'all') {
      filtered = filtered.filter(plan => plan.planType === selectedPlanType);
    }

    setFilteredPlans(filtered);
  };

  const handleViewPlan = (plan: CorporatePlan) => {
    setViewingPlan(plan);
    setIsViewDialogOpen(true);
  };

  const handleEditPlan = (plan: CorporatePlan) => {
    setEditingPlan(plan);
    setNewPlan({
      corporateId: plan.corporateId,
      planName: plan.planName,
      planType: plan.planType,
      description: plan.description,
      validFrom: plan.validFrom,
      validTo: plan.validTo,
      totalEmployees: plan.totalEmployees.toString(),
      premiumPerEmployee: plan.premiumPerEmployee.toString(),
      status: plan.status,
      benefits: [...plan.benefits],
      features: { ...plan.features },
      coverage: {
        sumInsured: plan.coverage.sumInsured.toString(),
        roomRent: plan.coverage.roomRent,
        icuRent: plan.coverage.icuRent,
        prePolicyMedical: plan.coverage.prePolicyMedical,
        postPolicyMedical: plan.coverage.postPolicyMedical,
      }
    });
    setActiveTab('create');
  };

  const handleDeletePlan = async (planId: string) => {
    if (!confirm('Are you sure you want to delete this plan?')) return;
    
    try {
      setLoading(true);
      await api.delete(`/admin/corporate-plans/${planId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      setResult({ message: 'Plan deleted successfully' });
      fetchPlans();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to delete plan');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const planData = {
        ...newPlan,
        totalEmployees: parseInt(newPlan.totalEmployees),
        premiumPerEmployee: parseFloat(newPlan.premiumPerEmployee),
        totalPremium: parseInt(newPlan.totalEmployees) * parseFloat(newPlan.premiumPerEmployee),
        coverage: {
          ...newPlan.coverage,
          sumInsured: parseFloat(newPlan.coverage.sumInsured)
        }
      };

      if (editingPlan) {
        await api.put(`/admin/corporate-plans/${editingPlan.id}`, planData, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        setResult({ message: 'Plan updated successfully' });
      } else {
        await api.post('/admin/corporate-plans', planData, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        setResult({ message: 'Plan created successfully' });
      }

      resetForm();
      setActiveTab('list');
      fetchPlans();
    } catch (err: any) {
      setError(err?.response?.data?.message || `Failed to ${editingPlan ? 'update' : 'create'} plan`);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNewPlan({
      corporateId: '',
      planName: '',
      planType: 'Standard',
      description: '',
      validFrom: '',
      validTo: '',
      totalEmployees: '',
      premiumPerEmployee: '',
      status: 'Active',
      benefits: [...defaultBenefits],
      features: {
        opd: true,
        ipd: true,
        maternity: false,
        dental: false,
        pharmacy: true,
        diagnostics: true,
        homecare: false,
        ambulance: true,
        wellness: true,
        mentalHealth: false,
      },
      coverage: {
        sumInsured: '',
        roomRent: 'Single Room',
        icuRent: '2% of Sum Insured',
        prePolicyMedical: '30 days',
        postPolicyMedical: '60 days',
      }
    });
    setEditingPlan(null);
  };

  const toggleBenefit = (benefitId: string) => {
    setNewPlan({
      ...newPlan,
      benefits: newPlan.benefits.map(b => 
        b.id === benefitId ? { ...b, isIncluded: !b.isIncluded } : b
      )
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-green-500/10 border-green-500/20 text-green-700';
      case 'Inactive': return 'bg-gray-500/10 border-gray-500/20 text-gray-700';
      case 'Pending': return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-700';
      case 'Expired': return 'bg-red-500/10 border-red-500/20 text-red-700';
      case 'Suspended': return 'bg-orange-500/10 border-orange-500/20 text-orange-700';
      default: return 'bg-gray-500/10 border-gray-500/20 text-gray-700';
    }
  };

  const getPlanTypeColor = (type: string) => {
    switch (type) {
      case 'Elite': return 'bg-purple-500/10 border-purple-500/20 text-purple-700';
      case 'Premium': return 'bg-blue-500/10 border-blue-500/20 text-blue-700';
      case 'Standard': return 'bg-green-500/10 border-green-500/20 text-green-700';
      case 'Basic': return 'bg-gray-500/10 border-gray-500/20 text-gray-700';
      case 'Custom': return 'bg-orange-500/10 border-orange-500/20 text-orange-700';
      default: return 'bg-gray-500/10 border-gray-500/20 text-gray-700';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <Package className="h-8 w-8 text-purple-500" />
              Corporate Plans Management
            </h2>
            <p className="text-muted-foreground">Create and manage customized health plans for corporate clients</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Plans</p>
                  <p className="text-3xl font-bold">{plans.length}</p>
                </div>
                <Package className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Plans</p>
                  <p className="text-3xl font-bold">{plans.filter(p => p.status === 'Active').length}</p>
                </div>
                <Activity className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Covered</p>
                  <p className="text-3xl font-bold">{plans.reduce((sum, p) => sum + p.enrolledEmployees, 0)}</p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Premium</p>
                  <p className="text-3xl font-bold">₹{(plans.reduce((sum, p) => sum + p.totalPremium, 0) / 100000).toFixed(1)}L</p>
                </div>
                <DollarSign className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
            {result.message}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">All Plans</TabsTrigger>
            <TabsTrigger value="create">{editingPlan ? 'Edit Plan' : 'Create Plan'}</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-purple-500" />
                  Corporate Health Plans ({filteredPlans.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Search and Filter */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search plans..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={selectedCorporate} onValueChange={setSelectedCorporate}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="Corporate" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Corporates</SelectItem>
                      {corporates.map((corp) => (
                        <SelectItem key={corp.id} value={corp.id}>{corp.companyName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedPlanType} onValueChange={setSelectedPlanType}>
                    <SelectTrigger className="w-full sm:w-[140px]">
                      <SelectValue placeholder="Plan Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {planTypes.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="w-full sm:w-[140px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      {statusOptions.map((status) => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Plans Table */}
                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto"></div>
                    <p className="text-muted-foreground mt-2">Loading plans...</p>
                  </div>
                ) : filteredPlans.length > 0 ? (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Plan Details</TableHead>
                          <TableHead>Corporate</TableHead>
                          <TableHead>Coverage & Premium</TableHead>
                          <TableHead>Employees</TableHead>
                          <TableHead>Validity</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPlans.map((plan) => (
                          <TableRow key={plan.id}>
                            <TableCell>
                              <div className="flex items-start gap-3">
                                <div className="p-2 rounded-full bg-purple-500/10">
                                  <Package className="h-4 w-4 text-purple-500" />
                                </div>
                                <div>
                                  <div className="font-medium">{plan.planName}</div>
                                  <Badge variant="outline" className={`${getPlanTypeColor(plan.planType)} text-xs mt-1`}>
                                    {plan.planType}
                                  </Badge>
                                  <div className="text-xs text-muted-foreground mt-1">ID: {plan.id}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Building className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{plan.corporateName}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Shield className="h-4 w-4 text-blue-500" />
                                  <span className="font-semibold text-blue-600">₹{(plan.coverage.sumInsured / 100000).toFixed(1)}L</span>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  ₹{plan.premiumPerEmployee.toLocaleString()}/employee
                                </div>
                                <div className="text-xs font-medium text-green-600">
                                  Total: ₹{(plan.totalPremium / 100000).toFixed(2)}L
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{plan.enrolledEmployees} / {plan.totalEmployees}</div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-green-500 h-2 rounded-full" 
                                    style={{ width: `${(plan.enrolledEmployees / plan.totalEmployees) * 100}%` }}
                                  ></div>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {Math.round((plan.enrolledEmployees / plan.totalEmployees) * 100)}% enrolled
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm">
                                  <Calendar className="h-3 w-3 text-muted-foreground" />
                                  <span>{formatDate(plan.validFrom)}</span>
                                </div>
                                <div className="text-sm text-muted-foreground">to {formatDate(plan.validTo)}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={getStatusColor(plan.status)}>
                                {plan.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-8 w-8 p-0" 
                                  onClick={() => handleViewPlan(plan)}
                                  title="View Details"
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-8 w-8 p-0"
                                  onClick={() => handleEditPlan(plan)}
                                  title="Edit Plan"
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                  onClick={() => handleDeletePlan(plan.id)}
                                  title="Delete Plan"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No plans found</h3>
                    <p className="text-muted-foreground mb-4">
                      {searchTerm || selectedCorporate !== 'all' || selectedStatus !== 'all' || selectedPlanType !== 'all'
                        ? 'No plans match your search criteria.'
                        : 'Get started by creating your first corporate health plan.'}
                    </p>
                    <Button onClick={() => setActiveTab('create')}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Plan
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle>{editingPlan ? 'Edit Corporate Plan' : 'Create Corporate Plan'}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitPlan} className="space-y-6">
                  {/* Basic Information */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Basic Information</Label>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label>Corporate *</Label>
                        <Select 
                          value={newPlan.corporateId} 
                          onValueChange={(val) => setNewPlan({...newPlan, corporateId: val})}
                          required
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select corporate" />
                          </SelectTrigger>
                          <SelectContent>
                            {corporates.map(corp => (
                              <SelectItem key={corp.id} value={corp.id}>{corp.companyName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Plan Name *</Label>
                        <Input
                          required
                          value={newPlan.planName}
                          onChange={(e) => setNewPlan({...newPlan, planName: e.target.value})}
                          placeholder="Premium Health Plan"
                        />
                      </div>
                      <div>
                        <Label>Plan Type *</Label>
                        <Select 
                          value={newPlan.planType} 
                          onValueChange={(val) => setNewPlan({...newPlan, planType: val})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            {planTypes.map(type => (
                              <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Status *</Label>
                        <Select 
                          value={newPlan.status} 
                          onValueChange={(val) => setNewPlan({...newPlan, status: val})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map(status => (
                              <SelectItem key={status} value={status}>{status}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-2">
                        <Label>Description *</Label>
                        <Textarea
                          required
                          value={newPlan.description}
                          onChange={(e) => setNewPlan({...newPlan, description: e.target.value})}
                          placeholder="Comprehensive health plan covering..."
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Financial Details */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Financial Details</Label>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <Label>Total Employees *</Label>
                        <Input
                          type="number"
                          required
                          value={newPlan.totalEmployees}
                          onChange={(e) => setNewPlan({...newPlan, totalEmployees: e.target.value})}
                          placeholder="250"
                        />
                      </div>
                      <div>
                        <Label>Premium Per Employee (₹) *</Label>
                        <Input
                          type="number"
                          required
                          value={newPlan.premiumPerEmployee}
                          onChange={(e) => setNewPlan({...newPlan, premiumPerEmployee: e.target.value})}
                          placeholder="15000"
                        />
                      </div>
                      <div>
                        <Label>Sum Insured (₹) *</Label>
                        <Input
                          type="number"
                          required
                          value={newPlan.coverage.sumInsured}
                          onChange={(e) => setNewPlan({...newPlan, coverage: {...newPlan.coverage, sumInsured: e.target.value}})}
                          placeholder="500000"
                        />
                      </div>
                      {newPlan.totalEmployees && newPlan.premiumPerEmployee && (
                        <div className="md:col-span-3 p-4 bg-blue-50 rounded-lg">
                          <div className="text-sm text-muted-foreground">Total Premium Amount</div>
                          <div className="text-2xl font-bold text-blue-600">
                            ₹{(parseInt(newPlan.totalEmployees || '0') * parseFloat(newPlan.premiumPerEmployee || '0')).toLocaleString()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Validity Period */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Validity Period</Label>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label>Valid From *</Label>
                        <Input
                          type="date"
                          required
                          value={newPlan.validFrom}
                          onChange={(e) => setNewPlan({...newPlan, validFrom: e.target.value})}
                        />
                      </div>
                      <div>
                        <Label>Valid To *</Label>
                        <Input
                          type="date"
                          required
                          value={newPlan.validTo}
                          onChange={(e) => setNewPlan({...newPlan, validTo: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Coverage Details */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Coverage Details</Label>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label>Room Rent</Label>
                        <Input
                          value={newPlan.coverage.roomRent}
                          onChange={(e) => setNewPlan({...newPlan, coverage: {...newPlan.coverage, roomRent: e.target.value}})}
                          placeholder="Single AC Room"
                        />
                      </div>
                      <div>
                        <Label>ICU Rent</Label>
                        <Input
                          value={newPlan.coverage.icuRent}
                          onChange={(e) => setNewPlan({...newPlan, coverage: {...newPlan.coverage, icuRent: e.target.value}})}
                          placeholder="2% of Sum Insured"
                        />
                      </div>
                      <div>
                        <Label>Pre-Policy Medical</Label>
                        <Input
                          value={newPlan.coverage.prePolicyMedical}
                          onChange={(e) => setNewPlan({...newPlan, coverage: {...newPlan.coverage, prePolicyMedical: e.target.value}})}
                          placeholder="30 days"
                        />
                      </div>
                      <div>
                        <Label>Post-Policy Medical</Label>
                        <Input
                          value={newPlan.coverage.postPolicyMedical}
                          onChange={(e) => setNewPlan({...newPlan, coverage: {...newPlan.coverage, postPolicyMedical: e.target.value}})}
                          placeholder="60 days"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Features */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Plan Features</Label>
                    <div className="grid md:grid-cols-3 gap-4">
                      {Object.entries(newPlan.features).map(([key, value]) => (
                        <div key={key} className="flex items-center space-x-2 p-3 border rounded-lg">
                          <Switch
                            checked={value}
                            onCheckedChange={(checked) => 
                              setNewPlan({...newPlan, features: {...newPlan.features, [key]: checked}})
                            }
                          />
                          <Label className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Benefits */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Plan Benefits</Label>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {newPlan.benefits.map((benefit) => (
                        <div key={benefit.id} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50">
                          <Checkbox
                            checked={benefit.isIncluded}
                            onCheckedChange={() => toggleBenefit(benefit.id)}
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{benefit.name}</span>
                              <Badge variant="outline" className="text-xs">{benefit.category}</Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">{benefit.description}</div>
                            {benefit.isIncluded && (benefit.limit || benefit.coverage) && (
                              <div className="text-xs text-blue-600 mt-1">
                                {benefit.limit && `Limit: ${benefit.limit}`}
                                {benefit.coverage && `Coverage: ${benefit.coverage}`}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <div className="text-sm font-medium text-green-800">
                        {newPlan.benefits.filter(b => b.isIncluded).length} of {newPlan.benefits.length} benefits included
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <Button type="submit" disabled={loading} className="flex-1">
                      <Plus className="mr-2 h-4 w-4" />
                      {loading ? (editingPlan ? 'Updating...' : 'Creating...') : (editingPlan ? 'Update Plan' : 'Create Plan')}
                    </Button>
                    {editingPlan && (
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => {
                          resetForm();
                          setActiveTab('list');
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* View Plan Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-purple-500" />
                {viewingPlan?.planName}
              </DialogTitle>
            </DialogHeader>
            {viewingPlan && (
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground">Plan Information</Label>
                      <div className="mt-2 space-y-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Plan Name</Label>
                          <p className="font-medium">{viewingPlan.planName}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Plan Type</Label>
                          <Badge variant="outline" className={getPlanTypeColor(viewingPlan.planType)}>
                            {viewingPlan.planType}
                          </Badge>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Corporate</Label>
                          <p>{viewingPlan.corporateName}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Description</Label>
                          <p className="text-sm">{viewingPlan.description}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground">Financial Details</Label>
                      <div className="mt-2 space-y-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Sum Insured</Label>
                          <p className="text-lg font-semibold text-blue-600">₹{viewingPlan.coverage.sumInsured.toLocaleString()}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Premium Per Employee</Label>
                          <p className="font-medium">₹{viewingPlan.premiumPerEmployee.toLocaleString()}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Total Premium</Label>
                          <p className="text-lg font-semibold text-green-600">₹{viewingPlan.totalPremium.toLocaleString()}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Employees</Label>
                          <p>{viewingPlan.enrolledEmployees} / {viewingPlan.totalEmployees} enrolled</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <Label className="text-sm font-semibold text-muted-foreground">Plan Features</Label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {Object.entries(viewingPlan.features).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2 text-sm">
                          {value ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <X className="h-4 w-4 text-red-500" />
                          )}
                          <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-semibold text-muted-foreground">Coverage Details</Label>
                    <div className="mt-2 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Room Rent:</span>
                        <span className="font-medium">{viewingPlan.coverage.roomRent}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ICU Rent:</span>
                        <span className="font-medium">{viewingPlan.coverage.icuRent}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Pre-Policy:</span>
                        <span className="font-medium">{viewingPlan.coverage.prePolicyMedical}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Post-Policy:</span>
                        <span className="font-medium">{viewingPlan.coverage.postPolicyMedical}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-semibold text-muted-foreground">Included Benefits ({viewingPlan.benefits.filter(b => b.isIncluded).length})</Label>
                  <div className="mt-2 grid md:grid-cols-2 gap-2">
                    {viewingPlan.benefits.filter(b => b.isIncluded).map((benefit) => (
                      <div key={benefit.id} className="flex items-start gap-2 text-sm p-2 border rounded">
                        <Check className="h-4 w-4 text-green-500 mt-0.5" />
                        <div className="flex-1">
                          <div className="font-medium">{benefit.name}</div>
                          {(benefit.limit || benefit.coverage) && (
                            <div className="text-xs text-blue-600">
                              {benefit.limit || benefit.coverage}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => handleEditPlan(viewingPlan)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Plan
                  </Button>
                  <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default CorporatePlansManagement;
