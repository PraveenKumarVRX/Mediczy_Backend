import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  FlaskConical, Search, Eye, Download, MapPin, CheckCircle2, AlertCircle,
  ChevronLeft, ChevronRight, BarChart3, Square, LayoutGrid, List, Plus,
  Upload, FileText, X,
} from 'lucide-react';
import axios from 'axios';
import { exportProviders } from '@/utils/exportToExcel';
import ProviderDetailModal from '@/components/providers/ProviderDetailModal';
import ProviderAnalytics from '@/components/providers/ProviderAnalytics';
import api from '@/utils/api';

// Get API base URL from environment
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Fix Leaflet default icon paths (broken in Webpack/Vite builds)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// ── Inline map component ──────────────────────────────────────────────
const LabsMapView = ({ labs }: { labs: any[] }) => {
  const mapRef = React.useRef<HTMLDivElement>(null);
  const mapInstanceRef = React.useRef<L.Map | null>(null);

  const labsWithCoords = labs.filter(l =>
    l.coordinates && l.coordinates.lat && l.coordinates.lng
  );

  React.useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current, { scrollWheelZoom: true });
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    const greenIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
    });

    if (labsWithCoords.length === 0) {
      map.setView([20.5937, 78.9629], 5);
      return;
    }

    const bounds: [number, number][] = [];
    labsWithCoords.forEach(lab => {
      const lat = parseFloat(lab.coordinates.lat);
      const lng = parseFloat(lab.coordinates.lng);
      if (isNaN(lat) || isNaN(lng)) return;
      bounds.push([lat, lng]);

      const popupHtml = `
        <div style="min-width:200px;max-width:280px">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px">${lab.name}</div>
          ${lab.formatted ? `<div style="font-size:12px;color:#555;margin-bottom:6px">${lab.formatted}</div>` :
            `<div style="font-size:12px;color:#555;margin-bottom:6px">${[lab.address, lab.city, lab.state, lab.pincode].filter(Boolean).join(', ')}</div>`}
          ${lab.phone ? `<div style="font-size:12px">📞 ${lab.phone}</div>` : ''}
          <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" 
             target="_blank" rel="noopener noreferrer"
             style="display:inline-block;margin-top:6px;font-size:11px;color:#2563eb">
            🗺 Open in Google Maps
          </a>
        </div>`;
      L.marker([lat, lng], { icon: greenIcon })
        .addTo(map)
        .bindPopup(popupHtml);
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 15);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [40, 40] });
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [labs]);

  return (
    <Card>
      <CardContent className="p-0 overflow-hidden rounded-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MapPin className="h-4 w-4 text-green-500" />
            {labsWithCoords.length} of {labs.length} labs have GPS coordinates
          </div>
          {labsWithCoords.length === 0 && (
            <span className="text-sm text-muted-foreground">Load labs from the List tab first</span>
          )}
        </div>
        <div ref={mapRef} style={{ height: '520px', width: '100%' }} />
      </CardContent>
    </Card>
  );
};
// ─────────────────────────────────────────────────────────────────────

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
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    id: '',
    name: '',
    email: '',
    phone: '',
    city: '',
    state: '',
    area: '',
    locality: '',
    pincode: '',
    type: '',
    website: '',
  });
  
  // Active tab
  const [activeTab, setActiveTab] = useState('list');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '', email: '', phone: '', type: '',
    street: '', city: '', state: '', area: '', locality: '', pincode: '', website: '',
  });

  // Bulk upload
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [bulkResult, setBulkResult] = useState<{ success: boolean; message: string; inserted?: number; skipped?: number; errors?: { lab: string; reason: string }[] } | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);

  const token = localStorage.getItem('adminToken');

  // Helper to format complete address
  const formatFullAddress = (lab: any) => {
    const parts = [
      lab.address,
      lab.area,
      lab.city,
      lab.state,
      lab.pincode
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Address not available';
  };

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
      
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await api.get(`/admin/labs`, { params, headers });
      
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
        api.get(`/masterdata/cities`),
        api.get(`/masterdata/states`),
      ]);
      
      if (citiesRes.data.success) setCities(citiesRes.data.data);
      if (statesRes.data.success) setStates(statesRes.data.data);
      
      if (selectedCity) {
        const areasRes = await api.get(`/masterdata/areas`, {
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

  const handleOpenEdit = (lab: any) => {
    setEditForm({
      id: lab.id || '',
      name: lab.name || '',
      email: lab.email || lab.contact?.email || '',
      phone: lab.phone || lab.mobile || lab.contact?.phone || '',
      city: lab.city || lab.basic_info?.city || '',
      state: lab.state || lab.basic_info?.state || '',
      area: lab.area || lab.basic_info?.area || '',
      locality: lab.locality || lab.basic_info?.locality || '',
      pincode: lab.pincode || lab.basic_info?.pincode || '',
      type: lab.sub_type || lab.classification || lab.type || '',
      website: lab.website || lab.metadata?.website || '',
    });
    setEditModalOpen(true);
  };

  const handleUpdateLab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.id) return;
    try {
      setLoading(true);
      setError(null);
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.patch(`${API_BASE_URL}/admin/labs/${editForm.id}/details`, { updates: editForm }, { headers });
      if (data?.success && data.data) {
        const updated = data.data;
        setLabs(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l));
        setResult({ message: data.message || 'Lab updated successfully' });
        setEditModalOpen(false);
      } else {
        setError(data?.message || 'Failed to update lab');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update lab');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name) return;
    try {
      setCreating(true);
      setError(null);
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.post(`${API_BASE_URL}/admin/labs`, {
        lab: {
          name: createForm.name,
          email: createForm.email,
          phoneNumber: createForm.phone,
          type: createForm.type || 'diagnostic_lab',
          website: createForm.website,
          address: {
            street: createForm.street,
            city: createForm.city,
            state: createForm.state,
            area: createForm.area,
            locality: createForm.locality,
            pincode: createForm.pincode,
          },
        },
      }, { headers });
      if (data?.success) {
        setResult({ message: 'Lab created successfully' });
        setShowCreateModal(false);
        setCreateForm({ name: '', email: '', phone: '', type: '', street: '', city: '', state: '', area: '', locality: '', pincode: '', website: '' });
        fetchLabs();
      } else {
        setError(data?.message || 'Failed to create lab');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create lab');
    } finally {
      setCreating(false);
    }
  };

  // ── Bulk upload helpers ──────────────────────────────────────
  const parseCSV = (text: string): any[] => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const parseRow = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
        else current += char;
      }
      result.push(current.trim());
      return result;
    };
    const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ''));
    return lines.slice(1).filter(l => l.trim()).map(line => {
      const values = parseRow(line);
      const row: any = {};
      headers.forEach((h, i) => { row[h] = values[i] || ''; });
      return row;
    });
  };

  const downloadTemplate = () => {
    const csv = [
      'name,email,phone,type,street,city,state,area,locality,pincode,website',
      'City Diagnostics,lab@example.com,9999999999,diagnostic_lab,123 Main Street,Mumbai,Maharashtra,Andheri,Versova,400058,https://example.com',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'labs_bulk_upload_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setParsedRows(parseCSV(text));
      setBulkResult(null);
    };
    reader.readAsText(file);
  };

  const handleBulkUpload = async () => {
    if (!parsedRows.length) return;
    try {
      setBulkUploading(true);
      setBulkResult(null);
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.post(`${API_BASE_URL}/admin/masters/labs`, { labs: parsedRows }, { headers });
      setBulkResult(data);
      if (data.inserted > 0) fetchLabs();
    } catch (err: any) {
      setBulkResult({ success: false, message: err?.response?.data?.message || 'Upload failed' });
    } finally {
      setBulkUploading(false);
    }
  };
  // ────────────────────────────────────────────────────────────

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
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add New Lab
          </Button>
          <Button variant="outline" onClick={() => { setShowBulkModal(true); setParsedRows([]); setBulkResult(null); }}>
            <Upload className="h-4 w-4 mr-2" />
            Bulk Upload
          </Button>
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
                              <div className="flex items-start gap-2 mt-2 text-sm text-muted-foreground">
                                <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                <p className="line-clamp-2">{formatFullAddress(lab)}</p>
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
                            <Button size="sm" variant="secondary" onClick={() => handleOpenEdit(lab)}>
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
                                  <div className="text-xs text-blue-600 mt-1">ID: {lab.id}</div>
                                </td>
                                <td className="p-4 text-sm max-w-md">
                                  <div className="flex items-start gap-1">
                                    <MapPin className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                                    <span className="line-clamp-2">{formatFullAddress(lab)}</span>
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
                                  <Button size="sm" variant="secondary" className="ml-2" onClick={() => handleOpenEdit(lab)}>
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
            <LabsMapView labs={labs} />
          </TabsContent>
        </Tabs>
        
        {/* Provider Detail Modal */}
        <ProviderDetailModal
          provider={selectedLab}
          open={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          type="lab"
        />
        {/* Create Lab Dialog */}
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Lab</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateLab} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <Label>Lab Name <span className="text-red-500">*</span></Label>
                  <Input placeholder="e.g. City Diagnostics" value={createForm.name} onChange={(e) => setCreateForm({...createForm, name: e.target.value})} required />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" placeholder="lab@example.com" value={createForm.email} onChange={(e) => setCreateForm({...createForm, email: e.target.value})} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input placeholder="+91 9999999999" value={createForm.phone} onChange={(e) => setCreateForm({...createForm, phone: e.target.value})} />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={createForm.type || 'diagnostic_lab'} onValueChange={(v) => setCreateForm({...createForm, type: v})}>
                    <SelectTrigger><SelectValue placeholder="Lab type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diagnostic_lab">Diagnostic Lab</SelectItem>
                      <SelectItem value="pathology">Pathology</SelectItem>
                      <SelectItem value="radiology">Radiology</SelectItem>
                      <SelectItem value="clinical_lab">Clinical Lab</SelectItem>
                      <SelectItem value="collection_center">Collection Centre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Website</Label>
                  <Input placeholder="https://" value={createForm.website} onChange={(e) => setCreateForm({...createForm, website: e.target.value})} />
                </div>
                <div className="md:col-span-2">
                  <Label>Street Address</Label>
                  <Input placeholder="Street / Building" value={createForm.street} onChange={(e) => setCreateForm({...createForm, street: e.target.value})} />
                </div>
                <div>
                  <Label>City</Label>
                  <Input placeholder="City" value={createForm.city} onChange={(e) => setCreateForm({...createForm, city: e.target.value})} />
                </div>
                <div>
                  <Label>State</Label>
                  <Input placeholder="State" value={createForm.state} onChange={(e) => setCreateForm({...createForm, state: e.target.value})} />
                </div>
                <div>
                  <Label>Area</Label>
                  <Input placeholder="Area" value={createForm.area} onChange={(e) => setCreateForm({...createForm, area: e.target.value})} />
                </div>
                <div>
                  <Label>Locality</Label>
                  <Input placeholder="Locality" value={createForm.locality} onChange={(e) => setCreateForm({...createForm, locality: e.target.value})} />
                </div>
                <div>
                  <Label>Pincode</Label>
                  <Input placeholder="400001" value={createForm.pincode} onChange={(e) => setCreateForm({...createForm, pincode: e.target.value})} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setShowCreateModal(false)}>Cancel</Button>
                <Button type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create Lab'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Bulk Upload Dialog */}
        <Dialog open={showBulkModal} onOpenChange={(open) => { setShowBulkModal(open); if (!open) { setParsedRows([]); setBulkResult(null); } }}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Bulk Upload Labs
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Step 1: Download template */}
              <div className="rounded-lg border p-4 bg-muted/30">
                <p className="text-sm font-medium mb-2">Step 1 — Download the CSV template</p>
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <FileText className="h-4 w-4 mr-2" />
                  Download Template CSV
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Required columns: <code>name</code>. Optional: email, phone, type, street, city, state, area, locality, pincode, website.
                </p>
              </div>

              {/* Step 2: Choose file */}
              <div className="rounded-lg border p-4 bg-muted/30">
                <p className="text-sm font-medium mb-2">Step 2 — Select your CSV file</p>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleBulkFileChange}
                  className="block text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:cursor-pointer"
                />
              </div>

              {/* Preview */}
              {parsedRows.length > 0 && !bulkResult && (
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium mb-2">Preview — {parsedRows.length} rows parsed</p>
                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-muted">
                          {Object.keys(parsedRows[0]).map(h => (
                            <th key={h} className="p-2 text-left font-semibold border">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsedRows.slice(0, 10).map((row, i) => (
                          <tr key={i} className="border-b hover:bg-muted/30">
                            {Object.values(row).map((v: any, j) => (
                              <td key={j} className="p-2 border truncate max-w-[120px]">{v}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsedRows.length > 10 && (
                      <p className="text-xs text-muted-foreground mt-1">...and {parsedRows.length - 10} more rows</p>
                    )}
                  </div>
                </div>
              )}

              {/* Result */}
              {bulkResult && (
                <div className={`rounded-lg border p-4 ${bulkResult.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                  <div className="flex items-center gap-2 font-medium mb-1">
                    {bulkResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    {bulkResult.message}
                  </div>
                  {bulkResult.success && (
                    <div className="text-sm mt-2 space-y-1">
                      <p>✓ Inserted: <strong>{bulkResult.inserted}</strong></p>
                      <p>⊘ Skipped: <strong>{bulkResult.skipped}</strong></p>
                      {bulkResult.errors && bulkResult.errors.length > 0 && (
                        <div className="mt-2">
                          <p className="font-medium">Skipped details:</p>
                          <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                            {bulkResult.errors.map((e, i) => (
                              <li key={i} className="text-xs">• <strong>{e.lab}</strong>: {e.reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setShowBulkModal(false); setParsedRows([]); setBulkResult(null); }}>
                <X className="h-4 w-4 mr-2" />
                Close
              </Button>
              {parsedRows.length > 0 && !bulkResult && (
                <Button onClick={handleBulkUpload} disabled={bulkUploading}>
                  <Upload className="h-4 w-4 mr-2" />
                  {bulkUploading ? `Uploading ${parsedRows.length} labs...` : `Upload ${parsedRows.length} Labs`}
                </Button>
              )}
              {bulkResult?.success && bulkResult.inserted && bulkResult.inserted > 0 && (
                <Button variant="outline" onClick={() => { setParsedRows([]); setBulkResult(null); }}>
                  Upload Another File
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Lab Dialog */}
        <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Lab</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateLab} className="space-y-4">
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
                  <Label>City</Label>
                  <Input value={editForm.city} onChange={(e) => setEditForm({...editForm, city: e.target.value})} />
                </div>
                <div>
                  <Label>State</Label>
                  <Input value={editForm.state} onChange={(e) => setEditForm({...editForm, state: e.target.value})} />
                </div>
                <div>
                  <Label>Area</Label>
                  <Input value={editForm.area} onChange={(e) => setEditForm({...editForm, area: e.target.value})} />
                </div>
                <div>
                  <Label>Locality</Label>
                  <Input value={editForm.locality} onChange={(e) => setEditForm({...editForm, locality: e.target.value})} />
                </div>
                <div>
                  <Label>Pincode</Label>
                  <Input value={editForm.pincode} onChange={(e) => setEditForm({...editForm, pincode: e.target.value})} />
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

export default LabsManagement;
