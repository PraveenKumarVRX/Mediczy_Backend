import { useState, useRef, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Download, Plus, Building, Users, MapPin, Clock } from 'lucide-react';
import axios from 'axios';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface Clinic {
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
  specialties: string[];
  operatingHours: {
    [key: string]: { open: string; close: string; isOpen: boolean };
  };
  isActive: boolean;
  doctorCapacity: number;
  currentDoctors: number;
  website?: string;
}

const clinicTypes = [
  'General Clinic', 'Specialty Clinic', 'Dental Clinic', 'Eye Clinic',
  'Skin Clinic', 'Cardiology Clinic', 'Orthopedic Clinic', 'Pediatric Clinic',
  'Women\'s Health Clinic', 'Mental Health Clinic', 'Diagnostic Clinic'
];

const specialties = [
  'General Medicine', 'Cardiology', 'Dermatology', 'Pediatrics', 
  'Orthopedics', 'Gynecology', 'ENT', 'Ophthalmology', 'Dentistry',
  'Psychiatry', 'Neurology', 'Physiotherapy', 'Nutrition'
];

const defaultHours = {
  monday: { open: '09:00', close: '18:00', isOpen: true },
  tuesday: { open: '09:00', close: '18:00', isOpen: true },
  wednesday: { open: '09:00', close: '18:00', isOpen: true },
  thursday: { open: '09:00', close: '18:00', isOpen: true },
  friday: { open: '09:00', close: '18:00', isOpen: true },
  saturday: { open: '09:00', close: '14:00', isOpen: true },
  sunday: { open: '10:00', close: '16:00', isOpen: false },
};

