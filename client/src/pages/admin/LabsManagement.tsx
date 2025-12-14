import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  FlaskConical, Search, Eye, Download, MapPin, CheckCircle2, AlertCircle,
  ChevronLeft, ChevronRight, BarChart3, Square, LayoutGrid, List,
} from 'lucide-react';
import axios from 'axios';
import { exportProviders } from '@/utils/exportToExcel';
import ProviderDetailModal from '@/components/providers/ProviderDetailModal';
import ProviderAnalytics from '@/components/providers/ProviderAnalytics';

// Get API base URL from environment
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const LabsManagement = () => {
  // State management
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [labs, setLabs] = useState<any[]>([]);
  
  // Pagination and filters
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  
  // Dropdown options
  const [cities, setCities] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  
  // Bulk actions
  const [selectedLabs, setSelectedLabs] = useState<Set<string>>(new Set());
  const [bulkActionMode, setBulkActionMode] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  
  // Detail modal
  const [selectedLab, setSelectedLab] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // Active tab
  const [activeTab, setActiveTab] = useState('list');

  useEffect(() => {
    fetchLabs();
    fetchFilterOptions();
  }, [currentPage, searchQuery, selectedCity, selectedState, selectedArea]);
  
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [searchQuery, selectedCity, selectedState, selectedArea]);

  const fetchLabs = async () => {
    try {
      setLoading(true);
      const params: any = {
        page: currentPage,
        limit: itemsPerPage,
      };
      
      if (searchQuery) params.search = searchQuery;
      if (selectedCity) params.city = selectedCity;
      if (selectedState) params.state = selectedState;
      if (selectedArea) params.area = selectedArea;
      
      const { data } = await axios.get(`${API_BASE_URL}/masterdata/labs`, { params });
      
      if (data.success) {
        setLabs(data.data);
        setTotalCount(data.pagination.total);
      }
    } catch (err: any) {
      console.error('Failed to fetch labs:', err);
      setError('Failed to load labs');
      setLabs([]);
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
      
      if (selectedCity) {
        const areasRes = await axios.get(`${API_BASE_URL}/masterdata/areas`, {
          params: { city: selectedCity }
        });
        if (areasRes.data.success) setAreas(areasRes.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch filter options:', err);
    }
  };
  
  const handleBulkSelect = (labId: string) => {
    const newSelection = new Set(selectedLabs);
    if (newSelection.has(labId)) {
      newSelection.delete(labId);
    } else {
      newSelection.add(labId);
    }
    setSelectedLabs(newSelection);
  };
  
  const handleSelectAll = () => {
    if (selectedLabs.size === labs.length) {
      setSelectedLabs(new Set());
    } else {
      setSelectedLabs(new Set(labs.map(l => l.id?.toString() || '')));
    }
  };
  
  const handleExport = (format: 'excel' | 'csv') => {
    exportProviders(labs, 'lab', format);
    setResult({ message: `Exported ${labs.length} labs as ${format.toUpperCase()}` });
  };
  
  const handleViewDetails = (lab: any) => {
    setSelectedLab(lab);
    setShowDetailModal(true);
  };

  // Stats calculations
  const mappedLabs = labs.filter(l => l.pincode_mapped).length;
  const mappedPercent = labs.length > 0 ? ((mappedLabs / labs.length) * 100).toFixed(1) : '0';
  const withCoordinates = labs.filter(l => l.coordinates && (l.coordinates.lat || l.coordinates.latitude)).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <FlaskConical className="h-8 w-8 text-lime-500" />
              My Labs Management
            </h2>
            <p className="text-muted-foreground">Manage laboratory network and partnerships</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Labs</p>
                  <p className="text-3xl font-bold">{totalCount}</p>
                </div>
                <FlaskConical className="h-8 w-8 text-lime-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Pincode Mapped</p>
                  <p className="text-3xl font-bold">{mappedPercent}%</p>
                  <p className="text-xs text-muted-foreground mt-1">{mappedLabs} of {labs.length}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">With GPS Coords</p>
                  <p className="text-3xl font-bold">{withCoordinates}</p>
                </div>
                <MapPin className="h-8 w-8 text-blue-500" />
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
        </div>

        {/* Error and Success Messages */}
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
            <TabsTrigger value="list">Labs List</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="map">Map View</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            {/* Search and Filter Bar */}
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="relative lg:col-span-2">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search labs by name or address..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  
                  <Select value={selectedState || 'all'} onValueChange={(val) => setSelectedState(val === 'all' ? '' : val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All States" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      {states.map((state) => (
                        <SelectItem key={state} value={state}>{state}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Select value={selectedCity || 'all'} onValueChange={(val) => setSelectedCity(val === 'all' ? '' : val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Cities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Cities</SelectItem>
                      {cities.map((city) => (
                        <SelectItem key={city} value={city}>{city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Select value={selectedArea || 'all'} onValueChange={(val) => setSelectedArea(val === 'all' ? '' : val)} disabled={!selectedCity}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Areas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Areas</SelectItem>
                      {areas.map((area) => (
                        <SelectItem key={area} value={area}>{area}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Action Bar */}
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-2">
                    <Button
                      variant={bulkActionMode ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setBulkActionMode(!bulkActionMode)}
                    >
                      <Square className="mr-2 h-4 w-4" />
                      {bulkActionMode ? 'Cancel Bulk' : 'Bulk Actions'}
                    </Button>
                    
                    {bulkActionMode && selectedLabs.size > 0 && (
                      <span className="text-sm text-muted-foreground">
                        {selectedLabs.size} selected
                      </span>
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
                      <Download className="mr-2 h-4 w-4" />
                      Export Excel
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
                      <Download className="mr-2 h-4 w-4" />
                      Export CSV
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {loading ? (
              <div className="text-center py-8">Loading labs...</div>
            ) : labs.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No labs found. Try adjusting your filters.</p>
              </Card>
            ) : (
              <>
                {viewMode === 'grid' ? (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {bulkActionMode && (
                      <Card className="md:col-span-2 lg:col-span-3">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={selectedLabs.size === labs.length}
                              onCheckedChange={handleSelectAll}
                            />
                            <span className="text-sm font-medium">
                              Select All ({selectedLabs.size} of {labs.length} selected)
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  
                  {labs.map((lab) => (
                    <Card key={lab.id} className="relative">
                      {bulkActionMode && (
                        <div className="absolute top-4 left-4 z-10">
                          <Checkbox
                            checked={selectedLabs.has(lab.id?.toString() || '')}
                            onCheckedChange={() => handleBulkSelect(lab.id?.toString() || '')}
                          />
                        </div>
                      )}
                      
                      <CardContent className={`p-6 ${bulkActionMode ? 'pl-12' : ''}`}>
                        <div className="space-y-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold">{lab.name}</h3>
                              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                                <MapPin className="h-3 w-3" />
                                {lab.area && `${lab.area}, `}
                                {lab.city}{lab.state && `, ${lab.state}`}
                              </div>
                            </div>
                            {lab.pincode_mapped && (
                              <Badge variant="secondary" className="text-xs">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Mapped
                              </Badge>
                            )}
                          </div>

                          {lab.pincode && (
                            <div className="text-sm">
                              <span className="font-medium">Pincode:</span> {lab.pincode}
                            </div>
                          )}
                          
                          {lab.locality && (
                            <div className="text-sm">
                              <span className="font-medium">Locality:</span> {lab.locality}
                            </div>
                          )}

                          {lab.phone && (
                            <div className="text-sm">
                              <span className="font-medium">Phone:</span> {lab.phone}
                            </div>
                          )}

                          {lab.quality_score && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">Quality Score:</span>
                              <Badge variant="outline">{lab.quality_score}</Badge>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleViewDetails(lab)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
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
                                    checked={selectedLabs.size === labs.length} 
                                    onCheckedChange={handleSelectAll} 
                                  />
                                </th>
                              )}
                              <th className="p-4 text-left font-semibold">Name</th>
                              <th className="p-4 text-left font-semibold">Location</th>
                              <th className="p-4 text-left font-semibold">Pincode</th>
                              <th className="p-4 text-left font-semibold">Contact</th>
                              <th className="p-4 text-left font-semibold">Status</th>
                              <th className="p-4 text-left font-semibold">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {labs.map((lab, index) => (
                              <tr key={lab.id} className={`border-b hover:bg-muted/30 transition-colors ${index % 2 === 0 ? 'bg-background' : 'bg-muted/10'}`}>
                                {bulkActionMode && (
                                  <td className="p-4">
                                    <Checkbox 
                                      checked={selectedLabs.has(lab.id?.toString() || '')} 
                                      onCheckedChange={() => handleBulkSelect(lab.id?.toString() || '')} 
                                    />
                                  </td>
                                )}
                                <td className="p-4">
                                  <div className="font-semibold">{lab.name}</div>
                                </td>
                                <td className="p-4 text-sm">
                                  <div className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3 text-muted-foreground" />
                                    <span>{lab.area && `${lab.area}, `}{lab.city}{lab.state && `, ${lab.state}`}</span>
                                  </div>
                                </td>
                                <td className="p-4 text-sm">
                                  {lab.pincode ? (
                                    <span>{lab.pincode}</span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="p-4 text-sm">
                                  {lab.phone || lab.mobile || '-'}
                                  {lab.email && (
                                    <div className="text-xs text-muted-foreground">{lab.email}</div>
                                  )}
                                </td>
                                <td className="p-4">
                                  {lab.pincode ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                                  )}
                                </td>
                                <td className="p-4">
                                  <Button size="sm" variant="outline" onClick={() => handleViewDetails(lab)}>
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
                
                {/* Pagination */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                        {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} labs
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Select value={itemsPerPage.toString()} onValueChange={(val) => setItemsPerPage(Number(val))}>
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="20">20</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100</SelectItem>
                          </SelectContent>
                        </Select>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        
                        <span className="text-sm">
                          Page {currentPage} of {Math.ceil(totalCount / itemsPerPage)}
                        </span>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => p + 1)}
                          disabled={currentPage >= Math.ceil(totalCount / itemsPerPage)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
          
          <TabsContent value="analytics" className="space-y-4">
            <ProviderAnalytics providers={labs} type="lab" />
          </TabsContent>
          
          <TabsContent value="map" className="space-y-4">
            <Card>
              <CardContent className="p-8 text-center">
                <MapPin className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-20" />
                <h3 className="text-lg font-semibold mb-2">Interactive Map Coming Soon</h3>
                <p className="text-muted-foreground">
                  View all labs on an interactive map with clustering and filtering capabilities.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {withCoordinates} labs have GPS coordinates ready for mapping.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        {/* Provider Detail Modal */}
        <ProviderDetailModal
          provider={selectedLab}
          open={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          type="lab"
        />
      </div>
    </AdminLayout>
  );
};

export default LabsManagement;
