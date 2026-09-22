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
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import { loadHospitalStore, saveHospitalStore } from '@/utils/hospitalStorage';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import {
  Stethoscope, Plus, Search, ArrowLeft, Calendar, Clock,
  User, FileText, CheckCircle, XCircle, AlertCircle,
  Activity, Filter, Download, Printer, Scissors,
  Heart, Brain, Bone, Eye, Syringe, Microscope
} from 'lucide-react';

interface Procedure {
  id: string;
  name: string;
  category: string;
  department: string;
  estimatedDuration: string;
  anesthesia: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  cost: number;
  preparation: string;
  requiresConsent: boolean;
}

interface ProcedureSchedule {
  id: string;
  procedureId: string;
  procedure: Procedure;
  patientId: string;
  patientName: string;
  uhid: string;
  doctorName: string;
  department: string;
  scheduledDate: string;
  scheduledTime: string;
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled' | 'Postponed';
  priority: 'Routine' | 'Urgent' | 'Emergency';
  notes: string;
  preOpNotes?: string;
  postOpNotes?: string;
  anesthesiaType: string;
  estimatedDuration: string;
  room: string;
  assistants: string[];
}

const HospitalProcedureAdder = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const hospitalHeaders = () => {
    const token = localStorage.getItem('hospitalToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const [activeTab, setActiveTab] = useState('schedule');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [selectedProcedure, setSelectedProcedure] = useState<Procedure | null>(null);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [priority, setPriority] = useState<'Routine' | 'Urgent' | 'Emergency'>('Routine');
  const [anesthesiaType, setAnesthesiaType] = useState('');
  const [room, setRoom] = useState('');
  const [procedureNotes, setProcedureNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('hospitalToken');
    if (!token) {
      navigate('/hospital/login');
      return;
    }
  }, [navigate]);

  // Sample procedures data
  const procedures: Procedure[] = [
    {
      id: 'PROC001',
      name: 'Appendectomy',
      category: 'Surgical',
      department: 'General Surgery',
      estimatedDuration: '1-2 hours',
      anesthesia: 'General',
      riskLevel: 'Medium',
      cost: 45000,
      preparation: 'Nil per oral 6 hours, consent required',
      requiresConsent: true
    },
    {
      id: 'PROC002',
      name: 'Colonoscopy',
      category: 'Endoscopic',
      department: 'Gastroenterology',
      estimatedDuration: '30-45 minutes',
      anesthesia: 'Sedation',
      riskLevel: 'Low',
      cost: 8500,
      preparation: 'Bowel preparation required',
      requiresConsent: true
    },
    {
      id: 'PROC003',
      name: 'Angioplasty',
      category: 'Interventional',
      department: 'Cardiology',
      estimatedDuration: '2-3 hours',
      anesthesia: 'Local',
      riskLevel: 'High',
      cost: 185000,
      preparation: 'Cardiac evaluation required',
      requiresConsent: true
    },
    {
      id: 'PROC004',
      name: 'Knee Arthroscopy',
      category: 'Orthopedic',
      department: 'Orthopedics',
      estimatedDuration: '1-1.5 hours',
      anesthesia: 'Spinal',
      riskLevel: 'Medium',
      cost: 65000,
      preparation: 'Pre-op physiotherapy',
      requiresConsent: true
    },
    {
      id: 'PROC005',
      name: 'Cataract Surgery',
      category: 'Ophthalmic',
      department: 'Ophthalmology',
      estimatedDuration: '30-45 minutes',
      anesthesia: 'Local',
      riskLevel: 'Low',
      cost: 25000,
      preparation: 'Eye drops as prescribed',
      requiresConsent: true
    },
    {
      id: 'PROC006',
      name: 'Dental Extraction',
      category: 'Dental',
      department: 'Dentistry',
      estimatedDuration: '15-30 minutes',
      anesthesia: 'Local',
      riskLevel: 'Low',
      cost: 1500,
      preparation: 'None',
      requiresConsent: true
    },
    {
      id: 'PROC007',
      name: 'Caesarean Section',
      category: 'Obstetric',
      department: 'Obstetrics & Gynecology',
      estimatedDuration: '45-60 minutes',
      anesthesia: 'Spinal/Epidural',
      riskLevel: 'Medium',
      cost: 35000,
      preparation: 'Fasting 8 hours',
      requiresConsent: true
    },
    {
      id: 'PROC008',
      name: 'MRI Brain',
      category: 'Diagnostic',
      department: 'Radiology',
      estimatedDuration: '45-60 minutes',
      anesthesia: 'None',
      riskLevel: 'Low',
      cost: 4500,
      preparation: 'Remove metal objects',
      requiresConsent: false
    }
  ];

  const initialScheduledProcedures: ProcedureSchedule[] = [
    {
      id: 'SCH001',
      procedureId: 'PROC001',
      procedure: procedures[0],
      patientId: 'P001',
      patientName: 'Rajesh Kumar',
      uhid: 'UHID001234',
      doctorName: 'Dr. Sharma',
      department: 'General Surgery',
      scheduledDate: '2024-12-15',
      scheduledTime: '10:00 AM',
      status: 'Scheduled',
      priority: 'Urgent',
      notes: 'Acute appendicitis',
      anesthesiaType: 'General Anesthesia',
      estimatedDuration: '1.5 hours',
      room: 'OT-1',
      assistants: ['Dr. Patel', 'Nurse Singh']
    },
    {
      id: 'SCH002',
      procedureId: 'PROC005',
      procedure: procedures[4],
      patientId: 'P002',
      patientName: 'Priya Singh',
      uhid: 'UHID001235',
      doctorName: 'Dr. Mehta',
      department: 'Ophthalmology',
      scheduledDate: '2024-12-14',
      scheduledTime: '2:00 PM',
      status: 'Completed',
      priority: 'Routine',
      notes: 'Age-related cataract',
      anesthesiaType: 'Local Anesthesia',
      estimatedDuration: '45 minutes',
      room: 'Eye OT',
      assistants: ['Nurse Kumar']
    }
  ];

  const [scheduledProcedures, setScheduledProcedures] = useState<ProcedureSchedule[]>(
    () => loadHospitalStore('procedure-schedules', initialScheduledProcedures)
  );

  // Sample patients data
  const patients = [
    { id: 'P001', name: 'Rajesh Kumar', uhid: 'UHID001234', age: 45, gender: 'Male' },
    { id: 'P002', name: 'Priya Singh', uhid: 'UHID001235', age: 32, gender: 'Female' },
    { id: 'P003', name: 'Amit Verma', uhid: 'UHID001236', age: 28, gender: 'Male' },
    { id: 'P004', name: 'Sunita Devi', uhid: 'UHID001237', age: 55, gender: 'Female' }
  ];

  const categories = ['all', 'Surgical', 'Endoscopic', 'Interventional', 'Orthopedic', 'Ophthalmic', 'Dental', 'Obstetric', 'Diagnostic'];
  const departments = ['all', 'General Surgery', 'Gastroenterology', 'Cardiology', 'Orthopedics', 'Ophthalmology', 'Dentistry', 'Obstetrics & Gynecology', 'Radiology'];
  const anesthesiaTypes = ['General Anesthesia', 'Spinal Anesthesia', 'Epidural Anesthesia', 'Local Anesthesia', 'Sedation', 'None'];
  const operatingRooms = ['OT-1', 'OT-2', 'OT-3', 'Eye OT', 'Cardiac Cath Lab', 'Endoscopy Suite', 'Dental Chair'];

  const filteredProcedures = procedures.filter(proc => {
    const matchesSearch = proc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         proc.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         proc.department.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || proc.category === selectedCategory;
    const matchesDepartment = selectedDepartment === 'all' || proc.department === selectedDepartment;
    return matchesSearch && matchesCategory && matchesDepartment;
  });

  const filteredPatients = patients.filter(patient =>
    patient.name.toLowerCase().includes(patientSearch.toLowerCase()) ||
    patient.uhid.toLowerCase().includes(patientSearch.toLowerCase())
  );

  const handleScheduleProcedure = async () => {
    if (!selectedPatient || !selectedProcedure) {
      toast({
        title: "Incomplete Information",
        description: "Please select a patient and procedure.",
        variant: "destructive",
      });
      return;
    }

    if (!scheduledDate || !scheduledTime) {
      toast({
        title: "Schedule Required",
        description: "Please select date and time for the procedure.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const procedureData = {
        procedureId: selectedProcedure.id,
        patientId: selectedPatient.id,
        scheduledDate,
        scheduledTime,
        priority,
        anesthesiaType,
        room,
        notes: procedureNotes,
        estimatedDuration: selectedProcedure.estimatedDuration
      };

      // A failed schedule call must not be shown as "Procedure Scheduled" — OT/theatre booking depends on this.
      const response = await api.post(
        '/hospital/procedures/schedule',
        procedureData,
        { headers: hospitalHeaders() }
      );
      const saved = response.data?.data;

      const created: ProcedureSchedule = {
        id: saved?.id ? String(saved.id) : `SCH-${Date.now()}`,
        procedureId: selectedProcedure.id,
        procedure: selectedProcedure,
        patientId: selectedPatient.id,
        patientName: selectedPatient.name,
        uhid: selectedPatient.uhid,
        doctorName: 'On Call',
        department: selectedProcedure.department,
        scheduledDate,
        scheduledTime,
        status: 'Scheduled',
        priority,
        notes: procedureNotes,
        anesthesiaType,
        estimatedDuration: selectedProcedure.estimatedDuration,
        room,
        assistants: []
      };

      setScheduledProcedures(prev => {
        const updated = [created, ...prev];
        saveHospitalStore('procedure-schedules', updated);
        return updated;
      });

      toast({
        title: "Procedure Scheduled",
        description: `${selectedProcedure.name} scheduled for ${selectedPatient.name}`,
      });

      // Reset form
      setSelectedPatient(null);
      setSelectedProcedure(null);
      setScheduledDate('');
      setScheduledTime('');
      setPriority('Routine');
      setAnesthesiaType('');
      setRoom('');
      setProcedureNotes('');
      setShowScheduleDialog(false);

    } catch (error: any) {
      toast({
        title: "Scheduling Failed",
        description: error.response?.data?.message || "Failed to schedule procedure. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Scheduled': return 'bg-teal-100 text-teal-800';
      case 'In Progress': return 'bg-yellow-100 text-yellow-800';
      case 'Completed': return 'bg-green-100 text-green-800';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      case 'Postponed': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Emergency': return 'bg-red-100 text-red-800';
      case 'Urgent': return 'bg-orange-100 text-orange-800';
      case 'Routine': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'High': return 'bg-red-100 text-red-800';
      case 'Medium': return 'bg-yellow-100 text-yellow-800';
      case 'Low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Surgical': return <Scissors className="h-4 w-4" />;
      case 'Interventional': return <Syringe className="h-4 w-4" />;
      case 'Orthopedic': return <Bone className="h-4 w-4" />;
      case 'Ophthalmic': return <Eye className="h-4 w-4" />;
      case 'Cardiology': return <Heart className="h-4 w-4" />;
      case 'Neurology': return <Brain className="h-4 w-4" />;
      case 'Diagnostic': return <Microscope className="h-4 w-4" />;
      default: return <Stethoscope className="h-4 w-4" />;
    }
  };

  return (
    <HospitalLayout title="Procedure Scheduler" subtitle="Schedule and manage medical procedures">
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-end">
          <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-gradient-to-r from-teal-500 to-teal-600">
                <Plus className="h-4 w-4" />
                Schedule Procedure
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Schedule Procedure</DialogTitle>
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

                {/* Procedure Selection */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Select Procedure</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="relative">
                        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search procedures..."
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
                      <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                        <SelectTrigger>
                          <SelectValue placeholder="Department" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map((dept) => (
                            <SelectItem key={dept} value={dept}>
                              {dept === 'all' ? 'All Departments' : dept}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Procedure List */}
                    <div className="max-h-60 overflow-y-auto border rounded-md">
                      {filteredProcedures.map((proc) => (
                        <div
                          key={proc.id}
                          className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                            selectedProcedure?.id === proc.id ? 'bg-teal-50 border-teal-200' : ''
                          }`}
                          onClick={() => setSelectedProcedure(proc)}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex items-start gap-3">
                              {getCategoryIcon(proc.category)}
                              <div>
                                <p className="font-medium">{proc.name}</p>
                                <p className="text-sm text-muted-foreground">{proc.department} • {proc.category}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge className={getRiskColor(proc.riskLevel)}>
                                    {proc.riskLevel} Risk
                                  </Badge>
                                  <span className="text-sm text-muted-foreground">
                                    {proc.estimatedDuration} • {proc.anesthesia}
                                  </span>
                                </div>
                                <p className="text-sm font-medium text-green-600 mt-1">₹{proc.cost.toLocaleString()}</p>
                              </div>
                            </div>
                            {proc.requiresConsent && (
                              <Badge variant="outline" className="text-orange-600">
                                Consent Required
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {selectedProcedure && (
                      <div className="p-3 bg-teal-50 border border-teal-200 rounded-md">
                        <p className="font-medium text-teal-900">Selected: {selectedProcedure.name}</p>
                        <p className="text-sm text-teal-700">
                          {selectedProcedure.department} • {selectedProcedure.category} • ₹{selectedProcedure.cost.toLocaleString()}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Scheduling Details */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Scheduling Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <Label>Scheduled Date</Label>
                        <Input
                          type="date"
                          value={scheduledDate}
                          onChange={(e) => setScheduledDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Scheduled Time</Label>
                        <Input
                          type="time"
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Priority</Label>
                        <Select value={priority} onValueChange={(value: any) => setPriority(value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Routine">Routine</SelectItem>
                            <SelectItem value="Urgent">Urgent</SelectItem>
                            <SelectItem value="Emergency">Emergency</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Operating Room</Label>
                        <Select value={room} onValueChange={setRoom}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select room" />
                          </SelectTrigger>
                          <SelectContent>
                            {operatingRooms.map((room) => (
                              <SelectItem key={room} value={room}>{room}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label>Anesthesia Type</Label>
                      <Select value={anesthesiaType} onValueChange={setAnesthesiaType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select anesthesia type" />
                        </SelectTrigger>
                        <SelectContent>
                          {anesthesiaTypes.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Procedure Notes</Label>
                      <Textarea
                        placeholder="Enter procedure indications and special notes..."
                        value={procedureNotes}
                        onChange={(e) => setProcedureNotes(e.target.value)}
                        rows={3}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleScheduleProcedure} disabled={loading}>
                  {loading ? 'Scheduling...' : 'Schedule Procedure'}
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
                  <p className="text-sm text-muted-foreground">Today's Procedures</p>
                  <p className="text-2xl font-bold">12</p>
                </div>
                <Stethoscope className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Scheduled Today</p>
                  <p className="text-2xl font-bold">8</p>
                </div>
                <Calendar className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">In Progress</p>
                  <p className="text-2xl font-bold">3</p>
                </div>
                <Activity className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Revenue Today</p>
                  <p className="text-2xl font-bold">₹2,45,000</p>
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
              <CardTitle>Procedure Management</CardTitle>
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
            {/* Procedure Catalog */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-4">Available Procedures</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProcedures.slice(0, 6).map((proc) => (
                  <Card key={proc.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          {getCategoryIcon(proc.category)}
                          <h4 className="font-medium">{proc.name}</h4>
                        </div>
                        <Badge className={getRiskColor(proc.riskLevel)}>
                          {proc.riskLevel}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{proc.department}</p>
                      <div className="space-y-1 text-sm">
                        <p>Duration: {proc.estimatedDuration}</p>
                        <p>Anesthesia: {proc.anesthesia}</p>
                        <p className="font-medium text-green-600">₹{proc.cost.toLocaleString()}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Scheduled Procedures */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Scheduled Procedures</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Procedure</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduledProcedures.map((schedule) => (
                    <TableRow key={schedule.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{schedule.procedure.name}</p>
                          <p className="text-sm text-muted-foreground">{schedule.procedure.category}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{schedule.patientName}</p>
                          <p className="text-sm text-muted-foreground">{schedule.uhid}</p>
                        </div>
                      </TableCell>
                      <TableCell>{schedule.department}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{schedule.scheduledDate}</p>
                          <p className="text-sm text-muted-foreground">{schedule.scheduledTime}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getPriorityColor(schedule.priority)}>
                          {schedule.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(schedule.status)}>
                          {schedule.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{schedule.room}</TableCell>
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

export default HospitalProcedureAdder;
