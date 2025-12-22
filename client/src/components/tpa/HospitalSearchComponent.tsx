import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Hospital, MapPin, Phone, Loader2, Search, Navigation } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import TPAProviderSelection from './TPAProviderSelection';

interface Hospital {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone?: string;
  type?: string;
  distance?: number;
}

const HospitalSearchComponent: React.FC = () => {
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const { toast } = useToast();

  const [searchParams, setSearchParams] = useState({
    state: '',
    city: '',
    pincode: '',
    hospitalName: ''
  });

  const handleSearch = async () => {
    if (!selectedProvider) {
      toast({
        title: 'Provider Required',
        description: 'Please select a TPA provider',
        variant: 'destructive'
      });
      return;
    }

    const hasParams = Object.values(searchParams).some(val => val !== '');
    if (!hasParams) {
      toast({
        title: 'Search Criteria Required',
        description: 'Please enter at least one search parameter',
        variant: 'destructive'
      });
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`/api/tpa/${selectedProvider}/hospitals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(searchParams)
      });

      if (!response.ok) throw new Error('Failed to search hospitals');

      const data = await response.json();
      setHospitals(data.hospitals || []);
      setTotalCount(data.total || data.hospitals?.length || 0);
      
      toast({
        title: 'Search Complete',
        description: `Found ${data.hospitals?.length || 0} network hospitals`,
      });
    } catch (error) {
      toast({
        title: 'Search Failed',
        description: 'Failed to search network hospitals',
        variant: 'destructive'
      });
      console.error('Error searching hospitals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGetDirections = (hospital: Hospital) => {
    const address = `${hospital.address}, ${hospital.city}, ${hospital.state} ${hospital.pincode}`;
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(mapsUrl, '_blank');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hospital className="h-5 w-5" />
            Search Network Hospitals
          </CardTitle>
          <CardDescription>
            Find network hospitals near you
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TPAProviderSelection
            multiSelect={false}
            onSelect={(providers) => setSelectedProvider(providers[0] || '')}
            selectedProviders={selectedProvider ? [selectedProvider] : []}
          />
        </CardContent>
      </Card>

      {selectedProvider && (
        <Card>
          <CardHeader>
            <CardTitle>Search Criteria</CardTitle>
            <CardDescription>
              Enter location or hospital details to search
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={searchParams.state}
                  onChange={(e) => setSearchParams(prev => ({ ...prev, state: e.target.value }))}
                  placeholder="Enter state"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={searchParams.city}
                  onChange={(e) => setSearchParams(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="Enter city"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pincode">Pincode</Label>
                <Input
                  id="pincode"
                  value={searchParams.pincode}
                  onChange={(e) => setSearchParams(prev => ({ ...prev, pincode: e.target.value }))}
                  placeholder="Enter pincode"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hospitalName">Hospital Name</Label>
                <Input
                  id="hospitalName"
                  value={searchParams.hospitalName}
                  onChange={(e) => setSearchParams(prev => ({ ...prev, hospitalName: e.target.value }))}
                  placeholder="Search by name"
                />
              </div>
            </div>

            <Button onClick={handleSearch} disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {!loading && <Search className="mr-2 h-4 w-4" />}
              Search Hospitals
            </Button>
          </CardContent>
        </Card>
      )}

      {hospitals.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Search Results</CardTitle>
              <Badge>{totalCount} Hospital{totalCount !== 1 && 's'} Found</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {hospitals.map((hospital, index) => (
                <Card key={hospital.id || index} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Hospital className="h-5 w-5 text-primary" />
                          <h4 className="font-semibold text-lg">{hospital.name}</h4>
                          {hospital.type && (
                            <Badge variant="outline">{hospital.type}</Badge>
                          )}
                        </div>

                        <div className="space-y-1 text-sm">
                          <div className="flex items-start gap-2 text-muted-foreground">
                            <MapPin className="h-4 w-4 mt-0.5" />
                            <div>
                              <p>{hospital.address}</p>
                              <p>{hospital.city}, {hospital.state} - {hospital.pincode}</p>
                            </div>
                          </div>

                          {hospital.phone && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Phone className="h-4 w-4" />
                              <a
                                href={`tel:${hospital.phone}`}
                                className="hover:text-primary hover:underline"
                              >
                                {hospital.phone}
                              </a>
                            </div>
                          )}

                          {hospital.distance && (
                            <div className="text-muted-foreground">
                              Distance: {hospital.distance} km
                            </div>
                          )}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGetDirections(hospital)}
                      >
                        <Navigation className="mr-2 h-4 w-4" />
                        Directions
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && hospitals.length === 0 && selectedProvider && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <Hospital className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Hospitals Found</h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your search criteria to find network hospitals
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default HospitalSearchComponent;
