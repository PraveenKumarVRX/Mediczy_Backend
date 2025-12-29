import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Building, Search, Eye, Download, MapPin, CheckCircle2, AlertCircle,
  ChevronLeft, ChevronRight, Square, LayoutGrid, List,
} from 'lucide-react';
import axios from 'axios';
import { exportProviders } from '@/utils/exportToExcel';
import ProviderDetailModal from '@/components/providers/ProviderDetailModal';
import ProviderAnalytics from '@/components/providers/ProviderAnalytics';
import api from '@/utils/api';

// Get API base URL from environment
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const ClinicsManagement = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [clinics, setClinics] = useState<any[]>([]);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedType, setSelectedType] = useState('');
  
  const [cities, setCities] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  
  const [selectedClinics, setSelectedClinics] = useState<Set<string>>(new Set());
  const [bulkActionMode, setBulkActionMode] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  
  const [selectedClinic, setSelectedClinic] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    id: '',
    name: '',
    email: '',
    phone: '',
    city: '',
    state: '',
    type: '',
    specialization: '',
    doctorName: '',
    consultationFee: '',
    website: '',
  });
  const [activeTab, setActiveTab] = useState('list');

  const token = localStorage.getItem('adminToken');

  useEffect(() => {
    fetchClinics();
    fetchFilterOptions();
  }, [currentPage, searchQuery, selectedCity, selectedState, selectedType]);
  
  useEffect(() => {
    if (currentPage !== 1) setCurrentPage(1);
  }, [searchQuery, selectedCity, selectedState, selectedType]);

  const fetchClinics = async () => {
    try {
      setLoading(true);
      const params: any = { page: currentPage, limit: itemsPerPage };
      
      if (searchQuery) params.search = searchQuery;
      if (selectedCity) params.city = selectedCity;
      if (selectedState) params.state = selectedState;
      if (selectedType) params.type = selectedType;
      
      const { data } = await api.get(`/masterdata/clinics`, { params });
      
      if (data.success) {
        setClinics(data.data);
        setTotalCount(data.pagination.total);
      }
    } catch (err: any) {
      console.error('Failed to fetch clinics:', err);
      setError('Failed to load clinics');
      setClinics([]);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchFilterOptions = async () => {
    try {
      const [citiesRes, statesRes] = await Promise.all([
        api.get(`/masterdata/cities`),
        api.get(`/masterdata/states`),
      ]);
      
      if (citiesRes.data.success) setCities(citiesRes.data.data);
      if (statesRes.data.success) setStates(statesRes.data.data);
      
      // Extract unique types from clinics
      const uniqueTypes = [...new Set(clinics.map(c => c.sub_type || c.type).filter(Boolean))];
      setTypes(uniqueTypes);
    } catch (err) {
      console.error('Failed to fetch filter options:', err);
    }
  };
  
  const handleBulkSelect = (clinicId: string) => {
    const newSelection = new Set(selectedClinics);
    if (newSelection.has(clinicId)) newSelection.delete(clinicId);
    else newSelection.add(clinicId);
    setSelectedClinics(newSelection);
  };
  
  const handleSelectAll = () => {
    if (selectedClinics.size === clinics.length) setSelectedClinics(new Set());
    else setSelectedClinics(new Set(clinics.map(c => c.id?.toString() || '')));
  };
  
  const handleExport = (format: 'excel' | 'csv') => {
    exportProviders(clinics, 'clinic', format);
    setResult({ message: `Exported ${clinics.length} clinics as ${format.toUpperCase()}` });
  };
  
  const handleViewDetails = (clinic: any) => {
    setSelectedClinic(clinic);
    setShowDetailModal(true);
  };

  const handleOpenEdit = (clinic: any) => {
    setEditForm({
      id: clinic.id || '',
      name: clinic.name || '',
      email: clinic.email || clinic.contact?.email || '',
      phone: clinic.phone || clinic.mobile || clinic.contact?.phone || '',
      city: clinic.city || clinic.basic_info?.city || '',
      state: clinic.state || clinic.basic_info?.state || '',
      type: clinic.clinic_type || clinic.type || clinic.sub_type || '',
      specialization: clinic.specialization || clinic.specialty || clinic.sub_type || '',
      doctorName: clinic.doctor_name || clinic.metadata?.doctor_name || '',
      consultationFee: clinic.consultation_fee || clinic.metadata?.consultation_fee || '',
      website: clinic.website || clinic.metadata?.website || '',
    });
    setEditModalOpen(true);
  };

  const handleUpdateClinic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.id) return;
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.patch(`/admin/clinics/${editForm.id}/details`, { updates: editForm });
      if (data?.success && data.data) {
        const updated = data.data;
        setClinics(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
        setResult({ message: data.message || 'Clinic updated successfully' });
        setEditModalOpen(false);
      } else {
        setError(data?.message || 'Failed to update clinic');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update clinic');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <Building className="h-8 w-8 text-blue-500" />
              My Clinics Management
            </h2>
            <p className="text-muted-foreground">Manage clinic network and partnerships</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Clinics</p>
                  <p className="text-3xl font-bold">{totalCount}</p>
                </div>
                <Building className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Clinic Types</p>
                  <p className="text-3xl font-bold">{types.length}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Cities Covered</p>
                  <p className="text-3xl font-bold">{cities.length}</p>
                </div>
                <MapPin className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">States</p>
                  <p className="text-3xl font-bold">{states.length}</p>
                </div>
                <MapPin className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
        {result && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {result.message}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="list">Clinics List</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="map">Map View</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="relative lg:col-span-2">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search clinics..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  
                  <Select value={selectedState || 'all'} onValueChange={(val) => setSelectedState(val === 'all' ? '' : val)}>
                    <SelectTrigger><SelectValue placeholder="All States" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      {states.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  
                  <Select value={selectedCity || 'all'} onValueChange={(val) => setSelectedCity(val === 'all' ? '' : val)}>
                    <SelectTrigger><SelectValue placeholder="All Cities" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Cities</SelectItem>
                      {cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  
                  <Select value={selectedType || 'all'} onValueChange={(val) => setSelectedType(val === 'all' ? '' : val)}>
                    <SelectTrigger><SelectValue placeholder="All Types" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-2">
                    <Button variant={bulkActionMode ? 'default' : 'outline'} size="sm" onClick={() => setBulkActionMode(!bulkActionMode)}>
                      <Square className="mr-2 h-4 w-4" />
                      {bulkActionMode ? 'Cancel Bulk' : 'Bulk Actions'}
                    </Button>
                    {bulkActionMode && selectedClinics.size > 0 && (
                      <span className="text-sm text-muted-foreground">{selectedClinics.size} selected</span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="flex border rounded-md">
                      <Button 
                        variant={viewMode === 'grid' ? 'default' : 'ghost'} 
                        size="sm" 
                        onClick={() => setViewMode('grid')}
                        className="rounded-r-none"
                      >
                        <LayoutGrid className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant={viewMode === 'table' ? 'default' : 'ghost'} 
                        size="sm" 
                        onClick={() => setViewMode('table')}
                        className="rounded-l-none"
                      >
                        <List className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>
                      <Download className="mr-2 h-4 w-4" />Export Excel
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
                      <Download className="mr-2 h-4 w-4" />Export CSV
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {loading ? (
              <div className="text-center py-8">Loading clinics...</div>
            ) : clinics.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No clinics found.</p>
              </Card>
            ) : (
              <>
                {viewMode === 'grid' ? (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {bulkActionMode && (
                      <Card className="md:col-span-2 lg:col-span-3">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <Checkbox checked={selectedClinics.size === clinics.length} onCheckedChange={handleSelectAll} />
                            <span className="text-sm font-medium">Select All ({selectedClinics.size} of {clinics.length} selected)</span>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  
                  {clinics.map(clinic => (
                    <Card key={clinic.id} className="relative">
                      {bulkActionMode && (
                        <div className="absolute top-4 left-4 z-10">
                          <Checkbox checked={selectedClinics.has(clinic.id?.toString() || '')} onCheckedChange={() => handleBulkSelect(clinic.id?.toString() || '')} />
                        </div>
                      )}
                      
                      <CardContent className={`p-6 ${bulkActionMode ? 'pl-12' : ''}`}>
                        <div className="space-y-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold">{clinic.name}</h3>
                              {clinic.sub_type && <Badge variant="outline" className="mt-2">{clinic.sub_type}</Badge>}
                              <div className="flex items-start gap-2 mt-2 text-sm text-muted-foreground">
                                <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                <p className="line-clamp-2">{[clinic.address, clinic.city, clinic.state, clinic.pincode].filter(Boolean).join(', ') || 'Address not available'}</p>
                              </div>
                            </div>
                          </div>

                          {clinic.phone && (
                            <div className="text-sm"><span className="font-medium">Phone:</span> {clinic.phone}</div>
                          )}
                          
                          {clinic.quality_score && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">Quality Score:</span>
                              <Badge variant="outline">{clinic.quality_score}</Badge>
                            </div>
                          )}

                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleViewDetails(clinic)}>
                              <Eye className="mr-2 h-4 w-4" />View Details
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => handleOpenEdit(clinic)}>
                              Edit
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-muted/50 border-b">
                            <tr>
                              {bulkActionMode && (
                                <th className="p-4 text-left w-12">
                                  <Checkbox 
                                    checked={selectedClinics.size === clinics.length} 
                                    onCheckedChange={handleSelectAll} 
                                  />
                                </th>
                              )}
                              <th className="p-4 text-left font-semibold">Name</th>
                              <th className="p-4 text-left font-semibold">Type</th>
                              <th className="p-4 text-left font-semibold">Location</th>
                              <th className="p-4 text-left font-semibold">Contact</th>
                              <th className="p-4 text-left font-semibold">Specialization</th>
                              <th className="p-4 text-left font-semibold">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {clinics.map((clinic, index) => (
                              <tr key={clinic.id} className={`border-b hover:bg-muted/30 transition-colors ${index % 2 === 0 ? 'bg-background' : 'bg-muted/10'}`}>
                                {bulkActionMode && (
                                  <td className="p-4">
                                    <Checkbox 
                                      checked={selectedClinics.has(clinic.id?.toString() || '')} 
                                      onCheckedChange={() => handleBulkSelect(clinic.id?.toString() || '')} 
                                    />
                                  </td>
                                )}
                                <td className="p-4">
                                  <div className="font-semibold">{clinic.name}</div>
                                </td>
                                <td className="p-4 text-sm">{clinic.clinic_type || clinic.type || 'Clinic'}</td>
                                <td className="p-4 text-sm">
                                  <div className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3 text-muted-foreground" />
                                    <span className="line-clamp-2">{[clinic.address, clinic.city, clinic.state, clinic.pincode].filter(Boolean).join(', ') || 'Address not available'}</span>
                                  </div>
                                </td>
                                <td className="p-4 text-sm">
                                  {clinic.phone || clinic.mobile || '-'}
                                  {clinic.email && (
                                    <div className="text-xs text-muted-foreground">{clinic.email}</div>
                                  )}
                                </td>
                                <td className="p-4 text-sm">
                                  {clinic.specialization || clinic.specialty || '-'}
                                </td>
                                <td className="p-4">
                                  <Button size="sm" variant="outline" onClick={() => handleViewDetails(clinic)}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="secondary" className="ml-2" onClick={() => handleOpenEdit(clinic)}>
                                    Edit
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} clinics
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Select value={itemsPerPage.toString()} onValueChange={(val) => setItemsPerPage(Number(val))}>
                          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[10, 20, 50, 100].map(n => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        
                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        
                        <span className="text-sm">Page {currentPage} of {Math.ceil(totalCount / itemsPerPage)}</span>
                        
                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= Math.ceil(totalCount / itemsPerPage)}>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
          
          <TabsContent value="analytics"><ProviderAnalytics providers={clinics} type="clinic" /></TabsContent>
          
          <TabsContent value="map">
            <Card>
              <CardContent className="p-8 text-center">
                <MapPin className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-20" />
                <h3 className="text-lg font-semibold mb-2">Interactive Map Coming Soon</h3>
                <p className="text-muted-foreground">View all clinics on an interactive map.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        <ProviderDetailModal provider={selectedClinic} open={showDetailModal} onClose={() => setShowDetailModal(false)} type="clinic" />
        <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Clinic</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateClinic} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>Name</Label>
                  <Input value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} required />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={editForm.email} onChange={(e) => setEditForm({...editForm, email: e.target.value})} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={editForm.phone} onChange={(e) => setEditForm({...editForm, phone: e.target.value})} />
                </div>
                <div>
                  <Label>Type</Label>
                  <Input value={editForm.type} onChange={(e) => setEditForm({...editForm, type: e.target.value})} />
                </div>
                <div>
                  <Label>Specialization</Label>
                  <Input value={editForm.specialization} onChange={(e) => setEditForm({...editForm, specialization: e.target.value})} />
                </div>
                <div>
                  <Label>Doctor Name</Label>
                  <Input value={editForm.doctorName} onChange={(e) => setEditForm({...editForm, doctorName: e.target.value})} />
                </div>
                <div>
                  <Label>Consultation Fee</Label>
                  <Input value={editForm.consultationFee} onChange={(e) => setEditForm({...editForm, consultationFee: e.target.value})} />
                </div>
                <div>
                  <Label>City</Label>
                  <Input value={editForm.city} onChange={(e) => setEditForm({...editForm, city: e.target.value})} />
                </div>
                <div>
                  <Label>State</Label>
                  <Input value={editForm.state} onChange={(e) => setEditForm({...editForm, state: e.target.value})} />
                </div>
                <div>
                  <Label>Website</Label>
                  <Input value={editForm.website} onChange={(e) => setEditForm({...editForm, website: e.target.value})} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setEditModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default ClinicsManagement;
