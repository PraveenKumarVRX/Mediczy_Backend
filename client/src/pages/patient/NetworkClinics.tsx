import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  MapPin, Phone, Search, Building2, Stethoscope,
  Navigation, ChevronLeft, ChevronRight, Loader2
} from 'lucide-react';

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

const NetworkClinics: React.FC = () => {
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
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to connect to server', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [search, selectedType, toast]);

  useEffect(() => {
    fetchClinics(1);
  }, [fetchClinics]);

  const handleSearch = () => {
    setSearch(searchInput.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleTypeSelect = (type: string) => {
    setSelectedType(type);
  };

  const handleCallNow = (phone: string) => {
    if (!phone) {
      toast({ title: 'No phone number', description: 'Phone number not available for this clinic.' });
      return;
    }
    window.location.href = `tel:${phone}`;
  };

  const handleDirections = (clinic: ProviderClinic) => {
    if (clinic.latitude && clinic.longitude) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${clinic.latitude},${clinic.longitude}`, '_blank');
    } else {
      const query = encodeURIComponent(`${clinic.name} ${clinic.address} ${clinic.city}`);
      window.open(`https://www.google.com/maps/search/${query}`, '_blank');
    }
  };

  const displayType = (clinic: ProviderClinic) =>
    clinic.specialty || clinic.type || 'Clinic';

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Find Clinics</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Search from {total > 0 ? `${total} ` : ''}clinics across India — Clove Dental, Apollo Clinic, and more
        </p>
      </div>

      {/* Search Bar */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
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
      </div>

      {/* Type Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
        {CLINIC_TYPES.map((t) => (
          <Button
            key={t.value}
            variant={selectedType === t.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleTypeSelect(t.value)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {/* Results count */}
      {!loading && (
        <p className="text-sm text-slate-500 mb-4">
          Showing {clinics.length} of {total} clinics
          {search && ` matching "${search}"`}
        </p>
      )}

      {/* Clinic List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
          <span className="ml-3 text-slate-500">Loading clinics...</span>
        </div>
      ) : clinics.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-gray-500">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No clinics found</p>
            <p className="text-sm mt-1">Try a different search term or clear the filter</p>
            {search && (
              <Button variant="outline" className="mt-4" onClick={() => { setSearchInput(''); setSearch(''); }}>
                Clear search
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {clinics.map((clinic) => (
            <Card key={clinic.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-teal-50 dark:bg-teal-900/30 rounded-lg mt-1 flex-shrink-0">
                    <Stethoscope className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base leading-snug">{clinic.name}</CardTitle>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {clinic.type && (
                        <Badge variant="outline" className="text-xs capitalize">
                          {clinic.type}
                        </Badge>
                      )}
                      {clinic.specialty && clinic.specialty !== clinic.type && (
                        <Badge variant="secondary" className="text-xs">
                          {clinic.specialty.length > 40 ? clinic.specialty.slice(0, 40) + '…' : clinic.specialty}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 mb-3">
                  <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-slate-400" />
                    <span>
                      {clinic.address && `${clinic.address}, `}
                      {clinic.city}
                      {clinic.state && clinic.state !== clinic.city && `, ${clinic.state}`}
                      {clinic.pincode && ` — ${clinic.pincode}`}
                    </span>
                  </div>
                  {clinic.phone && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <Phone className="h-4 w-4 flex-shrink-0 text-slate-400" />
                      <span>{clinic.phone}</span>
                    </div>
                  )}
                </div>

                {clinic.services && clinic.services.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {clinic.services.slice(0, 4).map((svc, i) => (
                      <Badge key={i} variant="outline" className="text-xs capitalize">
                        {svc}
                      </Badge>
                    ))}
                    {clinic.services.length > 4 && (
                      <Badge variant="outline" className="text-xs text-slate-400">
                        +{clinic.services.length - 4} more
                      </Badge>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  {clinic.phone && (
                    <Button size="sm" onClick={() => handleCallNow(clinic.phone)}>
                      <Phone className="mr-1 h-3 w-3" />
                      Call
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => handleDirections(clinic)}>
                    <Navigation className="mr-1 h-3 w-3" />
                    Directions
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setSelectedClinic(clinic); setDetailsOpen(true); }}
                  >
                    Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && !loading && (
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => fetchClinics(page - 1)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="text-sm text-slate-500">
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            disabled={page >= pages}
            onClick={() => fetchClinics(page + 1)}
          >
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
          </DialogHeader>
          {selectedClinic && (
            <div className="space-y-4 text-sm">
              <div className="flex gap-2 flex-wrap">
                {selectedClinic.type && (
                  <Badge variant="outline" className="capitalize">{selectedClinic.type}</Badge>
                )}
              </div>
              <div className="space-y-2 text-slate-600 dark:text-slate-400">
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
              {selectedClinic.specialty && (
                <div>
                  <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">Specialty</p>
                  <p className="text-slate-600 dark:text-slate-400">{selectedClinic.specialty}</p>
                </div>
              )}
              {selectedClinic.services && selectedClinic.services.length > 0 && (
                <div>
                  <p className="font-medium text-slate-700 dark:text-slate-300 mb-2">Services</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedClinic.services.map((svc, i) => (
                      <Badge key={i} variant="outline" className="capitalize">{svc}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                {selectedClinic.phone && (
                  <Button className="flex-1" onClick={() => handleCallNow(selectedClinic.phone)}>
                    <Phone className="mr-2 h-4 w-4" />
                    Call Now
                  </Button>
                )}
                <Button className="flex-1" variant="outline" onClick={() => handleDirections(selectedClinic)}>
                  <Navigation className="mr-2 h-4 w-4" />
                  Directions
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NetworkClinics;
