import { useState, useRef, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Download, Plus, Truck, Users, MapPin, Clock, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface AmbulanceService {
  id?: number;
  name: string;
  licenseNumber: string;
  email: string;
  phoneNumber: string;
  emergencyNumber: string;
  address: {
    street: string;
    city: string;
    state: string;
    pincode: string;
  };
  serviceAreas: string[];
  ambulanceTypes: string[];
  fleet: {
    basic: number;
    advanced: number;
    icu: number;
    neonatal: number;
    total: number;
  };
  availability: {
    [key: string]: { available: boolean; responseTime: string };
  };
  isActive: boolean;
  is24x7: boolean;
  priceRange: { min: number; max: number };
  rating: number;
  website?: string;
  certifications: string[];
}

const ambulanceTypes = [
  'Basic Life Support (BLS)', 'Advanced Life Support (ALS)', 'ICU Ambulance',
  'Neonatal ICU', 'Cardiac Ambulance', 'Mortuary Ambulance', 'Air Ambulance',
  'Patient Transport Vehicle', 'Mobile ICU', 'Emergency Response Unit'
];

const certifications = [
  'State Transport License', 'Medical Equipment Certification', 'Driver Certification',
  'Paramedic License', 'Emergency Medical Services', 'ISO 9001:2015',
  'NABH Accreditation', 'Fire Safety Certificate', 'GPS Tracking System'
];

const defaultAvailability = {
  monday: { available: true, responseTime: '10-15 minutes' },
  tuesday: { available: true, responseTime: '10-15 minutes' },
  wednesday: { available: true, responseTime: '10-15 minutes' },
  thursday: { available: true, responseTime: '10-15 minutes' },
  friday: { available: true, responseTime: '10-15 minutes' },
  saturday: { available: true, responseTime: '10-15 minutes' },
  sunday: { available: true, responseTime: '15-20 minutes' },
};

const AmbulanceManagement = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [services, setServices] = useState<AmbulanceService[]>([]);
  const [jsonInput, setJsonInput] = useState('');
  const token = localStorage.getItem('adminToken');

  const [newService, setNewService] = useState<AmbulanceService>({
    name: '',
    licenseNumber: '',
    email: '',
    phoneNumber: '',
    emergencyNumber: '',
    address: { street: '', city: '', state: '', pincode: '' },
    serviceAreas: [],
    ambulanceTypes: [],
    fleet: { basic: 0, advanced: 0, icu: 0, neonatal: 0, total: 0 },
    availability: defaultAvailability,
    isActive: true,
    is24x7: true,
    priceRange: { min: 1000, max: 5000 },
    rating: 0,
    certifications: []
  });

  useEffect(() => {
    fetchServices();
  }, []);

  useEffect(() => {
    // Update total fleet count when individual counts change
    const { basic, advanced, icu, neonatal } = newService.fleet;
    const total = basic + advanced + icu + neonatal;
    if (total !== newService.fleet.total) {
      setNewService(prev => ({
        ...prev,
        fleet: { ...prev.fleet, total }
      }));
    }
  }, [newService.fleet.basic, newService.fleet.advanced, newService.fleet.icu, newService.fleet.neonatal]);

  const fetchServices = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get('http://192.168.1.72:8000/api/admin/ambulance', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setServices(data.services || []);
    } catch (err: any) {
      console.error('Failed to fetch ambulance services:', err);
      setServices([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSingleServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const { data } = await axios.post('http://192.168.1.72:8000/api/admin/ambulance',
        { service: newService },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setResult(data);
      setNewService({
        name: '',
        licenseNumber: '',
        email: '',
        phoneNumber: '',
        emergencyNumber: '',
        address: { street: '', city: '', state: '', pincode: '' },
        serviceAreas: [],
        ambulanceTypes: [],
        fleet: { basic: 0, advanced: 0, icu: 0, neonatal: 0, total: 0 },
        availability: defaultAvailability,
        isActive: true,
        is24x7: true,
        priceRange: { min: 1000, max: 5000 },
        rating: 0,
        certifications: []
      });
      fetchServices();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create ambulance service');
    } finally {
      setLoading(false);
    }
  };

  const handleJsonUpload = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const services = JSON.parse(jsonInput);
      const { data } = await axios.post('http://192.168.1.72:8000/api/admin/ambulance/bulk',
        { services: Array.isArray(services) ? services : [services] },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setResult(data);
      setJsonInput('');
      fetchServices();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'JSON upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleTypeToggle = (type: string) => {
    setNewService(prev => ({
      ...prev,
      ambulanceTypes: prev.ambulanceTypes.includes(type)
        ? prev.ambulanceTypes.filter(t => t !== type)
        : [...prev.ambulanceTypes, type]
    }));
  };

  const handleCertificationToggle = (cert: string) => {
    setNewService(prev => ({
      ...prev,
      certifications: prev.certifications.includes(cert)
        ? prev.certifications.filter(c => c !== cert)
        : [...prev.certifications, cert]
    }));
  };

  const handleServiceAreaChange = (areas: string) => {
    setNewService(prev => ({
      ...prev,
      serviceAreas: areas.split(',').map(area => area.trim()).filter(area => area)
    }));
  };

  const updateAvailability = (day: string, field: string, value: string | boolean) => {
    setNewService(prev => ({
      ...prev,
      availability: {
        ...prev.availability,
        [day]: {
          ...prev.availability[day],
          [field]: value
        }
      }
    }));
  };

  const updateFleet = (type: string, value: number) => {
    setNewService(prev => ({
      ...prev,
      fleet: {
        ...prev.fleet,
        [type]: value
      }
    }));
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <Truck className="h-8 w-8" />
              Emergency Ambulance Services
            </h2>
            <p className="text-muted-foreground">Manage ambulance fleet and emergency response services</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              Total: {services.length} services
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Services</p>
                  <p className="text-3xl font-bold">{services.length}</p>
                </div>
                <Truck className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">24x7 Services</p>
                  <p className="text-3xl font-bold">{services.filter(s => s.is24x7).length}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Fleet</p>
                  <p className="text-3xl font-bold">{services.reduce((sum, s) => sum + s.fleet.total, 0)}</p>
                </div>
                <Truck className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">ICU Ambulances</p>
                  <p className="text-3xl font-bold">{services.reduce((sum, s) => sum + s.fleet.icu, 0)}</p>
                </div>
                <Users className="h-8 w-8 text-amber-500" />
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

        <Tabs defaultValue="list" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="list">Service List</TabsTrigger>
            <TabsTrigger value="create">Add Service</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Import</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            {loading ? (
              <div className="text-center py-8">Loading ambulance services...</div>
            ) : services.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No ambulance services found. Add your first service to get started.</p>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {services.map((service) => (
                  <Card key={service.id}>
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-lg font-semibold">{service.name}</h3>
                            <p className="text-sm text-muted-foreground">License: {service.licenseNumber}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-sm">Rating: {service.rating}/5</span>
                              {service.is24x7 && (
                                <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">24x7</span>
                              )}
                            </div>
                          </div>
                          <div className={`px-2 py-1 rounded-full text-xs ${service.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                            {service.isActive ? 'Active' : 'Inactive'}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium">Total Fleet:</span> {service.fleet.total}
                          </div>
                          <div>
                            <span className="font-medium">ICU Units:</span> {service.fleet.icu}
                          </div>
                          <div>
                            <span className="font-medium">Emergency:</span> {service.emergencyNumber}
                          </div>
                          <div>
                            <span className="font-medium">Price:</span> ₹{service.priceRange.min}-{service.priceRange.max}
                          </div>
                        </div>

                        <div>
                          <p className="text-sm font-medium mb-2">Contact:</p>
                          <p className="text-sm">{service.email}</p>
                          <p className="text-sm">{service.phoneNumber}</p>
                        </div>

                        <div>
                          <p className="text-sm font-medium mb-2">Fleet Breakdown:</p>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>Basic: {service.fleet.basic}</div>
                            <div>Advanced: {service.fleet.advanced}</div>
                            <div>ICU: {service.fleet.icu}</div>
                            <div>Neonatal: {service.fleet.neonatal}</div>
                          </div>
                        </div>

                        <div>
                          <p className="text-sm font-medium mb-2">Service Areas:</p>
                          <div className="flex flex-wrap gap-1">
                            {service.serviceAreas.slice(0, 3).map((area, index) => (
                              <span key={index} className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                                {area}
                              </span>
                            ))}
                            {service.serviceAreas.length > 3 && (
                              <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                                +{service.serviceAreas.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          <p className="text-sm font-medium mb-2">Ambulance Types:</p>
                          <div className="flex flex-wrap gap-1">
                            {service.ambulanceTypes.slice(0, 2).map((type) => (
                              <span key={type} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                {type}
                              </span>
                            ))}
                            {service.ambulanceTypes.length > 2 && (
                              <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                                +{service.ambulanceTypes.length - 2} more
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          <p className="text-sm font-medium mb-2">Response Time Today:</p>
                          <div className="text-sm">
                            {(() => {
                              const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
                              const todayAvailability = service.availability[today];
                              return todayAvailability?.available ? 
                                todayAvailability.responseTime : 
                                'Not Available';
                            })()}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle>Add New Ambulance Service</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSingleServiceSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label>Service Name *</Label>
                      <Input
                        required
                        value={newService.name}
                        onChange={(e) => setNewService({...newService, name: e.target.value})}
                        placeholder="Emergency Medical Services"
                      />
                    </div>
                    <div>
                      <Label>License Number *</Label>
                      <Input
                        required
                        value={newService.licenseNumber}
                        onChange={(e) => setNewService({...newService, licenseNumber: e.target.value})}
                        placeholder="AMB123456"
                      />
                    </div>
                    <div>
                      <Label>Email *</Label>
                      <Input
                        type="email"
                        required
                        value={newService.email}
                        onChange={(e) => setNewService({...newService, email: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Phone Number *</Label>
                      <Input
                        required
                        value={newService.phoneNumber}
                        onChange={(e) => setNewService({...newService, phoneNumber: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Emergency Number *</Label>
                      <Input
                        required
                        value={newService.emergencyNumber}
                        onChange={(e) => setNewService({...newService, emergencyNumber: e.target.value})}
                        placeholder="108 / 1298"
                      />
                    </div>
                    <div>
                      <Label>Website</Label>
                      <Input
                        value={newService.website || ''}
                        onChange={(e) => setNewService({...newService, website: e.target.value})}
                        placeholder="https://ambulance.com"
                      />
                    </div>
                    <div>
                      <Label>Rating (0-5)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="5"
                        step="0.1"
                        value={newService.rating}
                        onChange={(e) => setNewService({...newService, rating: parseFloat(e.target.value) || 0})}
                      />
                    </div>
                  </div>

                  {/* Price Range */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label>Min Price (₹/km)</Label>
                      <Input
                        type="number"
                        value={newService.priceRange.min}
                        onChange={(e) => setNewService({
                          ...newService, 
                          priceRange: { ...newService.priceRange, min: parseInt(e.target.value) || 0 }
                        })}
                      />
                    </div>
                    <div>
                      <Label>Max Price (₹/km)</Label>
                      <Input
                        type="number"
                        value={newService.priceRange.max}
                        onChange={(e) => setNewService({
                          ...newService, 
                          priceRange: { ...newService.priceRange, max: parseInt(e.target.value) || 0 }
                        })}
                      />
                    </div>
                  </div>

                  {/* Fleet Management */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Fleet Management</Label>
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <Label>Basic Ambulances</Label>
                        <Input
                          type="number"
                          min="0"
                          value={newService.fleet.basic}
                          onChange={(e) => updateFleet('basic', parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <Label>Advanced Life Support</Label>
                        <Input
                          type="number"
                          min="0"
                          value={newService.fleet.advanced}
                          onChange={(e) => updateFleet('advanced', parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <Label>ICU Ambulances</Label>
                        <Input
                          type="number"
                          min="0"
                          value={newService.fleet.icu}
                          onChange={(e) => updateFleet('icu', parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <Label>Neonatal ICU</Label>
                        <Input
                          type="number"
                          min="0"
                          value={newService.fleet.neonatal}
                          onChange={(e) => updateFleet('neonatal', parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Total Fleet Size: {newService.fleet.total} ambulances
                    </div>
                  </div>

                  {/* Address */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Address</Label>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <Label>Street Address</Label>
                        <Input
                          value={newService.address.street}
                          onChange={(e) => setNewService({...newService, address: {...newService.address, street: e.target.value}})}
                        />
                      </div>
                      <div>
                        <Label>City</Label>
                        <Input
                          value={newService.address.city}
                          onChange={(e) => setNewService({...newService, address: {...newService.address, city: e.target.value}})}
                        />
                      </div>
                      <div>
                        <Label>State</Label>
                        <Input
                          value={newService.address.state}
                          onChange={(e) => setNewService({...newService, address: {...newService.address, state: e.target.value}})}
                        />
                      </div>
                      <div>
                        <Label>Pincode</Label>
                        <Input
                          value={newService.address.pincode}
                          onChange={(e) => setNewService({...newService, address: {...newService.address, pincode: e.target.value}})}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Service Areas */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Service Areas</Label>
                    <Textarea
                      value={newService.serviceAreas.join(', ')}
                      onChange={(e) => handleServiceAreaChange(e.target.value)}
                      placeholder="Enter service areas separated by commas (e.g., Downtown, City Center, Highway Zones)"
                    />
                  </div>

                  {/* Ambulance Types */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Ambulance Types</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {ambulanceTypes.map((type) => (
                        <div key={type} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={newService.ambulanceTypes.includes(type)}
                            onChange={() => handleTypeToggle(type)}
                            className="rounded"
                          />
                          <span className="text-sm">{type}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Certifications */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Certifications</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {certifications.map((cert) => (
                        <div key={cert} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={newService.certifications.includes(cert)}
                            onChange={() => handleCertificationToggle(cert)}
                            className="rounded"
                          />
                          <span className="text-sm">{cert}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Availability */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Response Times by Day
                    </Label>
                    <div className="space-y-3">
                      {Object.entries(defaultAvailability).map(([day, availability]) => (
                        <div key={day} className="flex items-center gap-4">
                          <div className="w-20 capitalize font-medium">{day}</div>
                          <Switch
                            checked={newService.availability[day]?.available}
                            onCheckedChange={(checked) => updateAvailability(day, 'available', checked)}
                          />
                          {newService.availability[day]?.available && (
                            <Input
                              value={newService.availability[day]?.responseTime}
                              onChange={(e) => updateAvailability(day, 'responseTime', e.target.value)}
                              placeholder="10-15 minutes"
                              className="flex-1"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Switches */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={newService.is24x7}
                        onCheckedChange={(checked) => setNewService({...newService, is24x7: checked})}
                      />
                      <Label>24x7 Emergency Service</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={newService.isActive}
                        onCheckedChange={(checked) => setNewService({...newService, isActive: checked})}
                      />
                      <Label>Active</Label>
                    </div>
                  </div>

                  <Button type="submit" disabled={loading} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    {loading ? 'Adding...' : 'Add Ambulance Service'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bulk">
            <Card>
              <CardHeader>
                <CardTitle>Bulk Import Ambulance Services</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Paste JSON array of service objects with required fields: name, licenseNumber, email, phoneNumber, emergencyNumber
                </p>
                <Textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder='[{"name":"Emergency Medical Services","licenseNumber":"AMB001","email":"contact@ems.com","phoneNumber":"+91-1234567890","emergencyNumber":"108","ambulanceTypes":["Basic Life Support (BLS)","ICU Ambulance"],"serviceAreas":["City Center","Highway"]}]'
                  className="h-64 font-mono text-sm"
                />
                <Button onClick={handleJsonUpload} disabled={loading}>
                  <Upload className="mr-2 h-4 w-4" />
                  {loading ? 'Uploading...' : 'Upload JSON'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AmbulanceManagement;