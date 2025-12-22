import { useState, useRef, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Download, Plus, FileSpreadsheet, Building, Bed, Users, MapPin } from 'lucide-react';
import axios from 'axios';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

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

const HospitalsManagement = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [jsonInput, setJsonInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = localStorage.getItem('adminToken');

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
  }, []);

  const fetchHospitals = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get('/api/hospitals', {
        params: { limit: 100, page: 1 }
      });
      if (data.success) {
        // Map new API structure to existing component structure
        const mappedHospitals = data.data.map((h: any) => ({
          id: h.id,
          name: h.name,
          email: h.email || '',
          phoneNumber: h.phone || h.mobile || '',
          address: {
            street: h.address || '',
            city: h.city || '',
            state: h.state || '',
            pincode: h.pincode || ''
          },
          type: h.entity_type || 'HOSPITAL',
          isActive: h.active,
          is_spn: h.is_spn,
          google_place_id: h.google_place_id
        }));
        setHospitals(mappedHospitals);
      }
    } catch (err: any) {
      console.error('Failed to fetch hospitals:', err);
      setHospitals([]);
    } finally {
      setLoading(false);
    }
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
      const { data } = await axios.post('http://192.168.1.72:8000/api/admin/hospitals/bulk',
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
                  <p className="text-3xl font-bold">{hospitals.length}</p>
                </div>
                <Building className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Hospitals</p>
                  <p className="text-3xl font-bold">{hospitals.filter(h => h.isActive).length}</p>
                </div>
                <Users className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Beds</p>
                  <p className="text-3xl font-bold">{hospitals.reduce((sum, h) => sum + h.totalBeds, 0)}</p>
                </div>
                <Bed className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Available Beds</p>
                  <p className="text-3xl font-bold">{hospitals.reduce((sum, h) => sum + h.availableBeds, 0)}</p>
                </div>
                <Bed className="h-8 w-8 text-amber-500" />
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
            <TabsTrigger value="list">Hospital List</TabsTrigger>
            <TabsTrigger value="create">Add Hospital</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Import</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            {loading ? (
              <div className="text-center py-8">Loading hospitals...</div>
            ) : hospitals.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No hospitals found. Add your first hospital to get started.</p>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {hospitals.map((hospital) => (
                  <Card key={hospital.id}>
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-lg font-semibold">{hospital.name}</h3>
                            <p className="text-sm text-muted-foreground">{hospital.type}</p>
                            <p className="text-sm text-muted-foreground">Reg: {hospital.registrationNumber}</p>
                          </div>
                          <div className={`px-2 py-1 rounded-full text-xs ${hospital.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                            {hospital.isActive ? 'Active' : 'Inactive'}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium">Total Beds:</span> {hospital.totalBeds}
                          </div>
                          <div>
                            <span className="font-medium">Available:</span> {hospital.availableBeds}
                          </div>
                        </div>

                        <div>
                          <p className="text-sm font-medium mb-2">Contact:</p>
                          <p className="text-sm">{hospital.email}</p>
                          <p className="text-sm">{hospital.phoneNumber}</p>
                        </div>

                        <div>
                          <p className="text-sm font-medium mb-2">Specialties:</p>
                          <div className="flex flex-wrap gap-1">
                            {hospital.specialties.map((specialty) => (
                              <span key={specialty} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                {specialty}
                              </span>
                            ))}
                          </div>
                        </div>

                        {hospital.emergencyServices && (
                          <div className="flex items-center gap-2 text-sm text-red-600">
                            <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                            Emergency Services Available
                          </div>
                        )}
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
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Paste JSON array of hospital objects with required fields: name, registrationNumber, email, phoneNumber, type
                </p>
                <Textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder='[{"name":"Apollo Hospital","registrationNumber":"REG001","email":"contact@apollo.com","phoneNumber":"+91-1234567890","type":"Multi Specialty Hospital","totalBeds":500,"availableBeds":100}]'
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

export default HospitalsManagement;