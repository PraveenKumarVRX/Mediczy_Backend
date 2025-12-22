/**
 * WhatsApp Number Management Component
 * Manage multiple WhatsApp numbers for different communication routes
 */

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter 
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Plus,
  Phone,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp,
  MessageSquare,
  Calendar,
  Shield,
  Activity,
  Clock,
  Download,
  Upload,
  Search,
  Filter
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

interface WhatsAppNumber {
  _id: string;
  phoneNumber: string;
  formattedNumber: string;
  displayName: string;
  description?: string;
  provider: 'twilio' | 'facebook' | 'gupshup' | 'karix' | 'infobip' | 'messagebird';
  providerNumberId?: string;
  route: string;
  routeDisplayName: string;
  customRouteName?: string;
  active: boolean;
  verified: boolean;
  priority: number;
  dailyLimit: number;
  monthlyLimit: number;
  stats: {
    totalMessagesSent: number;
    totalMessagesReceived: number;
    messagesToday: number;
    messagesThisMonth: number;
    lastMessageSentAt?: string;
    lastMessageReceivedAt?: string;
  };
  tags?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  overview: {
    totalNumbers: number;
    activeNumbers: number;
    verifiedNumbers: number;
    availableNumbers: number;
  };
  byProvider: Record<string, {
    total: number;
    active: number;
    verified: number;
    messagesSent: number;
  }>;
  byRoute: Record<string, {
    total: number;
    active: number;
    messagesSent: number;
  }>;
  usage: {
    totalMessagesSent: number;
    totalMessagesReceived: number;
    messagesToday: number;
    messagesThisMonth: number;
  };
  limits: {
    totalDailyLimit: number;
    totalMonthlyLimit: number;
    dailyUsagePercentage: number;
    monthlyUsagePercentage: number;
  };
}

