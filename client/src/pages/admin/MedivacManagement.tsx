import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { useToast } from '../../hooks/use-toast';
import AdminLayout from '../../components/layout/AdminLayout';
import { 
  Plus, Search, Eye, Edit, Trash2, MoreVertical, Truck, Plane, Phone, Mail,
  ChevronLeft, ChevronRight, Activity, Clock
} from 'lucide-react';

interface MedivacProvider {
  id: string;
  providerName: string;
  registrationNumber: string;
  email: string;
  phoneNumber: string;
  contactPerson: string;
  city: string;
  state: string;
  vehicleTypes: string[];
  aircraftCount: number;
  groundVehicleCount: number;
  coverageArea: string;
  responseTime: string;
  rating?: number;
  status: 'Active' | 'Inactive' | 'Pending';
  joinedDate: string;
  lastService?: string;
}

interface MedivacFormState {
  providerName: string;
  registrationNumber: string;
  email: string;
  phoneNumber: string;
  contactPerson: string;
  city: string;
  state: string;
  vehicleTypes: string;
  aircraftCount: string;
  groundVehicleCount: string;
  coverageArea: string;
  responseTime: string;
  status: MedivacProvider['status'];
}

const sampleMedivacs: MedivacProvider[] = [
  {
    id: 'MED001',
    providerName: 'AirLife Medical Transport',
    registrationNumber: 'MEDV-2023-001',
    email: 'ops@airlifemedical.com',
    phoneNumber: '+91-11-28001000',
    contactPerson: 'Captain Rajesh Singh',
    city: 'Delhi',
    state: 'Delhi',
    vehicleTypes: ['Helicopter', 'Fixed Wing', 'Air Ambulance'],
    aircraftCount: 8,
    groundVehicleCount: 0,
    coverageArea: 'Pan India',
    responseTime: '30-60 minutes',
    rating: 4.8,
    status: 'Active',
    joinedDate: '2021-05-15',
    lastService: '2024-01-19'
  },
  {
    id: 'MED002',
    providerName: 'SkyMed Evacuation Services',
    registrationNumber: 'MEDV-2023-002',
    email: 'contact@skymedevac.com',
    phoneNumber: '+91-22-30005000',
    contactPerson: 'Dr. Priya Kapoor',
    city: 'Mumbai',
    state: 'Maharashtra',
    vehicleTypes: ['Helicopter', 'Air Ambulance', 'Medical Van'],
    aircraftCount: 5,
    groundVehicleCount: 12,
    coverageArea: 'Western India',
    responseTime: '20-45 minutes',
    rating: 4.6,
    status: 'Active',
    joinedDate: '2021-08-20',
    lastService: '2024-01-18'
  },
  {
    id: 'MED003',
    providerName: 'Emergency Air Transport',
    registrationNumber: 'MEDV-2023-003',
    email: 'info@emergencyair.in',
    phoneNumber: '+91-80-40008000',
    contactPerson: 'Cmdr. Anil Kumar',
    city: 'Bangalore',
    state: 'Karnataka',
    vehicleTypes: ['Fixed Wing', 'Helicopter'],
    aircraftCount: 6,
    groundVehicleCount: 8,
    coverageArea: 'South India',
    responseTime: '40-75 minutes',
    rating: 4.5,
    status: 'Active',
    joinedDate: '2022-02-10',
    lastService: '2024-01-17'
  }
];

const createEmptyMedivac = (): MedivacFormState => ({
  providerName: '',
  registrationNumber: '',
  email: '',
  phoneNumber: '',
  contactPerson: '',
  city: '',
  state: '',
  vehicleTypes: '',
  aircraftCount: '',
  groundVehicleCount: '',
  coverageArea: '',
  responseTime: '',
  status: 'Active',
});

