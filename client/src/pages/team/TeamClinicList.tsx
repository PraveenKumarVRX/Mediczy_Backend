import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  MapPin, Phone, Search, Stethoscope,
  Navigation, ChevronLeft, ChevronRight, Loader2, Building2, ExternalLink
} from 'lucide-react';
import { Link } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface ProviderClinic {
  id: number;
  name: string;
  type: string;
  specialty: string;
  city: string;
  state: string;
  address: string;
  pincode: string;
  phone: string;
  email: string;
  services: string[];
  latitude: string | null;
  longitude: string | null;
}

const CLINIC_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'polyclinic', label: 'Polyclinic' },
  { value: 'dental', label: 'Dental' },
  { value: 'diagnostic', label: 'Diagnostic' },
  { value: 'eye', label: 'Eye Care' },
  { value: 'skin', label: 'Skin & Dermatology' },
  { value: 'pediatric', label: 'Pediatric' },
];

const TeamClinicList: React.FC = () => {
  const { toast } = useToast();
  const [clinics, setClinics] = useState<ProviderClinic[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedClinic, setSelectedClinic] = useState<ProviderClinic | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const LIMIT = 20;

  const fetchClinics = useCallback(async (currentPage = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        page: String(currentPage),
      });
      if (search) params.set('search', search);
      if (selectedType) params.set('type', selectedType);

      const res = await fetch(`${API_BASE}/patient/provider-clinics?${params}`);
      const data = await res.json();

      if (data.success) {
        setClinics(data.clinics);
        setTotal(data.total);
        setPages(data.pages || 1);
        setPage(currentPage);
      } else {
        toast({ title: 'Error', description: data.message || 'Failed to load clinics', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to connect to server', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [search, selectedType, toast]);

  useEffect(() => {
    fetchClinics(1);
  }, [fetchClinics]);

  const handleSearch = () => setSearch(searchInput.trim());
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };

  const handleDirections = (clinic: ProviderClinic) => {
    if (clinic.latitude && clinic.longitude) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${clinic.latitude},${clinic.longitude}`, '_blank');
    } else {
      const query = encodeURIComponent(`${clinic.name} ${clinic.address} ${clinic.city}`);
      window.open(`https://www.google.com/maps/search/${query}`, '_blank');
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Clinic Network</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {total > 0 ? `${total} clinics` : 'Loading...'} — Clove Dental, Apollo Clinic, and more
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/team/corporate-management">
            <Building2 className="h-4 w-4 mr-2" />
            Assign to Corporate Network
            <ExternalLink className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">Total Clinics</CardDescription>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <p className="text-2xl font-bold">{total || '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">Dental Clinics</CardDescription>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <p className="text-2xl font-bold text-blue-600">Clove+</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">Polyclinics</CardDescription>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <p className="text-2xl font-bold text-teal-600">Apollo+</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">Cities Covered</CardDescription>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <p className="text-2xl font-bold">Pan-India</p>
          </CardContent>
        </Card>
      </div>

      {/* Search + Filter */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-2 mb-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, city, pincode, or specialty..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
            {(search || selectedType) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setSearchInput(''); setSelectedType(''); }}>
                Clear
              </Button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {CLINIC_TYPES.map((t) => (
              <Button
                key={t.value}
                variant={selectedType === t.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedType(t.value)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {!loading && (
        <p className="text-sm text-slate-500">
          Showing {clinics.length} of {total} clinics
          {search && ` matching "${search}"`}
          {selectedType && ` — type: ${selectedType}`}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
          <span className="ml-3 text-slate-500">Loading clinics...</span>
        </div>
      ) : clinics.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <Building2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="font-medium text-slate-700 dark:text-slate-300">No clinics found</p>
            <p className="text-sm text-muted-foreground mt-1">Try a different search term or clear the filter</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {clinics.map((clinic) => (
            <Card key={clinic.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setSelectedClinic(clinic); setDetailsOpen(true); }}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-teal-50 dark:bg-teal-900/30 rounded-lg flex-shrink-0 mt-0.5">
                    <Stethoscope className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm leading-tight">{clinic.name}</p>
                      {clinic.type && (
                        <Badge variant="outline" className="text-xs capitalize flex-shrink-0">
                          {clinic.type}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-start gap-1.5 mt-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span className="truncate">
                        {clinic.address ? `${clinic.address}, ` : ''}{clinic.city}
                        {clinic.pincode ? ` — ${clinic.pincode}` : ''}
                      </span>
                    </div>
                    {clinic.specialty && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{clinic.specialty.slice(0, 60)}</p>
                    )}
                    <div className="flex gap-1.5 mt-2">
                      {clinic.services?.slice(0, 3).map((svc, i) => (
                        <Badge key={i} variant="secondary" className="text-xs capitalize">{svc}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && !loading && (
        <div className="flex items-center justify-between mt-4">
          <Button variant="outline" disabled={page <= 1} onClick={() => fetchClinics(page - 1)}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
          <Button variant="outline" disabled={page >= pages} onClick={() => fetchClinics(page + 1)}>
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedClinic?.name}</DialogTitle>
            <DialogDescription className="sr-only">Clinic details</DialogDescription>
          </DialogHeader>
          {selectedClinic && (
            <div className="space-y-4 text-sm">
              <div className="flex gap-2 flex-wrap">
                {selectedClinic.type && <Badge variant="outline" className="capitalize">{selectedClinic.type}</Badge>}
                {selectedClinic.specialty && selectedClinic.specialty !== selectedClinic.type && (
                  <Badge variant="secondary">{selectedClinic.specialty.slice(0, 50)}</Badge>
                )}
              </div>
              <div className="space-y-2 text-muted-foreground">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    {selectedClinic.address && `${selectedClinic.address}, `}
                    {selectedClinic.city}
                    {selectedClinic.state && `, ${selectedClinic.state}`}
                    {selectedClinic.pincode && ` ${selectedClinic.pincode}`}
                  </span>
                </div>
                {selectedClinic.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 flex-shrink-0" />
                    <span>{selectedClinic.phone}</span>
                  </div>
                )}
              </div>
              {selectedClinic.services && selectedClinic.services.length > 0 && (
                <div>
                  <p className="font-medium text-slate-700 dark:text-slate-300 mb-2">Services</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedClinic.services.map((svc, i) => (
                      <Badge key={i} variant="outline" className="capitalize">{svc}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                {selectedClinic.phone && (
                  <Button className="flex-1" onClick={() => { window.location.href = `tel:${selectedClinic.phone}`; }}>
                    <Phone className="mr-2 h-4 w-4" />
                    Call
                  </Button>
                )}
                <Button className="flex-1" variant="outline" onClick={() => handleDirections(selectedClinic)}>
                  <Navigation className="mr-2 h-4 w-4" />
                  Directions
                </Button>
                <Button asChild variant="outline">
                  <Link to="/team/corporate-management" onClick={() => setDetailsOpen(false)}>
                    Add to Network
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamClinicList;