const WhatsAppNumberManagement: React.FC = () => {
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNumber, setEditingNumber] = useState<WhatsAppNumber | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [filterRoute, setFilterRoute] = useState<string>('all');
  const [filterActive, setFilterActive] = useState<string>('all');

  // Form state
  const [formData, setFormData] = useState({
    phoneNumber: '',
    displayName: '',
    description: '',
    provider: 'gupshup' as const,
    providerNumberId: '',
    route: 'general-support' as const,
    customRouteName: '',
    priority: 10,
    dailyLimit: 1000,
    monthlyLimit: 30000,
    tags: '',
    notes: ''
  });

  const providers = [
    { value: 'gupshup', label: 'Gupshup (Recommended for India)' },
    { value: 'karix', label: 'Karix (Indian Company)' },
    { value: 'facebook', label: 'Facebook WhatsApp Business' },
    { value: 'twilio', label: 'Twilio' },
    { value: 'infobip', label: 'Infobip' },
    { value: 'messagebird', label: 'MessageBird' }
  ];

  const routes = [
    { value: 'appointments', label: 'Appointment Reminders', icon: Calendar },
    { value: 'prescriptions', label: 'Prescription Alerts', icon: MessageSquare },
    { value: 'test-results', label: 'Test Results', icon: Activity },
    { value: 'general-support', label: 'General Support', icon: MessageSquare },
    { value: 'emergency', label: 'Emergency Alerts', icon: AlertCircle },
    { value: 'reminders', label: 'General Reminders', icon: Clock },
    { value: 'billing', label: 'Billing & Payments', icon: TrendingUp },
    { value: 'marketing', label: 'Marketing & Promotions', icon: TrendingUp },
    { value: 'teleconsultation', label: 'Teleconsultation', icon: Phone },
    { value: 'feedback', label: 'Feedback & Surveys', icon: MessageSquare },
    { value: 'custom', label: 'Custom Route', icon: Shield }
  ];

  useEffect(() => {
    fetchNumbers();
    fetchStats();
  }, []);

  const fetchNumbers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/whatsapp-numbers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNumbers(response.data.data);
    } catch (error: any) {
      console.error('Error fetching WhatsApp numbers:', error);
      toast.error(error.response?.data?.message || 'Failed to fetch WhatsApp numbers');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/whatsapp-numbers/stats/overview`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(response.data.data);
    } catch (error: any) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const token = localStorage.getItem('token');
      const payload = {
        ...formData,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()) : []
      };

      if (editingNumber) {
        await axios.put(
          `${API_BASE_URL}/whatsapp-numbers/${editingNumber._id}`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('WhatsApp number updated successfully');
      } else {
        await axios.post(
          `${API_BASE_URL}/whatsapp-numbers`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('WhatsApp number added successfully');
      }

      setDialogOpen(false);
      resetForm();
      fetchNumbers();
      fetchStats();
    } catch (error: any) {
      console.error('Error saving WhatsApp number:', error);
      toast.error(error.response?.data?.message || 'Failed to save WhatsApp number');
    }
  };

  const handleEdit = (number: WhatsAppNumber) => {
    setEditingNumber(number);
    setFormData({
      phoneNumber: number.phoneNumber,
      displayName: number.displayName,
      description: number.description || '',
      provider: number.provider,
      providerNumberId: number.providerNumberId || '',
      route: number.route as any,
      customRouteName: number.customRouteName || '',
      priority: number.priority,
      dailyLimit: number.dailyLimit,
      monthlyLimit: number.monthlyLimit,
      tags: number.tags?.join(', ') || '',
      notes: number.notes || ''
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this WhatsApp number?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/whatsapp-numbers/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('WhatsApp number deleted successfully');
      fetchNumbers();
      fetchStats();
    } catch (error: any) {
      console.error('Error deleting WhatsApp number:', error);
      toast.error(error.response?.data?.message || 'Failed to delete WhatsApp number');
    }
  };

  const handleToggleActive = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API_BASE_URL}/whatsapp-numbers/${id}/toggle-active`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Status updated successfully');
      fetchNumbers();
      fetchStats();
    } catch (error: any) {
      console.error('Error toggling status:', error);
      toast.error(error.response?.data?.message || 'Failed to update status');
    }
  };

  const handleVerify = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API_BASE_URL}/whatsapp-numbers/${id}/verify`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Number verified successfully');
      fetchNumbers();
      fetchStats();
    } catch (error: any) {
      console.error('Error verifying number:', error);
      toast.error(error.response?.data?.message || 'Failed to verify number');
    }
  };

  const resetForm = () => {
    setEditingNumber(null);
    setFormData({
      phoneNumber: '',
      displayName: '',
      description: '',
      provider: 'gupshup',
      providerNumberId: '',
      route: 'general-support',
      customRouteName: '',
      priority: 10,
      dailyLimit: 1000,
      monthlyLimit: 30000,
      tags: '',
      notes: ''
    });
  };

  const getProviderBadgeColor = (provider: string) => {
    const colors: Record<string, string> = {
      gupshup: 'bg-green-100 text-green-800',
      karix: 'bg-blue-100 text-blue-800',
      facebook: 'bg-purple-100 text-purple-800',
      twilio: 'bg-red-100 text-red-800',
      infobip: 'bg-orange-100 text-orange-800',
      messagebird: 'bg-cyan-100 text-cyan-800'
    };
    return colors[provider] || 'bg-gray-100 text-gray-800';
  };

  const getRouteBadgeColor = (route: string) => {
    const colors: Record<string, string> = {
      appointments: 'bg-blue-100 text-blue-800',
      prescriptions: 'bg-purple-100 text-purple-800',
      'test-results': 'bg-green-100 text-green-800',
      'general-support': 'bg-gray-100 text-gray-800',
      emergency: 'bg-red-100 text-red-800',
      reminders: 'bg-yellow-100 text-yellow-800',
      billing: 'bg-orange-100 text-orange-800',
      marketing: 'bg-pink-100 text-pink-800',
      teleconsultation: 'bg-indigo-100 text-indigo-800',
      feedback: 'bg-teal-100 text-teal-800',
      custom: 'bg-slate-100 text-slate-800'
    };
    return colors[route] || 'bg-gray-100 text-gray-800';
  };

  const filteredNumbers = numbers.filter(number => {
    const matchesSearch = 
      number.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      number.phoneNumber.includes(searchQuery) ||
      number.routeDisplayName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesProvider = filterProvider === 'all' || number.provider === filterProvider;
    const matchesRoute = filterRoute === 'all' || number.route === filterRoute;
    const matchesActive = 
      filterActive === 'all' || 
      (filterActive === 'active' && number.active) || 
      (filterActive === 'inactive' && !number.active);

    return matchesSearch && matchesProvider && matchesRoute && matchesActive;
  });

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading WhatsApp numbers...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">WhatsApp Number Management</h1>
            <p className="text-muted-foreground mt-2">
              Manage multiple WhatsApp numbers for different communication routes
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add WhatsApp Number
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingNumber ? 'Edit WhatsApp Number' : 'Add New WhatsApp Number'}
                </DialogTitle>
                <DialogDescription>
                  Configure a WhatsApp number for specific communication routes
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phoneNumber">Phone Number *</Label>
                    <Input
                      id="phoneNumber"
                      placeholder="+91 98765 43210"
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                      required
                      disabled={editingNumber?.verified}
                    />
                    <p className="text-xs text-muted-foreground">
                      {editingNumber?.verified && 'Cannot change verified number'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display Name *</Label>
                    <Input
                      id="displayName"
                      placeholder="Appointment Reminders"
                      value={formData.displayName}
                      onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of this number's purpose"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="provider">Provider *</Label>
                    <Select
                      value={formData.provider}
                      onValueChange={(value: any) => setFormData({ ...formData, provider: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {providers.map(provider => (
                          <SelectItem key={provider.value} value={provider.value}>
                            {provider.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="providerNumberId">Provider Number ID</Label>
                    <Input
                      id="providerNumberId"
                      placeholder="Optional provider-specific ID"
                      value={formData.providerNumberId}
                      onChange={(e) => setFormData({ ...formData, providerNumberId: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="route">Communication Route *</Label>
                    <Select
                      value={formData.route}
                      onValueChange={(value: any) => setFormData({ ...formData, route: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {routes.map(route => (
                          <SelectItem key={route.value} value={route.value}>
                            {route.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.route === 'custom' && (
                    <div className="space-y-2">
                      <Label htmlFor="customRouteName">Custom Route Name *</Label>
                      <Input
                        id="customRouteName"
                        placeholder="Enter custom route name"
                        value={formData.customRouteName}
                        onChange={(e) => setFormData({ ...formData, customRouteName: e.target.value })}
                        required={formData.route === 'custom'}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority (1-100)</Label>
                    <Input
                      id="priority"
                      type="number"
                      min="1"
                      max="100"
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">Lower number = higher priority</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dailyLimit">Daily Message Limit</Label>
                    <Input
                      id="dailyLimit"
                      type="number"
                      min="0"
                      value={formData.dailyLimit}
                      onChange={(e) => setFormData({ ...formData, dailyLimit: parseInt(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="monthlyLimit">Monthly Message Limit</Label>
                    <Input
                      id="monthlyLimit"
                      type="number"
                      min="0"
                      value={formData.monthlyLimit}
                      onChange={(e) => setFormData({ ...formData, monthlyLimit: parseInt(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tags">Tags (comma-separated)</Label>
                  <Input
                    id="tags"
                    placeholder="urgent, healthcare, reminders"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Additional notes or information"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingNumber ? 'Update' : 'Add'} Number
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Statistics Cards */}
        {stats && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Numbers</CardTitle>
                <Phone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.overview.totalNumbers}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.overview.activeNumbers} active, {stats.overview.verifiedNumbers} verified
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Messages Today</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.usage.messagesToday.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.limits.dailyUsagePercentage}% of daily limit
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Messages This Month</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.usage.messagesThisMonth.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.limits.monthlyUsagePercentage}% of monthly limit
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Sent</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.usage.totalMessagesSent.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  All-time messages sent
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters and Search */}
        <Card>
          <CardHeader>
            <CardTitle>Search & Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="search">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search numbers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="filterProvider">Provider</Label>
                <Select value={filterProvider} onValueChange={setFilterProvider}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Providers</SelectItem>
                    {providers.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="filterRoute">Route</Label>
                <Select value={filterRoute} onValueChange={setFilterRoute}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Routes</SelectItem>
                    {routes.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="filterActive">Status</Label>
                <Select value={filterActive} onValueChange={setFilterActive}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active Only</SelectItem>
                    <SelectItem value="inactive">Inactive Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Numbers Table */}
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp Numbers ({filteredNumbers.length})</CardTitle>
            <CardDescription>
              Manage your WhatsApp numbers for different communication purposes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Display Name</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Messages</TableHead>
                    <TableHead>Limits</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredNumbers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No WhatsApp numbers found. Add one to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredNumbers.map((number) => (
                      <TableRow key={number._id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{number.formattedNumber}</div>
                            {number.description && (
                              <div className="text-xs text-muted-foreground">{number.description}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{number.displayName}</div>
                            <div className="text-xs text-muted-foreground">Priority: {number.priority}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getProviderBadgeColor(number.provider)}>
                            {number.provider}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getRouteBadgeColor(number.route)}>
                            {number.routeDisplayName}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={number.active}
                                onCheckedChange={() => handleToggleActive(number._id)}
                              />
                              <span className="text-xs">{number.active ? 'Active' : 'Inactive'}</span>
                            </div>
                            {number.verified ? (
                              <Badge variant="outline" className="text-green-600 border-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Verified
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleVerify(number._id)}
                                className="text-xs h-6"
                              >
                                Verify
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>Today: <strong>{number.stats.messagesToday}</strong></div>
                            <div className="text-xs text-muted-foreground">
                              Total: {number.stats.totalMessagesSent.toLocaleString()}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>Daily: {number.stats.messagesToday}/{number.dailyLimit}</div>
                            <div className="text-xs text-muted-foreground">
                              Monthly: {number.stats.messagesThisMonth}/{number.monthlyLimit}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEdit(number)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(number._id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default WhatsAppNumberManagement;
