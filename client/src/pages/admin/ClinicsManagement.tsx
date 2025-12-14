import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Building, Search, Eye, Download, MapPin, CheckCircle2, AlertCircle,
  ChevronLeft, ChevronRight, Square, LayoutGrid, List,
} from 'lucide-react';
import axios from 'axios';
import { exportProviders } from '@/utils/exportToExcel';
import ProviderDetailModal from '@/components/providers/ProviderDetailModal';
import ProviderAnalytics from '@/components/providers/ProviderAnalytics';

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
  const [activeTab, setActiveTab] = useState('list');

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
      
      const { data } = await axios.get(`${API_BASE_URL}/masterdata/clinics`, { params });
      
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
        axios.get(`${API_BASE_URL}/masterdata/cities`),
        axios.get(`${API_BASE_URL}/masterdata/states`),
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
                              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                                <MapPin className="h-3 w-3" />
                                {clinic.city}{clinic.state && `, ${clinic.state}`}
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

                          <Button size="sm" variant="outline" onClick={() => handleViewDetails(clinic)}>
                            <Eye className="mr-2 h-4 w-4" />View Details
                          </Button>
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
                                    <span>{clinic.city}{clinic.state && `, ${clinic.state}`}</span>
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
      </div>
    </AdminLayout>
  );
};

export default ClinicsManagement;
