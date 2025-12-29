import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import AdminLayout from '../../components/layout/AdminLayout';
import { 
  Plus, Search, Eye, Edit, Trash2, MoreVertical, Shield, Building2, Phone, Mail,
  ChevronLeft, ChevronRight, TrendingUp, Activity
} from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import api from '../../utils/api';

interface Insurer {
  id: string;
  insurerName: string;
  registrationNumber: string;
  email: string;
  phoneNumber: string;
  contactPerson: string;
  city: string;
  state: string;
  insuranceTypes: string[];
  claimSettlementRatio: number;
  networkHospitals: number;
  rating?: number;
  status: 'Active' | 'Inactive' | 'Pending';
  joinedDate: string;
  website?: string;
}

const sampleInsurers: Insurer[] = [
  {
    id: 'INS001',
    insurerName: 'Star Health Insurance',
    registrationNumber: 'IRDAI-HLT-001',
    email: 'info@starhealth.com',
    phoneNumber: '+91-44-28288888',
    contactPerson: 'Anand Roy',
    city: 'Chennai',
    state: 'Tamil Nadu',
    insuranceTypes: ['Health', 'Critical Illness', 'Family Floater', 'Senior Citizen'],
    claimSettlementRatio: 89.5,
    networkHospitals: 14000,
    rating: 4.5,
    status: 'Active',
    joinedDate: '2020-01-15',
    website: 'https://starhealth.in'
  },
  {
    id: 'INS002',
    insurerName: 'HDFC ERGO Health',
    registrationNumber: 'IRDAI-HLT-002',
    email: 'contact@hdfcergo.com',
    phoneNumber: '+91-22-66526600',
    contactPerson: 'Ritesh Kumar',
    city: 'Mumbai',
    state: 'Maharashtra',
    insuranceTypes: ['Health', 'Group Health', 'Travel', 'Personal Accident'],
    claimSettlementRatio: 92.3,
    networkHospitals: 12000,
    rating: 4.6,
    status: 'Active',
    joinedDate: '2020-03-20',
    website: 'https://hdfcergo.com'
  },
  {
    id: 'INS003',
    insurerName: 'ICICI Lombard',
    registrationNumber: 'IRDAI-HLT-003',
    email: 'care@icicilombard.com',
    phoneNumber: '+91-22-61961900',
    contactPerson: 'Priya Sharma',
    city: 'Mumbai',
    state: 'Maharashtra',
    insuranceTypes: ['Health', 'Critical Illness', 'Cancer', 'Maternity'],
    claimSettlementRatio: 90.8,
    networkHospitals: 11500,
    rating: 4.4,
    status: 'Active',
    joinedDate: '2020-06-10',
    website: 'https://icicilombard.com'
  }
];