const MedivacManagement = () => {
  const { toast } = useToast();
  const [medivacs, setMedivacs] = useState<MedivacProvider[]>(sampleMedivacs);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [newMedivac, setNewMedivac] = useState<MedivacFormState>(createEmptyMedivac());

  const filteredMedivacs = useMemo(() => {
    return medivacs.filter(medivac => {
      const matchesSearch = 
        medivac.providerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        medivac.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
        medivac.coverageArea.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || medivac.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [medivacs, searchTerm, statusFilter]);

  const paginatedMedivacs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredMedivacs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredMedivacs, currentPage]);

  const totalPages = Math.ceil(filteredMedivacs.length / itemsPerPage);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      Active: "default",
      Inactive: "secondary",
      Pending: "destructive"
    };
    return <Badge variant={variants[status] || "default"}>{status}</Badge>;
  };

  const resetMedivacForm = () => setNewMedivac(createEmptyMedivac());

  const handleAddMedivac = () => {
    if (!newMedivac.providerName.trim() || !newMedivac.phoneNumber.trim()) {
      toast({
        title: "Missing details",
        description: "Provider name and phone number are required.",
        variant: "destructive"
      });
      return;
    }

    const provider: MedivacProvider = {
      id: `MED${Date.now()}`,
      providerName: newMedivac.providerName.trim(),
      registrationNumber: newMedivac.registrationNumber.trim() || `MEDV-${new Date().getFullYear()}`,
      email: newMedivac.email.trim(),
      phoneNumber: newMedivac.phoneNumber.trim(),
      contactPerson: newMedivac.contactPerson.trim(),
      city: newMedivac.city.trim(),
      state: newMedivac.state.trim(),
      vehicleTypes: newMedivac.vehicleTypes
        .split(',')
        .map(v => v.trim())
        .filter(Boolean),
      aircraftCount: Number(newMedivac.aircraftCount) || 0,
      groundVehicleCount: Number(newMedivac.groundVehicleCount) || 0,
      coverageArea: newMedivac.coverageArea.trim() || 'Pan India',
      responseTime: newMedivac.responseTime.trim() || '30-60 minutes',
      status: newMedivac.status,
      joinedDate: new Date().toISOString().split('T')[0],
      lastService: new Date().toISOString().split('T')[0],
      rating: 4.5,
    };

    setMedivacs(prev => [provider, ...prev]);
    toast({
      title: "Provider added",
      description: `${provider.providerName} has been added to the directory.`
    });
    resetMedivacForm();
    setStatusFilter('all');
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Medical Evacuation Services</h1>
          <p className="text-muted-foreground">Manage air and ground medical evacuation providers</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Providers</CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{medivacs.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <Activity className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{medivacs.filter(m => m.status === 'Active').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Aircraft</CardTitle>
              <Plane className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {medivacs.reduce((acc, m) => acc + m.aircraftCount, 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ground Vehicles</CardTitle>
              <Truck className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {medivacs.reduce((acc, m) => acc + m.groundVehicleCount, 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="list" className="space-y-4">
          <TabsList>
            <TabsTrigger value="list">Medivac Providers</TabsTrigger>
            <TabsTrigger value="add">Add New Provider</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex gap-2 flex-1">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search providers..."
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
                  <Button onClick={() => setActiveTab('add')}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Provider
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider Name</TableHead>
                      <TableHead>Coverage Area</TableHead>
                      <TableHead>Fleet</TableHead>
                      <TableHead>Response Time</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedMedivacs.map((medivac) => (
                      <TableRow key={medivac.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{medivac.providerName}</div>
                            <div className="text-xs text-muted-foreground">{medivac.registrationNumber}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{medivac.coverageArea}</div>
                          <div className="text-xs text-muted-foreground">{medivac.city}, {medivac.state}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2 text-xs">
                            <Badge variant="outline" className="flex items-center gap-1">
                              <Plane className="h-3 w-3" />
                              {medivac.aircraftCount}
                            </Badge>
                            <Badge variant="outline" className="flex items-center gap-1">
                              <Truck className="h-3 w-3" />
                              {medivac.groundVehicleCount}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Clock className="h-3 w-3" />
                            {medivac.responseTime}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-xs">
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {medivac.phoneNumber}
                            </div>
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {medivac.email}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(medivac.status)}</TableCell>
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
                      Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredMedivacs.length)} of {filteredMedivacs.length} providers
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
                <CardTitle>Add New Medivac Provider</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="providerName">Provider Name</Label>
                    <Input
                      id="providerName"
                      placeholder="Enter provider name"
                      value={newMedivac.providerName}
                      onChange={(e) => setNewMedivac(prev => ({ ...prev, providerName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="regNumber">Registration Number</Label>
                    <Input
                      id="regNumber"
                      placeholder="MEDV-YYYY-XXX"
                      value={newMedivac.registrationNumber}
                      onChange={(e) => setNewMedivac(prev => ({ ...prev, registrationNumber: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="contact@provider.com"
                      value={newMedivac.email}
                      onChange={(e) => setNewMedivac(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      placeholder="+91-XX-XXXXXXXX"
                      value={newMedivac.phoneNumber}
                      onChange={(e) => setNewMedivac(prev => ({ ...prev, phoneNumber: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactPerson">Contact Person</Label>
                    <Input
                      id="contactPerson"
                      placeholder="Contact person name"
                      value={newMedivac.contactPerson}
                      onChange={(e) => setNewMedivac(prev => ({ ...prev, contactPerson: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="coverageArea">Coverage Area</Label>
                    <Input
                      id="coverageArea"
                      placeholder="e.g., Pan India, South India"
                      value={newMedivac.coverageArea}
                      onChange={(e) => setNewMedivac(prev => ({ ...prev, coverageArea: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="aircraftCount">Aircraft Count</Label>
                    <Input
                      id="aircraftCount"
                      type="number"
                      placeholder="0"
                      value={newMedivac.aircraftCount}
                      onChange={(e) => setNewMedivac(prev => ({ ...prev, aircraftCount: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="groundVehicles">Ground Vehicles</Label>
                    <Input
                      id="groundVehicles"
                      type="number"
                      placeholder="0"
                      value={newMedivac.groundVehicleCount}
                      onChange={(e) => setNewMedivac(prev => ({ ...prev, groundVehicleCount: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="responseTime">Response Time</Label>
                    <Input
                      id="responseTime"
                      placeholder="e.g., 30-60 minutes"
                      value={newMedivac.responseTime}
                      onChange={(e) => setNewMedivac(prev => ({ ...prev, responseTime: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      placeholder="City"
                      value={newMedivac.city}
                      onChange={(e) => setNewMedivac(prev => ({ ...prev, city: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="vehicleTypes">Vehicle Types</Label>
                    <Input
                      id="vehicleTypes"
                      placeholder="Helicopter, Fixed Wing, Air Ambulance (comma separated)"
                      value={newMedivac.vehicleTypes}
                      onChange={(e) => setNewMedivac(prev => ({ ...prev, vehicleTypes: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      placeholder="State"
                      value={newMedivac.state}
                      onChange={(e) => setNewMedivac(prev => ({ ...prev, state: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={newMedivac.status} onValueChange={(value) => setNewMedivac(prev => ({ ...prev, status: value as MedivacProvider['status'] }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <Button type="button" variant="outline" onClick={resetMedivacForm}>Reset</Button>
                  <Button type="button" onClick={handleAddMedivac}>Add Provider</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default MedivacManagement;
