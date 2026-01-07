import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  FileText,
  Plus,
  Download,
  Eye,
  Edit,
  Trash2,
  Search,
  Filter,
  Loader2,
  Send,
  User,
  Calendar,
  Pill,
  Stethoscope,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Mic,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import api from "@/utils/api";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import AIScribe from "@/components/AIScribe";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Medication {
  name: string;
  composition?: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity?: string;
  instructions?: string;
}

interface Vitals {
  bloodPressure?: string;
  pulse?: string;
  temperature?: string;
  weight?: string;
  height?: string;
  spo2?: string;
}

interface Prescription {
  id: number;
  prescriptionNumber?: string;
  prescriptionId?: string;
  appointmentId?: number;
  patientId: number;
  patientName: string;
  patientAge?: number;
  patientGender?: string;
  patientPhone?: string;
  vitals?: Vitals;
  chiefComplaints?: string;
  diagnosis?: string;
  medications: Medication[];
  instructions: string[];
  labTests: string[];
  followUpDate?: string;
  validityDays: number;
  status: "draft" | "issued" | "cancelled" | "expired";
  issuedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface NewPrescription {
  appointmentId?: number;
  patientId: number;
  patientName: string;
  patientAge?: number;
  patientGender?: string;
  patientPhone?: string;
  vitals?: Vitals;
  chiefComplaints?: string;
  diagnosis?: string;
  medications: Medication[];
  instructions: string[];
  labTests: string[];
  followUpDate?: string;
  validityDays: number;
  notes?: string;
}

const emptyMedication: Medication = {
  name: "",
  composition: "",
  dosage: "",
  frequency: "",
  duration: "",
  quantity: "",
  instructions: "",
};

const emptyPrescription: NewPrescription = {
  patientId: 0,
  patientName: "",
  patientAge: undefined,
  patientGender: undefined,
  patientPhone: "",
  vitals: {
    bloodPressure: "",
    pulse: "",
    temperature: "",
    weight: "",
    height: "",
    spo2: "",
  },
  chiefComplaints: "",
  diagnosis: "",
  medications: [{ ...emptyMedication }],
  instructions: [""],
  labTests: [],
  followUpDate: "",
  validityDays: 30,
  notes: "",
};

const DoctorPrescriptions = () => {
  const { toast } = useToast();
  const { currentDoctor } = useAuth();
  const queryClient = useQueryClient();

  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [formData, setFormData] = useState<NewPrescription>({ ...emptyPrescription });
  const [showScribe, setShowScribe] = useState(false);
  const [currentScribeField, setCurrentScribeField] = useState<string>("diagnosis");

  // Check for imported prescription from AI recording
  useEffect(() => {
    const importedData = localStorage.getItem('importedPrescription');
    if (importedData) {
      try {
        const prescriptionData = JSON.parse(importedData);
        
        // Map AI prescription data to form format
        const mappedFormData: NewPrescription = {
          ...emptyPrescription,
          chiefComplaints: prescriptionData.chiefComplaints?.join(', ') || '',
          diagnosis: prescriptionData.diagnosis || '',
          medications: prescriptionData.medications?.map((med: any) => ({
            name: med.name || '',
            composition: '',
            dosage: med.dosage || '',
            frequency: med.frequency || '',
            duration: med.duration || '',
            quantity: '',
            instructions: med.instructions || ''
          })) || [{ ...emptyMedication }],
          labTests: prescriptionData.labTests || [],
          instructions: prescriptionData.followUpInstructions 
            ? [prescriptionData.followUpInstructions]
            : [''],
          followUpDate: prescriptionData.followUpDate || '',
        };
        
        setFormData(mappedFormData);
        setCreateDialogOpen(true);
        localStorage.removeItem('importedPrescription');
        
        toast({
          title: "✨ AI Prescription Imported!",
          description: "Review and edit the AI-generated prescription before saving",
        });
      } catch (error) {
        console.error('Failed to import prescription:', error);
        localStorage.removeItem('importedPrescription');
      }
    }
  }, []);

  // Fetch prescriptions
  const { data: prescriptions = [], isLoading, refetch } = useQuery({
    queryKey: ["doctorPrescriptions", currentDoctor?.id],
    queryFn: async () => {
      const { data } = await api.get("/prescriptions/doctor");
      return (data as any).prescriptions || data || [];
    },
    enabled: !!currentDoctor?.id,
  });

  // Fetch appointments for linking
  const { data: appointments = [] } = useQuery({
    queryKey: ["doctorAppointmentsForPrescription", currentDoctor?.id],
    queryFn: async () => {
      const { data } = await api.get("/enhanced-appointments/doctor-appointments");
      return (data as any).appointments || data || [];
    },
    enabled: !!currentDoctor?.id,
  });

  // Create prescription mutation
  const createPrescriptionMutation = useMutation({
    mutationFn: async (data: NewPrescription) => {
      const response = await api.post("/prescriptions", data);
      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Prescription Created",
        description: "Prescription has been saved as draft.",
      });
      queryClient.invalidateQueries({ queryKey: ["doctorPrescriptions"] });
      setCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to create prescription",
        variant: "destructive",
      });
    },
  });

  // Update prescription mutation
  const updatePrescriptionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<NewPrescription> }) => {
      const response = await api.put(`/prescriptions/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Prescription Updated",
        description: "Changes have been saved.",
      });
      queryClient.invalidateQueries({ queryKey: ["doctorPrescriptions"] });
      setViewDialogOpen(false);
      setEditMode(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to update prescription",
        variant: "destructive",
      });
    },
  });

  // Issue prescription mutation
  const issuePrescriptionMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await api.post(`/prescriptions/${id}/issue`);
      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Prescription Issued",
        description: "Prescription has been issued to the patient.",
      });
      queryClient.invalidateQueries({ queryKey: ["doctorPrescriptions"] });
      setViewDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to issue prescription",
        variant: "destructive",
      });
    },
  });

  // Delete prescription mutation
  const deletePrescriptionMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await api.delete(`/prescriptions/${id}`);
      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Prescription Deleted",
        description: "Prescription has been removed.",
      });
      queryClient.invalidateQueries({ queryKey: ["doctorPrescriptions"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to delete prescription",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({ ...emptyPrescription });
    setEditMode(false);
  };

  const handleCreatePrescription = () => {
    if (!formData.patientName.trim()) {
      toast({
        title: "Validation Error",
        description: "Patient name is required",
        variant: "destructive",
      });
      return;
    }
    if (formData.medications.length === 0 || !formData.medications[0].name.trim()) {
      toast({
        title: "Validation Error",
        description: "At least one medication is required",
        variant: "destructive",
      });
      return;
    }
    createPrescriptionMutation.mutate(formData);
  };

  const handleUpdatePrescription = () => {
    if (!selectedPrescription) return;
    updatePrescriptionMutation.mutate({
      id: selectedPrescription.id,
      data: formData,
    });
  };

  const handleIssuePrescription = (id: number) => {
    if (window.confirm("Are you sure you want to issue this prescription? Once issued, it cannot be modified.")) {
      issuePrescriptionMutation.mutate(id);
    }
  };

  const handleDeletePrescription = (id: number) => {
    if (window.confirm("Are you sure you want to delete this prescription?")) {
      deletePrescriptionMutation.mutate(id);
    }
  };

  const handleDownloadPDF = async (id: number) => {
    try {
      const response = await api.get(`/prescriptions/${id}/pdf`, {
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `prescription-${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast({
        title: "Downloaded",
        description: "Prescription PDF downloaded successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to download PDF",
        variant: "destructive",
      });
    }
  };

  const openViewDialog = (prescription: Prescription) => {
    setSelectedPrescription(prescription);
    setFormData({
      ...emptyPrescription,
      appointmentId: prescription.appointmentId,
      patientId: prescription.patientId,
      patientName: prescription.patientName,
      patientAge: prescription.patientAge,
      patientGender: prescription.patientGender,
      patientPhone: prescription.patientPhone,
      vitals: prescription.vitals || {},
      chiefComplaints: prescription.chiefComplaints,
      diagnosis: prescription.diagnosis,
      medications: prescription.medications?.length ? prescription.medications : [{ ...emptyMedication }],
      instructions: prescription.instructions?.length ? prescription.instructions : [""],
      labTests: prescription.labTests || [],
      followUpDate: prescription.followUpDate || "",
      validityDays: prescription.validityDays,
    });
    setViewDialogOpen(true);
  };

  const addMedication = () => {
    setFormData({
      ...formData,
      medications: [...formData.medications, { ...emptyMedication }],
    });
  };

  const removeMedication = (index: number) => {
    if (formData.medications.length > 1) {
      const newMedications = [...formData.medications];
      newMedications.splice(index, 1);
      setFormData({ ...formData, medications: newMedications });
    }
  };

  const updateMedication = (index: number, field: keyof Medication, value: string) => {
    const newMedications = [...formData.medications];
    newMedications[index] = { ...newMedications[index], [field]: value };
    setFormData({ ...formData, medications: newMedications });
  };

  const addInstruction = () => {
    setFormData({
      ...formData,
      instructions: [...formData.instructions, ""],
    });
  };

  const removeInstruction = (index: number) => {
    if (formData.instructions.length > 1) {
      const newInstructions = [...formData.instructions];
      newInstructions.splice(index, 1);
      setFormData({ ...formData, instructions: newInstructions });
    }
  };

  const updateInstruction = (index: number, value: string) => {
    const newInstructions = [...formData.instructions];
    newInstructions[index] = value;
    setFormData({ ...formData, instructions: newInstructions });
  };

  const addLabTest = () => {
    setFormData({
      ...formData,
      labTests: [...formData.labTests, ""],
    });
  };

  const removeLabTest = (index: number) => {
    const newTests = [...formData.labTests];
    newTests.splice(index, 1);
    setFormData({ ...formData, labTests: newTests });
  };

  const updateLabTest = (index: number, value: string) => {
    const newTests = [...formData.labTests];
    newTests[index] = value;
    setFormData({ ...formData, labTests: newTests });
  };

  const loadPatientFromAppointment = (appointmentId: string) => {
    const appointment = appointments.find((a: any) => a.id === parseInt(appointmentId));
    if (appointment) {
      setFormData({
        ...formData,
        appointmentId: appointment.id,
        patientId: appointment.userId,
        patientName: appointment.patientName,
        patientPhone: appointment.patientPhone,
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
      draft: { variant: "secondary", icon: Clock },
      issued: { variant: "default", icon: CheckCircle },
      cancelled: { variant: "destructive", icon: XCircle },
      expired: { variant: "outline", icon: AlertCircle },
    };
    const { variant, icon: Icon } = styles[status] || styles.draft;
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Filter prescriptions
  const filteredPrescriptions = prescriptions.filter((rx: Prescription) => {
    const rxNumber = rx.prescriptionId || rx.prescriptionNumber || '';
    const matchesSearch =
      rx.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rxNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || rx.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <MainLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <FileText className="h-8 w-8 text-blue-600" />
              Prescriptions
            </h1>
            <p className="text-muted-foreground mt-1">
              Create, manage, and issue prescriptions to your patients
            </p>
          </div>
          <Button onClick={() => { resetForm(); setCreateDialogOpen(true); }} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Prescription
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <h3 className="text-2xl font-bold">{prescriptions.length}</h3>
                </div>
                <FileText className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Drafts</p>
                  <h3 className="text-2xl font-bold">
                    {prescriptions.filter((rx: Prescription) => rx.status === "draft").length}
                  </h3>
                </div>
                <Clock className="h-8 w-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Issued</p>
                  <h3 className="text-2xl font-bold">
                    {prescriptions.filter((rx: Prescription) => rx.status === "issued").length}
                  </h3>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">This Month</p>
                  <h3 className="text-2xl font-bold">
                    {prescriptions.filter((rx: Prescription) => {
                      const created = new Date(rx.createdAt);
                      const now = new Date();
                      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
                    }).length}
                  </h3>
                </div>
                <Calendar className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by patient name or prescription number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="issued">Issued</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Prescriptions List */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : filteredPrescriptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No prescriptions found</h3>
                <p className="text-muted-foreground">
                  {searchQuery ? "Try adjusting your search" : "Create your first prescription to get started"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rx #</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Diagnosis</TableHead>
                    <TableHead>Medications</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPrescriptions.map((rx: Prescription) => (
                    <TableRow key={rx.id}>
                      <TableCell className="font-mono text-sm">{rx.prescriptionId || rx.prescriptionNumber || `RX-${rx.id}`}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{rx.patientName}</p>
                            {rx.patientAge && (
                              <p className="text-xs text-muted-foreground">
                                {rx.patientAge} yrs, {rx.patientGender}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{rx.diagnosis || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="flex items-center gap-1 w-fit">
                          <Pill className="h-3 w-3" />
                          {rx.medications?.length || 0} meds
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(rx.status)}</TableCell>
                      <TableCell>{format(new Date(rx.createdAt), "MMM dd, yyyy")}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openViewDialog(rx)} title="View">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {rx.status === "draft" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleIssuePrescription(rx.id)}
                              title="Issue"
                              className="text-green-600 hover:text-green-700"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => handleDownloadPDF(rx.id)} title="Download PDF">
                            <Download className="h-4 w-4" />
                          </Button>
                          {rx.status === "draft" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeletePrescription(rx.id)}
                              title="Delete"
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create Prescription Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Create New Prescription
              </DialogTitle>
              <DialogDescription>
                Fill in the prescription details. You can save as draft and issue later.
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="patient" className="w-full">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto">
                <TabsTrigger value="patient" className="text-xs sm:text-sm py-1.5 sm:py-2">Patient</TabsTrigger>
                <TabsTrigger value="vitals" className="text-xs sm:text-sm py-1.5 sm:py-2">Vitals</TabsTrigger>
                <TabsTrigger value="diagnosis" className="text-xs sm:text-sm py-1.5 sm:py-2">Diagnosis</TabsTrigger>
                <TabsTrigger value="medications" className="text-xs sm:text-sm py-1.5 sm:py-2">Medications</TabsTrigger>
              </TabsList>

              <TabsContent value="patient" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label>Link to Appointment (Optional)</Label>
                    <Select onValueChange={loadPatientFromAppointment}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an appointment" />
                      </SelectTrigger>
                      <SelectContent>
                        {appointments
                          .filter((a: any) => a.status === "confirmed" || a.status === "completed")
                          .map((a: any) => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              {a.patientName} - {format(new Date(a.appointmentDate), "MMM dd, yyyy")}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Patient Name *</Label>
                    <Input
                      value={formData.patientName}
                      onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
                      placeholder="Enter patient name"
                    />
                  </div>
                  <div>
                    <Label>Phone Number</Label>
                    <Input
                      value={formData.patientPhone}
                      onChange={(e) => setFormData({ ...formData, patientPhone: e.target.value })}
                      placeholder="Enter phone number"
                    />
                  </div>
                  <div>
                    <Label>Age</Label>
                    <Input
                      type="number"
                      value={formData.patientAge || ""}
                      onChange={(e) => setFormData({ ...formData, patientAge: parseInt(e.target.value) || undefined })}
                      placeholder="Age in years"
                    />
                  </div>
                  <div>
                    <Label>Gender</Label>
                    <Select
                      value={formData.patientGender}
                      onValueChange={(value) => setFormData({ ...formData, patientGender: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="vitals" className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Blood Pressure</Label>
                    <Input
                      value={formData.vitals?.bloodPressure || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          vitals: { ...formData.vitals, bloodPressure: e.target.value },
                        })
                      }
                      placeholder="e.g., 120/80"
                    />
                  </div>
                  <div>
                    <Label>Pulse (bpm)</Label>
                    <Input
                      value={formData.vitals?.pulse || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          vitals: { ...formData.vitals, pulse: e.target.value },
                        })
                      }
                      placeholder="e.g., 72"
                    />
                  </div>
                  <div>
                    <Label>Temperature (°F)</Label>
                    <Input
                      value={formData.vitals?.temperature || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          vitals: { ...formData.vitals, temperature: e.target.value },
                        })
                      }
                      placeholder="e.g., 98.6"
                    />
                  </div>
                  <div>
                    <Label>Weight (kg)</Label>
                    <Input
                      value={formData.vitals?.weight || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          vitals: { ...formData.vitals, weight: e.target.value },
                        })
                      }
                      placeholder="e.g., 70"
                    />
                  </div>
                  <div>
                    <Label>Height (cm)</Label>
                    <Input
                      value={formData.vitals?.height || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          vitals: { ...formData.vitals, height: e.target.value },
                        })
                      }
                      placeholder="e.g., 175"
                    />
                  </div>
                  <div>
                    <Label>SpO2 (%)</Label>
                    <Input
                      value={formData.vitals?.spo2 || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          vitals: { ...formData.vitals, spo2: e.target.value },
                        })
                      }
                      placeholder="e.g., 98"
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="diagnosis" className="space-y-4">
                {/* AI Scribe Toggle */}
                <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="flex items-center gap-2">
                    <Mic className="h-4 w-4 text-purple-600" />
                    <span className="text-sm font-medium text-purple-900">AI Medical Scribe</span>
                  </div>
                  <Button
                    type="button"
                    variant={showScribe ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowScribe(!showScribe)}
                    className={showScribe ? "bg-purple-600 hover:bg-purple-700" : ""}
                  >
                    {showScribe ? "Hide Scribe" : "Enable Scribe"}
                  </Button>
                </div>

                {/* AI Scribe Component */}
                {showScribe && (
                  <AIScribe
                    onTranscript={(text, field) => {
                      if (field === "chiefComplaints") {
                        setFormData({ ...formData, chiefComplaints: formData.chiefComplaints + " " + text });
                      } else if (field === "diagnosis") {
                        setFormData({ ...formData, diagnosis: formData.diagnosis + " " + text });
                      }
                    }}
                    onSuggestion={(suggestion) => {
                      // Handle AI suggestions
                      console.log("AI Suggestion:", suggestion);
                    }}
                    context="prescription"
                    currentField={currentScribeField}
                  />
                )}

                <div>
                  <Label className="flex items-center gap-2">
                    Chief Complaints
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCurrentScribeField("chiefComplaints");
                        setShowScribe(true);
                      }}
                      className="h-6 text-purple-600"
                    >
                      <Mic className="h-3 w-3" />
                    </Button>
                  </Label>
                  <Textarea
                    value={formData.chiefComplaints}
                    onChange={(e) => setFormData({ ...formData, chiefComplaints: e.target.value })}
                    placeholder="Enter patient's chief complaints..."
                    rows={3}
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-2">
                    Diagnosis
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCurrentScribeField("diagnosis");
                        setShowScribe(true);
                      }}
                      className="h-6 text-purple-600"
                    >
                      <Mic className="h-3 w-3" />
                    </Button>
                  </Label>
                  <Textarea
                    value={formData.diagnosis}
                    onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                    placeholder="Enter diagnosis..."
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Follow-up Date</Label>
                    <Input
                      type="date"
                      value={formData.followUpDate}
                      onChange={(e) => setFormData({ ...formData, followUpDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Validity (Days)</Label>
                    <Input
                      type="number"
                      value={formData.validityDays}
                      onChange={(e) => setFormData({ ...formData, validityDays: parseInt(e.target.value) || 30 })}
                    />
                  </div>
                </div>
                {/* Lab Tests */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <Label>Lab Tests Advised</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addLabTest}>
                      <Plus className="h-4 w-4 mr-1" /> Add Test
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {formData.labTests.map((test, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={test}
                          onChange={(e) => updateLabTest(index, e.target.value)}
                          placeholder="e.g., CBC, LFT, Blood Sugar"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLabTest(index)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Instructions */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <Label>Instructions & Precautions</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addInstruction}>
                      <Plus className="h-4 w-4 mr-1" /> Add
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {formData.instructions.map((inst, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={inst}
                          onChange={(e) => updateInstruction(index, e.target.value)}
                          placeholder="Enter instruction..."
                        />
                        {formData.instructions.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeInstruction(index)}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="medications" className="space-y-4">
                {/* AI Scribe for Medications */}
                {showScribe && currentScribeField === "medications" && (
                  <AIScribe
                    onTranscript={(text, field) => {
                      // Smart medication parsing
                      const medText = text.trim();
                      if (medText) {
                        const newMed = {
                          name: medText,
                          dosage: "",
                          frequency: "BD",
                          duration: "7 days",
                          instructions: "After meals",
                          composition: "",
                          quantity: "",
                        };
                        setFormData({
                          ...formData,
                          medications: [...formData.medications, newMed],
                        });
                      }
                    }}
                    onSuggestion={(suggestion) => {
                      console.log("Medication Suggestion:", suggestion);
                    }}
                    context="medications"
                    currentField="medications"
                  />
                )}

                <div className="flex justify-between items-center">
                  <Label className="text-lg font-semibold flex items-center gap-2">
                    Medications
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCurrentScribeField("medications");
                        setShowScribe(true);
                      }}
                      className="h-6 text-purple-600"
                    >
                      <Mic className="h-3 w-3" />
                    </Button>
                  </Label>
                  <Button type="button" variant="outline" size="sm" onClick={addMedication}>
                    <Plus className="h-4 w-4 mr-1" /> Add Medication
                  </Button>
                </div>
                <div className="space-y-4">
                  {formData.medications.map((med, index) => (
                    <Card key={index} className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="font-medium flex items-center gap-2">
                          <Pill className="h-4 w-4 text-blue-600" />
                          Medication #{index + 1}
                        </h4>
                        {formData.medications.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeMedication(index)}
                            className="text-red-600 h-8 w-8"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2">
                          <Label>Medicine Name *</Label>
                          <Input
                            value={med.name}
                            onChange={(e) => updateMedication(index, "name", e.target.value)}
                            placeholder="e.g., Paracetamol 500mg"
                          />
                        </div>
                        <div>
                          <Label>Composition</Label>
                          <Input
                            value={med.composition}
                            onChange={(e) => updateMedication(index, "composition", e.target.value)}
                            placeholder="e.g., Tab"
                          />
                        </div>
                        <div>
                          <Label>Dosage</Label>
                          <Input
                            value={med.dosage}
                            onChange={(e) => updateMedication(index, "dosage", e.target.value)}
                            placeholder="e.g., 1 tablet"
                          />
                        </div>
                        <div>
                          <Label>Frequency</Label>
                          <Select
                            value={med.frequency}
                            onValueChange={(value) => updateMedication(index, "frequency", value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Once daily">Once daily</SelectItem>
                              <SelectItem value="Twice daily">Twice daily</SelectItem>
                              <SelectItem value="Three times daily">Three times daily</SelectItem>
                              <SelectItem value="Four times daily">Four times daily</SelectItem>
                              <SelectItem value="Every 4 hours">Every 4 hours</SelectItem>
                              <SelectItem value="Every 6 hours">Every 6 hours</SelectItem>
                              <SelectItem value="Every 8 hours">Every 8 hours</SelectItem>
                              <SelectItem value="As needed">As needed</SelectItem>
                              <SelectItem value="At bedtime">At bedtime</SelectItem>
                              <SelectItem value="Before meals">Before meals</SelectItem>
                              <SelectItem value="After meals">After meals</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Duration</Label>
                          <Input
                            value={med.duration}
                            onChange={(e) => updateMedication(index, "duration", e.target.value)}
                            placeholder="e.g., 5 days"
                          />
                        </div>
                        <div>
                          <Label>Quantity</Label>
                          <Input
                            value={med.quantity}
                            onChange={(e) => updateMedication(index, "quantity", e.target.value)}
                            placeholder="e.g., 10 tabs"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label>Special Instructions</Label>
                          <Input
                            value={med.instructions}
                            onChange={(e) => updateMedication(index, "instructions", e.target.value)}
                            placeholder="e.g., Take with food"
                          />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreatePrescription}
                disabled={createPrescriptionMutation.isPending}
              >
                {createPrescriptionMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Save as Draft
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View/Edit Prescription Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Prescription #{selectedPrescription?.prescriptionNumber || selectedPrescription?.id}
                {selectedPrescription && getStatusBadge(selectedPrescription.status)}
              </DialogTitle>
              <DialogDescription>
                {editMode ? "Edit prescription details" : "View prescription details"}
              </DialogDescription>
            </DialogHeader>

            {selectedPrescription && (
              <div className="space-y-6">
                {/* Patient Info */}
                <Card className="p-4 bg-slate-50">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Patient</p>
                      <p className="font-medium">{selectedPrescription.patientName}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Age/Gender</p>
                      <p className="font-medium">
                        {selectedPrescription.patientAge || "-"} yrs / {selectedPrescription.patientGender || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Phone</p>
                      <p className="font-medium">{selectedPrescription.patientPhone || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Date</p>
                      <p className="font-medium">{format(new Date(selectedPrescription.createdAt), "MMM dd, yyyy")}</p>
                    </div>
                  </div>
                </Card>

                {/* Vitals */}
                {selectedPrescription.vitals && Object.values(selectedPrescription.vitals).some(v => v) && (
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Stethoscope className="h-4 w-4" /> Vitals
                    </h4>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                      {selectedPrescription.vitals.bloodPressure && (
                        <Card className="p-3 text-center">
                          <p className="text-xs text-muted-foreground">BP</p>
                          <p className="font-bold">{selectedPrescription.vitals.bloodPressure}</p>
                        </Card>
                      )}
                      {selectedPrescription.vitals.pulse && (
                        <Card className="p-3 text-center">
                          <p className="text-xs text-muted-foreground">Pulse</p>
                          <p className="font-bold">{selectedPrescription.vitals.pulse} bpm</p>
                        </Card>
                      )}
                      {selectedPrescription.vitals.temperature && (
                        <Card className="p-3 text-center">
                          <p className="text-xs text-muted-foreground">Temp</p>
                          <p className="font-bold">{selectedPrescription.vitals.temperature}°F</p>
                        </Card>
                      )}
                      {selectedPrescription.vitals.weight && (
                        <Card className="p-3 text-center">
                          <p className="text-xs text-muted-foreground">Weight</p>
                          <p className="font-bold">{selectedPrescription.vitals.weight} kg</p>
                        </Card>
                      )}
                    </div>
                  </div>
                )}

                {/* Diagnosis */}
                <div>
                  <h4 className="font-semibold mb-2">Chief Complaints</h4>
                  <p className="text-muted-foreground bg-yellow-50 p-3 rounded border-l-4 border-yellow-400">
                    {selectedPrescription.chiefComplaints || "Not specified"}
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Diagnosis</h4>
                  <p className="text-muted-foreground bg-blue-50 p-3 rounded border-l-4 border-blue-400">
                    {selectedPrescription.diagnosis || "Not specified"}
                  </p>
                </div>

                {/* Medications */}
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Pill className="h-4 w-4" /> Medications ({selectedPrescription.medications?.length || 0})
                  </h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Medicine</TableHead>
                        <TableHead>Dosage</TableHead>
                        <TableHead>Frequency</TableHead>
                        <TableHead>Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedPrescription.medications?.map((med, i) => (
                        <TableRow key={i}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell className="font-medium">{med.name}</TableCell>
                          <TableCell>{med.dosage}</TableCell>
                          <TableCell>{med.frequency}</TableCell>
                          <TableCell>{med.duration}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Instructions */}
                {selectedPrescription.instructions?.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Instructions</h4>
                    <ul className="space-y-1">
                      {selectedPrescription.instructions.map((inst, i) => (
                        <li key={i} className="flex items-start gap-2 bg-green-50 p-2 rounded">
                          <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                          <span>{inst}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Lab Tests */}
                {selectedPrescription.labTests?.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Lab Tests Advised</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedPrescription.labTests.map((test, i) => (
                        <Badge key={i} variant="outline" className="bg-red-50">
                          🔬 {test}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Follow-up */}
                {selectedPrescription.followUpDate && (
                  <Card className="p-4 bg-blue-50 border-blue-200">
                    <p className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-blue-600" />
                      <span className="font-medium">Follow-up:</span>
                      {format(new Date(selectedPrescription.followUpDate), "MMMM dd, yyyy")}
                    </p>
                  </Card>
                )}
              </div>
            )}

            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
                Close
              </Button>
              <Button variant="outline" onClick={() => handleDownloadPDF(selectedPrescription!.id)}>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
              {selectedPrescription?.status === "draft" && (
                <>
                  <Button
                    onClick={() => handleIssuePrescription(selectedPrescription.id)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Issue Prescription
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default DoctorPrescriptions;
