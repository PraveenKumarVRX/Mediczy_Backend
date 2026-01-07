import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import {
  Pill, Plus, Search, ArrowLeft, Calendar, Clock,
  User, FileText, CheckCircle, XCircle, AlertCircle,
  Stethoscope, Activity, Filter, Download, Printer,
  Trash2, Edit, Save, RotateCcw
} from 'lucide-react';

interface Medication {
  id: string;
  name: string;
  genericName: string;
  strength: string;
  form: string;
  category: string;
  requiresPrescription: boolean;
}

interface PrescriptionItem {
  id: string;
  medication: Medication;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  quantity: number;
}

interface Prescription {
  id: string;
  prescriptionNumber: string;
  patientId: string;
  patientName: string;
  uhid: string;
  doctorName: string;
  department: string;
  items: PrescriptionItem[];
  diagnosis: string;
  notes: string;
  status: 'Draft' | 'Active' | 'Completed' | 'Cancelled';
  createdDate: string;
  validUntil: string;
}

const HospitalPrescriptionCreator = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('create');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [diagnosis, setDiagnosis] = useState('');
  const [prescriptionNotes, setPrescriptionNotes] = useState('');
  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Current prescription being edited
  const [currentItem, setCurrentItem] = useState<Partial<PrescriptionItem>>({
    dosage: '',
    frequency: '',
    duration: '',
    instructions: '',
    quantity: 1
  });
  const [selectedMedication, setSelectedMedication] = useState<Medication | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('hospitalToken');
    if (!token) {
      navigate('/hospital/login');
      return;
    }
  }, [navigate]);

  // Sample medications data
  const medications: Medication[] = [
    {
      id: 'MED001',
      name: 'Paracetamol 500mg',
      genericName: 'Paracetamol',
      strength: '500mg',
      form: 'Tablet',
      category: 'Analgesic',
      requiresPrescription: false
    },
    {
      id: 'MED002',
      name: 'Amoxicillin 500mg',
      genericName: 'Amoxicillin',
      strength: '500mg',
      form: 'Capsule',
      category: 'Antibiotic',
      requiresPrescription: true
    },
    {
      id: 'MED003',
      name: 'Amlodipine 5mg',
      genericName: 'Amlodipine',
      strength: '5mg',
      form: 'Tablet',
      category: 'Antihypertensive',
      requiresPrescription: true
    },
    {
      id: 'MED004',
      name: 'Metformin 500mg',
      genericName: 'Metformin',
      strength: '500mg',
      form: 'Tablet',
      category: 'Antidiabetic',
      requiresPrescription: true
    },
    {
      id: 'MED005',
      name: 'Omeprazole 20mg',
      genericName: 'Omeprazole',
      strength: '20mg',
      form: 'Capsule',
      category: 'Antacid',
      requiresPrescription: true
    },
    {
      id: 'MED006',
      name: 'Ibuprofen 400mg',
      genericName: 'Ibuprofen',
      strength: '400mg',
      form: 'Tablet',
      category: 'NSAID',
      requiresPrescription: false
    },
    {
      id: 'MED007',
      name: 'Losartan 50mg',
      genericName: 'Losartan',
      strength: '50mg',
      form: 'Tablet',
      category: 'Antihypertensive',
      requiresPrescription: true
    },
    {
      id: 'MED008',
      name: 'Azithromycin 500mg',
      genericName: 'Azithromycin',
      strength: '500mg',
      form: 'Tablet',
      category: 'Antibiotic',
      requiresPrescription: true
    }
  ];

  // Sample prescriptions data
  const prescriptions: Prescription[] = [
    {
      id: 'PRE001',
      prescriptionNumber: 'RX-2024-001234',
      patientId: 'P001',
      patientName: 'Rajesh Kumar',
      uhid: 'UHID001234',
      doctorName: 'Dr. Sharma',
      department: 'Cardiology',
      items: [
        {
          id: 'ITEM001',
          medication: medications[2],
          dosage: '5mg',
          frequency: 'Once daily',
          duration: '30 days',
          instructions: 'Take with food',
          quantity: 30
        }
      ],
      diagnosis: 'Hypertension',
      notes: 'Regular follow-up required',
      status: 'Active',
      createdDate: '2024-12-10',
      validUntil: '2025-01-10'
    },
    {
      id: 'PRE002',
      prescriptionNumber: 'RX-2024-001235',
      patientId: 'P002',
      patientName: 'Priya Singh',
      uhid: 'UHID001235',
      doctorName: 'Dr. Patel',
      department: 'Gynecology',
      items: [
        {
          id: 'ITEM002',
          medication: medications[1],
          dosage: '500mg',
          frequency: 'Three times daily',
          duration: '7 days',
          instructions: 'Complete full course',
          quantity: 21
        }
      ],
      diagnosis: 'Urinary Tract Infection',
      notes: 'Drink plenty of water',
      status: 'Completed',
      createdDate: '2024-12-09',
      validUntil: '2024-12-16'
    }
  ];

  // Sample patients data
  const patients = [
    { id: 'P001', name: 'Rajesh Kumar', uhid: 'UHID001234', age: 45, gender: 'Male' },
    { id: 'P002', name: 'Priya Singh', uhid: 'UHID001235', age: 32, gender: 'Female' },
    { id: 'P003', name: 'Amit Verma', uhid: 'UHID001236', age: 28, gender: 'Male' },
    { id: 'P004', name: 'Sunita Devi', uhid: 'UHID001237', age: 55, gender: 'Female' }
  ];

  const categories = ['all', 'Analgesic', 'Antibiotic', 'Antihypertensive', 'Antidiabetic', 'Antacid', 'NSAID'];
  const frequencies = ['Once daily', 'Twice daily', 'Three times daily', 'Four times daily', 'As needed', 'Every 6 hours', 'Every 8 hours', 'Every 12 hours'];
  const durations = ['3 days', '5 days', '7 days', '10 days', '14 days', '21 days', '30 days', '60 days', '90 days'];

  const filteredMedications = medications.filter(med => {
    const matchesSearch = med.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         med.genericName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         med.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || med.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredPatients = patients.filter(patient =>
    patient.name.toLowerCase().includes(patientSearch.toLowerCase()) ||
    patient.uhid.toLowerCase().includes(patientSearch.toLowerCase())
  );

  const handleAddMedication = () => {
    if (!selectedMedication) {
      toast({
        title: "No Medication Selected",
        description: "Please select a medication first.",
        variant: "destructive",
      });
      return;
    }

    if (!currentItem.dosage || !currentItem.frequency || !currentItem.duration) {
      toast({
        title: "Incomplete Information",
        description: "Please fill in dosage, frequency, and duration.",
        variant: "destructive",
      });
      return;
    }

    const newItem: PrescriptionItem = {
      id: `ITEM${Date.now()}`,
      medication: selectedMedication,
      dosage: currentItem.dosage!,
      frequency: currentItem.frequency!,
      duration: currentItem.duration!,
      instructions: currentItem.instructions || '',
      quantity: currentItem.quantity || 1
    };

    setPrescriptionItems([...prescriptionItems, newItem]);

    // Reset form
    setSelectedMedication(null);
    setCurrentItem({
      dosage: '',
      frequency: '',
      duration: '',
      instructions: '',
      quantity: 1
    });

    toast({
      title: "Medication Added",
      description: `${selectedMedication.name} added to prescription.`,
    });
  };

  const handleRemoveItem = (itemId: string) => {
    setPrescriptionItems(prescriptionItems.filter(item => item.id !== itemId));
  };

  const handleCreatePrescription = async () => {
    if (!selectedPatient) {
      toast({
        title: "No Patient Selected",
        description: "Please select a patient.",
        variant: "destructive",
      });
      return;
    }

    if (prescriptionItems.length === 0) {
      toast({
        title: "No Medications",
        description: "Please add at least one medication.",
        variant: "destructive",
      });
      return;
    }

    if (!diagnosis.trim()) {
      toast({
        title: "Diagnosis Required",
        description: "Please enter a diagnosis.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      toast({
        title: "Prescription Created",
        description: `Prescription created for ${selectedPatient.name}`,
      });

      // Reset form
      setSelectedPatient(null);
      setDiagnosis('');
      setPrescriptionNotes('');
      setPrescriptionItems([]);
      setShowCreateDialog(false);

    } catch (error) {
      toast({
        title: "Creation Failed",
        description: "Failed to create prescription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Draft': return 'bg-gray-100 text-gray-800';
      case 'Active': return 'bg-green-100 text-green-800';
      case 'Completed': return 'bg-teal-100 text-teal-800';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <HospitalLayout title="Prescription Creator" subtitle="Create and manage patient prescriptions">
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-end">
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-gradient-to-r from-teal-500 to-teal-600">
                <Plus className="h-4 w-4" />
                Create Prescription
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Prescription</DialogTitle>
              </DialogHeader>

              <div className="space-y-6">
                {/* Patient Selection */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Select Patient</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="relative">
                      <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search patient by name or UHID..."
                        className="pl-9"
                        value={patientSearch}
                        onChange={(e) => setPatientSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto border rounded-md">
                      {filteredPatients.map((patient) => (
                        <div
                          key={patient.id}
                          className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${
                            selectedPatient?.id === patient.id ? 'bg-teal-50 border-teal-200' : ''
                          }`}
                          onClick={() => setSelectedPatient(patient)}
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-medium">{patient.name}</p>
                              <p className="text-sm text-muted-foreground">{patient.uhid}</p>
                            </div>
                            <div className="text-right text-sm text-muted-foreground">
                              <p>{patient.age} years</p>
                              <p>{patient.gender}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {selectedPatient && (
                      <div className="p-3 bg-teal-50 border border-teal-200 rounded-md">
                        <p className="font-medium text-teal-900">Selected: {selectedPatient.name}</p>
                        <p className="text-sm text-teal-700">{selectedPatient.uhid}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Diagnosis */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Diagnosis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      placeholder="Enter diagnosis..."
                      value={diagnosis}
                      onChange={(e) => setDiagnosis(e.target.value)}
                      rows={3}
                    />
                  </CardContent>
                </Card>

                {/* Medication Selection */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Add Medications</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Medication Search */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="relative">
                        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search medications..."
                          className="pl-9"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                      <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                        <SelectTrigger>
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((category) => (
                            <SelectItem key={category} value={category}>
                              {category === 'all' ? 'All Categories' : category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Medication List */}
                    <div className="max-h-40 overflow-y-auto border rounded-md">
                      {filteredMedications.map((med) => (
                        <div
                          key={med.id}
                          className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${
                            selectedMedication?.id === med.id ? 'bg-teal-50 border-teal-200' : ''
                          }`}
                          onClick={() => setSelectedMedication(med)}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">{med.name}</p>
                              <p className="text-sm text-muted-foreground">{med.genericName} • {med.form}</p>
                            </div>
                            <div className="text-right">
                              <Badge variant="outline">{med.category}</Badge>
                              {med.requiresPrescription && (
                                <p className="text-xs text-orange-600 mt-1">Rx Required</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {selectedMedication && (
                      <div className="p-3 bg-teal-50 border border-teal-200 rounded-md">
                        <p className="font-medium text-teal-900">Selected: {selectedMedication.name}</p>
                        <p className="text-sm text-teal-700">{selectedMedication.genericName} • {selectedMedication.strength}</p>
                      </div>
                    )}

                    {/* Dosage Form */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <Label>Dosage</Label>
                        <Input
                          placeholder="e.g., 500mg"
                          value={currentItem.dosage}
                          onChange={(e) => setCurrentItem({...currentItem, dosage: e.target.value})}
                        />
                      </div>
                      <div>
                        <Label>Frequency</Label>
                        <Select value={currentItem.frequency} onValueChange={(value) => setCurrentItem({...currentItem, frequency: value})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                          <SelectContent>
                            {frequencies.map((freq) => (
                              <SelectItem key={freq} value={freq}>{freq}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Duration</Label>
                        <Select value={currentItem.duration} onValueChange={(value) => setCurrentItem({...currentItem, duration: value})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select duration" />
                          </SelectTrigger>
                          <SelectContent>
                            {durations.map((dur) => (
                              <SelectItem key={dur} value={dur}>{dur}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Quantity</Label>
                        <Input
                          type="number"
                          min="1"
                          value={currentItem.quantity}
                          onChange={(e) => setCurrentItem({...currentItem, quantity: parseInt(e.target.value) || 1})}
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Instructions</Label>
                      <Textarea
                        placeholder="Special instructions (e.g., take with food, avoid alcohol)..."
                        value={currentItem.instructions}
                        onChange={(e) => setCurrentItem({...currentItem, instructions: e.target.value})}
                        rows={2}
                      />
                    </div>

                    <Button onClick={handleAddMedication} className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Medication
                    </Button>
                  </CardContent>
                </Card>

                {/* Prescription Items */}
                {prescriptionItems.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Prescription Items</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {prescriptionItems.map((item) => (
                          <div key={item.id} className="flex items-center justify-between p-3 border rounded-md">
                            <div className="flex-1">
                              <p className="font-medium">{item.medication.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {item.dosage} • {item.frequency} • {item.duration} • Qty: {item.quantity}
                              </p>
                              {item.instructions && (
                                <p className="text-sm text-teal-600">{item.instructions}</p>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemoveItem(item.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Notes */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Additional Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      placeholder="Additional notes for pharmacist or patient..."
                      value={prescriptionNotes}
                      onChange={(e) => setPrescriptionNotes(e.target.value)}
                      rows={3}
                    />
                  </CardContent>
                </Card>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreatePrescription} disabled={loading}>
                  {loading ? 'Creating...' : 'Create Prescription'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Today's Prescriptions</p>
                  <p className="text-2xl font-bold">42</p>
                </div>
                <Pill className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Prescriptions</p>
                  <p className="text-2xl font-bold">156</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending Review</p>
                  <p className="text-2xl font-bold">8</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Medications Dispensed</p>
                  <p className="text-2xl font-bold">289</p>
                </div>
                <Activity className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Prescription Management</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button variant="outline" size="sm">
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Recent Prescriptions */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Recent Prescriptions</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prescription #</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Diagnosis</TableHead>
                    <TableHead>Medications</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prescriptions.map((prescription) => (
                    <TableRow key={prescription.id}>
                      <TableCell className="font-medium">{prescription.prescriptionNumber}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{prescription.patientName}</p>
                          <p className="text-sm text-muted-foreground">{prescription.uhid}</p>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{prescription.diagnosis}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {prescription.items.slice(0, 2).map((item) => (
                            <Badge key={item.id} variant="outline" className="text-xs">
                              {item.medication.name}
                            </Badge>
                          ))}
                          {prescription.items.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{prescription.items.length - 2} more
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(prescription.status)}>
                          {prescription.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{prescription.createdDate}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm">
                            <FileText className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          <Button variant="outline" size="sm">
                            <Printer className="h-4 w-4 mr-1" />
                            Print
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </HospitalLayout>
  );
};

export default HospitalPrescriptionCreator;