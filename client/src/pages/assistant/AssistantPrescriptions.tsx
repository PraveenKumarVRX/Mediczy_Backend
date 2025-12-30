import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Search, 
  Download, 
  Eye,
  Calendar,
  User,
  Pill,
  Loader2,
  Filter,
  Printer
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import api from '@/utils/api';

interface Prescription {
  id: string;
  patientName: string;
  patientId: string;
  doctorName: string;
  doctorId: string;
  date: string;
  diagnosis: string;
  medications: {
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions?: string;
  }[];
  notes?: string;
  followUpDate?: string;
  status: 'active' | 'completed' | 'cancelled';
}

const AssistantPrescriptions = () => {
  const navigate = useNavigate();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('assistantToken');
    if (!token) {
      navigate('/assistant/login');
      return;
    }
    fetchPrescriptions();
  }, [navigate]);

  const fetchPrescriptions = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/assistant/prescriptions');
      if (data.success) {
        setPrescriptions(data.prescriptions);
      }
    } catch (error) {
      console.error('Error fetching prescriptions:', error);
      // Mock data
      setPrescriptions([
        {
          id: 'RX001',
          patientName: 'Amit Sharma',
          patientId: 'PAT001',
          doctorName: 'Dr. Michael Roberts',
          doctorId: 'doc_001',
          date: '2025-12-28',
          diagnosis: 'Type 2 Diabetes Mellitus, Hypertension',
          medications: [
            { name: 'Metformin', dosage: '500mg', frequency: 'Twice daily', duration: '30 days', instructions: 'After meals' },
            { name: 'Amlodipine', dosage: '5mg', frequency: 'Once daily', duration: '30 days', instructions: 'Morning' },
          ],
          notes: 'Monitor blood sugar levels regularly. Follow diabetic diet.',
          followUpDate: '2025-01-28',
          status: 'active'
        },
        {
          id: 'RX002',
          patientName: 'Priya Patel',
          patientId: 'PAT002',
          doctorName: 'Dr. Michael Roberts',
          doctorId: 'doc_001',
          date: '2025-12-27',
          diagnosis: 'Acute Upper Respiratory Infection',
          medications: [
            { name: 'Azithromycin', dosage: '500mg', frequency: 'Once daily', duration: '5 days', instructions: 'After food' },
            { name: 'Paracetamol', dosage: '650mg', frequency: 'As needed', duration: '5 days', instructions: 'For fever' },
            { name: 'Cetirizine', dosage: '10mg', frequency: 'Once daily', duration: '5 days', instructions: 'At bedtime' },
          ],
          notes: 'Rest and plenty of fluids. Come back if symptoms worsen.',
          status: 'active'
        },
        {
          id: 'RX003',
          patientName: 'Rajesh Kumar',
          patientId: 'PAT003',
          doctorName: 'Dr. Michael Roberts',
          doctorId: 'doc_001',
          date: '2025-12-20',
          diagnosis: 'Chronic Gastritis',
          medications: [
            { name: 'Pantoprazole', dosage: '40mg', frequency: 'Once daily', duration: '14 days', instructions: 'Before breakfast' },
            { name: 'Domperidone', dosage: '10mg', frequency: 'Thrice daily', duration: '7 days', instructions: 'Before meals' },
          ],
          followUpDate: '2025-01-05',
          status: 'completed'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const filteredPrescriptions = prescriptions.filter(rx => {
    const matchesSearch = rx.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         rx.diagnosis.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         rx.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || rx.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleViewPrescription = (prescription: Prescription) => {
    setSelectedPrescription(prescription);
    setViewDialogOpen(true);
  };

  const handlePrint = (prescription: Prescription) => {
    toast.success(`Printing prescription ${prescription.id}`);
    // In production, this would trigger actual print functionality
    window.print();
  };

  const handleDownload = (prescription: Prescription) => {
    toast.success(`Downloading prescription ${prescription.id} as PDF`);
    // In production, this would trigger PDF download
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700 border-green-200';
      case 'completed': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'cancelled': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4 md:p-6">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-purple-600" />
              Prescriptions
            </h1>
            <p className="text-muted-foreground mt-1">
              View and manage doctor prescriptions
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-purple-600">{prescriptions.length}</p>
                <p className="text-sm text-muted-foreground">Total Prescriptions</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">
                  {prescriptions.filter(p => p.status === 'active').length}
                </p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600">
                  {prescriptions.filter(p => p.followUpDate).length}
                </p>
                <p className="text-sm text-muted-foreground">With Follow-up</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-orange-600">
                  {prescriptions.filter(p => 
                    new Date(p.date) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                  ).length}
                </p>
                <p className="text-sm text-muted-foreground">This Week</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by patient name, diagnosis, or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Prescriptions List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Prescription Records</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
              </div>
            ) : filteredPrescriptions.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-3" />
                <p className="text-muted-foreground">No prescriptions found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPrescriptions.map((rx) => (
                  <Card key={rx.id} className="hover:shadow-md transition-shadow border-l-4 border-l-purple-500">
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className="bg-purple-100 dark:bg-purple-900 p-3 rounded-full">
                            <Pill className="h-5 w-5 text-purple-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-lg">{rx.patientName}</p>
                              <Badge className={getStatusColor(rx.status)}>
                                {rx.status}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {rx.id}
                              </Badge>
                            </div>
                            <p className="text-sm font-medium text-purple-600 mb-2">
                              {rx.diagnosis}
                            </p>
                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(rx.date).toLocaleDateString()}
                              </span>
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {rx.doctorName}
                              </span>
                              <span className="flex items-center gap-1">
                                <Pill className="h-3 w-3" />
                                {rx.medications.length} medications
                              </span>
                            </div>
                            {rx.followUpDate && (
                              <p className="text-sm mt-2 text-orange-600">
                                Follow-up: {new Date(rx.followUpDate).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewPrescription(rx)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePrint(rx)}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownload(rx)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* View Prescription Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-purple-600" />
                Prescription Details - {selectedPrescription?.id}
              </DialogTitle>
            </DialogHeader>
            
            {selectedPrescription && (
              <div className="space-y-6">
                {/* Patient Info */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">Patient</p>
                    <p className="font-semibold">{selectedPrescription.patientName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Doctor</p>
                    <p className="font-semibold">{selectedPrescription.doctorName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date</p>
                    <p className="font-semibold">{new Date(selectedPrescription.date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge className={getStatusColor(selectedPrescription.status)}>
                      {selectedPrescription.status}
                    </Badge>
                  </div>
                </div>

                {/* Diagnosis */}
                <div>
                  <h4 className="font-semibold mb-2">Diagnosis</h4>
                  <p className="text-purple-600">{selectedPrescription.diagnosis}</p>
                </div>

                {/* Medications */}
                <div>
                  <h4 className="font-semibold mb-2">Medications</h4>
                  <div className="space-y-3">
                    {selectedPrescription.medications.map((med, index) => (
                      <Card key={index}>
                        <CardContent className="py-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-semibold">{med.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {med.dosage} • {med.frequency} • {med.duration}
                              </p>
                              {med.instructions && (
                                <p className="text-sm text-blue-600 mt-1">
                                  Instructions: {med.instructions}
                                </p>
                              )}
                            </div>
                            <Pill className="h-5 w-5 text-purple-400" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                {selectedPrescription.notes && (
                  <div>
                    <h4 className="font-semibold mb-2">Doctor's Notes</h4>
                    <p className="text-sm text-muted-foreground bg-yellow-50 p-3 rounded-lg">
                      {selectedPrescription.notes}
                    </p>
                  </div>
                )}

                {/* Follow-up */}
                {selectedPrescription.followUpDate && (
                  <div className="p-4 bg-orange-50 rounded-lg">
                    <p className="text-sm text-orange-800">
                      <strong>Follow-up Date:</strong> {new Date(selectedPrescription.followUpDate).toLocaleDateString()}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => handlePrint(selectedPrescription)}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print
                  </Button>
                  <Button onClick={() => handleDownload(selectedPrescription)}>
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default AssistantPrescriptions;
