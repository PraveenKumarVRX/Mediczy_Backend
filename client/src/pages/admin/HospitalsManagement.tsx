import { useState, useRef, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Download, Plus, FileSpreadsheet, Building, Bed, Users, MapPin, Search, Eye, Filter, ChevronLeft, ChevronRight, BarChart3, Square, LayoutGrid, List } from 'lucide-react';
import axios from 'axios';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { exportProviders } from '@/utils/exportToExcel';
import ProviderDetailModal from '@/components/providers/ProviderDetailModal';
import ProviderAnalytics from '@/components/providers/ProviderAnalytics';
import api from '@/utils/api';
import { downloadExcelTemplate, parseExcelFile } from '@/utils/excelParser';

interface Hospital {
  id?: number;
  name: string;
  registrationNumber: string;
  email: string;
  phoneNumber: string;
  address: {
    street: string;
    city: string;
    state: string;
    pincode: string;
  };
  type: string;
  totalBeds: number;
  availableBeds: number;
  specialties: string[];
  emergencyServices: boolean;
  isActive: boolean;
  accreditation?: string;
  website?: string;
}

const hospitalTypes = [
  'General Hospital', 'Specialty Hospital', 'Super Specialty Hospital', 
  'Multi Specialty Hospital', 'Teaching Hospital', 'Government Hospital',
  'Private Hospital', 'Corporate Hospital', 'Nursing Home'
];

const specialties = [
  'Cardiology', 'Neurology', 'Orthopedics', 'Oncology', 'Pediatrics',
  'Gynecology', 'Dermatology', 'Psychiatry', 'Emergency Medicine',
  'Radiology', 'Pathology', 'Anesthesiology', 'General Surgery',
  'Internal Medicine', 'ENT', 'Ophthalmology', 'Nephrology'
];

// Get API base URL from environment
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const HospitalsManagement = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [jsonInput, setJsonInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = localStorage.getItem('adminToken');

  // Pagination and filters
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedState, setSelectedState] = useState('all');
  const [selectedArea, setSelectedArea] = useState('all');
  
  // Dropdown options
  const [cities, setCities] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  
  // Bulk actions
  const [selectedHospitals, setSelectedHospitals] = useState<Set<string>>(new Set());
  const [bulkActionMode, setBulkActionMode] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  
  // Detail modal
  const [selectedHospital, setSelectedHospital] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // Active tab
  const [activeTab, setActiveTab] = useState('list');

  // Single hospital form state
  const [newHospital, setNewHospital] = useState<Hospital>({
    name: '',
    registrationNumber: '',
    email: '',
    phoneNumber: '',
    address: { street: '', city: '', state: '', pincode: '' },
    type: '',
    totalBeds: 0,
    availableBeds: 0,
    specialties: [],
    emergencyServices: false,
    isActive: true
  });

  useEffect(() => {
    fetchHospitals();
    fetchFilterOptions();
  }, [currentPage, searchQuery, selectedCity, selectedState, selectedArea]);
  
  useEffect(() => {
    // Reset page when filters change
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [searchQuery, selectedCity, selectedState, selectedArea]);

  const fetchHospitals = async () => {
    try {
      setLoading(true);
      const params: any = {
        page: currentPage,
        limit: itemsPerPage,
      };
      
      if (searchQuery) params.search = searchQuery;
      if (selectedCity && selectedCity !== 'all') params.city = selectedCity;
      if (selectedState && selectedState !== 'all') params.state = selectedState;
      if (selectedArea && selectedArea !== 'all') params.area = selectedArea;
      
      const { data } = await axios.get(`${API_BASE_URL}/masterdata/hospitals`, { params });
      
      if (data.success) {
        setHospitals(data.data);
        setTotalCount(data.pagination.total);
      }
    } catch (err: any) {
      console.error('Failed to fetch hospitals:', err);
      setError('Failed to load hospitals');
      setHospitals([]);
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
      
      // Fetch areas if city is selected
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
  
  const handleBulkSelect = (hospitalId: string) => {
    const newSelection = new Set(selectedHospitals);
    if (newSelection.has(hospitalId)) {
      newSelection.delete(hospitalId);
    } else {
      newSelection.add(hospitalId);
    }
    setSelectedHospitals(newSelection);
  };
  
  const handleSelectAll = () => {
    if (selectedHospitals.size === hospitals.length) {
      setSelectedHospitals(new Set());
    } else {
      setSelectedHospitals(new Set(hospitals.map(h => h.id?.toString() || '')));
    }
  };
  
  const handleBulkAction = async (action: 'activate' | 'deactivate' | 'delete') => {
    if (selectedHospitals.size === 0) {
      setError('No hospitals selected');
      return;
    }
    
    try {
      setLoading(true);
      // TODO: Implement bulk action API endpoint
      setResult({ message: `Bulk ${action} will be implemented soon`, count: selectedHospitals.size });
      setSelectedHospitals(new Set());
      setBulkActionMode(false);
    } catch (err: any) {
      setError(`Bulk ${action} failed`);
    } finally {
      setLoading(false);
    }
  };
  
  const handleExport = (format: 'excel' | 'csv') => {
    exportProviders(hospitals, 'hospital', format);
    setResult({ message: `Exported ${hospitals.length} hospitals as ${format.toUpperCase()}` });
  };
  
  const handleViewDetails = (hospital: any) => {
    setSelectedHospital(hospital);
    setShowDetailModal(true);
  };

  const handleSingleHospitalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      // Admin hospital creation endpoint to be implemented
      // const { data } = await axios.post('/api/admin/hospitals',
      //   { hospital: newHospital },
      //   { headers: { Authorization: `Bearer ${token}` } }
      // );
      const data = { message: 'Hospital creation endpoint not yet implemented' };
      
      setResult(data);
      setNewHospital({
        name: '',
        registrationNumber: '',
        email: '',
        phoneNumber: '',
        address: { street: '', city: '', state: '', pincode: '' },
        type: '',
        totalBeds: 0,
        availableBeds: 0,
        specialties: [],
        emergencyServices: false,
        isActive: true
      });
      fetchHospitals();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create hospital');
    } finally {
      setLoading(false);
    }
  };

  const handleJsonUpload = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const hospitals = JSON.parse(jsonInput);
      const { data } = await api.post('/admin/hospitals/bulk',
        { hospitals: Array.isArray(hospitals) ? hospitals : [hospitals] },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setResult(data);
      setJsonInput('');
      fetchHospitals();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'JSON upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Hospital Name': 'Apollo Hospital',
        'Registration Number': 'REG001',
        'Email': 'contact@apollo.com',
        'Phone': '+91-1234567890',
        'Type': 'Multi Specialty Hospital',
        'Total Beds': 500,
        'Available Beds': 100,
        'Street Address': '123 Main Street',
        'City': 'Mumbai',
        'State': 'Maharashtra',
        'Pincode': '400001',
        'Specialties': 'Cardiology,Neurology,Orthopedics',
        'Emergency Services': 'Yes',
        'Accreditation': 'NABH',
        'Website': 'https://apollo.com',
        'Active': 'Yes'
      },
      {
        'Hospital Name': 'Fortis Healthcare',
        'Registration Number': 'REG002',
        'Email': 'info@fortis.com',
        'Phone': '+91-9876543210',
        'Type': 'Super Specialty Hospital',
        'Total Beds': 300,
        'Available Beds': 50,
        'Street Address': '456 Park Road',
        'City': 'Delhi',
        'State': 'Delhi',
        'Pincode': '110001',
        'Specialties': 'Oncology,Cardiology',
        'Emergency Services': 'Yes',
        'Accreditation': 'JCI',
        'Website': 'https://fortis.com',
        'Active': 'Yes'
      }
    ];

    const columns = [
      'Hospital Name',
      'Registration Number',
      'Email',
      'Phone',
      'Type',
      'Total Beds',
      'Available Beds',
      'Street Address',
      'City',
      'State',
      'Pincode',
      'Specialties',
      'Emergency Services',
      'Accreditation',
      'Website',
      'Active'
    ];
    downloadExcelTemplate(
      columns,
      'Hospital_Upload',
      templateData,
      [25, 18, 25, 18, 25, 12, 15, 30, 15, 15, 10, 35, 18, 15, 25, 10]
    );
    setResult({ message: 'Template downloaded successfully' });
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const jsonData = await parseExcelFile(file);

      // Transform Excel data to hospital format
      const hospitals = jsonData.map((row: any) => ({
        name: row['Hospital Name'],
        registrationNumber: row['Registration Number'],
        email: row['Email'],
        phoneNumber: row['Phone'],
        type: row['Type'],
        totalBeds: parseInt(row['Total Beds']) || 0,
        availableBeds: parseInt(row['Available Beds']) || 0,
        address: {
          street: row['Street Address'] || '',
          city: row['City'] || '',
          state: row['State'] || '',
          pincode: row['Pincode'] || ''
        },
        specialties: row['Specialties'] ? row['Specialties'].split(',').map((s: string) => s.trim()) : [],
        emergencyServices: row['Emergency Services']?.toLowerCase() === 'yes',
        accreditation: row['Accreditation'] || '',
        website: row['Website'] || '',
        isActive: row['Active']?.toLowerCase() !== 'no'
      }));

      // Upload to backend
      const response = await api.post('/admin/hospitals/bulk',
        { hospitals },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setResult({ 
        message: `Successfully uploaded ${hospitals.length} hospitals`, 
        count: hospitals.length 
      });
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      fetchHospitals();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Excel upload failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSpecialtyToggle = (specialty: string) => {
    setNewHospital(prev => ({
      ...prev,
      specialties: prev.specialties.includes(specialty)
        ? prev.specialties.filter(s => s !== specialty)
        : [...prev.specialties, specialty]
    }));
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <Building className="h-8 w-8" />
              My Hospitals
            </h2>
            <p className="text-muted-foreground">Manage hospital network and partnerships</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              Total: {hospitals.length} hospitals
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Hospitals</p>
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
                  <p className="text-sm font-medium text-muted-foreground">Current Page</p>
                  <p className="text-3xl font-bold">{hospitals.length}</p>
                </div>
                <Users className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">With Beds Data</p>
                  <p className="text-3xl font-bold">{hospitals.filter(h => h.beds || h.totalBeds).length}</p>
                </div>
                <Bed className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">With Contact</p>
                  <p className="text-3xl font-bold">{hospitals.filter(h => h.contact?.phone || h.contact?.email || h.phone || h.email).length}</p>
                </div>
                <Building className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
            {result.message} {result.count !== undefined && `(${result.count} records)`}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="list">Hospital List</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="map">Map View</TabsTrigger>
            <TabsTrigger value="create">Add Hospital</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Import</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            {/* Search and Filter Bar */}
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="relative lg:col-span-2">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search hospitals by name or address..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  
                  <Select value={selectedState} onValueChange={setSelectedState}>
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
                  
                  <Select value={selectedCity} onValueChange={setSelectedCity}>
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
                  
                  <Select value={selectedArea} onValueChange={setSelectedArea} disabled={!selectedCity}>
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
                    
                    {bulkActionMode && selectedHospitals.size > 0 && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => handleBulkAction('activate')}>
                          Activate ({selectedHospitals.size})
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleBulkAction('deactivate')}>
                          Deactivate ({selectedHospitals.size})
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleBulkAction('delete')}>
                          Delete ({selectedHospitals.size})
                        </Button>
                      </>
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
              <div className="text-center py-8">Loading hospitals...</div>
            ) : hospitals.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No hospitals found. Try adjusting your filters.</p>
              </Card>
            ) : (
              <>
                {viewMode === 'grid' ? (
                  <div className="grid md:grid-cols-2 gap-6">
                    {bulkActionMode && (
                      <Card className="md:col-span-2">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={selectedHospitals.size === hospitals.length}
                              onCheckedChange={handleSelectAll}
                            />
                            <span className="text-sm font-medium">
                              Select All ({selectedHospitals.size} of {hospitals.length} selected)
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  
                  {hospitals.map((hospital) => (
                    <Card key={hospital.id} className="relative">
                      {bulkActionMode && (
                        <div className="absolute top-4 left-4 z-10">
                          <Checkbox
                            checked={selectedHospitals.has(hospital.id?.toString() || '')}
                            onCheckedChange={() => handleBulkSelect(hospital.id?.toString() || '')}
                          />
                        </div>
                      )}
                      
                      <CardContent className={`p-6 ${bulkActionMode ? 'pl-12' : ''}`}>
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  hospital.classification === 'hospital' ? 'bg-blue-100 text-blue-700' :
                                  hospital.classification === 'pharmacy' ? 'bg-green-100 text-green-700' :
                                  hospital.classification === 'clinic' ? 'bg-purple-100 text-purple-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {hospital.classification || 'unknown'}
                                </span>
                                <span className="text-xs text-blue-600">ID: {hospital.id}</span>
                              </div>
                              
                              <div className="flex items-start gap-2 text-sm">
                                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                                <p className="line-clamp-3 text-gray-700">
                                  {hospital.address || 'Address not available'}
                                </p>
                              </div>
                              
                              {hospital.name && hospital.name !== 'Unknown' && (
                                <div className="mt-2 text-xs text-muted-foreground">
                                  Name: {hospital.name}
                                </div>
                              )}
                            </div>
                            
                            {hospital.quality_score && (
                              <div className="text-center flex-shrink-0">
                                <div className={`text-2xl font-bold ${hospital.quality_score >= 0.7 ? 'text-green-600' : hospital.quality_score >= 0.5 ? 'text-yellow-600' : 'text-red-600'}`}>
                                  {hospital.quality_score}
                                </div>
                                <div className="text-xs text-muted-foreground whitespace-nowrap">Quality</div>
                              </div>
                            )}
                          </div>

                          <div className="pt-2 border-t space-y-1">
                            {hospital.contact?.phone || hospital.phone ? (
                              <div className="text-xs text-gray-600">
                                📞 {hospital.contact?.phone || hospital.phone}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground">No phone available</div>
                            )}
                            
                            {hospital.contact?.email || hospital.email ? (
                              <div className="text-xs text-gray-600 truncate">
                                ✉️ {hospital.contact?.email || hospital.email}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground">No email available</div>
                            )}
                          </div>

                          {hospital.services && hospital.services.length > 0 && (
                            <div className="pt-2 border-t">
                              <p className="text-xs font-medium mb-1 text-muted-foreground">Services ({hospital.services.length}):</p>
                              <div className="flex flex-wrap gap-1">
                                {hospital.services.slice(0, 3).map((service: any, idx: number) => (
                                  <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                    {service.category || service}
                                  </span>
                                ))}
                                {hospital.services.length > 3 && (
                                  <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                                    +{hospital.services.length - 3} more
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleViewDetails(hospital)}>
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
                                    checked={selectedHospitals.size === hospitals.length} 
                                    onCheckedChange={handleSelectAll} 
                                  />
                                </th>
                              )}
                              <th className="p-4 text-left font-semibold">Address</th>
                              <th className="p-4 text-left font-semibold">Classification</th>
                              <th className="p-4 text-left font-semibold">Quality Score</th>
                              <th className="p-4 text-left font-semibold">Contact</th>
                              <th className="p-4 text-left font-semibold">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {hospitals.map((hospital, index) => (
                              <tr key={hospital.id} className={`border-b hover:bg-muted/30 transition-colors ${index % 2 === 0 ? 'bg-background' : 'bg-muted/10'}`}>
                                {bulkActionMode && (
                                  <td className="p-4">
                                    <Checkbox 
                                      checked={selectedHospitals.has(hospital.id?.toString() || '')} 
                                      onCheckedChange={() => handleBulkSelect(hospital.id?.toString() || '')} 
                                    />
                                  </td>
                                )}
                                <td className="p-4 max-w-md">
                                  <div className="font-medium text-sm line-clamp-2">
                                    {hospital.address || 'Address not available'}
                                  </div>
                                  {hospital.name && hospital.name !== 'Unknown' && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      Name: {hospital.name}
                                    </div>
                                  )}
                                  <div className="text-xs text-blue-600 mt-1">
                                    ID: {hospital.id}
                                  </div>
                                </td>
                                <td className="p-4 text-sm">
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    hospital.classification === 'hospital' ? 'bg-blue-100 text-blue-700' :
                                    hospital.classification === 'pharmacy' ? 'bg-green-100 text-green-700' :
                                    hospital.classification === 'clinic' ? 'bg-purple-100 text-purple-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {hospital.classification || 'unknown'}
                                  </span>
                                </td>
                                <td className="p-4 text-sm text-center">
                                  {hospital.quality_score ? (
                                    <div className={`font-bold text-lg ${hospital.quality_score >= 0.7 ? 'text-green-600' : hospital.quality_score >= 0.5 ? 'text-yellow-600' : 'text-red-600'}`}>
                                      {hospital.quality_score}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">N/A</span>
                                  )}
                                </td>
                                <td className="p-4 text-sm">
                                  <div className="space-y-1">
                                    {hospital.contact?.phone || hospital.phone ? (
                                      <div className="text-xs">📞 {hospital.contact?.phone || hospital.phone}</div>
                                    ) : (
                                      <div className="text-xs text-muted-foreground">No phone</div>
                                    )}
                                    {hospital.contact?.email || hospital.email ? (
                                      <div className="text-xs truncate max-w-[150px]">✉️ {hospital.contact?.email || hospital.email}</div>
                                    ) : (
                                      <div className="text-xs text-muted-foreground">No email</div>
                                    )}
                                  </div>
                                </td>
                                <td className="p-4">
                                  <Button size="sm" variant="outline" onClick={() => handleViewDetails(hospital)}>
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
                        {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} hospitals
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
            <ProviderAnalytics providers={hospitals} type="hospital" />
          </TabsContent>
          
          <TabsContent value="map" className="space-y-4">
            <Card>
              <CardContent className="p-8 text-center">
                <MapPin className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-20" />
                <h3 className="text-lg font-semibold mb-2">Interactive Map Coming Soon</h3>
                <p className="text-muted-foreground">
                  View all hospitals on an interactive map with clustering and filtering capabilities.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {hospitals.filter(h => h.coordinates).length} hospitals have GPS coordinates ready for mapping.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle>Add New Hospital</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSingleHospitalSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label>Hospital Name *</Label>
                      <Input
                        required
                        value={newHospital.name}
                        onChange={(e) => setNewHospital({...newHospital, name: e.target.value})}
                        placeholder="Apollo Hospital"
                      />
                    </div>
                    <div>
                      <Label>Registration Number *</Label>
                      <Input
                        required
                        value={newHospital.registrationNumber}
                        onChange={(e) => setNewHospital({...newHospital, registrationNumber: e.target.value})}
                        placeholder="REG123456"
                      />
                    </div>
                    <div>
                      <Label>Email *</Label>
                      <Input
                        type="email"
                        required
                        value={newHospital.email}
                        onChange={(e) => setNewHospital({...newHospital, email: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Phone Number *</Label>
                      <Input
                        required
                        value={newHospital.phoneNumber}
                        onChange={(e) => setNewHospital({...newHospital, phoneNumber: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Hospital Type *</Label>
                      <Select value={newHospital.type} onValueChange={(val) => setNewHospital({...newHospital, type: val})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select hospital type" />
                        </SelectTrigger>
                        <SelectContent>
                          {hospitalTypes.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Website</Label>
                      <Input
                        value={newHospital.website || ''}
                        onChange={(e) => setNewHospital({...newHospital, website: e.target.value})}
                        placeholder="https://hospital.com"
                      />
                    </div>
                    <div>
                      <Label>Total Beds</Label>
                      <Input
                        type="number"
                        value={newHospital.totalBeds}
                        onChange={(e) => setNewHospital({...newHospital, totalBeds: parseInt(e.target.value) || 0})}
                      />
                    </div>
                    <div>
                      <Label>Available Beds</Label>
                      <Input
                        type="number"
                        value={newHospital.availableBeds}
                        onChange={(e) => setNewHospital({...newHospital, availableBeds: parseInt(e.target.value) || 0})}
                      />
                    </div>
                  </div>

                  {/* Address */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Address</Label>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <Label>Street Address</Label>
                        <Input
                          value={newHospital.address.street}
                          onChange={(e) => setNewHospital({...newHospital, address: {...newHospital.address, street: e.target.value}})}
                        />
                      </div>
                      <div>
                        <Label>City</Label>
                        <Input
                          value={newHospital.address.city}
                          onChange={(e) => setNewHospital({...newHospital, address: {...newHospital.address, city: e.target.value}})}
                        />
                      </div>
                      <div>
                        <Label>State</Label>
                        <Input
                          value={newHospital.address.state}
                          onChange={(e) => setNewHospital({...newHospital, address: {...newHospital.address, state: e.target.value}})}
                        />
                      </div>
                      <div>
                        <Label>Pincode</Label>
                        <Input
                          value={newHospital.address.pincode}
                          onChange={(e) => setNewHospital({...newHospital, address: {...newHospital.address, pincode: e.target.value}})}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Specialties */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Specialties</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {specialties.map((specialty) => (
                        <div key={specialty} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={newHospital.specialties.includes(specialty)}
                            onChange={() => handleSpecialtyToggle(specialty)}
                            className="rounded"
                          />
                          <span className="text-sm">{specialty}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Switches */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={newHospital.emergencyServices}
                        onCheckedChange={(checked) => setNewHospital({...newHospital, emergencyServices: checked})}
                      />
                      <Label>Emergency Services Available</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={newHospital.isActive}
                        onCheckedChange={(checked) => setNewHospital({...newHospital, isActive: checked})}
                      />
                      <Label>Active</Label>
                    </div>
                  </div>

                  <Button type="submit" disabled={loading} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    {loading ? 'Adding...' : 'Add Hospital'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bulk">
            <Card>
              <CardHeader>
                <CardTitle>Bulk Import Hospitals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Excel Upload Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="h-8 w-8 text-blue-600" />
                      <div>
                        <h3 className="font-semibold text-blue-900">Excel Template</h3>
                        <p className="text-sm text-blue-700">Download template, fill data, and upload</p>
                      </div>
                    </div>
                    <Button variant="outline" onClick={handleDownloadTemplate} className="border-blue-300">
                      <Download className="mr-2 h-4 w-4" />
                      Download Template
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="excel-upload" className="text-base font-semibold">Upload Excel File</Label>
                    <div className="flex items-center gap-4">
                      <Input
                        id="excel-upload"
                        type="file"
                        accept=".xlsx"
                        onChange={handleExcelUpload}
                        className="flex-1"
                      />
                      <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                        <Upload className="mr-2 h-4 w-4" />
                        Choose File
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Accepted format: .xlsx | Maximum: 1000 hospitals per upload
                    </p>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or paste JSON</span>
                  </div>
                </div>

                {/* JSON Input Section */}
                <div className="space-y-2">
                  <Label className="text-base font-semibold">JSON Import</Label>
                  <p className="text-sm text-muted-foreground">
                    Paste JSON array of hospital objects
                  </p>
                  <Textarea
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    placeholder='[{"name":"Apollo Hospital","registrationNumber":"REG001","email":"contact@apollo.com","phone":"+91-1234567890","type":"Multi Specialty Hospital","totalBeds":500,"availableBeds":100,"address":{"street":"123 Main St","city":"Mumbai","state":"Maharashtra","pincode":"400001"},"specialties":["Cardiology","Neurology"],"emergencyServices":true}]'
                    className="h-48 font-mono text-sm"
                  />
                  <Button onClick={handleJsonUpload} disabled={loading} variant="secondary" className="w-full">
                    <Upload className="mr-2 h-4 w-4" />
                    {loading ? 'Uploading...' : 'Upload JSON'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        {/* Provider Detail Modal */}
        <ProviderDetailModal
          provider={selectedHospital}
          open={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          type="hospital"
        />
      </div>
    </AdminLayout>
  );
};

export default HospitalsManagement;