const ClinicsManagement = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [jsonInput, setJsonInput] = useState('');
  const token = localStorage.getItem('adminToken');

  const [newClinic, setNewClinic] = useState<Clinic>({
    name: '',
    registrationNumber: '',
    email: '',
    phoneNumber: '',
    address: { street: '', city: '', state: '', pincode: '' },
    type: '',
    specialties: [],
    operatingHours: defaultHours,
    isActive: true,
    doctorCapacity: 5,
    currentDoctors: 0
  });

  useEffect(() => {
    fetchClinics();
  }, []);

  const fetchClinics = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/clinics', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClinics(data.clinics || []);
    } catch (err: any) {
      console.error('Failed to fetch clinics:', err);
      setClinics([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSingleClinicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const { data } = await api.post('/admin/clinics',
        { clinic: newClinic },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setResult(data);
      setNewClinic({
        name: '',
        registrationNumber: '',
        email: '',
        phoneNumber: '',
        address: { street: '', city: '', state: '', pincode: '' },
        type: '',
        specialties: [],
        operatingHours: defaultHours,
        isActive: true,
        doctorCapacity: 5,
        currentDoctors: 0
      });
      fetchClinics();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create clinic');
    } finally {
      setLoading(false);
    }
  };

  const handleJsonUpload = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const clinics = JSON.parse(jsonInput);
      const { data } = await axios.post(`${import.meta.env.VITE_API_URL || '/api'}/admin/clinics/bulk`,
        { clinics: Array.isArray(clinics) ? clinics : [clinics] },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setResult(data);
      setJsonInput('');
      fetchClinics();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'JSON upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSpecialtyToggle = (specialty: string) => {
    setNewClinic(prev => ({
      ...prev,
      specialties: prev.specialties.includes(specialty)
        ? prev.specialties.filter(s => s !== specialty)
        : [...prev.specialties, specialty]
    }));
  };

  const updateOperatingHours = (day: string, field: string, value: string | boolean) => {
    setNewClinic(prev => ({
      ...prev,
      operatingHours: {
        ...prev.operatingHours,
        [day]: {
          ...prev.operatingHours[day],
          [field]: value
        }
      }
    }));
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <Building className="h-8 w-8" />
              My Clinics
            </h2>
            <p className="text-muted-foreground">Manage clinic network and partnerships</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              Total: {clinics.length} clinics
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Clinics</p>
                  <p className="text-3xl font-bold">{clinics.length}</p>
                </div>
                <Building className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Clinics</p>
                  <p className="text-3xl font-bold">{clinics.filter(c => c.isActive).length}</p>
                </div>
                <Users className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Capacity</p>
                  <p className="text-3xl font-bold">{clinics.reduce((sum, c) => sum + c.doctorCapacity, 0)}</p>
                </div>
                <Users className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Current Doctors</p>
                  <p className="text-3xl font-bold">{clinics.reduce((sum, c) => sum + c.currentDoctors, 0)}</p>
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
            <TabsTrigger value="list">Clinic List</TabsTrigger>
            <TabsTrigger value="create">Add Clinic</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Import</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            {loading ? (
              <div className="text-center py-8">Loading clinics...</div>
            ) : clinics.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No clinics found. Add your first clinic to get started.</p>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {clinics.map((clinic) => (
                  <Card key={clinic.id}>
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-lg font-semibold">{clinic.name}</h3>
                            <p className="text-sm text-muted-foreground">{clinic.type}</p>
                            <p className="text-sm text-muted-foreground">Reg: {clinic.registrationNumber}</p>
                          </div>
                          <div className={`px-2 py-1 rounded-full text-xs ${clinic.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                            {clinic.isActive ? 'Active' : 'Inactive'}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium">Capacity:</span> {clinic.doctorCapacity}
                          </div>
                          <div>
                            <span className="font-medium">Current Doctors:</span> {clinic.currentDoctors}
                          </div>
                        </div>

                        <div>
                          <p className="text-sm font-medium mb-2">Contact:</p>
                          <p className="text-sm">{clinic.email}</p>
                          <p className="text-sm">{clinic.phoneNumber}</p>
                        </div>

                        <div>
                          <p className="text-sm font-medium mb-2">Address:</p>
                          <p className="text-sm">
                            {clinic.address.street}, {clinic.address.city}<br/>
                            {clinic.address.state} - {clinic.address.pincode}
                          </p>
                        </div>

                        <div>
                          <p className="text-sm font-medium mb-2">Specialties:</p>
                          <div className="flex flex-wrap gap-1">
                            {clinic.specialties.map((specialty) => (
                              <span key={specialty} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                {specialty}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="text-sm font-medium mb-2">Hours Today:</p>
                          <div className="text-sm">
                            {(() => {
                              const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
                              const todayHours = clinic.operatingHours[today];
                              return todayHours?.isOpen ? 
                                `${todayHours.open} - ${todayHours.close}` : 
                                'Closed';
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
                <CardTitle>Add New Clinic</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSingleClinicSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label>Clinic Name *</Label>
                      <Input
                        required
                        value={newClinic.name}
                        onChange={(e) => setNewClinic({...newClinic, name: e.target.value})}
                        placeholder="City Health Clinic"
                      />
                    </div>
                    <div>
                      <Label>Registration Number *</Label>
                      <Input
                        required
                        value={newClinic.registrationNumber}
                        onChange={(e) => setNewClinic({...newClinic, registrationNumber: e.target.value})}
                        placeholder="CLI123456"
                      />
                    </div>
                    <div>
                      <Label>Email *</Label>
                      <Input
                        type="email"
                        required
                        value={newClinic.email}
                        onChange={(e) => setNewClinic({...newClinic, email: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Phone Number *</Label>
                      <Input
                        required
                        value={newClinic.phoneNumber}
                        onChange={(e) => setNewClinic({...newClinic, phoneNumber: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Clinic Type *</Label>
                      <Select value={newClinic.type} onValueChange={(val) => setNewClinic({...newClinic, type: val})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select clinic type" />
                        </SelectTrigger>
                        <SelectContent>
                          {clinicTypes.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Website</Label>
                      <Input
                        value={newClinic.website || ''}
                        onChange={(e) => setNewClinic({...newClinic, website: e.target.value})}
                        placeholder="https://clinic.com"
                      />
                    </div>
                    <div>
                      <Label>Doctor Capacity</Label>
                      <Input
                        type="number"
                        value={newClinic.doctorCapacity}
                        onChange={(e) => setNewClinic({...newClinic, doctorCapacity: parseInt(e.target.value) || 0})}
                      />
                    </div>
                    <div>
                      <Label>Current Doctors</Label>
                      <Input
                        type="number"
                        value={newClinic.currentDoctors}
                        onChange={(e) => setNewClinic({...newClinic, currentDoctors: parseInt(e.target.value) || 0})}
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
                          value={newClinic.address.street}
                          onChange={(e) => setNewClinic({...newClinic, address: {...newClinic.address, street: e.target.value}})}
                        />
                      </div>
                      <div>
                        <Label>City</Label>
                        <Input
                          value={newClinic.address.city}
                          onChange={(e) => setNewClinic({...newClinic, address: {...newClinic.address, city: e.target.value}})}
                        />
                      </div>
                      <div>
                        <Label>State</Label>
                        <Input
                          value={newClinic.address.state}
                          onChange={(e) => setNewClinic({...newClinic, address: {...newClinic.address, state: e.target.value}})}
                        />
                      </div>
                      <div>
                        <Label>Pincode</Label>
                        <Input
                          value={newClinic.address.pincode}
                          onChange={(e) => setNewClinic({...newClinic, address: {...newClinic.address, pincode: e.target.value}})}
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
                            checked={newClinic.specialties.includes(specialty)}
                            onChange={() => handleSpecialtyToggle(specialty)}
                            className="rounded"
                          />
                          <span className="text-sm">{specialty}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Operating Hours */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Operating Hours
                    </Label>
                    <div className="space-y-3">
                      {Object.entries(defaultHours).map(([day, hours]) => (
                        <div key={day} className="flex items-center gap-4">
                          <div className="w-20 capitalize font-medium">{day}</div>
                          <Switch
                            checked={newClinic.operatingHours[day]?.isOpen}
                            onCheckedChange={(checked) => updateOperatingHours(day, 'isOpen', checked)}
                          />
                          {newClinic.operatingHours[day]?.isOpen && (
                            <>
                              <Input
                                type="time"
                                value={newClinic.operatingHours[day]?.open}
                                onChange={(e) => updateOperatingHours(day, 'open', e.target.value)}
                                className="w-32"
                              />
                              <span>to</span>
                              <Input
                                type="time"
                                value={newClinic.operatingHours[day]?.close}
                                onChange={(e) => updateOperatingHours(day, 'close', e.target.value)}
                                className="w-32"
                              />
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Active Switch */}
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={newClinic.isActive}
                      onCheckedChange={(checked) => setNewClinic({...newClinic, isActive: checked})}
                    />
                    <Label>Active</Label>
                  </div>

                  <Button type="submit" disabled={loading} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    {loading ? 'Adding...' : 'Add Clinic'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bulk">
            <Card>
              <CardHeader>
                <CardTitle>Bulk Import Clinics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Paste JSON array of clinic objects with required fields: name, registrationNumber, email, phoneNumber, type
                </p>
                <Textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder='[{"name":"City Health Clinic","registrationNumber":"CLI001","email":"contact@cityclinic.com","phoneNumber":"+91-1234567890","type":"General Clinic","doctorCapacity":10,"currentDoctors":5}]'
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

export default ClinicsManagement;