const InsurerManagement = () => {
  const [insurers, setInsurers] = useState<Insurer[]>(sampleInsurers);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [newInsurer, setNewInsurer] = useState<Insurer>({
    id: '',
    insurerName: '',
    registrationNumber: '',
    email: '',
    phoneNumber: '',
    contactPerson: '',
    city: '',
    state: '',
    insuranceTypes: [],
    claimSettlementRatio: 0,
    networkHospitals: 0,
    status: 'Active',
    joinedDate: new Date().toISOString().split('T')[0],
    website: '',
  });

  const filteredInsurers = useMemo(() => {
    return insurers.filter(insurer => {
      const matchesSearch = 
        insurer.insurerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        insurer.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
        insurer.state.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || insurer.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [insurers, searchTerm, statusFilter]);

  const paginatedInsurers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredInsurers.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredInsurers, currentPage]);

  const totalPages = Math.ceil(filteredInsurers.length / itemsPerPage);

  const token = typeof window !== 'undefined' ? (localStorage.getItem('adminToken') || localStorage.getItem('token') || '') : '';

  const handleAddInsurer = async () => {
    if (!newInsurer.insurerName.trim() || !newInsurer.phoneNumber.trim()) {
      toast({ title: 'Missing details', description: 'Insurer name and phone are required.', variant: 'destructive' });
      return;
    }

    const payload = {
      ...newInsurer,
      id: newInsurer.id || `INS${Date.now()}`,
      insuranceTypes: Array.isArray(newInsurer.insuranceTypes)
        ? newInsurer.insuranceTypes
        : (newInsurer.insuranceTypes as any)?.toString().split(',').map((t: string) => t.trim()).filter(Boolean),
      joinedDate: newInsurer.joinedDate || new Date().toISOString().split('T')[0],
    } as Insurer;

    try {
      setAdding(true);
      const { data } = await api.post('/admin/insurers', payload, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
      const created = (data as any)?.insurer || payload;
      setInsurers(prev => [created, ...prev]);
      toast({ title: 'Insurer added', description: `${created.insurerName} saved successfully.` });
      setNewInsurer({
        id: '',
        insurerName: '',
        registrationNumber: '',
        email: '',
        phoneNumber: '',
        contactPerson: '',
        city: '',
        state: '',
        insuranceTypes: [],
        claimSettlementRatio: 0,
        networkHospitals: 0,
        status: 'Active',
        joinedDate: new Date().toISOString().split('T')[0],
        website: '',
      });
    } catch (err: any) {
      console.warn('Insurer API unavailable, using local state', err);
      setInsurers(prev => [payload, ...prev]);
      toast({ title: 'Offline save', description: 'Saved locally because the API was unreachable.' });
    } finally {
      setAdding(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      Active: "default",
      Inactive: "secondary",
      Pending: "destructive"
    };
    return <Badge variant={variants[status] || "default"}>{status}</Badge>;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Insurance Providers</h1>
          <p className="text-muted-foreground">Manage insurance companies and providers</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Insurers</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{insurers.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <Activity className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{insurers.filter(i => i.status === 'Active').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Settlement Ratio</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(insurers.reduce((acc, i) => acc + i.claimSettlementRatio, 0) / insurers.length).toFixed(1)}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Network</CardTitle>
              <Building2 className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(insurers.reduce((acc, i) => acc + i.networkHospitals, 0) / 1000).toFixed(0)}K
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="list" className="space-y-4">
          <TabsList>
            <TabsTrigger value="list">Insurers List</TabsTrigger>
            <TabsTrigger value="add">Add New Insurer</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex gap-2 flex-1">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search insurers..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Insurer
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Insurer Name</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Settlement Ratio</TableHead>
                      <TableHead>Network Size</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedInsurers.map((insurer) => (
                      <TableRow key={insurer.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{insurer.insurerName}</div>
                            <div className="text-xs text-muted-foreground">{insurer.registrationNumber}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{insurer.city}, {insurer.state}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-xs">
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {insurer.phoneNumber}
                            </div>
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {insurer.email}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{insurer.claimSettlementRatio}%</Badge>
                        </TableCell>
                        <TableCell>{insurer.networkHospitals.toLocaleString()}</TableCell>
                        <TableCell>{getStatusBadge(insurer.status)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-red-600">
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

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                      Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredInsurers.length)} of {filteredInsurers.length} insurers
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="add">
            <Card>
              <CardHeader>
                <CardTitle>Add New Insurance Provider</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="insurerName">Insurer Name</Label>
                    <Input
                      id="insurerName"
                      placeholder="Enter insurer name"
                      value={newInsurer.insurerName}
                      onChange={(e) => setNewInsurer(prev => ({ ...prev, insurerName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="regNumber">Registration Number</Label>
                    <Input
                      id="regNumber"
                      placeholder="IRDAI registration number"
                      value={newInsurer.registrationNumber}
                      onChange={(e) => setNewInsurer(prev => ({ ...prev, registrationNumber: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="contact@insurer.com"
                      value={newInsurer.email}
                      onChange={(e) => setNewInsurer(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      placeholder="+91-XXX-XXXXXXX"
                      value={newInsurer.phoneNumber}
                      onChange={(e) => setNewInsurer(prev => ({ ...prev, phoneNumber: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactPerson">Contact Person</Label>
                    <Input
                      id="contactPerson"
                      placeholder="Contact person name"
                      value={newInsurer.contactPerson}
                      onChange={(e) => setNewInsurer(prev => ({ ...prev, contactPerson: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      placeholder="https://insurer.com"
                      value={newInsurer.website || ''}
                      onChange={(e) => setNewInsurer(prev => ({ ...prev, website: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      placeholder="City"
                      value={newInsurer.city}
                      onChange={(e) => setNewInsurer(prev => ({ ...prev, city: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      placeholder="State"
                      value={newInsurer.state}
                      onChange={(e) => setNewInsurer(prev => ({ ...prev, state: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="insuranceTypes">Insurance Types</Label>
                    <Input
                      id="insuranceTypes"
                      placeholder="Health, Critical Illness, Family Floater (comma separated)"
                      value={(Array.isArray(newInsurer.insuranceTypes) ? newInsurer.insuranceTypes.join(', ') : '')}
                      onChange={(e) => setNewInsurer(prev => ({ ...prev, insuranceTypes: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <Button variant="outline" onClick={() => setNewInsurer({
                    id: '', insurerName: '', registrationNumber: '', email: '', phoneNumber: '', contactPerson: '', city: '', state: '', insuranceTypes: [], claimSettlementRatio: 0, networkHospitals: 0, status: 'Active', joinedDate: new Date().toISOString().split('T')[0], website: '',
                  })}>Cancel</Button>
                  <Button onClick={handleAddInsurer} disabled={adding}>
                    {adding ? 'Saving...' : 'Add Insurer'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default InsurerManagement;
