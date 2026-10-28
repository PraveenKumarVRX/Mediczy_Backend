import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
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
import MainLayout from '@/components/layout/MainLayout';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineError } from '@/components/ui/inline-error';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [.25,.46,.45,.94] } } };

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
  const [fetchError, setFetchError] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedClinic, setSelectedClinic] = useState<ProviderClinic | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const LIMIT = 20;

  const fetchClinics = useCallback(async (currentPage = 1) => {
    setLoading(true);
    setFetchError(false);
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
      setFetchError(true);
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
    <>
    <motion.div initial="hidden" animate="show" variants={container} className="max-w-4xl mx-auto space-y-6 px-4 py-6">
      {/* Premium Header */}
      <motion.div variants={item} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-700 via-emerald-700 to-teal-800 p-6 md:p-8 text-white shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-white/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-sm shadow-lg"><Stethoscope className="w-6 h-6" /></div>
            <Badge className="bg-white/15 text-white/90 border-white/20 font-medium">Clinic Network</Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1">Find Clinics</h1>
          <p className="text-teal-200 text-sm md:text-base">
            Search from {total > 0 ? `${total} ` : ''}clinics across India — Clove Dental, Apollo Clinic, and more
          </p>
        </div>
      </motion.div>

      {/* Search Bar */}
      <motion.div variants={item} className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
          <Input
            placeholder="Search by name, city, pincode, or specialty..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-10 rounded-xl dark:bg-slate-800 dark:border-slate-700"
            aria-label="Search clinics"
          />
        </div>
        <Button onClick={handleSearch} disabled={loading} className="rounded-xl">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
        </Button>
      </motion.div>

      {/* Type Filter */}
      <motion.div variants={item} className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {CLINIC_TYPES.map((t) => (
          <Button
            key={t.value}
            variant={selectedType === t.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleTypeSelect(t.value)}
            className="rounded-full whitespace-nowrap transition-all duration-200"
          >
            {t.label}
          </Button>
        ))}
      </motion.div>

      {/* Results count */}
      {!loading && (
        <motion.p variants={item} className="text-sm text-slate-500 dark:text-slate-400">
          Showing {clinics.length} of {total} clinics
          {search && ` matching "${search}"`}
        </motion.p>
      )}

      {/* Clinic List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
          <span className="ml-3 text-slate-500 dark:text-slate-400">Loading clinics...</span>
        </div>
      ) : fetchError ? (
        <InlineError
          message="Couldn't load clinics."
          onRetry={() => fetchClinics(page)}
        />
      ) : clinics.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No clinics found"
          description="No in-network clinics match your search. Try a different area."
        />
      ) : (
        <motion.div variants={item} className="space-y-4">
          {clinics.map((clinic, idx) => (
            <motion.div key={clinic.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.04, duration: 0.3 }}>
            <Card className="hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 dark:bg-slate-800/50 dark:border-slate-700/60 border-slate-200/80">
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
            </motion.div>
          ))}
        </motion.div>
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
        <DialogContent className="max-w-lg dark:bg-slate-900">
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
    </motion.div>
    </>
  );
};

export default NetworkClinics;
