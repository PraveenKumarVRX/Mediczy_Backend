import React, { useState, useRef, useMemo, useEffect } from 'react';
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
import AdminLayout from '../../components/layout/AdminLayout';
import { useToast } from '../../hooks/use-toast';
import { 
  Download, Plus, Search, Eye, Edit, Trash2, MoreVertical, 
  Building2, Phone, Mail, Globe, Award, TrendingUp, AlertCircle
} from 'lucide-react';
import api from '../../utils/api';
import axios from 'axios';

// Broker/Aggregator Interface
interface Broker {
  id: number;
  broker_name: string;
  email: string;
  phone_number?: string;
  contact_person?: string;
  irdai_license_number?: string;
  business_type: string;
  commission_percentage: number;
  status: 'active' | 'inactive' | 'pending' | 'suspended';
  is_verified: boolean;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  created_at?: string;
  updated_at?: string;
  corporate_count?: number;
  partner_count?: number;
}

interface BrokerFormState {
  id?: number;
  broker_name: string;
  email: string;
  phone_number: string;
  contact_person: string;
  irdai_license_number: string;
  business_type: string;
  commission_percentage: string;
  status: Broker['status'];
  is_verified: boolean;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

const createBrokerFormState = (broker?: Broker): BrokerFormState => ({
  id: broker?.id,
  broker_name: broker?.broker_name || '',
  email: broker?.email || '',
  phone_number: broker?.phone_number || '',
  contact_person: broker?.contact_person || '',
  irdai_license_number: broker?.irdai_license_number || '',
  business_type: broker?.business_type || 'insurance_broker',
  commission_percentage: broker ? String(broker.commission_percentage) : '5',
  status: broker?.status || 'pending',
  is_verified: broker?.is_verified || false,
  website: broker?.website || '',
  address: broker?.address || '',
  city: broker?.city || '',
  state: broker?.state || '',
  pincode: broker?.pincode || '',
});

const BrokerManagement = () => {
  const { toast } = useToast();
  
  // Form and dialog state
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('list');
  const [editingBroker, setEditingBroker] = useState<Broker | null>(null);
  const [brokerForm, setBrokerForm] = useState<BrokerFormState | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const token = localStorage.getItem('adminToken');

  // List view state
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [verificationFilter, setVerificationFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  // Fetch brokers on component mount and when page changes
  useEffect(() => {
    fetchBrokers();
  }, [currentPage]);

  const fetchBrokers = async () => {
    try {
      setLoading(true);
      const offset = (currentPage - 1) * itemsPerPage;
      const { data } = await api.get(`/admin/aggregators?limit=${itemsPerPage}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBrokers(data.data || []);
      setTotalCount(data.total || 0);
    } catch (err) {
      console.error('Failed to fetch brokers:', err);
      toast({
        title: "Error",
        description: "Failed to fetch brokers",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Filtered brokers
  const filteredBrokers = useMemo(() => {
    return brokers.filter(broker => {
      const searchMatch = searchQuery === '' || 
        broker.broker_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        broker.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (broker.phone_number?.includes(searchQuery) || false) ||
        (broker.city?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
        (broker.contact_person?.toLowerCase().includes(searchQuery.toLowerCase()) || false);

      const statusMatch = statusFilter === 'all' || broker.status === statusFilter;
      const verificationMatch = verificationFilter === 'all' || 
        (verificationFilter === 'verified' && broker.is_verified) ||
        (verificationFilter === 'unverified' && !broker.is_verified);

      return searchMatch && statusMatch && verificationMatch;
    });
  }, [brokers, searchQuery, statusFilter, verificationFilter]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, verificationFilter]);

  const openBrokerDialog = (broker?: Broker) => {
    setEditingBroker(broker || null);
    setBrokerForm(createBrokerFormState(broker));
    setShowDialog(true);
  };

  const closeBrokerDialog = () => {
    setEditingBroker(null);
    setBrokerForm(null);
    setShowDialog(false);
  };

  const updateBrokerForm = <K extends keyof BrokerFormState>(field: K, value: BrokerFormState[K]) => {
    setBrokerForm(prev => prev ? { ...prev, [field]: value } : prev);
  };

  const handleSaveBroker = async () => {
    if (!brokerForm) return;

    if (!brokerForm.broker_name.trim() || !brokerForm.email.trim()) {
      toast({
        title: "Missing information",
        description: "Broker name and email are required.",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);

      const payload = {
        broker_name: brokerForm.broker_name.trim(),
        email: brokerForm.email.trim(),
        phone_number: brokerForm.phone_number.trim(),
        contact_person: brokerForm.contact_person.trim(),
        irdai_license_number: brokerForm.irdai_license_number.trim(),
        business_type: brokerForm.business_type,
        commission_percentage: Number(brokerForm.commission_percentage),
        status: brokerForm.status,
        is_verified: brokerForm.is_verified,
        website: brokerForm.website?.trim(),
        address: brokerForm.address?.trim(),
        city: brokerForm.city?.trim(),
        state: brokerForm.state?.trim(),
        pincode: brokerForm.pincode?.trim(),
      };

      if (editingBroker) {
        await api.put(`/admin/aggregators/${editingBroker.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast({
          title: "Success",
          description: `${brokerForm.broker_name} has been updated successfully.`
        });
      } else {
        await api.post(`/admin/aggregators`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast({
          title: "Success",
          description: `${brokerForm.broker_name} has been added successfully.`
        });
      }

      closeBrokerDialog();
      fetchBrokers();
    } catch (error: any) {
      console.error('Error saving broker:', error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to save broker",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBroker = async (broker: Broker) => {
    if (!confirm(`Are you sure you want to delete ${broker.broker_name}?`)) return;

    try {
      setLoading(true);
      await api.delete(`/admin/aggregators/${broker.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast({
        title: "Success",
        description: `${broker.broker_name} has been deleted successfully.`
      });
      fetchBrokers();
    } catch (error: any) {
      console.error('Error deleting broker:', error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to delete broker",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header and Controls */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Brokers & Aggregators</h1>
            <p className="text-muted-foreground">Manage insurance brokers and aggregators</p>
          </div>
          <Button onClick={() => openBrokerDialog()} variant="default">
            <Plus className="mr-2 h-4 w-4" />
            Add Broker
          </Button>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Broker Management</CardTitle>
              <p className="text-sm text-muted-foreground">
                Showing {filteredBrokers.length} of {totalCount} brokers
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
              </SelectContent>
            </Select>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Search and Filter Controls */}
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by broker name, email, phone, or city..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full lg:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
              <Select value={verificationFilter} onValueChange={setVerificationFilter}>
                <SelectTrigger className="w-full lg:w-[180px]">
                  <SelectValue placeholder="Verification" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Verification</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="unverified">Unverified</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Brokers Table */}
            {loading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Loading brokers...</p>
              </div>
            ) : filteredBrokers.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No brokers found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Broker Details</TableHead>
                      <TableHead>Contact Information</TableHead>
                      <TableHead>Commission %</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Verified</TableHead>
                      <TableHead>Stats</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBrokers.map((broker) => (
                      <TableRow key={broker.id}>
                        <TableCell>
                          <div className="font-medium">{broker.broker_name}</div>
                          <div className="text-sm text-muted-foreground">{broker.business_type}</div>
                          {broker.irdai_license_number && (
                            <div className="text-xs text-muted-foreground">Lic: {broker.irdai_license_number}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {broker.email}
                          </div>
                          {broker.phone_number && (
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {broker.phone_number}
                            </div>
                          )}
                          {broker.city && (
                            <div className="text-xs text-muted-foreground">{broker.city}, {broker.state}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold">{broker.commission_percentage}%</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={broker.status === 'active' ? 'default' : broker.status === 'pending' ? 'secondary' : 'outline'}>
                            {broker.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={broker.is_verified ? 'default' : 'outline'}>
                            {broker.is_verified ? '✓ Verified' : 'Unverified'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="font-medium">{broker.corporate_count || 0} Corporate</div>
                            <div className="text-muted-foreground">{broker.partner_count || 0} Partners</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openBrokerDialog(broker)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleDeleteBroker(broker)} className="text-red-600">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            {!loading && filteredBrokers.length > 0 && (
              <div className="flex justify-center items-center gap-2 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Broker Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingBroker ? `Edit ${editingBroker.broker_name}` : 'Add New Broker'}
              </DialogTitle>
            </DialogHeader>

            {brokerForm && (
              <div className="space-y-6">
                {/* Basic Information */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Basic Information</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="broker_name">Broker Name *</Label>
                      <Input
                        id="broker_name"
                        value={brokerForm.broker_name}
                        onChange={(e) => updateBrokerForm('broker_name', e.target.value)}
                        placeholder="e.g., Mayden Insurance"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={brokerForm.email}
                        onChange={(e) => updateBrokerForm('email', e.target.value)}
                        placeholder="admin@broker.com"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        value={brokerForm.phone_number}
                        onChange={(e) => updateBrokerForm('phone_number', e.target.value)}
                        placeholder="+91-XXXXXXXXXX"
                      />
                    </div>
                    <div>
                      <Label htmlFor="contact_person">Contact Person</Label>
                      <Input
                        id="contact_person"
                        value={brokerForm.contact_person}
                        onChange={(e) => updateBrokerForm('contact_person', e.target.value)}
                        placeholder="John Doe"
                      />
                    </div>
                  </div>
                </div>

                {/* Business Details */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Business Details</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="irdai_license">IRDAI License Number</Label>
                      <Input
                        id="irdai_license"
                        value={brokerForm.irdai_license_number}
                        onChange={(e) => updateBrokerForm('irdai_license_number', e.target.value)}
                        placeholder="IB-12345"
                      />
                    </div>
                    <div>
                      <Label htmlFor="business_type">Business Type</Label>
                      <Select value={brokerForm.business_type} onValueChange={(value) => updateBrokerForm('business_type', value)}>
                        <SelectTrigger id="business_type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="insurance_broker">Insurance Broker</SelectItem>
                          <SelectItem value="insurance_agent">Insurance Agent</SelectItem>
                          <SelectItem value="tpa">TPA</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="commission">Commission Percentage</Label>
                      <Input
                        id="commission"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={brokerForm.commission_percentage}
                        onChange={(e) => updateBrokerForm('commission_percentage', e.target.value)}
                        placeholder="5.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        value={brokerForm.website || ''}
                        onChange={(e) => updateBrokerForm('website', e.target.value)}
                        placeholder="https://broker.com"
                      />
                    </div>
                  </div>
                </div>

                {/* Address Information */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Address Information</h3>
                  
                  <div>
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      value={brokerForm.address || ''}
                      onChange={(e) => updateBrokerForm('address', e.target.value)}
                      placeholder="Street address"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={brokerForm.city || ''}
                        onChange={(e) => updateBrokerForm('city', e.target.value)}
                        placeholder="Mumbai"
                      />
                    </div>
                    <div>
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        value={brokerForm.state || ''}
                        onChange={(e) => updateBrokerForm('state', e.target.value)}
                        placeholder="Maharashtra"
                      />
                    </div>
                    <div>
                      <Label htmlFor="pincode">Pincode</Label>
                      <Input
                        id="pincode"
                        value={brokerForm.pincode || ''}
                        onChange={(e) => updateBrokerForm('pincode', e.target.value)}
                        placeholder="400001"
                      />
                    </div>
                  </div>
                </div>

                {/* Status and Verification */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Status & Verification</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="status">Status</Label>
                      <Select value={brokerForm.status} onValueChange={(value) => updateBrokerForm('status', value as Broker['status'])}>
                        <SelectTrigger id="status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={brokerForm.is_verified}
                          onChange={(e) => updateBrokerForm('is_verified', e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm">Mark as Verified</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={closeBrokerDialog}>
                Cancel
              </Button>
              <Button onClick={handleSaveBroker} disabled={loading}>
                {loading ? 'Saving...' : editingBroker ? 'Update Broker' : 'Add Broker'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default BrokerManagement;
