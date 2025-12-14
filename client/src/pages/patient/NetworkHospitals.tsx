import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MapPin, Phone, Clock, Star, Navigation, Search, Filter, Building2, Hospital, CheckCircle } from 'lucide-react';

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
      open_24_7: { label: 'Open 24/7', color: 'bg-green-100 text-green-800' },
      open_now: { label: 'Open Now', color: 'bg-blue-100 text-blue-800' },
      closes_soon: { label: 'Closes Soon', color: 'bg-yellow-100 text-yellow-800' },
      closed: { label: 'Closed', color: 'bg-red-100 text-red-800' }
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
    );

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Network Hospitals</h1>
          <p className="text-gray-600 mt-1">Find cashless and network hospitals near you</p>
        </div>
        <Button variant="outline">
          <Navigation className="mr-2 h-4 w-4" />
          Use My Location
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4 mb-6">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name, speciality, or city..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
          >
            {cities.map(city => (
              <option key={city} value={city}>
                {city === 'all' ? 'All Cities' : city}
              </option>
            ))}
          </select>
        </div>

        {/* Type Filter */}
        <div className="flex gap-2 overflow-x-auto">
          {hospitalTypes.map(type => {
            const Icon = type.icon;
            return (
              <Button
                key={type.value}
                variant={selectedType === type.value ? 'default' : 'outline'}
                onClick={() => setSelectedType(type.value)}
                size="sm"
              >
                <Icon className="mr-2 h-4 w-4" />
                {type.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Network</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{hospitals.length}</p>
            <p className="text-xs text-gray-500 mt-1">healthcare providers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Cashless Enabled</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {hospitals.filter(h => h.cashless).length}
            </p>
            <p className="text-xs text-gray-500 mt-1">facilities</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Open Now</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {hospitals.filter(h => h.availability === 'open_now' || h.availability === 'open_24_7').length}
            </p>
            <p className="text-xs text-gray-500 mt-1">available</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Cities Covered</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{cities.length - 1}</p>
            <p className="text-xs text-gray-500 mt-1">across India</p>
          </CardContent>
        </Card>
      </div>

      {/* Hospitals List */}
      <div className="space-y-4">
        {filteredHospitals.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12 text-gray-500">
              <Hospital className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No hospitals found matching your criteria</p>
            </CardContent>
          </Card>
        ) : (
          filteredHospitals.map((hospital) => (
            <Card key={hospital.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Hospital className="h-6 w-6 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-xl mb-1">{hospital.name}</CardTitle>
                        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
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
                        <div className="flex items-start gap-1 text-sm text-gray-600 mb-2">
                          <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span>{hospital.address}, {hospital.city}, {hospital.state}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
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
                      <Badge className="bg-green-100 text-green-800">
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
                    <p className="text-sm font-medium text-gray-700 mb-2">Specialities:</p>
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
                    <p className="text-sm font-medium text-gray-700 mb-2">Facilities:</p>
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
                    <Button className="flex-1">
                      <Phone className="mr-2 h-4 w-4" />
                      Call Now
                    </Button>
                    <Button variant="outline">
                      <Navigation className="mr-2 h-4 w-4" />
                      Directions
                    </Button>
                    <Button variant="outline">View Details</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default NetworkHospitals;
