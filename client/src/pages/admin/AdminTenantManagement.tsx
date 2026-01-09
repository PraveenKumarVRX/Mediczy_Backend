import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { CheckCircle, Loader2, AlertCircle, Plus } from 'lucide-react';

interface Tenant {
  id: number;
  name: string;
  slug: string;
  subdomain: string;
  type: string;
  email: string;
  phone: string;
  status: string;
  plan: string;
  created_at: string;
}

interface FormData {
  tenantName: string;
  tenantType: 'HOSPITAL' | 'CLINIC' | 'LAB' | 'PHARMACY' | 'CORPORATE' | 'TPA' | 'PSU' | 'NGO';
  contactEmail: string;
  contactPhone: string;
  subscriptionPlan: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  customSubdomain?: string;
  address?: string;
}

const TENANT_TYPES = [
  { value: 'HOSPITAL', label: 'Hospital' },
  { value: 'CLINIC', label: 'Clinic' },
  { value: 'LAB', label: 'Laboratory' },
  { value: 'PHARMACY', label: 'Pharmacy' },
  { value: 'CORPORATE', label: 'Corporate' },
  { value: 'TPA', label: 'TPA' },
  { value: 'PSU', label: 'PSU' },
  { value: 'NGO', label: 'NGO' },
];

const PLANS = [
  { value: 'STARTER', label: 'Starter' },
  { value: 'PROFESSIONAL', label: 'Professional' },
  { value: 'ENTERPRISE', label: 'Enterprise' },
];

const AdminTenantManagement = () => {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState<FormData>({
    tenantName: '',
    tenantType: 'HOSPITAL',
    contactEmail: '',
    contactPhone: '',
    subscriptionPlan: 'PROFESSIONAL',
  });

  const token = localStorage.getItem('adminToken');

  useEffect(() => {
    if (!token) {
      navigate('/admin/login');
      return;
    }
    fetchTenants();
  }, [token, navigate]);

  const fetchTenants = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/platform/tenants', {
        headers: { Authorization: `Bearer ${token}` },
        params: { page: 1, limit: 100 },
      });
      setTenants(response.data.data?.tenants || response.data.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to fetch tenants');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await api.post(
        '/api/platform/tenants',
        {
          tenantName: formData.tenantName,
          tenantType: formData.tenantType,
          contactEmail: formData.contactEmail,
          contactPhone: formData.contactPhone,
          subscriptionPlan: formData.subscriptionPlan,
          customSubdomain: formData.customSubdomain,
          address: formData.address,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setSuccess(`✅ Tenant "${formData.tenantName}" created successfully!`);
      setFormData({
        tenantName: '',
        tenantType: 'HOSPITAL',
        contactEmail: '',
        contactPhone: '',
        subscriptionPlan: 'PROFESSIONAL',
      });
      setIsCreateOpen(false);
      setTimeout(() => {
        fetchTenants();
        setSuccess(null);
      }, 1500);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create tenant');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (tenantId: number, newStatus: string) => {
    try {
      if (newStatus === 'suspend') {
        await api.post(
          `/api/platform/tenants/${tenantId}/suspend`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else if (newStatus === 'activate') {
        await api.post(
          `/api/platform/tenants/${tenantId}/activate`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      setSuccess('Tenant status updated');
      setTimeout(() => {
        fetchTenants();
        setSuccess(null);
      }, 1500);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to update status');
    }
  };

  // Filter tenants
  const filteredTenants = tenants.filter((t) => {
    const matchesStatus = selectedStatus === 'all' || t.status === selectedStatus;
    const matchesType = selectedType === 'all' || t.type === selectedType;
    const matchesSearch =
      searchTerm === '' ||
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesType && matchesSearch;
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tenant Management</h1>
          <p className="text-gray-600 mt-2">Create and manage hospital, clinic, and lab tenants</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Create Tenant
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create New Tenant</DialogTitle>
              <DialogDescription>Register a new hospital, clinic, or healthcare organization</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateTenant} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Organization Name *</label>
                <Input
                  placeholder="e.g., Dhyan Hospital, Apollo Clinic"
                  value={formData.tenantName}
                  onChange={(e) => setFormData({ ...formData, tenantName: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Organization Type *</label>
                <Select value={formData.tenantType} onValueChange={(v) => setFormData({ ...formData, tenantType: v as FormData['tenantType'] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TENANT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Email *</label>
                <Input
                  type="email"
                  placeholder="admin@organization.com"
                  value={formData.contactEmail}
                  onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Phone *</label>
                <Input
                  type="tel"
                  placeholder="+91-1234567890"
                  value={formData.contactPhone}
                  onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Subscription Plan *</label>
                <Select value={formData.subscriptionPlan} onValueChange={(v) => setFormData({ ...formData, subscriptionPlan: v as FormData['subscriptionPlan'] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLANS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Custom Subdomain (optional)</label>
                <Input
                  placeholder="dhyan (for dhyan.mediqzy.com)"
                  value={formData.customSubdomain || ''}
                  onChange={(e) => setFormData({ ...formData, customSubdomain: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Address (optional)</label>
                <Input
                  placeholder="123 Hospital Street, City"
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

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isSubmitting ? 'Creating...' : 'Create Tenant'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
          <div className="grid md:grid-cols-4 gap-4">
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
                {TENANT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={fetchTenants}>
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
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-left text-sm font-semibold">Name</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Type</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Domain</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Email</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Plan</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Created</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTenants.map((tenant) => (
                <tr key={tenant.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{tenant.name}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                      {tenant.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{tenant.subdomain}.mediqzy.com</td>
                  <td className="px-4 py-3 text-sm">{tenant.email}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                      {tenant.plan}
                    </span>
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
                    {new Date(tenant.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-2">
                      {tenant.status === 'active' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStatusChange(tenant.id, 'suspend')}
                        >
                          Suspend
                        </Button>
                      )}
                      {tenant.status === 'suspended' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStatusChange(tenant.id, 'activate')}
                        >
                          Activate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminTenantManagement;
