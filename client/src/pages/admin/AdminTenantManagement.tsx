import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { CheckCircle, Loader2, AlertCircle, Plus, Building2, Database, Globe, Server, Crown, Zap, Users, TrendingUp, RefreshCw, Eye, Trash2, ArrowUpCircle, PauseCircle, PlayCircle, Power, PowerOff, RotateCcw, Terminal } from 'lucide-react';

interface ServerStatus {
  running: boolean;
  status: string;
  process_name: string;
  pm_id?: number;
  port: number;
  uptime?: number;
  memory?: number;
  cpu?: number;
  restarts?: number;
}

interface Tenant {
  id: number;
  uid: string;
  name: string;
  slug: string;
  subdomain: string;
  custom_domain?: string;
  type: string;
  email: string;
  phone: string;
  status: string;
  plan: string;
  limits?: Record<string, number>;
  usage?: Record<string, number>;
  features?: Record<string, boolean>;
  server_status?: ServerStatus;
  tier?: string;
  database_stats?: {
    exists: boolean;
    database_name?: string;
    size?: string;
    active_connections?: number;
  };
  access_url?: string;
  createdAt: string;
  created_at?: string;
  is_verified: boolean;
}

interface TierInfo {
  id: string;
  name: string;
  database_isolation: boolean;
  dedicated_server: boolean;
  subdomain: boolean;
  custom_domain: boolean;
  features: Record<string, boolean>;
  limits: Record<string, number>;
  price: { monthly: number; quarterly: number; annual: number };
  recommended?: boolean;
  color?: string;
  badge?: string;
}

interface FormData {
  name: string;
  type: string;
  plan: 'free' | 'professional' | 'enterprise';
  billing_cycle: 'monthly' | 'quarterly' | 'yearly';
  email: string;
  phone: string;
  subdomain?: string;
  custom_subdomain?: string;
  custom_domain?: string;
  address?: string;
  admin_email?: string;
  admin_password?: string;
  admin_first_name?: string;
  admin_last_name?: string;
}

interface TenantModule {
  key: string;
  label: string;
  path: string;
  enabled?: boolean;
}

interface TenantTypeOption {
  value: string;
  label: string;
  icon: string;
  minPlan: 'free' | 'professional' | 'enterprise';
  description?: string;
  routePrefix?: string;
  loginPath?: string;
  accessPath?: string;
  portalLoginExample?: string;
  modules?: TenantModule[];
  optionalModules?: TenantModule[];
  isCore?: boolean;
}

const FALLBACK_TENANT_TYPES: TenantTypeOption[] = [
  { value: 'hospital', label: 'Hospital', icon: '🏥', minPlan: 'professional', routePrefix: '/hospital' },
  { value: 'clinic', label: 'Clinic', icon: '🏨', minPlan: 'free', routePrefix: '/clinic' },
  { value: 'lab', label: 'Lab', icon: '🔬', minPlan: 'free', routePrefix: '/lab' },
  { value: 'diagnostic_centre', label: 'Diagnostic Centre', icon: '🩻', minPlan: 'free', routePrefix: '/lab' },
  { value: 'corporate', label: 'Corporate', icon: '🏢', minPlan: 'professional', routePrefix: '/corporate' },
  { value: 'homecare', label: 'Homecare', icon: '🏠', minPlan: 'professional', routePrefix: '/homecare' },
  { value: 'ambulance', label: 'Ambulance', icon: '🚑', minPlan: 'professional', routePrefix: '/ambulance' },
  { value: 'pharmacy', label: 'Pharmacy', icon: '💊', minPlan: 'free', routePrefix: '/pharmacy' },
  { value: 'tpa', label: 'TPA', icon: '📋', minPlan: 'enterprise', routePrefix: '/tpa' },
  { value: 'psu', label: 'PSU', icon: '🏛️', minPlan: 'enterprise', routePrefix: '/psu' },
  { value: 'insurer', label: 'Insurer', icon: '🛡️', minPlan: 'enterprise', routePrefix: '/insurer' },
  { value: 'broker', label: 'Broker', icon: '🤝', minPlan: 'professional', routePrefix: '/intermediary' },
  { value: 'ngo', label: 'NGO', icon: '❤️', minPlan: 'free', routePrefix: '/ngo' },
];

