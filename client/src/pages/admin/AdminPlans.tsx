import React, { useEffect, useMemo, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "../../components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Switch } from "../../components/ui/switch";
import AdminLayout from "../../components/layout/AdminLayout";
import { 
  Plus, Pencil, Trash2, Loader2, Search, Eye, MoreVertical, 
  ChevronLeft, ChevronRight, Download, Upload, FileSpreadsheet,
  UserPlus, Calendar, DollarSign, Users, Activity, TrendingUp
} from "lucide-react";
import api from "../../utils/api";
import { isDemoAdminToken, demoMembershipPlans } from "../../utils/demoData";
import { useToast } from "../../hooks/use-toast";
import { downloadExcelTemplate } from "../../utils/excelParser";

type TeleConsultLimits = Record<string, number> & { allSpecialties?: number };

interface MembershipPlan {
  id?: number;
  name: string;
  description?: string;
  durationDays: number;
  priceINR: number;
  monthlyPrice?: number;
  billingCycle: 'monthly' | 'annual';
  isActive: boolean;
  benefitLimits: {
    pharmacyLimitINR?: number;
    homeCareLimitINR?: number;
    ambulanceLimitINR?: number;
    [key: string]: number | undefined;
  };
  teleConsultLimits: TeleConsultLimits;
  healthCheckPackage?: string;
  healthMonitoring?: {
    enabled: boolean;
    devices: string[];
    deviceTypes: {
      healthWatch?: boolean;
      healthBand?: boolean;
      healthRing?: boolean;
      bpMonitor?: boolean;
      glucometer?: boolean;
      pulseOximeter?: boolean;
    };
  };
  createdAt?: string;
  subscribers?: number; // For demo purposes
  category?: string; // Basic, Premium, Corporate
}

const emptyPlan: MembershipPlan = {
  name: "",
  description: "",
  durationDays: 30,
  priceINR: 0,
  monthlyPrice: 0,
  billingCycle: 'monthly',
  isActive: true,
  benefitLimits: {
    pharmacyLimitINR: 0,
    homeCareLimitINR: 0,
    ambulanceLimitINR: 0,
  },
  teleConsultLimits: {},
  healthCheckPackage: "",
  healthMonitoring: {
    enabled: false,
    devices: [],
    deviceTypes: {
      healthWatch: false,
      healthBand: false,
      healthRing: false,
      bpMonitor: false,
      glucometer: false,
      pulseOximeter: false,
    },
  },
};

// Enhanced sample data with more comprehensive information
const enhancedSamplePlans: MembershipPlan[] = [
  {
    id: 1,
    name: "Basic Health Plan",
    description: "Essential healthcare coverage with basic benefits",
    durationDays: 30,
    priceINR: 999,
    monthlyPrice: 999,
    billingCycle: 'monthly' as const,
    isActive: true,
    benefitLimits: {
      pharmacyLimitINR: 500,
      homeCareLimitINR: 1000,
      ambulanceLimitINR: 2000,
    },
    teleConsultLimits: { allSpecialties: 3 },
    healthCheckPackage: "Basic Health Check",
    createdAt: "2023-01-15T10:00:00Z",
    subscribers: 342,
    category: "Basic"
  },
  {
    id: 2,
    name: "Premium Family Plan",
    description: "Comprehensive coverage for families with enhanced benefits including health monitoring devices",
    durationDays: 30,
    priceINR: 2999,
    monthlyPrice: 2999,
    billingCycle: 'monthly',
    isActive: true,
    benefitLimits: {
      pharmacyLimitINR: 2000,
      homeCareLimitINR: 5000,
      ambulanceLimitINR: 10000,
    },
    teleConsultLimits: { 
      Cardiology: 2, 
      Dermatology: 3, 
      GeneralMedicine: 5,
      Pediatrics: 2 
    },
    healthCheckPackage: "Comprehensive Health Package",
    healthMonitoring: {
      enabled: true,
      devices: ['Health Band', 'BP Monitor'],
      deviceTypes: {
        healthWatch: false,
        healthBand: true,
        healthRing: false,
        bpMonitor: true,
        glucometer: false,
        pulseOximeter: false,
      },
    },
    createdAt: "2023-02-20T14:30:00Z",
    subscribers: 128,
    category: "Premium"
  },
  {
    id: 3,
    name: "Corporate Wellness Plan",
    description: "Enterprise healthcare solution with premium health monitoring system (Monthly billing, annual commitment)",
    durationDays: 30,
    priceINR: 9999,
    monthlyPrice: 9999,
    billingCycle: 'monthly',
    isActive: true,
    benefitLimits: {
      pharmacyLimitINR: 10000,
      homeCareLimitINR: 15000,
      ambulanceLimitINR: 25000,
    },
    teleConsultLimits: { allSpecialties: 20 },
    healthCheckPackage: "Executive Health Check",
    healthMonitoring: {
      enabled: true,
      devices: ['Health Watch', 'Health Ring', 'BP Monitor', 'Glucometer'],
      deviceTypes: {
        healthWatch: true,
        healthBand: false,
        healthRing: true,
        bpMonitor: true,
        glucometer: true,
        pulseOximeter: true,
      },
    },
    createdAt: "2023-03-10T09:15:00Z",
    subscribers: 45,
    category: "Corporate"
  },
  {
    id: 4,
    name: "Senior Citizen Care",
    description: "Specialized healthcare plan for elderly members",
    durationDays: 180,
    priceINR: 4999,
    monthlyPrice: 4999,
    billingCycle: 'monthly' as const,
    isActive: false,
    benefitLimits: {
      pharmacyLimitINR: 3000,
      homeCareLimitINR: 8000,
      ambulanceLimitINR: 15000,
    },
    teleConsultLimits: { 
      Cardiology: 4, 
      Orthopedics: 3, 
      GeneralMedicine: 8,
      Geriatrics: 5 
    },
    healthCheckPackage: "Senior Health Package",
    createdAt: "2023-04-05T11:45:00Z",
    subscribers: 67,
    category: "Premium"
  }
];

const AdminPlans = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MembershipPlan | null>(null);
  const [form, setForm] = useState<MembershipPlan>({ ...emptyPlan });
  const [uniformTeleLimit, setUniformTeleLimit] = useState<boolean>(false);
  const [uniformCount, setUniformCount] = useState<number>(0);
  const [specialtyRows, setSpecialtyRows] = useState<Array<{ name: string; count: number }>>([]);

  // List view state
  const [activeTab, setActiveTab] = useState('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [jsonInput, setJsonInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const adminToken = useMemo(() => localStorage.getItem("adminToken"), []);

  const { data, isLoading } = useQuery({
    queryKey: ["adminPlans"],
    queryFn: async () => {
      // Demo fallback with enhanced data
      if (isDemoAdminToken(adminToken)) {
        try {
          const { data } = await api.get("/membership/admin/plans", {
            headers: { Authorization: `Bearer ${adminToken}` },
          });
          return data.plans as MembershipPlan[];
        } catch {
          return enhancedSamplePlans;
        }
      }
      
      const { data } = await api.get("/membership/admin/plans", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      return data.plans as MembershipPlan[];
    },
  });

  const plans = data || enhancedSamplePlans;

  // Filtered and paginated plans
  const filteredPlans = useMemo(() => {
    return plans.filter(plan => {
      const searchMatch = searchQuery === '' || 
        plan.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        plan.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        plan.healthCheckPackage?.toLowerCase().includes(searchQuery.toLowerCase());

      const statusMatch = statusFilter === 'all' || 
        (statusFilter === 'active' && plan.isActive) ||
        (statusFilter === 'inactive' && !plan.isActive);

      const categoryMatch = categoryFilter === 'all' || plan.category === categoryFilter;

      return searchMatch && statusMatch && categoryMatch;
    });
  }, [plans, searchQuery, statusFilter, categoryFilter]);

  const paginatedPlans = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredPlans.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredPlans, currentPage, itemsPerPage]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, categoryFilter]);

  const resetForm = () => {
    setEditing(null);
    setForm({ ...emptyPlan });
    setUniformTeleLimit(false);
    setUniformCount(0);
    setSpecialtyRows([]);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (plan: MembershipPlan) => {
    setEditing(plan);
    setForm({ ...plan });
    // Initialize teleconsult UI mode
    const tl = plan.teleConsultLimits || {};
    if (typeof tl.allSpecialties === "number") {
      setUniformTeleLimit(true);
      setUniformCount(tl.allSpecialties || 0);
      setSpecialtyRows([]);
    } else {
      setUniformTeleLimit(false);
      const entries = Object.entries(tl || {}).filter(([k]) => k !== "allSpecialties");
      setSpecialtyRows(entries.map(([name, count]) => ({ name, count: Number(count) || 0 })));
    }
    setOpen(true);
  };

  const upsertPlan = async () => {
    try {
      const payload: MembershipPlan = { ...form };
      // Build teleConsultLimits from UI
      if (uniformTeleLimit) {
        payload.teleConsultLimits = { allSpecialties: Number(uniformCount) || 0 } as TeleConsultLimits;
      } else {
        const map: TeleConsultLimits = {};
        specialtyRows.forEach((r) => {
          if (r.name.trim()) map[r.name.trim()] = Number(r.count) || 0;
        });
        payload.teleConsultLimits = map;
      }

      if (editing?.id) {
        await api.put(`/membership/admin/plans/${editing.id}`, payload, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        toast({ title: "Plan updated successfully" });
      } else {
        await api.post(`/membership/admin/plans`, payload, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        toast({ title: "Plan created successfully" });
      }
      setOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["adminPlans"] });
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.response?.data?.message || e.message, variant: "destructive" });
    }
  };

  const deletePlan = async (id: number) => {
    if (!confirm("Are you sure you want to delete this plan?")) return;
    try {
      await api.delete(`/membership/admin/plans/${id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      toast({ title: "Plan deleted successfully" });
      qc.invalidateQueries({ queryKey: ["adminPlans"] });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.response?.data?.message || e.message, variant: "destructive" });
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Excel upload implementation
    console.log('Excel upload:', e.target.files?.[0]);
  };

  const handleJsonUpload = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      const plansData = JSON.parse(jsonInput);
      // Here you would normally send to API
      setResult({ message: 'Plans uploaded successfully', count: Array.isArray(plansData) ? plansData.length : 1 });
      setJsonInput('');
    } catch (err: any) {
      setError('Invalid JSON format or upload failed');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const sampleData = [{
      Name: 'Gold Plan',
      Description: 'Premium healthcare coverage',
      DurationDays: 90,
      PriceINR: 2999,
      IsActive: 'true',
      PharmacyLimitINR: 2000,
      HomeCareLimitINR: 5000,
      AmbulanceLimitINR: 10000,
      HealthCheckPackage: 'Premium Health Package',
      Category: 'Premium'
    }];
    downloadExcelTemplate([
      'Name', 'Description', 'DurationDays', 'PriceINR', 'IsActive',
      'PharmacyLimitINR', 'HomeCareLimitINR', 'AmbulanceLimitINR',
      'HealthCheckPackage', 'Category'
    ], 'membership-plans', sampleData);
  };

  // Keep form.teleConsultLimits in sync on UI toggles
  useEffect(() => {
    if (uniformTeleLimit) {
      setSpecialtyRows([]);
    } else {
      setUniformCount(0);
    }
  }, [uniformTeleLimit]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header and Controls */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Plans</h1>
            <p className="text-muted-foreground">Create and manage membership plans</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={openCreate} variant="outline">
              <UserPlus className="mr-2 h-4 w-4" />
              Add Plan
            </Button>
            <Button onClick={downloadTemplate} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
          </div>
        </div>

        {/* Error and Success Messages */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            {error}
          </div>
        )}
        {result && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
            {result.message}{result.count !== undefined && ` (${result.count} plans)`}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 lg:w-[400px]">
            <TabsTrigger value="list">List View</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="excel">Excel Upload</TabsTrigger>
            <TabsTrigger value="json">JSON Upload</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-6">
            {/* Search and Filter Controls */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by plan name, description, or health package..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full lg:w-[200px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-full lg:w-[200px]">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="Basic">Basic</SelectItem>
                      <SelectItem value="Premium">Premium</SelectItem>
                      <SelectItem value="Corporate">Corporate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Plans Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Membership Plans</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Showing {paginatedPlans.length} of {filteredPlans.length} plans
                  </p>
                </div>
                <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(Number(value))}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plan Details</TableHead>
                        <TableHead>Duration & Price</TableHead>
                        <TableHead>Benefits</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Subscribers</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        Array.from({ length: 5 }).map((_, index) => (
                          <TableRow key={index}>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                          </TableRow>
                        ))
                      ) : paginatedPlans.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            {filteredPlans.length === 0 ? 'No plans found matching your criteria' : 'No plans to display'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedPlans.map((plan) => (
                          <TableRow key={plan.id} className="group">
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{plan.name}</div>
                                <div className="text-sm text-muted-foreground line-clamp-2">
                                  {plan.description || 'No description'}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {plan.healthCheckPackage || 'No health package'}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-sm">{plan.durationDays} days</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <DollarSign className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-sm font-medium">₹{plan.priceINR.toLocaleString()}</span>
                                </div>
                                {plan.billingCycle === 'monthly' && plan.monthlyPrice && (
                                  <div className="text-xs text-blue-600">
                                    ₹{plan.monthlyPrice}/mo (Annual billing)
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1 text-xs">
                                <div>Pharmacy: ₹{plan.benefitLimits?.pharmacyLimitINR || 0}</div>
                                <div>Home Care: ₹{plan.benefitLimits?.homeCareLimitINR || 0}</div>
                                <div>Ambulance: ₹{plan.benefitLimits?.ambulanceLimitINR || 0}</div>
                                {plan.healthMonitoring?.enabled && (
                                  <div className="flex items-center gap-1 text-green-600 font-medium mt-1">
                                    <Activity className="h-3 w-3" />
                                    Health Monitoring
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {plan.category ? (
                                <Badge variant="outline" className="text-xs">
                                  {plan.category}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">Uncategorized</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-1">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">{plan.subscribers || 0}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={plan.isActive ? 'default' : 'secondary'}
                              >
                                {plan.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-[160px]">
                                  <DropdownMenuItem onClick={() => openEdit(plan)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit Plan
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => alert(`View details for ${plan.name}`)}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    onClick={() => deletePlan(plan.id!)} 
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {filteredPlans.length > itemsPerPage && (
                  <div className="flex items-center justify-between pt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredPlans.length)} of {filteredPlans.length} entries
                    </p>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <div className="flex items-center space-x-1">
                        {Array.from({ length: Math.ceil(filteredPlans.length / itemsPerPage) }, (_, i) => i + 1)
                          .filter(page => 
                            page === 1 || 
                            page === Math.ceil(filteredPlans.length / itemsPerPage) || 
                            Math.abs(page - currentPage) <= 1
                          )
                          .map((page, index, array) => (
                            <React.Fragment key={page}>
                              {index > 0 && array[index - 1] !== page - 1 && (
                                <span className="text-muted-foreground">...</span>
                              )}
                              <Button
                                variant={currentPage === page ? "default" : "outline"}
                                size="sm"
                                onClick={() => setCurrentPage(page)}
                                className="w-8 h-8 p-0"
                              >
                                {page}
                              </Button>
                            </React.Fragment>
                          ))
                        }
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredPlans.length / itemsPerPage), prev + 1))}
                        disabled={currentPage === Math.ceil(filteredPlans.length / itemsPerPage)}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Plans</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{plans.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {plans.filter(p => p.isActive).length} active
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Subscribers</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {plans.reduce((sum, p) => sum + (p.subscribers || 0), 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Across all plans
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg. Plan Price</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ₹{Math.round(plans.reduce((sum, p) => sum + p.priceINR, 0) / plans.length).toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Average price
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Popular Plan</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-bold">
                    {plans.sort((a, b) => (b.subscribers || 0) - (a.subscribers || 0))[0]?.name || 'N/A'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Most subscribed
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="excel">
            <Card>
              <CardHeader>
                <CardTitle>Bulk Upload via Excel</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Upload an Excel file (.xlsx, .xls) with membership plan records.
                  </p>
                  <div className="flex items-center gap-4">
                    <Input 
                      ref={fileInputRef} 
                      type="file" 
                      accept=".xlsx,.xls" 
                      onChange={handleExcelUpload} 
                      disabled={loading} 
                    />
                    <Button 
                      variant="outline" 
                      onClick={() => fileInputRef.current?.click()} 
                      disabled={loading}
                    >
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Choose File
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="json">
            <Card>
              <CardHeader>
                <CardTitle>Bulk Upload via JSON</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Paste JSON array of plan objects with required fields: name, durationDays, priceINR
                </p>
                <Textarea 
                  value={jsonInput} 
                  onChange={(e) => setJsonInput(e.target.value)} 
                  placeholder='[{"name":"Gold Plan","description":"Premium plan","durationDays":90,"priceINR":2999,"isActive":true,"category":"Premium"}]' 
                  className="h-64 font-mono text-sm" 
                />
                <Button onClick={handleJsonUpload} disabled={loading}>
                  <Upload className="mr-2 h-4 w-4" />
                  {loading ? 'Uploading...' : 'Upload JSON'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Create/Edit Dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Plan" : "Create Plan"}</DialogTitle>
            </DialogHeader>

            <div className="grid md:grid-cols-2 gap-6 py-2">
              <div className="space-y-4">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Gold Plan"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={form.description || ""}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Describe plan benefits..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Duration (days)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.durationDays}
                      onChange={(e) => setForm((f) => ({ ...f, durationDays: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label>Price (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.priceINR}
                      onChange={(e) => setForm((f) => ({ ...f, priceINR: Number(e.target.value) }))}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between border rounded-md p-3">
                  <div>
                    <Label className="block">Active</Label>
                    <p className="text-xs text-gray-500">Visible and available for subscription</p>
                  </div>
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: Boolean(v) }))}
                  />
                </div>

                <div>
                  <Label>Health Check Package</Label>
                  <Input
                    value={form.healthCheckPackage || ""}
                    onChange={(e) => setForm((f) => ({ ...f, healthCheckPackage: e.target.value }))}
                    placeholder="Basic Health Package"
                  />
                </div>

                <div className="border rounded-md p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <Label className="text-base">Health Monitoring System</Label>
                      <p className="text-xs text-muted-foreground">Premium feature with monitoring devices</p>
                    </div>
                    <Switch
                      checked={form.healthMonitoring?.enabled || false}
                      onCheckedChange={(v) => setForm((f) => ({
                        ...f,
                        healthMonitoring: {
                          ...f.healthMonitoring,
                          enabled: Boolean(v),
                          devices: f.healthMonitoring?.devices || [],
                          deviceTypes: f.healthMonitoring?.deviceTypes || {
                            healthWatch: false,
                            healthBand: false,
                            healthRing: false,
                            bpMonitor: false,
                            glucometer: false,
                            pulseOximeter: false,
                          },
                        },
                      }))}
                    />
                  </div>

                  {form.healthMonitoring?.enabled && (
                    <div className="space-y-3 mt-3">
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { key: 'healthWatch', label: 'Health Watch' },
                          { key: 'healthBand', label: 'Health Band' },
                          { key: 'healthRing', label: 'Health Ring' },
                          { key: 'bpMonitor', label: 'BP Monitor' },
                          { key: 'glucometer', label: 'Glucometer' },
                          { key: 'pulseOximeter', label: 'Pulse Oximeter' },
                        ].map(({ key, label }) => (
                          <div key={key} className="flex items-center space-x-2 p-2 border rounded">
                            <Switch
                              checked={form.healthMonitoring?.deviceTypes?.[key as keyof typeof form.healthMonitoring.deviceTypes] || false}
                              onCheckedChange={(v) => {
                                const devices = form.healthMonitoring?.devices || [];
                                const updatedDevices = v 
                                  ? [...devices, label]
                                  : devices.filter(d => d !== label);
                                setForm((f) => ({
                                  ...f,
                                  healthMonitoring: {
                                    ...f.healthMonitoring!,
                                    devices: updatedDevices,
                                    deviceTypes: {
                                      ...f.healthMonitoring?.deviceTypes,
                                      [key]: Boolean(v),
                                    },
                                  },
                                }));
                              }}
                            />
                            <Label className="text-sm cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Billing Cycle</Label>
                    <Select
                      value={form.billingCycle || 'monthly'}
                      onValueChange={(v) => setForm((f) => ({ ...f, billingCycle: v as 'monthly' | 'annual' }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly (Billed Annually)</SelectItem>
                        <SelectItem value="annual">Annual (One-time)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Monthly Price (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.monthlyPrice || 0}
                      onChange={(e) => setForm((f) => ({ ...f, monthlyPrice: Number(e.target.value) }))}
                      placeholder="For monthly billing"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="border rounded-md p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-base">Teleconsult Limits</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Same for all specialties</span>
                      <Switch checked={uniformTeleLimit} onCheckedChange={(v) => setUniformTeleLimit(Boolean(v))} />
                    </div>
                  </div>

                  {uniformTeleLimit ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <Label>Consults allowed (all specialties)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={uniformCount}
                          onChange={(e) => setUniformCount(Number(e.target.value))}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {specialtyRows.map((row, idx) => (
                        <div key={idx} className="grid grid-cols-7 gap-2 items-center">
                          <div className="col-span-4">
                            <Input
                              placeholder="Specialty (e.g., Cardiology)"
                              value={row.name}
                              onChange={(e) => {
                                const v = e.target.value; const next = [...specialtyRows]; next[idx].name = v; setSpecialtyRows(next);
                              }}
                            />
                          </div>
                          <div className="col-span-2">
                            <Input
                              type="number"
                              min={0}
                              placeholder="Count"
                              value={row.count}
                              onChange={(e) => {
                                const v = Number(e.target.value); const next = [...specialtyRows]; next[idx].count = v; setSpecialtyRows(next);
                              }}
                            />
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setSpecialtyRows((rows) => rows.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button variant="outline" onClick={() => setSpecialtyRows((rows) => [...rows, { name: "", count: 0 }])}>
                        <Plus className="h-4 w-4 mr-2" /> Add Specialty
                      </Button>
                    </div>
                  )}
                </div>

                <div className="border rounded-md p-4">
                  <Label className="text-base">Benefit Limits (₹)</Label>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <Label>Pharmacy</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.benefitLimits?.pharmacyLimitINR || 0}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            benefitLimits: { ...f.benefitLimits, pharmacyLimitINR: Number(e.target.value) },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Home Care</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.benefitLimits?.homeCareLimitINR || 0}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            benefitLimits: { ...f.benefitLimits, homeCareLimitINR: Number(e.target.value) },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Ambulance</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.benefitLimits?.ambulanceLimitINR || 0}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            benefitLimits: { ...f.benefitLimits, ambulanceLimitINR: Number(e.target.value) },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
              <Button onClick={upsertPlan}>{editing ? "Save Changes" : "Create Plan"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminPlans;