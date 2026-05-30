import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Phone, Clock, Star, Navigation, Search, Filter, Building2, Hospital, CheckCircle } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [.25,.46,.45,.94] } } };

interface NetworkHospital {
  id: string;
  name: string;
  type: 'hospital' | 'clinic' | 'diagnostic_center' | 'pharmacy';
  address: string;
  city: string;
  state: string;
  distance: string;
  phone: string;
  rating: number;
  reviews: number;
  specialities: string[];
  facilities: string[];
  availability: 'open_24_7' | 'open_now' | 'closes_soon' | 'closed';
  insurance_accepted: boolean;
  cashless: boolean;
}

const NetworkHospitals: React.FC = () => {
  const { toast } = useToast();
  const [hospitals, setHospitals] = useState<NetworkHospital[]>([
    {
      id: '1',
      name: 'Apollo Hospital',
      type: 'hospital',
      address: 'Jubilee Hills, Road No. 72',
      city: 'Hyderabad',
      state: 'Telangana',
      distance: '2.5 km',
      phone: '+91 40 2360 7777',
      rating: 4.5,
      reviews: 1250,
      specialities: ['Cardiology', 'Neurology', 'Oncology', 'Orthopedics'],
      facilities: ['24x7 Emergency', 'ICU', 'Pharmacy', 'Blood Bank', 'Ambulance'],
      availability: 'open_24_7',
      insurance_accepted: true,
      cashless: true
    },
    {
      id: '2',
      name: 'CARE Hospitals',
      type: 'hospital',
      address: 'Banjara Hills, Road No. 1',
      city: 'Hyderabad',
      state: 'Telangana',
      distance: '3.8 km',
      phone: '+91 40 6165 6666',
      rating: 4.3,
      reviews: 980,
      specialities: ['Gastroenterology', 'Nephrology', 'Urology', 'Pulmonology'],
      facilities: ['Emergency', 'ICU', 'Laboratory', 'Radiology'],
      availability: 'open_24_7',
      insurance_accepted: true,
      cashless: true
    },
    {
      id: '3',
      name: 'Continental Hospitals',
      type: 'hospital',
      address: 'Gachibowli, IT Park Road',
      city: 'Hyderabad',
      state: 'Telangana',
      distance: '5.2 km',
      phone: '+91 40 6767 6767',
      rating: 4.6,
      reviews: 1560,
      specialities: ['Cardiac Surgery', 'Liver Transplant', 'Robotic Surgery'],
      facilities: ['24x7 Emergency', 'Advanced ICU', 'Cath Lab', 'Pharmacy'],
      availability: 'open_24_7',
      insurance_accepted: true,
      cashless: true
    },
    {
      id: '4',
      name: 'Dr. Rao\'s ENT Super Speciality Hospital',
      type: 'hospital',
      address: 'Somajiguda',
      city: 'Hyderabad',
      state: 'Telangana',
      distance: '4.1 km',
      phone: '+91 40 2322 2288',
      rating: 4.4,
      reviews: 650,
      specialities: ['ENT', 'Head & Neck Surgery', 'Cochlear Implant'],
      facilities: ['OPD', 'Surgery Theatre', 'Audiology'],
      availability: 'open_now',
      insurance_accepted: true,
      cashless: true
    },
    {
      id: '5',
      name: 'SRL Diagnostics',
      type: 'diagnostic_center',
      address: 'Punjagutta Main Road',
      city: 'Hyderabad',
      state: 'Telangana',
      distance: '1.8 km',
      phone: '+91 40 4444 5555',
      rating: 4.2,
      reviews: 450,
      specialities: ['Pathology', 'Radiology', 'CT Scan', 'MRI'],
      facilities: ['Home Collection', 'Digital Reports'],
      availability: 'open_now',
      insurance_accepted: true,
      cashless: false
    }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'distance' | 'rating'>('distance');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedHospitalDetails, setSelectedHospitalDetails] = useState<NetworkHospital | null>(null);

  const handleCallNow = (phone: string) => {
    const sanitized = (phone || "").replace(/[^\d+]/g, "");
    if (!sanitized) {
      toast({ title: "Phone number missing", variant: "destructive" });
      return;
    }
    window.location.href = `tel:${sanitized}`;
  };

  const handleDirections = (hospital: NetworkHospital) => {
    const query = encodeURIComponent(
      [hospital.name, hospital.address, hospital.city, hospital.state].filter(Boolean).join(", ")
    );
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank", "noopener,noreferrer");
  };

  const handleUseMyLocation = () => {
    if (!("geolocation" in navigator)) {
      toast({ title: "Location not supported", description: "Your browser does not support geolocation.", variant: "destructive" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        toast({
          title: "Location detected",
          description: `Lat ${pos.coords.latitude.toFixed(4)}, Lng ${pos.coords.longitude.toFixed(4)}`,
        });
      },
      (err) => {
        toast({
          title: "Location permission denied",
          description: err.message,
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const hospitalTypes = [
    { value: 'all', label: 'All', icon: Building2 },
    { value: 'hospital', label: 'Hospitals', icon: Hospital },
    { value: 'clinic', label: 'Clinics', icon: Building2 },
    { value: 'diagnostic_center', label: 'Diagnostic Centers', icon: Building2 },
    { value: 'pharmacy', label: 'Pharmacies', icon: Building2 }
  ];

  const cities = ['all', 'Hyderabad', 'Bangalore', 'Mumbai', 'Delhi', 'Chennai'];

  const getAvailabilityBadge = (availability: string) => {
    const variants: Record<string, { label: string; color: string }> = {
      open_24_7: { label: 'Open 24/7', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
      open_now: { label: 'Open Now', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
      closes_soon: { label: 'Closes Soon', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
      closed: { label: 'Closed', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' }
    };
    const variant = variants[availability];
    return <Badge className={variant.color}>{variant.label}</Badge>;
  };

  const filteredHospitals = hospitals
    .filter(hospital => selectedType === 'all' || hospital.type === selectedType)
    .filter(hospital => selectedCity === 'all' || hospital.city === selectedCity)
    .filter(hospital => 
      hospital.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      hospital.specialities.some(spec => spec.toLowerCase().includes(searchTerm.toLowerCase())) ||
      hospital.city.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'rating') return b.rating - a.rating;
      const parseDistance = (distance: string) => parseFloat((distance || '').replace(/[^\d.]/g, '')) || Number.MAX_SAFE_INTEGER;
      return parseDistance(a.distance) - parseDistance(b.distance);
    });

  return (
    <MainLayout>
    <motion.div initial="hidden" animate="show" variants={container} className="max-w-7xl mx-auto space-y-6 px-4 md:px-6 py-6">
      {/* Premium Header */}
      <motion.div variants={item} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 p-6 md:p-8 text-white shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-white/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-sm shadow-lg"><Hospital className="w-6 h-6" /></div>
              <Badge className="bg-white/15 text-white/90 border-white/20 font-medium">Healthcare Network</Badge>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-1">Network Hospitals</h1>
            <p className="text-blue-200 text-sm md:text-base">Find cashless and network hospitals near you</p>
          </div>
          <Button variant="outline" onClick={handleUseMyLocation} className="bg-white/10 border-white/20 text-white hover:bg-white/20" aria-label="Use my location">
            <Navigation className="mr-2 h-4 w-4" />
            Use My Location
          </Button>
        </div>
      </motion.div>

      {/* Search and Filters */}
      <motion.div variants={item} className="space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <Input
              placeholder="Search by name, speciality, or city..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 rounded-xl dark:bg-slate-800 dark:border-slate-700"
              aria-label="Search hospitals"
            />
          </div>
          <select
            className="flex h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500"
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            aria-label="Filter by city"
          >
            {cities.map(city => (
              <option key={city} value={city}>
                {city === 'all' ? 'All Cities' : city}
              </option>
            ))}
          </select>
          <select
            className="flex h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'distance' | 'rating')}
            aria-label="Sort hospitals"
          >
            <option value="distance">Nearest first</option>
            <option value="rating">Top rated first</option>
          </select>
        </div>

        {/* Type Filter */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {hospitalTypes.map(type => {
            const Icon = type.icon;
            return (
              <Button
                key={type.value}
                variant={selectedType === type.value ? 'default' : 'outline'}
                onClick={() => setSelectedType(type.value)}
                size="sm"
                className="rounded-full whitespace-nowrap transition-all duration-200"
              >
                <Icon className="mr-2 h-4 w-4" />
                {type.label}
              </Button>
            );
          })}
        </div>
      </motion.div>

      {(selectedType !== 'all' || selectedCity !== 'all' || searchTerm.trim() || sortBy !== 'distance') && (
        <motion.div variants={item} className="flex flex-wrap gap-2">
          {selectedType !== 'all' && <Badge variant="secondary">Type: {selectedType.replace('_', ' ')}</Badge>}
          {selectedCity !== 'all' && <Badge variant="secondary">City: {selectedCity}</Badge>}
          {searchTerm.trim() && <Badge variant="secondary">Search: {searchTerm}</Badge>}
          <Badge variant="outline">Sort: {sortBy === 'distance' ? 'Nearest' : 'Top rated'}</Badge>
          <Button size="sm" variant="ghost" onClick={() => { setSelectedType('all'); setSelectedCity('all'); setSearchTerm(''); setSortBy('distance'); }}>
            Reset filters
          </Button>
        </motion.div>
      )}

      {/* Stats */}
      <motion.div variants={item} className="grid md:grid-cols-4 gap-4">
        {[
          { label: 'Total Network', value: hospitals.length, sub: 'healthcare providers', gradient: 'from-blue-500 to-indigo-500' },
          { label: 'Cashless Enabled', value: hospitals.filter(h => h.cashless).length, sub: 'facilities', gradient: 'from-emerald-500 to-teal-500' },
          { label: 'Open Now', value: hospitals.filter(h => h.availability === 'open_now' || h.availability === 'open_24_7').length, sub: 'available', gradient: 'from-amber-500 to-orange-500' },
          { label: 'Cities Covered', value: cities.length - 1, sub: 'across India', gradient: 'from-purple-500 to-pink-500' },
        ].map((stat, idx) => (
          <motion.div key={stat.label} whileHover={{ scale: 1.03, y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
            <Card className="dark:bg-slate-800/50 dark:border-slate-700/60 border-slate-200/80 hover:shadow-xl transition-all duration-300">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">{stat.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-3xl font-bold bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent`}>{stat.value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{stat.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Hospitals List */}
      <motion.div variants={item} className="space-y-4">
        {filteredHospitals.length === 0 ? (
          <Card className="dark:bg-slate-800/50 dark:border-slate-700/60">
            <CardContent className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
                <Hospital className="h-8 w-8 text-slate-400" />
              </div>
              <p className="text-lg font-medium text-slate-700 dark:text-slate-300">No hospitals found</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Try adjusting your search or filters</p>
            </CardContent>
          </Card>
        ) : (
          filteredHospitals.map((hospital, idx) => (
            <motion.div key={hospital.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05, duration: 0.3 }}>
            <Card className="hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 dark:bg-slate-800/50 dark:border-slate-700/60 border-slate-200/80">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                        <Hospital className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-xl mb-1 dark:text-white">{hospital.name}</CardTitle>
                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mb-2">
                          <div className="flex items-center">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 mr-1" />
                            <span className="font-medium">{hospital.rating}</span>
                            <span className="ml-1">({hospital.reviews} reviews)</span>
                          </div>
                          <span>•</span>
                          <Badge variant="outline" className="capitalize">
                            {hospital.type.replace('_', ' ')}
                          </Badge>
                        </div>
                        <div className="flex items-start gap-1 text-sm text-slate-600 dark:text-slate-400 mb-2">
                          <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span>{hospital.address}, {hospital.city}, {hospital.state}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-1">
                            <Navigation className="h-4 w-4" />
                            <span>{hospital.distance}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Phone className="h-4 w-4" />
                            <span>{hospital.phone}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    {getAvailabilityBadge(hospital.availability)}
                    {hospital.cashless && (
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Cashless
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Specialities */}
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Specialities:</p>
                    <div className="flex flex-wrap gap-2">
                      {hospital.specialities.map((spec, index) => (
                        <Badge key={index} variant="secondary">
                          {spec}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Facilities */}
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Facilities:</p>
                    <div className="flex flex-wrap gap-2">
                      {hospital.facilities.map((facility, index) => (
                        <Badge key={index} variant="outline">
                          {facility}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button className="flex-1" onClick={() => handleCallNow(hospital.phone)} aria-label={`Call ${hospital.name}`}>
                      <Phone className="mr-2 h-4 w-4" />
                      Call Now
                    </Button>
                    <Button variant="outline" onClick={() => handleDirections(hospital)} aria-label={`Get directions to ${hospital.name}`}>
                      <Navigation className="mr-2 h-4 w-4" />
                      Directions
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedHospitalDetails(hospital);
                        setDetailsOpen(true);
                      }}
                      aria-label={`View details for ${hospital.name}`}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            </motion.div>
          ))
        )}
      </motion.div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-xl dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle>{selectedHospitalDetails?.name || "Hospital Details"}</DialogTitle>
          </DialogHeader>

          {selectedHospitalDetails && (
            <div className="space-y-4">
              <div className="text-sm text-slate-600 dark:text-slate-400">
                {selectedHospitalDetails.address}, {selectedHospitalDetails.city}, {selectedHospitalDetails.state}
              </div>

              <div className="flex flex-wrap gap-2">
                {getAvailabilityBadge(selectedHospitalDetails.availability)}
                {selectedHospitalDetails.insurance_accepted && (
                  <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Insurance Accepted</Badge>
                )}
                {selectedHospitalDetails.cashless && (
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Cashless
                  </Badge>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Specialities</div>
                <div className="flex flex-wrap gap-2">
                  {selectedHospitalDetails.specialities.map((spec) => (
                    <Badge key={spec} variant="secondary">{spec}</Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Facilities</div>
                <div className="flex flex-wrap gap-2">
                  {selectedHospitalDetails.facilities.map((facility) => (
                    <Badge key={facility} variant="outline">{facility}</Badge>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => handleCallNow(selectedHospitalDetails.phone)}>
                  <Phone className="mr-2 h-4 w-4" />
                  Call
                </Button>
                <Button className="flex-1" variant="outline" onClick={() => handleDirections(selectedHospitalDetails)}>
                  <Navigation className="mr-2 h-4 w-4" />
                  Directions
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
    </MainLayout>
  );
};

export default NetworkHospitals;