const PLAN_TIERS: TierInfo[] = [
  {
    id: 'free',
    name: 'Free',
    database_isolation: false,
    dedicated_server: false,
    subdomain: true,
    custom_domain: false,
    features: {
      appointments: true,
      telemedicine: false,
      prescriptions: true,
      lab_tests: false,
      pharmacy: false,
      insurance: false,
      ai_assistant: false,
      analytics: false,
    },
    limits: { users: 10, doctors: 3, appointments_per_month: 50, storage_gb: 2 },
    price: { monthly: 0, quarterly: 0, annual: 0 },
    color: 'bg-gray-100 text-gray-700',
    badge: 'Free',
  },
  {
    id: 'professional',
    name: 'Professional',
    database_isolation: true,
    dedicated_server: false,
    subdomain: true,
    custom_domain: true,
    features: {
      appointments: true,
      telemedicine: true,
      prescriptions: true,
      lab_tests: true,
      pharmacy: true,
      insurance: true,
      ai_assistant: true,
      analytics: true,
    },
    limits: { users: 200, doctors: 50, appointments_per_month: 2000, storage_gb: 100 },
    price: { monthly: 9999, quarterly: 26997, annual: 95988 },
    recommended: true,
    color: 'bg-blue-100 text-blue-700',
    badge: 'Professional',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    database_isolation: true,
    dedicated_server: true,
    subdomain: true,
    custom_domain: true,
    features: {
      appointments: true,
      telemedicine: true,
      prescriptions: true,
      lab_tests: true,
      pharmacy: true,
      insurance: true,
      ai_assistant: true,
      analytics: true,
      white_label: true,
      sla: true,
      dedicated_support: true,
    },
    limits: { users: -1, doctors: -1, appointments_per_month: -1, storage_gb: -1 },
    price: { monthly: 49999, quarterly: 134997, annual: 479988 },
    color: 'bg-purple-100 text-purple-700',
    badge: 'Enterprise',
  },
];

