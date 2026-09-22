import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { PrescriptionCard } from "@/components/doctor/PrescriptionCard";
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
import { useAutosave } from "@/hooks/useAutosave";
import { useAuth } from "@/auth/AuthProvider";
import api from "@/utils/api";
import { downloadPrescriptionPdf } from "@/utils/pdfDownload";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import AIScribe from "@/components/AIScribe";
import OfflineScribePanel from "@/components/OfflineScribePanel";
import { PrescriptionSafetyAlert, isSafetyBlockError, safetyItemsFromError, type SafetyItem } from "@/components/clinical/PrescriptionSafetyAlert";
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
  const [issueSafetyBlockers, setIssueSafetyBlockers] = useState<SafetyItem[]>([]);
  const [issueSafetyWarnings, setIssueSafetyWarnings] = useState<SafetyItem[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [formData, setFormData] = useState<NewPrescription>({ ...emptyPrescription });
  const [showScribe, setShowScribe] = useState(false);
  const [currentScribeField, setCurrentScribeField] = useState<string>("diagnosis");
  const [pgxMedication, setPgxMedication] = useState('');
  const [pgxResult, setPgxResult] = useState<any>(null);
  const [pgxLoading, setPgxLoading] = useState(false);
  const prescriptionAutosave = useAutosave({
    key: 'doctor_prescription_draft',
    value: formData,
    save: async () => Promise.resolve(),
  });

  useEffect(() => {
    if (!createDialogOpen) return;
    const restored = prescriptionAutosave.restore();
    if (restored) setFormData(restored);
  }, [createDialogOpen]);

  const getErrorMessage = (error: any, fallback: string) => {
    return (
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.response?.data?.errors?.[0]?.msg ||
      fallback
    );
  };

  // Check for imported prescription from AI recording or offline scribe
  useEffect(() => {
    const importedData = localStorage.getItem('importedPrescription');
    if (importedData) {
      try {
        const prescriptionData = JSON.parse(importedData);

        // Normalize: OfflineScribePanel returns { diagnosis, medications, instructions, labTests, ... }
        // TranscriptionViewer returns { chiefComplaints: [], followUpInstructions, followUpDate, ... }
        const chiefRaw = prescriptionData.chiefComplaints;
        const chiefStr = Array.isArray(chiefRaw)
          ? chiefRaw.join(', ')
          : (typeof chiefRaw === 'string' ? chiefRaw : '');

        const instrRaw = prescriptionData.instructions || prescriptionData.followUpInstructions;
        const instrArr = Array.isArray(instrRaw)
          ? instrRaw.filter(Boolean)
          : (instrRaw ? [instrRaw] : ['']);

        const labRaw = prescriptionData.labTests || prescriptionData.lab_tests || [];
        const labArr = Array.isArray(labRaw)
          ? labRaw.map((t: any) => (typeof t === 'string' ? t : t.testName || t.name || t))
          : [];

        const mappedFormData: NewPrescription = {
          ...emptyPrescription,
          chiefComplaints: chiefStr,
          diagnosis: prescriptionData.diagnosis || '',
          medications: prescriptionData.medications?.map((med: any) => ({
            name: med.name || '',
            composition: med.composition || '',
            dosage: med.dosage || '',
            frequency: med.frequency || '',
            duration: med.duration || '',
            quantity: med.quantity || '',
            instructions: med.instructions || ''
          })) || [{ ...emptyMedication }],
          labTests: labArr,
          instructions: instrArr.length ? instrArr : [''],
          followUpDate: prescriptionData.followUpDate || prescriptionData.follow_up_date || '',
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
      // Invalidate both prescriptions and appointments to refresh patient list
      queryClient.invalidateQueries({ queryKey: ["doctorPrescriptions"] });
      queryClient.invalidateQueries({ queryKey: ["doctorAppointmentsForPrescription"] });
      setCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: getErrorMessage(error, "Failed to create prescription"),
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
      // Invalidate both prescriptions and appointments to refresh patient list
      queryClient.invalidateQueries({ queryKey: ["doctorPrescriptions"] });
      queryClient.invalidateQueries({ queryKey: ["doctorAppointmentsForPrescription"] });
      setViewDialogOpen(false);
      setEditMode(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: getErrorMessage(error, "Failed to update prescription"),
        variant: "destructive",
      });
    },
  });

  // Issue prescription mutation. Issuing is the safety-gated write (server/routes/prescription.route.js
  // safetyOnStatus) — in enforce mode a documented allergy/interaction can come back as a 409 SAFETY_BLOCK,
  // which the second call below overrides once the doctor has reviewed and acknowledged it.
  const issuePrescriptionMutation = useMutation({
    mutationFn: async ({ id, override }: { id: number; override?: { reason: string; acknowledgedCodes: string[] } }) => {
      const response = await api.patch(`/prescriptions/${id}/status`, { status: "issued", ...(override ? { safetyOverride: override } : {}) });
      return response.data;
    },
    onSuccess: (data) => {
      setIssueSafetyBlockers([]);
      setIssueSafetyWarnings([]);
      const pdfUrl = data?.pdfUrl;
      toast({
        title: "✅ Prescription Issued",
        description: "Prescription has been issued. Patient notified via WhatsApp & email.",
      });
      // Open PDF in new tab so doctor can verify/print
      if (pdfUrl) {
        setTimeout(() => window.open(pdfUrl, "_blank"), 300);
      }
      // Invalidate both prescriptions and appointments to refresh patient list
      queryClient.invalidateQueries({ queryKey: ["doctorPrescriptions"] });
      queryClient.invalidateQueries({ queryKey: ["doctorAppointmentsForPrescription"] });
      setViewDialogOpen(false);
    },
    onError: (error: any) => {
      if (isSafetyBlockError(error)) {
        const { blockers, warnings } = safetyItemsFromError(error);
        setIssueSafetyBlockers(blockers);
        setIssueSafetyWarnings(warnings);
        toast({
          title: "Safety check",
          description: error.response?.data?.message || "Review the safety alerts below before issuing.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Error",
        description: getErrorMessage(error, "Failed to issue prescription"),
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
      // Invalidate both prescriptions and appointments to refresh patient list
      queryClient.invalidateQueries({ queryKey: ["doctorPrescriptions"] });
      queryClient.invalidateQueries({ queryKey: ["doctorAppointmentsForPrescription"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: getErrorMessage(error, "Failed to delete prescription"),
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({ ...emptyPrescription });
    setEditMode(false);
  };

  const validateMedications = (medications: Medication[]): string | null => {
    if (medications.length === 0) return "At least one medication is required";
    
    for (let i = 0; i < medications.length; i++) {
      const med = medications[i];
      if (!med.name?.trim()) return `Medication ${i + 1}: Medicine name is required`;
      if (!med.dosage?.trim()) return `Medication ${i + 1}: Dosage is required`;
      if (!med.frequency?.trim()) return `Medication ${i + 1}: Frequency is required`;
      if (!med.duration?.trim()) return `Medication ${i + 1}: Duration is required`;
    }
    return null;
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
    if (!formData.diagnosis.trim()) {
      toast({
        title: "Validation Error",
        description: "Diagnosis is required",
        variant: "destructive",
      });
      return;
    }
    
    const medicationError = validateMedications(formData.medications);
    if (medicationError) {
      toast({
        title: "Validation Error",
        description: medicationError,
        variant: "destructive",
      });
      return;
    }
    
    createPrescriptionMutation.mutate(formData);
  };

  const handleUpdatePrescription = () => {
    if (!selectedPrescription) return;
    
    if (!formData.patientName.trim()) {
      toast({
        title: "Validation Error",
        description: "Patient name is required",
        variant: "destructive",
      });
      return;
    }
    if (!formData.diagnosis.trim()) {
      toast({
        title: "Validation Error",
        description: "Diagnosis is required",
        variant: "destructive",
      });
      return;
    }
    
    const medicationError = validateMedications(formData.medications);
    if (medicationError) {
      toast({
        title: "Validation Error",
        description: medicationError,
        variant: "destructive",
      });
      return;
    }
    
    updatePrescriptionMutation.mutate({
      id: selectedPrescription.id,
      data: formData,
    });
  };

  const handleIssuePrescription = (id: number) => {
    if (window.confirm("Are you sure you want to issue this prescription? Once issued, it cannot be modified.")) {
      setIssueSafetyBlockers([]);
      setIssueSafetyWarnings([]);
      issuePrescriptionMutation.mutate({ id });
    }
  };

  const handleDeletePrescription = (id: number) => {
    if (window.confirm("Are you sure you want to delete this prescription?")) {
      deletePrescriptionMutation.mutate(id);
    }
  };

  const handleDownloadPDF = async (id: number) => {
    try {
      await downloadPrescriptionPdf(api, id, `prescription-${id}.pdf`);
      toast({
        title: "Downloaded",
        description: "Prescription PDF downloaded successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to download PDF",
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

  const checkPharmacogenomics = async () => {
    if (!formData.patientId || !pgxMedication.trim()) { toast({ title: 'Missing details', description: 'Patient ID and medication are required for PGx review.', variant: 'destructive' }); return; }
    try { setPgxLoading(true); const response = await api.post('/roadmap-intelligence/pgx/check', { patientId: formData.patientId, medication: pgxMedication.trim() }); setPgxResult(response.data?.data ?? null); }
    catch (error: any) { toast({ title: 'PGx check failed', description: error.response?.data?.message || 'Unable to complete pharmacogenomics check.', variant: 'destructive' }); }
    finally { setPgxLoading(false); }
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
          <div className="flex gap-2">
            <Button onClick={() => { resetForm(); setCreateDialogOpen(true); }} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Prescription
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total", value: prescriptions.length, icon: FileText, from: "from-blue-500", to: "to-indigo-600", bg: "bg-blue-50 dark:bg-blue-900/20" },
            { label: "Drafts", value: prescriptions.filter((rx: Prescription) => rx.status === "draft").length, icon: Clock, from: "from-amber-400", to: "to-orange-500", bg: "bg-amber-50 dark:bg-amber-900/20" },
            { label: "Issued", value: prescriptions.filter((rx: Prescription) => rx.status === "issued" || rx.status === "active").length, icon: CheckCircle, from: "from-emerald-500", to: "to-teal-600", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
            { label: "This Month", value: prescriptions.filter((rx: Prescription) => { const d = new Date(rx.createdAt); const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }).length, icon: Calendar, from: "from-purple-500", to: "to-violet-600", bg: "bg-purple-50 dark:bg-purple-900/20" },
          ].map(({ label, value, icon: Icon, from, to, bg }) => (
            <Card key={label} className="border-0 shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <div className={`${bg} px-5 py-4 flex items-center justify-between`}>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                    <p className="text-3xl font-bold text-slate-800 dark:text-white">{value}</p>
                  </div>
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${from} ${to} shadow-sm`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                </div>
                <div className={`h-1 w-full bg-gradient-to-r ${from} ${to}`} />
              </CardContent>
            </Card>
          ))}
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

        {/* Prescriptions Card Grid */}
        {isLoading ? (
          <div className="flex justify-center items-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : filteredPrescriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-50 dark:bg-slate-800/30 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
            <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
              <FileText className="h-10 w-10 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">No prescriptions found</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
              {searchQuery ? "Try adjusting your search or filter" : "Create your first prescription to get started"}
            </p>
            {!searchQuery && (
              <Button className="mt-5 gap-2" onClick={() => { resetForm(); setCreateDialogOpen(true); }}>
                <Plus className="h-4 w-4" /> New Prescription
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredPrescriptions.map((rx: Prescription) => (
              <PrescriptionCard
                key={rx.id}
                rx={rx}
                onView={openViewDialog}
                onIssue={handleIssuePrescription}
                onDownload={handleDownloadPDF}
                onWhatsApp={async (rx) => {
                  const phone = (rx as any)?.patientPhone || (rx as any)?.patient?.phone || '';
                  if (!phone) {
                    toast({ title: 'No phone', description: 'Patient phone not on record.', variant: 'destructive' });
                    return;
                  }
                  try {
                    const medications = ((rx as any)?.medicines || (rx as any)?.medications || [])
                      .map((m: any) => m?.name || m?.medicine || '').filter(Boolean);
                    await api.post('/whatsapp-production/send/prescription', {
                      to: phone,
                      patientName: (rx as any)?.patientName || 'Patient',
                      doctorName: (rx as any)?.doctorName || 'Doctor',
                      prescriptionUrl: (rx as any)?.pdfUrl || `${window.location.origin}/prescriptions/${rx.id}`,
                      medications,
                    });
                    toast({ title: '✅ Sent!', description: 'Prescription sent via WhatsApp.' });
                  } catch {
                    toast({ title: 'Failed', description: 'Could not send WhatsApp message.', variant: 'destructive' });
                  }
                }}
              />
            ))}
          </div>
        )}

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
              <Badge variant="outline" className="w-fit">Autosave: {prescriptionAutosave.status}</Badge>
            </DialogHeader>

            <Tabs defaultValue="patient" className="w-full">
              <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 h-auto">
                <TabsTrigger value="patient" className="text-xs sm:text-sm py-1.5 sm:py-2">Patient</TabsTrigger>
                <TabsTrigger value="vitals" className="text-xs sm:text-sm py-1.5 sm:py-2">Vitals</TabsTrigger>
                <TabsTrigger value="ai-scribe" className="text-xs sm:text-sm py-1.5 sm:py-2">🎤 AI Scribe</TabsTrigger>
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

              {/* AI Scribe Tab - Offline Mode */}
              <TabsContent value="ai-scribe" className="space-y-4">
                <OfflineScribePanel
                  compact
                  defaultLanguage="hi"
                  defaultDocumentType="prescription"
                  patientContext={{
                    name: formData.patientName,
                    age: formData.patientAge,
                    gender: formData.patientGender,
                    patient_id: formData.patientId ? String(formData.patientId) : undefined,
                  }}
                  onPrescriptionGenerated={(prescription) => {
                    // Import the generated prescription data into the form
                    setFormData(prev => ({
                      ...prev,
                      chiefComplaints: prescription.chiefComplaints || prev.chiefComplaints,
                      diagnosis: prescription.diagnosis || prev.diagnosis,
                      medications: prescription.medications?.length > 0 
                        ? prescription.medications.map(med => ({
                            name: med.name || '',
                            composition: med.composition || '',
                            dosage: med.dosage || '',
                            frequency: med.frequency || 'BD',
                            duration: med.duration || '7 days',
                            quantity: med.quantity || '',
                            instructions: med.instructions || 'After meals',
                          }))
                        : prev.medications,
                      instructions: prescription.instructions?.length > 0 
                        ? prescription.instructions 
                        : prev.instructions,
                      labTests: prescription.labTests?.length > 0 
                        ? prescription.labTests 
                        : prev.labTests,
                      notes: prescription.notes || prev.notes,
                      vitals: prescription.vitals ? {
                        ...prev.vitals,
                        bloodPressure: prescription.vitals.bp || prev.vitals?.bloodPressure,
                        pulse: prescription.vitals.pulse || prev.vitals?.pulse,
                        temperature: prescription.vitals.temperature || prev.vitals?.temperature,
                        spo2: prescription.vitals.spo2 || prev.vitals?.spo2,
                        weight: prescription.vitals.weight || prev.vitals?.weight,
                      } : prev.vitals,
                    }));
                    
                    toast({
                      title: "✅ Prescription Imported",
                      description: "AI-generated prescription has been imported into the form. Review and edit as needed.",
                    });
                  }}
                />
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
                <Card className="border-dashed"><CardHeader className="pb-3"><CardTitle className="text-base">Pharmacogenomics Check</CardTitle><CardDescription>Decision support only. Uses stored PGx profile data when available.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex flex-col gap-2 md:flex-row"><Input value={pgxMedication} onChange={(e) => setPgxMedication(e.target.value)} placeholder="Medication, e.g. clopidogrel" /><Button type="button" variant="outline" onClick={() => setPgxMedication(formData.medications[0]?.name || '')}>Use first medication</Button><Button type="button" onClick={checkPharmacogenomics} disabled={pgxLoading}>{pgxLoading ? 'Checking...' : 'Check PGx'}</Button></div>{pgxResult && <div className="rounded-md border p-3 text-sm"><div className="flex items-center justify-between gap-2"><span>{pgxResult.matched ? `${pgxResult.gene} profile found` : 'No matching PGx rule/profile'}</span>{pgxResult.matched && <Badge variant={pgxResult.risky ? 'destructive' : 'secondary'}>{pgxResult.risky ? 'Review' : 'No alert'}</Badge>}</div>{pgxResult.phenotype && <p className="mt-2 text-muted-foreground">Phenotype: {pgxResult.phenotype}</p>}{pgxResult.recommendation && <p className="mt-2 text-amber-700">{pgxResult.recommendation}</p>}</div>}</CardContent></Card>

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
                <Card className="p-4 bg-muted/60">
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

            {(issueSafetyBlockers.length > 0 || issueSafetyWarnings.length > 0) && (
              <div className="mt-4">
                <PrescriptionSafetyAlert
                  blockers={issueSafetyBlockers}
                  warnings={issueSafetyWarnings}
                  onOverride={(reason, acknowledgedCodes) =>
                    selectedPrescription && issuePrescriptionMutation.mutate({ id: selectedPrescription.id, override: { reason, acknowledgedCodes } })
                  }
                  overriding={issuePrescriptionMutation.isPending}
                />
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
              {selectedPrescription?.status === "issued" || selectedPrescription?.status === "active" ? (
                <Button
                  variant="outline"
                  onClick={async () => {
                    const rx = selectedPrescription as any;
                    const phone = rx?.patientPhone || rx?.patient?.phone || rx?.patient?.mobile || '';
                    if (!phone) {
                      toast({ title: 'No phone number', description: 'Patient phone number is not on record.', variant: 'destructive' });
                      return;
                    }
                    try {
                      const medications = (rx?.medicines || rx?.medications || []).map(
                        (m: any) => m?.name || m?.medicine || m?.drug || ''
                      ).filter(Boolean);
                      await api.post('/whatsapp-production/send/prescription', {
                        to: phone,
                        patientName: rx?.patientName || rx?.patient?.name || 'Patient',
                        doctorName: rx?.doctorName || 'Doctor',
                        prescriptionUrl: rx?.pdfUrl || `${window.location.origin}/prescriptions/${rx?.id}`,
                        medications,
                        followUpDate: rx?.followUpDate,
                      });
                      toast({ title: '✅ Sent!', description: 'Prescription sent via WhatsApp.' });
                    } catch {
                      toast({ title: 'Failed', description: 'Could not send WhatsApp message.', variant: 'destructive' });
                    }
                  }}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Share via WhatsApp
                </Button>
              ) : null}
              {selectedPrescription?.status === "draft" && (
                <Button
                  onClick={() => handleIssuePrescription(selectedPrescription.id)}
                  className="bg-green-600 hover:bg-green-700"
                  disabled={issuePrescriptionMutation.isPending}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {issuePrescriptionMutation.isPending ? "Issuing..." : "Issue & Notify Patient"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </MainLayout>
  );
};

export default DoctorPrescriptions;