const AdminTenantManagement = () => {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedPlan, setSelectedPlan] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [tenantTypes, setTenantTypes] = useState<TenantTypeOption[]>(FALLBACK_TENANT_TYPES);

  const [formData, setFormData] = useState<FormData>({
    name: '',
    type: 'clinic',
    plan: 'professional',
    billing_cycle: 'monthly',
    email: '',
    phone: '',
  });

  const token = localStorage.getItem('adminToken');
  const selectedTypeInfo = tenantTypes.find((t) => t.value === formData.type);
  const previewSubdomain = (formData.custom_subdomain || formData.subdomain || formData.name || 'your-org')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 63) || 'your-org';
  const previewLoginPath = selectedTypeInfo?.loginPath || '/login';
  const previewPortalLogin = `https://${previewSubdomain}.mediqzy.com${previewLoginPath}`;

  useEffect(() => {
    if (!token) {
      navigate('/admin/login');
      return;
    }
    fetchTenants();
    fetchStats();
    fetchEntityTypes();
  }, [token, navigate]);

  const fetchEntityTypes = async () => {
    try {
      const response = await api.get('/superadmin/tenants/entity-types', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const rows = response.data?.entity_types || [];
      if (!rows.length) return;
      setTenantTypes(
        rows.map((row: any) => ({
          value: row.type,
          label: row.name,
          icon: row.icon || '🏥',
          minPlan: (row.min_plan || 'free') as TenantTypeOption['minPlan'],
          description: row.description,
          routePrefix: row.route_prefix,
          loginPath: row.login_path,
          accessPath: row.access_path,
          portalLoginExample: row.portal_login_example,
          modules: row.modules || [],
          optionalModules: row.optional_modules || [],
          isCore: Boolean(row.is_core),
        }))
      );
    } catch (err) {
      console.log('Entity types API unavailable — using fallback module packs');
    }
  };

  const fetchTenants = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/superadmin/tenants/tenants', {
        headers: { Authorization: `Bearer ${token}` },
        params: { page: 1, limit: 100 },
      });
      setTenants(response.data.tenants || []);
    } catch (err: any) {
      // Fallback to old endpoint if new one not available
      try {
        const fallbackResponse = await api.get('/platform/tenants', {
          headers: { Authorization: `Bearer ${token}` },
          params: { page: 1, limit: 100 },
        });
        setTenants(fallbackResponse.data.data?.tenants || fallbackResponse.data.data || []);
      } catch (fallbackErr: any) {
        setError(fallbackErr?.response?.data?.message || 'Failed to fetch tenants');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/superadmin/tenants/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(response.data.stats);
    } catch (err) {
      console.log('Stats not available');
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    // Check minimum plan requirement for entity type
    const entityType = tenantTypes.find(t => t.value === formData.type);
    if (entityType) {
      const planRank = { free: 0, professional: 1, enterprise: 2 };
      if (planRank[formData.plan] < planRank[entityType.minPlan as keyof typeof planRank]) {
        setError(`${entityType.label} requires minimum ${entityType.minPlan} plan`);
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const response = await api.post(
        '/superadmin/tenants/tenants',
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSuccess(`✅ ${formData.type} "${formData.name}" created successfully!`);
      setFormData({
        name: '',
        type: 'clinic',
        plan: 'professional',
        billing_cycle: 'monthly',
        email: '',
        phone: '',
      });
      setIsCreateOpen(false);
      setTimeout(() => {
        fetchTenants();
        fetchStats();
        setSuccess(null);
      }, 1500);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create tenant');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuspend = async (tenantId: number) => {
    try {
      await api.post(
        `/superadmin/tenants/tenants/${tenantId}/suspend`,
        { reason: 'Suspended by super admin' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess('Tenant suspended');
      setTimeout(() => {
        fetchTenants();
        setSuccess(null);
      }, 1500);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to suspend');
    }
  };

  const handleReactivate = async (tenantId: number) => {
    try {
      await api.post(
        `/superadmin/tenants/tenants/${tenantId}/reactivate`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess('Tenant reactivated');
      setTimeout(() => {
        fetchTenants();
        setSuccess(null);
      }, 1500);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to reactivate');
    }
  };

  const handleUpgrade = async (tenantId: number, newPlan: string) => {
    try {
      await api.post(
        `/superadmin/tenants/tenants/${tenantId}/upgrade`,
        { plan: newPlan },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(`Tenant upgraded to ${newPlan}`);
      setTimeout(() => {
        fetchTenants();
        fetchStats();
        setSuccess(null);
      }, 1500);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to upgrade');
    }
  };

  const viewTenantDetails = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setViewDialogOpen(true);
  };

  // ============================================================================
  // SERVER CONTROL FUNCTIONS (Enterprise Only)
  // ============================================================================

  const fetchServerStatus = async (tenantId: number) => {
    try {
      const response = await api.get(`/superadmin/tenants/tenants/${tenantId}/server`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    } catch (err) {
      console.error('Failed to fetch server status:', err);
      return null;
    }
  };

  const handleStartServer = async (tenant: Tenant) => {
    try {
      setIsSubmitting(true);
      await api.post(
        `/superadmin/tenants/tenants/${tenant.id}/server/start`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(`✅ Server started for ${tenant.name}`);
      setTimeout(() => {
        fetchTenants();
        setSuccess(null);
      }, 2000);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to start server');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStopServer = async (tenant: Tenant) => {
    if (!confirm(`Are you sure you want to stop the server for ${tenant.name}? This will make the application unavailable.`)) {
      return;
    }
    try {
      setIsSubmitting(true);
      await api.post(
        `/superadmin/tenants/tenants/${tenant.id}/server/stop`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(`⏹️ Server stopped for ${tenant.name}`);
      setTimeout(() => {
        fetchTenants();
        setSuccess(null);
      }, 2000);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to stop server');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestartServer = async (tenant: Tenant) => {
    try {
      setIsSubmitting(true);
      await api.post(
        `/superadmin/tenants/tenants/${tenant.id}/server/restart`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(`🔄 Server restarted for ${tenant.name}`);
      setTimeout(() => {
        fetchTenants();
        setSuccess(null);
      }, 2000);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to restart server');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewServerLogs = async (tenant: Tenant) => {
    try {
      const response = await api.get(
        `/superadmin/tenants/tenants/${tenant.id}/server/logs?lines=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Show logs in a dialog or alert
      alert(`Server Logs for ${tenant.name}:\n\n${response.data.logs || 'No logs available'}`);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to fetch server logs');
    }
  };

  // Filter tenants
  const filteredTenants = tenants.filter((t) => {
    const matchesStatus = selectedStatus === 'all' || t.status === selectedStatus;
    const matchesType = selectedType === 'all' || t.type === selectedType;
    const tenantPlan = t.plan || t.tier || '';
    const matchesPlan = selectedPlan === 'all' || tenantPlan === selectedPlan;
    const matchesSearch =
      searchTerm === '' ||
      t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.slug?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesType && matchesPlan && matchesSearch;
  });

  if (!token) {
    return (
      <div className="container mx-auto py-10">
        <Card>
          <CardHeader>
            <CardTitle>Unauthorized</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4">You must login as admin.</p>
            <Button onClick={() => navigate('/admin/login')}>Go to Admin Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 space-y-6">
      {/* Header with Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Super Admin - Tenant Management</h1>
          <p className="text-gray-600 mt-2">Create and manage healthcare organizations with tier-based provisioning</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Create Organization
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Organization</DialogTitle>
              <DialogDescription>Register a new healthcare organization with dedicated resources</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateTenant} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Organization Name *</label>
                  <Input
                    placeholder="e.g., Dhyan Hospital, Apollo Clinic"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Organization Type *</label>
                  <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v as FormData['type'] })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tenantTypes.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          <div className="flex items-center gap-2">
                            <span>{t.icon}</span>
                            <span>{t.label}</span>
                            {t.minPlan !== 'free' && (
                              <span className="text-xs text-gray-500">({t.minPlan}+)</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTypeInfo?.description && (
                    <p className="text-xs text-gray-500 mt-1">{selectedTypeInfo.description}</p>
                  )}
                </div>
              </div>

              {selectedTypeInfo && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-medium">
                      Modules for {selectedTypeInfo.label}
                    </p>
                    {selectedTypeInfo.routePrefix && (
                      <Badge variant="outline" className="font-mono text-xs">
                        modules {selectedTypeInfo.routePrefix}/*
                      </Badge>
                    )}
                  </div>
                  <div className="rounded border border-blue-100 bg-white px-3 py-2 space-y-1">
                    <p className="text-xs font-medium text-slate-700">Personalised domain (primary login)</p>
                    <p className="font-mono text-sm text-blue-700 break-all">{previewPortalLogin}</p>
                    <p className="text-xs text-gray-500">
                      Same pattern as hycare.mediqzy.com / ajdental.mediqzy.com — type modules are organised under this host.
                    </p>
                  </div>
                  <p className="text-xs text-gray-600">
                    Choosing this type attaches the modules below for that organisation.
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {(selectedTypeInfo.modules || []).map((m) => (
                      <Badge key={m.key} variant="secondary" className="text-xs font-normal">
                        {m.label}
                      </Badge>
                    ))}
                    {!selectedTypeInfo.modules?.length && (
                      <span className="text-xs text-gray-500">
                        Pack will be attached from server registry on create.
                      </span>
                    )}
                  </div>
                  {!!selectedTypeInfo.optionalModules?.length && (
                    <p className="text-xs text-gray-500">
                      Optional: {selectedTypeInfo.optionalModules.map((m) => m.label).join(', ')}
                    </p>
                  )}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Email *</label>
                  <Input
                    type="email"
                    placeholder="admin@organization.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Phone *</label>
                  <Input
                    type="tel"
                    placeholder="+91-1234567890"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Plan Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Subscription Plan *</label>
                <div className="grid md:grid-cols-3 gap-3">
                  {PLAN_TIERS.map((tier) => {
                    const featureList = Object.entries(tier.features).filter(([_, v]) => v).slice(0, 3);
                    const priceDisplay = tier.price.monthly === 0 ? '₹0/mo' : `₹${(tier.price.monthly / 100).toLocaleString()}/mo`;
                    return (
                      <div
                        key={tier.id}
                        onClick={() => setFormData({ ...formData, plan: tier.id as FormData['plan'] })}
                        className={`p-4 border rounded-lg cursor-pointer transition-all ${
                          formData.plan === tier.id
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold">{tier.name}</span>
                          {tier.recommended && <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">Recommended</span>}
                        </div>
                        <p className="text-lg font-bold text-blue-600">{priceDisplay}</p>
                        <ul className="text-xs text-gray-600 mt-2 space-y-1">
                          {featureList.map(([key], i) => (
                            <li key={i} className="flex items-center gap-1">
                              <CheckCircle className="w-3 h-3 text-green-500" />
                              {key.replace(/_/g, ' ')}
                            </li>
                          ))}
                          {tier.database_isolation && (
                            <li className="flex items-center gap-1">
                              <Database className="w-3 h-3 text-purple-500" />
                              Dedicated Database
                            </li>
                          )}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Billing Cycle</label>
                  <Select value={formData.billing_cycle} onValueChange={(v) => setFormData({ ...formData, billing_cycle: v as FormData['billing_cycle'] })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly (5% off)</SelectItem>
                      <SelectItem value="yearly">Yearly (20% off)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Custom Subdomain (optional)</label>
                  <Input
                    placeholder="dhyan (for dhyan.mediqzy.com)"
                    value={formData.custom_subdomain || ''}
                    onChange={(e) => setFormData({ ...formData, custom_subdomain: e.target.value })}
                  />
                </div>
              </div>

              {formData.plan === 'enterprise' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Custom Domain (Enterprise only)</label>
                  <Input
                    placeholder="hospital.example.com"
                    value={formData.custom_domain || ''}
                    onChange={(e) => setFormData({ ...formData, custom_domain: e.target.value })}
                  />
                  <p className="text-xs text-gray-500 mt-1">DNS configuration will be provided after setup</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Address (optional)</label>
                <Input
                  placeholder="123 Hospital Street, City, State, PIN"
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              {error && (
                <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {isSubmitting ? 'Provisioning...' : 'Create Organization'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Building2 className="w-8 h-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.total_tenants || 0}</p>
                  <p className="text-sm text-gray-500">Total Organizations</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.active_tenants || 0}</p>
                  <p className="text-sm text-gray-500">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Server className="w-8 h-8 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.enterprise_count || 0}</p>
                  <p className="text-sm text-gray-500">Enterprise</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Database className="w-8 h-8 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.dedicated_dbs || 0}</p>
                  <p className="text-sm text-gray-500">Dedicated DBs</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Success/Error Messages */}
      {success && (
        <div className="flex gap-2 p-3 bg-green-50 border border-green-200 rounded-md text-green-700">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <p>{success}</p>
        </div>
      )}
      {error && !isCreateOpen && (
        <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid md:grid-cols-5 gap-4">
            <Input
              placeholder="Search by name, email, or slug..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {tenantTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.icon} {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedPlan} onValueChange={setSelectedPlan}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="free">Free Tier</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => { fetchTenants(); fetchStats(); }}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tenants List */}
      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          </CardContent>
        </Card>
      ) : filteredTenants.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-gray-500">
            <p>No tenants found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white rounded-lg shadow">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-left text-sm font-semibold">Organization</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Type</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Domain</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Plan</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Database</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Created</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTenants.map((tenant) => {
                const tenantPlan = tenant.plan || tenant.tier || '';
                const tierInfo = PLAN_TIERS.find(t => t.id === tenantPlan);
                const typeInfo = tenantTypes.find(t => t.value === tenant.type);
                const createdDate = tenant.created_at || tenant.createdAt;
                return (
                  <tr key={tenant.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{tenant.name}</p>
                        <p className="text-sm text-gray-500">{tenant.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs flex items-center gap-1 w-fit">
                        {typeInfo?.icon} {typeInfo?.label || tenant.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <a 
                        href={tenant.access_url || `https://${tenant.subdomain || tenant.slug}.mediqzy.com`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <Globe className="w-3 h-3" />
                        {tenant.subdomain || tenant.slug}.mediqzy.com
                      </a>
                      {tenant.custom_domain && (
                        <p className="text-xs text-gray-500 mt-1">Custom: {tenant.custom_domain}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${tierInfo?.color || 'bg-gray-100 text-gray-700'}`}>
                        {tierInfo?.badge || tenantPlan || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {tenant.database_stats ? (
                        <div className="text-xs">
                          <p className="text-green-600">✓ Dedicated</p>
                          <p className="text-gray-500">{tenant.database_stats.size || 'N/A'}</p>
                        </div>
                      ) : (
                        <span className="text-gray-500 text-xs">Shared</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          tenant.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : tenant.status === 'suspended'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {tenant.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {createdDate ? new Date(createdDate).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => viewTenantDetails(tenant)}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View
                        </Button>
                        {tenant.status === 'active' && (
                          <>
                            {tenantPlan !== 'enterprise' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUpgrade(tenant.id, tenantPlan === 'free' ? 'professional' : 'enterprise')}
                              >
                                <ArrowUpCircle className="w-3 h-3 mr-1" />
                                Upgrade
                              </Button>
                            )}
                            {/* Server Controls for Enterprise */}
                            {tenantPlan === 'enterprise' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-green-600 hover:text-green-700"
                                  onClick={() => handleStartServer(tenant)}
                                  disabled={isSubmitting}
                                  title="Start Server"
                                >
                                  <Power className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => handleStopServer(tenant)}
                                  disabled={isSubmitting}
                                  title="Stop Server"
                                >
                                  <PowerOff className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-blue-600 hover:text-blue-700"
                                  onClick={() => handleRestartServer(tenant)}
                                  disabled={isSubmitting}
                                  title="Restart Server"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleViewServerLogs(tenant)}
                                  title="View Logs"
                                >
                                  <Terminal className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleSuspend(tenant.id)}
                            >
                              Suspend
                            </Button>
                          </>
                        )}
                        {tenant.status === 'suspended' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => handleReactivate(tenant.id)}
                          >
                            Reactivate
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* View Tenant Details Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Organization Details</DialogTitle>
          </DialogHeader>
          {selectedTenant && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Name</label>
                  <p className="font-semibold">{selectedTenant.name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Type</label>
                  <p>{tenantTypes.find(t => t.value === selectedTenant.type)?.label || selectedTenant.type}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Email</label>
                  <p>{selectedTenant.email}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Phone</label>
                  <p>{selectedTenant.phone || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Plan</label>
                  <p>{PLAN_TIERS.find(t => t.id === (selectedTenant.plan || selectedTenant.tier))?.name || selectedTenant.plan || selectedTenant.tier}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <p className={selectedTenant.status === 'active' ? 'text-green-600' : 'text-red-600'}>
                    {selectedTenant.status}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Access URL</label>
                  <p className="text-blue-600">
                    {selectedTenant.access_url || `https://${selectedTenant.slug}.mediqzy.com`}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Created</label>
                  <p>{selectedTenant.created_at || selectedTenant.createdAt ? new Date(selectedTenant.created_at || selectedTenant.createdAt).toLocaleString() : 'N/A'}</p>
                </div>
              </div>
              {selectedTenant.database_stats && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Database Information
                  </h4>
                  <div className="grid md:grid-cols-2 gap-2 text-sm">
                    <p><span className="text-gray-500">Database:</span> {selectedTenant.database_stats.database_name || 'Dedicated'}</p>
                    <p><span className="text-gray-500">Size:</span> {selectedTenant.database_stats.size || 'N/A'}</p>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTenantManagement;
